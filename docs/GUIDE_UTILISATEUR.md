# Guide utilisateur — SAFE

Ce guide décrit les gestes quotidiens d'un **Financial Manager** et d'un **Contrôleur de gestion** dans l'application, puis détaille chaque module.

---

## 1. Se connecter

1. Ouvrir l'URL de l'application.
2. Saisir un identifiant de démonstration (`admin`, `cfo`, `controller`, `auditor`) — le mot de passe est identique à l'identifiant.
3. Choisir la langue (FR / EN / AR) en haut à droite ; l'arabe bascule toute l'interface en RTL.

Le profil détermine les modules visibles et le droit d'écriture. Un auditeur ne voit ni les utilisateurs ni les paramètres, et ne peut pas modifier les données.

---

## 2. Les filtres globaux

Ils s'appliquent à tous les modules et sont mémorisés sur le poste :

| Filtre | Emplacement | Effet |
|---|---|---|
| **Périmètre** | Sélecteur en haut de la barre latérale | Groupe consolidé ou une entité (Tunisie, France, Émirats, Maroc) |
| **Période** | Barre supérieure | Cumul annuel, S1, S2, T1…T4, décembre |
| **Devise** | Profil / Paramètres | Conversion d'affichage TND, EUR, USD, AED, MAD |
| **Norme** | Badge de la barre supérieure / profil | NC 01 ou IFRS |

Le périmètre et la période filtrent les KPI, les tableaux et les exports. Les graphiques mensuels affichent toujours les 12 mois pour conserver la vision annuelle.

---

## 3. Routine quotidienne — Financial Manager

### 3.1 Ouvrir la journée
- **Tableau de bord** : vérifier CA, marge, EBITDA, résultat, trésorerie et cash-flow opérationnel.
- Lire les **notifications** (cloche) : TVA à déposer, flux interco non rapprochés, dépassements budgétaires, tâches de clôture.
- Contrôler le **runway** (mois de trésorerie disponibles) et la conversion cash.

### 3.2 Trésorerie
- **Trésorerie & BFR** : soldes par banque et par devise, BFR, DSO/DPO, balance âgée.
- Identifier les factures échues (> 90 jours) et déclencher les relances.
- Vérifier le rapprochement bancaire (statut rapproché / écart à justifier).
- Les relevés bancaires acceptent CSV/XLSX, OFX/QFX et MT940 après aperçu; le contenu importé ne crée pas d’écriture comptable. Pour MT940, les années sur deux chiffres suivent le pivot documenté à l’écran (70–99 = 19xx, 00–69 = 20xx), et la devise du fichier est contrôlée lorsqu’elle est fournie.

### 3.3 Écritures
- **Comptabilité & Grand Livre** → **Saisir une écriture**.
- Choisir la date, le journal, l'entité, le compte et la contrepartie ; saisir le libellé et le montant.
- L'écriture est automatiquement équilibrée (débit = crédit) et visible dans le grand livre et la balance.
- Le contrôle **Balance équilibrée** doit rester vert.

### 3.4 Paiements
- Le cash-flow présente les décaissements fournisseurs, salaires, impôts et intérêts.
- En cas de tension, utiliser le **scénario pessimiste** pour mesurer l'impact d'un retard de règlement client.

---

## 4. Routine hebdomadaire — Contrôleur de gestion

### 4.1 Chiffre d'affaires
- **Chiffre d'affaires** : mix produit, répartition par entité, top clients, factures en retard.
- Comparer le CA au budget ; analyser l'écart (+1,7 % dans la démo).
- Surveiller les **revenus récurrents** (licences + maintenance) et le DSO.

### 4.2 Charges
- **Charges** : structure de coûts, budget vs réel par nature, principaux fournisseurs.
- Repérer les postes en dépassement (rouge) et préparer les actions correctives.
- Vérifier le poids des charges sur le CA et le coût par salarié.

### 4.3 Budget
- **Budget & Forecast** : sélectionner Produits ou Charges.
- Tabuler sur **Par ligne** pour le détail budget / réalisé / écart / atteinte.
- **Ajuster le budget** applique un pourcentage à toutes les lignes du périmètre (ex. +5 %), avec journalisation.
- **Réinitialiser** restaure le budget de démonstration.

### 4.4 Intercompagnies
- **Multinationale & Interco** : vérifier les flux rapprochés (87,4 % dans la démo).
- La matrice entité × entité identifie les flux croisés.
- Les écarts (IC-2026-004/006/009) doivent être justifiés avant la consolidation.

