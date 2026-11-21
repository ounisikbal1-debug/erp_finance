
SAFE ERP • SUITE DE PROLOGICIELS MÉTIERS
République Tunisienne • Normes SCE, Fiscales & Sociales
Date d’arrêté : 18 Novembre 2026


ARCHITECTURE PRODUIT & DÉCOUPAGE MÉTIER
SAFE SUITE TUNISIE
Gamme de Prologiciels Verticaux Autonomes & Intégrés adaptés à la Législation Tunisienne


| 📌 CONFORMITÉ LÉGISLATIVE TUNISIENNE : Ce dossier formalise le découpage modulaire du progiciel SAFE ERP en une collection de prologiciels métiers autonomes et complémentaires, implantés à l'adresse C:\Users\USER\OneDrive\Desktop\SAFE_ERP_DRAFT 4. Chaque prologiciel est conforme à 100 % aux normes tunisiennes (SCE, TVA, TTN El Fatoora, IRPP, CNSS, NCT). |
| --- |



# 1. Vision Stratégique & Architecture Modulaire Découplée


Pour répondre aux exigences des PME, grands comptes et cabinets d'expertise comptable tunisiens, SAFE ERP adopte une stratégie produit à double détente : « Best-of-Breed » modulaire ou ERP global intégré. Cette approche permet aux entreprises d'acquérir et de déployer uniquement le prologiciel métier dont elles ont besoin (ex: uniquement la Facturation ou uniquement la Paie), tout en garantissant une montée de version et une intégration native sans ressaisie vers la comptabilité générale et la consolidation groupe.


| Prologiciel Métier | Répertoire Dédié | Cœur Fonctionnel | Cadre Légal Tunisien Applicable |
| --- | --- | --- | --- |
| SAFE Facturation | SAFE_Facturation | Devis, Bons de commande, Factures Ventes/Achats, Retenues RS | Décret 2016-1098, Décret-loi 2021-21 (TTN), TVA 19/13/7%, RS 1.5% |
| SAFE Gestion des Stocks | SAFE_Gestion_des_Stocks | Multi-dépôts, Valorisation PUMP, Inventaires, Douanes AT | Norme NCT 04, Code des Douanes (Admission Temporaire AT/ACT) |
| SAFE Paie | SAFE_Paie | Bulletins de paie, IRPP 8 tranches, CNSS 9.68%, Déclarations DS | Loi de Finances, Barème IRPP, CNSS 9.68%, FOPROLOS 1%, CSS 0.5% |
| SAFE Gestion RH | SAFE_Gestion_RH | Dossiers salariés, Contrats CIVP/CDI, Congés légaux, GPEC | Code du Travail (Loi 66-27), Décrets ANETI, Médecine du Travail |
| SAFE Comptabilité & Fiscalité | SAFE_Comptabilite_Fiscalite | Grand Livre, Balance 8 col, Déclaration G50, IS 20%, Banques | Loi 96-112 (SCE), G50 mensuel (CDPF), Barème IS 20% |
| SAFE Production & GPAO | SAFE_Production_GPAO | Nomenclatures BOM, Ordres de fabrication (OF), MRP, CAPA | Normes INNORPI, NCT 04 (évaluation des en-cours de production) |
| SAFE Immobilisations | SAFE_Immobilisations | Fichier actifs, Amortissements linéaire/dégressif, Dotations | Norme NCT 05, Barèmes fiscaux de la Direction Générale des Impôts (DGI) |



# 2. Fiches Techniques des Prologiciels Métiers


## 2.1 SAFE Facturation (Achat & Vente)


Ce prologiciel concentre l'intégralité du cycle commercial amont et aval. Il intègre nativement le système national de facturation électronique « El Fatoora » connecté à la plateforme Tunisie TradeNet (TTN) :


• Standard XML UBL 2.1 : Émission automatique des factures au format légal avec validation des schémas OASIS.


