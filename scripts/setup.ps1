param([switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
Set-Location $project
function Require-Tool($name, $wingetId) {
    if (Get-Command $name -ErrorAction SilentlyContinue) { return }
    if (!(Get-Command winget -ErrorAction SilentlyContinue)) { throw "缺少 $name，也找不到 winget。请先安装 $name。" }
    Write-Host "正在安装 $name ..."
    winget install --id $wingetId --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "$name 安装失败。" }
    if (!(Get-Command $name -ErrorAction SilentlyContinue)) { throw "$name 已安装但当前终端尚未找到。请重新打开终端后重跑脚本。" }
}
Require-Tool node 'OpenJS.NodeJS.LTS'
Require-Tool ffmpeg 'Gyan.FFmpeg'
Require-Tool ffprobe 'Gyan.FFmpeg'
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci 失败。' }
npm test
if ($LASTEXITCODE -ne 0) { throw '测试失败。' }
if (!$NoBuild) {
    $env:ELECTRON_CACHE = Join-Path $project '.cache\electron'
    $env:ELECTRON_BUILDER_CACHE = Join-Path $project '.cache\builder'
    npm run build:win
    if ($LASTEXITCODE -ne 0) { throw 'Windows EXE 构建失败。' }
    $artifact = Get-ChildItem -LiteralPath (Join-Path $project 'dist') -Filter '*.exe' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (!$artifact) { throw '构建完成，但没有找到 EXE。' }
    Write-Host "部署完成：$($artifact.FullName)"
}
