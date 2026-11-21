
SAFE ERP • SUITE MÉTIER TUNISIE
Normes Comptables SCE & Réglementation Fiscale Tunisienne
Arrêté de validation : 18 Novembre 2026


PROLOGICIEL MÉTIER • ACTIFS FISCAUX & AMORTISSEMENTS DGI
SAFE Immobilisations & Amortissements
Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Amortissements Fiscaux DGI


| VALIDATION OFFICIELLE EXPERT-COMPTABLE — Dossier technique, fonctionnel et opérationnel exhaustif regroupant l'Architecture logicielle, le Cahier des charges conforme à la législation tunisienne et le Manuel d'utilisation pas-à-pas. |
| --- |



# Partie I : Architecture Technique & Logicielle Détaillée


Le prologiciel SAFE Immobilisations & Amortissements repose sur une architecture découplée, performante et sécurisée, conçue pour un déploiement autonome ou en synergie directe avec le socle central SAFE ERP. Cette architecture garantit une parfaite étanchéité des données tout en maintenant l'intégrité transactionnelle globale.


| Composant | Technologie | Rôle & Détails Techniques |
| --- | --- | --- |
| Frontend UI | React 19, Tableaux d'amortissement interactifs | Fichier des immobilisations, simulations d'amortissement linéaire/dégressif, inventaire |
| Backend API | Node.js Express, Service Assets | Endpoints /api/assets, calcul automatique prorata temporis et dotations 681/28x |
| Base de Données | Prisma ORM, SQLite / PostgreSQL | Tables : FixedAsset, AssetDepreciationLine, AssetCategory, ChartOfAccount |
| Cadre Réglementaire | Norme Comptable NCT 05 & DGI | Application des taux d'amortissement fiscalement admis par l'administration tunisienne |



## 1.1 Sécurité, Contrôle d'Accès & Inviolabilité


L'accès au prologiciel est gouverné par une matrice de contrôle RBAC (Role-Based Access Control) stricte. Chaque opération d'écriture, de validation ou d'émission est horodatée et attribuée à un acteur certifié. Les données sensibles (salaires, données personnelles, coordonnées bancaires) sont cloisonnées au niveau applicatif.


# Partie II : Cahier des Charges Fonctionnel & Législation Tunisienne


Ce prologiciel a été conçu et paramétré pour respecter à 100 % le corpus juridique, fiscal et comptable en vigueur en République Tunisienne. L'ensemble des règles et formules de calcul a été audité et validé par l'expert-comptable du projet :


• Conformité à la Norme Comptable Tunisienne NCT 05 relative aux immobilisations corporelles et incorporelles.


• Calcul d'amortissement linéaire selon la règle du prorata temporis (calcul au jour le jour à compter de la date de mise en service).


• Taux d'amortissement fiscaux standards tunisiens : Bâtiments d'exploitation (5%), Agencements et installations (10%), Matériel et outillage (10% à 20%), Matériel de transport (20%), Matériel informatique et logiciels (33,33%).


• Comptabilisation automatique des dotations annuelles aux amortissements : Débit 6815 / Crédit 28x.


• Traitement fiscal des cessions : Calcul des plus-values ou moins-values de cession (Prix de cession - Valeur Nette Comptable).


# Partie III : Mode de Fonctionnement & Guide Utilisateur Pas-à-Pas


Ce guide opératoire détaille les flux de travail standard et les bonnes pratiques d'exploitation au quotidien :


## 1. Création d'une Fiche d'Immobilisation


Renseigner la désignation du bien, la catégorie fiscale, la date d'acquisition, la date de mise en service, la valeur d'origine HT et le fournisseur.


## 2. Choix de la Méthode & du Taux d'Amortissement


Sélectionner la méthode (Linéaire ou Dégressif) et le taux fiscal admis (ex: 20% sur 5 ans pour un véhicule utilitaire).


## 3. Génération du Tableau d'Amortissement Prévisionnel


Le système génère automatiquement l'échéancier complet année par année avec l'annuité d'amortissement, le cumul des amortissements et la Valeur Nette Comptable (VNC).


## 4. Génération des Écritures de Dotation d'Inventaire


En fin d'exercice au 31 décembre, cliquer sur 'Générer les Écritures d'Inventaire'. Le système poste automatiquement les écritures équilibrées Débit 681 / Crédit 281 au Grand Livre.


## 5. Sortie d'Actif (Cession ou Mise au Rebut)


En cas de vente ou de rebut, enregistrer la sortie d'actif. Le système comptabilise la sortie de l'immobilisation, l'annulation des amortissements cumulés et constate la plus-value ou moins-value fiscale.
