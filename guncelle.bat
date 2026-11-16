@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ==========================================
echo    AYG B2B - GUNCELLEME VE SERVIS KURULUMU
echo ==========================================
echo.
echo Guncel dosyalar GitHub'dan indiriliyor, lutfen bekleyin...

curl.exe -L -s -o update.zip "https://github.com/alisanakbass/AYG-B2B/archive/refs/heads/main.zip"

if not exist update.zip (
    echo.
    echo HATA: Guncelleme paketi indirilemedi! Internet baglantinizi kontrol edin.
    echo.
    pause
    exit /b
)

echo Dosyalar aciliyor ve kopyalaniyor...
tar -xf update.zip --strip-components=1 --exclude="*/guncelle.bat" --exclude="guncelle.bat"
del /f /q update.zip >nul 2>&1

if not exist manifest.json (
    echo.
    echo HATA: Guncelleme paketi acilamadi!
    echo.
    pause
    exit /b
)

if exist "%~dp0tools\native_kayit.bat" call "%~dp0tools\native_kayit.bat" > nul 2>&1

echo.
echo ==========================================
echo    GUNCELLEME BASARIYLA TAMAMLANDI!
echo ==========================================
echo.
echo Eklenti dosyalari guncellendi.
echo Chrome tarayicinizda chrome://extensions sayfasindan eklentiyi YENILE yapin.
echo.
echo ------------------------------------------
echo.

set /p choice="Her 15 dakikada bir otomatik guncelleme servisi kurulsun mu? [E/H]: "

if /i "%choice%"=="E" (
    echo.
    echo Servis kurulumu baslatiliyor...
    echo.

    net session >nul 2>&1
    if !errorLevel! neq 0 (
        echo =====================================================
        echo UYARI: Servis kurulumu icin YONETICI YETKISI gerekiyor!
        echo.
        echo Lutfen 'guncelle.bat' dosyasina SAG TIKLAYIP
        echo 'Yonetici Olarak Calistir' secenegiyle acin.
        echo =====================================================
        echo.
        pause
        exit /b
    )

    set "SCRIPT_DIR=%~dp0"
    set "TASK_NAME=B2BEklentiOtomatikGuncelleme"

    schtasks /create /tn "!TASK_NAME!" /tr "wscript.exe \"!SCRIPT_DIR!tools\oto_guncelle.vbs\"" /sc minute /mo 15 /ru "SYSTEM" /f > nul

    if !errorLevel! equ 0 (
        echo =====================================================
        echo    SERVIS BASARIYLA KURULDU VE AKTIF EDILDI!
        echo =====================================================
        echo.
        echo Eklentiniz artik her 15 dakikada bir otomatik guncellenecek.
        echo.
    ) else (
        echo HATA: Servis kurulurken bir sorun olustu.
    )
) else (
    echo.
    echo Servis kurulumu atlandi. Sadece manuel guncelleme yapildi.
    echo.
)

pause
