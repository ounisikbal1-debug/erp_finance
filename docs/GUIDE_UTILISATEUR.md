# Guide utilisateur â€” SAFE

Ce guide dÃ©crit les gestes quotidiens d'un **Financial Manager** et d'un **ContrÃ´leur de gestion** dans l'application, puis dÃ©taille chaque module.

---

## 1. Se connecter

1. Ouvrir l'URL de l'application.
2. Saisir un identifiant de dÃ©monstration (`admin`, `cfo`, `controller`, `auditor`) â€” le mot de passe est identique Ã  l'identifiant.
3. Choisir la langue (FR / EN / AR) en haut Ã  droite ; l'arabe bascule toute l'interface en RTL.

Le profil dÃ©termine les modules visibles et le droit d'Ã©criture. Un auditeur ne voit ni les utilisateurs ni les paramÃ¨tres, et ne peut pas modifier les donnÃ©es.

---

## 2. Les filtres globaux

Ils s'appliquent Ã  tous les modules et sont mÃ©morisÃ©s sur le poste :

| Filtre | Emplacement | Effet |
|---|---|---|
| **PÃ©rimÃ¨tre** | SÃ©lecteur en haut de la barre latÃ©rale | Groupe consolidÃ© ou une entitÃ© (Tunisie, France, Ã‰mirats, Maroc) |
| **PÃ©riode** | Barre supÃ©rieure | Cumul annuel, S1, S2, T1â€¦T4, dÃ©cembre |
| **Devise** | Profil / ParamÃ¨tres | Conversion d'affichage TND, EUR, USD, AED, MAD |
| **Norme** | Badge de la barre supÃ©rieure / profil | NC 01 ou IFRS |

Le pÃ©rimÃ¨tre et la pÃ©riode filtrent les KPI, les tableaux et les exports. Les graphiques mensuels affichent toujours les 12 mois pour conserver la vision annuelle.

---

## 3. Routine quotidienne â€” Financial Manager

### 3.1 Ouvrir la journÃ©e
- **Tableau de bord** : vÃ©rifier CA, marge, EBITDA, rÃ©sultat, trÃ©sorerie et cash-flow opÃ©rationnel.
- Lire les **notifications** (cloche) : TVA Ã  dÃ©poser, flux interco non rapprochÃ©s, dÃ©passements budgÃ©taires, tÃ¢ches de clÃ´ture.
- ContrÃ´ler le **runway** (mois de trÃ©sorerie disponibles) et la conversion cash.

### 3.2 TrÃ©sorerie
- **TrÃ©sorerie & BFR** : soldes par banque et par devise, BFR, DSO/DPO, balance Ã¢gÃ©e.
- Identifier les factures Ã©chues (> 90 jours) et dÃ©clencher les relances.
- VÃ©rifier le rapprochement bancaire (statut rapprochÃ© / Ã©cart Ã  justifier).
- Les relevÃ©s bancaires acceptent CSV/XLSX, OFX/QFX et MT940 aprÃ¨s aperÃ§u; le contenu importÃ© ne crÃ©e pas dâ€™Ã©criture comptable. Pour MT940, les annÃ©es sur deux chiffres suivent le pivot documentÃ© Ã  lâ€™Ã©cran (70â€“99 = 19xx, 00â€“69 = 20xx), et la devise du fichier est contrÃ´lÃ©e lorsquâ€™elle est fournie.

### 3.3 Ã‰critures
- **ComptabilitÃ© & Grand Livre** â†’ **Saisir une Ã©criture**.
- Choisir la date, le journal, l'entitÃ©, le compte et la contrepartie ; saisir le libellÃ© et le montant.
- L'Ã©criture est automatiquement Ã©quilibrÃ©e (dÃ©bit = crÃ©dit) et visible dans le grand livre et la balance.
- Le contrÃ´le **Balance Ã©quilibrÃ©e** doit rester vert.

