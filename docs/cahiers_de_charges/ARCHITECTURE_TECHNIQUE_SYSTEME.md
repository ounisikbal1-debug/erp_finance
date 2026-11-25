
SAFE ERP â€¢ SYSTÃˆME Dâ€™ANALYSE FINANCIÃˆRE DES ENTREPRISES
Version 2.0 â€¢ Normes Tunisiennes & Multi-Pays
Date dâ€™arrÃªtÃ© : 18 Novembre 2026


DOCUMENT D'ARCHITECTURE TECHNIQUE (DAT)
Dossier d'Architecture Technique & Logicielle
Stack TypeScript, Express, React 19, Prisma, E-Facture TTN, SÃ©curitÃ© RBAC & Normes SCE


| ðŸ“Œ VALIDATION OFFICIELLE EXPERT-COMPTABLE : Ce document atteste de la validation rigoureuse des rÃ¨gles fiscales, comptables (SCE), sociales, de facturation Ã©lectronique (TTN El Fatoora / TunTrust) et des flux bancaires de SAFE ERP, validÃ©s conformÃ©ment Ã  la lÃ©gislation tunisienne par lâ€™expert-comptable du projet. |
| --- |



# 1. Architecture Globale du SystÃ¨me


SAFE ERP repose sur une architecture 3-tiers modulaire, hautement dÃ©couplÃ©e et sÃ©curisÃ©e, conÃ§ue pour garantir une performance optimale, une intÃ©gritÃ© transactionnelle absolue et une conformitÃ© rigoureuse aux standards financiers.


| Couche Applicative | Technologies & Librairies | RÃ´le & ResponsabilitÃ© | SÃ©curitÃ© & Performance |
| --- | --- | --- | --- |
| Frontend UI / SPA | React 19, TypeScript, Vite, TailwindCSS | Interface de gestion responsive, thÃ¨me Comex sombre/clair, RTL Arabe, Panel TTN | 0 bundle bloquant, build 1.14s |
| Backend API REST | Node.js 20+, Express, TypeScript, scrypt | 28 modules mÃ©tiers Ã©tanches, middleware RBAC, contrÃ´le SoD, service TTN | Ã‰coute loopback 127.0.0.1 stricte |
| Couche ORM / Persistance | Prisma 6.x, SQLite (Local Dev) / PostgreSQL (Prod) | 131 tables relationnelles, 81 migrations versionnÃ©es | Transactions ACID au millime |
| Facturation Ã‰lectronique TTN | XML UBL 2.1, CEV 2D-Doc, TunTrust PKI (X.509) | Plateforme nationale El Fatoora, signature et horodatage certifiÃ© | InviolabilitÃ© SHA-256 & AgrÃ©ment TTN |
| Moteur Cryptographique | SHA-256 chain, HMAC-SHA256 tokens, scrypt | Sessions infalsifiables, audit trail immuable des journaux | Secrets >= 32 octets obligatoires |
| Moteur Multilingue | Moteur custom localization.ts (FR, EN, AR) | Traductions exhaustives, bascule dynamique dir='rtl' | 100 % couverture labels mÃ©tiers |
| GÃ©nÃ©ration Documentaire | ExcelJS, PptxGenJS, PDF Print Engine | Exports classeurs multi-onglets, plaquettes financiÃ¨res | GÃ©nÃ©ration native sans dÃ©pendance cloud |



# 2. Architecture du Module E-Facture Tunisienne (El Fatoora)


Le module E-Facture (`src/application/modules/sales/tunisian-e-invoice.ts`) gÃ¨re le cycle de vie complet de la facture dÃ©matÃ©rialisÃ©e conformÃ©ment aux exigences de Tunisie TradeNet :


â€¢ GÃ©nÃ©ration UBL 2.1 : Extraction des mÃ©tadonnÃ©es de la facture de vente (entitÃ© Ã©mettrice, client, matricule fiscal, TVA 19/13/7%, timbre 1 DT) et structuration sous format XML standardisÃ© OASIS UBL 2.1 Invoice.


