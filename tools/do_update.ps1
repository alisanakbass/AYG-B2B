$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Script'in bulunduğu klasörün bir üstünü (proje kök dizinini) tespit et
$scriptDir = $PSScriptRoot
if ($scriptDir) {
    $rootDir = Split-Path $scriptDir -Parent
} else {
    $rootDir = (Get-Location).Path
}

Write-Host "GitHub'dan guncel paket indiriliyor..." -ForegroundColor Cyan

# 1. TLS 1.2 ayarla ve WebClient ile zip indir
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$zipUrl = "https://github.com/alisanakbass/AYG-B2B/archive/refs/heads/main.zip"
$zipPath = Join-Path $rootDir "update.zip"
$tempDir = Join-Path $rootDir "temp_update"

$wc = New-Object System.Net.WebClient
$wc.Headers.Add('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
$wc.DownloadFile($zipUrl, $zipPath)

if (-not (Test-Path $zipPath) -or (Get-Item $zipPath).Length -lt 100) {
    throw "Guncelleme paketi indirilemedi veya gecersiz (bos) indi."
}

Write-Host "Dosyalar aciliyor ve kopyalaniyor..." -ForegroundColor Yellow

# 2. Eski gecici klasoru temizle ve zip'i ac
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
Expand-Archive -LiteralPath $zipPath -DestinationPath $tempDir -Force

# 3. Iren alt klasori bul (AYG-B2B-main)
$sub = Get-ChildItem -Path $tempDir | Where-Object { $_.PSIsContainer } | Select-Object -First 1
if (-not $sub) {
    throw "Zip arsivi icinden klasor yapisi cikarilamadi."
}

# 4. Tum dosya ve klasorleri kopyala
Get-ChildItem -Path $sub.FullName -Recurse | ForEach-Object {
    $relPath = $_.FullName.Substring($sub.FullName.Length + 1)
    $targetPath = Join-Path $rootDir $relPath

    if ($_.PSIsContainer) {
        if (-not (Test-Path $targetPath)) {
            New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
        }
    } else {
        if ($_.Name -ne 'guncelle.bat') {
            Copy-Item -Path $_.FullName -Destination $targetPath -Force
        }
    }
}

# 5. Temizlik
Remove-Item -Force $zipPath -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue

Write-Host "[OK] Dosyalar basariyla guncellendi!" -ForegroundColor Green