• Sécurité Cryptographique TunTrust : Signature numérique qualifiée X.509 délivrée par l'Agence Nationale de Certification Électronique (ANCE).


• Cachet Électronique Visible (CEV / 2D-Doc) : QR code de sécurisation haute densité conforme aux directives de la DGI.


• Retenue à la Source (RS) : Génération instantanée des certificats légaux de retenue à la source de 1,5 % (achats généraux >= 1 000 DT TTC), 0,5 % et 15 % (honoraires professionnels).


## 2.2 SAFE Gestion des Stocks & Entrepôts (MM)


Dédié à la supply chain industrielle et commerciale, ce prologiciel garantit une traçabilité totale des flux physiques et valorisés :


• Valorisation PUMP (NCT 04) : Calcul dynamique en temps réel du Prix Unitaire Moyen Pondéré pour chaque article à chaque entrée en stock.


• Régimes Douaniers Suspensifs : Registre réglementaire d'Admission Temporaire (AT) et d'Amélioration Active (ACT) sous contrôle de la Douane tunisienne, avec gestion des cautions bancaires et comptes d'apurement.


• Gestion Multi-Dépôts : Dépôts centraux, dépôts régionaux, magasins de pièces de rechange et transferts inter-dépôts sécurisés.


## 2.3 SAFE Paie Tunisienne & Déclarations Sociales


Conçu pour traiter les spécificités de la législation sociale et fiscale tunisienne :


• Barème IRPP à 8 Tranches : Calcul progressif automatisé avec prise en compte des déductions familiales (300 DT chef de famille, 100 DT par enfant à charge).


• Cotisations CNSS : Prélèvement de 9,68 % pour la part salariale et calcul de la part patronale (16,57 % secteur non-agricole).


• Taxes Annexes : FOPROLOS à 1 % et Contribution Sociale de Solidarité (CSS) à 0,5 %.


• Déclaration Trimestrielle CNSS (DS) : Génération automatisée des états déclaratifs trimestriels pour télé-déclaration.


## 2.4 SAFE Gestion des Ressources Humaines & Talents


Gestion administrative et stratégique du capital humain conforme au Code du Travail tunisien (Loi n° 66-27) :


• Contrats de Travail : Gestion des CDI, CDD et conventions d'insertion ANETI (CIVP / SIVP, CAIP, Contrat Karama).


• Congés Payés Légaux : Calcul automatique des droits à congés (1 jour par mois + bonifications d'ancienneté) et calendrier des jours fériés légaux.


• Médecine du Travail : Suivi des visites médicales obligatoires et attestations d'aptitude.


## 2.5 SAFE Comptabilité Générale & Fiscalité Tunisienne


Cœur financier d'entreprise conforme au Système Comptable des Entreprises (SCE - Loi n° 96-112) :


• Balance Générale 8 Colonnes : Balances initiales, mouvements débits/crédits de la période et soldes de clôture sans aucun centime d'écart.


• Déclarations Fiscales G50 : Liasses mensuelles automatisées avec calcul précis de la TVA nette due (ou crédit de TVA), du timbre fiscal et des retenues à la source.


• Liasse IS Annuelle : Détermination du résultat fiscal et liquidation de l'Impôt sur les Sociétés au taux légal de 20 %.


• Rapprochement Bancaire : Lettrage automatisé avec les banques locales (STB, BIAT, BH, BNA, etc.).


# 3. Modalités d'Installation & Déploiement en Clientèle


L'ensemble des prologiciels a été implanté directement dans le dossier racine :


Répertoire physique : C:\Users\USER\OneDrive\Desktop\SAFE_ERP_DRAFT 4


Chaque dossier métier contient son propre lanceur exécutable Windows (.cmd et .ps1) ainsi que sa documentation technique et légale. Un lanceur central interactif (MENU_PROLOGICIELS_SAFE.cmd) permet également de piloter toute la suite depuis un point d'entrée unique.
