$ErrorActionPreference = 'Stop'

$projectRoot = $PSScriptRoot
$uiUrl = 'http://127.0.0.1:5176/'
$healthUrl = 'http://127.0.0.1:3000/health'
$mutex = New-Object -TypeName System.Threading.Mutex -ArgumentList $false, 'Local\SAFE_ERP_FAVORITE_START'
$mutexAcquired = $false

function Test-SafeReady {
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    if ($health.status -ne 'ok') {
      return $false
    }

    $page = Invoke-WebRequest -UseBasicParsing -Uri $uiUrl -TimeoutSec 2
    return $page.StatusCode -eq 200
  } catch {
    return $false
  }
}

try {
  try {
    $mutexAcquired = $mutex.WaitOne([TimeSpan]::FromSeconds(90))
  } catch [System.Threading.AbandonedMutexException] {
    $mutexAcquired = $true
  }
  if (-not $mutexAcquired) {
    throw 'Une autre demande de dÃ©marrage SAFE est en cours depuis plus de 90 secondes.'
  }

  if (Test-SafeReady) {
    Start-Process -FilePath $uiUrl
    return
  }

  $listeners = @(Get-NetTCPConnection -LocalPort @(3000, 5176) -State Listen -ErrorAction SilentlyContinue)
  if ($listeners.Count -gt 0) {
    $busyPorts = ($listeners | Select-Object -ExpandProperty LocalPort -Unique) -join ', '
    throw "Le ou les ports $busyPorts sont utilisÃ©s mais SAFE nâ€™est pas prÃªt. Aucun processus existant nâ€™a Ã©tÃ© arrÃªtÃ©."
  }

  $runScript = Join-Path $projectRoot 'run-safe.ps1'
  if (-not (Test-Path -LiteralPath $runScript -PathType Leaf)) {
    throw "Le script de dÃ©marrage SAFE est introuvable : $runScript"
  }

  $powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
  $arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$runScript`" -NoBrowser"
  $serverProcess = Start-Process `
    -FilePath $powerShell `
    -ArgumentList $arguments `
    -WorkingDirectory $projectRoot `
    -PassThru

  for ($attempt = 0; $attempt -lt 90; $attempt += 1) {
    Start-Sleep -Seconds 1
    if ($serverProcess.HasExited) {
      throw "Le processus de dÃ©marrage SAFE sâ€™est arrÃªtÃ© (code $($serverProcess.ExitCode)). Consultez sa fenÃªtre PowerShell."
    }
    if (Test-SafeReady) {
      Start-Process -FilePath $uiUrl
      return
    }
  }

  throw 'SAFE nâ€™a pas rÃ©pondu sur les ports locaux aprÃ¨s 90 secondes. VÃ©rifiez la fenÃªtre PowerShell de dÃ©marrage.'
} finally {
  if ($mutexAcquired) {
    $mutex.ReleaseMutex()
  }
  $mutex.Dispose()
}
