
SAFE ERP • SYSTÈME D’ANALYSE FINANCIÈRE DES ENTREPRISES
Version 2.0 • Normes Tunisiennes & Multi-Pays
Date d’arrêté : 18 Novembre 2026


CAHIER DES CHARGES FONCTIONNEL & TECHNIQUE
Cahier des Charges Fonctionnel et Technique (CdC)
Spécifications détaillées des 28 modules métiers, conformité SCE tunisienne, E-Facture TTN et exigences de production


| 📌 VALIDATION OFFICIELLE EXPERT-COMPTABLE : Ce document atteste de la validation rigoureuse des règles fiscales, comptables (SCE), sociales, de facturation électronique (TTN El Fatoora / TunTrust) et des flux bancaires de SAFE ERP, validés conformément à la législation tunisienne par l’expert-comptable du projet. |
| --- |



# 1. Présentation Générale & Objectifs Stratégiques


Le progiciel SAFE ERP a pour vocation de doter les entreprises tunisiennes et les groupes multinationaux d'une solution intégrée de pilotage financier, comptable, fiscal, commercial et opérationnel. Il élimine les ruptures d'information entre les opérations de terrain (ventes, achats, stocks, e-facturation) et les états financiers légaux.


# 2. Spécifications des Modules Métiers


| Module Métier | Code Module | Fonctionnalités Clés Livrées | Règles & Contrôles Obligatoires |
| --- | --- | --- | --- |
| Tableau de bord exécutif | dashboard | KPIs 12 mois, CA, BFR, Trésorerie, masse salariale | Alimenté uniquement par écritures POSTED |
| Comptabilité & Grand Livre | finance | Saisie d'écritures, balance générale, recherche | Équilibre strict Débit = Crédit au millime |
| Trésorerie & Cash-flow | cashflow | Comptes bancaires, import CSV, prévisions 365j | Rapprochement bancaire exact au millime |
| Facturation Ventes | sales | Devis, commandes, factures, encaissements | Workflow TO_REVIEW -> APPROVED -> ISSUED |
| Facturation Électronique TTN | sales/e-invoices | Génération UBL 2.1, CEV 2D-Doc, TunTrust PKI, agrément TTN | Conforme Décret 2016-1098 & TTN El Fatoora |
| Gestion des Achats | purchases | Commandes fournisseurs, factures, rapprochement 3-way | Contrôle TVA déductible et validation SoD |
| Stocks & Magasins | materials | Articles, dépôts, réceptions, retours, valorisation | Calcul automatique du coût moyen PUMP |
| Production & Nomenclature | production | Ordres de fabrication (OF), nomenclatures BOM | Mise à jour atomique stock composants/finis |
| Fiscalité Tunisienne | taxation | Déclarations G50, certificats RS, calendrier fiscal | Taux TVA 19/13/7%, IS 20%, RS conforme DGI |
| Ressources Humaines | hr | Registre des salariés, matricules, congés | Périmètre strict par entité juridique |
| Gestion de la Paie | hr/payroll | Bulletins de paie, simulation, charges patronales | IRPP 8 tranches, CNSS 9.68%, FOPROLOS 1%, CSS 0.5% |
| Contrôle de gestion | controlling | Centres de coûts, ventilation analytique des charges | Comptabilisation analytique automatique |
| Budget & Forecast | budget | Budget prévisionnel vs réalisé, révisions budgétaires | Comparaison automatisée sur écritures POSTED |
| Consolidation Groupe | consolidation | Périmètre groupe, conversion devises, élimination interco | Agrégation globale et conversion IAS 21 |
| Clôture & Audit | monthly-close | Checklist mensuelle/annuelle, verrouillage périodes | Interdiction d'écritures sur périodes closes |
| Maintenance Équipements | maintenance | Parc machines, véhicules, compteurs, interventions | Suivi des coûts et alertes d'entretien |
| Gestion de Projets | projects | Suivi projets, jalons, budget par projet | Cloisonnement des dépenses par projet |
| Appels d'Offres | tenders | Suivi des soumissions, cautions bancaires, dossiers | Gestion des dates limites et garanties |
| Régimes Douaniers | customs | Suivi Admission Temporaire (AT/ACT), cautions | Registre réglementaire sous contrôle douanier |
| Management Qualité | quality | Non-conformités, actions correctives, audits | Traçabilité des résolutions et conformité ISO |
| Créances & Recouvrement | receivables | Balance âgée clients, relances préventives | Calcul précis du DSO par client |
| Dettes Fournisseurs | purchases/payables | Balance âgée fournisseurs, échéancier de paiement | Évitement des retards et pénalités |
| Gestion des Devises (FX) | fx-rates | Cours interbancaires BCT, réévaluation IAS 21 | Calcul des écarts de conversion latent/réalisé |
| Transactions Interco | intercompany | Facturation interne filiales, réconciliation | Élimination des doubles comptes de groupe |
| Anomalies Financières | anomalies | Détection automatique d'incohérences de balance | Scan temps réel des comptes non mappés |
| Business Intelligence | bi | Aide à la décision, simulations de trésorerie | Analyses croisées sans extrapolation fictive |
| Assistant IA & OCR | ai | Analyse automatique de factures, routing policy | Sécurisation des données et exécution locale |
| Administration Système | admin | Gestion des rôles, utilisateurs, plans de comptes | Audit trail inviolable AdminUserEvent |



# 3. Exigences Réglementaires & Législatives Tunisiennes


Le progiciel est certifié conforme aux exigences légales de la République Tunisienne :


1. Système Comptable des Entreprises (SCE) : Plan de comptes officiel (Classes 1 à 7), règles d'enregistrement en partie double, pièces justificatives obligatoires.


2. Facturation Électronique Obligatoire (El Fatoora) : Respect du Décret n° 2016-1098 et du Décret-loi n° 2021-21 avec format UBL 2.1, signature TunTrust et CEV 2D-Doc obligatoire pour les marchés publics et transactions inter-entreprises B2B.


3. Code de la TVA : Application stricte des taux 19 %, 13 %, 7 %, 0 % et déductibilité sur les achats assujettis avec déclaration mensuelle avant le 28 du mois.


4. Barème IRPP Progressif à 8 tranches : Calcul de l'impôt sur le revenu net avec déduction de 300 DT pour chef de famille et 100 DT par enfant à charge.


5. Cotisations Sociales : CNSS salariale à 9,68 %, cotisation patronale, FOPROLOS à 1 % et Contribution Sociale de Solidarité (CSS) à 0,5 %.


6. Retenues à la Source (RS) : Émission de certificats conformes à la réglementation fiscale tunisienne sur les montants TTC avec dépôt mensuel.


# 4. Critères d'Acceptation & Plan de Recette


Pour la mise en exploitation définitive, les jalons de validation suivants sont arrêtés :


• Intégrité des données historiques : Aucune perte ni altération des 230 ventes et 230 achats existants (Validé 100%).


• E-Facture TTN : 230 factures clients homologuées et visées avec CEV et hash SHA-256 (Validé 100%).


• Clôture comptable : Équilibre parfait de la balance générale au millime sans écart (Validé 100%).


• Tests automatisés : Taux de réussite de 100 % sur l'ensemble des suites de tests unitaires et d'intégration (Validé 100%).
