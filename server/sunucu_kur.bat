@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"
set "SERVER_DIR=%~dp0"
if "%SERVER_DIR:~-1%"=="\" set "SERVER_DIR=%SERVER_DIR:~0,-1%"

echo ==================================================
echo    AYG B2B MOBIL SUNUCU - OTOMATIK KURULUM
echo ==================================================
echo.

:: 1. Node.js kontrolu ve kurulumu
where node >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "PATH=%ProgramFiles%\nodejs;%PATH%"
    )
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [1/4] Node.js bulunamadi, winget ile kuruluyor...
    where winget >nul 2>&1
    if %errorlevel% neq 0 (
        echo HATA: winget bulunamadi. Lutfen https://nodejs.org adresinden Node.js LTS kurun.
        pause
        exit /b 1
    )
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "PATH=%ProgramFiles%\nodejs;%PATH%"
    )
    where node >nul 2>&1
    if %errorlevel% neq 0 (
        echo UYARI: Node.js kuruldu ancak mevcut oturumda algilanamadi.
        echo Lutfen bu pencereyi kapatip sunucu_kur.bat dosyasini tekrar calistirin.
        pause
        exit /b 1
    )
    echo Node.js kuruldu.
) else (
    echo [1/4] Node.js zaten kurulu.
)
echo.

:: 2. Tailscale kontrolu ve kurulumu
where tailscale >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%ProgramFiles%\Tailscale\tailscale.exe" (
        set "PATH=%ProgramFiles%\Tailscale;%PATH%"
    )
)

where tailscale >nul 2>&1
if %errorlevel% neq 0 (
    echo [2/4] Tailscale bulunamadi, winget ile kuruluyor...
    where winget >nul 2>&1
    if %errorlevel% equ 0 (
        winget install -e --id Tailscale.Tailscale --accept-package-agreements --accept-source-agreements
        if exist "%ProgramFiles%\Tailscale\tailscale.exe" (
            set "PATH=%ProgramFiles%\Tailscale;%PATH%"
        )
    ) else (
        echo UYARI: winget bulunamadi. Tailscale'i https://tailscale.com/download/windows adresinden kurun.
    )
) else (
    echo [2/4] Tailscale zaten kurulu.
)
echo.

:: 3. Windows Baslangic (Startup) kisayolu olusturma
echo [3/4] Windows Baslangic kisayolu ayarlaniyor...
powershell -NoProfile -Command "$startup = [Environment]::GetFolderPath('Startup'); $lnkPath = Join-Path $startup 'AYG_Mobil_Sunucu.lnk'; $ws = New-Object -ComObject WScript.Shell; $lnk = $ws.CreateShortcut($lnkPath); $lnk.TargetPath = '%SERVER_DIR%\gizli_baslat.vbs'; $lnk.WorkingDirectory = '%SERVER_DIR%'; $lnk.WindowStyle = 1; $lnk.Save()"
if %errorlevel% equ 0 (
    echo Baslangic kisayolu olusturuldu.
) else (
    echo UYARI: Baslangic kisayolu olusturulamadi.
)
echo.

:: 4. Sunucuyu arka planda (sistem tepsisinde) baslatma
echo [4/4] AYG Mobil Sunucu sistem tepsisinde baslatiliyor...
wscript.exe "%SERVER_DIR%\gizli_baslat.vbs"
echo.

:: 5. Tailscale Serve ayari
where tailscale >nul 2>&1
if %errorlevel% equ 0 (
    tailscale status >nul 2>&1
    if !errorlevel! equ 0 (
        echo Tailscale bagli. Port 3456 HTTPS yayini ayarlaniyor...
        tailscale serve --bg 3456
        echo.
        tailscale serve status
    ) else (
        echo ==================================================
        echo ONEMLI SON ADIM:
        echo Sag alt kosedeki Tailscale simgesinden Google hesabinizla
        echo giris yapin, ardindan sunucu_kur.bat dosyasini bir kez
        echo daha calistirin ^(veya 'tailscale serve --bg 3456' yazin^).
        echo ==================================================
    )
)

echo.
echo ==================================================
echo    KURULUM TAMAMLANDI!
echo    Sunucu arka planda calisiyor (Port 3456).
echo    Sag alttaki gizli simgelerde mavi 'A' ikonunu gorebilirsiniz.
echo ==================================================
echo.
pause