---

## 5. Routine mensuelle — Clôture

1. **Clôture & Audit** : cocher les tâches au fur et à mesure.
   - Cut-off (FNP, produits à recevoir).
   - Rapprochements bancaires et interco.
   - Balance âgée et provisions.
   - Paie, CNSS, IRPP.
   - TVA et retenues.
   - Reporting groupe.
2. **Fiscalité** : contrôler la TVA collectée / déductible / à payer, l'IS et le calendrier. L'aperçu RS est un calcul distinct de l'IS : aucun taux RS n'est déduit du taux d'IS.
   - Les paramètres fiscaux tunisiens renseignés dans SAFE sont ceux documentés et validés par le spécialiste métier. Cette validation des règles ne prouve pas, à elle seule, que chaque calcul, chaque correspondance de formulaire et chaque cas limite est correctement implémenté.
   - Un aperçu manuel RS n'alimente pas la déclaration G50. L'export G50 disponible est un état de travail, pas le formulaire officiel DGI; les fichiers exportés portent la mention « préparation consultative — non déposable ».
   - Le workflow de certificat rapproche une facture fournisseur comptabilisée, un paiement fournisseur lié ou une autre pièce en TND. La préparation et l'émission sont des traces internes, pas une certification réglementaire ni un dépôt fiscal.
   - Le dossier de justification RS permet d'approuver la complétude d'une période : son montant est calculé uniquement depuis les certificats émis en TND. Un certificat préparé bloque l'approbation; toute modification ultérieure d'un certificat rend le rapprochement périmé.
   - Le dossier IS conserve une base et un montant saisis depuis un dossier fiscal externe, avec référence, note, acteur, date et version. SAFE ne recalcule ni la base ni l'IS; le taux pays est conservé comme instantané de contrôle. Une référence saisie n'est pas une pièce jointe ni une validation automatique.
   - Le total légal à payer reste indisponible : les règles officielles de cumul et de crédits ne sont pas implémentées. Ces dossiers améliorent le rapprochement interne, mais ne rendent pas l'export G50 déposable.
   - **Paie / CNSS / IRPP** : chaque fiche nouvellement générée conserve la version du calcul, la période, le pays, la devise, les paramètres, les tranches et les montants calculés. Le registre mensuel additionne uniquement les fiches enregistrées et signale les fiches manquantes ou anciennes sans instantané. Il ne prouve pas l'effectif réel (les dates de sortie ne sont pas gérées), ne produit pas les formulaires officiels CNSS/DGI et ne déclenche aucun dépôt ni paiement. Son CSV est un export interne de préparation.
3. **Comptabilité** : balance générale équilibrée ; consulter la piste d'audit.
4. **Rapports & Export** : consulter les vues de rapports calculés disponibles selon le profil; certains rapports et modules proposent des exports de travail. Aucun pack réglementaire certifié n'est fourni.
5. Mettre à jour le **forecast** de trésorerie et commenter les écarts.

---

## 6. Routine annuelle

- **Budget & Forecast** : construire le budget N+1 par entité et par ligne.
- **Compte de résultat** : arrêter les comptes, analyser les marges, calculer l'IS.
- **Clôture annuelle** : inventaire, liasse fiscale, dossier de révision, validation.
- **Interco** : éliminer les flux intragroupe et produire les comptes consolidés.
- **Paramètres** : mettre à jour les taux de change, l'auditeur et les entités.

---

## 7. Détail des modules

### Tableau de bord
Six KPI : CA, marge brute, EBITDA, résultat net, trésorerie, cash-flow opérationnel. Graphique produits/charges/résultat, principaux postes de charges, derniers mouvements, repères (produits, charges, valeur ajoutée, EBITDA, BFR, DSO, runway) et contrôle de consolidation.

### Cash-flow
- Trois scénarios : base, optimiste (DSO −14 %, DPO +10 %), pessimiste (DSO +16 %, DPO −7 %).
- Pont de trésorerie : ouverture → CFO → CFI → CFF → clôture.
- Tableau mensuel direct : encaissements, fournisseurs, salaires, impôts, intérêts, investissements, dette, variation nette.
- Free cash-flow, burn mensuel, runway.

### Chiffre d'affaires
CA par produit (5 lignes), par entité, top clients, factures, encours, DSO, revenus récurrents. Donut par entité et barres empilées par produit.

