@echo off
chcp 65001 > nul
echo ==========================================
echo    B2B EKLENTISI OTOMATIK GUNCELLEME
echo ==========================================
echo.
echo Güncel dosyalar indiriliyor, lütfen bekleyin...
echo.

:: PowerShell ile GitHub'daki zip dosyasını indir
powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/alisanakbass/AYG-B2B/archive/refs/heads/main.zip' -OutFile 'update.zip' } catch { Write-Host 'Dosya indirilirken hata oluştu: ' $_.Exception.Message; exit 1 }"

if not exist update.zip (
    echo.
    echo HATA: Güncelleme paketi indirilemedi! Lütfen internet bağlantınızı ve GitHub repository linkini kontrol edin.
    pause
    exit /b
)

echo Dosyalar açılıyor ve güncelleniyor...

:: PowerShell ile zip dosyasını geçici klasöre aç, içeriği kopyala ve temizle
powershell -Command "try { Expand-Archive -Path 'update.zip' -DestinationPath 'temp_update' -Force } catch { Write-Host 'Zip açılırken hata oluştu: ' $_.Exception.Message; exit 1 }"

if not exist temp_update (
    echo.
    echo HATA: Zip dosyası açılamadı!
    del update.zip
    pause
    exit /b
)

:: Klasörün adını tespit et (Genelde reponame-branchname formatında olur, örn: b2b_karsilastirma-main)
for /d %%i in (temp_update\*) do (
    xcopy "%%i\*" ".\" /s /e /y > nul
)

:: Temizlik
rd /s /q temp_update
del update.zip

echo.
echo ==========================================
echo    GÜNCELLEME BAŞARIYLA TAMAMLANDI!
echo ==========================================
echo.
echo Eklenti dosyaları güncellendi.
echo Lütfen Chrome tarayıcınızda chrome://extensions adresine gidin ve eklentiyi YENİLE tuşuna basarak güncelleyin.
echo.
pause
