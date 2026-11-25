# SAFE ERP - Architecture et fonctions de gestion intÃ©grÃ©es

> **Document historique et non contractuel.** Ses descriptions de modules, instructions de dÃ©marrage, comptes de dÃ©monstration et chiffres de test ne constituent pas lâ€™Ã©tat vÃ©rifiÃ© de la version actuelle. Suivez [README.md](README.md) et les guides sous `docs/`; aucun mot de passe prÃ©dÃ©fini ne doit Ãªtre utilisÃ©.

## ðŸš€ DÃ©marrage en 1 Clic (Windows)

Double-cliquez simplement sur le fichier :
- **`LANCER_SAFE_ERP.bat`** (ou exÃ©cutez `.\run-safe.ps1` dans PowerShell).

Le script :
1. Initialise l'environnement local; une clÃ© temporaire alÃ©atoire est crÃ©Ã©e uniquement pour une Ã©coute sur la machine locale.
2. Refuse de dÃ©marrer si les ports requis sont dÃ©jÃ  utilisÃ©s; il n'arrÃªte pas d'autres processus.
3. DÃ©marre l'API Backend Express (port `3000`) et le serveur Frontend Vite (port `5176`).
4. Ouvre automatiquement votre navigateur sur **`http://localhost:5176`** (ou `http://localhost:3000`).

---

## ðŸ›ï¸ Fonctions de gestion de lâ€™entreprise

SAFE ERP regroupe quatre domaines de gestion de lâ€™entreprise :

### 1. ðŸ¢ Immobilisations SAFE / Gestion des immobilisations (Immobilisations & Amortissements)
- **Fiches d'immobilisations** : CatÃ©gories SCE (Constructions, MatÃ©riel industriel, MatÃ©riel de transport, Informatique, Mobilier).
- **Plans d'amortissement prÃ©visionnels automatiques** : Calcul linÃ©aire prorata temporis, amortissements cumulÃ©s et VNC.
- **Comptabilisation automatique dans le Grand Livre** : GÃ©nÃ©ration des Ã©critures de dotation annuelle (DÃ©bit 6811x / CrÃ©dit 281x) scellÃ©es dans la chaÃ®ne d'audit immuable SHA-256.
- **Sortie d'actif (Cession / Mise au rebut)** : Calcul automatique des plus-values (compte 756) ou moins-values (compte 656) de cession.

### 2. ðŸ“Š ContrÃ´le analytique SAFE / Analyse de rentabilitÃ© (Centres de Profit & RÃ©partition Analytique)
- **Segmentation IFRS 8** : Affectation des activitÃ©s par centres de profit (MarchÃ© Local, Export Union EuropÃ©enne, Atelier Industriel).
- **Moteur de cycles de rÃ©partition secondaire** : DÃ©versement des frais gÃ©nÃ©raux et charges indirectes (DSI, RH, Direction) vers les centres opÃ©rationnels de profit au prorata du chiffre d'affaires ou des effectifs.
- **Compte de RÃ©sultat de Gestion (P&L Analytique)** : Calcul de la marge brute, des charges imputÃ©es et de la rentabilitÃ© opÃ©rationnelle nette (EBIT) par segment.

### 3. âš™ï¸ Planification SAFE / Planification de la production (Calcul des Besoins Nets & MRP I / II)
- **Explosion multi-niveaux des nomenclatures (BOM)** : Lien automatique entre produits finis fabriquÃ©s et matiÃ¨res premiÃ¨res / composants achetÃ©s.
- **Moteur de planification des besoins nets** : Prise en compte du stock disponible, du stock de sÃ©curitÃ©, des commandes clients fermes et des livraisons fournisseurs en cours.
- **GÃ©nÃ©ration de suggestions d'approvisionnement** : CrÃ©ation automatique de Demandes d'Achat (DA) et d'Ordres de Fabrication (OF) avec respect des tailles de lot Ã©conomiques et dÃ©lais de rÃ©approvisionnement.

### 4. ðŸ›¡ï¸ Gouvernance SAFE / Gouvernance interne (SÃ©paration des TÃ¢ches SoD & ContrÃ´le Interne)
- **Matrice SoD (Segregation of Duties)** : DÃ©tection proactive des combinaisons toxiques (ex: CrÃ©ation RIB Fournisseur vs Ã‰mission de Virement Bancaire, Saisie Journal vs ClÃ´ture d'Exercice).
- **ContrÃ´le Interne COSO / SOX** : Journal d'audit et remÃ©diation des conflits de privilÃ¨ges en temps rÃ©el.
- **Matrice des pouvoirs de signature & seuils de dÃ©lÃ©gation** : Paliers financiers automatiques (OpÃ©rationnel N+1 <= 5 kDT, DAF <= 50 kDT, Direction GÃ©nÃ©rale > 50 kDT).

---

## ðŸ” Comptes utilisateurs

Ce document contenait des identifiants de dÃ©monstration qui ne doivent pas Ãªtre utilisÃ©s. Le lanceur ne crÃ©e aucun compte. CrÃ©ez les comptes avec des mots de passe propres Ã  l'installation en suivant [README.md](README.md).

---

## ðŸ‡¹ðŸ‡³ DonnÃ©es MÃ©tier & Localisation Tunisienne IntÃ©grÃ©e

La base opÃ©rationnelle (`src/data/data.db`) est entiÃ¨rement alimentÃ©e :
- **Plan Comptable GÃ©nÃ©ral Tunisien (SCE)** : Classes 1 Ã  7 complÃ¨tes.
- **RÃ©gime Fiscal & TVA** : 19%, 13%, 7%, et 0% (export), timbre fiscal (1,000 DT), IS (20%).
- **RÃ©glementation Paie & RH Tunisienne** : CNSS (9,68%), FOPROLOS (1,00%), CSS (0,50%), IRPP Ã  8 tranches, dÃ©ductions familiales.
- **ChaÃ®ne d'Audit Immuable SHA-256** : TraÃ§abilitÃ© inviolable des Ã©critures comptables postÃ©es.
- **RÃ©fÃ©rentiel Tiers & Stocks** : Clients, Fournisseurs, EntrepÃ´ts, Articles avec niveaux de stocks initiaux et banques (BH Bank, BIAT).

---

## ðŸ§ª Statut des Tests & QualitÃ© Logicielle

- **Compilation TypeScript (`tsc --noEmit`)** : 0 erreur sur l'ensemble des fichiers backend et frontend.
- **Build de Production Vite (`npm run build`)** : 125 modules transformÃ©s, bundle de production prÃªt dans `dist/`.
- **Suites de PrÃ©-validation (`npm run pretest`)** : 18 suites de tests / 100% de succÃ¨s.
- **Suites des Piliers Entreprise (FI-AA, CO-OM, PP-MRP, GRC)** : 4 suites dÃ©diÃ©es / 9 tests passÃ©s avec 100% de succÃ¨s.
- **Test OpÃ©rationnel en Direct** : ValidÃ© avec succÃ¨s via `src/scripts/verify-operational-status.ts`.
