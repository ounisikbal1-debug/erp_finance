# PostgreSQL et dÃ©ploiement multi-utilisateur

## Ã‰tat de prise en charge

PostgreSQL est configurÃ© comme cible de travail pour le multi-utilisateur; SQLite reste le moteur local/de dÃ©veloppement. Une validation intÃ©grÃ©e jetable a Ã©tÃ© exÃ©cutÃ©e sous Windows avec PostgreSQL 17.11, Node.js 24.21.0 et Prisma 5.22.0; `pg_dump` et `pg_restore` 18.0 ont servi aux essais dâ€™archive. **Aucune version majeure PostgreSQL, plateforme dâ€™hÃ©bergement ou capacitÃ© de production nâ€™est encore officiellement prise en charge.** Ces essais synthÃ©tiques ne constituent ni une validation dâ€™hÃ©bergement ni une garantie de capacitÃ©.

Les sessions de production sont persistÃ©es dans PostgreSQL; les jetons sont vÃ©rifiÃ©s sur plusieurs processus et rÃ©voquÃ©s en base lors des changements dâ€™accÃ¨s, des rÃ©initialisations de mot de passe, des dÃ©sactivations et des dÃ©connexions. Les tÃ¢ches planifiÃ©es restent locales au processus. Le projet ne garantit ni capacitÃ© illimitÃ©e ni comportement multi-instance de toutes les fonctions; gardez une seule instance tant que ces tÃ¢ches ne sont pas coordonnÃ©es.

## Configuration

Un processus applicatif utilise un seul client Prisma gÃ©nÃ©rÃ© pour un moteur Ã  la fois. RÃ©gÃ©nÃ©rez le client pour le moteur du dÃ©ploiement avant de dÃ©marrer le serveur; ne changez pas seulement lâ€™URL dâ€™une installation gÃ©nÃ©rÃ©e pour lâ€™autre moteur.

SQLite local conserve le schÃ©ma et les migrations existants :

```powershell
$env:SAFE_ERP_DATABASE_PROVIDER = 'sqlite'
$env:SAFE_ERP_DATABASE_URL = 'file:C:/SAFE/data.db'
npm run prisma:generate
npm run prisma:status
```

PostgreSQL exige le choix explicite du fournisseur et une URL PostgreSQL :

```powershell
$env:SAFE_ERP_DATABASE_PROVIDER = 'postgresql'
$env:SAFE_ERP_DATABASE_URL = 'postgresql://safe_app@db.example.invalid:5432/safe?sslmode=require&connection_limit=10'
npm run prisma:generate:postgres
npm run prisma:status:postgres
```

Si lâ€™URL PostgreSQL ne contient pas `connection_limit`, la configuration ajoute une limite par processus de 10 connexions Prisma. Une valeur explicite dans lâ€™URL est conservÃ©e et doit Ãªtre dimensionnÃ©e selon le nombre de processus et `max_connections` du serveur; cette limite nâ€™est pas une garantie de capacitÃ© ni une limite globale multi-instance.

Pour une base PostgreSQL **neuve et jetable uniquement**, lâ€™application explicite des migrations se fait sÃ©parÃ©ment :

```powershell
npm run prisma:deploy:postgres
```

`SAFE_ERP_DATABASE_URL` contient des identifiants sensibles dans beaucoup dâ€™installations. PrÃ©fÃ©rez un gestionnaire de secrets ou un fichier de mots de passe libpq Ã  accÃ¨s restreint; ne la copiez pas dans un ticket, un dÃ©pÃ´t, un journal ni une ligne de commande partagÃ©e. `prisma:deploy:postgres` vÃ©rifie maintenant la cible avant dâ€™appeler Prisma : il autorise une base sans objets applicatifs ni historique, ou une base portant la migration initiale rÃ©ussie de ce projet; il refuse toute autre base prÃ©existante avant dâ€™exÃ©cuter une migration. Cette garde nâ€™est pas une procÃ©dure dâ€™adoption ou de mise Ã  niveau dâ€™une ancienne base PostgreSQL. Comme seule la baseline initiale est disponible, aucune migration dâ€™une installation PostgreSQL historique nâ€™est actuellement prise en charge; un tel changement exige une chaÃ®ne de migrations et une validation distinctes. Aucun changement de schÃ©ma automatique ne se fait au dÃ©marrage.

