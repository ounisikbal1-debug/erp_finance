param(
  [switch]$NoBrowser
)

## run-safe.ps1 – automatisation du démarrage local de SAFE ERP
Set-Location -Path "$PSScriptRoot"

# This launcher is only for local development; .env may contain production settings.
$env:NODE_ENV = 'development'
if (-not $env:SAFE_ERP_DATABASE_PROVIDER) {
  $env:SAFE_ERP_DATABASE_PROVIDER = 'sqlite'
}
if (-not $env:SAFE_ERP_DATABASE_URL) {
  $env:SAFE_ERP_DATABASE_URL = 'file:../data.db'
}
if (-not $env:PORT) {
  $env:PORT = '3000'
}
if (-not $env:API_HOST) {
  $env:API_HOST = '127.0.0.1'
}

$apiHost = $env:API_HOST.Trim()
$loopbackHosts = @('127.0.0.1', '::1', 'localhost')
if ($loopbackHosts -notcontains $apiHost) {
  throw 'SAFE ERP refuse une écoute HTTP directe sur le réseau. Utilisez un reverse proxy HTTPS vers une adresse locale.'
}
if ([string]::IsNullOrWhiteSpace($env:SAFE_ERP_AUTH_SECRET)) {
  $generatedSecret = & node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64'))"
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($generatedSecret)) {
    throw 'Impossible de générer une clé temporaire. Vérifiez que Node.js est installé.'
  }
  $env:SAFE_ERP_AUTH_SECRET = $generatedSecret.Trim()
}

if ([System.Text.Encoding]::UTF8.GetByteCount($env:SAFE_ERP_AUTH_SECRET) -lt 32) {
  throw 'SAFE_ERP_AUTH_SECRET doit contenir au moins 32 octets.'
}

[int]$apiPort = 0
if (-not [int]::TryParse($env:PORT, [ref]$apiPort) -or $apiPort -lt 1 -or $apiPort -gt 65535) {
  throw 'PORT doit être un port TCP compris entre 1 et 65535.'
}
$listeners = @(Get-NetTCPConnection -LocalPort @($apiPort, 5176) -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count -gt 0) {
  $busyPorts = ($listeners | Select-Object -ExpandProperty LocalPort -Unique) -join ', '
  throw "Le ou les ports $busyPorts sont déjà utilisés. Fermez le programme concerné puis relancez SAFE; aucun processus n’a été arrêté."
}

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "           SAFE ERP - Système d'Analyse Financière des Entreprises             " -ForegroundColor Green
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "La clé de session locale est temporaire et n'est jamais affichée."
Write-Host "===============================================================================" -ForegroundColor Cyan

$browserWaiter = $null
if (-not $NoBrowser) {
  $powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
  $waitScript = Join-Path $PSScriptRoot 'open-safe-after-ready.ps1'
  if (-not (Test-Path -LiteralPath $waitScript -PathType Leaf)) {
    throw "Le script d’ouverture SAFE est introuvable : $waitScript"
  }
  $waitArguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$waitScript`""
  $browserWaiter = Start-Process `
    -FilePath $powerShell `
    -ArgumentList $waitArguments `
    -WorkingDirectory $PSScriptRoot `
    -WindowStyle Hidden `
    -PassThru
}

# Lancer le backend + le frontend (npm start utilise concurrently)
try {
  npm start
} finally {
  if ($browserWaiter -and -not $browserWaiter.HasExited) {
    Stop-Process -Id $browserWaiter.Id
  }
}
