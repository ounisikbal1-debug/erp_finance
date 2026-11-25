param(
  [ValidateRange(1, 65535)]
  [int]$Port = 3001,
  [switch]$NoBrowser,
  [string]$App = ""
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$databasePath = Join-Path $PSScriptRoot 'src\data\data.db'
$distIndex = Join-Path $PSScriptRoot 'dist\index.html'
if (-not (Test-Path -LiteralPath $databasePath -PathType Leaf)) {
  throw "Base SAFE introuvable : $databasePath"
}
if (-not (Test-Path -LiteralPath $distIndex -PathType Leaf)) {
  throw 'Interface de production absente. Exécutez npm run build avant le démarrage.'
}

$healthUrl = "http://127.0.0.1:$Port/health"
$uiUrl = "http://localhost:$Port/"
$targetUrl = if ($App) { "$uiUrl#/app/$App" } else { $uiUrl }
try {
  $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
  if ($health.status -eq 'ok' -and $health.erp -like 'SAFE*') {
    Write-Host "SAFE fonctionne déjà en local : $targetUrl" -ForegroundColor Green
    if (-not $NoBrowser) { Start-Process $targetUrl }
    return
  }
} catch {
  # Le port sera contrôlé ci-dessous avant de démarrer SAFE.
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  throw "Le port $Port est occupé par un autre service. Fermez-le ou relancez avec -Port 3002."
}

$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
[byte[]]$secretBytes = New-Object byte[] 48
$rng.GetBytes($secretBytes)
$rng.Dispose()
$secret = [Convert]::ToBase64String($secretBytes)
$env:NODE_ENV = 'development'
$env:SAFE_ERP_DATABASE_PROVIDER = 'sqlite'
$env:SAFE_ERP_DATABASE_URL = 'file:../data.db'
$env:API_HOST = '127.0.0.1'
$env:PORT = [string]$Port
$env:SAFE_ERP_AUTH_SECRET = $secret

$logDirectory = Join-Path $PSScriptRoot 'run-logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$stdoutPath = Join-Path $logDirectory "local-$Port.out.log"
$stderrPath = Join-Path $logDirectory "local-$Port.err.log"
$node = (Get-Command node.exe -ErrorAction Stop).Source
$server = Start-Process -FilePath $node -ArgumentList @('--require', 'ts-node/register', 'src/application/server.ts') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath

try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 45; $attempt++) {
    if ($server.HasExited) { throw "SAFE s’est arrêté au démarrage. Consultez $stderrPath." }
    try {
      $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
      if ($health.status -eq 'ok' -and $health.erp -like 'SAFE*') { $ready = $true; break }
    } catch { Start-Sleep -Seconds 1 }
  }
  if (-not $ready) { throw "SAFE n’a pas répondu. Consultez $stderrPath." }
  Write-Host "==================================================================" -ForegroundColor Cyan
  Write-Host " SAFE ERP TUNISIE - SUITE OPERATIONNELLE 2026" -ForegroundColor Yellow
  Write-Host " 1- Verrou Matériel Hardware ID  : $($health.hardware_id)" -ForegroundColor Green
  Write-Host " 2- Sécurité Cryptographique     : HMAC-SHA256 (SAFE-YYYYMMDD-XXXX-XXXX-XXXX-XXXX)" -ForegroundColor Green
  Write-Host " 3- Conformité Métier Tunisienne : TND (3 déc.) | TVA 19/13/7% | Timbre 1.000 DT | SCE NC 01" -ForegroundColor Yellow
  Write-Host "==================================================================" -ForegroundColor Cyan
  Write-Host "SAFE est accessible uniquement sur ce PC : $targetUrl" -ForegroundColor Green
  Write-Host 'Pour installer SAFE comme application sur le PC : ouvrez ce lien dans Edge, puis Menu > Applications > Installer ce site comme application.'
  if (-not $NoBrowser) { Start-Process $targetUrl }
  while (-not $server.HasExited) { Start-Sleep -Seconds 2 }
} finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
}
