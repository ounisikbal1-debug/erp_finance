# SAFE Suite â€” Architecture Multi-Modules, Prologiciels MÃ©tiers & Satellites Sectoriels

## 1. Vision d'Architecture Globale

La suite **SAFE ERP** propose une architecture hybride puissante alliant un **ERP Central IntÃ©grÃ©** (28 modules sur base synchronisÃ©e) et des **Prologiciels MÃ©tiers & Satellites Sectoriels DÃ©diÃ©s** conÃ§us pour des dÃ©ploiements autonomes ou combinÃ©s.

L'ensemble de la suite repose sur le patron **ModÃ¨le - Vue - ContrÃ´leur (MVC)** renforcÃ© par des **Services MÃ©tiers DÃ©couplÃ©s** (Domain Services).

---

## 2. Cartographie de la Suite

### 2.1 CÅ“ur de l'ERP Central (src/core/)
- **ModÃ¨les (src/core/models/)** : Abstraction de persistance via Prisma ORM 6.x (prisma.ts), compatible SQLite et PostgreSQL.
- **ContrÃ´leurs (src/core/controllers/)** : 27 contrÃ´leurs REST modulaires validant les entrÃ©es et sÃ©curisant les contextes multi-entitÃ©s.
- **Services MÃ©tiers (src/core/services/)** : Logique mÃ©tier pure isolÃ©e de tout protocole de transport :
  - FiscalService : TVA 19/13/7%, Retenue Ã  la Source (RS), liquidation du timbre 1.000 DT, dÃ©clarations G50 et IS.
  - AuditTrailService : Piste d'audit cryptographique et chaÃ®nage SHA-256 (JournalEntryAuditChainHead).
  - PayrollService : Moteur de paie tunisienne, barÃ¨me IRPP progressif 8 tranches, cotisations CNSS 9.68% et CSS 1%.
  - StockService : Suivi multi-dÃ©pÃ´ts, valorisation PUMP et FIFO, seuils d'alerte.
  - BankingService : Rapprochement bancaire automatisÃ© et rÃ©Ã©valuation des devises BCT.
  - ConsolidationService : Ã‰limination des opÃ©rations intercompagnies et conversion multi-devises.

### 2.2 Prologiciels Satellites MÃ©tiers (satellites_metiers/)
Chaque prologiciel mÃ©tier dispose de son propre lanceur Windows (.cmd / .ps1) et de sa structure MVC dÃ©diÃ©e :
1. **SAFE Facturation** : Achats, Ventes, Facturation Ã©lectronique TTN (El Fatoora) et Retenues Ã  la Source.
2. **SAFE Gestion des Stocks** : Multi-dÃ©pÃ´ts, valorisation PUMP, rÃ©gimes douaniers sous douane et admission temporaire (AT).
3. **SAFE Paie** : Moteur IRPP 8 tranches, cotisations sociales CNSS et CSS, Ã©dition des fiches de paie conformes 2026.
4. **SAFE Gestion RH** : Contrats CDI/CDD/CIVP, congÃ©s lÃ©gaux, mÃ©decine du travail et GPEC.
5. **SAFE ComptabilitÃ© & FiscalitÃ©** : SCE, Grand Livre, Balance 8 colonnes, DÃ©clarations G50 et liasse IS.
6. **SAFE Production GPAO** : Nomenclatures BOM, Ordres de fabrication (OF), gammes et planification MRP.
7. **SAFE Immobilisations** : Amortissements linÃ©aires et dÃ©gressifs DGI, gestion des cessions et Ã©critures 681/28x.

### 2.3 Progiciels Satellites Sectoriels (satellites_sectoriels/ & SAFE_ERP_TUNISIE)
Applications autonomes FastAPI avec interface web locale et verrouillage matÃ©riel Hardware ID (HMAC-SHA256) :
- **Port 8001** : SAFE NÃ©goce & Distribution Commerciale
- **Port 8002** : SAFE Services, Conseils & Cabinets LibÃ©raux
- **Port 8003** : SAFE Industrie & Production PME
- **Port 8004** : SAFE Restauration & Point de Vente (POS)
- **Port 8005** : SAFE Transport Routier & Colis Express
- **Port 8090** : SAFE CRM Ã‰diteur & Superviseur de Licences MatÃ©rielles

---

## 3. RÃ¨gles d'Architecture Transversales
1. **Design System UnifiÃ©** : CohÃ©rence ergonomique sur l'ensemble des modules (thÃ¨me sombre/clair bleu nuit, police Segoe UI/Calibri, support bilingue et RTL arabe).
2. **Ã‰tanchÃ©itÃ© MÃ©tier** : La logique mÃ©tier rÃ©side exclusivement dans les services, garantissant une testabilitÃ© unitaire Ã  100%.
3. **IntÃ©gritÃ© Cryptographique** : Signature SHA-256 des Ã©critures comptables, des flux XML TTN et des sessions utilisateurs.
4. **ConformitÃ© RÃ©glementaire 2026** : Respect strict du SystÃ¨me Comptable des Entreprises (SCE) et du corpus fiscal et social tunisien.
