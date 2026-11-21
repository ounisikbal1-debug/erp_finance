# SAFE ERP - Architecture et fonctions de gestion intégrées

> **Document historique et non contractuel.** Ses descriptions de modules, instructions de démarrage, comptes de démonstration et chiffres de test ne constituent pas l’état vérifié de la version actuelle. Suivez [README.md](README.md) et les guides sous `docs/`; aucun mot de passe prédéfini ne doit être utilisé.

## 🚀 Démarrage en 1 Clic (Windows)

Double-cliquez simplement sur le fichier :
- **`LANCER_SAFE_ERP.bat`** (ou exécutez `.\run-safe.ps1` dans PowerShell).

Le script :
1. Initialise l'environnement local; une clé temporaire aléatoire est créée uniquement pour une écoute sur la machine locale.
2. Refuse de démarrer si les ports requis sont déjà utilisés; il n'arrête pas d'autres processus.
3. Démarre l'API Backend Express (port `3000`) et le serveur Frontend Vite (port `5176`).
4. Ouvre automatiquement votre navigateur sur **`http://localhost:5176`** (ou `http://localhost:3000`).

---

## 🏛️ Fonctions de gestion de l’entreprise

SAFE ERP regroupe quatre domaines de gestion de l’entreprise :

### 1. 🏢 Immobilisations SAFE / Gestion des immobilisations (Immobilisations & Amortissements)
- **Fiches d'immobilisations** : Catégories SCE (Constructions, Matériel industriel, Matériel de transport, Informatique, Mobilier).
- **Plans d'amortissement prévisionnels automatiques** : Calcul linéaire prorata temporis, amortissements cumulés et VNC.
- **Comptabilisation automatique dans le Grand Livre** : Génération des écritures de dotation annuelle (Débit 6811x / Crédit 281x) scellées dans la chaîne d'audit immuable SHA-256.
- **Sortie d'actif (Cession / Mise au rebut)** : Calcul automatique des plus-values (compte 756) ou moins-values (compte 656) de cession.

### 2. 📊 Contrôle analytique SAFE / Analyse de rentabilité (Centres de Profit & Répartition Analytique)
- **Segmentation IFRS 8** : Affectation des activités par centres de profit (Marché Local, Export Union Européenne, Atelier Industriel).
- **Moteur de cycles de répartition secondaire** : Déversement des frais généraux et charges indirectes (DSI, RH, Direction) vers les centres opérationnels de profit au prorata du chiffre d'affaires ou des effectifs.
- **Compte de Résultat de Gestion (P&L Analytique)** : Calcul de la marge brute, des charges imputées et de la rentabilité opérationnelle nette (EBIT) par segment.

### 3. ⚙️ Planification SAFE / Planification de la production (Calcul des Besoins Nets & MRP I / II)
- **Explosion multi-niveaux des nomenclatures (BOM)** : Lien automatique entre produits finis fabriqués et matières premières / composants achetés.
- **Moteur de planification des besoins nets** : Prise en compte du stock disponible, du stock de sécurité, des commandes clients fermes et des livraisons fournisseurs en cours.
- **Génération de suggestions d'approvisionnement** : Création automatique de Demandes d'Achat (DA) et d'Ordres de Fabrication (OF) avec respect des tailles de lot économiques et délais de réapprovisionnement.

### 4. 🛡️ Gouvernance SAFE / Gouvernance interne (Séparation des Tâches SoD & Contrôle Interne)
- **Matrice SoD (Segregation of Duties)** : Détection proactive des combinaisons toxiques (ex: Création RIB Fournisseur vs Émission de Virement Bancaire, Saisie Journal vs Clôture d'Exercice).
- **Contrôle Interne COSO / SOX** : Journal d'audit et remédiation des conflits de privilèges en temps réel.
- **Matrice des pouvoirs de signature & seuils de délégation** : Paliers financiers automatiques (Opérationnel N+1 <= 5 kDT, DAF <= 50 kDT, Direction Générale > 50 kDT).

---

## 🔐 Comptes utilisateurs

Ce document contenait des identifiants de démonstration qui ne doivent pas être utilisés. Le lanceur ne crée aucun compte. Créez les comptes avec des mots de passe propres à l'installation en suivant [README.md](README.md).

---

## 🇹🇳 Données Métier & Localisation Tunisienne Intégrée

La base opérationnelle (`src/data/data.db`) est entièrement alimentée :
- **Plan Comptable Général Tunisien (SCE)** : Classes 1 à 7 complètes.
- **Régime Fiscal & TVA** : 19%, 13%, 7%, et 0% (export), timbre fiscal (1,000 DT), IS (20%).
- **Réglementation Paie & RH Tunisienne** : CNSS (9,68%), FOPROLOS (1,00%), CSS (0,50%), IRPP à 8 tranches, déductions familiales.
- **Chaîne d'Audit Immuable SHA-256** : Traçabilité inviolable des écritures comptables postées.
- **Référentiel Tiers & Stocks** : Clients, Fournisseurs, Entrepôts, Articles avec niveaux de stocks initiaux et banques (BH Bank, BIAT).

---

## 🧪 Statut des Tests & Qualité Logicielle

- **Compilation TypeScript (`tsc --noEmit`)** : 0 erreur sur l'ensemble des fichiers backend et frontend.
- **Build de Production Vite (`npm run build`)** : 125 modules transformés, bundle de production prêt dans `dist/`.
- **Suites de Pré-validation (`npm run pretest`)** : 18 suites de tests / 100% de succès.
- **Suites des Piliers Entreprise (FI-AA, CO-OM, PP-MRP, GRC)** : 4 suites dédiées / 9 tests passés avec 100% de succès.
- **Test Opérationnel en Direct** : Validé avec succès via `src/scripts/verify-operational-status.ts`.
