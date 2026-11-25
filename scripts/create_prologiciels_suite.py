import os, sys, json

BASE_DIR = r"C:\Users\USER\OneDrive\Desktop\SAFE_ERP_DRAFT 4"
CORE_ERP_DIR = os.path.join(BASE_DIR, "SAFE_Grandes_Entreprises")

PROLOGICIELS = [
    {
        "folder": "SAFE_Facturation",
        "app_id": "facturation",
        "name": "SAFE Facturation (Achat & Vente)",
        "tagline": "Facturation achats/ventes, conformitÃ© TTN El Fatoora, retenues Ã  la source RS, crÃ©ances & dettes",
        "badge": "TTN & TVA Tunisienne",
        "icon": "ðŸ§¾",
        "version": "1.0.0",
        "accent": "#E11D48",
        "modules": ["sales", "purchases", "tunisianEInvoices", "agedReceivables", "agedPayables", "taxation", "reportsExport"],
        "default_module": "sales",
        "legislation": [
            "DÃ©cret nÂ° 2016-1098 et DÃ©cret-loi nÂ° 2021-21 (Facturation Ã‰lectronique Nationale El Fatoora / TTN)",
            "Code de la Taxe sur la Valeur AjoutÃ©e (TVA) : Taux de 19 %, 13 %, 7 % et 0 %",
            "Droit de Timbre Fiscal lÃ©gal de 1,000 DT par facture client (Article 432)",
            "Article 52 du Code de l'IRPP et de l'IS : Retenue Ã  la Source (RS) de 1.5 % sur marchÃ©s et achats >= 1000 DT TTC, 0.5 % et 15 % sur honoraires",
            "SystÃ¨me Comptable des Entreprises (SCE) - Norme NCT 03 (Revenus des activitÃ©s ordinaires)"
        ],
        "features": [
            "Ã‰mission de devis et bons de commande clients convertibles en factures en un clic",
            "Facturation des ventes avec ventilation automatique des taux de TVA tunisiens (19%, 13%, 7%, 0%)",
            "Facturation des achats et lettrage 3-way matching avec bons de commande et rÃ©ceptions",
            "Module Facturation Ã‰lectronique Tunisienne (El Fatoora) homologuÃ© Tunisie TradeNet (TTN)",
            "GÃ©nÃ©ration de flux XML conformes au standard international OASIS UBL 2.1 Invoice",
            "Signature Ã©lectronique qualifiÃ©e TunTrust PKI (certificat X.509 dÃ©livrÃ© par l'ANCE)",
            "Cachet Ã‰lectronique Visible (CEV / 2D-Doc) avec QR Code haute densitÃ© pour contrÃ´le DGI",
            "GÃ©nÃ©ration et Ã©mission automatique des certificats de Retenue Ã  la Source (RS) pour les fournisseurs",
            "Suivi rigoureux du dÃ©lai moyen de paiement (DSO) et balance Ã¢gÃ©e des crÃ©ances clients",
            "Gestion des Ã©chÃ©anciers fournisseurs et Ã©vitement des pÃ©nalitÃ©s de retard"
        ]
    },
    {
        "folder": "SAFE_Gestion_des_Stocks",
        "app_id": "stocks",
        "name": "SAFE Gestion des Stocks & EntrepÃ´ts (MM)",
        "tagline": "EntrepÃ´ts multi-dÃ©pÃ´ts, mouvements, inventaires, valorisation PUMP, rÃ©gimes douaniers AT/ACT",
        "badge": "PUMP & Douane AT/ACT",
        "icon": "ðŸ“¦",
        "version": "1.0.0",
        "accent": "#0D9488",
        "modules": ["stocks", "mrpPlanning", "customsRegimes", "purchases", "reportsExport"],
        "default_module": "stocks",
        "legislation": [
            "Norme Comptable Tunisienne NCT 04 : Ã‰valuation des stocks au CoÃ»t Moyen Unitaire PondÃ©rÃ© (PUMP / CMP)",
            "Code des Douanes Tunisien : RÃ©gimes suspensifs d'Admission Temporaire (AT) et d'AmÃ©lioration Active (ACT)",
            "Loi de Finances : RÃ¨gles de traÃ§abilitÃ© des flux de marchandises et inventaire physique annuel obligatoire",
            "ArrÃªtÃ©s ministÃ©riels relatifs aux cautions et garanties bancaires douaniÃ¨res"
        ],
        "features": [
            "Gestion multi-magasins, dÃ©pÃ´ts rÃ©gionaux et plateformes logistiques tunisiennes",
            "Fichier articles avec rÃ©fÃ©rences internes, codes-barres EAN13 et unitÃ©s de conditionnement",
            "Enregistrement atomique des mouvements : RÃ©ceptions achats, Sorties fabrication, Retours et Transferts inter-dÃ©pÃ´ts",
            "Calcul automatisÃ© en temps rÃ©el du Prix Unitaire Moyen PondÃ©rÃ© (PUMP / CMP) au millime",
            "Gestion des inventaires tournants et annuels avec calcul et justification des Ã©carts d'inventaire",
            "Registre rÃ©glementaire d'Admission Temporaire (AT / ACT) sous contrÃ´le des services douaniers tunisiens",
            "Suivi des cautions douaniÃ¨res bancaires et comptes d'apurement Ã  l'exportation",
            "Planification des Besoins MatiÃ¨res (MRP) et alertes automatiques de rÃ©approvisionnement sur seuils minimaux"
        ]
    },
    {
        "folder": "SAFE_Paie",
        "app_id": "paie",
        "name": "SAFE Paie Tunisienne & DÃ©clarations Sociales",
        "tagline": "Moteur de paie tunisien, barÃ¨me IRPP 8 tranches, CNSS 9.68%, FOPROLOS, CSS & fiches de paie",
        "badge": "IRPP & CNSS 2026",
        "icon": "ðŸ’µ",
        "version": "1.0.0",
        "accent": "#16A34A",
        "modules": ["payrollEngine", "hrDeep", "hrWorkflows", "reportsExport"],
        "default_module": "payrollEngine",
        "legislation": [
            "Loi de Finances : BarÃ¨me progressif lÃ©gal de l'IRPP Ã  8 tranches",
            "DÃ©ductions familiales lÃ©gales : 300 DT pour chef de famille, 100 DT par enfant Ã  charge (jusqu'Ã  4 enfants)",
            "LÃ©gislation de SÃ©curitÃ© Sociale : Cotisation CNSS salariale Ã  9.68 % et part patronale Ã  16.57 % (secteur non-agricole)",
            "Loi nÂ° 77-54 crÃ©ant le Fonds de Promotion du Logement pour les SalariÃ©s (FOPROLOS) : Taux de 1 %",
            "Loi de Finances : Contribution Sociale de SolidaritÃ© (CSS) Ã  0.5 % pour le financement des caisses de retraite",
            "Accords paritaires et conventions collectives sectorielles tunisiennes (grilles de salaires minima)"
        ],
        "features": [
            "Moteur de calcul de paie haute prÃ©cision au millime tunisien (3 dÃ©cimales)",
            "GÃ©nÃ©ration en un clic des bulletins de paie mensuels normalisÃ©s",
            "Calcul instantanÃ© du salaire brut au salaire net et simulation inverse (Net vers Brut)",
            "Calcul automatisÃ© des heures supplÃ©mentaires bonifiÃ©es selon le Code du travail tunisien (25%, 50%, 100%)",
            "Ã‰dition du Livre de Paie mensuel conforme aux obligations de l'Inspection du Travail",
            "PrÃ©paration et tÃ©lÃ©transmission de la DÃ©claration Trimestrielle des Salaires CNSS (DS)",
            "Gestion des avances sur salaires, acomptes et prÃªts entreprise avec retenue sur paie",
            "Comptabilisation automatique des Ã©critures de paie (Salaires 641, CNSS 434, IRPP 432)"
        ]
    },
    {
        "folder": "SAFE_Gestion_RH",
        "app_id": "rh",
        "name": "SAFE Gestion des Ressources Humaines & Talents",
        "tagline": "Dossiers collaborateurs, contrats CDI/CDD/CIVP, suivi congÃ©s lÃ©gaux, mÃ©decine du travail & GPEC",
        "badge": "Code du Travail Tunisien",
        "icon": "ðŸ‘”",
        "version": "1.0.0",
        "accent": "#6366F1",
        "modules": ["hrDeep", "hrWorkflows", "hrTraining", "quality", "reportsExport"],
        "default_module": "hrDeep",
        "legislation": [
            "Code du Travail Tunisien (Loi nÂ° 66-27 modifiÃ©e) rÃ©gissant les contrats et conditions de travail",
            "RÃ©glementation ANETI pour les contrats d'insertion professionnelle (CIVP / SIVP, CAIP, Contrat Karama)",
            "Articles 112 et suivants du Code du Travail : Droit au congÃ© payÃ© (1 jour par mois + bonifications d'anciennetÃ©)",
            "DÃ©crets fixant la liste officielle des jours fÃ©riÃ©s chÃ´mÃ©s et payÃ©s en RÃ©publique Tunisienne",
            "RÃ©glementation relative Ã  la MÃ©decine du Travail et Ã  la PrÃ©vention des Risques Professionnels"
        ],
        "features": [
            "Dossier collaborateur dÃ©matÃ©rialisÃ© (IdentitÃ©, CIN, Matricule CNSS, DiplÃ´mes, PiÃ¨ces jointes)",
            "Gestion du cycle de vie des contrats de travail : PÃ©riode d'essai, CDI, CDD et conventions ANETI (CIVP)",
            "Module de demande et validation dÃ©matÃ©rialisÃ©e des congÃ©s payÃ©s avec calcul automatique des droits",
            "Calendrier officiel des jours fÃ©riÃ©s nationaux et religieux tunisiens avec calcul des ponts",
            "Suivi de la MÃ©decine du Travail (visites d'embauche, visites pÃ©riodiques, attestations d'aptitude)",
            "Cartographie des compÃ©tences, Ã©valuation annuelle des performances et plans de formation (GPEC)",
            "Ã‰dition automatique d'attestations de travail, certificats d'emploi et soldes de tout compte",
            "Registre du personnel lÃ©gal et archivage sÃ©curisÃ© des sanctions, promotions et avenants"
        ]
    },
    {
        "folder": "SAFE_Comptabilite_Fiscalite",
        "app_id": "comptabilite",
        "name": "SAFE ComptabilitÃ© GÃ©nÃ©rale & FiscalitÃ© Tunisienne",
        "tagline": "SystÃ¨me Comptable des Entreprises (SCE), Grand Livre, Balance 8 colonnes, DÃ©clarations G50, Rapprochement bancaire",
        "badge": "SCE & Liasse Fiscale G50",
        "icon": "âš–ï¸",
        "version": "1.0.0",
        "accent": "#1E3A8A",
        "modules": ["generalBalance", "generalLedger", "accountingEntry", "taxation", "financialStatements", "bankReconciliation", "assetsManagement", "cashflow", "monthlyClose", "controlling", "anomalies", "incomeStatement", "reportsExport"],
        "default_module": "generalBalance",
        "legislation": [
            "Loi nÂ° 96-112 relative au SystÃ¨me Comptable des Entreprises (SCE) et normes comptables tunisiennes (NCT)",
            "Plan de comptes officiel tunisien (Classes 1 Ã  7) avec tenue des Ã©critures en partie double",
            "Code des Droits et ProcÃ©dures Fiscaux (CDPF) : DÃ©claration mensuelle d'impÃ´t G50 avant le 28 de chaque mois",
            "Code de l'IRPP et de l'IS : Taux normal d'ImpÃ´t sur les SociÃ©tÃ©s de 20 % (Loi de Finances)",
            "Normes internationales d'audit (ISA) : Piste d'audit immuable et irrÃ©versibilitÃ© des Ã©critures closes"
        ],
        "features": [
            "Saisie comptable horizontale ergonomique et journaux auxiliaires (Achats, Ventes, Banque, Caisse, OD)",
            "Balance GÃ©nÃ©rale des Comptes Ã  8 colonnes (Balances d'ouverture, Mouvements dÃ©bit/crÃ©dit, Soldes de clÃ´ture)",
            "Grand Livre GÃ©nÃ©ral (GL) dynamique avec filtrage par compte, pÃ©riode, lettrage et devise",
            "Rapprochement bancaire multi-banques tunisiennes (STB, BIAT, BH Bank, BNA, Attijariwafa, UIB)",
            "GÃ©nÃ©ration automatique des liasses fiscales mensuelles DÃ©claration G50 (TVA, Timbre, RS)",
            "Calcul et dÃ©claration de l'ImpÃ´t sur les SociÃ©tÃ©s (IS) au taux lÃ©gal de 20 % avec acomptes provisionnels",
            "ImmutabilitÃ© et protection des pÃ©riodes clÃ´turÃ©es (interdiction absolue d'Ã©critures antidatÃ©es)",
            "Piste d'audit cryptographique continue scellÃ©e par hachage SHA-256 (JournalEntryAuditChainHead)"
        ]
    },
    {
        "folder": "SAFE_Production_GPAO",
        "app_id": "production",
        "name": "SAFE Production Industrielle & GPAO",
        "tagline": "Nomenclatures BOM, Ordres de Fabrication (OF), Planification MRP & Maintenance des Ã©quipements",
        "badge": "Industrie & GPAO",
        "icon": "âš™ï¸",
        "version": "1.0.0",
        "accent": "#D97706",
        "modules": ["activities", "mrpPlanning", "stocks", "maintenance", "quality", "reportsExport"],
        "default_module": "activities",
        "legislation": [
            "Normes Tunisiennes homologuÃ©es (INNORPI) relatives aux procÃ©dÃ©s industriels et Ã  la traÃ§abilitÃ© de production",
            "Norme Comptable Tunisienne NCT 04 : Ã‰valuation et valorisation des produits en cours et des produits finis",
            "RÃ©glementation de la sÃ©curitÃ© des Ã©quipements industriels et registres de maintenance obligatoire"
        ],
        "features": [
            "Gestion des nomenclatures de fabrication multi-niveaux (Bill of Materials - BOM)",
            "CrÃ©ation, ordonnancement et suivi d'avancement des Ordres de Fabrication (OF)",
            "Calcul des Besoins Nets (MRP) synchronisÃ© avec les stocks de composants et les commandes clients",
            "Imputation prÃ©cise des temps machines, coÃ»ts de main-d'Å“uvre et frais gÃ©nÃ©raux d'atelier",
            "Gestion de la maintenance assistÃ©e par ordinateur (GMAO) : Parc machines, compteurs, interventions prÃ©ventives/curatives",
            "Module QualitÃ© & CAPA : DÃ©claration de non-conformitÃ©s, fiches de rebuts et plans d'actions correctives"
        ]
    },
    {
        "folder": "SAFE_Immobilisations",
        "app_id": "comptabilite",
        "name": "SAFE Immobilisations & Amortissements",
        "tagline": "Gestion des actifs corporels/incorporels, tableaux d'amortissement linÃ©aire/dÃ©gressif, Ã©critures d'inventaire",
        "badge": "BarÃ¨mes Fiscaux DGI",
        "icon": "ðŸ¢",
        "version": "1.0.0",
        "accent": "#7C3AED",
        "modules": ["assetsManagement", "generalBalance", "generalLedger", "financialStatements", "reportsExport"],
        "default_module": "assetsManagement",
        "legislation": [
            "Norme Comptable Tunisienne NCT 05 relative aux immobilisations corporelles",
            "BarÃ¨mes des taux d'amortissement fiscalement admis par la Direction GÃ©nÃ©rale des ImpÃ´ts (DGI tunisienne)",
            "RÃ¨gles d'amortissement linÃ©aire (constat constant prorata temporis) et dÃ©gressif prÃ©vu par le Code de l'IRPP/IS"
        ],
        "features": [
            "Fichier exhaustif des immobilisations avec code barre d'inventaire, localisation et centre de coÃ»t",
            "Plans d'amortissement prÃ©visionnels automatiques calculÃ©s au prorata temporis exact",
            "Application des taux d'amortissement lÃ©gaux : BÃ¢timents (5%), MatÃ©riel industriel (10%-20%), Informatique (33.3%)",
            "GÃ©nÃ©ration en un clic des Ã©critures comptables annuelles de dotation aux amortissements (681 / 28x)",
            "Gestion des cessions, mises au rebut et calcul des plus-values ou moins-values fiscales de cession",
            "Ã‰dition du tableau d'inventaire physique des immobilisations conforme aux exigences des commissaires aux comptes"
        ]
    }
]

