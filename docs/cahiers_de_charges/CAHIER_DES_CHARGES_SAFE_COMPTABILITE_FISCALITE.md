
SAFE ERP â€¢ SUITE MÃ‰TIER TUNISIE
Normes Comptables SCE & RÃ©glementation Fiscale Tunisienne
ArrÃªtÃ© de validation : 18 Novembre 2026


PROLOGICIEL MÃ‰TIER â€¢ NORMES COMPTABLES SCE & LIASSES FISCALES
SAFE ComptabilitÃ© GÃ©nÃ©rale & FiscalitÃ© Tunisienne
Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation SCE, G50 & IS 20%


| VALIDATION OFFICIELLE EXPERT-COMPTABLE â€” Dossier technique, fonctionnel et opÃ©rationnel exhaustif regroupant l'Architecture logicielle, le Cahier des charges conforme Ã  la lÃ©gislation tunisienne et le Manuel d'utilisation pas-Ã -pas. |
| --- |



# Partie I : Architecture Technique & Logicielle DÃ©taillÃ©e


Le prologiciel SAFE ComptabilitÃ© GÃ©nÃ©rale & FiscalitÃ© Tunisienne repose sur une architecture dÃ©couplÃ©e, performante et sÃ©curisÃ©e, conÃ§ue pour un dÃ©ploiement autonome ou en synergie directe avec le socle central SAFE ERP. Cette architecture garantit une parfaite Ã©tanchÃ©itÃ© des donnÃ©es tout en maintenant l'intÃ©gritÃ© transactionnelle globale.


| Composant | Technologie | RÃ´le & DÃ©tails Techniques |
| --- | --- | --- |
| Frontend UI | React 19, Grilles comptables haute performance | Saisie horizontale, Balance 8 colonnes, Grand Livre interactif, DÃ©clarations G50 |
| Backend API | Node.js Express, Service Finance & Tax | Endpoints /api/finance, /api/tax-declarations, validation stricte DÃ©bit = CrÃ©dit |
| Base de DonnÃ©es | Prisma ORM, SQLite / PostgreSQL | Tables : ChartOfAccount, JournalEntry, JournalLine, TaxDeclarationWorkpaper, BankAccount |
| Audit & SÃ©curitÃ© | ChaÃ®ne Cryptographique SHA-256 | InviolabilitÃ© des journaux par table JournalEntryAuditChainHead |
| ClÃ´ture PÃ©riodique | Verrouillage Temporel HermÃ©tique | Interdiction d'insertion ou modification sur pÃ©riodes closes (MonthlyCloseLock) |



## 1.1 SÃ©curitÃ©, ContrÃ´le d'AccÃ¨s & InviolabilitÃ©


L'accÃ¨s au prologiciel est gouvernÃ© par une matrice de contrÃ´le RBAC (Role-Based Access Control) stricte. Chaque opÃ©ration d'Ã©criture, de validation ou d'Ã©mission est horodatÃ©e et attribuÃ©e Ã  un acteur certifiÃ©. Les donnÃ©es sensibles (salaires, donnÃ©es personnelles, coordonnÃ©es bancaires) sont cloisonnÃ©es au niveau applicatif.


# Partie II : Cahier des Charges Fonctionnel & LÃ©gislation Tunisienne


Ce prologiciel a Ã©tÃ© conÃ§u et paramÃ©trÃ© pour respecter Ã  100 % le corpus juridique, fiscal et comptable en vigueur en RÃ©publique Tunisienne. L'ensemble des rÃ¨gles et formules de calcul a Ã©tÃ© auditÃ© et validÃ© par l'expert-comptable du projet :


â€¢ ConformitÃ© absolue Ã  la Loi nÂ° 96-112 portant promulgation du SystÃ¨me Comptable des Entreprises (SCE tunisien).


â€¢ Plan de comptes standard tunisien (Classes 1 Ã  7) avec tenue des Ã©critures en partie double Ã©quilibrÃ©es au millime.


â€¢ DÃ©claration Fiscale Mensuelle G50 obligatoire avant le 28 de chaque mois (TVA collectÃ©e, TVA dÃ©ductible, Droit de timbre, Retenue Ã  la source).


â€¢ ImpÃ´t sur les SociÃ©tÃ©s (IS) au taux normal lÃ©gal de 20 % calculÃ© sur le rÃ©sultat fiscal annuel.


â€¢ RÃ¨gle de sÃ©paration des tÃ¢ches (SoD) : Interdiction pour un utilisateur de valider ou poster une Ã©criture dont il est l'auteur.


â€¢ ImmutabilitÃ© lÃ©gale : Une fois un journal clÃ´turÃ©, aucune Ã©criture antidatÃ©e ne peut Ãªtre insÃ©rÃ©e ni modifiÃ©e.


# Partie III : Mode de Fonctionnement & Guide Utilisateur Pas-Ã -Pas


Ce guide opÃ©ratoire dÃ©taille les flux de travail standard et les bonnes pratiques d'exploitation au quotidien :


## 1. Plan Comptable & Journaux Auxiliaires


Consulter le plan de comptes officiel tunisien prÃ©configurÃ©. CrÃ©er les journaux nÃ©cessaires (Achats ACH, Ventes VEN, Banque BQ, Caisse CA, OpÃ©rations Diverses OD).


## 2. Saisie Comptable Horizontale Rapide


Dans le module 'Saisie Comptable Horizontale', renseigner la date, le journal, le numÃ©ro de piÃ¨ce et le libellÃ©. Ajouter les lignes de comptes. Le systÃ¨me vÃ©rifie en temps rÃ©el que Total DÃ©bit = Total CrÃ©dit avant d'autoriser l'enregistrement.


## 3. Consultation du Grand Livre & Lettrage


Filtrer le Grand Livre par compte (ex: 411 Clients ou 401 Fournisseurs) et par pÃ©riode. Effectuer le lettrage manuel ou automatique des rÃ¨glements avec les factures correspondantes.


## 4. Balance GÃ©nÃ©rale des Comptes Ã  8 Colonnes


Ã‰diter la balance gÃ©nÃ©rale Ã  8 colonnes : Solde DÃ©biteur/CrÃ©diteur d'ouverture, Mouvements DÃ©bit/CrÃ©dit du mois, Cumuls Mouvements, Soldes DÃ©biteurs/CrÃ©diteurs de clÃ´ture.


## 5. Rapprochement Bancaire (STB, BIAT, BH, BNA)


Importer les relevÃ©s bancaires. Rapprocher les lignes du relevÃ© bancaire avec les Ã©critures du compte 532. Le systÃ¨me calcule l'Ã©tat de rapprochement exact et dÃ©tecte les chÃ¨ques en circulation.


## 6. PrÃ©paration de la DÃ©claration Fiscale G50


Ã€ la fin de chaque mois, ouvrir le panneau 'DÃ©clarations Fiscales (G50)'. Le systÃ¨me consolide automatiquement la TVA collectÃ©e (19%, 13%, 7%), la TVA dÃ©ductible, le timbre fiscal et les retenues Ã  la source. L'expert-comptable valide et approuve la dÃ©claration.
