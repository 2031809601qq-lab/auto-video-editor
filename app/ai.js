const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { validate } = require('./editor');

function listVideos(root) {
  return fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isFile() && /\.(mp4|mov|m4v|mkv)$/i.test(e.name)).map(e => e.name);
}
function command(bin, args) {
  const result = spawnSync(bin, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw Error(`${path.basename(bin)} 失败：${result.stderr || result.error?.message}`);
  return result.stdout;
}
async function api(url, options, key) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${key}`, ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw Error(`AI 服务错误 ${response.status}：${body.error?.message || JSON.stringify(body)}`);
  return body;
}
async function transcribe(file, duration, key, ffmpeg, onLog) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-video-ai-'));
  const segments = [];
  try {
    for (let start = 0; start < duration; start += 300) {
      const audio = path.join(temp, 'audio.mp3');
      command(ffmpeg, ['-nostdin', '-v', 'error', '-y', '-ss', String(start), '-i', file, '-t', '300', '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', audio]);
      const form = new FormData();
      form.append('model', 'whisper-1');
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'segment');
      form.append('file', new Blob([fs.readFileSync(audio)], { type: 'audio/mpeg' }), 'audio.mp3');
      const result = await api('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', body: form }, key);
      for (const item of result.segments || []) segments.push({ start: Number(item.start) + start, end: Number(item.end) + start, text: item.text.trim() });
      onLog?.(`已转写 ${path.basename(file)} ${Math.min(start + 300, duration).toFixed(0)}/${duration.toFixed(0)} 秒`);
    }
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  return segments;
}
function extractText(response) { return (response.output || []).flatMap(x => x.content || []).filter(x => x.type === 'output_text').map(x => x.text).join(''); }
function normalize(raw, sourceRoot, durations) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!Array.isArray(data.topics)) throw Error('AI 未返回话题列表');
  const topics = data.topics.slice(0, 30).map(t => ({ topic: String(t.topic || '').trim(), title: String(t.title || '').trim(), description: String(t.description || '').trim(), segments: (t.segments || []).map(s => ({ source: String(s.source || ''), start: Number(s.start), end: Number(s.end) })) }));
  for (const t of topics) for (const s of t.segments) if (!Number.isFinite(durations[s.source]) || s.end > durations[s.source] + 0.25) throw Error(`AI 返回了无效切点：${s.source}`);
  const plan = { topics };
  validate(plan, sourceRoot, 'output');
  return plan;
}
async function analyze({ sourceRoot, apiKey, model = 'gpt-4.1-mini', ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', onLog }) {
  if (!apiKey?.trim()) throw Error('请填写 OpenAI API Key');
  if (!fs.existsSync(sourceRoot)) throw Error('素材目录不存在');
  const files = listVideos(sourceRoot);
  if (!files.length) throw Error('素材目录没有视频');
  const durations = {}, transcript = [];
  for (const name of files) {
    const file = path.join(sourceRoot, name);
    const duration = Number(command(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]));
    if (!Number.isFinite(duration)) throw Error(`无法读取视频时长：${name}`);
    durations[name] = duration;
    transcript.push({ source: name, duration, segments: await transcribe(file, duration, apiKey, ffmpeg, onLog) });
  }
  onLog?.('正在按内容生成话题与前三秒钩子…');
  const instructions = '你是中文短视频剪辑师。根据有时间码的转写内容分话题，挑选完整且有吸引力的观点作为每条视频开头钩子，再按因果顺序接解释。排除空白、设备调试、无完整表达、明确表示不要录或不要发布的内容。切点必须来自给定转写时间范围，不得编造来源。每个话题给出 topic、title、description 和 segments 数组，segments 每项含 source、start、end。避免截断一句话。只返回 JSON 对象 {"topics":[...]}。';
  const result = await api('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, instructions, input: JSON.stringify(transcript), text: { format: { type: 'json_object' } } }) }, apiKey);
  const plan = normalize(extractText(result), sourceRoot, durations);
  onLog?.(`生成 ${plan.topics.length} 个话题，请检查切点后导出`);
  return { plan, transcript };
}
module.exports = { analyze, normalize, listVideos };
