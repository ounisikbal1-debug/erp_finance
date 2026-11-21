$ws = New-Object -ComObject WScript.Shell
$shortcutPath = "$env:USERPROFILE\Desktop\RunFinancialDashboard.lnk"
$shortcut = $ws.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "C:\Program Files\PowerShell\7\pwsh.exe"
# Le script à exécuter – on échappe les guillemets avec le back‑tick (`)
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"C:\Users\USER\AppData\Roaming\safe\CreateFullFinancialDashboard.ps1\""
$shortcut.WorkingDirectory = "C:\Users\USER\AppData\Roaming\safe"
$shortcut.WindowStyle = 1
$shortcut.Save()