â€¢ Calcul du Condensat SHA-256 : Hachage cryptographique du corps XML garantissant la non-altÃ©ration du document.


â€¢ Cachet Ã‰lectronique Visible (CEV / 2D-Doc) : GÃ©nÃ©ration de l'en-tÃªte normalisÃ© `CEV01` contenant : Matricule Ã©metteur (MF), Matricule client, NÂ° facture, Date d'Ã©mission, Montants HT, TVA, Timbre, Total TTC et empreinte de sÃ©curitÃ© Base64.


â€¢ Signature NumÃ©rique TunTrust : Application du certificat X.509 de l'entreprise avec clÃ© privÃ©e RSA-SHA256.


â€¢ TÃ©lÃ©transmission TTN : Envoi du flux XML via les passerelles d'interconnexion sÃ©curisÃ©es de Tunisie TradeNet, rÃ©cupÃ©ration de l'accusÃ© de rÃ©ception et affectation du numÃ©ro d'agrÃ©ment officiel.


# 3. ModÃ¨le de DonnÃ©es & Tables ClÃ©s


Le schÃ©ma de base de donnÃ©es comprend 131 tables organisÃ©es en domaines fonctionnels Ã©tanches :


â€¢ Domaine Facturation Ã‰lectronique : TunisianEInvoice (id, invoiceId, entityId, ttnReference, status, xmlPayload, sha256Hash, qrCodeData, signatureDigest, submissionDate, responseDate, rejectionReason).


â€¢ Domaine Comptable & TrÃ©sorerie : ChartOfAccount, JournalEntry, JournalLine, BankAccount, BankStatement, BankStatementLine, BankReconciliation, CashflowPayment, CashflowAccountingMapping.


â€¢ Domaine Ventes & Clients : Customer, CustomerContact, SalesQuote, SalesOrder, Invoice, InvoiceItem, SalesInvoiceWorkflowEvent.


â€¢ Domaine Achats & Fournisseurs : Vendor, PurchaseOrder, PurchaseOrderLine, PurchaseInvoice, PurchaseInvoiceLine, SupplierCreditNote, PurchaseInvoiceWorkflowEvent.


â€¢ Domaine Stocks & Production : Material, MaterialWarehouseStock, Warehouse, StockMovement, ProductionOrder, BillOfMaterial.


â€¢ Domaine FiscalitÃ© & RÃ©glementaire : CountryProfile, CountryTaxRate, CountryTaxRule, CountryTaxThreshold, TaxDeclarationWorkpaper, WithholdingCertificate.


â€¢ Domaine RH & Paie : Employee, LeaveRequest, PayrollConfig, PayrollRubrique, PayrollTaxBracket, HrDocumentMetadata.


â€¢ Domaine SÃ©curitÃ© & Audit : User, AuthSession, AdminUserEvent, JournalEntryAuditChainHead, JournalEntryAuditRecord.


# 4. Points d'EntrÃ©e API REST (E-Facturation & Ventes)


Le module de facturation Ã©lectronique expose les endpoints REST sÃ©curisÃ©s suivants :


â€¢ GET /api/sales/e-invoices?entityId=:id : Liste et mÃ©tadonnÃ©es des e-factures Ã©mises pour une filiale.


â€¢ GET /api/sales/e-invoices/:id : Consultation dÃ©taillÃ©e d'une e-facture (statut TTN, CEV, empreintes).


â€¢ GET /api/sales/e-invoices/:id/xml : Flux brut XML UBL 2.1 tÃ©lÃ©chargeable au standard TTN.


â€¢ POST /api/sales/e-invoices/generate/:invoiceId : GÃ©nÃ©ration du document XML UBL et du CEV.


â€¢ POST /api/sales/e-invoices/:id/sign : Signature cryptographique par certificat TunTrust.


â€¢ POST /api/sales/e-invoices/:id/submit-ttn : Soumission et obtention de l'agrÃ©ment TTN.


â€¢ POST /api/sales/e-invoices/bulk-generate : GÃ©nÃ©ration, signature et transmission par lots.
