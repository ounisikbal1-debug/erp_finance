# SAFE â€” accÃ¨s Power BI Desktop

## Parcours depuis SAFE

Depuis le compte de rÃ©sultat, dÃ©veloppez **PrÃ©parer un rapport Power BI Desktop sur ce PC** et tÃ©lÃ©chargez `SAFE_Desktop_Starter.zip`. Extrayez le pack puis suivez le guide inclus pour crÃ©er les quatre requÃªtes (journaux comptabilisÃ©s, ventes Ã©mises/payÃ©es, achats fournisseurs comptabilisÃ©s, anciennetÃ© des crÃ©ances). Le navigateur ne lance pas lâ€™application Windows lui-mÃªme : ouvrez Power BI Desktop sur le poste, crÃ©ez une **RequÃªte vierge** par fichier `.m`, collez son contenu dans lâ€™**Ã‰diteur avancÃ©**, puis actualisez.

Lâ€™API BI expose `GET /api/bi/receivables-aging?asOf=YYYY-MM-DD`, un jeu de donnÃ©es en lecture seule Ã  la granularitÃ© dâ€™une facture. Lâ€™entitÃ© est toujours dÃ©rivÃ©e du compte authentifiÃ©; le service dâ€™anciennetÃ© existant fournit les totaux, la couverture et les diagnostics. Le fichier `SAFE_ReceivablesAging.m` lit ce jeu de donnÃ©es; les totaux restent indisponibles lorsque la couverture contient des factures invalides.

Le pack source est `integrations/powerbi/desktop-starter` et sa copie tÃ©lÃ©chargeable est `public/powerbi/SAFE_Desktop_Starter.zip`. Les requÃªtes journaux/ventes/achats utilisent une pÃ©riode glissante de 365 jours; lâ€™anciennetÃ© utilise une date dâ€™arrÃªtÃ©. Chaque ligne porte lâ€™entitÃ© fournie par SAFE et lâ€™heure de gÃ©nÃ©ration. Le serveur dÃ©rive lâ€™entitÃ© de lâ€™utilisateur authentifiÃ©; le rapport ne peut pas imposer un autre `entityId`. Les dates `from` et `to` des trois extractions pÃ©riodiques sont obligatoires et lâ€™API limite chaque extraction Ã  366 jours.

Il sâ€™agit dâ€™un pack de requÃªtes et dâ€™instructions, pas dâ€™un rapport `.pbix`/`.pbit` prÃ©construit : cet environnement ne peut ni gÃ©nÃ©rer sÃ»rement un rapport Desktop valide ni lâ€™ouvrir pour le vÃ©rifier. Le guide suggÃ¨re des visuels de dÃ©part Ã  crÃ©er dans Desktop. Le dataset dâ€™anciennetÃ© des crÃ©ances provient de la route BI en lecture seule; le pack nâ€™invente ni factures ni totaux.

SAFE fournit dÃ©sormais des **repÃ¨res dâ€™analyse automatiques dans ses propres Ã©crans** : comparaison descriptive des produits/charges sur les deux derniers mois complets dans le tableau de bord, total de crÃ©ances Ã©chues et part de plus de 90 jours dans la balance clients, ainsi que rÃ©sultat de pÃ©riode, couverture et comparaison descriptive avec N-1 dans le compte de rÃ©sultat. Le compte de rÃ©sultat peut Ãªtre exportÃ© en classeur consultatif comprenant les lignes budgÃ©taires approuvÃ©es des mois complets demandÃ©s; les brouillons et les mois partiels ne sont pas projetÃ©s. Pour une pÃ©riode commenÃ§ant le 1er janvier, une projection annuelle indicative peut appliquer la variation de la pÃ©riode N/N-1 Ã  lâ€™annÃ©e N-1 si les trois rapports correspondent Ã  la mÃªme sociÃ©tÃ©/devise et que leur couverture comptable est complÃ¨te. Cette extrapolation ne modÃ©lise ni saisonnalitÃ© ni trÃ©sorerie et nâ€™est ni un budget ni une prÃ©vision certaine. Les scÃ©narios du module TrÃ©sorerie ne sont pas inclus dans le classeur: ils exigent le choix explicite dâ€™un scÃ©nario et dâ€™un horizon. Aucun commentaire dâ€™IA nâ€™est ajoutÃ© au fichier. Ces repÃ¨res sont calculÃ©s localement Ã  partir des donnÃ©es authentifiÃ©es; ils ne sont ni des conseils professionnels ni une validation rÃ©glementaire. Lâ€™assistant Ollama reste une option distincte, dÃ©sactivÃ©e par dÃ©faut.

