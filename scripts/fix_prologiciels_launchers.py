import os, sys

BASE_DIR = r"C:\Users\USER\OneDrive\Desktop\SAFE_ERP_DRAFT 4"
CORE_ERP_DIR = os.path.join(BASE_DIR, "SAFE_ERP_DRAFT 3")

PROLOGICIELS = [
    {
        "folder": "SAFE_Facturation",
        "app_id": "facturation",
        "name": "SAFE Facturation (Achat et Vente)",
        "tagline": "Facturation achats et ventes, conformite TTN El Fatoora, retenues a la source RS",
        "badge": "TTN et TVA Tunisienne"
    },
    {
        "folder": "SAFE_Gestion_des_Stocks",
        "app_id": "stocks",
        "name": "SAFE Gestion des Stocks et Entrepots (MM)",
        "tagline": "Entrepots multi-depots, mouvements, inventaires, valorisation PUMP",
        "badge": "PUMP et Douane AT/ACT"
    },
    {
        "folder": "SAFE_Paie",
        "app_id": "paie",
        "name": "SAFE Paie Tunisienne et Declarations Sociales",
        "tagline": "Moteur de paie tunisien, bareme IRPP 8 tranches, CNSS 9.68%, CSS",
        "badge": "IRPP et CNSS 2026"
    },
    {
        "folder": "SAFE_Gestion_RH",
        "app_id": "rh",
        "name": "SAFE Gestion des Ressources Humaines et Talents",
        "tagline": "Dossiers collaborateurs, contrats CDI/CDD/CIVP, conges legaux",
        "badge": "Code du Travail Tunisien"
    },
    {
        "folder": "SAFE_Comptabilite_Fiscalite",
        "app_id": "comptabilite",
        "name": "SAFE Comptabilite Generale et Fiscalite Tunisienne",
        "tagline": "Systeme Comptable des Entreprises (SCE), Grand Livre, Balance 8 col, G50",
        "badge": "SCE et Liasse Fiscale G50"
    },
    {
        "folder": "SAFE_Production_GPAO",
        "app_id": "production",
        "name": "SAFE Production Industrielle et GPAO",
        "tagline": "Nomenclatures BOM, Ordres de Fabrication (OF), Planification MRP",
        "badge": "Industrie et GPAO"
    },
    {
        "folder": "SAFE_Immobilisations",
        "app_id": "comptabilite",
        "name": "SAFE Immobilisations et Amortissements",
        "tagline": "Gestion des actifs corporels/incorporels, amortissements DGI",
        "badge": "Baremes Fiscaux DGI"
    }
]

def make_bulletproof_cmd(prolog):
    app_id = prolog["app_id"]
    name = prolog["name"]
    tagline = prolog["tagline"]
    return f"""@echo off
chcp 65001 >nul
title {name} - SAFE Suite Tunisie
cls
echo ===============================================================================
echo   {name}
echo   {tagline}
echo   Version 1.0.0 ^| Conforme Legislation Tunisienne
echo ===============================================================================
echo.
echo Initialisation du service en local...

set "CORE_DIR=%~dp0..\\SAFE_ERP_DRAFT 3"
if not exist "%CORE_DIR%\\LANCER_SAFE_ERP_LOCAL.ps1" (
    set "CORE_DIR=C:\\Users\\USER\\OneDrive\\Desktop\\SAFE_ERP_DRAFT 4\\SAFE_ERP_DRAFT 3"
)

if not exist "%CORE_DIR%\\LANCER_SAFE_ERP_LOCAL.ps1" (
    echo [ERREUR] Le noyau SAFE ERP est introuvable dans : %CORE_DIR%
    pause
    exit /b 1
)

cd /d "%CORE_DIR%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\\LANCER_SAFE_ERP_LOCAL.ps1" -App "{app_id}"
if errorlevel 1 (
    echo.
    echo [ERREUR] Erreur lors du demarrage du prologiciel.
    pause
)
"""

def make_bulletproof_ps1(prolog):
    app_id = prolog["app_id"]
    name = prolog["name"]
    tagline = prolog["tagline"]
    badge = prolog["badge"]
    return f"""param(
  [ValidateRange(1, 65535)]
  [int]$Port = 3001,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$CoreErpDir = "C:\\Users\\USER\\OneDrive\\Desktop\\SAFE_ERP_DRAFT 4\\SAFE_ERP_DRAFT 3"

if (-not (Test-Path -LiteralPath $CoreErpDir -PathType Container)) {{
  Write-Host "[ERREUR] Le noyau SAFE ERP est introuvable a l'adresse : $CoreErpDir" -ForegroundColor Red
  exit 1
}}

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  {name}" -ForegroundColor Yellow
Write-Host "  {tagline}" -ForegroundColor Gray
Write-Host "  Conformite : {badge}" -ForegroundColor Green
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location -LiteralPath $CoreErpDir
$LauncherScript = Join-Path $CoreErpDir "LANCER_SAFE_ERP_LOCAL.ps1"

if (-not (Test-Path -LiteralPath $LauncherScript -PathType Leaf)) {{
  Write-Host "[ERREUR] Script de demarrage introuvable : $LauncherScript" -ForegroundColor Red
  exit 1
}}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $LauncherScript -Port $Port -App "{app_id}"
"""

def update_all_launchers():
    for prolog in PROLOGICIELS:
        folder_path = os.path.join(BASE_DIR, prolog["folder"])
        os.makedirs(folder_path, exist_ok=True)

        cmd_path = os.path.join(folder_path, f"Lancer_{prolog['folder']}.cmd")
        with open(cmd_path, "w", encoding="utf-8") as f:
            f.write(make_bulletproof_cmd(prolog))

        ps1_path = os.path.join(folder_path, f"Lancer_{prolog['folder']}.ps1")
        with open(ps1_path, "w", encoding="utf-8-sig") as f:
            f.write(make_bulletproof_ps1(prolog))

        print(f"✔ Cleaned launchers for {prolog['folder']}")

if __name__ == "__main__":
    update_all_launchers()
    print("All launchers successfully updated and secured without cmd escape errors!")
