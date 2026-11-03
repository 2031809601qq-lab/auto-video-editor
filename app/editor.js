const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

function safeName(value) { return String(value || '').replace(/[\\/:*?"<>|]/g, '').trim(); }
function validate(plan, sourceRoot, outputRoot) {
  if (!plan || !Array.isArray(plan.topics) || !plan.topics.length) throw Error('请至少添加一个话题');
  if (!fs.existsSync(sourceRoot)) throw Error('素材目录不存在');
  for (const topic of plan.topics) {
    if (!safeName(topic.topic) || !safeName(topic.title) || !String(topic.description || '').trim()) throw Error('每个话题都需要名称、标题和说明');
    if (!Array.isArray(topic.segments) || !topic.segments.length) throw Error('每个话题至少需要一段素材');
    for (const segment of topic.segments) {
      if (!segment.source || !Number.isFinite(Number(segment.start)) || !Number.isFinite(Number(segment.end)) || Number(segment.start) < 0 || Number(segment.end) <= Number(segment.start)) throw Error('素材切点无效');
      const full = path.resolve(sourceRoot, segment.source);
      if (path.relative(sourceRoot, full).startsWith('..') || !fs.existsSync(full)) throw Error(`找不到素材：${segment.source}`);
    }
  }
  if (!outputRoot) throw Error('请选择成品目录');
}
function run(cmd, args, onLog) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; onLog?.(String(chunk).trim()); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(Error(`${path.basename(cmd)} 失败：${stderr.slice(-1000)}`)));
  });
}
async function render({ plan, sourceRoot, outputRoot, ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', onLog }) {
  sourceRoot = path.resolve(sourceRoot); outputRoot = path.resolve(outputRoot);
  validate(plan, sourceRoot, outputRoot);
  for (const tool of [ffmpeg, ffprobe]) {
    const check = spawnSync(tool, ['-version'], { windowsHide: true });
    if (check.error || check.status !== 0) throw Error(`找不到 ${tool}，请安装 FFmpeg 并加入 PATH`);
  }
  const targets = plan.topics.map((topic, index) => path.join(outputRoot, `${String(index + 1).padStart(2, '0')}_${safeName(topic.topic)}`, `${safeName(topic.title)}.mp4`));
  for (const target of targets) if (fs.existsSync(target)) throw Error(`成片已存在：${target}`);
  fs.mkdirSync(outputRoot, { recursive: true });
  const indexLines = ['# 成片索引', ''];
  const renderMetrics = { createdAt: new Date().toISOString(), output: '1080x1920@60', topics: [] };
  const durationCache = new Map();
  for (let ti = 0; ti < plan.topics.length; ti++) {
    const topic = plan.topics[ti], target = targets[ti], folder = path.dirname(target);
    const temp = fs.mkdtempSync(path.join(outputRoot, '.render-'));
    const parts = [], records = [];
    const topicMetric = { topic: topic.topic, segments: [], concatMs: 0 };
    try {
      for (let si = 0; si < topic.segments.length; si++) {
        const seg = topic.segments[si], input = path.resolve(sourceRoot, seg.source), part = path.join(temp, `part_${si}.mp4`);
        if (!durationCache.has(input)) {
          const probe = spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', input], { encoding: 'utf8', windowsHide: true });
          if (probe.status !== 0) throw Error(`无法读取素材长度：${seg.source}`);
          durationCache.set(input, Number(probe.stdout));
        }
        if (Number(seg.end) > durationCache.get(input) + 0.25) throw Error(`切点超出素材长度：${seg.source}`);
        const duration = Number(seg.end) - Number(seg.start);
        const encodeStart = performance.now();
        await run(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-ss', String(seg.start), '-i', input, '-t', String(duration), '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'fps=60,scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', part], onLog);
        topicMetric.segments.push({ source: seg.source, inputSeconds: duration, encodeMs: Math.round(performance.now() - encodeStart) });
        parts.push(part);
        records.push(`${seg.source}：${seg.start}s–${seg.end}s`);
        onLog?.(`已处理 ${topic.topic} 第 ${si + 1}/${topic.segments.length} 段`);
      }
      const concat = path.join(temp, 'concat.txt');
      fs.writeFileSync(concat, parts.map(p => `file '${p.replace(/'/g, "'\\''").replace(/\\/g, '/')}'`).join('\n'), 'utf8');
      fs.mkdirSync(folder, { recursive: true });
      const concatStart = performance.now();
      await run(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concat, '-c', 'copy', '-movflags', '+faststart', target], onLog);
      topicMetric.concatMs = Math.round(performance.now() - concatStart);
      fs.writeFileSync(path.join(folder, '拆解说明.md'), `# ${topic.title}\n\n${topic.description}\n\n## 素材时间段\n\n${records.map(x => `- ${x}`).join('\n')}\n`, 'utf8');
      fs.writeFileSync(path.join(folder, '标题.txt'), `${topic.title}\n`, 'utf8');
      indexLines.push(`- [${topic.title}](${path.relative(outputRoot, target).replace(/\\/g, '/')})`);
      renderMetrics.topics.push(topicMetric);
      onLog?.(`完成：${target}`);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  }
  fs.writeFileSync(path.join(outputRoot, '成片索引.md'), indexLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(outputRoot, '剪辑性能日志.json'), JSON.stringify(renderMetrics, null, 2), 'utf8');
  return targets;
}
module.exports = { render, validate, safeName };
