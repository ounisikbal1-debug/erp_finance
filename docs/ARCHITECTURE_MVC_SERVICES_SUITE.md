# Architecture MVC et Services Distincts - SAFE ERP Suite

Cette documentation dÃ©crit la restructuration globale de la suite **SAFE ERP** et de **l'ensemble des logiciels satellites (mÃ©tiers et sectoriels)** selon le patron **ModÃ¨le - Vue - ContrÃ´leur (MVC)** appuyÃ© par des **Services MÃ©tiers Distincts**.

---

## 1. SchÃ©ma d'Architecture Global

```mermaid
graph TD
    subgraph Presentation_Layer [Presentation Layer / Vues]
        UI[React 18 / Vite / Tailwind UI]
        WebDist[Web Dist HTML5 / Standalone UI]
    end

    subgraph Controller_Layer [Controller Layer / ContrÃ´leurs]
        API_Ctrl[src/core/controllers/<Module>Controller]
        Sat_Ctrl[satellites_*/controllers/]
        RouterExpress[src/application/server.ts Router Express]
    end

    subgraph Service_Layer [Service Layer / Services MÃ©tiers Distincts]
        CoreServices[src/core/services/<Module>Service]
        FiscalService[Fiscalite & Retenue a la source]
        AuditService[Chaine Audit SHA-256 Immuable]
        CustomsService[Regimes Douaniers & Tarifs]
        SatServices[satellites_*/services/]
    end

    subgraph Model_Layer [Model Layer / Persistance & SchÃ©mas]
        PrismaModel[src/core/models/prisma.ts]
        PrismaClient[(PostgreSQL / SQLite Multi-tenant)]
        LocalDB[(SQLite Local / Hardware Locked DB)]
    end

    UI --> RouterExpress
    WebDist --> Sat_Ctrl
    RouterExpress --> API_Ctrl
    API_Ctrl --> CoreServices
    Sat_Ctrl --> SatServices
    CoreServices --> PrismaModel
    CoreServices --> FiscalService
    CoreServices --> AuditService
    CoreServices --> CustomsService
    SatServices --> LocalDB
    PrismaModel --> PrismaClient
```

---

## 2. DÃ©coupage Organisationnel

### 2.1 CÅ“ur de l'ERP (`src/core/`)
- **ModÃ¨les (`src/core/models/`)** :
  - Centralisation du client Prisma via `src/core/models/prisma.ts`.
  - Abstraction de persistance multi-base (PostgreSQL pour la production, SQLite pour le mode autonome/embarquÃ©).
- **ContrÃ´leurs (`src/core/controllers/`)** :
  - 27 contrÃ´leurs modulaires (`admin`, `finance`, `sales`, `purchases`, `hr`, `materials`, `production`, etc.).
  - Validation des requÃªtes et isolation du contexte utilisateur/entitÃ© (`resolveEntityScope`).
- **Services (`src/core/services/`)** :
  - Logique mÃ©tier pure isolÃ©e de toute dÃ©pendance HTTP.
  - Calculs fiscaux tunisiens (TVA 19/13/7%, retenue Ã  la source, timbres fiscaux, rÃ¨glements).
  - Piste d'audit cryptographique et chaÃ®nage SHA-256.

### 2.2 Logiciels Satellites MÃ©tiers (`satellites_metiers/`)
DÃ©coupÃ©s en `models/`, `services/`, `controllers/` :
1. `SAFE_Comptabilite_Fiscalite` : SCE, Grand Livre, Balance 8 colonnes, DÃ©clarations G50.
2. `SAFE_Facturation` : Devis, Factures, Avoirs, Facturation Ã©lectronique tunisienne.
3. `SAFE_Gestion_des_Stocks` : Multi-dÃ©pÃ´ts, valorisation FIFO/PUMP, inventaires.
4. `SAFE_Gestion_RH` : Suivi collaborateurs, congÃ©s, carriÃ¨res.
5. `SAFE_Immobilisations` : Amortissements linÃ©aires/dÃ©gressifs, cessions.
6. `SAFE_Paie` : Bulletins de paie conformes barÃ¨me IRPP/CNSS 2026.
7. `SAFE_Production_GPAO` : Ordres de fabrication, nomenclatures, gammes.

### 2.3 Progiciels Satellites Sectoriels (`satellites_sectoriels/`)
OrganisÃ©s en architectures MVC FastAPI / Python autonomes (`models/`, `services/`, `controllers/`) :
1. `00_SAFE_CRM_Editeur_Licences` : Gestion des licences et parc clients.
2. `01_SAFE_Negoce_Distribution` : Port 8001 - Ventes B2B, logistique de distribution.
3. `02_SAFE_Services_Cabinets` : Port 8002 - Facturation au temps passÃ©, gestion de dossiers.
4. `03_SAFE_Industrie_Production` : Port 8003 - GPAO avancÃ©e, coÃ»t de revient standard/rÃ©el.
5. `04_SAFE_Restauration_POS` : Port 8004 - Caisse tactile, gestion des tables et stocks frais.
6. `05_SAFE_Transport_Logistique` : Port 8005 - Flotte, feuilles de route, entreposage WMS.

---

## 3. ConformitÃ© et Robustesse
- **VÃ©rification TypeScript** : Compilation complÃ¨te rÃ©ussie sans erreurs via `npx tsc --noEmit`.
- **RÃ©trocompatibilitÃ©** : PrÃ©servation des points de montage et routes d'API existantes pour les interfaces React.
- **SÃ©curitÃ©** : Validation d'intÃ©gritÃ© HMAC-SHA256 et verrouillage matÃ©riel Hardware-ID sur les exÃ©cutables autonomes.
