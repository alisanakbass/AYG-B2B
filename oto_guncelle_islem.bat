@echo off
chcp 65001 > nul
cd /d "%~dp0"

:: GitHub'daki version.json dosyasını çekip yereldeki ile karşılaştır
powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $remote = (Invoke-RestMethod -Uri 'https://raw.githubusercontent.com/alisanakbass/AYG-B2B/main/version.json').version; $local = (Get-Content -Path 'version.json' | ConvertFrom-Json).version; if ($remote -ne $local) { exit 10 } else { exit 0 } } catch { exit 1 }"

:: Hata kodu 10 ise yeni güncelleme var demektir, güncellemeye başla
if %errorlevel% equ 10 (
    where curl >nul 2>&1
    if !errorlevel! equ 0 (
        curl -s -L "https://github.com/alisanakbass/AYG-B2B/archive/refs/heads/main.zip" -o "update.zip"
    ) else (
        powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $wc = New-Object System.Net.WebClient; $wc.Headers.Add('User-Agent', 'Mozilla/5.0'); $wc.DownloadFile('https://github.com/alisanakbass/AYG-B2B/archive/refs/heads/main.zip', 'update.zip') } catch { exit 1 }"
    )
    
    if exist update.zip (
        for %%I in (update.zip) do set "ZIPSIZE=%%~zI"
        if "!ZIPSIZE!"=="" set "ZIPSIZE=0"
        if !ZIPSIZE! GTR 100 (
            :: Zip dosyasını aç
            powershell -Command "try { Expand-Archive -Path 'update.zip' -DestinationPath 'temp_update' -Force } catch { exit 1 }"
            
            if exist temp_update (
                :: Dosyaları üzerine yaz (Çalışan bat dosyasını atlayarak)
                for /d %%i in (temp_update\*) do (
                    robocopy "%%i" ".\" /e /xf "oto_guncelle_islem.bat" /njh /njs /nc /ns /np > nul
                )
                :: Eski gereksiz kok dosyalarini temizle (Klasör yapısı güncellendiği için)
                del /f /q popup.html popup.js dashboard.html dashboard.js dashboard.css content_token.js content_token_main.js yasar_check.js download_missing_images.js 2>nul

                :: Temizlik
                rd /s /q temp_update
                del update.zip
            )
        ) else (
            del update.zip 2>nul
        )
    )
)
