# SAFE Suite — Architecture Multi-Modules, Prologiciels Métiers & Satellites Sectoriels

## 1. Vision d'Architecture Globale

La suite **SAFE ERP** propose une architecture hybride puissante alliant un **ERP Central Intégré** (28 modules sur base synchronisée) et des **Prologiciels Métiers & Satellites Sectoriels Dédiés** conçus pour des déploiements autonomes ou combinés.

L'ensemble de la suite repose sur le patron **Modèle - Vue - Contrôleur (MVC)** renforcé par des **Services Métiers Découplés** (Domain Services).

---

## 2. Cartographie de la Suite

### 2.1 Cœur de l'ERP Central (src/core/)
- **Modèles (src/core/models/)** : Abstraction de persistance via Prisma ORM 6.x (prisma.ts), compatible SQLite et PostgreSQL.
- **Contrôleurs (src/core/controllers/)** : 27 contrôleurs REST modulaires validant les entrées et sécurisant les contextes multi-entités.
- **Services Métiers (src/core/services/)** : Logique métier pure isolée de tout protocole de transport :
  - FiscalService : TVA 19/13/7%, Retenue à la Source (RS), liquidation du timbre 1.000 DT, déclarations G50 et IS.
  - AuditTrailService : Piste d'audit cryptographique et chaînage SHA-256 (JournalEntryAuditChainHead).
  - PayrollService : Moteur de paie tunisienne, barème IRPP progressif 8 tranches, cotisations CNSS 9.68% et CSS 1%.
  - StockService : Suivi multi-dépôts, valorisation PUMP et FIFO, seuils d'alerte.
  - BankingService : Rapprochement bancaire automatisé et réévaluation des devises BCT.
  - ConsolidationService : Élimination des opérations intercompagnies et conversion multi-devises.

### 2.2 Prologiciels Satellites Métiers (satellites_metiers/)
Chaque prologiciel métier dispose de son propre lanceur Windows (.cmd / .ps1) et de sa structure MVC dédiée :
1. **SAFE Facturation** : Achats, Ventes, Facturation électronique TTN (El Fatoora) et Retenues à la Source.
2. **SAFE Gestion des Stocks** : Multi-dépôts, valorisation PUMP, régimes douaniers sous douane et admission temporaire (AT).
3. **SAFE Paie** : Moteur IRPP 8 tranches, cotisations sociales CNSS et CSS, édition des fiches de paie conformes 2026.
4. **SAFE Gestion RH** : Contrats CDI/CDD/CIVP, congés légaux, médecine du travail et GPEC.
5. **SAFE Comptabilité & Fiscalité** : SCE, Grand Livre, Balance 8 colonnes, Déclarations G50 et liasse IS.
6. **SAFE Production GPAO** : Nomenclatures BOM, Ordres de fabrication (OF), gammes et planification MRP.
7. **SAFE Immobilisations** : Amortissements linéaires et dégressifs DGI, gestion des cessions et écritures 681/28x.

### 2.3 Progiciels Satellites Sectoriels (satellites_sectoriels/ & SAFE_ERP_TUNISIE)
Applications autonomes FastAPI avec interface web locale et verrouillage matériel Hardware ID (HMAC-SHA256) :
- **Port 8001** : SAFE Négoce & Distribution Commerciale
- **Port 8002** : SAFE Services, Conseils & Cabinets Libéraux
- **Port 8003** : SAFE Industrie & Production PME
- **Port 8004** : SAFE Restauration & Point de Vente (POS)
- **Port 8005** : SAFE Transport Routier & Colis Express
- **Port 8090** : SAFE CRM Éditeur & Superviseur de Licences Matérielles

---

## 3. Règles d'Architecture Transversales
1. **Design System Unifié** : Cohérence ergonomique sur l'ensemble des modules (thème sombre/clair bleu nuit, police Segoe UI/Calibri, support bilingue et RTL arabe).
2. **Étanchéité Métier** : La logique métier réside exclusivement dans les services, garantissant une testabilité unitaire à 100%.
3. **Intégrité Cryptographique** : Signature SHA-256 des écritures comptables, des flux XML TTN et des sessions utilisateurs.
4. **Conformité Réglementaire 2026** : Respect strict du Système Comptable des Entreprises (SCE) et du corpus fiscal et social tunisien.