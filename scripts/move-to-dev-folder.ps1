# 看護アセスメント支援システムを OneDrive の外（既定は C:\dev\socode）へまるごとコピーするスクリプト
# （改善提案3：置き場所を1か所にして、OneDrive の同期で古いファイルに戻るのを防ぐ）。
#
# 使い方：socode フォルダで PowerShell を開き、次を実行します。
#   powershell -ExecutionPolicy Bypass -File scripts\move-to-dev-folder.ps1
# 別の場所にしたいとき：
#   powershell -ExecutionPolicy Bypass -File scripts\move-to-dev-folder.ps1 -Destination D:\work\socode
#
# コピーするだけで、元のフォルダは消しません（動作を確かめてから、ご自身で片付けてください）。
param([string]$Destination = "C:\dev\socode")
$ErrorActionPreference = "Stop"
$Source = Split-Path -Parent $PSScriptRoot

Write-Host "コピー元: $Source"
Write-Host "コピー先: $Destination"

if (-not (Test-Path (Join-Path $Source "js\01-henderson-keywords.js"))) {
  Write-Host "コピー元が看護アセスメント支援システムのフォルダではありません（js\01-henderson-keywords.js が見つかりません）。" -ForegroundColor Red
  exit 1
}
if (Test-Path $Destination) {
  Write-Host "コピー先のフォルダが既にあります。中身を確かめるか、-Destination で別の場所を指定してください。" -ForegroundColor Red
  exit 1
}

New-Item -ItemType Directory -Path $Destination -Force | Out-Null
# /E：空のフォルダも含めてすべて（.git・.env・data・node_modules も含む）
robocopy $Source $Destination /E /COPY:DAT /R:2 /W:2 /NFL /NDL /NP /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) {
  Write-Host "コピーに失敗しました（robocopy の終了コード $LASTEXITCODE）。" -ForegroundColor Red
  exit 1
}

# 主なファイルが同じ大きさでコピーされたかを確かめる
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
  Write-Host ("コピーが一致しないファイルがあります: " + ($bad -join ", ")) -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "コピーが終わりました。" -ForegroundColor Green
Write-Host "次の手順："
Write-Host "  1. cd $Destination"
Write-Host "  2. npm.cmd start  （動くことを確かめる。画面のいちばん下の「版」も確認）"
Write-Host "  3. GitHub Desktop を使っている場合は「File → Add local repository」で $Destination を追加"
Write-Host "  4. 以後は $Destination だけを使う（OneDrive 側の socode・新しいフォルダーは、確認のうえ片付ける）"
