
SAFE ERP â€¢ SUITE DE PROLOGICIELS MÃ‰TIERS
RÃ©publique Tunisienne â€¢ Normes SCE, Fiscales & Sociales
Date dâ€™arrÃªtÃ© : 18 Novembre 2026


ARCHITECTURE PRODUIT & DÃ‰COUPAGE MÃ‰TIER
SAFE SUITE TUNISIE
Gamme de Prologiciels Verticaux Autonomes & IntÃ©grÃ©s adaptÃ©s Ã  la LÃ©gislation Tunisienne


| ðŸ“Œ CONFORMITÃ‰ LÃ‰GISLATIVE TUNISIENNE : Ce dossier formalise le dÃ©coupage modulaire du progiciel SAFE ERP en une collection de prologiciels mÃ©tiers autonomes et complÃ©mentaires, implantÃ©s Ã  l'adresse C:\Users\USER\OneDrive\Desktop\SAFE_ERP_DRAFT 4. Chaque prologiciel est conforme Ã  100 % aux normes tunisiennes (SCE, TVA, TTN El Fatoora, IRPP, CNSS, NCT). |
| --- |



# 1. Vision StratÃ©gique & Architecture Modulaire DÃ©couplÃ©e


Pour rÃ©pondre aux exigences des PME, grands comptes et cabinets d'expertise comptable tunisiens, SAFE ERP adopte une stratÃ©gie produit Ã  double dÃ©tente : Â« Best-of-Breed Â» modulaire ou ERP global intÃ©grÃ©. Cette approche permet aux entreprises d'acquÃ©rir et de dÃ©ployer uniquement le prologiciel mÃ©tier dont elles ont besoin (ex: uniquement la Facturation ou uniquement la Paie), tout en garantissant une montÃ©e de version et une intÃ©gration native sans ressaisie vers la comptabilitÃ© gÃ©nÃ©rale et la consolidation groupe.


| Prologiciel MÃ©tier | RÃ©pertoire DÃ©diÃ© | CÅ“ur Fonctionnel | Cadre LÃ©gal Tunisien Applicable |
| --- | --- | --- | --- |
| SAFE Facturation | SAFE_Facturation | Devis, Bons de commande, Factures Ventes/Achats, Retenues RS | DÃ©cret 2016-1098, DÃ©cret-loi 2021-21 (TTN), TVA 19/13/7%, RS 1.5% |
| SAFE Gestion des Stocks | SAFE_Gestion_des_Stocks | Multi-dÃ©pÃ´ts, Valorisation PUMP, Inventaires, Douanes AT | Norme NCT 04, Code des Douanes (Admission Temporaire AT/ACT) |
| SAFE Paie | SAFE_Paie | Bulletins de paie, IRPP 8 tranches, CNSS 9.68%, DÃ©clarations DS | Loi de Finances, BarÃ¨me IRPP, CNSS 9.68%, FOPROLOS 1%, CSS 0.5% |
| SAFE Gestion RH | SAFE_Gestion_RH | Dossiers salariÃ©s, Contrats CIVP/CDI, CongÃ©s lÃ©gaux, GPEC | Code du Travail (Loi 66-27), DÃ©crets ANETI, MÃ©decine du Travail |
| SAFE ComptabilitÃ© & FiscalitÃ© | SAFE_Comptabilite_Fiscalite | Grand Livre, Balance 8 col, DÃ©claration G50, IS 20%, Banques | Loi 96-112 (SCE), G50 mensuel (CDPF), BarÃ¨me IS 20% |
| SAFE Production & GPAO | SAFE_Production_GPAO | Nomenclatures BOM, Ordres de fabrication (OF), MRP, CAPA | Normes INNORPI, NCT 04 (Ã©valuation des en-cours de production) |
| SAFE Immobilisations | SAFE_Immobilisations | Fichier actifs, Amortissements linÃ©aire/dÃ©gressif, Dotations | Norme NCT 05, BarÃ¨mes fiscaux de la Direction GÃ©nÃ©rale des ImpÃ´ts (DGI) |



# 2. Fiches Techniques des Prologiciels MÃ©tiers


## 2.1 SAFE Facturation (Achat & Vente)


Ce prologiciel concentre l'intÃ©gralitÃ© du cycle commercial amont et aval. Il intÃ¨gre nativement le systÃ¨me national de facturation Ã©lectronique Â« El Fatoora Â» connectÃ© Ã  la plateforme Tunisie TradeNet (TTN) :


â€¢ Standard XML UBL 2.1 : Ã‰mission automatique des factures au format lÃ©gal avec validation des schÃ©mas OASIS.


â€¢ SÃ©curitÃ© Cryptographique TunTrust : Signature numÃ©rique qualifiÃ©e X.509 dÃ©livrÃ©e par l'Agence Nationale de Certification Ã‰lectronique (ANCE).


â€¢ Cachet Ã‰lectronique Visible (CEV / 2D-Doc) : QR code de sÃ©curisation haute densitÃ© conforme aux directives de la DGI.