Le test `npm run test:postgresql:integration` dÃ©marre un cluster PostgreSQL 17.11 isolÃ© sur loopback, crÃ©e des bases temporaires et utilise uniquement des donnÃ©es synthÃ©tiques; il les supprime Ã  la fin. Il vÃ©rifie une session persistÃ©e acceptÃ©e depuis un second processus, sa rÃ©vocation aprÃ¨s rÃ©initialisation de mot de passe, les migrations rÃ©pÃ©tÃ©es, lâ€™import SQLite, le verrouillage concurrent et la restauration dâ€™archive. Il ne consulte pas `SAFE_ERP_DATABASE_URL` et ne touche aucune base client. Pour les autres tests visant un serveur PostgreSQL externe, utilisez une base dÃ©diÃ©e avec `SAFE_ERP_TEST_DATABASE_URL`; ne rÃ©utilisez jamais lâ€™URL de production. Les tests SQLite seuls ne valident pas PostgreSQL.

## Reprise dâ€™une base SQLite SAFE

Lâ€™importeur fonctionne sur une **copie de sauvegarde vÃ©rifiÃ©e et hors ligne**, jamais sur une base ouverte ou une base client directement. CrÃ©ez dâ€™abord une sauvegarde SQLite avec la procÃ©dure existante, migrez une base PostgreSQL vide avec la baseline ci-dessus, puis effectuez le dry-run :

```powershell
$env:SAFE_ERP_DATABASE_PROVIDER = 'postgresql'
$env:SAFE_ERP_DATABASE_URL = 'postgresql://safe_app@db.example.invalid:5432/safe?sslmode=require'
npm run db:import:sqlite-to-postgres -- --source 'C:\SAFE\backups\client-before-pg.sqlite' --report 'C:\SAFE\reports\client-import-review.json'
```

Le dry-run ne modifie pas PostgreSQL; il contrÃ´le lâ€™intÃ©gritÃ© SQLite et ses clÃ©s Ã©trangÃ¨res, vÃ©rifie que les migrations PostgreSQL sont Ã  jour et que toutes les tables cibles sont vides, puis dÃ©crit les nombres de lignes, dÃ©pendances, historique source et Ã©carts de tables/colonnes. Il nâ€™importe pas `_prisma_migrations`, les tables internes ni les triggers SQLite; les triggers de clÃ´ture PostgreSQL sont dÃ©finis par la baseline. Le rapport est crÃ©Ã© sans Ã©craser un fichier existant et ne contient pas les valeurs mÃ©tier ni lâ€™URL de connexion. Il ne valide pas les Ã©quilibres comptables, totaux mÃ©tier ni la conformitÃ© des donnÃ©es; ces rapprochements restent obligatoires avant bascule. Le parcours dry-run et import effectif a Ã©tÃ© exÃ©cutÃ© avec une base SQLite synthÃ©tique et une cible PostgreSQL jetable vide; cela ne valide pas une reprise client.

AprÃ¨s revue du rapport, lâ€™import effectif requiert une confirmation distincte et reste atomique dans une transaction PostgreSQL sÃ©rialisable :

```powershell
npm run db:import:sqlite-to-postgres -- --source 'C:\SAFE\backups\client-before-pg.sqlite' --report 'C:\SAFE\reports\client-import-applied.json' --approved-report 'C:\SAFE\reports\client-import-review.json' --apply --confirm-target-empty
```

Lâ€™importeur lie lâ€™approbation au contenu SHA-256 de la source, Ã  lâ€™URL cible, au plan de lignes/colonnes et aux migrations actuelles; tout changement invalide le rapport. Lâ€™import sâ€™arrÃªte si la source contient une table/colonne inconnue, une clÃ© Ã©trangÃ¨re invalide, si une colonne cible obligatoire ne peut recevoir de valeur, si le schÃ©ma cible nâ€™est pas Ã  jour/non vide ou si ses clÃ©s Ã©trangÃ¨res ne sont pas diffÃ©rables. Les lignes sont recomptÃ©es avant validation de la transaction; les clÃ©s Ã©trangÃ¨res diffÃ©rÃ©es sont vÃ©rifiÃ©es au commit. Si lâ€™import Ã©choue, la transaction est annulÃ©e. La source doit rester immuable pendant lâ€™opÃ©ration et lâ€™application doit rester arrÃªtÃ©e sur la cible vide. Lâ€™importer a passÃ© un dry-run et une application sur des donnÃ©es synthÃ©tiques avec PostgreSQL jetable; aucune reprise client ni validation mÃ©tier nâ€™en dÃ©coule.

## SchÃ©mas et migrations

