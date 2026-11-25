$ErrorActionPreference = 'Stop'

$launcherPath = Join-Path $PSScriptRoot 'start-safe-from-favorite.ps1'
if (-not (Test-Path -LiteralPath $launcherPath -PathType Leaf)) {
  throw "Le lanceur SAFE est introuvable : $launcherPath"
}

$powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$command = "`"$powerShell`" -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$launcherPath`""
$protocolPath = 'Software\Classes\safe-erp-local'
$registry = [Microsoft.Win32.Registry]::CurrentUser
$existingKey = $registry.OpenSubKey("$protocolPath\shell\open\command")

if ($existingKey) {
  try {
    $existingCommand = $existingKey.GetValue('')
  } finally {
    $existingKey.Close()
  }
  if ($existingCommand -ne $command) {
    throw 'Le protocole safe-erp-local est deja associe a une autre commande; aucune modification effectuee.'
  }
  Write-Host 'Le favori SAFE est deja configure pour ce projet.'
  return
}

$protocolKey = $registry.CreateSubKey($protocolPath)
try {
  $protocolKey.SetValue('', 'URL: SAFE ERP local launcher', [Microsoft.Win32.RegistryValueKind]::String)
  $protocolKey.SetValue('URL Protocol', '', [Microsoft.Win32.RegistryValueKind]::String)
} finally {
  $protocolKey.Close()
}

$commandKey = $registry.CreateSubKey("$protocolPath\shell\open\command")
try {
  $commandKey.SetValue('', $command, [Microsoft.Win32.RegistryValueKind]::String)
} finally {
  $commandKey.Close()
}

Write-Host 'Le protocole local SAFE est enregistre pour votre compte Windows.'
Write-Host 'Ajoutez ce favori dans la barre du navigateur : safe-erp-local://start'
Write-Host 'Au premier clic, autorisez le navigateur a ouvrir PowerShell pour SAFE.'
