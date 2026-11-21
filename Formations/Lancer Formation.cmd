@echo off
setlocal
cd /d "%~dp0.."
title SAFE Finance - MODE FORMATION (port 5200)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js est introuvable. Installez Node.js 20+ depuis https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo.
  echo Le dossier dist est absent. Lancez d'abord "Mettre a jour l'application.cmd".
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5200/api/mode' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  echo La formation est deja demarree. Ouverture du navigateur...
  start "" "http://127.0.0.1:5200"
  timeout /t 2 >nul
  exit /b 0
)

echo MODE FORMATION - donnees fictives, independantes de la base reelle (port 5300).
echo.
start "" cmd /c "timeout /t 2 >nul & start "" "http://127.0.0.1:5200""
node scripts/serve.mjs 5200 --training

echo.
echo Le serveur est arrete. Appuyez sur une touche pour fermer cette fenetre.
pause >nul
