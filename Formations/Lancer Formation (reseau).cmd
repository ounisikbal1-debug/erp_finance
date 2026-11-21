@echo off
setlocal
cd /d "%~dp0.."
title SAFE Finance - FORMATION EN SALLE (reseau, port 5200)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable. Installez Node.js 20+ depuis https://nodejs.org
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo Le dossier dist est absent. Lancez d'abord "Mettre a jour l'application.cmd".
  pause
  exit /b 1
)

echo FORMATION EN SALLE : les stagiaires ouvrent l'adresse "Reseau" ci-dessous.
echo Chaque poste garde ses propres donnees fictives : aucun stagiaire ne gene les autres.
echo.
node scripts/serve.mjs 5200 --training --lan

echo.
pause >nul
