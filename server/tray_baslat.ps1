Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\AYG_Mobil_Sunucu_Tray", [ref]$createdNew)
if (-not $createdNew) {
    exit 0
}

$serverDir = $PSScriptRoot
$script:nodeProc = $null

function Start-AygServer {
    if ($script:nodeProc -and -not $script:nodeProc.HasExited) {
        return
    }
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "node.exe"
    $psi.Arguments = "server.js"
    $psi.WorkingDirectory = $serverDir
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $script:nodeProc = [System.Diagnostics.Process]::Start($psi)
}

function Stop-AygServer {
    if ($script:nodeProc -and -not $script:nodeProc.HasExited) {
        try {
            $script:nodeProc.Kill()
            $script:nodeProc.WaitForExit(3000) | Out-Null
        } catch {}
    }
    $script:nodeProc = $null
}

function New-AygTrayIcon {
    $bmp = New-Object System.Drawing.Bitmap(32, 32)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 37, 99, 235))
    $g.FillEllipse($bgBrush, 1, 1, 30, 30)
    $font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, 0, 32, 32)
    $g.DrawString("A", $font, [System.Drawing.Brushes]::White, $rect, $sf)
    $g.Dispose()
    $bgBrush.Dispose()
    $font.Dispose()
    $sf.Dispose()
    return [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
}

Start-AygServer

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = New-AygTrayIcon
$notifyIcon.Text = "AYG Mobil Sunucu (Port 3456)"
$notifyIcon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$statusItem = New-Object System.Windows.Forms.ToolStripMenuItem("AYG Sunucu: Calisiyor (3456)")
$statusItem.Enabled = $false

$openItem = New-Object System.Windows.Forms.ToolStripMenuItem("Tarayicida Ac (localhost:3456)")
$openItem.Add_Click({
    Start-Process "http://localhost:3456"
})

$restartItem = New-Object System.Windows.Forms.ToolStripMenuItem("Yeniden Baslat")
$restartItem.Add_Click({
    Stop-AygServer
    Start-AygServer
    $statusItem.Text = "AYG Sunucu: Calisiyor (3456)"
})

$exitItem = New-Object System.Windows.Forms.ToolStripMenuItem("Sunucuyu Durdur ve Cik")
$exitItem.Add_Click({
    Stop-AygServer
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

$menu.Items.Add($statusItem) | Out-Null
$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
$menu.Items.Add($openItem) | Out-Null
$menu.Items.Add($restartItem) | Out-Null
$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
$menu.Items.Add($exitItem) | Out-Null

$notifyIcon.ContextMenuStrip = $menu
$notifyIcon.Add_DoubleClick({
    Start-Process "http://localhost:3456"
})

[System.Windows.Forms.Application]::Run()
Stop-AygServer
$mutex.ReleaseMutex()
$mutex.Dispose()