### 3.4 Paiements
- Le cash-flow prÃ©sente les dÃ©caissements fournisseurs, salaires, impÃ´ts et intÃ©rÃªts.
- En cas de tension, utiliser le **scÃ©nario pessimiste** pour mesurer l'impact d'un retard de rÃ¨glement client.

---

## 4. Routine hebdomadaire â€” ContrÃ´leur de gestion

### 4.1 Chiffre d'affaires
- **Chiffre d'affaires** : mix produit, rÃ©partition par entitÃ©, top clients, factures en retard.
- Comparer le CA au budget ; analyser l'Ã©cart (+1,7 % dans la dÃ©mo).
- Surveiller les **revenus rÃ©currents** (licences + maintenance) et le DSO.

### 4.2 Charges
- **Charges** : structure de coÃ»ts, budget vs rÃ©el par nature, principaux fournisseurs.
- RepÃ©rer les postes en dÃ©passement (rouge) et prÃ©parer les actions correctives.
- VÃ©rifier le poids des charges sur le CA et le coÃ»t par salariÃ©.

### 4.3 Budget
- **Budget & Forecast** : sÃ©lectionner Produits ou Charges.
- Tabuler sur **Par ligne** pour le dÃ©tail budget / rÃ©alisÃ© / Ã©cart / atteinte.
- **Ajuster le budget** applique un pourcentage Ã  toutes les lignes du pÃ©rimÃ¨tre (ex. +5 %), avec journalisation.
- **RÃ©initialiser** restaure le budget de dÃ©monstration.

### 4.4 Intercompagnies
- **Multinationale & Interco** : vÃ©rifier les flux rapprochÃ©s (87,4 % dans la dÃ©mo).
- La matrice entitÃ© Ã— entitÃ© identifie les flux croisÃ©s.
- Les Ã©carts (IC-2026-004/006/009) doivent Ãªtre justifiÃ©s avant la consolidation.

---

## 5. Routine mensuelle â€” ClÃ´ture

1. **ClÃ´ture & Audit** : cocher les tÃ¢ches au fur et Ã  mesure.
   - Cut-off (FNP, produits Ã  recevoir).
   - Rapprochements bancaires et interco.
   - Balance Ã¢gÃ©e et provisions.
   - Paie, CNSS, IRPP.
   - TVA et retenues.
   - Reporting groupe.
2. **FiscalitÃ©** : contrÃ´ler la TVA collectÃ©e / dÃ©ductible / Ã  payer, l'IS et le calendrier. L'aperÃ§u RS est un calcul distinct de l'IS : aucun taux RS n'est dÃ©duit du taux d'IS.
   - Les paramÃ¨tres fiscaux tunisiens renseignÃ©s dans SAFE sont ceux documentÃ©s et validÃ©s par le spÃ©cialiste mÃ©tier. Cette validation des rÃ¨gles ne prouve pas, Ã  elle seule, que chaque calcul, chaque correspondance de formulaire et chaque cas limite est correctement implÃ©mentÃ©.
   - Un aperÃ§u manuel RS n'alimente pas la dÃ©claration G50. L'export G50 disponible est un Ã©tat de travail, pas le formulaire officiel DGI; les fichiers exportÃ©s portent la mention Â« prÃ©paration consultative â€” non dÃ©posable Â».
   - Le workflow de certificat rapproche une facture fournisseur comptabilisÃ©e, un paiement fournisseur liÃ© ou une autre piÃ¨ce en TND. La prÃ©paration et l'Ã©mission sont des traces internes, pas une certification rÃ©glementaire ni un dÃ©pÃ´t fiscal.
   - Le dossier de justification RS permet d'approuver la complÃ©tude d'une pÃ©riode : son montant est calculÃ© uniquement depuis les certificats Ã©mis en TND. Un certificat prÃ©parÃ© bloque l'approbation; toute modification ultÃ©rieure d'un certificat rend le rapprochement pÃ©rimÃ©.
   - Le dossier IS conserve une base et un montant saisis depuis un dossier fiscal externe, avec rÃ©fÃ©rence, note, acteur, date et version. SAFE ne recalcule ni la base ni l'IS; le taux pays est conservÃ© comme instantanÃ© de contrÃ´le. Une rÃ©fÃ©rence saisie n'est pas une piÃ¨ce jointe ni une validation automatique.
   - Le total lÃ©gal Ã  payer reste indisponible : les rÃ¨gles officielles de cumul et de crÃ©dits ne sont pas implÃ©mentÃ©es. Ces dossiers amÃ©liorent le rapprochement interne, mais ne rendent pas l'export G50 dÃ©posable.
   - **Paie / CNSS / IRPP** : chaque fiche nouvellement gÃ©nÃ©rÃ©e conserve la version du calcul, la pÃ©riode, le pays, la devise, les paramÃ¨tres, les tranches et les montants calculÃ©s. Le registre mensuel additionne uniquement les fiches enregistrÃ©es et signale les fiches manquantes ou anciennes sans instantanÃ©. Il ne prouve pas l'effectif rÃ©el (les dates de sortie ne sont pas gÃ©rÃ©es), ne produit pas les formulaires officiels CNSS/DGI et ne dÃ©clenche aucun dÃ©pÃ´t ni paiement. Son CSV est un export interne de prÃ©paration.
