# Architecture OpÃ©rationnelle SAFE ERP v2.0

> **Document historique.** Les identifiants, taux et descriptions ci-dessous ne font pas autoritÃ© sur le fonctionnement de la version actuelle. Pour lâ€™installation et les limites vÃ©rifiÃ©es, consultez [README.md](README.md); nâ€™utilisez aucun mot de passe prÃ©dÃ©fini de ce document.

**SAFE** : *SystÃ¨me d'Analyse FinanciÃ¨re des Entreprises*  
*Â« L'Excellence FinanciÃ¨re et OpÃ©rationnelle au CÅ“ur de Votre Entreprise Â»*

Ce document dÃ©taille l'architecture opÃ©rationnelle de **SAFE ERP**, configurÃ© selon les **normes tunisiennes** (comptables SCE, fiscales, de paie et commerciales) avec un **moteur de localisation multi-pays (Customizing SAFE IMG)** et un contrÃ´le d'accÃ¨s sÃ©curisÃ© basÃ© sur les rÃ´les (RBAC).

---

## 1. Vue d'Ensemble & NouveautÃ©s v2.0

1. **Ã‰cran de DÃ©marrage & Authentification RBAC** :
   * Nom officiel : **SAFE** (*SystÃ¨me d'Analyse FinanciÃ¨re des Entreprises*).
   * SociÃ©tÃ© pilote : **Safe Tunisie Industries SARL** | Devise : **Dinar Tunisien (TND / DT)**.
   * Droits d'accÃ¨s stricts par rÃ´le :
     * `ADMIN` (Administrateur) : AccÃ¨s complet et modifications sur tout l'ERP.
     * `FINANCIAL_MANAGER` (Directeur Financier) : AccÃ¨s Finance, Finance AvancÃ©e, Ventes, Achats, RH, Paie, Tableaux de bord.
     * `HR_MANAGER` (ChargÃ© RH & Paie) : AccÃ¨s exclusif et sÃ©curisÃ© aux modules **SAFE RH** et **SAFE Paie**.
     * `SALES_OFFICER` (Commercial) : AccÃ¨s dÃ©diÃ© aux **Ventes & Clients**.
2. **Navigation Verticale LatÃ©rale** :
   * Menu latÃ©ral gauche ergonomique avec masquage/verrouillage automatique des modules non autorisÃ©s selon le profil.
3. **SÃ©paration RH & Paie en 2 modules connectÃ©s** :
   * **SAFE RH** : Registre complet avec **NÂ° Matricule ID** (`empId`), ajout et suppression sÃ©curisÃ©e par code de confirmation.
   * **SAFE Paie** : Moteur de calcul tunisien (IRPP 8 tranches, CNSS 9.68%, FOPROLOS 1%, CSS 0.5%) connectÃ© Ã  la base RH, avec **Gestionnaire de Rubriques SpÃ©cifiques** (primes exceptionnelles, avances, prÃªts, contrats assurance-vie/retraite dÃ©ductibles).
4. **Module Tableau de Bord (Dashboard)** :
   * Indicateurs clÃ©s (Chiffre d'Affaires, TrÃ©sorerie, Masse salariale, Stocks).
   * Graphiques dynamiques SVG (performance mensuelle, rÃ©partition des charges par centre de coÃ»ts).
5. **Module Finance AvancÃ©e** :
   * Analyse de l'Ã©quilibre financier : **BFR**, **FRNG**, **TrÃ©sorerie Nette**.
   * Ratios financiers : LiquiditÃ© gÃ©nÃ©rale, autonomie financiÃ¨re, marge nette, rentabilitÃ© (ROE).
   * Diagnostic automatisÃ© et recommandations d'optimisation de trÃ©sorerie.
6. **Import / Export Multi-Formats & Imputation SystÃ©matique de la Date** :
   * Export **Excel (.xlsx / .xls)**, **CSV**, **PDF officiel imprimable**, et **PrÃ©sentation PowerPoint**.
   * Date et heure d'imputation horodatÃ©es sur chaque document et enregistrement.
7. **Remplacement IntÃ©gral de la Terminologie** :
   * Le vocabulaire des modules est propre Ã  SAFE.

---

## 2. DÃ©marrage du Projet

Dans le dossier `C:\Users\USER\OneDrive\Desktop\safe_Projet 2` :

```powershell
npm start
```
*(ou double-clic sur `run-safe.ps1`)*.

### Comptes utilisateurs

Aucun mot de passe prÃ©dÃ©fini ne doit Ãªtre utilisÃ©. CrÃ©ez des comptes propres Ã  l'installation en suivant [README.md](README.md).

