# Architecture OpÃ©rationnelle SAFE â€“ Projet Safe (Normes Tunisiennes & Multi-Pays)

Ce document dÃ©crit l'architecture opÃ©rationnelle inspirÃ©e de **SAFE ERP** dÃ©ployÃ©e dans **Safe_Projet 2**, configurÃ©e par dÃ©faut selon les **normes tunisiennes** (comptables, fiscales, sociales et commerciales) et dotÃ©e d'un **moteur de localisation dynamique (ParamÃ©trage multi-pays SAFE)** permettant Ã  l'administrateur d'adapter ou d'ajouter de nouveaux pays sans modifier le code.

---

## 1. Vue d'Ensemble & Correspondance des Modules

```
+---------------------------------------------------------------------------------------+
|                             PRÃ‰SENTATION (Interface Web SAFE)                            |
|        Tableaux de bord modulaires : HCM (Paie), FI (Finance), SD (Ventes),           |
|                 MM (Stocks), CO (ContrÃ´le), IMG (Multi-Pays / Admin)                  |
+---------------------------------------------------------------------------------------+
                                           |
                                           v  (API RESTful JSON)
+---------------------------------------------------------------------------------------+
|                           COUCHE APPLICATION (SERVICES MÃ‰TIERS)                       |
|                                                                                       |
|  [Ressources humaines SAFE / HR]      [ComptabilitÃ© SAFE / Finance]     [Ventes et facturation SAFE / Ventes]    [Achats et stocks SAFE / Stocks]    |
|  - Moteur Paie TN    - Plan SCE 7 classes   - Factures TVA 19/13 - Gestion Articles   |
|  - BarÃ¨me 8 tranches - Ã‰critures D/C        - Timbre 1.000 DT    - Fournisseurs       |
|  - CNSS 9.68%        - Grand Livre          - Ã‰critures auto FI  - Valorisation CMUP  |
|                                                                                       |
|  [ContrÃ´le de gestion SAFE / ContrÃ´le]                                 [ParamÃ©trage multi-pays SAFE / Localisation Admin]   |
|  - Centres de coÃ»ts (CC-DIR, CC-FIN, CC-RH...)       - Profils Pays (TN, FR, DZ...)   |
|  - Rapprochement analytique charges/produits         - Taux de TVA & BarÃ¨mes IRPP     |
+---------------------------------------------------------------------------------------+
                                           |
                                           v  (ORM Prisma)
+---------------------------------------------------------------------------------------+
|                              BASE DE DONNÃ‰ES (SQLITE / PERSISTANCE)                   |
|       CountryProfile | TaxRate | PayrollConfig | PayrollTaxBracket | ChartOfAccount   |
|       Entity | User | Employee | Payslip | Customer | Vendor | Material | Invoice     |
|                      JournalEntry | JournalLine | CostCenter                          |
+---------------------------------------------------------------------------------------+
```

---

## 2. Le Socle MÃ©tier : Normes Tunisiennes IntÃ©grÃ©es

