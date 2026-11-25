
SAFE ERP â€¢ SUITE MÃ‰TIER TUNISIE
Normes Comptables SCE & RÃ©glementation Fiscale Tunisienne
ArrÃªtÃ© de validation : 18 Novembre 2026


PROLOGICIEL MÃ‰TIER â€¢ ACTIFS FISCAUX & AMORTISSEMENTS DGI
SAFE Immobilisations & Amortissements
Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Amortissements Fiscaux DGI


| VALIDATION OFFICIELLE EXPERT-COMPTABLE â€” Dossier technique, fonctionnel et opÃ©rationnel exhaustif regroupant l'Architecture logicielle, le Cahier des charges conforme Ã  la lÃ©gislation tunisienne et le Manuel d'utilisation pas-Ã -pas. |
| --- |



# Partie I : Architecture Technique & Logicielle DÃ©taillÃ©e


Le prologiciel SAFE Immobilisations & Amortissements repose sur une architecture dÃ©couplÃ©e, performante et sÃ©curisÃ©e, conÃ§ue pour un dÃ©ploiement autonome ou en synergie directe avec le socle central SAFE ERP. Cette architecture garantit une parfaite Ã©tanchÃ©itÃ© des donnÃ©es tout en maintenant l'intÃ©gritÃ© transactionnelle globale.


| Composant | Technologie | RÃ´le & DÃ©tails Techniques |
| --- | --- | --- |
| Frontend UI | React 19, Tableaux d'amortissement interactifs | Fichier des immobilisations, simulations d'amortissement linÃ©aire/dÃ©gressif, inventaire |
| Backend API | Node.js Express, Service Assets | Endpoints /api/assets, calcul automatique prorata temporis et dotations 681/28x |
| Base de DonnÃ©es | Prisma ORM, SQLite / PostgreSQL | Tables : FixedAsset, AssetDepreciationLine, AssetCategory, ChartOfAccount |
| Cadre RÃ©glementaire | Norme Comptable NCT 05 & DGI | Application des taux d'amortissement fiscalement admis par l'administration tunisienne |



## 1.1 SÃ©curitÃ©, ContrÃ´le d'AccÃ¨s & InviolabilitÃ©


L'accÃ¨s au prologiciel est gouvernÃ© par une matrice de contrÃ´le RBAC (Role-Based Access Control) stricte. Chaque opÃ©ration d'Ã©criture, de validation ou d'Ã©mission est horodatÃ©e et attribuÃ©e Ã  un acteur certifiÃ©. Les donnÃ©es sensibles (salaires, donnÃ©es personnelles, coordonnÃ©es bancaires) sont cloisonnÃ©es au niveau applicatif.


# Partie II : Cahier des Charges Fonctionnel & LÃ©gislation Tunisienne


Ce prologiciel a Ã©tÃ© conÃ§u et paramÃ©trÃ© pour respecter Ã  100 % le corpus juridique, fiscal et comptable en vigueur en RÃ©publique Tunisienne. L'ensemble des rÃ¨gles et formules de calcul a Ã©tÃ© auditÃ© et validÃ© par l'expert-comptable du projet :


â€¢ ConformitÃ© Ã  la Norme Comptable Tunisienne NCT 05 relative aux immobilisations corporelles et incorporelles.


â€¢ Calcul d'amortissement linÃ©aire selon la rÃ¨gle du prorata temporis (calcul au jour le jour Ã  compter de la date de mise en service).


â€¢ Taux d'amortissement fiscaux standards tunisiens : BÃ¢timents d'exploitation (5%), Agencements et installations (10%), MatÃ©riel et outillage (10% Ã  20%), MatÃ©riel de transport (20%), MatÃ©riel informatique et logiciels (33,33%).


â€¢ Comptabilisation automatique des dotations annuelles aux amortissements : DÃ©bit 6815 / CrÃ©dit 28x.


â€¢ Traitement fiscal des cessions : Calcul des plus-values ou moins-values de cession (Prix de cession - Valeur Nette Comptable).


# Partie III : Mode de Fonctionnement & Guide Utilisateur Pas-Ã -Pas


Ce guide opÃ©ratoire dÃ©taille les flux de travail standard et les bonnes pratiques d'exploitation au quotidien :


## 1. CrÃ©ation d'une Fiche d'Immobilisation


Renseigner la dÃ©signation du bien, la catÃ©gorie fiscale, la date d'acquisition, la date de mise en service, la valeur d'origine HT et le fournisseur.


## 2. Choix de la MÃ©thode & du Taux d'Amortissement


SÃ©lectionner la mÃ©thode (LinÃ©aire ou DÃ©gressif) et le taux fiscal admis (ex: 20% sur 5 ans pour un vÃ©hicule utilitaire).


## 3. GÃ©nÃ©ration du Tableau d'Amortissement PrÃ©visionnel


Le systÃ¨me gÃ©nÃ¨re automatiquement l'Ã©chÃ©ancier complet annÃ©e par annÃ©e avec l'annuitÃ© d'amortissement, le cumul des amortissements et la Valeur Nette Comptable (VNC).


## 4. GÃ©nÃ©ration des Ã‰critures de Dotation d'Inventaire


En fin d'exercice au 31 dÃ©cembre, cliquer sur 'GÃ©nÃ©rer les Ã‰critures d'Inventaire'. Le systÃ¨me poste automatiquement les Ã©critures Ã©quilibrÃ©es DÃ©bit 681 / CrÃ©dit 281 au Grand Livre.


## 5. Sortie d'Actif (Cession ou Mise au Rebut)


En cas de vente ou de rebut, enregistrer la sortie d'actif. Le systÃ¨me comptabilise la sortie de l'immobilisation, l'annulation des amortissements cumulÃ©s et constate la plus-value ou moins-value fiscale.
