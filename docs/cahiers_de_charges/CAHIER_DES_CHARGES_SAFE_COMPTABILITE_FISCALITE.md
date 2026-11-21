
SAFE ERP • SUITE MÉTIER TUNISIE
Normes Comptables SCE & Réglementation Fiscale Tunisienne
Arrêté de validation : 18 Novembre 2026


PROLOGICIEL MÉTIER • NORMES COMPTABLES SCE & LIASSES FISCALES
SAFE Comptabilité Générale & Fiscalité Tunisienne
Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation SCE, G50 & IS 20%


| VALIDATION OFFICIELLE EXPERT-COMPTABLE — Dossier technique, fonctionnel et opérationnel exhaustif regroupant l'Architecture logicielle, le Cahier des charges conforme à la législation tunisienne et le Manuel d'utilisation pas-à-pas. |
| --- |



# Partie I : Architecture Technique & Logicielle Détaillée


Le prologiciel SAFE Comptabilité Générale & Fiscalité Tunisienne repose sur une architecture découplée, performante et sécurisée, conçue pour un déploiement autonome ou en synergie directe avec le socle central SAFE ERP. Cette architecture garantit une parfaite étanchéité des données tout en maintenant l'intégrité transactionnelle globale.


| Composant | Technologie | Rôle & Détails Techniques |
| --- | --- | --- |
| Frontend UI | React 19, Grilles comptables haute performance | Saisie horizontale, Balance 8 colonnes, Grand Livre interactif, Déclarations G50 |
| Backend API | Node.js Express, Service Finance & Tax | Endpoints /api/finance, /api/tax-declarations, validation stricte Débit = Crédit |
| Base de Données | Prisma ORM, SQLite / PostgreSQL | Tables : ChartOfAccount, JournalEntry, JournalLine, TaxDeclarationWorkpaper, BankAccount |
| Audit & Sécurité | Chaîne Cryptographique SHA-256 | Inviolabilité des journaux par table JournalEntryAuditChainHead |
| Clôture Périodique | Verrouillage Temporel Hermétique | Interdiction d'insertion ou modification sur périodes closes (MonthlyCloseLock) |



## 1.1 Sécurité, Contrôle d'Accès & Inviolabilité


L'accès au prologiciel est gouverné par une matrice de contrôle RBAC (Role-Based Access Control) stricte. Chaque opération d'écriture, de validation ou d'émission est horodatée et attribuée à un acteur certifié. Les données sensibles (salaires, données personnelles, coordonnées bancaires) sont cloisonnées au niveau applicatif.


# Partie II : Cahier des Charges Fonctionnel & Législation Tunisienne


Ce prologiciel a été conçu et paramétré pour respecter à 100 % le corpus juridique, fiscal et comptable en vigueur en République Tunisienne. L'ensemble des règles et formules de calcul a été audité et validé par l'expert-comptable du projet :


• Conformité absolue à la Loi n° 96-112 portant promulgation du Système Comptable des Entreprises (SCE tunisien).


• Plan de comptes standard tunisien (Classes 1 à 7) avec tenue des écritures en partie double équilibrées au millime.


• Déclaration Fiscale Mensuelle G50 obligatoire avant le 28 de chaque mois (TVA collectée, TVA déductible, Droit de timbre, Retenue à la source).


• Impôt sur les Sociétés (IS) au taux normal légal de 20 % calculé sur le résultat fiscal annuel.


• Règle de séparation des tâches (SoD) : Interdiction pour un utilisateur de valider ou poster une écriture dont il est l'auteur.


• Immutabilité légale : Une fois un journal clôturé, aucune écriture antidatée ne peut être insérée ni modifiée.


# Partie III : Mode de Fonctionnement & Guide Utilisateur Pas-à-Pas


Ce guide opératoire détaille les flux de travail standard et les bonnes pratiques d'exploitation au quotidien :


## 1. Plan Comptable & Journaux Auxiliaires


Consulter le plan de comptes officiel tunisien préconfiguré. Créer les journaux nécessaires (Achats ACH, Ventes VEN, Banque BQ, Caisse CA, Opérations Diverses OD).


## 2. Saisie Comptable Horizontale Rapide


Dans le module 'Saisie Comptable Horizontale', renseigner la date, le journal, le numéro de pièce et le libellé. Ajouter les lignes de comptes. Le système vérifie en temps réel que Total Débit = Total Crédit avant d'autoriser l'enregistrement.


## 3. Consultation du Grand Livre & Lettrage


Filtrer le Grand Livre par compte (ex: 411 Clients ou 401 Fournisseurs) et par période. Effectuer le lettrage manuel ou automatique des règlements avec les factures correspondantes.


## 4. Balance Générale des Comptes à 8 Colonnes


Éditer la balance générale à 8 colonnes : Solde Débiteur/Créditeur d'ouverture, Mouvements Débit/Crédit du mois, Cumuls Mouvements, Soldes Débiteurs/Créditeurs de clôture.


## 5. Rapprochement Bancaire (STB, BIAT, BH, BNA)


Importer les relevés bancaires. Rapprocher les lignes du relevé bancaire avec les écritures du compte 532. Le système calcule l'état de rapprochement exact et détecte les chèques en circulation.


## 6. Préparation de la Déclaration Fiscale G50


À la fin de chaque mois, ouvrir le panneau 'Déclarations Fiscales (G50)'. Le système consolide automatiquement la TVA collectée (19%, 13%, 7%), la TVA déductible, le timbre fiscal et les retenues à la source. L'expert-comptable valide et approuve la déclaration.
