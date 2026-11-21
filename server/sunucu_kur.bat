@echo off
cd /d "%~dp0"

echo ==================================================
echo    AYG B2B MOBIL SUNUCU - KONTROL VE BASLATMA
echo ==================================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [EKSIK] Node.js kurulu degil.
    echo Lutfen https://nodejs.org adresinden Node.js LTS kurun.
    echo.
    pause
    exit /b 1
)
echo [TAMAM] Node.js kurulu.

where tailscale >nul 2>&1
if %errorlevel% neq 0 (
    echo [UYARI] Tailscale kurulu degil ^(uzaktan erisim icin: https://tailscale.com^).
) else (
    echo [TAMAM] Tailscale kurulu.
    tailscale serve --bg 3456 >nul 2>&1
)

echo.
echo Otomatik baslatma icin: Win+R -^> shell:startup klasorune
echo baslat.bat veya gizli_baslat.vbs kisayolunu koyabilirsiniz.
echo.
echo Sunucu sistem tepsisinde (sag alt 'A' ikonu) baslatiliyor...
start "" "%~dp0gizli_baslat.vbs"
timeout /t 2 >nul
