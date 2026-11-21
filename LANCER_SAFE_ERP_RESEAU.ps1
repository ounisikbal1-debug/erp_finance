$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$caddy = Get-Command caddy -ErrorAction SilentlyContinue
if (-not $caddy) {
  $localCaddy = Join-Path $env:LOCALAPPDATA 'Programs\Caddy\caddy.exe'
  if (Test-Path -LiteralPath $localCaddy -PathType Leaf) { $caddy = @{ Source = $localCaddy } }
}
if (-not $caddy) {
  throw 'Caddy est requis pour publier SAFE sur le réseau en HTTPS. Installez Caddy depuis https://caddyserver.com/docs/install puis relancez ce script.'
}
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'dist\index.html') -PathType Leaf)) {
  throw 'Le build de l interface est absent. Exécutez npm run build avant de démarrer SAFE.'
}

$env:NODE_ENV = 'development'
$env:SAFE_ERP_DATABASE_PROVIDER = 'sqlite'
$env:SAFE_ERP_DATABASE_URL = 'file:../data.db'
$env:API_HOST = '127.0.0.1'
$env:PORT = '3001'
$wifiAdapters = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
  Where-Object { $_.NetworkInterfaceType -eq [System.Net.NetworkInformation.NetworkInterfaceType]::Wireless80211 -and $_.OperationalStatus -eq 'Up' }
$wifiAddresses = @($wifiAdapters | ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
  Where-Object { $_.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and -not [System.Net.IPAddress]::IsLoopback($_.Address) -and -not $_.Address.ToString().StartsWith('169.254.') })
if ($wifiAddresses.Count -eq 0) {
  throw 'Connectez ce PC au partage Wi-Fi du téléphone avant de lancer SAFE.'
}
$env:SAFE_ERP_LAN_ADDRESS = $wifiAddresses[0].Address.ToString()
if ([string]::IsNullOrWhiteSpace($env:SAFE_ERP_AUTH_SECRET)) {
  $env:SAFE_ERP_AUTH_SECRET = & node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64'))"
}
if ([System.Text.Encoding]::UTF8.GetByteCount($env:SAFE_ERP_AUTH_SECRET) -lt 32) {
  throw 'SAFE_ERP_AUTH_SECRET doit contenir au moins 32 octets.'
}

$busyPorts = @(Get-NetTCPConnection -State Listen -LocalPort @(3001, 8443) -ErrorAction SilentlyContinue)
if ($busyPorts.Count -gt 0) {
  $ports = ($busyPorts | Select-Object -ExpandProperty LocalPort -Unique) -join ', '
  throw "Les ports $ports sont déjà utilisés. Fermez le service concerné puis relancez SAFE."
}

& $caddy.Source validate --config (Join-Path $PSScriptRoot 'Caddyfile') --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw 'La configuration Caddy est invalide.' }

$api = $null
try {
  $api = Start-Process -FilePath (Get-Command node.exe -ErrorAction Stop).Source `
    -ArgumentList @('--require', 'ts-node/register', 'src/application/server.ts') `
    -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru

  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    if ($api.HasExited) { throw 'Le serveur API a quitte pendant le demarrage.' }
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 2
      if ($health.status -eq 'ok' -and $health.erp -like 'SAFE*') { $ready = $true; break }
    } catch { Start-Sleep -Seconds 1 }
  }
  if (-not $ready) { throw 'API SAFE indisponible apres 30 secondes.' }

  Write-Host 'SAFE est disponible localement sur http://127.0.0.1:3001.' -ForegroundColor Green
  Write-Host "Accès réseau HTTPS : https://$($env:SAFE_ERP_LAN_ADDRESS):8443 (installez le certificat racine sur les clients)." -ForegroundColor Green
  Write-Host 'Nom réseau facultatif : https://safe-erp.home.arpa:8443 si le DNS local le définit.'
  Write-Host 'Le serveur reste lié à 127.0.0.1; seul Caddy publie le port HTTPS.'
  & $caddy.Source run --config (Join-Path $PSScriptRoot 'Caddyfile') --adapter caddyfile
  if ($LASTEXITCODE -ne 0) { throw 'Caddy a quitte avec une erreur.' }
} finally {
  if ($api -and -not $api.HasExited) { Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue }
}