3. **ComptabilitÃ©** : balance gÃ©nÃ©rale Ã©quilibrÃ©e ; consulter la piste d'audit.
4. **Rapports & Export** : consulter les vues de rapports calculÃ©s disponibles selon le profil; certains rapports et modules proposent des exports de travail. Aucun pack rÃ©glementaire certifiÃ© n'est fourni.
5. Mettre Ã  jour le **forecast** de trÃ©sorerie et commenter les Ã©carts.

---

## 6. Routine annuelle

- **Budget & Forecast** : construire le budget N+1 par entitÃ© et par ligne.
- **Compte de rÃ©sultat** : arrÃªter les comptes, analyser les marges, calculer l'IS.
- **ClÃ´ture annuelle** : inventaire, liasse fiscale, dossier de rÃ©vision, validation.
- **Interco** : Ã©liminer les flux intragroupe et produire les comptes consolidÃ©s.
- **ParamÃ¨tres** : mettre Ã  jour les taux de change, l'auditeur et les entitÃ©s.

---

## 7. DÃ©tail des modules

### Tableau de bord
Six KPI : CA, marge brute, EBITDA, rÃ©sultat net, trÃ©sorerie, cash-flow opÃ©rationnel. Graphique produits/charges/rÃ©sultat, principaux postes de charges, derniers mouvements, repÃ¨res (produits, charges, valeur ajoutÃ©e, EBITDA, BFR, DSO, runway) et contrÃ´le de consolidation.

### Cash-flow
- Trois scÃ©narios : base, optimiste (DSO âˆ’14 %, DPO +10 %), pessimiste (DSO +16 %, DPO âˆ’7 %).
- Pont de trÃ©sorerie : ouverture â†’ CFO â†’ CFI â†’ CFF â†’ clÃ´ture.
- Tableau mensuel direct : encaissements, fournisseurs, salaires, impÃ´ts, intÃ©rÃªts, investissements, dette, variation nette.
- Free cash-flow, burn mensuel, runway.

### Chiffre d'affaires
CA par produit (5 lignes), par entitÃ©, top clients, factures, encours, DSO, revenus rÃ©currents. Donut par entitÃ© et barres empilÃ©es par produit.

Dans le module Ventes, le rÃ©pertoire clients est propre Ã  la sociÃ©tÃ© authentifiÃ©e. Les coordonnÃ©es modifiÃ©es sont historisÃ©es avec lâ€™auteur et la date. Les devis sont uniquement des brouillons; ils ne crÃ©ent pas de facture ni dâ€™Ã©criture et ne remplacent pas le processus normal dâ€™approbation/Ã©mission. La balance Ã¢gÃ©e peut prÃ©parer un texte de relance modifiable seulement pour les crÃ©ances Ã©mises, Ã©chues et fiables Ã  la date du jour; lâ€™envoi reste manuel.

