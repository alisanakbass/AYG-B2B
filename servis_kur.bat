@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

:: Yonetici yetkisi kontrolu
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo =====================================================
    echo HATA: Bu kurulumu yapmak icin yonetici yetkisi gerekiyor.
    echo Lutfen bu dosyaya SAG TIKLAYIP "Yonetici Olarak Calistir"in.
    echo =====================================================
    pause
    exit /b
)

set "SCRIPT_DIR=%~dp0"
set "TASK_NAME=B2BEklentiOtomatikGuncelleme"

echo =====================================================
echo    B2B EKLENTISI ARKA PLAN SERVIS KURULUMU
echo =====================================================
echo.
echo Bu bilgisayar icin otomatik guncelleme servisi kuruluyor...
echo.

:: Gorev Zamanlayicisina Gorevi Ekle
schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \"%SCRIPT_DIR%oto_guncelle.vbs\"" /sc minute /mo 15 /ru "SYSTEM" /f > nul

if %errorLevel% equ 0 (
    echo =====================================================
    echo    SERVIS BASARIYLA KURULDU!
    echo =====================================================
    echo.
    echo Eklenti artik her 15 dakikada bir otomatik guncellenecek.
    echo.
) else (
    echo Kurulum sirasinda bir hata olustu. Lutfen yonetici olarak calistirdiginizdan emin olun.
)

pause

