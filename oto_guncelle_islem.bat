@echo off
chcp 65001 > nul
cd /d "%~dp0"

:: GitHub'daki version.json dosyasını çekip yereldeki ile karşılaştır
powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $remote = (Invoke-RestMethod -Uri 'https://raw.githubusercontent.com/alisanakbass/AYG-B2B/main/version.json').version; $local = (Get-Content -Path 'version.json' | ConvertFrom-Json).version; if ($remote -ne $local) { exit 10 } else { exit 0 } } catch { exit 1 }"

:: Hata kodu 10 ise yeni güncelleme var demektir, güncellemeye başla
if %errorlevel% equ 10 (
    :: PowerShell ile zip indir
    powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/alisanakbass/AYG-B2B/archive/refs/heads/main.zip' -OutFile 'update.zip' } catch { exit 1 }"
    
    if exist update.zip (
        :: Zip dosyasını aç
        powershell -Command "try { Expand-Archive -Path 'update.zip' -DestinationPath 'temp_update' -Force } catch { exit 1 }"
        
        if exist temp_update (
            :: Dosyaları üzerine yaz
            for /d %%i in (temp_update\*) do (
                xcopy "%%i\*" ".\" /s /e /y > nul
            )
            :: Temizlik
            rd /s /q temp_update
            del update.zip
        )
    )
)
