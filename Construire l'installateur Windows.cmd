@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === SAFE : construction de l'installateur Windows ===
where node >nul 2>nul || (echo Node.js est requis : https://nodejs.org & pause & exit /b 1)
call npm install || (echo Echec npm install & pause & exit /b 1)
call npm run build || (echo Echec de la compilation & pause & exit /b 1)
call npm run desktop:build || (echo Echec electron-builder & pause & exit /b 1)
echo.
echo Termine. L'installateur se trouve dans le dossier "release" (SAFE-Setup-x.y.z.exe).
pause
