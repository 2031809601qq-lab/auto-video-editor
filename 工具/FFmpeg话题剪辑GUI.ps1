$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$toolRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$editor = Join-Path $toolRoot 'Invoke-TopicEdit.ps1'
$form = New-Object Windows.Forms.Form
$form.Text = 'FFmpeg 话题剪辑'
$form.Size = New-Object Drawing.Size(1120, 760)
$form.StartPosition = 'CenterScreen'
$form.MinimumSize = New-Object Drawing.Size(900, 600)
$form.TopMost = $true
$form.Add_Shown({ $form.Activate() })

function Add-Label($text, $x, $y, $width = 95) {
    $label = New-Object Windows.Forms.Label
    $label.Text = $text
    $label.Location = [Drawing.Point]::new([int]$x, [int]$y)
    $label.Size = [Drawing.Size]::new([int]$width, 25)
    $label.TextAlign = 'MiddleLeft'
    [void]$form.Controls.Add($label)
}

function Add-PathRow($label, $x, $y, $width, $folder, $initial) {
    Add-Label $label $x $y 85
    $box = New-Object Windows.Forms.TextBox
    $box.Location = [Drawing.Point]::new([int]($x + 88), [int]$y)
    $box.Size = [Drawing.Size]::new([int]($width - 175), 25)
    $box.Text = $initial
    [void]$form.Controls.Add($box)
    $button = New-Object Windows.Forms.Button
    $button.Text = '浏览…'
    $button.Location = [Drawing.Point]::new([int]($x + $width - 78), [int]($y - 1))
    $button.Size = [Drawing.Size]::new(75, 27)
    $button.Add_Click({
        if ($folder) {
            $picker = New-Object Windows.Forms.FolderBrowserDialog
            if ($box.Text -and (Test-Path $box.Text)) { $picker.SelectedPath = $box.Text }
            if ($picker.ShowDialog() -eq 'OK') { $box.Text = $picker.SelectedPath }
        } else {
            $picker = New-Object Windows.Forms.OpenFileDialog
            $picker.Filter = 'JSON 文件 (*.json)|*.json|所有文件 (*.*)|*.*'
            if ($box.Text -and (Test-Path $box.Text)) { $picker.FileName = $box.Text }
            if ($picker.ShowDialog() -eq 'OK') { $box.Text = $picker.FileName }
        }
    }.GetNewClosure())
    [void]$form.Controls.Add($button)
    return $box
}

$planBox = Add-PathRow '剪辑计划' 15 15 1070 $false ''
$sourceBox = Add-PathRow '素材目录' 15 48 1070 $true ''
$outputBox = Add-PathRow '成品目录' 15 81 1070 $true ''

$grid = New-Object Windows.Forms.DataGridView
$grid.Location = New-Object Drawing.Point(15, 120)
$grid.Size = New-Object Drawing.Size(1070, 500)
$grid.Anchor = 'Top,Bottom,Left,Right'
$grid.AllowUserToAddRows = $true
$grid.AllowUserToDeleteRows = $true
$grid.AutoSizeColumnsMode = 'Fill'
$grid.SelectionMode = 'CellSelect'
$grid.Columns.Add('Topic', '话题文件夹') | Out-Null
$grid.Columns.Add('Title', '标题') | Out-Null
$grid.Columns.Add('Source', '素材文件名') | Out-Null
$grid.Columns.Add('Start', '入点（秒）') | Out-Null
$grid.Columns.Add('End', '出点（秒）') | Out-Null
$grid.Columns.Add('Description', '文本说明') | Out-Null
$grid.Columns[0].FillWeight = 85
$grid.Columns[1].FillWeight = 105
$grid.Columns[2].FillWeight = 100
$grid.Columns[3].FillWeight = 55
$grid.Columns[4].FillWeight = 55
$grid.Columns[5].FillWeight = 150
$form.Controls.Add($grid)

