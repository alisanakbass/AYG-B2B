@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

:: Yönetici yetkisi kontrolü
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo =====================================================
    echo HATA: Bu kurulumu yapmak için yönetici yetkisi gerekiyor.
    echo Lütfen bu dosyaya SAĞ TIKLAYIP "Yönetici Olarak Çalıştır"ın.
    echo =====================================================
    pause
    exit /b
)

set "SCRIPT_DIR=%~dp0"
set "TASK_NAME=B2BEklentiOtomatikGuncelleme"

echo =====================================================
    echo B2B EKLENTİSİ ARKA PLAN SERVİS KURULUMU
echo =====================================================
echo.
echo Bu bilgisayar için otomatik güncelleme servisi kuruluyor...
echo.

:: Görev Zamanlayıcısına Görevi Ekle
schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \"%SCRIPT_DIR%oto_guncelle.vbs\"" /sc minute /mo 15 /ru "SYSTEM" /f > nul

if %errorLevel% equ 0 (
    echo =====================================================
    echo SERVİS BAŞARIYLA KURULDU!
    echo =====================================================
    echo.
    echo Eklenti artık her 15 dakikada bir otomatik güncellenecek.
    echo.
) else (
    echo Kurulum sırasında bir hata oluştu. Lütfen yönetici olarak çalıştırdığınızdan emin olun.
)

pause