def make_launcher_cmd(prolog):
    app_id = prolog["app_id"]
    return f"""@echo off
chcp 65001 >nul
title {prolog['name']} - SAFE Suite Tunisie
cls
echo ===============================================================================
echo   {prolog['icon']} {prolog['name']}
echo   {prolog['tagline']}
echo   Version {prolog['version']} ^| Conforme Legislation Tunisienne
echo ===============================================================================
echo.
echo Initialisation du service en local...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Lancer_{prolog['folder']}.ps1"
if errorlevel 1 (
    echo.
    echo [ERREUR] Impossible de lancer le prologiciel. Verifiez que Node.js est installe.
    pause
)
"""

def make_launcher_ps1(prolog):
    app_id = prolog["app_id"]
    return f"""param(
  [ValidateRange(1, 65535)]
  [int]$Port = 3001,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$CoreErpDir = "{CORE_ERP_DIR}"

if (-not (Test-Path -LiteralPath $CoreErpDir -PathType Container)) {{
  Write-Host "[ERREUR] Le noyau SAFE ERP est introuvable a l'adresse : $CoreErpDir" -ForegroundColor Red
  exit 1
}}

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  {prolog['icon']} {prolog['name']}" -ForegroundColor Yellow
Write-Host "  {prolog['tagline']}" -ForegroundColor Gray
Write-Host "  Conformite : {prolog['badge']}" -ForegroundColor Green
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

def make_readme_md(prolog):
    legs = "\\n".join([f"- **{leg}**" for leg in prolog["legislation"]])
    feats = "\\n".join([f"- {f}" for f in prolog["features"]])
    return f"""# {prolog['icon']} {prolog['name']}