- SQLite : `src/data/prisma/schema.prisma` et `src/data/prisma/migrations/`.
- PostgreSQL : `src/data/prisma/postgresql/schema.prisma` et `src/data/prisma/postgresql/migrations/`.
- La baseline PostgreSQL reflÃ¨te le schÃ©ma Prisma courant; ses clÃ©s Ã©trangÃ¨res sont diffÃ©rables pour la reprise transactionnelle et les rÃ¨gles de protection de clÃ´ture utilisent des triggers PostgreSQL dÃ©diÃ©s.
- La longue chaÃ®ne SQLite existante nâ€™est ni convertie ni appliquÃ©e Ã  PostgreSQL. Aucune mise Ã  niveau dâ€™une base prÃ©existante ni adoption automatique de son historique nâ€™a Ã©tÃ© validÃ©e. Le harnais vÃ©rifie seulement lâ€™application de la baseline et une migration additive synthÃ©tique dans une copie temporaire de la chaÃ®ne; cette derniÃ¨re ne modifie pas les migrations SAFE.
- Un outil dâ€™import SQLite SAFE vers PostgreSQL est fourni ci-dessus et a Ã©tÃ© exÃ©cutÃ© sur des donnÃ©es synthÃ©tiques dans le harnais jetable. La baseline seule ne constitue pas un plan de migration de donnÃ©es.
- La chaÃ®ne SQLite contient deux rÃ©pertoires intercompagnies. Lâ€™audit du schÃ©ma courant et de `20261110184600_native_intercompany_transactions/migration.sql` confirme que cette migration antÃ©rieure crÃ©e dÃ©jÃ  le modÃ¨le `IntercompanyTransaction`, ses clÃ©s Ã©trangÃ¨res et tous ses index actuels. `20261110190000_native_intercompany_transactions` nâ€™apporte donc aucune modification de schÃ©ma; son `migration.sql` contient maintenant uniquement un commentaire qui documente ce no-op, sans dupliquer de DDL. Cela corrige lâ€™erreur P3015 sans supprimer ni renommer le rÃ©pertoire et sans appliquer de migration Ã  une base existante.

Toute mise Ã  niveau devra Ãªtre rÃ©pÃ©tÃ©e sur une copie, prÃ©cÃ©dÃ©e dâ€™une sauvegarde vÃ©rifiÃ©e et appliquÃ©e explicitement par un responsable. Ne marquez pas artificiellement des migrations comme appliquÃ©es et nâ€™utilisez pas `db push` pour contourner lâ€™historique.

## Sauvegarde et restauration PostgreSQL

Ces commandes restent les procÃ©dures opÃ©rateur. Le harnais a crÃ©Ã© une archive custom-format de la base PostgreSQL jetable puis lâ€™a restaurÃ©e avec succÃ¨s vers une base vide distincte; derniÃ¨re archive de 397â€¯121 octets, produite et restaurÃ©e avec `pg_dump`/`pg_restore` 18.0 sur le serveur 17.11. Ce rÃ©sultat limitÃ© ne valide pas une procÃ©dure dâ€™exploitation ou une sauvegarde client. Utilisez des binaires `pg_dump`/`pg_restore` compatibles avec la version majeure du serveur et un `PGPASSFILE` protÃ©gÃ© plutÃ´t quâ€™un mot de passe dans lâ€™URL.

CrÃ©er une archive PostgreSQL cohÃ©rente, en choisissant une nouvelle destination protÃ©gÃ©e :

```powershell
pg_dump --format=custom --no-owner --file='C:\SAFE\backups\safe.dump' $env:SAFE_ERP_DATABASE_URL
pg_restore --list 'C:\SAFE\backups\safe.dump'
```

Pour la restauration, crÃ©ez dâ€™abord une base **vide et distincte** de la source, affectez son URL Ã  `SAFE_ERP_RESTORE_DATABASE_URL`, puis restaurez sans `--clean` ni `--if-exists`. Nâ€™effectuez pas de restauration par-dessus une base active :

```powershell
pg_restore --exit-on-error --no-owner --dbname=$env:SAFE_ERP_RESTORE_DATABASE_URL 'C:\SAFE\backups\safe.dump'
```

VÃ©rifiez la version du serveur, la fin sans erreur de `pg_restore`, lâ€™Ã©tat des migrations, les comptes de lignes et les contrÃ´les mÃ©tier avant toute dÃ©cision de bascule. Le harnais a vÃ©rifiÃ© lâ€™Ã©tat des migrations et les donnÃ©es restaurÃ©es; les contrÃ´les mÃ©tier reprÃ©sentatifs restent Ã  dÃ©finir et Ã  exÃ©cuter avant tout go/no-go.

