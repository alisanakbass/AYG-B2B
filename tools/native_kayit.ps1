$toolsDir = $PSScriptRoot
$hostPath = Join-Path $toolsDir "native_host.bat"
$manifestPath = Join-Path $toolsDir "com.ayg.b2b.update.json"

# com.ayg.b2b.update.json manifest dosyasını bu bilgisayardaki mevcut yol ile dinamik oluştur
$manifestObj = [ordered]@{
    name = "com.ayg.b2b.update"
    description = "AYG B2B Auto Update Host"
    path = $hostPath
    type = "stdio"
    allowed_origins = @(
        "chrome-extension://jlckalpblajjdjkkbjgipjbeelclfnhm/"
    )
}

$jsonContent = $manifestObj | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($manifestPath, $jsonContent, [System.Text.Encoding]::UTF8)

# Chrome Registry Kaydını Oluştur (HKCU)
$regPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.ayg.b2b.update"
if (-not (Test-Path $regPath)) {
    New-Item -Path $regPath -Force | Out-Null
}
Set-ItemProperty -Path $regPath -Name "(default)" -Value $manifestPath
Write-Host "[OK] Chrome Native Messaging kaydi basariyla eklendi!"
