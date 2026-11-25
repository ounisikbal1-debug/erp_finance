
SAFE ERP â€¢ SUITE MÃ‰TIER TUNISIE
Normes Comptables SCE & RÃ©glementation Fiscale Tunisienne
ArrÃªtÃ© de validation : 18 Novembre 2026


PROLOGICIEL MÃ‰TIER â€¢ FACTURATION & FISCALITÃ‰ VENTES/ACHATS
SAFE Facturation (Achat & Vente)
Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation E-Facture TTN & SCE


| VALIDATION OFFICIELLE EXPERT-COMPTABLE â€” Dossier technique, fonctionnel et opÃ©rationnel exhaustif regroupant l'Architecture logicielle, le Cahier des charges conforme Ã  la lÃ©gislation tunisienne et le Manuel d'utilisation pas-Ã -pas. |
| --- |



# Partie I : Architecture Technique & Logicielle DÃ©taillÃ©e


Le prologiciel SAFE Facturation (Achat & Vente) repose sur une architecture dÃ©couplÃ©e, performante et sÃ©curisÃ©e, conÃ§ue pour un dÃ©ploiement autonome ou en synergie directe avec le socle central SAFE ERP. Cette architecture garantit une parfaite Ã©tanchÃ©itÃ© des donnÃ©es tout en maintenant l'intÃ©gritÃ© transactionnelle globale.


| Composant | Technologie | RÃ´le & DÃ©tails Techniques |
| --- | --- | --- |
| Frontend UI | React 19, TypeScript, TailwindCSS | Interface de facturation temps rÃ©el, visualiseur XML UBL, modal CEV/QR |
| Backend API | Node.js 20+, Express REST, crypto | Endpoints /api/sales, /api/purchases, /api/sales/e-invoices, middleware RBAC |
| Base de DonnÃ©es | SQLite (Local) / PostgreSQL (Prod) | Tables : Invoice, InvoiceItem, TunisianEInvoice, PurchaseInvoice, Vendor, Customer |
| Moteur Cryptographique | SHA-256, TunTrust PKI (X.509) | Scellement d'intÃ©gritÃ© SHA-256 et signature numÃ©rique qualifiÃ©e ANCE |
| Standard de Flux | OASIS UBL 2.1 Invoice XML | Conforme au profil national d'interopÃ©rabilitÃ© Tunisie TradeNet (TTN) |



## 1.1 SÃ©curitÃ©, ContrÃ´le d'AccÃ¨s & InviolabilitÃ©


L'accÃ¨s au prologiciel est gouvernÃ© par une matrice de contrÃ´le RBAC (Role-Based Access Control) stricte. Chaque opÃ©ration d'Ã©criture, de validation ou d'Ã©mission est horodatÃ©e et attribuÃ©e Ã  un acteur certifiÃ©. Les donnÃ©es sensibles (salaires, donnÃ©es personnelles, coordonnÃ©es bancaires) sont cloisonnÃ©es au niveau applicatif.


# Partie II : Cahier des Charges Fonctionnel & LÃ©gislation Tunisienne


Ce prologiciel a Ã©tÃ© conÃ§u et paramÃ©trÃ© pour respecter Ã  100 % le corpus juridique, fiscal et comptable en vigueur en RÃ©publique Tunisienne. L'ensemble des rÃ¨gles et formules de calcul a Ã©tÃ© auditÃ© et validÃ© par l'expert-comptable du projet :


â€¢ ConformitÃ© DÃ©cret nÂ° 2016-1098 & DÃ©cret-loi nÂ° 2021-21 : Ã‰mission et archivage probant des factures Ã©lectroniques El Fatoora.


â€¢ Taux de TVA tunisiens : 19 % (taux standard), 13 % (prestations de services qualifiÃ©es), 7 % (matiÃ¨res et Ã©quipements) et 0 % (exportations).


â€¢ Droit de Timbre Fiscal : 1,000 DT obligatoire par facture client Ã©mise (compte 432).


â€¢ Retenue Ã  la Source (RS) : 1,5 % sur tout marchÃ© et achat supÃ©rieur ou Ã©gal Ã  1 000 DT TTC (Art. 52 Code IRPP/IS), 0,5 % et 15 % sur honoraires.


â€¢ Workflow de validation Ã  sÃ©paration des tÃ¢ches (SoD) : DRAFT -> TO_REVIEW -> APPROVED -> ISSUED -> PAID.


# Partie III : Mode de Fonctionnement & Guide Utilisateur Pas-Ã -Pas


Ce guide opÃ©ratoire dÃ©taille les flux de travail standard et les bonnes pratiques d'exploitation au quotidien :


## 1. CrÃ©ation d'un Devis & Bon de Commande Client


AccÃ©der au sous-menu 'Devis & Commandes'. Renseigner le client, la date d'Ã©chÃ©ance et les lignes d'articles. Le systÃ¨me calcule automatiquement le sous-total HT, la TVA selon le taux de l'article, et le timbre fiscal de 1 DT. Valider le bon de commande.


## 2. Ã‰mission d'une Facture de Vente


Cliquer sur 'Nouvelle Facture' ou convertir un bon de commande. Le statut passe Ã  TO_REVIEW. Un rÃ©viseur habilitÃ© valide la conformitÃ© comptable (APPROVED), puis l'agent de facturation Ã©met la facture (ISSUED). L'Ã©criture comptable client (411 au DÃ©bit / 701 et 4367 au CrÃ©dit) est immÃ©diatement gÃ©nÃ©rÃ©e.


## 3. GÃ©nÃ©ration & Transmission E-Facture TTN (El Fatoora)


Dans l'onglet 'E-Factures TTN (El Fatoora)', cliquer sur 'GÃ©nÃ©rer Tout & TTN' ou sur l'action individuelle. Le systÃ¨me gÃ©nÃ¨re le XML UBL 2.1, calcule le hash SHA-256, appose le certificat TunTrust et tÃ©lÃ©transmet le flux Ã  TTN. L'accusÃ© de rÃ©ception TTN (ex: TTN-2026-000184) et le CEV 2D-Doc sont gÃ©nÃ©rÃ©s.


## 4. Saisie des Factures d'Achat & Rapprochement 3-Way


Dans 'Achats & Fournisseurs', saisir la facture fournisseur reÃ§ue. Indiquer le bon de commande d'origine et le bon de rÃ©ception magasin. Si le montant TTC est >= 1 000 DT, le systÃ¨me gÃ©nÃ¨re automatiquement le certificat de Retenue Ã  la Source (RS).


## 5. Suivi des Encaissements, DÃ©caissements & Lettrage


Lors de la rÃ©ception du virement ou du chÃ¨que bancaire, enregistrer l'encaissement. La facture passe au statut PAID et les Ã©critures de lettrage au compte 411/532 sont Ã©quilibrÃ©es.
