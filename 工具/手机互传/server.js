'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const outputRoot = path.join(root, '成品');
const uploadRoot = path.join(root, '素材', '手机传入');
const port = Number(process.env.PHONE_SHARE_PORT || 8765);
const accessCode = crypto.randomBytes(4).toString('hex').toUpperCase();
const webPage = path.join(__dirname, 'index.html');
const linksFile = path.join(__dirname, '手机访问地址.txt');
const allowedExtensions = new Set(['.mp4', '.mov', '.m4v', '.mkv']);
const maxUploadBytes = 20 * 1024 * 1024 * 1024;

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function walk(folder, base, items) {
  if (!fs.existsSync(folder)) return;
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(full, base, items);
    else if (entry.isFile() && allowedExtensions.has(path.extname(entry.name).toLowerCase())) {
      const stat = fs.statSync(full);
      items.push({ id: Buffer.from(path.relative(base, full)).toString('base64url'), name: entry.name,
        folder: path.relative(base, path.dirname(full)), size: stat.size, modified: stat.mtime.toISOString() });
    }
  }
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function authorized(req, url) {
  return req.headers['x-access-code'] === accessCode || url.searchParams.get('code') === accessCode;
}

function resolveVideo(id) {
  let relative;
  try { relative = Buffer.from(id, 'base64url').toString('utf8'); } catch { return null; }
  for (const base of [outputRoot, uploadRoot]) {
    const full = path.resolve(base, relative);
    if (inside(base, full) && fs.existsSync(full) && fs.statSync(full).isFile() && allowedExtensions.has(path.extname(full).toLowerCase())) return full;
  }
  return null;
}

function streamVideo(req, res, file) {
  const size = fs.statSync(file).size;
  const type = path.extname(file).toLowerCase() === '.mov' ? 'video/quicktime' : 'video/mp4';
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return send(res, 416, 'Invalid range', 'text/plain');
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[2] && match[1] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start >= size || end < start) return send(res, 416, 'Invalid range', 'text/plain');
    res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size });
    fs.createReadStream(file).pipe(res);
  }
}

function safeFilename(raw) {
  const leaf = path.basename(decodeURIComponent(raw)).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  if (!leaf || leaf.startsWith('.')) return null;
  return leaf;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/') {
    return fs.readFile(webPage, (error, html) => error ? send(res, 500, 'Page missing', 'text/plain') : send(res, 200, html, 'text/html; charset=utf-8'));
  }
  if (!authorized(req, url)) return send(res, 401, { error: '请输入电脑上显示的访问码。' });

  if (req.method === 'GET' && url.pathname === '/api/videos') {
    const items = [];
    walk(outputRoot, outputRoot, items);
    walk(uploadRoot, uploadRoot, items);
    items.sort((a, b) => b.modified.localeCompare(a.modified));
    return send(res, 200, items);
  }
  if (req.method === 'GET' && url.pathname.startsWith('/video/')) {
    const file = resolveVideo(url.pathname.slice('/video/'.length));
    return file ? streamVideo(req, res, file) : send(res, 404, { error: '找不到该视频。' });
  }
  if (req.method === 'PUT' && url.pathname === '/api/upload') {
    const filename = safeFilename(url.searchParams.get('name') || '');
    if (!filename || !allowedExtensions.has(path.extname(filename).toLowerCase())) return send(res, 400, { error: '文件名无效或格式不支持。' });
    const announced = Number(req.headers['content-length'] || 0);
    if (announced > maxUploadBytes) return send(res, 413, { error: '单个文件上限为20GB。' });
    fs.mkdirSync(uploadRoot, { recursive: true });
    let destination = path.join(uploadRoot, filename);
    const ext = path.extname(filename);
    const stem = path.basename(filename, ext);
    let index = 1;
    while (fs.existsSync(destination)) destination = path.join(uploadRoot, `${stem}_${index++}${ext}`);
    const temp = `${destination}.${crypto.randomBytes(6).toString('hex')}.part`;
    const output = fs.createWriteStream(temp, { flags: 'wx' });
    let received = 0;
    req.on('data', chunk => { received += chunk.length; if (received > maxUploadBytes) req.destroy(new Error('File exceeds 20GB limit')); });
    req.pipe(output);
    output.on('error', error => { fs.rm(temp, { force: true }, () => {}); if (!res.headersSent) send(res, 500, { error: error.message }); });
    output.on('finish', () => {
      if (!req.complete) { fs.rm(temp, { force: true }, () => {}); return; }
      fs.rename(temp, destination, error => error ? send(res, 500, { error: error.message }) : send(res, 201, { name: path.basename(destination), folder: '素材/手机传入' }));
    });
    return;
  }
  send(res, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0', () => {
  const addresses = [];
  for (const [interfaceName, list] of Object.entries(os.networkInterfaces())) for (const item of list || []) {
    const octets = item.address.split('.').map(Number);
    const privateAddress = item.address.startsWith('10.') || item.address.startsWith('192.168.') || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
    if (item.family === 'IPv4' && !item.internal && privateAddress) addresses.push(`${interfaceName}: http://${item.address}:${port}`);
  }
  const details = ['手机和电脑连同一个 Wi-Fi 后，在手机浏览器打开以下地址。', '', ...addresses, '', `访问码：${accessCode}`, '', '上传的视频保存到 素材/手机传入。成品列表递归读取 成品 文件夹。', '关闭这个窗口会停止共享服务。'];
  fs.writeFileSync(linksFile, details.join('\r\n'), 'utf8');
  console.log(details.join('\n'));
  execFile('notepad.exe', [linksFile], () => {});
});

server.on('error', error => { console.error(error.message); process.exitCode = 1; });
