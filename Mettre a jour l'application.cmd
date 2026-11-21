@echo off
setlocal
cd /d "%~dp0"

if not exist "src\main.tsx" (
  echo.
  echo ERREUR : ce script est lance hors du dossier du projet ^(ou depuis le zip^).
  echo Extrayez TOUT le zip dans un dossier, par exemple C:\SAFE,
  echo puis relancez ce fichier depuis ce dossier.
  echo.
  pause
  exit /b 1
)
title SAFE Finance - installation et compilation

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable. Installez Node.js 20+ depuis https://nodejs.org
  pause
  exit /b 1
)

echo 1/2 - Installation des dependances...
call npm install
if errorlevel 1 goto fail
echo.
echo 2/2 - Compilation de l'application...
call npm run build
if errorlevel 1 goto fail

echo.
echo Termine. Lancez "Lancer SAFE Partage.cmd" (mode equipe)
echo ou "Formations\Lancer Formation.cmd" (mode formation).
pause
exit /b 0

:fail
echo.
echo Une etape a echoue. Lisez le message ci-dessus.
pause
exit /b 1