> **{prolog['tagline']}**
> *ConformitÃ© certifiÃ©e : {prolog['badge']} â€¢ Version {prolog['version']}*

---

## 1. PrÃ©sentation du Prologiciel

**{prolog['name']}** est un progiciel vertical dÃ©diÃ©, conÃ§u pour rÃ©pondre avec une prÃ©cision absolue aux exigences opÃ©rationnelles, comptables et fiscales des entreprises Ã©tablies en **RÃ©publique Tunisienne**.

Il fonctionne de maniÃ¨re entiÃ¨rement autonome pour les Ã©quipes opÃ©rationnelles tout en restant nativement synchronisÃ© avec le noyau sÃ©curisÃ© **SAFE ERP**, garantissant l'intÃ©gritÃ© transactionnelle globale de l'organisation.

---

## 2. Cadre RÃ©glementaire & Fiscal Tunisien

{legs}

---

## 3. FonctionnalitÃ©s ClÃ©s LivrÃ©es

{feats}

---

## 4. DÃ©marrage Rapide

Double-cliquez simplement sur le fichier exÃ©cutable suivant situÃ© dans ce rÃ©pertoire :

```bat
Lancer_{prolog['folder']}.cmd
```

Le progiciel dÃ©marre immÃ©diatement en local sur votre poste et ouvre votre navigateur Web directement dans votre environnement de travail dÃ©diÃ©.

