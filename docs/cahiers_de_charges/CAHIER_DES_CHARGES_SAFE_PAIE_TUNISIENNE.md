
SAFE ERP • SUITE MÉTIER TUNISIE
Normes Comptables SCE & Réglementation Fiscale Tunisienne
Arrêté de validation : 18 Novembre 2026


PROLOGICIEL MÉTIER • PAIE & DÉCLARATIONS LÉGALES TUNISIENNES
SAFE Paie Tunisienne & Déclarations Sociales
Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Moteur IRPP, CNSS & Bulletins


| VALIDATION OFFICIELLE EXPERT-COMPTABLE — Dossier technique, fonctionnel et opérationnel exhaustif regroupant l'Architecture logicielle, le Cahier des charges conforme à la législation tunisienne et le Manuel d'utilisation pas-à-pas. |
| --- |



# Partie I : Architecture Technique & Logicielle Détaillée


Le prologiciel SAFE Paie Tunisienne & Déclarations Sociales repose sur une architecture découplée, performante et sécurisée, conçue pour un déploiement autonome ou en synergie directe avec le socle central SAFE ERP. Cette architecture garantit une parfaite étanchéité des données tout en maintenant l'intégrité transactionnelle globale.


| Composant | Technologie | Rôle & Détails Techniques |
| --- | --- | --- |
| Frontend UI | React 19, TailwindCSS, Éditeur de fiches | Simulateur Net/Brut, livre de paie, bulletins imprimables normalisés en TND |
| Backend API | Node.js Express, Service HR Payroll | Moteur de calcul IRPP progressif 8 tranches, plafonds CNSS, FOPROLOS, CSS |
| Base de Données | Prisma ORM, SQLite / PostgreSQL | Tables : Employee, Payslip, PayrollConfig, PayrollRubrique, PayrollTaxBracket |
| Précision Monétaire | Millièmes de Dinar Tunisien (TND) | Calcul exact à 3 décimales, aucun arrondi intermédiaire déviant |
| Sécurité RH | Chiffrement & RBAC Strict | Données salariales strictement restreintes aux rôles HR_MANAGER et ADMIN |



## 1.1 Sécurité, Contrôle d'Accès & Inviolabilité


L'accès au prologiciel est gouverné par une matrice de contrôle RBAC (Role-Based Access Control) stricte. Chaque opération d'écriture, de validation ou d'émission est horodatée et attribuée à un acteur certifié. Les données sensibles (salaires, données personnelles, coordonnées bancaires) sont cloisonnées au niveau applicatif.


# Partie II : Cahier des Charges Fonctionnel & Législation Tunisienne


Ce prologiciel a été conçu et paramétré pour respecter à 100 % le corpus juridique, fiscal et comptable en vigueur en République Tunisienne. L'ensemble des règles et formules de calcul a été audité et validé par l'expert-comptable du projet :


• Barème IRPP Progressif à 8 tranches conforme à la Loi de Finances tunisienne en vigueur.


• Déductions familiales légales déductibles de l'assiette imposable : 300 DT / an pour le chef de famille, 100 DT / an par enfant à charge.


• Cotisation CNSS obligatoire : 9,18 % part salariale régime général + 0,5 % maladie/complémentaire = 9,68 % total salarial.


• Cotisation patronale CNSS : 16,57 % pour le secteur non-agricole, incluant les prestations familiales et les accidents de travail.


• FOPROLOS : Taxe patronale de 1 % sur la masse salariale brute pour le Fonds de Promotion du Logement.


• Contribution Sociale de Solidarité (CSS) : 0,5 % applicable sur le revenu imposable pour le redressement des caisses de retraite.


• Déclaration Trimestrielle des Salaires CNSS (DS) obligatoire avant le 15 du mois suivant le trimestre échu.


# Partie III : Mode de Fonctionnement & Guide Utilisateur Pas-à-Pas


Ce guide opératoire détaille les flux de travail standard et les bonnes pratiques d'exploitation au quotidien :


## 1. Configuration des Rubriques de Paie & Barèmes


Accéder aux paramètres de paie. Vérifier l'activation du barème IRPP à 8 tranches, du taux CNSS (9.68%), du FOPROLOS (1%) et de la CSS (0.5%).


## 2. Fiche Salarié & Données Fiscales / Familiales


Pour chaque employé, renseigner le statut familial (Marié / Célibataire), le nombre d'enfants à charge, le matricule CNSS et le salaire de base contractuel en TND.


## 3. Saisie des Éléments Variables du Mois


Renseigner les heures supplémentaires effectuées (bonifiées à 25%, 50% ou 100%), les primes de rendement, indemnités de transport et retenues sur absences ou acomptes.


## 4. Lancement du Calcul de la Paie


Cliquer sur 'Calculer la Paie du Mois'. Le moteur déroule séquentiellement : Brut -> Déduction CNSS 9.68% -> Salaire Imposable -> Déductions familiales -> IRPP progressif -> CSS 0.5% -> Salaire Net à payer au millime.


## 5. Impression des Bulletins & Livre de Paie


Générer les bulletins de paie individuels au format officiel et exporter le Livre de Paie mensuel pour transmission à l'expert-comptable et à l'inspection du travail.


## 6. Édition de la Déclaration Trimestrielle CNSS (DS)


À la fin de chaque trimestre (mars, juin, septembre, décembre), générer l'état récapitulatif CNSS avec ventilation des salaires plafonnés et cotisations dues.
