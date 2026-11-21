# Architecture Opérationnelle SAFE ERP v2.0

> **Document historique.** Les identifiants, taux et descriptions ci-dessous ne font pas autorité sur le fonctionnement de la version actuelle. Pour l’installation et les limites vérifiées, consultez [README.md](README.md); n’utilisez aucun mot de passe prédéfini de ce document.

**SAFE** : *Système d'Analyse Financière des Entreprises*  
*« L'Excellence Financière et Opérationnelle au Cœur de Votre Entreprise »*

Ce document détaille l'architecture opérationnelle de **SAFE ERP**, configuré selon les **normes tunisiennes** (comptables SCE, fiscales, de paie et commerciales) avec un **moteur de localisation multi-pays (Customizing SAFE IMG)** et un contrôle d'accès sécurisé basé sur les rôles (RBAC).

---

## 1. Vue d'Ensemble & Nouveautés v2.0

1. **Écran de Démarrage & Authentification RBAC** :
   * Nom officiel : **SAFE** (*Système d'Analyse Financière des Entreprises*).
   * Société pilote : **Safe Tunisie Industries SARL** | Devise : **Dinar Tunisien (TND / DT)**.
   * Droits d'accès stricts par rôle :
     * `ADMIN` (Administrateur) : Accès complet et modifications sur tout l'ERP.
     * `FINANCIAL_MANAGER` (Directeur Financier) : Accès Finance, Finance Avancée, Ventes, Achats, RH, Paie, Tableaux de bord.
     * `HR_MANAGER` (Chargé RH & Paie) : Accès exclusif et sécurisé aux modules **SAFE RH** et **SAFE Paie**.
     * `SALES_OFFICER` (Commercial) : Accès dédié aux **Ventes & Clients**.
2. **Navigation Verticale Latérale** :
   * Menu latéral gauche ergonomique avec masquage/verrouillage automatique des modules non autorisés selon le profil.
3. **Séparation RH & Paie en 2 modules connectés** :
   * **SAFE RH** : Registre complet avec **N° Matricule ID** (`empId`), ajout et suppression sécurisée par code de confirmation.
   * **SAFE Paie** : Moteur de calcul tunisien (IRPP 8 tranches, CNSS 9.68%, FOPROLOS 1%, CSS 0.5%) connecté à la base RH, avec **Gestionnaire de Rubriques Spécifiques** (primes exceptionnelles, avances, prêts, contrats assurance-vie/retraite déductibles).
4. **Module Tableau de Bord (Dashboard)** :
   * Indicateurs clés (Chiffre d'Affaires, Trésorerie, Masse salariale, Stocks).
   * Graphiques dynamiques SVG (performance mensuelle, répartition des charges par centre de coûts).
5. **Module Finance Avancée** :
   * Analyse de l'équilibre financier : **BFR**, **FRNG**, **Trésorerie Nette**.
   * Ratios financiers : Liquidité générale, autonomie financière, marge nette, rentabilité (ROE).
   * Diagnostic automatisé et recommandations d'optimisation de trésorerie.
6. **Import / Export Multi-Formats & Imputation Systématique de la Date** :
   * Export **Excel (.xlsx / .xls)**, **CSV**, **PDF officiel imprimable**, et **Présentation PowerPoint**.
   * Date et heure d'imputation horodatées sur chaque document et enregistrement.
7. **Remplacement Intégral de la Terminologie** :
   * Le vocabulaire des modules est propre à SAFE.

---

## 2. Démarrage du Projet

Dans le dossier `C:\Users\USER\OneDrive\Desktop\safe_Projet 2` :

```powershell
npm start
```
*(ou double-clic sur `run-safe.ps1`)*.

### Comptes utilisateurs

Aucun mot de passe prédéfini ne doit être utilisé. Créez des comptes propres à l'installation en suivant [README.md](README.md).