---

*SAFE Suite Tunisie â€¢ SystÃ¨me d'Analyse FinanciÃ¨re des Entreprises â€¢ Normes Tunisiennes & Internationales*
"""

def create_suite():
    os.makedirs(BASE_DIR, exist_ok=True)
    print(f"Initialisation de la Suite de Prologiciels dans : {BASE_DIR}")

    for prolog in PROLOGICIELS:
        folder_path = os.path.join(BASE_DIR, prolog["folder"])
        os.makedirs(folder_path, exist_ok=True)
        print(f"Creating package: {prolog['folder']} ...")

        # 1. Launcher .cmd
        cmd_path = os.path.join(folder_path, f"Lancer_{prolog['folder']}.cmd")
        with open(cmd_path, "w", encoding="utf-8") as f:
            f.write(make_launcher_cmd(prolog))

        # 2. Launcher .ps1
        ps1_path = os.path.join(folder_path, f"Lancer_{prolog['folder']}.ps1")
        with open(ps1_path, "w", encoding="utf-8") as f:
            f.write(make_launcher_ps1(prolog))

        # 3. README.md
        readme_path = os.path.join(folder_path, "README.md")
        with open(readme_path, "w", encoding="utf-8") as f:
            f.write(make_readme_md(prolog))

        # 4. config.json
        config_path = os.path.join(folder_path, "config.json")
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(prolog, f, indent=2, ensure_ascii=False)

    # 5. Create Master Menu Launcher in SAFE_ERP_DRAFT 4 root
    master_menu_cmd = os.path.join(BASE_DIR, "MENU_PROLOGICIELS_SAFE.cmd")
    with open(master_menu_cmd, "w", encoding="utf-8") as f:
        f.write("""@echo off