## Limite de lâ€™affichage automatique dans Power BI Desktop

Lâ€™utilisateur a demandÃ© un rapport automatiquement gÃ©nÃ©rÃ© et affichÃ© sur son PC, sans configuration ou actualisation manuelle dans Power BI Desktop. Ce parcours nâ€™est pas livrÃ© : Desktop est une application Windows sÃ©parÃ©e; le dÃ©pÃ´t ne fournit pas de compagnon local fonctionnel ni de PBIX/PBIT prÃ©construit et testable. Le wrapper Electron actuellement prÃ©sent nâ€™est pas raccordÃ© Ã  lâ€™application mÃ©tier (il rÃ©fÃ©rence un script et un endpoint absents), et lâ€™installateur invoque un script `desktop:build` non dÃ©clarÃ© dans `package.json`. Aucun mot de passe ou jeton ne sera transmis par un lien navigateur ou stockÃ© en clair.

Le pack `SAFE_Desktop_Starter.zip` et ses fichiers M sont seulement une base technique de requÃªtes locales nÃ©cessitant une configuration dans Desktop; ils ne satisfont pas lâ€™affichage sans intervention et ne sont donc pas prÃ©sentÃ©s comme une solution automatique dans lâ€™Ã©cran SAFE. La voie automatique utilisable aujourdâ€™hui est lâ€™analyse native dans SAFE dÃ©crite ci-dessus. Une automatisation Desktop future demanderait un compagnon Windows rÃ©ellement installÃ©, une autorisation SAFE Ã  durÃ©e courte et Ã  usage unique, un rapport Desktop prÃ©construit/validÃ©, ainsi quâ€™un mÃ©canisme de rafraÃ®chissement pris en charge et testÃ©; aucun de ces composants nâ€™est actuellement en place. Ne pas supposer que lâ€™ouverture dâ€™un fichier local rafraÃ®chit ses donnÃ©es.

| Endpoint | GranularitÃ© |
|---|---|
| `/api/bi/manifest` | Manifest des donnÃ©es et limites |
| `/api/bi/journal-lines?from=AAAA-MM-JJ&to=AAAA-MM-JJ` | Une ligne de journal comptabilisÃ©e |
| `/api/bi/sales-invoices?from=AAAA-MM-JJ&to=AAAA-MM-JJ` | Une facture Ã©mise ou payÃ©e |
| `/api/bi/purchase-invoices?from=AAAA-MM-JJ&to=AAAA-MM-JJ` | Une facture fournisseur comptabilisÃ©e |
| `/api/bi/receivables-aging?asOf=AAAA-MM-JJ` | Une facture ouverte et ses diagnostics dâ€™anciennetÃ© |

## MÃªme PC que SAFE

Les requÃªtes M du pack utilisent `http://127.0.0.1:3000`. DÃ©marrez SAFE sur le mÃªme PC que Power BI Desktop. Lorsque Power BI demande les identifiants, choisissez **Basic** et saisissez les identifiants SAFE dâ€™un utilisateur `ADMIN` ou `FINANCIAL_MANAGER`. SAFE nâ€™accepte Basic que pour les requÃªtes locales GET; il vÃ©rifie le compte, son rÃ´le et utilise lâ€™entitÃ© attachÃ©e Ã  ce compte. Power BI mÃ©morise les identifiants dans son gestionnaire de connexions; ne les inscrivez pas dans le code M.

## Power BI sur un autre PC

