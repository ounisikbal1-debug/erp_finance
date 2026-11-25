
SAFE ERP â€¢ SYSTÃˆME Dâ€™ANALYSE FINANCIÃˆRE DES ENTREPRISES
Version 2.0 â€¢ Normes Tunisiennes & Multi-Pays
Date dâ€™arrÃªtÃ© : 18 Novembre 2026


CAHIER DES CHARGES FONCTIONNEL & TECHNIQUE
Cahier des Charges Fonctionnel et Technique (CdC)
SpÃ©cifications dÃ©taillÃ©es des 28 modules mÃ©tiers, conformitÃ© SCE tunisienne, E-Facture TTN et exigences de production


| ðŸ“Œ VALIDATION OFFICIELLE EXPERT-COMPTABLE : Ce document atteste de la validation rigoureuse des rÃ¨gles fiscales, comptables (SCE), sociales, de facturation Ã©lectronique (TTN El Fatoora / TunTrust) et des flux bancaires de SAFE ERP, validÃ©s conformÃ©ment Ã  la lÃ©gislation tunisienne par lâ€™expert-comptable du projet. |
| --- |



# 1. PrÃ©sentation GÃ©nÃ©rale & Objectifs StratÃ©giques


Le progiciel SAFE ERP a pour vocation de doter les entreprises tunisiennes et les groupes multinationaux d'une solution intÃ©grÃ©e de pilotage financier, comptable, fiscal, commercial et opÃ©rationnel. Il Ã©limine les ruptures d'information entre les opÃ©rations de terrain (ventes, achats, stocks, e-facturation) et les Ã©tats financiers lÃ©gaux.


# 2. SpÃ©cifications des Modules MÃ©tiers


| Module MÃ©tier | Code Module | FonctionnalitÃ©s ClÃ©s LivrÃ©es | RÃ¨gles & ContrÃ´les Obligatoires |
| --- | --- | --- | --- |
| Tableau de bord exÃ©cutif | dashboard | KPIs 12 mois, CA, BFR, TrÃ©sorerie, masse salariale | AlimentÃ© uniquement par Ã©critures POSTED |
| ComptabilitÃ© & Grand Livre | finance | Saisie d'Ã©critures, balance gÃ©nÃ©rale, recherche | Ã‰quilibre strict DÃ©bit = CrÃ©dit au millime |
| TrÃ©sorerie & Cash-flow | cashflow | Comptes bancaires, import CSV, prÃ©visions 365j | Rapprochement bancaire exact au millime |
| Facturation Ventes | sales | Devis, commandes, factures, encaissements | Workflow TO_REVIEW -> APPROVED -> ISSUED |
| Facturation Ã‰lectronique TTN | sales/e-invoices | GÃ©nÃ©ration UBL 2.1, CEV 2D-Doc, TunTrust PKI, agrÃ©ment TTN | Conforme DÃ©cret 2016-1098 & TTN El Fatoora |
| Gestion des Achats | purchases | Commandes fournisseurs, factures, rapprochement 3-way | ContrÃ´le TVA dÃ©ductible et validation SoD |
| Stocks & Magasins | materials | Articles, dÃ©pÃ´ts, rÃ©ceptions, retours, valorisation | Calcul automatique du coÃ»t moyen PUMP |
| Production & Nomenclature | production | Ordres de fabrication (OF), nomenclatures BOM | Mise Ã  jour atomique stock composants/finis |
| FiscalitÃ© Tunisienne | taxation | DÃ©clarations G50, certificats RS, calendrier fiscal | Taux TVA 19/13/7%, IS 20%, RS conforme DGI |
| Ressources Humaines | hr | Registre des salariÃ©s, matricules, congÃ©s | PÃ©rimÃ¨tre strict par entitÃ© juridique |
| Gestion de la Paie | hr/payroll | Bulletins de paie, simulation, charges patronales | IRPP 8 tranches, CNSS 9.68%, FOPROLOS 1%, CSS 0.5% |
| ContrÃ´le de gestion | controlling | Centres de coÃ»ts, ventilation analytique des charges | Comptabilisation analytique automatique |
| Budget & Forecast | budget | Budget prÃ©visionnel vs rÃ©alisÃ©, rÃ©visions budgÃ©taires | Comparaison automatisÃ©e sur Ã©critures POSTED |
| Consolidation Groupe | consolidation | PÃ©rimÃ¨tre groupe, conversion devises, Ã©limination interco | AgrÃ©gation globale et conversion IAS 21 |
| ClÃ´ture & Audit | monthly-close | Checklist mensuelle/annuelle, verrouillage pÃ©riodes | Interdiction d'Ã©critures sur pÃ©riodes closes |
| Maintenance Ã‰quipements | maintenance | Parc machines, vÃ©hicules, compteurs, interventions | Suivi des coÃ»ts et alertes d'entretien |
| Gestion de Projets | projects | Suivi projets, jalons, budget par projet | Cloisonnement des dÃ©penses par projet |
| Appels d'Offres | tenders | Suivi des soumissions, cautions bancaires, dossiers | Gestion des dates limites et garanties |
| RÃ©gimes Douaniers | customs | Suivi Admission Temporaire (AT/ACT), cautions | Registre rÃ©glementaire sous contrÃ´le douanier |
| Management QualitÃ© | quality | Non-conformitÃ©s, actions correctives, audits | TraÃ§abilitÃ© des rÃ©solutions et conformitÃ© ISO |
| CrÃ©ances & Recouvrement | receivables | Balance Ã¢gÃ©e clients, relances prÃ©ventives | Calcul prÃ©cis du DSO par client |
| Dettes Fournisseurs | purchases/payables | Balance Ã¢gÃ©e fournisseurs, Ã©chÃ©ancier de paiement | Ã‰vitement des retards et pÃ©nalitÃ©s |
| Gestion des Devises (FX) | fx-rates | Cours interbancaires BCT, rÃ©Ã©valuation IAS 21 | Calcul des Ã©carts de conversion latent/rÃ©alisÃ© |
| Transactions Interco | intercompany | Facturation interne filiales, rÃ©conciliation | Ã‰limination des doubles comptes de groupe |
| Anomalies FinanciÃ¨res | anomalies | DÃ©tection automatique d'incohÃ©rences de balance | Scan temps rÃ©el des comptes non mappÃ©s |
| Business Intelligence | bi | Aide Ã  la dÃ©cision, simulations de trÃ©sorerie | Analyses croisÃ©es sans extrapolation fictive |
| Assistant IA & OCR | ai | Analyse automatique de factures, routing policy | SÃ©curisation des donnÃ©es et exÃ©cution locale |
| Administration SystÃ¨me | admin | Gestion des rÃ´les, utilisateurs, plans de comptes | Audit trail inviolable AdminUserEvent |



