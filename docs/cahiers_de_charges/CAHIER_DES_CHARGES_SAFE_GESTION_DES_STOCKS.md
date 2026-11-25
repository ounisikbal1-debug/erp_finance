
SAFE ERP â€¢ SUITE MÃ‰TIER TUNISIE
Normes Comptables SCE & RÃ©glementation Fiscale Tunisienne
ArrÃªtÃ© de validation : 18 Novembre 2026


PROLOGICIEL MÃ‰TIER â€¢ STOCKS, LOGISTIQUE & DOUANES AT/ACT
SAFE Gestion des Stocks & EntrepÃ´ts (MM)
Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Valorisation PUMP & Douanes


| VALIDATION OFFICIELLE EXPERT-COMPTABLE â€” Dossier technique, fonctionnel et opÃ©rationnel exhaustif regroupant l'Architecture logicielle, le Cahier des charges conforme Ã  la lÃ©gislation tunisienne et le Manuel d'utilisation pas-Ã -pas. |
| --- |



# Partie I : Architecture Technique & Logicielle DÃ©taillÃ©e


Le prologiciel SAFE Gestion des Stocks & EntrepÃ´ts (MM) repose sur une architecture dÃ©couplÃ©e, performante et sÃ©curisÃ©e, conÃ§ue pour un dÃ©ploiement autonome ou en synergie directe avec le socle central SAFE ERP. Cette architecture garantit une parfaite Ã©tanchÃ©itÃ© des donnÃ©es tout en maintenant l'intÃ©gritÃ© transactionnelle globale.


| Composant | Technologie | RÃ´le & DÃ©tails Techniques |
| --- | --- | --- |
| Frontend UI | React 19, TypeScript, Tables dynamiques | Gestion multi-dÃ©pÃ´ts, fiches articles, alertes de stock mini/maxi, rÃ©gimes AT |
| Backend API | Node.js Express, Service Materials | Endpoints /api/materials, /api/customs, calcul atomique du PUMP, traÃ§abilitÃ© des lots |
| Base de DonnÃ©es | SQLite / PostgreSQL relationnel | Tables : Material, Warehouse, StockMovement, MaterialWarehouseStock, CustomsDutyRegime |
| MÃ©thode de Valorisation | Norme Comptable NCT 04 | CoÃ»t Moyen Unitaire PondÃ©rÃ© (PUMP / CMP) recalculÃ© Ã  chaque entrÃ©e en stock |
| ContrÃ´le Douanier | Code des Douanes Tunisien | Comptes d'apurement Admission Temporaire (AT / ACT) et suivi des cautions bancaires |



## 1.1 SÃ©curitÃ©, ContrÃ´le d'AccÃ¨s & InviolabilitÃ©


L'accÃ¨s au prologiciel est gouvernÃ© par une matrice de contrÃ´le RBAC (Role-Based Access Control) stricte. Chaque opÃ©ration d'Ã©criture, de validation ou d'Ã©mission est horodatÃ©e et attribuÃ©e Ã  un acteur certifiÃ©. Les donnÃ©es sensibles (salaires, donnÃ©es personnelles, coordonnÃ©es bancaires) sont cloisonnÃ©es au niveau applicatif.


# Partie II : Cahier des Charges Fonctionnel & LÃ©gislation Tunisienne


Ce prologiciel a Ã©tÃ© conÃ§u et paramÃ©trÃ© pour respecter Ã  100 % le corpus juridique, fiscal et comptable en vigueur en RÃ©publique Tunisienne. L'ensemble des rÃ¨gles et formules de calcul a Ã©tÃ© auditÃ© et validÃ© par l'expert-comptable du projet :


â€¢ ConformitÃ© NCT 04 : Valorisation obligatoire au CoÃ»t Moyen Unitaire PondÃ©rÃ© (CMP / PUMP) ou FIFO.


â€¢ Inventaire physique obligatoire au moins une fois par an avec justification formelle de chaque Ã©cart (perte, coulage, avarie).


â€¢ Gestion des RÃ©gimes Douaniers Suspensifs : Admission Temporaire pour Perfectionnement Actif (AT/ACT) avec dÃ©lais lÃ©gaux de rÃ©exportation.


â€¢ Ã‰tanchÃ©itÃ© des dÃ©pÃ´ts : ImpossibilitÃ© de mouvementer un stock en valeur nÃ©gative (contrÃ´le bloquant Ã  la saisie).


â€¢ Mise Ã  jour atomique des stocks lors de la rÃ©ception des commandes d'achat et des sorties pour ordres de fabrication (OF).


# Partie III : Mode de Fonctionnement & Guide Utilisateur Pas-Ã -Pas


Ce guide opÃ©ratoire dÃ©taille les flux de travail standard et les bonnes pratiques d'exploitation au quotidien :


## 1. CrÃ©ation des DÃ©pÃ´ts et Magasins


Dans le module 'Stocks & EntrepÃ´ts', crÃ©er les diffÃ©rents entrepÃ´ts (DÃ©pÃ´t Principal MatiÃ¨res, Magasin PiÃ¨ces, EntrepÃ´t Produits Finis, DÃ©pÃ´t Sous Douane AT).


## 2. CrÃ©ation des Articles & ParamÃ©trage des Seuils


DÃ©finir la rÃ©fÃ©rence article, la dÃ©signation, l'unitÃ© de mesure (Kg, PiÃ¨ce, MÃ¨tre, Litre), le stock de sÃ©curitÃ© et le stock d'alerte pour rÃ©approvisionnement automatique.


## 3. Enregistrement d'une EntrÃ©e de Stock (RÃ©ception Achat)


Ã€ la livraison du fournisseur, crÃ©er un Bon de RÃ©ception liÃ© Ã  la commande d'achat. Le stock physique augmente et le PUMP est automatiquement recalculÃ© selon la formule : (Valeur Ancien Stock + Valeur Nouvelle EntrÃ©e) / (QuantitÃ© Totale).


## 4. Transfert Inter-DÃ©pÃ´ts & Sorties de Fabrication


Effectuer les transferts d'un dÃ©pÃ´t Ã  un autre avec traÃ§abilitÃ© de l'Ã©metteur et du rÃ©cepteur. Les sorties pour fabrication dÃ©bitent le stock matiÃ¨res au PUMP en vigueur.


## 5. RÃ©alisation des Inventaires Physiques


Ã‰diter la liste d'inventaire Ã  blanc. Saisir les quantitÃ©s rÃ©elles comptÃ©es. Le systÃ¨me met en Ã©vidence les Ã©carts d'inventaire et gÃ©nÃ¨re les Ã©critures comptables de rÃ©gularisation (compte 603 / 311).


## 6. Gestion des RÃ©gimes Douaniers (AT / ACT)


Enregistrer les dÃ©clarations de douane d'importation temporaire, suivre les cautions bancaires engagÃ©es et apurer les comptes lors de la rÃ©exportation des produits finis.
