# 自动视频拆解与话题剪辑

桌面工具只做三件事：理解视频原声并拆解话题、按内容分类、按模板和转折动效导出短片。默认导出竖屏 1080×1920、60 帧，保留原声，不加背景音乐。

## 使用

安装 Node.js 和 FFmpeg（需要 `ffmpeg` 与 `ffprobe`），执行 `npm ci`、`npm start`。也可以运行 `npm run build:win` 构建 Windows 便携 EXE，或在 Mac 上运行 `npm run build:mac` 构建 DMG/ZIP。

在界面中选择素材和成品目录，输入自己的 OpenAI API Key，点击“分析素材并生成计划”。工具会对有声视频转写并按话题分类，生成标题、内容说明和前三秒钩子建议。检查每条片段的切点、模板和动效后导出。成品按话题建子文件夹，附标题和拆解说明。

内容规划默认使用 OpenAI GPT-5 mini，也可选择 GPT-4o mini、GPT-4.1 mini、GPT-4.1、DeepSeek、Google Gemini，或填写兼容 Chat Completions 的服务地址与模型名。语音转写仍使用 OpenAI，因此选择其它服务时也需要单独填写 OpenAI 转写密钥；内容规划服务填写自己的密钥。界面右上角“设置 · 语言”可以切换中文和英文，语言偏好保存在本机。

动效库位于 `app/effects.js`，目前有开场推近、闪白、短震动、呼吸推拉、轻摆动、转折冲击、高对比、暖色、冷色、黑白、暗角、柔和开场及无动效。模板有清爽口播、观点强调、故事讲述、理性拆解。动效由本地 FFmpeg 渲染，不需另装付费插件。转折点可逐段指定动效，避免全片持续晃动。

参考视频与仿剪手法记在 `风格库/`。video-shotcraft 的镜头卡可作为设计参考；它的 Remotion 效果尚未接入本应用的 FFmpeg 渲染器。复杂镜头后续需要独立的 Remotion 渲染模块。

当前 AI 根据原声理解内容，尚不能可靠识别纯视觉空镜。API Key 仅用于本次分析请求，不写入仓库；调用 API 会产生费用。成片目录的 `剪辑性能日志.json` 会记录每段耗时。

## Agent 部署

向有终端权限的 Agent 提供本仓库地址并要求阅读 `AGENTS.md`；Windows 运行 `scripts/setup.ps1`，macOS 运行 `scripts/setup.sh`。
