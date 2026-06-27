@echo off
title Firat Boru Excel Guncelleyici
echo ==========================================
echo    FIRAT BORU EXCEL VERITABANI GUNCELLEME
echo ==========================================
echo.
echo Gecici klasorler temizleniyor...
if exist temp_xlsx rmdir /s /q temp_xlsx
if exist temp_excel.zip del temp_excel.zip

echo.
echo Excel dosyasi aciliyor (Unzipping)...
copy firatboru_fiyat_listesi.xlsx temp_excel.zip > nul
powershell -Command "Expand-Archive -Path temp_excel.zip -DestinationPath temp_xlsx -Force"
del temp_excel.zip

echo.
echo Veritabani ve urun gorselleri olusturuluyor...
node parse_excel.js

echo.
echo Gecici klasorler temizleniyor...
if exist temp_xlsx rmdir /s /q temp_xlsx

echo.
echo Islem tamamlandi.
pause