## Installation, hÃ©bergement et charge

Une installation multi-utilisateur doit placer lâ€™API derriÃ¨re HTTPS et un mÃ©canisme dâ€™authentification serveur/RBAC; la configuration web hÃ©ritÃ©e du dÃ©pÃ´t dÃ©crit SQLite et avertit que son serveur de partage nâ€™authentifie pas les appels API. Ne lâ€™exposez pas telle quelle Ã  Internet. Le service PostgreSQL devra Ãªtre privÃ©, avec TLS, sauvegardes hors hÃ´te et identifiants Ã  privilÃ¨ges minimaux.

Une mesure synthÃ©tique avec 16 clients `pg` directs et 320 transactions a vÃ©rifiÃ© lâ€™intÃ©gritÃ© du compteur : 319,04 ms, P95 de 47,11 ms et 1â€¯003 Ã©critures/s lors du dernier essai. Elle ne mesure pas le pool Prisma.

Le pool applicatif a Ã©tÃ© mesurÃ© sÃ©parÃ©ment avec un client Prisma gÃ©nÃ©rÃ© pour PostgreSQL, importÃ© par `src/data/prisma/client.ts`, et lâ€™URL prÃ©parÃ©e par `resolveDatabaseConfiguration` (`connection_limit=10` par dÃ©faut). Le driver `pg` sert uniquement Ã  Ã©chantillonner `pg_stat_activity`; les transactions mesurÃ©es passent par Prisma. Chaque transaction fait une insertion idempotente, une courte attente synthÃ©tique, une mise Ã  jour concurrente du mÃªme compteur puis une lecture, ce qui exerce le pool, la file dâ€™acquisition et la contention dâ€™Ã©criture. RÃ©sultats sur PostgreSQL 17.11 :

| Workers | Transactions | DurÃ©e (ms) | P50 (ms) | P95 (ms) | P99 (ms) | Acquisition pool P95 (ms) | Tx/s | Connexions Prisma max./actives | Attentes verrou max. |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 16 | 160 | 750,59 | 53,61 | 166,97 | 252,60 | 136,47 | 213,17 | 10/10 | 5 |
| 32 | 320 | 1â€¯009,52 | 97,58 | 111,80 | 123,49 | 76,47 | 316,98 | 10/10 | 6 |
| 50 | 500 | 1â€¯580,83 | 156,98 | 166,44 | 170,74 | 131,38 | 316,29 | 10/10 | 6 |

Aucun des trois paliers nâ€™a produit dâ€™erreur ni de timeout; le nombre de lignes et le compteur correspondaient aux transactions, et le rejeu idempotent nâ€™a ajoutÃ© aucune ligne. Lâ€™acquisition P95 est mesurÃ©e par lâ€™application entre la demande de transaction interactive et lâ€™entrÃ©e dans son callback; Prisma nâ€™expose pas ici directement les mÃ©triques internes de sa file. Le workload synthÃ©tique est volontairement contentieux et cette mesure locale nâ€™est ni une garantie de capacitÃ© ni une cible de dimensionnement. Aucun hÃ©bergeur, systÃ¨me dâ€™exploitation, version PostgreSQL ni dimensionnement nâ€™est dÃ©clarÃ© officiellement supportÃ© dans cette livraison. Avant de le faire, rÃ©pÃ©tez au minimum lâ€™installation, la mise Ã  niveau dâ€™une copie reprÃ©sentative, la sauvegarde/restauration vers une base vide et les charges concurrentes reprÃ©sentatives; ne dÃ©duisez pas une capacitÃ© dâ€™utilisateurs en production de ces essais.

Le benchmark SQLite synthÃ©tique existant a Ã©tÃ© exÃ©cutÃ© sur Windows avec Node.js 24.21.0 et Prisma 5.22.0. Dans ce scÃ©nario prÃ©cis, le plus haut palier respectant les seuils du banc Ã©tait 16 utilisateurs concurrents (P95 lecture 149,47 ms, Ã©criture 255,82 ms, intÃ©gritÃ© correcte). Au palier 20, 8 Ã©critures ont Ã©chouÃ© par timeout SQLite (P1008/P2028), et lâ€™intÃ©gritÃ© attendue nâ€™Ã©tait plus satisfaite. Cette mesure ne sâ€™extrapole ni Ã  PostgreSQL ni Ã  dâ€™autres machines, et confirme que SQLite ne doit pas Ãªtre prÃ©sentÃ© comme base multi-utilisateur Ã  charge Ã©levÃ©e.