chcp 65001 >nul
title SAFE SUITE TUNISIE - Lanceur Central de Prologiciels Metiers
:MENU
cls
echo ===============================================================================
echo                SAFE SUITE TUNISIE - PROLOGICIELS METIERS 2026
echo             Conformes a la Legislation Tunisienne & aux Normes SCE
echo ===============================================================================
echo.
echo   Choisissez le Prologiciel Metier a lancer :
echo.
echo   [1] ðŸ§¾ SAFE Facturation           (Achats, Ventes, E-Facture TTN, Retenue RS)
echo   [2] ðŸ“¦ SAFE Gestion des Stocks    (Multi-Depots, Valorisation PUMP, Douanes AT)
echo   [3] ðŸ’µ SAFE Paie Tunisie          (Moteur IRPP 8 tranches, CNSS 9.68%%, CSS)
echo   [4] ðŸ‘” SAFE Gestion RH            (Contrats CDI/CDD/CIVP, Conges Legaux, GPEC)
echo   [5] âš–ï¸ SAFE Comptabilite          (SCE, Balance 8 col, Declarations G50, IS)
echo   [6] âš™ï¸ SAFE Production GPAO       (Nomenclatures BOM, Ordres OF, MRP)
echo   [7] ðŸ¢ SAFE Immobilisations       (Amortissements Lineaires & Degressifs DGI)
echo.
echo   [8] ðŸŒ SAFE ERP Global            (Suite Complete Integree - 28 Modules)
echo   [0] âŒ Quitter
echo.
echo ===============================================================================
set /p CHOIX="Entrez votre numero (1-8 ou 0) : "

