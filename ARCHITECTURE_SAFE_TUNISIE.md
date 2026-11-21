# Architecture Opérationnelle SAFE – Projet Safe (Normes Tunisiennes & Multi-Pays)

Ce document décrit l'architecture opérationnelle inspirée de **SAFE ERP** déployée dans **Safe_Projet 2**, configurée par défaut selon les **normes tunisiennes** (comptables, fiscales, sociales et commerciales) et dotée d'un **moteur de localisation dynamique (Paramétrage multi-pays SAFE)** permettant à l'administrateur d'adapter ou d'ajouter de nouveaux pays sans modifier le code.

---

## 1. Vue d'Ensemble & Correspondance des Modules

```
+---------------------------------------------------------------------------------------+
|                             PRÉSENTATION (Interface Web SAFE)                            |
|        Tableaux de bord modulaires : HCM (Paie), FI (Finance), SD (Ventes),           |
|                 MM (Stocks), CO (Contrôle), IMG (Multi-Pays / Admin)                  |
+---------------------------------------------------------------------------------------+
                                           |
                                           v  (API RESTful JSON)
+---------------------------------------------------------------------------------------+
|                           COUCHE APPLICATION (SERVICES MÉTIERS)                       |
|                                                                                       |
|  [Ressources humaines SAFE / HR]      [Comptabilité SAFE / Finance]     [Ventes et facturation SAFE / Ventes]    [Achats et stocks SAFE / Stocks]    |
|  - Moteur Paie TN    - Plan SCE 7 classes   - Factures TVA 19/13 - Gestion Articles   |
|  - Barème 8 tranches - Écritures D/C        - Timbre 1.000 DT    - Fournisseurs       |
|  - CNSS 9.68%        - Grand Livre          - Écritures auto FI  - Valorisation CMUP  |
|                                                                                       |
|  [Contrôle de gestion SAFE / Contrôle]                                 [Paramétrage multi-pays SAFE / Localisation Admin]   |
|  - Centres de coûts (CC-DIR, CC-FIN, CC-RH...)       - Profils Pays (TN, FR, DZ...)   |
|  - Rapprochement analytique charges/produits         - Taux de TVA & Barèmes IRPP     |
+---------------------------------------------------------------------------------------+
                                           |
                                           v  (ORM Prisma)
+---------------------------------------------------------------------------------------+
|                              BASE DE DONNÉES (SQLITE / PERSISTANCE)                   |
|       CountryProfile | TaxRate | PayrollConfig | PayrollTaxBracket | ChartOfAccount   |
|       Entity | User | Employee | Payslip | Customer | Vendor | Material | Invoice     |
|                      JournalEntry | JournalLine | CostCenter                          |
+---------------------------------------------------------------------------------------+
```

---

## 2. Le Socle Métier : Normes Tunisiennes Intégrées

### A. Ressources Humaines & Moteur de Paie (Ressources humaines SAFE)
Le moteur calcule la rémunération brute et nette avec exactitude selon les dispositions fiscales et sociales tunisiennes :
1. **Cotisation Salariale CNSS :** `9,68%` du salaire brut (9,18% régime général + 0,5% fonds perte d'emploi).
2. **Cotisations Patronales :**
   * CNSS Patronale + Accident du travail : `17,07%`
   * FOPROLOS (Fonds de promotion des logements salariés) : `1,00%`
3. **Déductions Fiscales :**
   * Frais professionnels : `10%` du salaire brut imposable (plafonné à **2 000 DT / an**).
   * Chef de famille : **`300 DT / an`**.
   * Enfants à charge : **`100 DT / enfant / an`**.
   * Parents à charge : **`450 DT / parent / an`**.
4. **Nouveau Barème Progressif Annuel de l'IRPP à 8 tranches :**
   * De 0 à 5 000 DT : **0%**
   * De 5 000,001 à 10 000 DT : **15%**
   * De 10 000,001 à 20 000 DT : **25%**
   * De 20 000,001 à 30 000 DT : **30%**
   * De 30 000,001 à 40 000 DT : **33%**
   * De 40 000,001 à 50 000 DT : **36%**
   * De 50 000,001 à 70 000 DT : **38%**
   * Au-delà de 70 000 DT : **40%**
5. **CSS (Contribution Sociale de Solidarité) :** `0,5%` du salaire brut.

### B. Ventes, Distribution & Facturation (Ventes et facturation SAFE)
* **TVA Tunisienne supportée :** 19% (taux normal), 13% (intermédiaire), 7% (réduit), 0% (exonéré).
* **Droit de timbre fiscal :** `1,000 DT` automatique sur chaque facture client.
* **Intégration SD -> FI en temps réel :** Chaque validation de facture génère automatiquement l'écriture comptable en partie double :
  * Débit `411` (Clients) = Montant TTC Net à payer
  * Crédit `707` (Ventes) = Montant HT
  * Crédit `4367` (État - TVA collectée) = Montant TVA
  * Crédit `432` (État - Droit de timbre) = 1.000 DT

### C. Comptabilité Financière (Comptabilité SAFE)
* Conforme au **Système Comptable des Entreprises (SCE)** tunisien.
* Découpage en 7 classes comptables :
  * Classe 1 : Capitaux propres (101 Capital social, 111 Réserve légale...)
  * Classe 2 : Immobilisations (218 Matériel informatique, 281 Amortissements...)
  * Classe 3 : Stocks (311 Matières premières, 370 Marchandises...)
  * Classe 4 : Tiers (401 Fournisseurs, 411 Clients, 434 CNSS, 4366 TVA déductible, 4367 TVA collectée...)
  * Classe 5 : Financiers (532 Banques commerciales TND, 540 Caisse...)
  * Classe 6 : Charges (601 Achats, 640 Salaires, 647 Charges patronales...)
  * Classe 7 : Produits (701 Ventes produits, 707 Ventes marchandises...)
* Contrôle d'équilibre obligatoire ($\sum \text{Débits} = \sum \text{Crédits}$).

### D. Contrôle de Gestion (Contrôle de gestion SAFE)
* Centres de coûts analytiques : `CC-DIR`, `CC-FIN`, `CC-RH`, `CC-COM`, `CC-PROD`.
* Affectation analytique des écritures comptables.

---

## 3. Le Moteur de Paramétrage Multi-Pays (Paramétrage multi-pays SAFE)

L'administrateur peut à tout moment modifier ou ajouter des configurations pays via les endpoints d'administration :
* `GET /api/admin/countries` : Liste des pays installés.
* `PUT /api/admin/countries/:code/payroll` : Ajuster les taux de cotisations sociales ou les plafonds.
* `PUT /api/admin/countries/:code/tax-brackets` : Modifier les seuils et taux du barème progressif.
* `POST /api/admin/countries` : Ajouter un nouveau pays avec ses propres taxes et règles.

---

## 4. Démarrage Rapide

Dans le dossier `C:\Users\USER\OneDrive\Desktop\safe_Projet 2` :

```powershell
# Lancer le projet (Backend Express sur port 3000 + Frontend Vite sur port 5175)
npm start
```
Ou double-cliquez sur `run-safe.ps1`.