### Charges
Structure de coÃ»ts par nature, budget vs rÃ©el mensuel, tableau des Ã©carts, fournisseurs, ratio de coÃ»ts.

### Stocks & articles
Le stock global conserve le champ historique `Material.quantity`. Les quantitÃ©s existantes restent non affectÃ©es Ã  un dÃ©pÃ´t; un transfert peut les affecter Ã  un entrepÃ´t ou dÃ©placer un solde d'un entrepÃ´t Ã  un autre sans changer le stock global ni crÃ©er d'Ã©criture. Les articles acceptent un code-barres, une unitÃ© et un seuil d'alerte sur le stock global. L'historique affiche les entrÃ©es initiales, ajustements manuels, mouvements de production validÃ©s et deux cÃ´tÃ©s de chaque transfert.

Un ajustement manuel demande un motif et l'utilisateur authentifiÃ©; la variation de quantitÃ©, l'Ã©criture comptable et la trace d'audit sont validÃ©es ensemble. Un transfert est scoppÃ© Ã  la sociÃ©tÃ©, protÃ©gÃ© par une clÃ© d'idempotence et non comptable. Une rÃ©ception fournisseur exige une facture approuvÃ©e pour la mÃªme sociÃ©tÃ©; si elle porte sur une ligne de commande approuvÃ©e, le systÃ¨me contrÃ´le aussi le fournisseur, l'article, le prix et le reliquat. La facture peut Ãªtre prÃ©parÃ©e et approuvÃ©e avant la rÃ©ception, mais sa comptabilisation est bloquÃ©e tant que chaque ligne matÃ©rielle n'est pas rÃ©ceptionnÃ©e nette des retours. La rÃ©ception actualise le stock du dÃ©pÃ´t et le coÃ»t moyen global, et crÃ©e un mouvement idempotent sans Ã©criture comptable; l'Ã©criture intervient avec la comptabilisation de la facture. Les anciennes factures sans dÃ©tail de lignes restent rapprochables au niveau du HT. Le picking multi-lignes rÃ©serve atomiquement le stock disponible sans modifier la quantitÃ© physique. La confirmation idempotente de l'expÃ©dition consomme cette rÃ©servation et dÃ©crÃ©mente le stock global et du dÃ©pÃ´t, puis crÃ©e un mouvement `DISPATCH`; l'annulation avant expÃ©dition libÃ¨re la rÃ©servation.

### Production
Le tableau de production compare le prix de vente saisi au coÃ»t unitaire moyen courant. L'Ã©cart affichÃ© est indicatif, par unitÃ©, et ne tient pas compte des taxes, remises ou frais non saisis; pour les produits fabriquÃ©s, le coÃ»t moyen reprend les matiÃ¨res, la main-d'Å“uvre et les frais indirects saisis dans les ordres confirmÃ©s. Ce n'est pas une marge comptable complÃ¨te.

### Compte de rÃ©sultat
Rapport de pÃ©riode en lecture seule : mouvements nets des comptes de produits et charges issus des Ã©critures POSTED, couverture de donnÃ©es et repÃ¨res dÃ©terministes SAFE. La pÃ©riode peut Ãªtre comparÃ©e descriptivement Ã  la mÃªme pÃ©riode N-1 et exportÃ©e dans un classeur consultatif avec les lignes budgÃ©taires approuvÃ©es des seuls mois civils complets. Une projection annuelle indicative peut Ãªtre prÃ©sentÃ©e pour une pÃ©riode depuis le 1er janvier si les comparatifs N/N-1 et lâ€™annÃ©e complÃ¨te N-1 sont disponibles et leur couverture complÃ¨te; elle applique mÃ©caniquement la variation observÃ©e Ã  la base N-1, sans saisonnalitÃ©. Ce rapport nâ€™est pas un Ã©tat rÃ©glementaire certifiÃ©, ne calcule pas les marges/EBITDA/IS et ne dÃ©clenche aucune action. Le classeur ne reprend pas les scÃ©narios de trÃ©sorerie.

