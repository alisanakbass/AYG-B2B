Set WinScriptHost = CreateObject("WScript.Shell")
Dim fso, scriptDir
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptPosition)

' Arka planda cmd/bat dosyasını tamamen sessizce (0 parametresiyle) çalıştırır
WinScriptHost.Run Chr(34) & scriptDir & "\oto_guncelle_islem.bat" & Chr(34), 0, True
