@echo off
chcp 65001 > nul
echo ==========================================
echo    B2B EKLENTISI OTOMATIK GUNCELLEME
echo ==========================================
echo.
echo Guncel dosyalar indiriliyor, lutfen bekleyin...
echo.

:: PowerShell ile GitHub'daki zip dosyasını indir
powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/alisanakbass/AYG-B2B/archive/refs/heads/main.zip' -OutFile 'update.zip' } catch { Write-Host 'Dosya indirilirken hata olustu: ' $_.Exception.Message; exit 1 }"

if not exist update.zip (
    echo.
    echo HATA: Guncelleme paketi indirilemedi! Lutfen internet baglantinizi ve GitHub repository linkini kontrol edin.
    pause
    exit /b
)

echo Dosyalar aciliyor ve guncelleniyor...

:: PowerShell ile zip dosyasını geçici klasöre aç, içeriği kopyala ve temizle
powershell -Command "try { Expand-Archive -Path 'update.zip' -DestinationPath 'temp_update' -Force } catch { Write-Host 'Zip acilirken hata olustu: ' $_.Exception.Message; exit 1 }"

if not exist temp_update (
    echo.
    echo HATA: Zip dosyasi acilamadi!
    del update.zip
    pause
    exit /b
)

:: Klasorun adini tespit et (Genelde reponame-branchname formatinda olur, orn: b2b_karsilastirma-main)
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
echo Lutfen Chrome tarayicinizda chrome://extensions adresine gidin ve eklentiyi YENILE tusuna basarak guncelleyin.
echo.
pause