### TrÃ©sorerie & BFR
Position, BFR, DSO/DPO, ratio de liquiditÃ©. Courbe trÃ©sorerie/BFR, comptes bancaires (Ã©quivalent dans la devise du compte), balance Ã¢gÃ©e clients/fournisseurs (non Ã©chu, 0-30, 31-60, 61-90, > 90).

### ComptabilitÃ© & Grand Livre
Grand livre filtrable (recherche, journal), balance gÃ©nÃ©rale, saisie d'Ã©critures, total dÃ©bit/crÃ©dit et contrÃ´le d'Ã©quilibre.

### FiscalitÃ©
TVA mensuelle (collectÃ©e, dÃ©ductible, due), IS, taux par pays (15 % Tunisie, 25 % France, 9 % Ã‰mirats, 20 % Maroc), calendrier dÃ©claratif, taux effectif.

### Paie & effectifs
Masse salariale, effectif, coÃ»t moyen, charges patronales, rÃ©partition par entitÃ©, dÃ©tail par salariÃ© (brut, CNSS, IRPP, net, charges patronales), prime de dÃ©cembre.

La simulation n'enregistre pas de fiche. Lorsqu'une fiche est gÃ©nÃ©rÃ©e, SAFE conserve les montants calculÃ©s et un instantanÃ© dÃ©taillÃ© du moteur, des paramÃ¨tres, des tranches, des entrÃ©es et des rÃ©sultats employÃ©s. Le moteur de calcul n'est disponible que pour la Tunisie; il utilise par dÃ©faut 4 % et un plafond annuel de dÃ©duction partagÃ© avec les autres avantages fiscaux, actuellement limitÃ© Ã  10 000. Les fiches antÃ©rieures Ã  l'instantanÃ© dÃ©taillÃ© restent identifiÃ©es comme historiques. Le registre mensuel CNSS/IRPP est une prÃ©paration interne non dÃ©posable et reste Ã  revoir; il ne remplace ni les formulaires officiels ni la preuve d'un dÃ©pÃ´t.

### Documents RH
Les mÃ©tadonnÃ©es des documents du personnel peuvent recevoir un fichier PDF, JPEG ou PNG (8 Mio maximum, un fichier par document). Lâ€™activation exige la migration RH additive correspondante, Ã  appliquer par lâ€™administrateur selon la procÃ©dure de sauvegarde et de changement de schÃ©ma de lâ€™installation. Les fichiers sont stockÃ©s sous une rÃ©fÃ©rence opaque dans `data/private/hr-documents` ou dans le chemin absolu dÃ©fini par `SAFE_ERP_PRIVATE_STORAGE_DIR`; le serveur refuse un rÃ©pertoire situÃ© dans `public`, `dist` ou le dossier de lâ€™interface. Lâ€™API RH exige le rÃ´le autorisÃ© et vÃ©rifie lâ€™entitÃ© Ã  chaque consultation/tÃ©lÃ©chargement. Les chemins de stockage ne sont pas transmis Ã  lâ€™interface; les tÃ©lÃ©chargements sont en piÃ¨ce jointe et vÃ©rifiÃ©s par empreinte SHA-256. Lâ€™accÃ¨s direct au dossier doit aussi Ãªtre limitÃ© par les permissions du compte de service et les sauvegardes du systÃ¨me dâ€™exploitation; SAFE ne chiffre pas ces fichiers au repos et ne rÃ©alise pas dâ€™analyse antivirus. La migration RH ajoute uniquement les mÃ©tadonnÃ©es de stockage et ne dÃ©place ni ne supprime de fichiers existants. Aucune durÃ©e lÃ©gale de conservation ni purge automatique nâ€™est dÃ©finie: faites valider la politique de conservation avant toute suppression.

### Multinationale & Interco
Flux intragroupe, statuts, matrice des flux, Ã©carts, Ã©liminations, taux de rapprochement.