Lâ€™accÃ¨s depuis un client rÃ©seau est possible via lâ€™API SAFE et des jetons Bearer; il ne dÃ©pend pas dâ€™une connexion locale loopback. Il exige SAFE dÃ©ployÃ© derriÃ¨re HTTPS avec `SAFE_ERP_AUTH_SECRET` configurÃ©. Le connecteur Power Query personnalisÃ© se trouve dans `integrations/powerbi/SAFEERP.pq`; compilez-le en `.mez` avec le Power Query SDK pour Visual Studio, installez-le sous `Documents\Power BI Desktop\Custom Connectors`, autorisez les extensions personnalisÃ©es et saisissez lâ€™URL HTTPS de SAFE ainsi que les identifiants SAFE dans lâ€™interface Power BI. Le connecteur obtient un jeton de courte durÃ©e depuis SAFE puis lâ€™utilise sur les datasets; les autorisations sont vÃ©rifiÃ©es cÃ´tÃ© serveur Ã  chaque requÃªte. Ne publiez pas lâ€™API sur un rÃ©seau sans TLS ni secret dâ€™authentification.

Cette extension personnalisÃ©e nâ€™a pas Ã©tÃ© compilÃ©e/validÃ©e sur ce poste; le SDK nâ€™est pas installÃ©. Le pack M tÃ©lÃ©chargÃ© depuis SAFE est destinÃ© au scÃ©nario local le plus simple et demande la crÃ©ation des requÃªtes, pages et visuels dans Desktop. Le dossier Power BI Desktop Store fourni paraÃ®t Ãªtre un profil/cache; il nâ€™a pas Ã©tÃ© consultÃ© ni modifiÃ©.

## Limites

Power BI Desktop reste une application sÃ©parÃ©e : le navigateur SAFE ne lance pas arbitrairement un programme Windows et nâ€™intÃ¨gre pas sa fenÃªtre. Pour afficher un rapport dans la page SAFE, il faudrait publier le rapport sur Power BI Service/Embedded avec une capacitÃ©/licence, un tenant Microsoft Entra et un flux serveur dâ€™incorporation; ces Ã©lÃ©ments ne sont pas configurÃ©s. Lâ€™actualisation planifiÃ©e Power BI Service nâ€™est pas fournie.

Les routes `/api/bi` sont GET-only, ne crÃ©ent ni ne mettent Ã  jour des donnÃ©es SAFE, ne reÃ§oivent pas dâ€™import Power BI et nâ€™exposent aucune Ã©criture comptable. Aucune donnÃ©e Power BI prÃ©existante nâ€™est rÃ©tro-importÃ©e. Le serveur historique `Lancer SAFE Partage.cmd` sur le port 5300 publie des CSV sans authentification et ne doit pas servir pour des donnÃ©es rÃ©elles.

## Assistant IA analytique local

Lâ€™assistant du compte de rÃ©sultat est dÃ©sactivÃ© par dÃ©faut. Son utilisation exige une approbation explicite du matÃ©riel et du modÃ¨le exact sur la machine cible, puis les trois variables `SAFE_ERP_AI_ENABLED=true`, `SAFE_ERP_AI_HARDWARE_READY=true` et `SAFE_ERP_AI_MODEL_APPROVED=true` dans la configuration protÃ©gÃ©e du serveur, ainsi que `SAFE_ERP_AI_MODEL=<nom-du-modÃ¨le-local>`. Toute variable dâ€™approbation absente bloque les requÃªtes. Lâ€™utilisateur doit aussi confirmer dans lâ€™interface quâ€™il vÃ©rifiera chaque rÃ©ponse avant une dÃ©cision; lâ€™API refuse les demandes sans cette confirmation. Ollama doit Ãªtre local Ã  lâ€™API; toute URL hors loopback est refusÃ©e. Seule la pÃ©riode, la devise et les totaux agrÃ©gÃ©s POSTED sont envoyÃ©s au modÃ¨le; aucune action dâ€™Ã©criture nâ€™est exposÃ©e. Les rÃ©ponses sont indicatives, non certifiÃ©es, et doivent Ãªtre vÃ©rifiÃ©es.
