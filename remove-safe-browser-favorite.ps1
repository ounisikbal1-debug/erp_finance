$ErrorActionPreference = 'Stop'

$launcherPath = Join-Path $PSScriptRoot 'start-safe-from-favorite.ps1'
$powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$expectedCommand = "`"$powerShell`" -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$launcherPath`""
$protocolPath = 'Software\Classes\safe-erp-local'
$commandKeyPath = "HKCU:\$protocolPath\shell\open\command"

if (-not (Test-Path -LiteralPath $commandKeyPath)) {
  Write-Host 'Aucun protocole SAFE nâ€™est actuellement enregistrÃ©.'
  return
}

$commandKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("$protocolPath\shell\open\command")
try {
  $registeredCommand = $commandKey.GetValue('')
} finally {
  $commandKey.Close()
}

if ($registeredCommand -ne $expectedCommand) {
  throw 'Lâ€™association du protocole a changÃ©; suppression refusÃ©e pour ne pas supprimer une commande tierce.'
}

Remove-Item -LiteralPath "HKCU:\$protocolPath" -Recurse
Write-Host 'Lâ€™association SAFE a Ã©tÃ© supprimÃ©e pour votre compte Windows. Le serveur dÃ©jÃ  lancÃ© nâ€™a pas Ã©tÃ© arrÃªtÃ©.'