if "%CHOIX%"=="1" (
    call "%~dp0SAFE_Facturation\\Lancer_SAFE_Facturation.cmd"
    goto MENU
)
if "%CHOIX%"=="2" (
    call "%~dp0SAFE_Gestion_des_Stocks\\Lancer_SAFE_Gestion_des_Stocks.cmd"
    goto MENU
)
if "%CHOIX%"=="3" (
    call "%~dp0SAFE_Paie\\Lancer_SAFE_Paie.cmd"
    goto MENU
)
if "%CHOIX%"=="4" (
    call "%~dp0SAFE_Gestion_RH\\Lancer_SAFE_Gestion_RH.cmd"
    goto MENU
)
if "%CHOIX%"=="5" (
    call "%~dp0SAFE_Comptabilite_Fiscalite\\Lancer_SAFE_Comptabilite_Fiscalite.cmd"
    goto MENU
)
if "%CHOIX%"=="6" (
    call "%~dp0SAFE_Production_GPAO\\Lancer_SAFE_Production_GPAO.cmd"
    goto MENU
)
if "%CHOIX%"=="7" (
    call "%~dp0SAFE_Immobilisations\\Lancer_SAFE_Immobilisations.cmd"
    goto MENU
)
if "%CHOIX%"=="8" (
    start http://localhost:3001/
    goto MENU
)
if "%CHOIX%"=="0" exit
goto MENU
""")

    # 6. Create Master Documentation in SAFE_ERP_DRAFT 4 root
    master_readme = os.path.join(BASE_DIR, "CATALOGUE_SUITE_PROLOGICIELS_SAFE_TUNISIE.md")
    with open(master_readme, "w", encoding="utf-8") as f:
        f.write("""# ðŸ‡¹ðŸ‡³ SAFE SUITE TUNISIE â€” CATALOGUE OFFICIEL DES PROLOGICIELS MÃ‰TIERS
