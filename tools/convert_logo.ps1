Add-Type -AssemblyName System.Drawing
$pngPath = Join-Path $PSScriptRoot "..\logo.png"
$icoPath = Join-Path $PSScriptRoot "..\logo.ico"

if (Test-Path $pngPath) {
    $image = [System.Drawing.Bitmap]::FromFile($pngPath)
    $iconHandle = $image.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($iconHandle)
    $stream = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
    $icon.Save($stream)
    $stream.Close()
    $image.Dispose()
    Write-Host "logo.ico başarıyla oluşturuldu!" -ForegroundColor Green
} else {
    Write-Host "logo.png bulunamadı!" -ForegroundColor Red
}
