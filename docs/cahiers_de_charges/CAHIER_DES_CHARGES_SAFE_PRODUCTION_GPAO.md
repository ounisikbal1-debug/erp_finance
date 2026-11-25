
SAFE ERP â€¢ SUITE MÃ‰TIER TUNISIE
Normes Comptables SCE & RÃ©glementation Fiscale Tunisienne
ArrÃªtÃ© de validation : 18 Novembre 2026


PROLOGICIEL MÃ‰TIER â€¢ GPAO, MRP & MAINTENANCE D'USINE
SAFE Production Industrielle & GPAO
Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Nomenclatures, OF & MRP


| VALIDATION OFFICIELLE EXPERT-COMPTABLE â€” Dossier technique, fonctionnel et opÃ©rationnel exhaustif regroupant l'Architecture logicielle, le Cahier des charges conforme Ã  la lÃ©gislation tunisienne et le Manuel d'utilisation pas-Ã -pas. |
| --- |



# Partie I : Architecture Technique & Logicielle DÃ©taillÃ©e


Le prologiciel SAFE Production Industrielle & GPAO repose sur une architecture dÃ©couplÃ©e, performante et sÃ©curisÃ©e, conÃ§ue pour un dÃ©ploiement autonome ou en synergie directe avec le socle central SAFE ERP. Cette architecture garantit une parfaite Ã©tanchÃ©itÃ© des donnÃ©es tout en maintenant l'intÃ©gritÃ© transactionnelle globale.


| Composant | Technologie | RÃ´le & DÃ©tails Techniques |
| --- | --- | --- |
| Frontend UI | React 19, Gestion visuelle d'ateliers | Suivi des ordres de fabrication (OF), arbres de nomenclature BOM, planning MRP |
| Backend API | Node.js Express, Service Production & MRP | Endpoints /api/production, /api/mrp, calcul des besoins nets et valorisation des en-cours |
| Base de DonnÃ©es | Prisma ORM, SQLite / PostgreSQL | Tables : ProductionOrder, BillOfMaterial, BillOfMaterialItem, EquipmentMaintenance |
| Normes Industrielles | Normes INNORPI & NCT 04 | Ã‰valuation des produits en-cours et valorisation au coÃ»t de production standard/rÃ©el |
| IntÃ©gration Stocks | DÃ©crÃ©mentation Atomique des Composants | DÃ©stockage automatique des matiÃ¨res premiÃ¨res lors de la dÃ©claration d'achÃ¨vement OF |



## 1.1 SÃ©curitÃ©, ContrÃ´le d'AccÃ¨s & InviolabilitÃ©


L'accÃ¨s au prologiciel est gouvernÃ© par une matrice de contrÃ´le RBAC (Role-Based Access Control) stricte. Chaque opÃ©ration d'Ã©criture, de validation ou d'Ã©mission est horodatÃ©e et attribuÃ©e Ã  un acteur certifiÃ©. Les donnÃ©es sensibles (salaires, donnÃ©es personnelles, coordonnÃ©es bancaires) sont cloisonnÃ©es au niveau applicatif.


# Partie II : Cahier des Charges Fonctionnel & LÃ©gislation Tunisienne


Ce prologiciel a Ã©tÃ© conÃ§u et paramÃ©trÃ© pour respecter Ã  100 % le corpus juridique, fiscal et comptable en vigueur en RÃ©publique Tunisienne. L'ensemble des rÃ¨gles et formules de calcul a Ã©tÃ© auditÃ© et validÃ© par l'expert-comptable du projet :


â€¢ Gestion des nomenclatures de fabrication multi-niveaux (Bill of Materials - BOM) avec coefficients de pertes.


â€¢ TraÃ§abilitÃ© ascendante et descendante des lots de fabrication conformÃ©ment aux exigences de certification ISO 9001.


â€¢ Calcul des Besoins Nets (MRP) synchronisÃ© avec les commandes clients et les dÃ©lais fournisseurs.


â€¢ RÃ©gularisation comptable obligatoire de la variation des en-cours de production (compte 713).


â€¢ Suivi de la maintenance prÃ©ventive et curative des machines de production pour Ã©viter les arrÃªts d'atelier.


# Partie III : Mode de Fonctionnement & Guide Utilisateur Pas-Ã -Pas


Ce guide opÃ©ratoire dÃ©taille les flux de travail standard et les bonnes pratiques d'exploitation au quotidien :


## 1. CrÃ©ation des Nomenclatures (BOM)


DÃ©finir la fiche du produit fini et ajouter les composants requis (matiÃ¨res premiÃ¨res, consommables, emballages) avec les quantitÃ©s unitaires et pourcentages de pertes tolÃ©rÃ©s.


## 2. Lancement des Ordres de Fabrication (OF)


GÃ©nÃ©rer un ordre de fabrication pour une quantitÃ© donnÃ©e. Le systÃ¨me vÃ©rifie la disponibilitÃ© des matiÃ¨res en stock et rÃ©serve les composants.


## 3. Suivi d'Atelier & Gammes OpÃ©ratoires


Pointer les heures machines et les heures de main-d'Å“uvre directe sur chaque poste de charge (dÃ©coupe, assemblage, conditionnement).


## 4. ClÃ´ture de l'OF & EntrÃ©e en Stock Produits Finis


Ã€ l'achÃ¨vement du lot, valider la dÃ©claration de production. Le stock de produits finis est automatiquement incrÃ©mentÃ© au coÃ»t de revient rÃ©el, et les stocks de matiÃ¨res sont dÃ©crÃ©mentÃ©s.


## 5. Maintenance PrÃ©ventive des Ã‰quipements


Programmer les entretiens pÃ©riodiques des machines selon les compteurs d'heures ou le calendrier, et consigner les interventions curatives.
