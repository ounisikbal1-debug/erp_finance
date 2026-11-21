
SAFE ERP • SUITE MÉTIER TUNISIE
Normes Comptables SCE & Réglementation Fiscale Tunisienne
Arrêté de validation : 18 Novembre 2026


PROLOGICIEL MÉTIER • GPAO, MRP & MAINTENANCE D'USINE
SAFE Production Industrielle & GPAO
Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Nomenclatures, OF & MRP


| VALIDATION OFFICIELLE EXPERT-COMPTABLE — Dossier technique, fonctionnel et opérationnel exhaustif regroupant l'Architecture logicielle, le Cahier des charges conforme à la législation tunisienne et le Manuel d'utilisation pas-à-pas. |
| --- |



# Partie I : Architecture Technique & Logicielle Détaillée


Le prologiciel SAFE Production Industrielle & GPAO repose sur une architecture découplée, performante et sécurisée, conçue pour un déploiement autonome ou en synergie directe avec le socle central SAFE ERP. Cette architecture garantit une parfaite étanchéité des données tout en maintenant l'intégrité transactionnelle globale.


| Composant | Technologie | Rôle & Détails Techniques |
| --- | --- | --- |
| Frontend UI | React 19, Gestion visuelle d'ateliers | Suivi des ordres de fabrication (OF), arbres de nomenclature BOM, planning MRP |
| Backend API | Node.js Express, Service Production & MRP | Endpoints /api/production, /api/mrp, calcul des besoins nets et valorisation des en-cours |
| Base de Données | Prisma ORM, SQLite / PostgreSQL | Tables : ProductionOrder, BillOfMaterial, BillOfMaterialItem, EquipmentMaintenance |
| Normes Industrielles | Normes INNORPI & NCT 04 | Évaluation des produits en-cours et valorisation au coût de production standard/réel |
| Intégration Stocks | Décrémentation Atomique des Composants | Déstockage automatique des matières premières lors de la déclaration d'achèvement OF |



## 1.1 Sécurité, Contrôle d'Accès & Inviolabilité


L'accès au prologiciel est gouverné par une matrice de contrôle RBAC (Role-Based Access Control) stricte. Chaque opération d'écriture, de validation ou d'émission est horodatée et attribuée à un acteur certifié. Les données sensibles (salaires, données personnelles, coordonnées bancaires) sont cloisonnées au niveau applicatif.


# Partie II : Cahier des Charges Fonctionnel & Législation Tunisienne


Ce prologiciel a été conçu et paramétré pour respecter à 100 % le corpus juridique, fiscal et comptable en vigueur en République Tunisienne. L'ensemble des règles et formules de calcul a été audité et validé par l'expert-comptable du projet :


• Gestion des nomenclatures de fabrication multi-niveaux (Bill of Materials - BOM) avec coefficients de pertes.


• Traçabilité ascendante et descendante des lots de fabrication conformément aux exigences de certification ISO 9001.


• Calcul des Besoins Nets (MRP) synchronisé avec les commandes clients et les délais fournisseurs.


• Régularisation comptable obligatoire de la variation des en-cours de production (compte 713).


• Suivi de la maintenance préventive et curative des machines de production pour éviter les arrêts d'atelier.


# Partie III : Mode de Fonctionnement & Guide Utilisateur Pas-à-Pas


Ce guide opératoire détaille les flux de travail standard et les bonnes pratiques d'exploitation au quotidien :


## 1. Création des Nomenclatures (BOM)


Définir la fiche du produit fini et ajouter les composants requis (matières premières, consommables, emballages) avec les quantités unitaires et pourcentages de pertes tolérés.


## 2. Lancement des Ordres de Fabrication (OF)


Générer un ordre de fabrication pour une quantité donnée. Le système vérifie la disponibilité des matières en stock et réserve les composants.


## 3. Suivi d'Atelier & Gammes Opératoires


Pointer les heures machines et les heures de main-d'œuvre directe sur chaque poste de charge (découpe, assemblage, conditionnement).


## 4. Clôture de l'OF & Entrée en Stock Produits Finis


À l'achèvement du lot, valider la déclaration de production. Le stock de produits finis est automatiquement incrémenté au coût de revient réel, et les stocks de matières sont décrémentés.


## 5. Maintenance Préventive des Équipements


Programmer les entretiens périodiques des machines selon les compteurs d'heures ou le calendrier, et consigner les interventions curatives.
