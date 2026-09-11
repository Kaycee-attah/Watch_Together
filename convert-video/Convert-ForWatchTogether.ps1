<#
  Watch Together - video converter
  ---------------------------------
  Converts any video file into H.264 video + stereo AAC audio in an MP4
  container, which every modern browser plays natively. Use this on a
  file that plays audio but shows no picture in Watch Together (or
  won't load at all) - that's almost always an unsupported video codec
  (HEVC/x265 is the most common culprit).

  Usage:
    - Drag one or more video files onto "Convert Video.bat", or
    - Double-click "Convert Video.bat" and pick a file from the dialog, or
    - Run directly: powershell -File Convert-ForWatchTogether.ps1 "C:\path\movie.mkv"

  The first run downloads a small, one-time copy of ffmpeg (~110MB,
  cached in a "tools" folder next to this script) since converting
  video needs a real video toolkit, not something PowerShell can do on
  its own. Every run after that is instant.
#>

param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Files
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ToolsDir = Join-Path $ScriptDir 'tools'
$FfmpegExe = Join-Path $ToolsDir 'ffmpeg.exe'

function Ensure-Ffmpeg {
    if (Test-Path $FfmpegExe) { return $FfmpegExe }

    $existing = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($existing) { return $existing.Source }

    Write-Host "ffmpeg not found - downloading a one-time copy (about 110MB)..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null
    $zipPath = Join-Path $ToolsDir 'ffmpeg.zip'
    $extractDir = Join-Path $ToolsDir 'extracted'

    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile $zipPath -UseBasicParsing

    Write-Host "Extracting..." -ForegroundColor Yellow
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
    $foundExe = Get-ChildItem -Path $extractDir -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1
    if (-not $foundExe) { throw 'Could not find ffmpeg.exe inside the downloaded archive.' }
    Copy-Item $foundExe.FullName $FfmpegExe -Force

    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "ffmpeg ready.`n" -ForegroundColor Green
    return $FfmpegExe
}

function Convert-OneFile {
    param([string]$InputPath, [string]$Ffmpeg)

    $InputPath = $InputPath.Trim('"')
    if (-not (Test-Path -LiteralPath $InputPath)) {
        Write-Host "Skipping - file not found: $InputPath" -ForegroundColor Red
        return
    }

    $dir = Split-Path -Parent $InputPath
    $name = [System.IO.Path]::GetFileNameWithoutExtension($InputPath)
    $outPath = Join-Path $dir ($name + ' [watch-together].mp4')

    if (Test-Path -LiteralPath $outPath) {
        Write-Host "Already converted: $outPath" -ForegroundColor Cyan
        return $outPath
    }

    Write-Host ("`nConverting: {0}" -f (Split-Path -Leaf $InputPath)) -ForegroundColor Yellow
    Write-Host ("  -> {0}" -f (Split-Path -Leaf $outPath))

    # -map picks the first video and (if present) first audio stream, ignoring
    # subtitle/other tracks. -pix_fmt yuv420p matters especially for 10-bit
    # HEVC sources, whose native pixel format many players still can't show.
    # -ac 2 downmixes any 5.1/7.1 track to plain stereo for max compatibility.
    & $Ffmpeg -y -hide_banner -loglevel error -stats `
        -i $InputPath `
        -map 0:v:0 -map '0:a:0?' `
        -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p `
        -c:a aac -ac 2 -b:a 192k `
        -movflags +faststart `
        $outPath

    if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $outPath)) {
        Write-Host ("Done: {0}" -f $outPath) -ForegroundColor Green
        return $outPath
    } else {
        Write-Host ("ffmpeg failed on this file (exit code {0})." -f $LASTEXITCODE) -ForegroundColor Red
        Remove-Item -LiteralPath $outPath -Force -ErrorAction SilentlyContinue
        return $null
    }
}

Write-Host 'Watch Together - video converter' -ForegroundColor Cyan

if (-not $Files -or $Files.Count -eq 0) {
    # No file dragged onto the .bat - pop up a normal Windows "Open" dialog
    # instead of asking for a typed path, so this never needs a console.
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = 'Choose a video to convert for Watch Together'
    $dialog.Filter = 'Video files|*.mkv;*.mp4;*.avi;*.mov;*.webm;*.wmv;*.flv;*.m4v;*.ts|All files|*.*'
    $dialog.Multiselect = $true
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $Files = $dialog.FileNames
    } else {
        Write-Host 'No file selected - exiting.'
        exit
    }
}

$ffmpegPath = Ensure-Ffmpeg
$converted = @()
foreach ($f in $Files) {
    $result = Convert-OneFile -InputPath $f -Ffmpeg $ffmpegPath
    if ($result) { $converted += $result }
}

if ($converted.Count -gt 0) {
    Write-Host "`nAll done - load the converted file(s) into Watch Together." -ForegroundColor Green
    Add-Type -AssemblyName System.Windows.Forms
    $msg = "Converted $($converted.Count) file(s). Load them into Watch Together the same way as any other movie."
    [System.Windows.Forms.MessageBox]::Show($msg, 'Watch Together - conversion complete', 'OK', 'Information') | Out-Null
    Start-Process explorer.exe ('/select,"{0}"' -f $converted[-1])
} else {
    Write-Host "`nNothing was converted." -ForegroundColor Yellow
    Read-Host 'Press Enter to close'
}
