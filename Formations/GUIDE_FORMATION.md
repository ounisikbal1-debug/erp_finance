# SAFE â€” Guide de formation

**Public** : comptables, contrÃ´leurs de gestion, directeurs financiers, auditeurs.
**DurÃ©e** : 1 journÃ©e (ou 4 demi-journÃ©es). **Environnement** : mode formation (port 5200, bandeau bleu Â« MODE FORMATION Â»).

> Les donnÃ©es sont fictives et propres Ã  chaque poste. Rien de ce qui est fait ici n'atteint la base rÃ©elle (port 5300). Le bouton Â« Remettre les donnÃ©es de formation Ã  zÃ©ro Â» repart d'un Ã©tat propre.

## Avant de commencer
1. Double-cliquez sur `Formations\Lancer Formation.cmd` (en salle : `Lancer Formation (reseau).cmd`, les stagiaires ouvrent l'adresse Â« RÃ©seau Â»).
2. Connexion `admin` / `admin`. Comptes de rÃ´le : `cfo`, `controller`, `auditor` (mÃªmes mots de passe).
3. Langues FR / EN / AR en haut Ã  droite ; thÃ¨mes sombre, clair et gris dans **ParamÃ¨tres â†’ Apparence**.

## Parcours en 12 Ã©tapes

| # | Module | Objectif | Exercice | RÃ©sultat attendu |
|---|---|---|---|---|
| 1 | Tableau de bord | Lire les 6 indicateurs consolidÃ©s | Passer la pÃ©riode de Â« Exercice Â» Ã  Â« T2 Â» ; filtrer l'entitÃ© Tunisie | Les chiffres changent ; le pÃ©rimÃ¨tre s'affiche dans l'en-tÃªte |
| 2 | Compte de rÃ©sultat | Comprendre CA â†’ rÃ©sultat net | Relever la marge d'EBITDA du groupe | Marge cohÃ©rente avec le tableau de bord |
| 3 | ComptabilitÃ© | Saisir une Ã©criture | Â« Ajouter une Ã©criture Â» : 12 500 en 611000 contre 401000, journal AC | L'Ã©criture apparaÃ®t en tÃªte du grand livre ; balance toujours Ã©quilibrÃ©e |
| 4 | Import Excel / CSV | Importer un fichier d'Ã©critures | **ParamÃ¨tres â†’ Importer des Ã©critures** : tÃ©lÃ©charger le modÃ¨le, puis importer `exemples\ecritures_formation.csv` | AperÃ§u : 5 Ã©critures dont 2 en anomalie. Import confirmÃ© ; chaque ligne rejoint le journal de sa colonne Â« Journal Â» |
| 5 | **Anomalies** | Faire contrÃ´ler l'ERP | Ouvrir **Anomalies** aprÃ¨s l'Ã©tape 4 | FORM-002 dÃ©sÃ©quilibrÃ©e (Ã©cart 50), FORM-004 compte absent du plan (crÃ©Ã© Ã  l'import), FORM-005 une seule ligne |
| 6 | TrÃ©sorerie & BFR | Suivre la trÃ©sorerie | Lire la balance Ã¢gÃ©e clients | Encours par tranche d'anciennetÃ© |
| 7 | Budget & Forecast | Budget contre rÃ©alisÃ© | RÃ©allouer le budget de +5 % | Les Ã©carts sont recalculÃ©s ; la piste d'audit l'enregistre |
| 8 | FiscalitÃ© | TVA et calendrier dÃ©claratif | Identifier la prochaine Ã©chÃ©ance de TVA | Date et montant affichÃ©s |
| 9 | **Paie & effectifs** | Calcul et fiche de paie | Choisir octobre ; ajouter une **prime exceptionnelle** de 500 Ã  un salariÃ© ; imprimer sa fiche | La prime augmente le brut, les cotisations et l'impÃ´t ; la fiche liste la prime |
| 10 | Paie â€” avance et prÃªt | Rubriques variables | Ajouter une **avance** de 300, puis un **prÃªt** de 200 sur 6 mensualitÃ©s ; changer de mois | L'avance ne touche que le net ; le prÃªt apparaÃ®t (1/6 â€¦ 6/6) sur six mois |
| 11 | Multinationale & Interco | Rapprocher les flux | RepÃ©rer les flux Â« Ã‰cart Â» | Ils figurent aussi dans **Anomalies** |
| 12 | ClÃ´ture & sauvegarde | Fermer une pÃ©riode | Cocher les tÃ¢ches de clÃ´ture ; **ParamÃ¨tres â†’ Sauvegarder la base maintenant** | Avancement mis Ã  jour ; fichier JSON horodatÃ© tÃ©lÃ©chargÃ© |

## CorrigÃ©s dÃ©taillÃ©s

**Ã‰tape 4 â€” import.** Le modÃ¨le contient les colonnes `Date`, `Journal`, `PiÃ¨ce`, `Compte`, `LibellÃ©`, `DÃ©bit`, `CrÃ©dit`, `EntitÃ©`. Les lignes de mÃªme piÃ¨ce, journal et date forment une Ã©criture. Les Ã©critures dÃ©sÃ©quilibrÃ©es sont **conservÃ©es** et signalÃ©es ; un montant illisible, une date invalide ou un journal inconnu refusent la ligne concernÃ©e. Une seconde importation du mÃªme fichier est bloquÃ©e comme doublon.

**Ã‰tape 5 â€” anomalies dÃ©tectÃ©es par l'ERP** : Ã©criture dÃ©sÃ©quilibrÃ©e, une seule ligne, compte / journal / entitÃ© inconnus, montants invalides, date hors exercice, piÃ¨ce en double, piÃ¨ce multi-entitÃ©s, trÃ©sorerie crÃ©ditrice, montant inhabituel, salariÃ© (salaire nul, matricule en double), facture (montant nul, Ã©chÃ©ance avant Ã©mission, doublon), flux intragroupe non rapprochÃ©.

**Ã‰tape 9 â€” calcul de paie tunisienne** (paramÃ©trable dans `src/lib/payroll.ts`, Ã  faire valider par l'expert-comptable) :
1. Brut = salaire de base + indemnitÃ© de transport + gains imposables.
2. CNSS salariÃ© = 9,68 % du brut (9,18 % + 0,5 % fonds de perte d'emploi).
3. Net imposable annuel = (brut âˆ’ CNSS) Ã— 12 ; moins 10 % de frais professionnels (plafond 2 000) ; moins dÃ©ductions chef de famille (300) et enfants (100 chacun, 4 maximum).
4. IRPP : barÃ¨me annuel progressif, divisÃ© par 12. CSS : 0,5 % du revenu imposable annuel, divisÃ© par 12.
5. Net Ã  payer = brut âˆ’ CNSS âˆ’ IRPP âˆ’ CSS + remboursements non imposables âˆ’ avances et prÃªts.

*Cas de contrÃ´le* : 4 520 TND de base, 3 enfants, non chef de famille â†’ brut 4 670,000 ; CNSS 452,056 ; IRPP 1 045,293 ; CSS 20,131 ; **net 3 152,520**. Charges patronales 20,57 % (CNSS 17,07 + accidents du travail 0,5 + TFP 2 + FOPROLOS 1) = 960,619.

## Ã‰valuation
- Importer un fichier de 10 Ã©critures contenant 2 anomalies et expliquer chacune.
- Produire et imprimer la fiche d'un salariÃ© avec une prime et un prÃªt.
- Restaurer une sauvegarde puis retrouver l'Ã©criture saisie Ã  l'Ã©tape 3.

## Module complÃ©mentaire â€” comptabilitÃ© avancÃ©e
| Module | Exercice | RÃ©sultat attendu |
|---|---|---|
| **Plan de comptes** | CrÃ©er le compte 625000 Â« DÃ©placements et missions Â», puis tenter de supprimer 512000 | CrÃ©ation enregistrÃ©e au journal d'audit ; suppression refusÃ©e car le compte porte des Ã©critures |
| **Rapprochements bancaires** | EntitÃ© TN : importer un relevÃ© CSV (Date ; LibellÃ© ; DÃ©bit ; CrÃ©dit), cliquer Â« Pointage automatique Â» | Les lignes de mÃªme montant Ã  Â± 5 jours sont pointÃ©es ; le reste se pointe Ã  la main ; Ã©cart relevÃ© âˆ’ compta = opÃ©rations non pointÃ©es |
| **Consolidation** | Ouvrir la consolidation du groupe, activer Â« Appliquer aux produits et charges Â» | ContrÃ´le actif âˆ’ passif Ã  0 ; produits et charges baissent du montant des flux intragroupe ; les flux Â« Ã‰cart Â» sont signalÃ©s |

## Module complÃ©mentaire â€” contrÃ´le interne et sÃ©curitÃ©
| Module | Exercice | RÃ©sultat attendu |
|---|---|---|
| **Utilisateurs & rÃ´les** | Ouvrir l'utilisateur `auditor`, cocher Â« Saisir / modifier Â», enregistrer | Droit personnalisÃ© affichÃ© (Â« personnalisÃ© Â») ; la modification figure au journal d'audit |
| **Droits d'action** | DÃ©cocher Â« Exporter des donnÃ©es Â» pour `controller` puis tenter un export avec ce compte | Export refusÃ© avec un message explicite |
| **Journal d'audit** | Filtrer par utilisateur, action et dates ; exporter en CSV | Chaque Ã©vÃ©nement porte un sceau SHA-256 ; l'indicateur Â« IntÃ©gritÃ© de la chaÃ®ne Â» est Ã  Â« Intacte Â» |
| **Verrouillage** | Saisir 5 fois un mauvais mot de passe pour `cfo` | Compte verrouillÃ© 5 min ; les Ã©checs sont tracÃ©s (ECHEC_CONNEXION) |
| **ContrÃ´le des flux de revenus** | Saisir en journal OD une Ã©criture crÃ©ditant 701000, puis rouvrir le module | Alerte critique Â« Produits saisis hors journal des ventes Â» ; les factures Ã©chues et commandes sans facture sont listÃ©es |

## Module complÃ©mentaire â€” paramÃ¨tres fiscaux et paie
| Module | Exercice | RÃ©sultat attendu |
|---|---|---|
| **ParamÃ¨tres fiscaux et paie** | Pays TN : passer la cotisation salariÃ© Ã  10 %, date d'effet 01/11/2026, enregistrer | Nouvelle version datÃ©e ; la simulation montre l'effet sur le net ; l'Ã©criture d'audit liste les champs modifiÃ©s |
| **Paie** | Comparer la paie d'octobre et de dÃ©cembre | Octobre garde l'ancien taux, dÃ©cembre applique la nouvelle version |
| **Autre pays** | Â« Ajouter un pays Â» (ex. DZ), choisir Â« Taux unique Â», enregistrer | Le profil copiÃ© est adaptÃ© ; exportable en JSON pour un autre poste |

## Analyse segmentÃ©e

Menu Performance â†’ Â« Analyse segmentÃ©e Â» : choisissez des entitÃ©s, une pÃ©riode, des journaux, des classes de comptes ; changez la dimension (entitÃ©, pays, mois, journal, classe, compte) et la mesure (produits, charges, rÃ©sultat, trÃ©sorerie). Graphiques, tableau dÃ©taillÃ© et export CSV suivent les filtres. Â« Enregistrer la vue Â» mÃ©morise une combinaison sur ce poste.