$loadButton = New-Object Windows.Forms.Button
$loadButton.Text = '载入计划'
$loadButton.Location = New-Object Drawing.Point(15, 632)
$loadButton.Anchor = 'Bottom,Left'
$loadButton.Add_Click({
    try {
        if (!(Test-Path $planBox.Text)) { throw '请先选择剪辑计划 JSON。' }
        $grid.Rows.Clear()
        $data = Get-Content -LiteralPath $planBox.Text -Raw -Encoding utf8 | ConvertFrom-Json
        foreach ($topic in $data.topics) {
            foreach ($segment in $topic.segments) {
                $grid.Rows.Add($topic.topic, $topic.title, $segment.source, $segment.start, $segment.end, $topic.description) | Out-Null
            }
        }
    } catch { [Windows.Forms.MessageBox]::Show($_.Exception.Message, '载入失败', 'OK', 'Error') | Out-Null }
})
$form.Controls.Add($loadButton)

$saveButton = New-Object Windows.Forms.Button
$saveButton.Text = '保存计划'
$saveButton.Location = New-Object Drawing.Point(105, 632)
$saveButton.Anchor = 'Bottom,Left'
$saveButton.Add_Click({
    try {
        if (!$planBox.Text) { throw '请先选择计划 JSON 的保存位置。' }
        $topics = @{}
        foreach ($row in $grid.Rows) {
            if ($row.IsNewRow) { continue }
            $values = @($row.Cells | ForEach-Object { $_.Value })
            if (!($values[0] -or $values[1] -or $values[2])) { continue }
            if (!($values[0] -and $values[1] -and $values[2] -and $values[3] -ne $null -and $values[4] -ne $null -and $values[5])) { throw '每行请填写话题、标题、素材文件名、入点、出点和说明。' }
            $key = [string]$values[0] + '|' + [string]$values[1]
            if (!$topics.ContainsKey($key)) {
                $topics[$key] = [ordered]@{ topic=[string]$values[0]; title=[string]$values[1]; description=[string]$values[5]; segments=[System.Collections.Generic.List[object]]::new() }
            }
            $topics[$key].segments.Add([ordered]@{ source=[string]$values[2]; start=[double]$values[3]; end=[double]$values[4] })
        }
        if (!$topics.Count) { throw '请至少添加一个剪辑片段。' }
        @{ topics=@($topics.Values) } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $planBox.Text -Encoding utf8
        [Windows.Forms.MessageBox]::Show('剪辑计划已保存。', '完成', 'OK', 'Information') | Out-Null
    } catch { [Windows.Forms.MessageBox]::Show($_.Exception.Message, '保存失败', 'OK', 'Error') | Out-Null }
})
$form.Controls.Add($saveButton)

$runButton = New-Object Windows.Forms.Button
$runButton.Text = '开始剪辑'
$runButton.Location = New-Object Drawing.Point(195, 632)
$runButton.Size = New-Object Drawing.Size(110, 30)
$runButton.Anchor = 'Bottom,Left'
$runButton.Add_Click({
    try {
        if (!(Test-Path $planBox.Text)) { throw '请先保存剪辑计划。' }
        if (!(Test-Path $sourceBox.Text -PathType Container)) { throw '请选择有效的素材目录。' }
        if (!$outputBox.Text) { throw '请选择成品输出目录。' }
        $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $editor, '-Plan', $planBox.Text, '-Sources', $sourceBox.Text, '-Output', $outputBox.Text)
        $psi = New-Object Diagnostics.ProcessStartInfo
        $psi.FileName = (Get-Command powershell.exe).Source
        $psi.UseShellExecute = $false
        $psi.Arguments = ($arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
        $process = [Diagnostics.Process]::Start($psi)
        [Windows.Forms.MessageBox]::Show('剪辑任务已启动。完成后成品会出现在所选目录。', 'FFmpeg 话题剪辑', 'OK', 'Information') | Out-Null
    } catch { [Windows.Forms.MessageBox]::Show($_.Exception.Message, '启动失败', 'OK', 'Error') | Out-Null }
})
$form.Controls.Add($runButton)

$help = New-Object Windows.Forms.Label
$help.Text = '每行代表一段原片。相同话题和标题的多行会按表格顺序接成一个视频。时间单位为秒。'
$help.Location = New-Object Drawing.Point(325, 635)
$help.Size = New-Object Drawing.Size(750, 30)
$help.Anchor = 'Bottom,Left,Right'
$form.Controls.Add($help)

[void]$form.ShowDialog()
