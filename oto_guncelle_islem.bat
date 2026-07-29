@echo off
chcp 65001 > nul
cd /d "%~dp0"

:: GitHub'daki version.json dosyasını çekip yereldeki ile karşılaştır
powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $remote = (Invoke-RestMethod -Uri 'https://raw.githubusercontent.com/alisanakbass/AYG-B2B/main/version.json').version; $local = (Get-Content -Path 'version.json' | ConvertFrom-Json).version; if ($remote -ne $local) { exit 10 } else { exit 0 } } catch { exit 1 }"

:: Hata kodu 10 ise yeni güncelleme var demektir, güncellemeye başla
if %errorlevel% equ 10 (
    if exist "%~dp0tools\do_update.ps1" (
        powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\do_update.ps1"
    )
)
