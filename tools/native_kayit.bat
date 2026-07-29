@echo off
chcp 65001 > nul

set "MANIFEST_PATH=%~dp0com.ayg.b2b.update.json"

reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.ayg.b2b.update" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f > nul

if %errorLevel% equ 0 (
    echo [OK] Chrome Native Messaging kaydi basariyla eklendi!
) else (
    echo [HATA] Kayit defteri guncellenirken bir hata olustu.
)
