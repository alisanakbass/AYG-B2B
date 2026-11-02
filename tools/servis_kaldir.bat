@echo off
setlocal enabledelayedexpansion

:: Yonetici yetkisi kontrolu
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo =====================================================
    echo HATA: Bu islemi yapmak icin yonetici yetkisi gerekiyor.
    echo Lutfen bu dosyaya SAG TIKLAYIP "Yonetici Olarak Calistir"in.
    echo =====================================================
    pause
    exit /b
)

set "TASK_NAME=B2BEklentiOtomatikGuncelleme"

echo =====================================================
echo    B2B EKLENTISI OTOMATIK GUNCELLEME SERVISI SILINIYOR
echo =====================================================
echo.

:: Gorevi Windows Gorev Zamanlayicidan Sil
schtasks /delete /tn "%TASK_NAME%" /f > nul

if %errorLevel% equ 0 (
    echo =====================================================
    echo    SERVIS BASARIYLA SILINDI VE DURDURULDU!
    echo =====================================================
    echo.
    echo Artik arka planda otomatik guncelleme yapilmayacak.
    echo.
) else (
    echo Servis silinirken bir hata olustu veya servis zaten kurulu degil.
)

pause