> **Architecture Best-of-Breed MÃ©tier â€¢ Conforme aux Normes SCE, Fiscales & Sociales Tunisiennes**
> *Emplacement : `C:\\Users\\USER\\OneDrive\\Desktop\\SAFE_ERP_DRAFT 4`*

---

## 1. Vision et Architecture Produit

La suite **SAFE Tunisie** est structurÃ©e en une gamme de **Prologiciels MÃ©tiers SpÃ©cialisÃ©s** qui peuvent Ãªtre dÃ©ployÃ©s :
1. **De faÃ§on autonome** par dÃ©partement ou mÃ©tier (Facturation, Paie, RH, Stocks, ComptabilitÃ©).
2. **De faÃ§on intÃ©grÃ©e** partageant le mÃªme socle de donnÃ©es transactionnel temps rÃ©el (PostgreSQL / SQLite).

Chaque prologiciel dispose de son propre rÃ©pertoire dÃ©diÃ© dans `SAFE_ERP_DRAFT 4`, avec son lanceur Windows 1-clic et sa documentation complÃ¨te.

---

## 2. RÃ©pertoire des Prologiciels CrÃ©Ã©s

| RÃ©pertoire | Prologiciel MÃ©tier | Domaine ClÃ© | RÃ©glementation Tunisienne Principale |
| :--- | :--- | :--- | :--- |
| `SAFE_Facturation` | **SAFE Facturation (Achat & Vente)** | Devis, Commandes, Factures, Retenue RS, E-Facture TTN | DÃ©cret 2016-1098, DÃ©cret-loi 2021-21, TVA 19/13/7%, RS 1.5% |
| `SAFE_Gestion_des_Stocks` | **SAFE Gestion des Stocks (MM)** | DÃ©pÃ´ts, Mouvements, PUMP, Inventaires, Douanes | NCT 04, Code des Douanes (AT / ACT) |
| `SAFE_Paie` | **SAFE Paie & Salaires** | Fiches de paie, IRPP, CNSS, FOPROLOS, CSS, DS | BarÃ¨me IRPP 8 tranches, CNSS 9.68%, DÃ©ductions familiales |
| `SAFE_Gestion_RH` | **SAFE Gestion des Ressources Humaines** | Collaborateurs, Contrats CIVP/CDI, CongÃ©s lÃ©gaux | Code du Travail (Loi 66-27), DÃ©crets ANETI |
| `SAFE_Comptabilite_Fiscalite` | **SAFE ComptabilitÃ© & FiscalitÃ©** | Grand Livre, Balance 8 col, G50, IS 20%, Banques | Loi 96-112 (SCE), G50 mensuel, IS 20% |
| `SAFE_Production_GPAO` | **SAFE Production & GPAO** | Nomenclatures BOM, Ordres de fabrication, MRP | Normes INNORPI, NCT 04 |
| `SAFE_Immobilisations` | **SAFE Immobilisations** | Actifs, Amortissements linÃ©aire/dÃ©gressif | NCT 05, BarÃ¨mes DGI |

---

## 3. ModalitÃ©s d'Utilisation

1. **Lancement via le Menu Central** : Double-cliquez sur `MENU_PROLOGICIELS_SAFE.cmd` pour choisir votre prologiciel en un clic.
2. **Lancement direct par mÃ©tier** : Rendez-vous dans le dossier du prologiciel (ex: `SAFE_Facturation`) et lancez `Lancer_SAFE_Facturation.cmd`.

---
*SAFE Suite Tunisie â€¢ Version Entreprise 2026*
""")

    print("âœ” All 7 standalone business prologiciels successfully initialized!")

if __name__ == "__main__":
    create_suite()

