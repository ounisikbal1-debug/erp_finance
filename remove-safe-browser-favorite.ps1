$ErrorActionPreference = 'Stop'

$launcherPath = Join-Path $PSScriptRoot 'start-safe-from-favorite.ps1'
$powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$expectedCommand = "`"$powerShell`" -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$launcherPath`""
$protocolPath = 'Software\Classes\safe-erp-local'
$commandKeyPath = "HKCU:\$protocolPath\shell\open\command"

if (-not (Test-Path -LiteralPath $commandKeyPath)) {
  Write-Host 'Aucun protocole SAFE n’est actuellement enregistré.'
  return
}

$commandKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("$protocolPath\shell\open\command")
try {
  $registeredCommand = $commandKey.GetValue('')
} finally {
  $commandKey.Close()
}

if ($registeredCommand -ne $expectedCommand) {
  throw 'L’association du protocole a changé; suppression refusée pour ne pas supprimer une commande tierce.'
}

Remove-Item -LiteralPath "HKCU:\$protocolPath" -Recurse
Write-Host 'L’association SAFE a été supprimée pour votre compte Windows. Le serveur déjà lancé n’a pas été arrêté.'
