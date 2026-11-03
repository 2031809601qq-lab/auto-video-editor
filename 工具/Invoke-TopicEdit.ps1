param(
    [Parameter(Mandatory)][string]$Plan,
    [Parameter(Mandatory)][string]$Sources,
    [Parameter(Mandatory)][string]$Output,
    [string]$Ffmpeg = 'ffmpeg',
    [string]$Ffprobe = 'ffprobe',
    [ValidateRange(144, 4320)][int]$Width = 1080,
    [ValidateRange(256, 7680)][int]$Height = 1920,
    [ValidateRange(1, 120)][int]$Fps = 60,
    [ValidateSet('auto', 'h264_qsv', 'h264_nvenc', 'libx264')][string]$Encoder = 'auto',
    [ValidateRange(0, 51)][int]$Quality = 23,
    [switch]$Overwrite
)

$ErrorActionPreference = 'Stop'

function Get-EncoderArgs {
    param([string]$Name, [int]$Crf)
    switch ($Name) {
        'h264_qsv' { return @('-c:v', $Name, '-preset', 'veryfast', '-global_quality', "$Crf", '-look_ahead', '0') }
        'h264_nvenc' { return @('-c:v', $Name, '-preset', 'p4', '-cq', "$Crf", '-b:v', '0') }
        'libx264' { return @('-c:v', $Name, '-preset', 'veryfast', '-crf', "$Crf") }
    }
}

function Test-Encoder {
    param([string]$Name)
    $null = & $script:FfmpegPath -hide_banner -loglevel error -f lavfi -i 'color=c=black:s=64x64:d=0.1' -frames:v 1 @((Get-EncoderArgs $Name 35)) -f null - 2>$null
    return $LASTEXITCODE -eq 0
}

$ffmpegCommand = Get-Command $Ffmpeg -ErrorAction Stop
$ffprobeCommand = Get-Command $Ffprobe -ErrorAction Stop
$script:FfmpegPath = $ffmpegCommand.Source
$ffprobePath = $ffprobeCommand.Source
$planPath = (Resolve-Path -LiteralPath $Plan).Path
$sourceRoot = (Resolve-Path -LiteralPath $Sources).Path
$outputRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Output)
$overwriteFlag = if ($Overwrite) { '-y' } else { '-n' }

if ($Encoder -eq 'auto') {
    $selectedEncoder = @('h264_qsv', 'h264_nvenc', 'libx264') | Where-Object { Test-Encoder $_ } | Select-Object -First 1
    if (!$selectedEncoder) { throw 'FFmpeg 找不到可用的 H.264 编码器。' }
} elseif (Test-Encoder $Encoder) {
    $selectedEncoder = $Encoder
} else {
    throw "编码器 $Encoder 当前不可用。可尝试 -Encoder auto。"
}

$planData = Get-Content -LiteralPath $planPath -Raw -Encoding utf8 | ConvertFrom-Json
if ($planData -is [array]) {
    $topics = $planData
} elseif ($planData.PSObject.Properties.Name -contains 'topics') {
    $topics = @($planData.topics)
} else {
    throw '计划 JSON 必须是话题数组，或包含 topics 数组。'
}
if (!$topics.Count) { throw '计划中没有话题。' }

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$indexRows = [System.Collections.Generic.List[string]]::new()
$topicNumber = 0