â€¢ Retenue Ã  la Source (RS) : GÃ©nÃ©ration instantanÃ©e des certificats lÃ©gaux de retenue Ã  la source de 1,5 % (achats gÃ©nÃ©raux >= 1 000 DT TTC), 0,5 % et 15 % (honoraires professionnels).


## 2.2 SAFE Gestion des Stocks & EntrepÃ´ts (MM)


DÃ©diÃ© Ã  la supply chain industrielle et commerciale, ce prologiciel garantit une traÃ§abilitÃ© totale des flux physiques et valorisÃ©s :


â€¢ Valorisation PUMP (NCT 04) : Calcul dynamique en temps rÃ©el du Prix Unitaire Moyen PondÃ©rÃ© pour chaque article Ã  chaque entrÃ©e en stock.


â€¢ RÃ©gimes Douaniers Suspensifs : Registre rÃ©glementaire d'Admission Temporaire (AT) et d'AmÃ©lioration Active (ACT) sous contrÃ´le de la Douane tunisienne, avec gestion des cautions bancaires et comptes d'apurement.


â€¢ Gestion Multi-DÃ©pÃ´ts : DÃ©pÃ´ts centraux, dÃ©pÃ´ts rÃ©gionaux, magasins de piÃ¨ces de rechange et transferts inter-dÃ©pÃ´ts sÃ©curisÃ©s.


## 2.3 SAFE Paie Tunisienne & DÃ©clarations Sociales


ConÃ§u pour traiter les spÃ©cificitÃ©s de la lÃ©gislation sociale et fiscale tunisienne :


â€¢ BarÃ¨me IRPP Ã  8 Tranches : Calcul progressif automatisÃ© avec prise en compte des dÃ©ductions familiales (300 DT chef de famille, 100 DT par enfant Ã  charge).


â€¢ Cotisations CNSS : PrÃ©lÃ¨vement de 9,68 % pour la part salariale et calcul de la part patronale (16,57 % secteur non-agricole).


â€¢ Taxes Annexes : FOPROLOS Ã  1 % et Contribution Sociale de SolidaritÃ© (CSS) Ã  0,5 %.


â€¢ DÃ©claration Trimestrielle CNSS (DS) : GÃ©nÃ©ration automatisÃ©e des Ã©tats dÃ©claratifs trimestriels pour tÃ©lÃ©-dÃ©claration.


## 2.4 SAFE Gestion des Ressources Humaines & Talents


Gestion administrative et stratÃ©gique du capital humain conforme au Code du Travail tunisien (Loi nÂ° 66-27) :


â€¢ Contrats de Travail : Gestion des CDI, CDD et conventions d'insertion ANETI (CIVP / SIVP, CAIP, Contrat Karama).


â€¢ CongÃ©s PayÃ©s LÃ©gaux : Calcul automatique des droits Ã  congÃ©s (1 jour par mois + bonifications d'anciennetÃ©) et calendrier des jours fÃ©riÃ©s lÃ©gaux.


â€¢ MÃ©decine du Travail : Suivi des visites mÃ©dicales obligatoires et attestations d'aptitude.


## 2.5 SAFE ComptabilitÃ© GÃ©nÃ©rale & FiscalitÃ© Tunisienne


CÅ“ur financier d'entreprise conforme au SystÃ¨me Comptable des Entreprises (SCE - Loi nÂ° 96-112) :


â€¢ Balance GÃ©nÃ©rale 8 Colonnes : Balances initiales, mouvements dÃ©bits/crÃ©dits de la pÃ©riode et soldes de clÃ´ture sans aucun centime d'Ã©cart.


â€¢ DÃ©clarations Fiscales G50 : Liasses mensuelles automatisÃ©es avec calcul prÃ©cis de la TVA nette due (ou crÃ©dit de TVA), du timbre fiscal et des retenues Ã  la source.


â€¢ Liasse IS Annuelle : DÃ©termination du rÃ©sultat fiscal et liquidation de l'ImpÃ´t sur les SociÃ©tÃ©s au taux lÃ©gal de 20 %.


â€¢ Rapprochement Bancaire : Lettrage automatisÃ© avec les banques locales (STB, BIAT, BH, BNA, etc.).


# 3. ModalitÃ©s d'Installation & DÃ©ploiement en ClientÃ¨le


L'ensemble des prologiciels a Ã©tÃ© implantÃ© directement dans le dossier racine :


RÃ©pertoire physique : C:\Users\USER\OneDrive\Desktop\SAFE_ERP_DRAFT 4


Chaque dossier mÃ©tier contient son propre lanceur exÃ©cutable Windows (.cmd et .ps1) ainsi que sa documentation technique et lÃ©gale. Un lanceur central interactif (MENU_PROLOGICIELS_SAFE.cmd) permet Ã©galement de piloter toute la suite depuis un point d'entrÃ©e unique.
