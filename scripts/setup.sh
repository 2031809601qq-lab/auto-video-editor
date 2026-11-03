#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then echo '此脚本用于 macOS。' >&2; exit 1; fi
if ! command -v brew >/dev/null 2>&1 && { ! command -v node >/dev/null 2>&1 || ! command -v ffmpeg >/dev/null 2>&1; }; then
  echo '缺少 Node.js 或 FFmpeg，且没有 Homebrew。请先安装 Homebrew 后重试。' >&2; exit 1
fi
command -v node >/dev/null 2>&1 || brew install node
command -v ffmpeg >/dev/null 2>&1 || brew install ffmpeg
command -v ffprobe >/dev/null 2>&1 || { echo '找不到 ffprobe。' >&2; exit 1; }
npm ci
npm test
if [[ "${1:-}" != '--no-build' ]]; then
  npm run build:mac
  find dist -maxdepth 1 \( -name '*.dmg' -o -name '*-mac.zip' \) -print
fi