### ClÃ´ture & Audit
Checklist par pÃ©riodicitÃ©, progression, validation des tÃ¢ches (horodatÃ©e), piste d'audit, dossier de rÃ©vision.

### Rapports & Export
La vue prÃ©sente les rapports calculÃ©s disponibles selon le profil : compte de rÃ©sultat, synthÃ¨se comptable et bilan, balance gÃ©nÃ©rale, grand livre, budget et rÃ©el, prÃ©vision annuelle, trÃ©sorerie, balances Ã¢gÃ©es clients et fournisseurs, et fiscalitÃ©. Les vues reposent sur les donnÃ©es de la sociÃ©tÃ© authentifiÃ©e; certains rapports proposent des exports. Aucun catalogue fixe de 12 rapports, pack complet de 28 onglets ou pack rÃ©glementaire certifiÃ© n'est fourni. Les rapports et exports de travail ne remplacent pas des documents de conformitÃ©.

### Utilisateurs & rÃ´les
CrÃ©ation / modification / suppression, rÃ´le, pÃ©rimÃ¨tre d'entitÃ©s, activation, matrice de permissions.

### ParamÃ¨tres
IdentitÃ© du groupe, exercice, devise de consolidation, norme, TVA, auditeur, dÃ©lai de reporting, mÃ©thode de consolidation, taux de change, entitÃ©s, apparence, export JSON, rÃ©initialisation.

---

## 8. Raccourcis et confort

- **âŒ˜K / Ctrl+K** : palette de recherche (modules, comptes, entitÃ©s, clients).
- **Ã‰chap** : fermer une modale.
- Bascule **sombre / clair** dans la barre supÃ©rieure.
- Langue et devise dans le menu profil (avatar).
- La barre latÃ©rale est repliable (icÃ´ne en haut Ã  droite) et devient un tiroir sur mobile.

---

## 9. DonnÃ©es et sauvegarde

Dans la version serveur de SAFE de ce dÃ©pÃ´t, les donnÃ©es mÃ©tier sont stockÃ©es dans la base SQLite configurÃ©e par `SAFE_ERP_DATABASE_URL` (par dÃ©faut `src/data/data.db`), et non dans le navigateur. Il nâ€™existe pas de fonction utilisateur dâ€™export ou de restauration dans lâ€™interface : les opÃ©rations de sauvegarde et de restauration de la base sont rÃ©servÃ©es Ã  lâ€™exploitant et dÃ©crites dans [`docs/DEPLOIEMENT_WEB.md`](DEPLOIEMENT_WEB.md#7-sauvegarde-et-restauration-sqlite). Une restauration nÃ©cessite lâ€™arrÃªt prÃ©alable du service.

---

## 10. Questions frÃ©quentes

**Pourquoi les montants changent-ils quand je change de devise ?**
Les donnÃ©es sont stockÃ©es en dinars tunisiens consolidÃ©s, puis converties au taux de clÃ´ture pour l'affichage et l'export.

**Pourquoi le DSO est-il plus Ã©levÃ© que le dÃ©lai contractuel ?**
Le DSO est calculÃ© sur l'encours de fin d'annÃ©e, dans un mois de dÃ©cembre Ã  forte activitÃ© ; il reflÃ¨te donc le pic de facturation.

**Puis-je travailler sur une seule entitÃ© ?**
Oui : sÃ©lectionner l'entitÃ© dans la barre latÃ©rale ; tous les KPI, tableaux et exports sont restreints Ã  son pÃ©rimÃ¨tre.

**L'export Excel est-il modifiable ?**
Oui, c'est un vrai fichier `.xlsx` avec des valeurs numÃ©riques, des filtres et des totaux ; il peut Ãªtre retravaillÃ© dans Excel.

**Les mots de passe sont-ils sÃ©curisÃ©s ?**
Non dans cette dÃ©monstration : ils sont stockÃ©s localement en clair. Une authentification SSO et un hachage Argon2 sont prÃ©vus pour la version production.
