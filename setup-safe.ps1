# setup-safe.ps1 â€“ crÃ©e raccourci bureau et tÃ¢che planifiÃ©e pour dÃ©marrer Safe

$scriptPath = Join-Path $PSScriptRoot 'run-safe.ps1'

# ---------- 1ï¸âƒ£ CrÃ©er le raccourci sur le bureau ----------
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Lancer Safe.lnk'
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = 'powershell.exe'
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"$scriptPath\""
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.WindowStyle = 1
$shortcut.Save()

# ---------- 2ï¸âƒ£ CrÃ©er la tÃ¢che planifiÃ©e (lance au logon) ----------
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File \"$scriptPath\""
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName 'Lancer Safe' -Action $action -Trigger $trigger -Description 'DÃ©marre Safe (backend + frontend) au logon' -Force

Write-Host "Raccourci crÃ©Ã© : $shortcutPath"
Write-Host "TÃ¢che planifiÃ©e 'Lancer Safe' enregistrÃ©e."
