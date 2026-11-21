@echo off
setlocal
cd /d "%~dp0"
title SAFE Finance - Base partagee

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js est introuvable. Installez Node.js 20+ depuis https://nodejs.org
  echo.
  pause
  exit /b 1
)

rem Si un serveur tourne deja sur ce PC, on ouvre simplement le navigateur.
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5300' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  echo Un serveur partage est deja actif sur ce PC. Ouverture du navigateur...
  start "" "http://127.0.0.1:5300"
  timeout /t 2 >nul
  exit /b 0
)

set "DATA=%~1"
echo Recherche d'un serveur partage sur le reseau...
if not "%DATA%"=="" echo Fichier de donnees si ce PC devient serveur : %DATA%
echo.
if "%DATA%"=="" (
  node scripts/join-or-host.mjs 5300
) else (
  node scripts/join-or-host.mjs 5300 "%DATA%"
)

echo.
echo Serveur arrete. Appuyez sur une touche pour fermer.
pause >nul
