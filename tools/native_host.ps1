$stdin = [System.Console]::OpenStandardInput()
$stdout = [System.Console]::OpenStandardOutput()

# Stdio üzerinden gelen mesaj uzunluğunu (4 byte uint32) oku
$lenBytes = New-Object byte[] 4
$bytesRead = $stdin.Read($lenBytes, 0, 4)

if ($bytesRead -eq 4) {
    $msgLength = [System.BitConverter]::ToUInt32($lenBytes, 0)
    if ($msgLength -gt 0) {
        $msgBytes = New-Object byte[] $msgLength
        $stdin.Read($msgBytes, 0, $msgLength) | Out-Null
    }

    # Güncelleme işlemi scriptini sessizce çalıştır
    $rootDir = Split-Path $PSScriptRoot -Parent
    $batPath = Join-Path $rootDir "oto_guncelle_islem.bat"

    if (Test-Path $batPath) {
        $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$batPath`"" -Wait -WindowStyle Hidden -PassThru
        $status = "ok"
    } else {
        $status = "error"
    }

    # Chrome'a yanıt döndür
    $response = "{`"status`":`"$status`",`"updated`":true}"
    $respBytes = [System.Text.Encoding]::UTF8.GetBytes($response)
    $respLenBytes = [System.BitConverter]::GetBytes([uint32]$respBytes.Length)

    $stdout.Write($respLenBytes, 0, 4)
    $stdout.Write($respBytes, 0, $respBytes.Length)
    $stdout.Flush()
}
