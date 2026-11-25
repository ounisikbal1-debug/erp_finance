
SAFE ERP â€¢ SUITE MÃ‰TIER TUNISIE
Normes Comptables SCE & RÃ©glementation Fiscale Tunisienne
ArrÃªtÃ© de validation : 18 Novembre 2026


PROLOGICIEL MÃ‰TIER â€¢ PAIE & DÃ‰CLARATIONS LÃ‰GALES TUNISIENNES
SAFE Paie Tunisienne & DÃ©clarations Sociales
Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Moteur IRPP, CNSS & Bulletins


| VALIDATION OFFICIELLE EXPERT-COMPTABLE â€” Dossier technique, fonctionnel et opÃ©rationnel exhaustif regroupant l'Architecture logicielle, le Cahier des charges conforme Ã  la lÃ©gislation tunisienne et le Manuel d'utilisation pas-Ã -pas. |
| --- |



# Partie I : Architecture Technique & Logicielle DÃ©taillÃ©e


Le prologiciel SAFE Paie Tunisienne & DÃ©clarations Sociales repose sur une architecture dÃ©couplÃ©e, performante et sÃ©curisÃ©e, conÃ§ue pour un dÃ©ploiement autonome ou en synergie directe avec le socle central SAFE ERP. Cette architecture garantit une parfaite Ã©tanchÃ©itÃ© des donnÃ©es tout en maintenant l'intÃ©gritÃ© transactionnelle globale.


| Composant | Technologie | RÃ´le & DÃ©tails Techniques |
| --- | --- | --- |
| Frontend UI | React 19, TailwindCSS, Ã‰diteur de fiches | Simulateur Net/Brut, livre de paie, bulletins imprimables normalisÃ©s en TND |
| Backend API | Node.js Express, Service HR Payroll | Moteur de calcul IRPP progressif 8 tranches, plafonds CNSS, FOPROLOS, CSS |
| Base de DonnÃ©es | Prisma ORM, SQLite / PostgreSQL | Tables : Employee, Payslip, PayrollConfig, PayrollRubrique, PayrollTaxBracket |
| PrÃ©cision MonÃ©taire | MilliÃ¨mes de Dinar Tunisien (TND) | Calcul exact Ã  3 dÃ©cimales, aucun arrondi intermÃ©diaire dÃ©viant |
| SÃ©curitÃ© RH | Chiffrement & RBAC Strict | DonnÃ©es salariales strictement restreintes aux rÃ´les HR_MANAGER et ADMIN |



## 1.1 SÃ©curitÃ©, ContrÃ´le d'AccÃ¨s & InviolabilitÃ©


L'accÃ¨s au prologiciel est gouvernÃ© par une matrice de contrÃ´le RBAC (Role-Based Access Control) stricte. Chaque opÃ©ration d'Ã©criture, de validation ou d'Ã©mission est horodatÃ©e et attribuÃ©e Ã  un acteur certifiÃ©. Les donnÃ©es sensibles (salaires, donnÃ©es personnelles, coordonnÃ©es bancaires) sont cloisonnÃ©es au niveau applicatif.


# Partie II : Cahier des Charges Fonctionnel & LÃ©gislation Tunisienne


Ce prologiciel a Ã©tÃ© conÃ§u et paramÃ©trÃ© pour respecter Ã  100 % le corpus juridique, fiscal et comptable en vigueur en RÃ©publique Tunisienne. L'ensemble des rÃ¨gles et formules de calcul a Ã©tÃ© auditÃ© et validÃ© par l'expert-comptable du projet :


â€¢ BarÃ¨me IRPP Progressif Ã  8 tranches conforme Ã  la Loi de Finances tunisienne en vigueur.


â€¢ DÃ©ductions familiales lÃ©gales dÃ©ductibles de l'assiette imposable : 300 DT / an pour le chef de famille, 100 DT / an par enfant Ã  charge.


â€¢ Cotisation CNSS obligatoire : 9,18 % part salariale rÃ©gime gÃ©nÃ©ral + 0,5 % maladie/complÃ©mentaire = 9,68 % total salarial.


â€¢ Cotisation patronale CNSS : 16,57 % pour le secteur non-agricole, incluant les prestations familiales et les accidents de travail.


â€¢ FOPROLOS : Taxe patronale de 1 % sur la masse salariale brute pour le Fonds de Promotion du Logement.


â€¢ Contribution Sociale de SolidaritÃ© (CSS) : 0,5 % applicable sur le revenu imposable pour le redressement des caisses de retraite.


â€¢ DÃ©claration Trimestrielle des Salaires CNSS (DS) obligatoire avant le 15 du mois suivant le trimestre Ã©chu.


# Partie III : Mode de Fonctionnement & Guide Utilisateur Pas-Ã -Pas


Ce guide opÃ©ratoire dÃ©taille les flux de travail standard et les bonnes pratiques d'exploitation au quotidien :


## 1. Configuration des Rubriques de Paie & BarÃ¨mes


AccÃ©der aux paramÃ¨tres de paie. VÃ©rifier l'activation du barÃ¨me IRPP Ã  8 tranches, du taux CNSS (9.68%), du FOPROLOS (1%) et de la CSS (0.5%).


## 2. Fiche SalariÃ© & DonnÃ©es Fiscales / Familiales


Pour chaque employÃ©, renseigner le statut familial (MariÃ© / CÃ©libataire), le nombre d'enfants Ã  charge, le matricule CNSS et le salaire de base contractuel en TND.


## 3. Saisie des Ã‰lÃ©ments Variables du Mois


Renseigner les heures supplÃ©mentaires effectuÃ©es (bonifiÃ©es Ã  25%, 50% ou 100%), les primes de rendement, indemnitÃ©s de transport et retenues sur absences ou acomptes.


## 4. Lancement du Calcul de la Paie


Cliquer sur 'Calculer la Paie du Mois'. Le moteur dÃ©roule sÃ©quentiellement : Brut -> DÃ©duction CNSS 9.68% -> Salaire Imposable -> DÃ©ductions familiales -> IRPP progressif -> CSS 0.5% -> Salaire Net Ã  payer au millime.


## 5. Impression des Bulletins & Livre de Paie


GÃ©nÃ©rer les bulletins de paie individuels au format officiel et exporter le Livre de Paie mensuel pour transmission Ã  l'expert-comptable et Ã  l'inspection du travail.


## 6. Ã‰dition de la DÃ©claration Trimestrielle CNSS (DS)


Ã€ la fin de chaque trimestre (mars, juin, septembre, dÃ©cembre), gÃ©nÃ©rer l'Ã©tat rÃ©capitulatif CNSS avec ventilation des salaires plafonnÃ©s et cotisations dues.
