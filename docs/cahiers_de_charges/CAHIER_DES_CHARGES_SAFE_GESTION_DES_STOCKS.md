
SAFE ERP • SUITE MÉTIER TUNISIE
Normes Comptables SCE & Réglementation Fiscale Tunisienne
Arrêté de validation : 18 Novembre 2026


PROLOGICIEL MÉTIER • STOCKS, LOGISTIQUE & DOUANES AT/ACT
SAFE Gestion des Stocks & Entrepôts (MM)
Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Valorisation PUMP & Douanes


| VALIDATION OFFICIELLE EXPERT-COMPTABLE — Dossier technique, fonctionnel et opérationnel exhaustif regroupant l'Architecture logicielle, le Cahier des charges conforme à la législation tunisienne et le Manuel d'utilisation pas-à-pas. |
| --- |



# Partie I : Architecture Technique & Logicielle Détaillée


Le prologiciel SAFE Gestion des Stocks & Entrepôts (MM) repose sur une architecture découplée, performante et sécurisée, conçue pour un déploiement autonome ou en synergie directe avec le socle central SAFE ERP. Cette architecture garantit une parfaite étanchéité des données tout en maintenant l'intégrité transactionnelle globale.


| Composant | Technologie | Rôle & Détails Techniques |
| --- | --- | --- |
| Frontend UI | React 19, TypeScript, Tables dynamiques | Gestion multi-dépôts, fiches articles, alertes de stock mini/maxi, régimes AT |
| Backend API | Node.js Express, Service Materials | Endpoints /api/materials, /api/customs, calcul atomique du PUMP, traçabilité des lots |
| Base de Données | SQLite / PostgreSQL relationnel | Tables : Material, Warehouse, StockMovement, MaterialWarehouseStock, CustomsDutyRegime |
| Méthode de Valorisation | Norme Comptable NCT 04 | Coût Moyen Unitaire Pondéré (PUMP / CMP) recalculé à chaque entrée en stock |
| Contrôle Douanier | Code des Douanes Tunisien | Comptes d'apurement Admission Temporaire (AT / ACT) et suivi des cautions bancaires |



## 1.1 Sécurité, Contrôle d'Accès & Inviolabilité


L'accès au prologiciel est gouverné par une matrice de contrôle RBAC (Role-Based Access Control) stricte. Chaque opération d'écriture, de validation ou d'émission est horodatée et attribuée à un acteur certifié. Les données sensibles (salaires, données personnelles, coordonnées bancaires) sont cloisonnées au niveau applicatif.


# Partie II : Cahier des Charges Fonctionnel & Législation Tunisienne


Ce prologiciel a été conçu et paramétré pour respecter à 100 % le corpus juridique, fiscal et comptable en vigueur en République Tunisienne. L'ensemble des règles et formules de calcul a été audité et validé par l'expert-comptable du projet :


• Conformité NCT 04 : Valorisation obligatoire au Coût Moyen Unitaire Pondéré (CMP / PUMP) ou FIFO.


• Inventaire physique obligatoire au moins une fois par an avec justification formelle de chaque écart (perte, coulage, avarie).


• Gestion des Régimes Douaniers Suspensifs : Admission Temporaire pour Perfectionnement Actif (AT/ACT) avec délais légaux de réexportation.


• Étanchéité des dépôts : Impossibilité de mouvementer un stock en valeur négative (contrôle bloquant à la saisie).


• Mise à jour atomique des stocks lors de la réception des commandes d'achat et des sorties pour ordres de fabrication (OF).


# Partie III : Mode de Fonctionnement & Guide Utilisateur Pas-à-Pas


Ce guide opératoire détaille les flux de travail standard et les bonnes pratiques d'exploitation au quotidien :


## 1. Création des Dépôts et Magasins


Dans le module 'Stocks & Entrepôts', créer les différents entrepôts (Dépôt Principal Matières, Magasin Pièces, Entrepôt Produits Finis, Dépôt Sous Douane AT).


## 2. Création des Articles & Paramétrage des Seuils


Définir la référence article, la désignation, l'unité de mesure (Kg, Pièce, Mètre, Litre), le stock de sécurité et le stock d'alerte pour réapprovisionnement automatique.


## 3. Enregistrement d'une Entrée de Stock (Réception Achat)


À la livraison du fournisseur, créer un Bon de Réception lié à la commande d'achat. Le stock physique augmente et le PUMP est automatiquement recalculé selon la formule : (Valeur Ancien Stock + Valeur Nouvelle Entrée) / (Quantité Totale).


## 4. Transfert Inter-Dépôts & Sorties de Fabrication


Effectuer les transferts d'un dépôt à un autre avec traçabilité de l'émetteur et du récepteur. Les sorties pour fabrication débitent le stock matières au PUMP en vigueur.


## 5. Réalisation des Inventaires Physiques


Éditer la liste d'inventaire à blanc. Saisir les quantités réelles comptées. Le système met en évidence les écarts d'inventaire et génère les écritures comptables de régularisation (compte 603 / 311).


## 6. Gestion des Régimes Douaniers (AT / ACT)


Enregistrer les déclarations de douane d'importation temporaire, suivre les cautions bancaires engagées et apurer les comptes lors de la réexportation des produits finis.
