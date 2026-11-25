@echo off
chcp 65001 >nul
title SAFE ERP - SystÃ¨me d'Analyse FinanciÃ¨re des Entreprises
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-safe.ps1"
exit /b %ERRORLEVEL%