Dans le module Ventes, le répertoire clients est propre à la société authentifiée. Les coordonnées modifiées sont historisées avec l’auteur et la date. Les devis sont uniquement des brouillons; ils ne créent pas de facture ni d’écriture et ne remplacent pas le processus normal d’approbation/émission. La balance âgée peut préparer un texte de relance modifiable seulement pour les créances émises, échues et fiables à la date du jour; l’envoi reste manuel.

### Charges
Structure de coûts par nature, budget vs réel mensuel, tableau des écarts, fournisseurs, ratio de coûts.

### Stocks & articles
Le stock global conserve le champ historique `Material.quantity`. Les quantités existantes restent non affectées à un dépôt; un transfert peut les affecter à un entrepôt ou déplacer un solde d'un entrepôt à un autre sans changer le stock global ni créer d'écriture. Les articles acceptent un code-barres, une unité et un seuil d'alerte sur le stock global. L'historique affiche les entrées initiales, ajustements manuels, mouvements de production validés et deux côtés de chaque transfert.

Un ajustement manuel demande un motif et l'utilisateur authentifié; la variation de quantité, l'écriture comptable et la trace d'audit sont validées ensemble. Un transfert est scoppé à la société, protégé par une clé d'idempotence et non comptable. Une réception fournisseur exige une facture approuvée pour la même société; si elle porte sur une ligne de commande approuvée, le système contrôle aussi le fournisseur, l'article, le prix et le reliquat. La facture peut être préparée et approuvée avant la réception, mais sa comptabilisation est bloquée tant que chaque ligne matérielle n'est pas réceptionnée nette des retours. La réception actualise le stock du dépôt et le coût moyen global, et crée un mouvement idempotent sans écriture comptable; l'écriture intervient avec la comptabilisation de la facture. Les anciennes factures sans détail de lignes restent rapprochables au niveau du HT. Le picking multi-lignes réserve atomiquement le stock disponible sans modifier la quantité physique. La confirmation idempotente de l'expédition consomme cette réservation et décrémente le stock global et du dépôt, puis crée un mouvement `DISPATCH`; l'annulation avant expédition libère la réservation.

### Production
Le tableau de production compare le prix de vente saisi au coût unitaire moyen courant. L'écart affiché est indicatif, par unité, et ne tient pas compte des taxes, remises ou frais non saisis; pour les produits fabriqués, le coût moyen reprend les matières, la main-d'œuvre et les frais indirects saisis dans les ordres confirmés. Ce n'est pas une marge comptable complète.

### Compte de résultat
Rapport de période en lecture seule : mouvements nets des comptes de produits et charges issus des écritures POSTED, couverture de données et repères déterministes SAFE. La période peut être comparée descriptivement à la même période N-1 et exportée dans un classeur consultatif avec les lignes budgétaires approuvées des seuls mois civils complets. Une projection annuelle indicative peut être présentée pour une période depuis le 1er janvier si les comparatifs N/N-1 et l’année complète N-1 sont disponibles et leur couverture complète; elle applique mécaniquement la variation observée à la base N-1, sans saisonnalité. Ce rapport n’est pas un état réglementaire certifié, ne calcule pas les marges/EBITDA/IS et ne déclenche aucune action. Le classeur ne reprend pas les scénarios de trésorerie.

### Trésorerie & BFR
Position, BFR, DSO/DPO, ratio de liquidité. Courbe trésorerie/BFR, comptes bancaires (équivalent dans la devise du compte), balance âgée clients/fournisseurs (non échu, 0-30, 31-60, 61-90, > 90).

### Comptabilité & Grand Livre
Grand livre filtrable (recherche, journal), balance générale, saisie d'écritures, total débit/crédit et contrôle d'équilibre.

### Fiscalité
TVA mensuelle (collectée, déductible, due), IS, taux par pays (15 % Tunisie, 25 % France, 9 % Émirats, 20 % Maroc), calendrier déclaratif, taux effectif.

### Paie & effectifs
Masse salariale, effectif, coût moyen, charges patronales, répartition par entité, détail par salarié (brut, CNSS, IRPP, net, charges patronales), prime de décembre.

La simulation n'enregistre pas de fiche. Lorsqu'une fiche est générée, SAFE conserve les montants calculés et un instantané détaillé du moteur, des paramètres, des tranches, des entrées et des résultats employés. Le moteur de calcul n'est disponible que pour la Tunisie; il utilise par défaut 4 % et un plafond annuel de déduction partagé avec les autres avantages fiscaux, actuellement limité à 10 000. Les fiches antérieures à l'instantané détaillé restent identifiées comme historiques. Le registre mensuel CNSS/IRPP est une préparation interne non déposable et reste à revoir; il ne remplace ni les formulaires officiels ni la preuve d'un dépôt.

