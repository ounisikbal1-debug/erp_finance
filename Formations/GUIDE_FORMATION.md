# SAFE — Guide de formation

**Public** : comptables, contrôleurs de gestion, directeurs financiers, auditeurs.
**Durée** : 1 journée (ou 4 demi-journées). **Environnement** : mode formation (port 5200, bandeau bleu « MODE FORMATION »).

> Les données sont fictives et propres à chaque poste. Rien de ce qui est fait ici n'atteint la base réelle (port 5300). Le bouton « Remettre les données de formation à zéro » repart d'un état propre.

## Avant de commencer
1. Double-cliquez sur `Formations\Lancer Formation.cmd` (en salle : `Lancer Formation (reseau).cmd`, les stagiaires ouvrent l'adresse « Réseau »).
2. Connexion `admin` / `admin`. Comptes de rôle : `cfo`, `controller`, `auditor` (mêmes mots de passe).
3. Langues FR / EN / AR en haut à droite ; thèmes sombre, clair et gris dans **Paramètres → Apparence**.

## Parcours en 12 étapes

| # | Module | Objectif | Exercice | Résultat attendu |
|---|---|---|---|---|
| 1 | Tableau de bord | Lire les 6 indicateurs consolidés | Passer la période de « Exercice » à « T2 » ; filtrer l'entité Tunisie | Les chiffres changent ; le périmètre s'affiche dans l'en-tête |
| 2 | Compte de résultat | Comprendre CA → résultat net | Relever la marge d'EBITDA du groupe | Marge cohérente avec le tableau de bord |
| 3 | Comptabilité | Saisir une écriture | « Ajouter une écriture » : 12 500 en 611000 contre 401000, journal AC | L'écriture apparaît en tête du grand livre ; balance toujours équilibrée |
| 4 | Import Excel / CSV | Importer un fichier d'écritures | **Paramètres → Importer des écritures** : télécharger le modèle, puis importer `exemples\ecritures_formation.csv` | Aperçu : 5 écritures dont 2 en anomalie. Import confirmé ; chaque ligne rejoint le journal de sa colonne « Journal » |
| 5 | **Anomalies** | Faire contrôler l'ERP | Ouvrir **Anomalies** après l'étape 4 | FORM-002 déséquilibrée (écart 50), FORM-004 compte absent du plan (créé à l'import), FORM-005 une seule ligne |
| 6 | Trésorerie & BFR | Suivre la trésorerie | Lire la balance âgée clients | Encours par tranche d'ancienneté |
| 7 | Budget & Forecast | Budget contre réalisé | Réallouer le budget de +5 % | Les écarts sont recalculés ; la piste d'audit l'enregistre |
| 8 | Fiscalité | TVA et calendrier déclaratif | Identifier la prochaine échéance de TVA | Date et montant affichés |
| 9 | **Paie & effectifs** | Calcul et fiche de paie | Choisir octobre ; ajouter une **prime exceptionnelle** de 500 à un salarié ; imprimer sa fiche | La prime augmente le brut, les cotisations et l'impôt ; la fiche liste la prime |
| 10 | Paie — avance et prêt | Rubriques variables | Ajouter une **avance** de 300, puis un **prêt** de 200 sur 6 mensualités ; changer de mois | L'avance ne touche que le net ; le prêt apparaît (1/6 … 6/6) sur six mois |
| 11 | Multinationale & Interco | Rapprocher les flux | Repérer les flux « Écart » | Ils figurent aussi dans **Anomalies** |
| 12 | Clôture & sauvegarde | Fermer une période | Cocher les tâches de clôture ; **Paramètres → Sauvegarder la base maintenant** | Avancement mis à jour ; fichier JSON horodaté téléchargé |

## Corrigés détaillés

**Étape 4 — import.** Le modèle contient les colonnes `Date`, `Journal`, `Pièce`, `Compte`, `Libellé`, `Débit`, `Crédit`, `Entité`. Les lignes de même pièce, journal et date forment une écriture. Les écritures déséquilibrées sont **conservées** et signalées ; un montant illisible, une date invalide ou un journal inconnu refusent la ligne concernée. Une seconde importation du même fichier est bloquée comme doublon.

**Étape 5 — anomalies détectées par l'ERP** : écriture déséquilibrée, une seule ligne, compte / journal / entité inconnus, montants invalides, date hors exercice, pièce en double, pièce multi-entités, trésorerie créditrice, montant inhabituel, salarié (salaire nul, matricule en double), facture (montant nul, échéance avant émission, doublon), flux intragroupe non rapproché.

**Étape 9 — calcul de paie tunisienne** (paramétrable dans `src/lib/payroll.ts`, à faire valider par l'expert-comptable) :
1. Brut = salaire de base + indemnité de transport + gains imposables.
2. CNSS salarié = 9,68 % du brut (9,18 % + 0,5 % fonds de perte d'emploi).
3. Net imposable annuel = (brut − CNSS) × 12 ; moins 10 % de frais professionnels (plafond 2 000) ; moins déductions chef de famille (300) et enfants (100 chacun, 4 maximum).
4. IRPP : barème annuel progressif, divisé par 12. CSS : 0,5 % du revenu imposable annuel, divisé par 12.
5. Net à payer = brut − CNSS − IRPP − CSS + remboursements non imposables − avances et prêts.

*Cas de contrôle* : 4 520 TND de base, 3 enfants, non chef de famille → brut 4 670,000 ; CNSS 452,056 ; IRPP 1 045,293 ; CSS 20,131 ; **net 3 152,520**. Charges patronales 20,57 % (CNSS 17,07 + accidents du travail 0,5 + TFP 2 + FOPROLOS 1) = 960,619.

## Évaluation
- Importer un fichier de 10 écritures contenant 2 anomalies et expliquer chacune.
- Produire et imprimer la fiche d'un salarié avec une prime et un prêt.
- Restaurer une sauvegarde puis retrouver l'écriture saisie à l'étape 3.

## Module complémentaire — comptabilité avancée
| Module | Exercice | Résultat attendu |
|---|---|---|
| **Plan de comptes** | Créer le compte 625000 « Déplacements et missions », puis tenter de supprimer 512000 | Création enregistrée au journal d'audit ; suppression refusée car le compte porte des écritures |
| **Rapprochements bancaires** | Entité TN : importer un relevé CSV (Date ; Libellé ; Débit ; Crédit), cliquer « Pointage automatique » | Les lignes de même montant à ± 5 jours sont pointées ; le reste se pointe à la main ; écart relevé − compta = opérations non pointées |
| **Consolidation** | Ouvrir la consolidation du groupe, activer « Appliquer aux produits et charges » | Contrôle actif − passif à 0 ; produits et charges baissent du montant des flux intragroupe ; les flux « Écart » sont signalés |

## Module complémentaire — contrôle interne et sécurité
| Module | Exercice | Résultat attendu |
|---|---|---|
| **Utilisateurs & rôles** | Ouvrir l'utilisateur `auditor`, cocher « Saisir / modifier », enregistrer | Droit personnalisé affiché (« personnalisé ») ; la modification figure au journal d'audit |
| **Droits d'action** | Décocher « Exporter des données » pour `controller` puis tenter un export avec ce compte | Export refusé avec un message explicite |
| **Journal d'audit** | Filtrer par utilisateur, action et dates ; exporter en CSV | Chaque événement porte un sceau SHA-256 ; l'indicateur « Intégrité de la chaîne » est à « Intacte » |
| **Verrouillage** | Saisir 5 fois un mauvais mot de passe pour `cfo` | Compte verrouillé 5 min ; les échecs sont tracés (ECHEC_CONNEXION) |
| **Contrôle des flux de revenus** | Saisir en journal OD une écriture créditant 701000, puis rouvrir le module | Alerte critique « Produits saisis hors journal des ventes » ; les factures échues et commandes sans facture sont listées |

## Module complémentaire — paramètres fiscaux et paie
| Module | Exercice | Résultat attendu |
|---|---|---|
| **Paramètres fiscaux et paie** | Pays TN : passer la cotisation salarié à 10 %, date d'effet 01/11/2026, enregistrer | Nouvelle version datée ; la simulation montre l'effet sur le net ; l'écriture d'audit liste les champs modifiés |
| **Paie** | Comparer la paie d'octobre et de décembre | Octobre garde l'ancien taux, décembre applique la nouvelle version |
| **Autre pays** | « Ajouter un pays » (ex. DZ), choisir « Taux unique », enregistrer | Le profil copié est adapté ; exportable en JSON pour un autre poste |

## Analyse segmentée

Menu Performance → « Analyse segmentée » : choisissez des entités, une période, des journaux, des classes de comptes ; changez la dimension (entité, pays, mois, journal, classe, compte) et la mesure (produits, charges, résultat, trésorerie). Graphiques, tableau détaillé et export CSV suivent les filtres. « Enregistrer la vue » mémorise une combinaison sur ce poste.