foreach ($topic in $topics) {
    $topicNumber++
    foreach ($required in @('topic', 'title', 'description', 'segments')) {
        if (!$topic.PSObject.Properties.Name.Contains($required) -or !$topic.$required) {
            throw "第 $topicNumber 个话题缺少字段 $required。"
        }
    }

    $safeTopic = $topic.topic -replace '[\\/:*?"<>|]', ''
    $safeTitle = $topic.title -replace '[\\/:*?"<>|]', ''
    $topicFolder = Join-Path $outputRoot (('{0:D2}_' -f $topicNumber) + $safeTopic)
    $videoPath = Join-Path $topicFolder ($safeTitle + '.mp4')
    if ((Test-Path -LiteralPath $videoPath) -and !$Overwrite) {
        throw "目标文件已存在。请更换输出目录或使用 -Overwrite：$videoPath"
    }
    foreach ($segment in $topic.segments) {
        if (!$segment.source -or $null -eq $segment.start -or $null -eq $segment.end) {
            throw ('话题 ' + $topic.topic + ' 的每段必须提供 source、start、end。')
        }
        if ([double]$segment.start -lt 0 -or [double]$segment.end -le [double]$segment.start) {
            throw ('话题 ' + $topic.topic + ' 包含无效时间范围。')
        }
    }

    $tempFolder = Join-Path $outputRoot ('.topic-edit-' + [guid]::NewGuid().ToString('N'))
    $parts = [System.Collections.Generic.List[string]]::new()
    $timeline = [System.Collections.Generic.List[string]]::new()
    $elapsed = 0.0
    try {
        New-Item -ItemType Directory -Path $topicFolder -Force | Out-Null
        New-Item -ItemType Directory -Path $tempFolder | Out-Null
        $segmentNumber = 0
        foreach ($segment in $topic.segments) {
            $sourcePath = Join-Path $sourceRoot $segment.source
            if (!(Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
                throw "找不到素材：$sourcePath"
            }
            $duration = [double]$segment.end - [double]$segment.start
            $sourceInfo = & $ffprobePath -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $sourcePath
            if ($LASTEXITCODE -ne 0 -or [double]$segment.end -gt ([double]$sourceInfo + 0.25)) {
                throw "剪辑时间超出素材长度：$($segment.source)"
            }

            $partPath = Join-Path $tempFolder ('part_{0:D3}.mp4' -f $segmentNumber)
            $filter = "fps=$Fps,scale=$Width`:$Height`:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=$Width`:$Height`:(ow-iw)/2:(oh-ih)/2,setsar=1,format=nv12"
            $arguments = @('-nostdin', '-hide_banner', '-loglevel', 'error', $overwriteFlag, '-ss', "$($segment.start)", '-i', $sourcePath, '-t', "$duration", '-map', '0:v:0', '-map', '0:a:0?', '-vf', $filter) + (Get-EncoderArgs $selectedEncoder $Quality) + @('-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-video_track_timescale', '90000', '-movflags', '+faststart', $partPath)
            & $script:FfmpegPath @arguments
            if ($LASTEXITCODE -ne 0) { throw "FFmpeg 导出失败：$($segment.source)" }

            $startStamp = [timespan]::FromSeconds([double]$segment.start).ToString('hh\:mm\:ss\.fff')
            $endStamp = [timespan]::FromSeconds([double]$segment.end).ToString('hh\:mm\:ss\.fff')
            $timeline.Add("- $($segment.source) $startStamp 至 $endStamp")
            $elapsed += $duration
            $parts.Add($partPath)
            $segmentNumber++
        }

        $concatList = Join-Path $tempFolder 'concat.txt'
            $concatLines = foreach ($part in $parts) { "file '$($part.Replace('\', '/'))'" }
            [IO.File]::WriteAllLines($concatList, $concatLines, [Text.UTF8Encoding]::new($false))
            $arguments = @('-nostdin', '-hide_banner', '-loglevel', 'error', $overwriteFlag, '-f', 'concat', '-safe', '0', '-i', $concatList, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-af', 'aresample=async=1:first_pts=0', '-movflags', '+faststart', $videoPath)
        & $script:FfmpegPath @arguments
        if ($LASTEXITCODE -ne 0) { throw "FFmpeg 合并失败：$videoPath" }

        $description = @(
            $topic.title
            ''
            $topic.description
            ''
            '原素材时间段'
        ) + @($timeline)
        [IO.File]::WriteAllLines((Join-Path $topicFolder ($safeTitle + '.txt')), $description, [Text.UTF8Encoding]::new($true))
        $indexRows.Add("- $($topic.topic) / $($topic.title) / $([timespan]::FromSeconds($elapsed).ToString('mm\:ss')) / $safeTopic/$safeTitle.mp4")
        Write-Host "完成 $($topic.topic) -> $videoPath"
    } finally {
        if (Test-Path -LiteralPath $tempFolder) {
            Remove-Item -LiteralPath $tempFolder -Recurse -Force
        }
    }
}

$index = @('# 剪辑成品索引', '', "编码器：$selectedEncoder。画面输出：${Width}x${Height}，${Fps}fps。", '') + @($indexRows)
[IO.File]::WriteAllLines((Join-Path $outputRoot '成片索引.txt'), $index, [Text.UTF8Encoding]::new($true))
