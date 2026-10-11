# Copy the entire checkout outside OneDrive; never delete the source.
# Includes .git, .env, data and node_modules. Verify before removing an old copy.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\move-to-dev-folder.ps1 [-Destination PATH]
param([string]$Destination = "C:\dev\socode")
$ErrorActionPreference = "Stop"
$Source = Split-Path -Parent $PSScriptRoot

Write-Host "Source: $Source"
Write-Host "Destination: $Destination"

if (-not (Test-Path (Join-Path $Source "js\01-henderson-keywords.js"))) {
  Write-Host "Invalid checkout: js\01-henderson-keywords.js is missing." -ForegroundColor Red
  exit 1
}
if (Test-Path $Destination) {
  Write-Host "Destination exists; inspect it or choose another -Destination." -ForegroundColor Red
  exit 1
}

New-Item -ItemType Directory -Path $Destination -Force | Out-Null
robocopy $Source $Destination /E /COPY:DAT /R:2 /W:2 /NFL /NDL /NP /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) {
  Write-Host "Copy failed; robocopy exit $LASTEXITCODE." -ForegroundColor Red
  exit 1
}

$files = @("index.html", "style.css", "server.js", "package.json", ".env", "vendor\tailwind.css") +
  (Get-ChildItem (Join-Path $Source "js") -Filter *.js | ForEach-Object { "js\" + $_.Name })
$bad = @()
foreach ($f in $files) {
  $a = Join-Path $Source $f
  $b = Join-Path $Destination $f
  if (Test-Path $a) {
    if (-not (Test-Path $b) -or (Get-Item $a -Force).Length -ne (Get-Item $b -Force).Length) { $bad += $f }
  }
}
if ($bad.Count -gt 0) {
  Write-Host ("Copy verification failed: " + ($bad -join ", ")) -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Copy complete." -ForegroundColor Green
Write-Host "Next:"
Write-Host "  1. cd $Destination"
Write-Host "  2. npm.cmd start  (verify startup and footer version)"
Write-Host "  3. GitHub Desktop: File -> Add local repository -> $Destination"
Write-Host "  4. Use only $Destination; verify before removing old copies."