### Documents RH
Les métadonnées des documents du personnel peuvent recevoir un fichier PDF, JPEG ou PNG (8 Mio maximum, un fichier par document). L’activation exige la migration RH additive correspondante, à appliquer par l’administrateur selon la procédure de sauvegarde et de changement de schéma de l’installation. Les fichiers sont stockés sous une référence opaque dans `data/private/hr-documents` ou dans le chemin absolu défini par `SAFE_ERP_PRIVATE_STORAGE_DIR`; le serveur refuse un répertoire situé dans `public`, `dist` ou le dossier de l’interface. L’API RH exige le rôle autorisé et vérifie l’entité à chaque consultation/téléchargement. Les chemins de stockage ne sont pas transmis à l’interface; les téléchargements sont en pièce jointe et vérifiés par empreinte SHA-256. L’accès direct au dossier doit aussi être limité par les permissions du compte de service et les sauvegardes du système d’exploitation; SAFE ne chiffre pas ces fichiers au repos et ne réalise pas d’analyse antivirus. La migration RH ajoute uniquement les métadonnées de stockage et ne déplace ni ne supprime de fichiers existants. Aucune durée légale de conservation ni purge automatique n’est définie: faites valider la politique de conservation avant toute suppression.

### Multinationale & Interco
Flux intragroupe, statuts, matrice des flux, écarts, éliminations, taux de rapprochement.

### Clôture & Audit
Checklist par périodicité, progression, validation des tâches (horodatée), piste d'audit, dossier de révision.

### Rapports & Export
La vue présente les rapports calculés disponibles selon le profil : compte de résultat, synthèse comptable et bilan, balance générale, grand livre, budget et réel, prévision annuelle, trésorerie, balances âgées clients et fournisseurs, et fiscalité. Les vues reposent sur les données de la société authentifiée; certains rapports proposent des exports. Aucun catalogue fixe de 12 rapports, pack complet de 28 onglets ou pack réglementaire certifié n'est fourni. Les rapports et exports de travail ne remplacent pas des documents de conformité.

### Utilisateurs & rôles
Création / modification / suppression, rôle, périmètre d'entités, activation, matrice de permissions.

### Paramètres
Identité du groupe, exercice, devise de consolidation, norme, TVA, auditeur, délai de reporting, méthode de consolidation, taux de change, entités, apparence, export JSON, réinitialisation.

---

## 8. Raccourcis et confort

- **⌘K / Ctrl+K** : palette de recherche (modules, comptes, entités, clients).
- **Échap** : fermer une modale.
- Bascule **sombre / clair** dans la barre supérieure.
- Langue et devise dans le menu profil (avatar).
- La barre latérale est repliable (icône en haut à droite) et devient un tiroir sur mobile.

---

## 9. Données et sauvegarde

Dans la version serveur de SAFE de ce dépôt, les données métier sont stockées dans la base SQLite configurée par `SAFE_ERP_DATABASE_URL` (par défaut `src/data/data.db`), et non dans le navigateur. Il n’existe pas de fonction utilisateur d’export ou de restauration dans l’interface : les opérations de sauvegarde et de restauration de la base sont réservées à l’exploitant et décrites dans [`docs/DEPLOIEMENT_WEB.md`](DEPLOIEMENT_WEB.md#7-sauvegarde-et-restauration-sqlite). Une restauration nécessite l’arrêt préalable du service.

---

## 10. Questions fréquentes

**Pourquoi les montants changent-ils quand je change de devise ?**
Les données sont stockées en dinars tunisiens consolidés, puis converties au taux de clôture pour l'affichage et l'export.

**Pourquoi le DSO est-il plus élevé que le délai contractuel ?**
Le DSO est calculé sur l'encours de fin d'année, dans un mois de décembre à forte activité ; il reflète donc le pic de facturation.

**Puis-je travailler sur une seule entité ?**
Oui : sélectionner l'entité dans la barre latérale ; tous les KPI, tableaux et exports sont restreints à son périmètre.

**L'export Excel est-il modifiable ?**
Oui, c'est un vrai fichier `.xlsx` avec des valeurs numériques, des filtres et des totaux ; il peut être retravaillé dans Excel.

**Les mots de passe sont-ils sécurisés ?**
Non dans cette démonstration : ils sont stockés localement en clair. Une authentification SSO et un hachage Argon2 sont prévus pour la version production.
