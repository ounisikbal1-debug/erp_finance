param(
  [ValidateRange(1, 65535)]
  [int]$Port = 3300
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDirectory = Join-Path $root 'run-logs'
$stdoutPath = Join-Path $logDirectory "server-$Port.out.log"
$stderrPath = Join-Path $logDirectory "server-$Port.err.log"
$startupLogPath = Join-Path $logDirectory "startup.log"

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

function Write-StartupLog([string]$Message) {
  Add-Content -LiteralPath $startupLogPath -Value "[$(Get-Date -Format o)] $Message" -Encoding UTF8
}

$databasePath = Join-Path $root 'src\data\data.db'
if (-not (Test-Path -LiteralPath $databasePath -PathType Leaf)) {
  Write-StartupLog "ERROR: draft database missing at $databasePath; refusing to start."
  throw 'La base privÃ©e du draft est absente; initialisez-la avant le dÃ©marrage.'
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  Write-StartupLog "ERROR: port $Port is already in use; no existing process was stopped."
  throw "Le port $Port est dÃ©jÃ  utilisÃ©; aucun processus existant nâ€™a Ã©tÃ© arrÃªtÃ©."
}

$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
[byte[]]$secretBytes = New-Object byte[] 48
$rng.GetBytes($secretBytes)
$rng.Dispose()

$env:PORT = [string]$Port
$env:API_HOST = '127.0.0.1'
$env:SAFE_ERP_DATABASE_URL = 'file:' + $databasePath.Replace('\', '/')
$env:SAFE_ERP_AUTH_SECRET = [Convert]::ToBase64String($secretBytes)

$npm = Get-Command npm.cmd -ErrorAction Stop
Write-StartupLog "Starting SAFE_ERP draft from $root on http://127.0.0.1:$Port."
$server = Start-Process `
  -FilePath $env:ComSpec `
  -ArgumentList "/c `"$($npm.Source)`" run dev" `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -PassThru `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath

$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
  Start-Sleep -Seconds 1
  if ($server.HasExited) {
    Write-StartupLog "ERROR: server process exited with code $($server.ExitCode); see $stderrPath."
    throw "Le serveur SAFE_ERP-DRAFT sâ€™est arrÃªtÃ©. Consultez $stderrPath."
  }
  try {
    $health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2
    if ($health.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {
    # Continue polling until the server is ready or the startup deadline expires.
  }
}

if (-not $ready) {
  Write-StartupLog "ERROR: server on port $Port did not become ready within 60 seconds; see $stderrPath."
  throw "Le serveur SAFE_ERP-DRAFT nâ€™a pas rÃ©pondu aprÃ¨s 60 secondes. Consultez $stderrPath."
}

Write-StartupLog "Server ready; opening http://127.0.0.1:$Port."
Start-Process "http://127.0.0.1:$Port"