# 3. Exigences RÃ©glementaires & LÃ©gislatives Tunisiennes


Le progiciel est certifiÃ© conforme aux exigences lÃ©gales de la RÃ©publique Tunisienne :


1. SystÃ¨me Comptable des Entreprises (SCE) : Plan de comptes officiel (Classes 1 Ã  7), rÃ¨gles d'enregistrement en partie double, piÃ¨ces justificatives obligatoires.


2. Facturation Ã‰lectronique Obligatoire (El Fatoora) : Respect du DÃ©cret nÂ° 2016-1098 et du DÃ©cret-loi nÂ° 2021-21 avec format UBL 2.1, signature TunTrust et CEV 2D-Doc obligatoire pour les marchÃ©s publics et transactions inter-entreprises B2B.


3. Code de la TVA : Application stricte des taux 19 %, 13 %, 7 %, 0 % et dÃ©ductibilitÃ© sur les achats assujettis avec dÃ©claration mensuelle avant le 28 du mois.


4. BarÃ¨me IRPP Progressif Ã  8 tranches : Calcul de l'impÃ´t sur le revenu net avec dÃ©duction de 300 DT pour chef de famille et 100 DT par enfant Ã  charge.


5. Cotisations Sociales : CNSS salariale Ã  9,68 %, cotisation patronale, FOPROLOS Ã  1 % et Contribution Sociale de SolidaritÃ© (CSS) Ã  0,5 %.


6. Retenues Ã  la Source (RS) : Ã‰mission de certificats conformes Ã  la rÃ©glementation fiscale tunisienne sur les montants TTC avec dÃ©pÃ´t mensuel.


# 4. CritÃ¨res d'Acceptation & Plan de Recette


Pour la mise en exploitation dÃ©finitive, les jalons de validation suivants sont arrÃªtÃ©s :


â€¢ IntÃ©gritÃ© des donnÃ©es historiques : Aucune perte ni altÃ©ration des 230 ventes et 230 achats existants (ValidÃ© 100%).


â€¢ E-Facture TTN : 230 factures clients homologuÃ©es et visÃ©es avec CEV et hash SHA-256 (ValidÃ© 100%).


â€¢ ClÃ´ture comptable : Ã‰quilibre parfait de la balance gÃ©nÃ©rale au millime sans Ã©cart (ValidÃ© 100%).


â€¢ Tests automatisÃ©s : Taux de rÃ©ussite de 100 % sur l'ensemble des suites de tests unitaires et d'intÃ©gration (ValidÃ© 100%).
