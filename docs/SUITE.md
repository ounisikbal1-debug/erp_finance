# SAFE Suite — décision d'architecture et feuille de route

## Décision : une suite unique, pas des applications séparées

Créer quatre applications distinctes (finance, comptabilité, stocks/achats, ventes, RH) multiplierait les coûts et casserait l'expérience : quatre connexions, quatre bases, quatre exports, aucune vue consolidée. La bonne architecture est **une seule suite**, avec des modules partageant la même base synchronisée.

Déjà présents :

- Finance & pilotage (tableau de bord, cash-flow, budget, trésorerie, fiscalité, consolidation)
- Comptabilité & grand livre
- Paie & effectifs

## Ordre de construction choisi

### 1. Ventes & Facturation — priorité immédiate

**Pourquoi en premier :** c'est le module le plus rapide à livrer avec un haut niveau de valeur, car les données existent déjà (clients, factures, chiffre d'affaires, encours, DSO). Il réutilise les sélecteurs et les exports sans nouveau socle.

Périmètre :
- clients et contacts ;
- devis, commandes, factures, avoirs ;
- statuts (brouillon, validé, facturé, payé, en retard) ;
- encaissements et relances ;
- marge par client / produit ;
- export Excel dédié et intégration au pack groupe.

### 2. Achats & Stocks — deuxième

**Pourquoi ensuite :** plus lourd (articles, unités, dépôts, mouvements, valorisation, seuils de réapprovisionnement, commandes fournisseurs), mais fort différentiel pour une PME.

Périmètre :
- articles, familles, unités, codes-barres ;
- stock par dépôt, mouvements (entrée, sortie, transfert, inventaire) ;
- commandes fournisseurs et réceptions ;
- valorisation (CUMP ou FIFO) et alertes de seuil ;
- rapprochement achats / factures fournisseurs.

### 3. RH — troisième

La paie existe déjà. Les parcours administratifs suivants sont disponibles : salariés, demandes et compteurs de congés configurables (avec source/référence de politique et date d’effet auditées), métadonnées et stockage privé de documents, postes et candidatures avec anonymisation, entretiens planifiés et notes de frais soumises à approbation/rejet. Les soldes utilisent des droits configurés par salarié/type/année et les absences enregistrées; ils ne calculent pas l'acquisition légale, les reports, les proratas, les jours fériés ou les règles conventionnelles. L’approbation des frais ne génère ni paiement ni écriture comptable.

Restent à réaliser ou valider : calcul légal des congés (pays, convention, ancienneté, temps partiel, reports et calendrier officiel); formation/GPEC (processus, rôles, référentiels compétences et obligations); paiement/comptabilisation des frais (méthodes de paiement, comptes et journaux approuvés, intégration bancaire et contrôles); paie opérationnelle hors Tunisie (le moteur refuse les autres pays). Les fiches nouvellement générées conservent désormais un instantané des paramètres, tranches, entrées et résultats; le registre mensuel CNSS/IRPP réconcilie les fiches enregistrées mais reste une préparation interne non déposable et ne certifie pas l’effectif, notamment faute de dates de sortie des salariés. Le propriétaire du projet confirme que les taux et règles tunisiens, notamment CNSS, IRPP et IS, sont documentés et validés par un expert-comptable; préserver ces valeurs et vérifier séparément que chaque parcours logiciel les applique correctement. Pour les autres pays, obtenir les paramètres réglementaires par juridiction et période d’effet ainsi que la confirmation explicite du client avant activation. La retraite complémentaire conserve ses paramètres actuels, mais le taux par défaut de 4 % et le plafond annuel partagé de 10 000 ne font pas partie de cette confirmation et restent à valider. La validation des règles ne certifie pas à elle seule les calculs, les déclarations, ni la conformité opérationnelle du logiciel.

## Pourquoi cet ordre

| Module | Réutilisation | Complexité | Valeur |
|---|---|---|---|
| Ventes | Très forte (factures, clients, CA) | Moyenne | Très forte |
| Achats & Stocks | Moyenne (fournisseurs, charges) | Élevée | Forte |
| RH | Faible (paie existante) | Moyenne | Moyenne |

Ventes permet de livrer vite un module complet et vendable, puis de capitaliser sur le même socle pour Achats & Stocks.

## Règles d'architecture pour chaque module

1. Même coquille, même design system, même navigation.
2. Même base `db` synchronisée : toute écriture est immédiatement visible par les autres utilisateurs.
3. Mêmes rôles et permissions.
4. Même moteur d'export Excel (couverture, onglets, styles).
5. Mêmes traductions FR / EN / AR.
6. Aucune application séparée, aucun second backend.

## Prochaine étape

Construire **Ventes & Facturation** : modèle de données commandes/devis, écran de gestion, création de facture, encaissements, indicateurs et export. Les autres modules suivront dans l'ordre ci-dessus.