## VÃ©rifications de cette livraison

- Les deux schÃ©mas Prisma valident et les clients SQLite et PostgreSQL ont Ã©tÃ© gÃ©nÃ©rÃ©s successivement; le client SQLite a ensuite Ã©tÃ© rÃ©gÃ©nÃ©rÃ© pour laisser lâ€™installation locale dans son Ã©tat initial.
- Les tests de dÃ©ploiement de la chaÃ®ne Prisma passent 4/4, dont lâ€™installation complÃ¨te sur SQLite jetable, la mise Ã  niveau synthÃ©tique et la conservation des entitÃ©s. Le contrat statique des migrations PostgreSQL passe 24/24.
- Sauvegarde/restauration SQLite : 3 tests passÃ©s. La suite deployment-safety passe 9/9. AprÃ¨s ajout de la migration additive d'instantanÃ© de paie, la rÃ©pÃ©tition PostgreSQL a validÃ© 121 tables publiques et 20 migrations SAFE, plus une migration additive synthÃ©tique (21 entrÃ©es aprÃ¨s mise Ã  niveau), l'import/restauration vers une base distincte, les sessions multi-processus et leur rÃ©vocation.
- Le dossier nâ€™a pas de mÃ©tadonnÃ©es Git, donc aucun diff de rÃ©fÃ©rence nâ€™est disponible. Le dÃ©faut P3015 est corrigÃ© par le no-op documentÃ© ci-dessus; aucune base de donnÃ©es existante nâ€™a Ã©tÃ© modifiÃ©e dans cette validation.
- Le harnais `npm run test:postgresql:integration` vÃ©rifie rÃ©ellement sur PG 17.11 jetable : installation et redÃ©ploiement sans changement; mise Ã  niveau additive synthÃ©tique; import SQLite synthÃ©tique en dry-run et en application; session vÃ©rifiÃ©e depuis un autre processus puis rÃ©voquÃ©e aprÃ¨s rÃ©initialisation; course clÃ´ture/journal via deux processus applicatifs Prisma distincts avec attente observÃ©e dans `pg_stat_activity`; sauvegarde/restauration vers une base vide; charge `pg` directe; et pool Prisma gÃ©nÃ©rÃ© PostgreSQL Ã  16/32/50 workers. Le dernier essai est sorti avec le code 0 aprÃ¨s nettoyage; l'arrÃªt explicite peut afficher un avertissement `exit-hook` du processus PostgreSQL embarquÃ©, bien que les Ã©tapes de fermeture et de nettoyage soient terminÃ©es. Cela valide des scÃ©narios synthÃ©tiques locaux, pas un dÃ©ploiement multi-hÃ´te, la haute disponibilitÃ© ou une capacitÃ© de production. Aucun serveur persistant, distant, base client ou donnÃ©e rÃ©elle nâ€™a Ã©tÃ© utilisÃ©.
- Le prÃ©contrÃ´le de dÃ©ploiement a aussi Ã©tÃ© vÃ©rifiÃ© sur cette cible jetable : il autorise lâ€™installation neuve et un redÃ©ploiement avec baseline reconnue, mais bloque une base synthÃ©tique non vide sans baseline; la ligne tÃ©moin reste intacte et Prisma ne crÃ©e mÃªme pas `_prisma_migrations`.
- Le dernier `npm audit` signalait quatre avis sur les dÃ©pendances existantes : deux modÃ©rÃ©s (`uuid` transitif dâ€™`exceljs`) et deux Ã©levÃ©s (`image-size` transitif de `pptxgenjs`); `npm audit --omit=dev` en retrouve les deux Ã©levÃ©s en production. Les correctifs proposÃ©s via `--force` impliquent des changements de version cassants/rÃ©trogradations; ils nâ€™ont pas Ã©tÃ© appliquÃ©s. Aucun avis ne visait les dÃ©pendances du harnais PostgreSQL.
- La mise Ã  niveau testÃ©e est synthÃ©tique et non reprÃ©sentative dâ€™une ancienne base client. Lâ€™import ne vÃ©rifie pas les Ã©quilibres mÃ©tier, la chaÃ®ne complÃ¨te des fonctions mÃ©tier sur PG nâ€™est pas encore validÃ©e, et le test de charge ne couvre ni multi-instance distribuÃ© ni capacitÃ© de production. Aucun hÃ©bergement ni version majeure nâ€™est officiellement supportÃ©.
