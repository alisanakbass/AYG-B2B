@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo    AYG B2B - OTO GUNCELLEME VE SERVIS KUR
echo ==========================================
echo.
echo Guncel dosyalar GitHub'dan indiriliyor, lutfen bekleyin...
echo.

:: PowerShell ile GitHub'daki zip dosyasını indir
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/alisanakbass/AYG-B2B/archive/refs/heads/main.zip' -OutFile 'update.zip'"

if not exist update.zip (
    echo.
    echo ❌ HATA: Guncelleme paketi indirilemedi! 
    echo Lutfen internet baglantinizi ve GitHub baglantinizi kontrol edin.
    echo.
    pause
    exit /b
)

echo Dosyalar aciliyor ve guncelleniyor...

:: PowerShell ile zip dosyasını geçici klasöre aç
powershell -Command "Expand-Archive -Path 'update.zip' -DestinationPath 'temp_update' -Force"

if not exist temp_update (
    echo.
    echo ❌ HATA: Zip dosyasi acilamadi!
    del update.zip
    pause
    exit /b
)

:: Klasorun adini tespit et ve kopyala
for /d %%i in (temp_update\*) do (
    xcopy "%%i\*" ".\" /s /e /y > nul
)

:: Temizlik
rd /s /q temp_update
del update.zip

echo.
echo ==========================================
echo    GUNCELLEME BASARIYLA TAMAMLANDI!
echo ==========================================
echo.
echo Eklenti dosyalari guncellendi.
echo Lutfen Chrome tarayicinizda chrome://extensions adresine gidip eklentiyi YENILE (Refres) yapin.
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