### A. Ressources Humaines & Moteur de Paie (Ressources humaines SAFE)
Le moteur calcule la rÃ©munÃ©ration brute et nette avec exactitude selon les dispositions fiscales et sociales tunisiennes :
1. **Cotisation Salariale CNSS :** `9,68%` du salaire brut (9,18% rÃ©gime gÃ©nÃ©ral + 0,5% fonds perte d'emploi).
2. **Cotisations Patronales :**
   * CNSS Patronale + Accident du travail : `17,07%`
   * FOPROLOS (Fonds de promotion des logements salariÃ©s) : `1,00%`
3. **DÃ©ductions Fiscales :**
   * Frais professionnels : `10%` du salaire brut imposable (plafonnÃ© Ã  **2 000 DT / an**).
   * Chef de famille : **`300 DT / an`**.
   * Enfants Ã  charge : **`100 DT / enfant / an`**.
   * Parents Ã  charge : **`450 DT / parent / an`**.
4. **Nouveau BarÃ¨me Progressif Annuel de l'IRPP Ã  8 tranches :**
   * De 0 Ã  5 000 DT : **0%**
   * De 5 000,001 Ã  10 000 DT : **15%**
   * De 10 000,001 Ã  20 000 DT : **25%**
   * De 20 000,001 Ã  30 000 DT : **30%**
   * De 30 000,001 Ã  40 000 DT : **33%**
   * De 40 000,001 Ã  50 000 DT : **36%**
   * De 50 000,001 Ã  70 000 DT : **38%**
   * Au-delÃ  de 70 000 DT : **40%**
5. **CSS (Contribution Sociale de SolidaritÃ©) :** `0,5%` du salaire brut.

### B. Ventes, Distribution & Facturation (Ventes et facturation SAFE)
* **TVA Tunisienne supportÃ©e :** 19% (taux normal), 13% (intermÃ©diaire), 7% (rÃ©duit), 0% (exonÃ©rÃ©).
* **Droit de timbre fiscal :** `1,000 DT` automatique sur chaque facture client.
* **IntÃ©gration SD -> FI en temps rÃ©el :** Chaque validation de facture gÃ©nÃ¨re automatiquement l'Ã©criture comptable en partie double :
  * DÃ©bit `411` (Clients) = Montant TTC Net Ã  payer
  * CrÃ©dit `707` (Ventes) = Montant HT
  * CrÃ©dit `4367` (Ã‰tat - TVA collectÃ©e) = Montant TVA
  * CrÃ©dit `432` (Ã‰tat - Droit de timbre) = 1.000 DT

### C. ComptabilitÃ© FinanciÃ¨re (ComptabilitÃ© SAFE)
* Conforme au **SystÃ¨me Comptable des Entreprises (SCE)** tunisien.
* DÃ©coupage en 7 classes comptables :
  * Classe 1 : Capitaux propres (101 Capital social, 111 RÃ©serve lÃ©gale...)
  * Classe 2 : Immobilisations (218 MatÃ©riel informatique, 281 Amortissements...)
  * Classe 3 : Stocks (311 MatiÃ¨res premiÃ¨res, 370 Marchandises...)
  * Classe 4 : Tiers (401 Fournisseurs, 411 Clients, 434 CNSS, 4366 TVA dÃ©ductible, 4367 TVA collectÃ©e...)
  * Classe 5 : Financiers (532 Banques commerciales TND, 540 Caisse...)
  * Classe 6 : Charges (601 Achats, 640 Salaires, 647 Charges patronales...)
  * Classe 7 : Produits (701 Ventes produits, 707 Ventes marchandises...)
* ContrÃ´le d'Ã©quilibre obligatoire ($\sum \text{DÃ©bits} = \sum \text{CrÃ©dits}$).

### D. ContrÃ´le de Gestion (ContrÃ´le de gestion SAFE)
* Centres de coÃ»ts analytiques : `CC-DIR`, `CC-FIN`, `CC-RH`, `CC-COM`, `CC-PROD`.
* Affectation analytique des Ã©critures comptables.

---

## 3. Le Moteur de ParamÃ©trage Multi-Pays (ParamÃ©trage multi-pays SAFE)

L'administrateur peut Ã  tout moment modifier ou ajouter des configurations pays via les endpoints d'administration :
* `GET /api/admin/countries` : Liste des pays installÃ©s.
* `PUT /api/admin/countries/:code/payroll` : Ajuster les taux de cotisations sociales ou les plafonds.
* `PUT /api/admin/countries/:code/tax-brackets` : Modifier les seuils et taux du barÃ¨me progressif.
* `POST /api/admin/countries` : Ajouter un nouveau pays avec ses propres taxes et rÃ¨gles.

---

## 4. DÃ©marrage Rapide

Dans le dossier `C:\Users\USER\OneDrive\Desktop\safe_Projet 2` :

```powershell
# Lancer le projet (Backend Express sur port 3000 + Frontend Vite sur port 5175)
npm start
```
Ou double-cliquez sur `run-safe.ps1`.

