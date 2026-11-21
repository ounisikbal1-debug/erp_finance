# setup-safe.ps1 – crée raccourci bureau et tâche planifiée pour démarrer Safe

$scriptPath = Join-Path $PSScriptRoot 'run-safe.ps1'

# ---------- 1️⃣ Créer le raccourci sur le bureau ----------
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Lancer Safe.lnk'
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = 'powershell.exe'
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"$scriptPath\""
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.WindowStyle = 1
$shortcut.Save()

# ---------- 2️⃣ Créer la tâche planifiée (lance au logon) ----------
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File \"$scriptPath\""
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName 'Lancer Safe' -Action $action -Trigger $trigger -Description 'Démarre Safe (backend + frontend) au logon' -Force

Write-Host "Raccourci créé : $shortcutPath"
Write-Host "Tâche planifiée 'Lancer Safe' enregistrée."
