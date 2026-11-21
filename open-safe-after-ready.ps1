$ErrorActionPreference = 'Stop'

$healthUrl = 'http://127.0.0.1:3000/health'
$uiUrl = 'http://127.0.0.1:5176/'
$lastError = 'Aucune réponse de SAFE.'

for ($attempt = 0; $attempt -lt 90; $attempt += 1) {
  $isReady = $false
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    if ($health.status -eq 'ok') {
      $page = Invoke-WebRequest -UseBasicParsing -Uri $uiUrl -TimeoutSec 2
      if ($page.StatusCode -eq 200) {
        $isReady = $true
      } else {
        $lastError = "L’interface a répondu avec le statut HTTP $($page.StatusCode)."
      }
    } else {
      $lastError = 'Le contrôle de santé de l’API n’est pas encore prêt.'
    }
  } catch {
    $lastError = $_.Exception.Message
  }

  if ($isReady) {
    try {
      Start-Process -FilePath $uiUrl
      return
    } catch {
      throw "SAFE est prêt, mais le navigateur n’a pas pu être ouvert : $($_.Exception.Message)"
    }
  }

  Start-Sleep -Seconds 1
}

throw "SAFE n’est pas devenu disponible après 90 secondes. Dernière erreur : $lastError"
