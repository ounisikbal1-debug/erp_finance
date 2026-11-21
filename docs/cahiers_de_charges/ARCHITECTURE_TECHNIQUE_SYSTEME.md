
SAFE ERP • SYSTÈME D’ANALYSE FINANCIÈRE DES ENTREPRISES
Version 2.0 • Normes Tunisiennes & Multi-Pays
Date d’arrêté : 18 Novembre 2026


DOCUMENT D'ARCHITECTURE TECHNIQUE (DAT)
Dossier d'Architecture Technique & Logicielle
Stack TypeScript, Express, React 19, Prisma, E-Facture TTN, Sécurité RBAC & Normes SCE


| 📌 VALIDATION OFFICIELLE EXPERT-COMPTABLE : Ce document atteste de la validation rigoureuse des règles fiscales, comptables (SCE), sociales, de facturation électronique (TTN El Fatoora / TunTrust) et des flux bancaires de SAFE ERP, validés conformément à la législation tunisienne par l’expert-comptable du projet. |
| --- |



# 1. Architecture Globale du Système


SAFE ERP repose sur une architecture 3-tiers modulaire, hautement découplée et sécurisée, conçue pour garantir une performance optimale, une intégrité transactionnelle absolue et une conformité rigoureuse aux standards financiers.


| Couche Applicative | Technologies & Librairies | Rôle & Responsabilité | Sécurité & Performance |
| --- | --- | --- | --- |
| Frontend UI / SPA | React 19, TypeScript, Vite, TailwindCSS | Interface de gestion responsive, thème Comex sombre/clair, RTL Arabe, Panel TTN | 0 bundle bloquant, build 1.14s |
| Backend API REST | Node.js 20+, Express, TypeScript, scrypt | 28 modules métiers étanches, middleware RBAC, contrôle SoD, service TTN | Écoute loopback 127.0.0.1 stricte |
| Couche ORM / Persistance | Prisma 6.x, SQLite (Local Dev) / PostgreSQL (Prod) | 131 tables relationnelles, 81 migrations versionnées | Transactions ACID au millime |
| Facturation Électronique TTN | XML UBL 2.1, CEV 2D-Doc, TunTrust PKI (X.509) | Plateforme nationale El Fatoora, signature et horodatage certifié | Inviolabilité SHA-256 & Agrément TTN |
| Moteur Cryptographique | SHA-256 chain, HMAC-SHA256 tokens, scrypt | Sessions infalsifiables, audit trail immuable des journaux | Secrets >= 32 octets obligatoires |
| Moteur Multilingue | Moteur custom localization.ts (FR, EN, AR) | Traductions exhaustives, bascule dynamique dir='rtl' | 100 % couverture labels métiers |
| Génération Documentaire | ExcelJS, PptxGenJS, PDF Print Engine | Exports classeurs multi-onglets, plaquettes financières | Génération native sans dépendance cloud |



# 2. Architecture du Module E-Facture Tunisienne (El Fatoora)


Le module E-Facture (`src/application/modules/sales/tunisian-e-invoice.ts`) gère le cycle de vie complet de la facture dématérialisée conformément aux exigences de Tunisie TradeNet :


• Génération UBL 2.1 : Extraction des métadonnées de la facture de vente (entité émettrice, client, matricule fiscal, TVA 19/13/7%, timbre 1 DT) et structuration sous format XML standardisé OASIS UBL 2.1 Invoice.


• Calcul du Condensat SHA-256 : Hachage cryptographique du corps XML garantissant la non-altération du document.


• Cachet Électronique Visible (CEV / 2D-Doc) : Génération de l'en-tête normalisé `CEV01` contenant : Matricule émetteur (MF), Matricule client, N° facture, Date d'émission, Montants HT, TVA, Timbre, Total TTC et empreinte de sécurité Base64.


• Signature Numérique TunTrust : Application du certificat X.509 de l'entreprise avec clé privée RSA-SHA256.


• Télétransmission TTN : Envoi du flux XML via les passerelles d'interconnexion sécurisées de Tunisie TradeNet, récupération de l'accusé de réception et affectation du numéro d'agrément officiel.


# 3. Modèle de Données & Tables Clés


Le schéma de base de données comprend 131 tables organisées en domaines fonctionnels étanches :


• Domaine Facturation Électronique : TunisianEInvoice (id, invoiceId, entityId, ttnReference, status, xmlPayload, sha256Hash, qrCodeData, signatureDigest, submissionDate, responseDate, rejectionReason).


• Domaine Comptable & Trésorerie : ChartOfAccount, JournalEntry, JournalLine, BankAccount, BankStatement, BankStatementLine, BankReconciliation, CashflowPayment, CashflowAccountingMapping.


• Domaine Ventes & Clients : Customer, CustomerContact, SalesQuote, SalesOrder, Invoice, InvoiceItem, SalesInvoiceWorkflowEvent.


• Domaine Achats & Fournisseurs : Vendor, PurchaseOrder, PurchaseOrderLine, PurchaseInvoice, PurchaseInvoiceLine, SupplierCreditNote, PurchaseInvoiceWorkflowEvent.


• Domaine Stocks & Production : Material, MaterialWarehouseStock, Warehouse, StockMovement, ProductionOrder, BillOfMaterial.


• Domaine Fiscalité & Réglementaire : CountryProfile, CountryTaxRate, CountryTaxRule, CountryTaxThreshold, TaxDeclarationWorkpaper, WithholdingCertificate.


• Domaine RH & Paie : Employee, LeaveRequest, PayrollConfig, PayrollRubrique, PayrollTaxBracket, HrDocumentMetadata.


• Domaine Sécurité & Audit : User, AuthSession, AdminUserEvent, JournalEntryAuditChainHead, JournalEntryAuditRecord.


# 4. Points d'Entrée API REST (E-Facturation & Ventes)


Le module de facturation électronique expose les endpoints REST sécurisés suivants :


• GET /api/sales/e-invoices?entityId=:id : Liste et métadonnées des e-factures émises pour une filiale.


• GET /api/sales/e-invoices/:id : Consultation détaillée d'une e-facture (statut TTN, CEV, empreintes).


• GET /api/sales/e-invoices/:id/xml : Flux brut XML UBL 2.1 téléchargeable au standard TTN.


• POST /api/sales/e-invoices/generate/:invoiceId : Génération du document XML UBL et du CEV.


• POST /api/sales/e-invoices/:id/sign : Signature cryptographique par certificat TunTrust.


• POST /api/sales/e-invoices/:id/submit-ttn : Soumission et obtention de l'agrément TTN.


• POST /api/sales/e-invoices/bulk-generate : Génération, signature et transmission par lots.
