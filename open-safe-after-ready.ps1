$ErrorActionPreference = 'Stop'

$healthUrl = 'http://127.0.0.1:3000/health'
$uiUrl = 'http://127.0.0.1:5176/'
$lastError = 'Aucune rÃ©ponse de SAFE.'

for ($attempt = 0; $attempt -lt 90; $attempt += 1) {
  $isReady = $false
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    if ($health.status -eq 'ok') {
      $page = Invoke-WebRequest -UseBasicParsing -Uri $uiUrl -TimeoutSec 2
      if ($page.StatusCode -eq 200) {
        $isReady = $true
      } else {
        $lastError = "Lâ€™interface a rÃ©pondu avec le statut HTTP $($page.StatusCode)."
      }
    } else {
      $lastError = 'Le contrÃ´le de santÃ© de lâ€™API nâ€™est pas encore prÃªt.'
    }
  } catch {
    $lastError = $_.Exception.Message
  }

  if ($isReady) {
    try {
      Start-Process -FilePath $uiUrl
      return
    } catch {
      throw "SAFE est prÃªt, mais le navigateur nâ€™a pas pu Ãªtre ouvert : $($_.Exception.Message)"
    }
  }

  Start-Sleep -Seconds 1
}

throw "SAFE nâ€™est pas devenu disponible aprÃ¨s 90 secondes. DerniÃ¨re erreur : $lastError"
