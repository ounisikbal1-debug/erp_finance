
SAFE ERP • SUITE MÉTIER TUNISIE
Normes Comptables SCE & Réglementation Fiscale Tunisienne
Arrêté de validation : 18 Novembre 2026


PROLOGICIEL MÉTIER • CAPITAL HUMAIN & CODE DU TRAVAIL TUNISIEN
SAFE Gestion des Ressources Humaines & Talents
Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Contrats, Congés & GPEC


| VALIDATION OFFICIELLE EXPERT-COMPTABLE — Dossier technique, fonctionnel et opérationnel exhaustif regroupant l'Architecture logicielle, le Cahier des charges conforme à la législation tunisienne et le Manuel d'utilisation pas-à-pas. |
| --- |



# Partie I : Architecture Technique & Logicielle Détaillée


Le prologiciel SAFE Gestion des Ressources Humaines & Talents repose sur une architecture découplée, performante et sécurisée, conçue pour un déploiement autonome ou en synergie directe avec le socle central SAFE ERP. Cette architecture garantit une parfaite étanchéité des données tout en maintenant l'intégrité transactionnelle globale.


| Composant | Technologie | Rôle & Détails Techniques |
| --- | --- | --- |
| Frontend UI | React 19, TypeScript, Calendrier interactif | Dossier collaborateur 360°, gestion des congés, organigramme, fiches GPEC |
| Backend API | Node.js Express, Service HR Workflows | Endpoints /api/hr, gestion des approbations de congés, suivi des contrats |
| Base de Données | Prisma ORM, SQLite / PostgreSQL | Tables : Employee, LeaveRequest, HrDocumentMetadata, EmployeeContractHistory |
| Calendrier Légal | Jours Fériés Tunisiens | Gestion native des jours fériés légaux et chômés de la République Tunisienne |
| Protection Données | RGPD & Normes INPDP | Conformité à l'Instance Nationale de Protection des Données Personnelles (INPDP) |



## 1.1 Sécurité, Contrôle d'Accès & Inviolabilité


L'accès au prologiciel est gouverné par une matrice de contrôle RBAC (Role-Based Access Control) stricte. Chaque opération d'écriture, de validation ou d'émission est horodatée et attribuée à un acteur certifié. Les données sensibles (salaires, données personnelles, coordonnées bancaires) sont cloisonnées au niveau applicatif.


# Partie II : Cahier des Charges Fonctionnel & Législation Tunisienne


Ce prologiciel a été conçu et paramétré pour respecter à 100 % le corpus juridique, fiscal et comptable en vigueur en République Tunisienne. L'ensemble des règles et formules de calcul a été audité et validé par l'expert-comptable du projet :


• Conformité Code du Travail Tunisien (Loi n° 66-27 modifiée) régissant les contrats et conditions de travail.


• Gestion des différents types de contrats légaux : CDI, CDD, CIVP (ex-SIVP), Contrat d'Apprentissage (CAIP), Contrat Karama.


• Articles 112 et suivants : Droit au congé payé légal fixé à 1 jour ouvrable par mois de travail effectif, majoré pour ancienneté.


• Suivi de la Médecine du Travail obligatoire (visite d'embauche et visites périodiques annuelles).


• Édition obligatoire du Solde de Tout Compte, du Certificat de Travail et de l'Attestation de Salaire lors du départ d'un collaborateur.


# Partie III : Mode de Fonctionnement & Guide Utilisateur Pas-à-Pas


Ce guide opératoire détaille les flux de travail standard et les bonnes pratiques d'exploitation au quotidien :


## 1. Création & Gestion des Dossiers Collaborateurs


Créer la fiche du collaborateur : CIN, matricule interne, matricule CNSS, date de naissance, situation de famille, diplômes et fonction.


## 2. Gestion des Contrats & Périodes d'Essai


Saisir le type de contrat (CDI, CDD, CIVP avec convention ANETI). Renseigner la date d'embauche, la durée de la période d'essai et les dates de renouvellement. Le système alerte sur les échéances.


## 3. Circuit de Validation des Congés Payés


Le collaborateur soumet sa demande de congé (Annuel, Maladie, Maternité, Mariage, Décès). Le responsable hiérarchique reçoit la notification et approuve ou refuse. Le solde de congé est décompté automatiquement.


## 4. Suivi Médical & Sécurité au Travail


Enregistrer les dates des visites médicales d'embauche et périodiques effectuées auprès du Groupement de Médecine du Travail (GMT).


## 5. Gestion Prévisionnelle des Emplois & Compétences (GPEC)


Évaluer les compétences des collaborateurs lors des entretiens annuels, définir les plans de formation professionnelle et suivre l'évolution des carrières.


## 6. Édition des Documents Légaux


Générer en un clic les attestations de travail, attestations de salaire, certificats d'emploi et reçus de solde de tout compte avec décharge signée.
