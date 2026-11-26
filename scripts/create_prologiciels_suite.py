import os, sys, json

BASE_DIR = r"C:\Users\USER\OneDrive\Desktop\SAFE_ERP_DRAFT 4"
CORE_ERP_DIR = os.path.join(BASE_DIR, "SAFE_Grandes_Entreprises")

PROLOGICIELS = [
    {
        "folder": "SAFE_Facturation",
        "app_id": "facturation",
        "name": "SAFE Facturation (Achat & Vente)",
        "tagline": "Facturation achats/ventes, conformité TTN El Fatoora, retenues à la source RS, créances & dettes",
        "badge": "TTN & TVA Tunisienne",
        "icon": "🧾",
        "version": "1.0.0",
        "accent": "#E11D48",
        "modules": ["sales", "purchases", "tunisianEInvoices", "agedReceivables", "agedPayables", "taxation", "reportsExport"],
        "default_module": "sales",
        "legislation": [
            "Décret n° 2016-1098 et Décret-loi n° 2021-21 (Facturation Électronique Nationale El Fatoora / TTN)",
            "Code de la Taxe sur la Valeur Ajoutée (TVA) : Taux de 19 %, 13 %, 7 % et 0 %",
            "Droit de Timbre Fiscal légal de 1,000 DT par facture client (Article 432)",
            "Article 52 du Code de l'IRPP et de l'IS : Retenue à la Source (RS) de 1.5 % sur marchés et achats >= 1000 DT TTC, 0.5 % et 15 % sur honoraires",
            "Système Comptable des Entreprises (SCE) - Norme NCT 03 (Revenus des activités ordinaires)"
        ],
        "features": [
            "Émission de devis et bons de commande clients convertibles en factures en un clic",
            "Facturation des ventes avec ventilation automatique des taux de TVA tunisiens (19%, 13%, 7%, 0%)",
            "Facturation des achats et lettrage 3-way matching avec bons de commande et réceptions",
            "Module Facturation Électronique Tunisienne (El Fatoora) homologué Tunisie TradeNet (TTN)",
            "Génération de flux XML conformes au standard international OASIS UBL 2.1 Invoice",
            "Signature électronique qualifiée TunTrust PKI (certificat X.509 délivré par l'ANCE)",
            "Cachet Électronique Visible (CEV / 2D-Doc) avec QR Code haute densité pour contrôle DGI",
            "Génération et émission automatique des certificats de Retenue à la Source (RS) pour les fournisseurs",
            "Suivi rigoureux du délai moyen de paiement (DSO) et balance âgée des créances clients",
            "Gestion des échéanciers fournisseurs et évitement des pénalités de retard"
        ]
    },
    {
        "folder": "SAFE_Gestion_des_Stocks",
        "app_id": "stocks",
        "name": "SAFE Gestion des Stocks & Entrepôts (MM)",
        "tagline": "Entrepôts multi-dépôts, mouvements, inventaires, valorisation PUMP, régimes douaniers AT/ACT",
        "badge": "PUMP & Douane AT/ACT",
        "icon": "📦",
        "version": "1.0.0",
        "accent": "#0D9488",
        "modules": ["stocks", "mrpPlanning", "customsRegimes", "purchases", "reportsExport"],
        "default_module": "stocks",
        "legislation": [
            "Norme Comptable Tunisienne NCT 04 : Évaluation des stocks au Coût Moyen Unitaire Pondéré (PUMP / CMP)",
            "Code des Douanes Tunisien : Régimes suspensifs d'Admission Temporaire (AT) et d'Amélioration Active (ACT)",
            "Loi de Finances : Règles de traçabilité des flux de marchandises et inventaire physique annuel obligatoire",
            "Arrêtés ministériels relatifs aux cautions et garanties bancaires douanières"
        ],
        "features": [
            "Gestion multi-magasins, dépôts régionaux et plateformes logistiques tunisiennes",
            "Fichier articles avec références internes, codes-barres EAN13 et unités de conditionnement",
            "Enregistrement atomique des mouvements : Réceptions achats, Sorties fabrication, Retours et Transferts inter-dépôts",
            "Calcul automatisé en temps réel du Prix Unitaire Moyen Pondéré (PUMP / CMP) au millime",
            "Gestion des inventaires tournants et annuels avec calcul et justification des écarts d'inventaire",
            "Registre réglementaire d'Admission Temporaire (AT / ACT) sous contrôle des services douaniers tunisiens",
            "Suivi des cautions douanières bancaires et comptes d'apurement à l'exportation",
            "Planification des Besoins Matières (MRP) et alertes automatiques de réapprovisionnement sur seuils minimaux"
        ]
    },
    {
        "folder": "SAFE_Paie",
        "app_id": "paie",
        "name": "SAFE Paie Tunisienne & Déclarations Sociales",
        "tagline": "Moteur de paie tunisien, barème IRPP 8 tranches, CNSS 9.68%, FOPROLOS, CSS & fiches de paie",
        "badge": "IRPP & CNSS 2026",
        "icon": "💵",
        "version": "1.0.0",
        "accent": "#16A34A",
        "modules": ["payrollEngine", "hrDeep", "hrWorkflows", "reportsExport"],
        "default_module": "payrollEngine",
        "legislation": [
            "Loi de Finances : Barème progressif légal de l'IRPP à 8 tranches",
            "Déductions familiales légales : 300 DT pour chef de famille, 100 DT par enfant à charge (jusqu'à 4 enfants)",
            "Législation de Sécurité Sociale : Cotisation CNSS salariale à 9.68 % et part patronale à 16.57 % (secteur non-agricole)",
            "Loi n° 77-54 créant le Fonds de Promotion du Logement pour les Salariés (FOPROLOS) : Taux de 1 %",
            "Loi de Finances : Contribution Sociale de Solidarité (CSS) à 0.5 % pour le financement des caisses de retraite",
            "Accords paritaires et conventions collectives sectorielles tunisiennes (grilles de salaires minima)"
        ],
        "features": [
            "Moteur de calcul de paie haute précision au millime tunisien (3 décimales)",
            "Génération en un clic des bulletins de paie mensuels normalisés",
            "Calcul instantané du salaire brut au salaire net et simulation inverse (Net vers Brut)",
            "Calcul automatisé des heures supplémentaires bonifiées selon le Code du travail tunisien (25%, 50%, 100%)",
            "Édition du Livre de Paie mensuel conforme aux obligations de l'Inspection du Travail",
            "Préparation et télétransmission de la Déclaration Trimestrielle des Salaires CNSS (DS)",
            "Gestion des avances sur salaires, acomptes et prêts entreprise avec retenue sur paie",
            "Comptabilisation automatique des écritures de paie (Salaires 641, CNSS 434, IRPP 432)"
        ]
    },
    {
        "folder": "SAFE_Gestion_RH",
        "app_id": "rh",
        "name": "SAFE Gestion des Ressources Humaines & Talents",
        "tagline": "Dossiers collaborateurs, contrats CDI/CDD/CIVP, suivi congés légaux, médecine du travail & GPEC",
        "badge": "Code du Travail Tunisien",
        "icon": "👔",
        "version": "1.0.0",
        "accent": "#6366F1",
        "modules": ["hrDeep", "hrWorkflows", "hrTraining", "quality", "reportsExport"],
        "default_module": "hrDeep",
        "legislation": [
            "Code du Travail Tunisien (Loi n° 66-27 modifiée) régissant les contrats et conditions de travail",
            "Réglementation ANETI pour les contrats d'insertion professionnelle (CIVP / SIVP, CAIP, Contrat Karama)",
            "Articles 112 et suivants du Code du Travail : Droit au congé payé (1 jour par mois + bonifications d'ancienneté)",
            "Décrets fixant la liste officielle des jours fériés chômés et payés en République Tunisienne",
            "Réglementation relative à la Médecine du Travail et à la Prévention des Risques Professionnels"
        ],
        "features": [
            "Dossier collaborateur dématérialisé (Identité, CIN, Matricule CNSS, Diplômes, Pièces jointes)",
            "Gestion du cycle de vie des contrats de travail : Période d'essai, CDI, CDD et conventions ANETI (CIVP)",
            "Module de demande et validation dématérialisée des congés payés avec calcul automatique des droits",
            "Calendrier officiel des jours fériés nationaux et religieux tunisiens avec calcul des ponts",
            "Suivi de la Médecine du Travail (visites d'embauche, visites périodiques, attestations d'aptitude)",
            "Cartographie des compétences, évaluation annuelle des performances et plans de formation (GPEC)",
            "Édition automatique d'attestations de travail, certificats d'emploi et soldes de tout compte",
            "Registre du personnel légal et archivage sécurisé des sanctions, promotions et avenants"
        ]
    },
    {
        "folder": "SAFE_Comptabilite_Fiscalite",
        "app_id": "comptabilite",
        "name": "SAFE Comptabilité Générale & Fiscalité Tunisienne",
        "tagline": "Système Comptable des Entreprises (SCE), Grand Livre, Balance 8 colonnes, Déclarations G50, Rapprochement bancaire",
        "badge": "SCE & Liasse Fiscale G50",
        "icon": "⚖️",
        "version": "1.0.0",
        "accent": "#1E3A8A",
        "modules": ["generalBalance", "generalLedger", "accountingEntry", "taxation", "financialStatements", "bankReconciliation", "assetsManagement", "cashflow", "monthlyClose", "controlling", "anomalies", "incomeStatement", "reportsExport"],
        "default_module": "generalBalance",
        "legislation": [
            "Loi n° 96-112 relative au Système Comptable des Entreprises (SCE) et normes comptables tunisiennes (NCT)",
            "Plan de comptes officiel tunisien (Classes 1 à 7) avec tenue des écritures en partie double",
            "Code des Droits et Procédures Fiscaux (CDPF) : Déclaration mensuelle d'impôt G50 avant le 28 de chaque mois",
            "Code de l'IRPP et de l'IS : Taux normal d'Impôt sur les Sociétés de 20 % (Loi de Finances)",
            "Normes internationales d'audit (ISA) : Piste d'audit immuable et irréversibilité des écritures closes"
        ],
        "features": [
            "Saisie comptable horizontale ergonomique et journaux auxiliaires (Achats, Ventes, Banque, Caisse, OD)",
            "Balance Générale des Comptes à 8 colonnes (Balances d'ouverture, Mouvements débit/crédit, Soldes de clôture)",
            "Grand Livre Général (GL) dynamique avec filtrage par compte, période, lettrage et devise",
            "Rapprochement bancaire multi-banques tunisiennes (STB, BIAT, BH Bank, BNA, Attijariwafa, UIB)",
            "Génération automatique des liasses fiscales mensuelles Déclaration G50 (TVA, Timbre, RS)",
            "Calcul et déclaration de l'Impôt sur les Sociétés (IS) au taux légal de 20 % avec acomptes provisionnels",
            "Immutabilité et protection des périodes clôturées (interdiction absolue d'écritures antidatées)",
            "Piste d'audit cryptographique continue scellée par hachage SHA-256 (JournalEntryAuditChainHead)"
        ]
    },
    {
        "folder": "SAFE_Production_GPAO",
        "app_id": "production",
        "name": "SAFE Production Industrielle & GPAO",
        "tagline": "Nomenclatures BOM, Ordres de Fabrication (OF), Planification MRP & Maintenance des équipements",
        "badge": "Industrie & GPAO",
        "icon": "⚙️",
        "version": "1.0.0",
        "accent": "#D97706",
        "modules": ["activities", "mrpPlanning", "stocks", "maintenance", "quality", "reportsExport"],
        "default_module": "activities",
        "legislation": [
            "Normes Tunisiennes homologuées (INNORPI) relatives aux procédés industriels et à la traçabilité de production",
            "Norme Comptable Tunisienne NCT 04 : Évaluation et valorisation des produits en cours et des produits finis",
            "Réglementation de la sécurité des équipements industriels et registres de maintenance obligatoire"
        ],
        "features": [
            "Gestion des nomenclatures de fabrication multi-niveaux (Bill of Materials - BOM)",
            "Création, ordonnancement et suivi d'avancement des Ordres de Fabrication (OF)",
            "Calcul des Besoins Nets (MRP) synchronisé avec les stocks de composants et les commandes clients",
            "Imputation précise des temps machines, coûts de main-d'œuvre et frais généraux d'atelier",
            "Gestion de la maintenance assistée par ordinateur (GMAO) : Parc machines, compteurs, interventions préventives/curatives",
            "Module Qualité & CAPA : Déclaration de non-conformités, fiches de rebuts et plans d'actions correctives"
        ]
    },
    {
        "folder": "SAFE_Immobilisations",
        "app_id": "comptabilite",
        "name": "SAFE Immobilisations & Amortissements",
        "tagline": "Gestion des actifs corporels/incorporels, tableaux d'amortissement linéaire/dégressif, écritures d'inventaire",
        "badge": "Barèmes Fiscaux DGI",
        "icon": "🏢",
        "version": "1.0.0",
        "accent": "#7C3AED",
        "modules": ["assetsManagement", "generalBalance", "generalLedger", "financialStatements", "reportsExport"],
        "default_module": "assetsManagement",
        "legislation": [
            "Norme Comptable Tunisienne NCT 05 relative aux immobilisations corporelles",
            "Barèmes des taux d'amortissement fiscalement admis par la Direction Générale des Impôts (DGI tunisienne)",
            "Règles d'amortissement linéaire (constat constant prorata temporis) et dégressif prévu par le Code de l'IRPP/IS"
        ],
        "features": [
            "Fichier exhaustif des immobilisations avec code barre d'inventaire, localisation et centre de coût",
            "Plans d'amortissement prévisionnels automatiques calculés au prorata temporis exact",
            "Application des taux d'amortissement légaux : Bâtiments (5%), Matériel industriel (10%-20%), Informatique (33.3%)",
            "Génération en un clic des écritures comptables annuelles de dotation aux amortissements (681 / 28x)",
            "Gestion des cessions, mises au rebut et calcul des plus-values ou moins-values fiscales de cession",
            "Édition du tableau d'inventaire physique des immobilisations conforme aux exigences des commissaires aux comptes"
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
> *Conformité certifiée : {prolog['badge']} • Version {prolog['version']}*

---

## 1. Présentation du Prologiciel

**{prolog['name']}** est un progiciel vertical dédié, conçu pour répondre avec une précision absolue aux exigences opérationnelles, comptables et fiscales des entreprises établies en **République Tunisienne**.

Il fonctionne de manière entièrement autonome pour les équipes opérationnelles tout en restant nativement synchronisé avec le noyau sécurisé **SAFE ERP**, garantissant l'intégrité transactionnelle globale de l'organisation.

---

## 2. Cadre Réglementaire & Fiscal Tunisien

{legs}

---

## 3. Fonctionnalités Clés Livrées

{feats}

---

## 4. Démarrage Rapide

Double-cliquez simplement sur le fichier exécutable suivant situé dans ce répertoire :

```bat
Lancer_{prolog['folder']}.cmd
```

Le progiciel démarre immédiatement en local sur votre poste et ouvre votre navigateur Web directement dans votre environnement de travail dédié.

---

*SAFE Suite Tunisie • Système d'Analyse Financière des Entreprises • Normes Tunisiennes & Internationales*
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
echo   [1] 🧾 SAFE Facturation           (Achats, Ventes, E-Facture TTN, Retenue RS)
echo   [2] 📦 SAFE Gestion des Stocks    (Multi-Depots, Valorisation PUMP, Douanes AT)
echo   [3] 💵 SAFE Paie Tunisie          (Moteur IRPP 8 tranches, CNSS 9.68%%, CSS)
echo   [4] 👔 SAFE Gestion RH            (Contrats CDI/CDD/CIVP, Conges Legaux, GPEC)
echo   [5] ⚖️ SAFE Comptabilite          (SCE, Balance 8 col, Declarations G50, IS)
echo   [6] ⚙️ SAFE Production GPAO       (Nomenclatures BOM, Ordres OF, MRP)
echo   [7] 🏢 SAFE Immobilisations       (Amortissements Lineaires & Degressifs DGI)
echo.
echo   [8] 🌐 SAFE ERP Global            (Suite Complete Integree - 28 Modules)
echo   [0] ❌ Quitter
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
        f.write("""# 🇹🇳 SAFE SUITE TUNISIE — CATALOGUE OFFICIEL DES PROLOGICIELS MÉTIERS
> **Architecture Best-of-Breed Métier • Conforme aux Normes SCE, Fiscales & Sociales Tunisiennes**
> *Emplacement : `C:\\Users\\USER\\OneDrive\\Desktop\\SAFE_ERP_DRAFT 4`*

---

## 1. Vision et Architecture Produit

La suite **SAFE Tunisie** est structurée en une gamme de **Prologiciels Métiers Spécialisés** qui peuvent être déployés :
1. **De façon autonome** par département ou métier (Facturation, Paie, RH, Stocks, Comptabilité).
2. **De façon intégrée** partageant le même socle de données transactionnel temps réel (PostgreSQL / SQLite).

Chaque prologiciel dispose de son propre répertoire dédié dans `SAFE_ERP_DRAFT 4`, avec son lanceur Windows 1-clic et sa documentation complète.

---

## 2. Répertoire des Prologiciels Créés

| Répertoire | Prologiciel Métier | Domaine Clé | Réglementation Tunisienne Principale |
| :--- | :--- | :--- | :--- |
| `SAFE_Facturation` | **SAFE Facturation (Achat & Vente)** | Devis, Commandes, Factures, Retenue RS, E-Facture TTN | Décret 2016-1098, Décret-loi 2021-21, TVA 19/13/7%, RS 1.5% |
| `SAFE_Gestion_des_Stocks` | **SAFE Gestion des Stocks (MM)** | Dépôts, Mouvements, PUMP, Inventaires, Douanes | NCT 04, Code des Douanes (AT / ACT) |
| `SAFE_Paie` | **SAFE Paie & Salaires** | Fiches de paie, IRPP, CNSS, FOPROLOS, CSS, DS | Barème IRPP 8 tranches, CNSS 9.68%, Déductions familiales |
| `SAFE_Gestion_RH` | **SAFE Gestion des Ressources Humaines** | Collaborateurs, Contrats CIVP/CDI, Congés légaux | Code du Travail (Loi 66-27), Décrets ANETI |
| `SAFE_Comptabilite_Fiscalite` | **SAFE Comptabilité & Fiscalité** | Grand Livre, Balance 8 col, G50, IS 20%, Banques | Loi 96-112 (SCE), G50 mensuel, IS 20% |
| `SAFE_Production_GPAO` | **SAFE Production & GPAO** | Nomenclatures BOM, Ordres de fabrication, MRP | Normes INNORPI, NCT 04 |
| `SAFE_Immobilisations` | **SAFE Immobilisations** | Actifs, Amortissements linéaire/dégressif | NCT 05, Barèmes DGI |

---

## 3. Modalités d'Utilisation

1. **Lancement via le Menu Central** : Double-cliquez sur `MENU_PROLOGICIELS_SAFE.cmd` pour choisir votre prologiciel en un clic.
2. **Lancement direct par métier** : Rendez-vous dans le dossier du prologiciel (ex: `SAFE_Facturation`) et lancez `Lancer_SAFE_Facturation.cmd`.

---
*SAFE Suite Tunisie • Version Entreprise 2026*
""")

    print("✔ All 7 standalone business prologiciels successfully initialized!")

if __name__ == "__main__":
    create_suite()

