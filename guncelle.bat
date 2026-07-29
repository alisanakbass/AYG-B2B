@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ==========================================
echo    AYG B2B - OTO GUNCELLEME VE SERVIS KUR
echo ==========================================
echo.

if exist "%~dp0tools\do_update.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\do_update.ps1"
) else (
    echo Guncel dosyalar GitHub'dan indiriliyor, lutfen bekleyin...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $wc = New-Object System.Net.WebClient; $wc.Headers.Add('User-Agent', 'Mozilla/5.0'); $wc.DownloadFile('https://github.com/alisanakbass/AYG-B2B/archive/refs/heads/main.zip', 'update.zip'); Expand-Archive -Path 'update.zip' -DestinationPath 'temp_update' -Force; $sub = Get-ChildItem 'temp_update' | Where-Object { $_.PSIsContainer } | Select-Object -First 1; Get-ChildItem -Path $sub.FullName -Recurse | ForEach-Object { $rel = $_.FullName.Substring($sub.FullName.Length + 1); $dest = Join-Path (Get-Location).Path $rel; if ($_.PSIsContainer) { if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null } } else { Copy-Item -Path $_.FullName -Destination $dest -Force } }; Remove-Item -Force 'update.zip' -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force 'temp_update' -ErrorAction SilentlyContinue"
)

if not exist manifest.json (
    echo.
    echo ❌ HATA: Guncelleme paketi indirilemedi veya dosyalar acilamadi!
    echo Lutfen internet baglantinizi ve GitHub baglantinizi kontrol edin.
    echo.
    pause
    exit /b
)

:: Native Messaging Registry Kaydını Güncelle
if exist "%~dp0tools\native_kayit.bat" call "%~dp0tools\native_kayit.bat" > nul 2>&1

echo.
echo ==========================================
echo    GUNCELLEME BASARIYLA TAMAMLANDI!
echo ==========================================
echo.
echo Eklenti dosyalari guncellendi.
echo Lutfen Chrome tarayicinizda chrome://extensions adresine gidip eklentiyi YENILE (Refresh) yapin.
echo.
echo ------------------------------------------
echo.

:: SERVIS KURULUM AŞAMASI
set /p choice="Her 15 dakikada bir otomatik guncelleme yapacak Windows Servisini kurmak ister misiniz? [E/H]: "

if /i "%choice%"=="E" (
    echo.
    echo Servis kurulumu baslatiliyor...
    echo.

    :: Yonetici yetkisi kontrolu
    net session >nul 2>&1
    if !errorLevel! neq 0 (
        echo =====================================================
        echo ⚠️ UYARI: Servis kurulumu icin YONETICI YETKISI gerekiyor!
        echo.
        echo Lutfen bu 'guncelle.bat' dosyasina SAG TIKLAYIP 
        echo 'Yonetici Olarak Calistir' secenegiyle acin ve tekrar deneyin.
        echo =====================================================
        echo.
        pause
        exit /b
    )

    set "SCRIPT_DIR=%~dp0"
    set "TASK_NAME=B2BEklentiOtomatikGuncelleme"

    :: Gorev Zamanlayicisina Gorevi Ekle (Gorev penceresiz calisan oto_guncelle.vbs'yi tetikler)
    schtasks /create /tn "!TASK_NAME!" /tr "wscript.exe \"!SCRIPT_DIR!oto_guncelle.vbs\"" /sc minute /mo 15 /ru "SYSTEM" /f > nul

    if !errorLevel! equ 0 (
        echo =====================================================
        echo    🎉 SERVIS BASARIYLA KURULDU VE AKTIF EDILDI!
        echo =====================================================
        echo.
        echo Eklentiniz artik her 15 dakikada bir arka planda sessizce guncellenecek.
        echo.
    ) else (
        echo ❌ Servis kurulurken bir hata olustu. Yetkilerinizi kontrol edin.
    )
) else (
    echo.
    echo Servis kurulumu atlandi. Sadece manuel guncelleme yapildi.
    echo.
)

pause
