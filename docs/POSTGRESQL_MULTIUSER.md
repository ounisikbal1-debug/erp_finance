# PostgreSQL et déploiement multi-utilisateur

## État de prise en charge

PostgreSQL est configuré comme cible de travail pour le multi-utilisateur; SQLite reste le moteur local/de développement. Une validation intégrée jetable a été exécutée sous Windows avec PostgreSQL 17.11, Node.js 24.21.0 et Prisma 5.22.0; `pg_dump` et `pg_restore` 18.0 ont servi aux essais d’archive. **Aucune version majeure PostgreSQL, plateforme d’hébergement ou capacité de production n’est encore officiellement prise en charge.** Ces essais synthétiques ne constituent ni une validation d’hébergement ni une garantie de capacité.

Les sessions de production sont persistées dans PostgreSQL; les jetons sont vérifiés sur plusieurs processus et révoqués en base lors des changements d’accès, des réinitialisations de mot de passe, des désactivations et des déconnexions. Les tâches planifiées restent locales au processus. Le projet ne garantit ni capacité illimitée ni comportement multi-instance de toutes les fonctions; gardez une seule instance tant que ces tâches ne sont pas coordonnées.

## Configuration

Un processus applicatif utilise un seul client Prisma généré pour un moteur à la fois. Régénérez le client pour le moteur du déploiement avant de démarrer le serveur; ne changez pas seulement l’URL d’une installation générée pour l’autre moteur.

SQLite local conserve le schéma et les migrations existants :

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

Si l’URL PostgreSQL ne contient pas `connection_limit`, la configuration ajoute une limite par processus de 10 connexions Prisma. Une valeur explicite dans l’URL est conservée et doit être dimensionnée selon le nombre de processus et `max_connections` du serveur; cette limite n’est pas une garantie de capacité ni une limite globale multi-instance.

Pour une base PostgreSQL **neuve et jetable uniquement**, l’application explicite des migrations se fait séparément :

```powershell
npm run prisma:deploy:postgres
```

`SAFE_ERP_DATABASE_URL` contient des identifiants sensibles dans beaucoup d’installations. Préférez un gestionnaire de secrets ou un fichier de mots de passe libpq à accès restreint; ne la copiez pas dans un ticket, un dépôt, un journal ni une ligne de commande partagée. `prisma:deploy:postgres` vérifie maintenant la cible avant d’appeler Prisma : il autorise une base sans objets applicatifs ni historique, ou une base portant la migration initiale réussie de ce projet; il refuse toute autre base préexistante avant d’exécuter une migration. Cette garde n’est pas une procédure d’adoption ou de mise à niveau d’une ancienne base PostgreSQL. Comme seule la baseline initiale est disponible, aucune migration d’une installation PostgreSQL historique n’est actuellement prise en charge; un tel changement exige une chaîne de migrations et une validation distinctes. Aucun changement de schéma automatique ne se fait au démarrage.

Le test `npm run test:postgresql:integration` démarre un cluster PostgreSQL 17.11 isolé sur loopback, crée des bases temporaires et utilise uniquement des données synthétiques; il les supprime à la fin. Il vérifie une session persistée acceptée depuis un second processus, sa révocation après réinitialisation de mot de passe, les migrations répétées, l’import SQLite, le verrouillage concurrent et la restauration d’archive. Il ne consulte pas `SAFE_ERP_DATABASE_URL` et ne touche aucune base client. Pour les autres tests visant un serveur PostgreSQL externe, utilisez une base dédiée avec `SAFE_ERP_TEST_DATABASE_URL`; ne réutilisez jamais l’URL de production. Les tests SQLite seuls ne valident pas PostgreSQL.

## Reprise d’une base SQLite SAFE

L’importeur fonctionne sur une **copie de sauvegarde vérifiée et hors ligne**, jamais sur une base ouverte ou une base client directement. Créez d’abord une sauvegarde SQLite avec la procédure existante, migrez une base PostgreSQL vide avec la baseline ci-dessus, puis effectuez le dry-run :

```powershell
$env:SAFE_ERP_DATABASE_PROVIDER = 'postgresql'
$env:SAFE_ERP_DATABASE_URL = 'postgresql://safe_app@db.example.invalid:5432/safe?sslmode=require'
npm run db:import:sqlite-to-postgres -- --source 'C:\SAFE\backups\client-before-pg.sqlite' --report 'C:\SAFE\reports\client-import-review.json'
```

Le dry-run ne modifie pas PostgreSQL; il contrôle l’intégrité SQLite et ses clés étrangères, vérifie que les migrations PostgreSQL sont à jour et que toutes les tables cibles sont vides, puis décrit les nombres de lignes, dépendances, historique source et écarts de tables/colonnes. Il n’importe pas `_prisma_migrations`, les tables internes ni les triggers SQLite; les triggers de clôture PostgreSQL sont définis par la baseline. Le rapport est créé sans écraser un fichier existant et ne contient pas les valeurs métier ni l’URL de connexion. Il ne valide pas les équilibres comptables, totaux métier ni la conformité des données; ces rapprochements restent obligatoires avant bascule. Le parcours dry-run et import effectif a été exécuté avec une base SQLite synthétique et une cible PostgreSQL jetable vide; cela ne valide pas une reprise client.

Après revue du rapport, l’import effectif requiert une confirmation distincte et reste atomique dans une transaction PostgreSQL sérialisable :

```powershell
npm run db:import:sqlite-to-postgres -- --source 'C:\SAFE\backups\client-before-pg.sqlite' --report 'C:\SAFE\reports\client-import-applied.json' --approved-report 'C:\SAFE\reports\client-import-review.json' --apply --confirm-target-empty
```

L’importeur lie l’approbation au contenu SHA-256 de la source, à l’URL cible, au plan de lignes/colonnes et aux migrations actuelles; tout changement invalide le rapport. L’import s’arrête si la source contient une table/colonne inconnue, une clé étrangère invalide, si une colonne cible obligatoire ne peut recevoir de valeur, si le schéma cible n’est pas à jour/non vide ou si ses clés étrangères ne sont pas différables. Les lignes sont recomptées avant validation de la transaction; les clés étrangères différées sont vérifiées au commit. Si l’import échoue, la transaction est annulée. La source doit rester immuable pendant l’opération et l’application doit rester arrêtée sur la cible vide. L’importer a passé un dry-run et une application sur des données synthétiques avec PostgreSQL jetable; aucune reprise client ni validation métier n’en découle.

## Schémas et migrations

- SQLite : `src/data/prisma/schema.prisma` et `src/data/prisma/migrations/`.
- PostgreSQL : `src/data/prisma/postgresql/schema.prisma` et `src/data/prisma/postgresql/migrations/`.
- La baseline PostgreSQL reflète le schéma Prisma courant; ses clés étrangères sont différables pour la reprise transactionnelle et les règles de protection de clôture utilisent des triggers PostgreSQL dédiés.
- La longue chaîne SQLite existante n’est ni convertie ni appliquée à PostgreSQL. Aucune mise à niveau d’une base préexistante ni adoption automatique de son historique n’a été validée. Le harnais vérifie seulement l’application de la baseline et une migration additive synthétique dans une copie temporaire de la chaîne; cette dernière ne modifie pas les migrations SAFE.
- Un outil d’import SQLite SAFE vers PostgreSQL est fourni ci-dessus et a été exécuté sur des données synthétiques dans le harnais jetable. La baseline seule ne constitue pas un plan de migration de données.
- La chaîne SQLite contient deux répertoires intercompagnies. L’audit du schéma courant et de `20261110184600_native_intercompany_transactions/migration.sql` confirme que cette migration antérieure crée déjà le modèle `IntercompanyTransaction`, ses clés étrangères et tous ses index actuels. `20261110190000_native_intercompany_transactions` n’apporte donc aucune modification de schéma; son `migration.sql` contient maintenant uniquement un commentaire qui documente ce no-op, sans dupliquer de DDL. Cela corrige l’erreur P3015 sans supprimer ni renommer le répertoire et sans appliquer de migration à une base existante.

Toute mise à niveau devra être répétée sur une copie, précédée d’une sauvegarde vérifiée et appliquée explicitement par un responsable. Ne marquez pas artificiellement des migrations comme appliquées et n’utilisez pas `db push` pour contourner l’historique.

## Sauvegarde et restauration PostgreSQL

Ces commandes restent les procédures opérateur. Le harnais a créé une archive custom-format de la base PostgreSQL jetable puis l’a restaurée avec succès vers une base vide distincte; dernière archive de 397 121 octets, produite et restaurée avec `pg_dump`/`pg_restore` 18.0 sur le serveur 17.11. Ce résultat limité ne valide pas une procédure d’exploitation ou une sauvegarde client. Utilisez des binaires `pg_dump`/`pg_restore` compatibles avec la version majeure du serveur et un `PGPASSFILE` protégé plutôt qu’un mot de passe dans l’URL.

Créer une archive PostgreSQL cohérente, en choisissant une nouvelle destination protégée :

```powershell
pg_dump --format=custom --no-owner --file='C:\SAFE\backups\safe.dump' $env:SAFE_ERP_DATABASE_URL
pg_restore --list 'C:\SAFE\backups\safe.dump'
```

Pour la restauration, créez d’abord une base **vide et distincte** de la source, affectez son URL à `SAFE_ERP_RESTORE_DATABASE_URL`, puis restaurez sans `--clean` ni `--if-exists`. N’effectuez pas de restauration par-dessus une base active :

```powershell
pg_restore --exit-on-error --no-owner --dbname=$env:SAFE_ERP_RESTORE_DATABASE_URL 'C:\SAFE\backups\safe.dump'
```

Vérifiez la version du serveur, la fin sans erreur de `pg_restore`, l’état des migrations, les comptes de lignes et les contrôles métier avant toute décision de bascule. Le harnais a vérifié l’état des migrations et les données restaurées; les contrôles métier représentatifs restent à définir et à exécuter avant tout go/no-go.

## Installation, hébergement et charge

Une installation multi-utilisateur doit placer l’API derrière HTTPS et un mécanisme d’authentification serveur/RBAC; la configuration web héritée du dépôt décrit SQLite et avertit que son serveur de partage n’authentifie pas les appels API. Ne l’exposez pas telle quelle à Internet. Le service PostgreSQL devra être privé, avec TLS, sauvegardes hors hôte et identifiants à privilèges minimaux.

Une mesure synthétique avec 16 clients `pg` directs et 320 transactions a vérifié l’intégrité du compteur : 319,04 ms, P95 de 47,11 ms et 1 003 écritures/s lors du dernier essai. Elle ne mesure pas le pool Prisma.

Le pool applicatif a été mesuré séparément avec un client Prisma généré pour PostgreSQL, importé par `src/data/prisma/client.ts`, et l’URL préparée par `resolveDatabaseConfiguration` (`connection_limit=10` par défaut). Le driver `pg` sert uniquement à échantillonner `pg_stat_activity`; les transactions mesurées passent par Prisma. Chaque transaction fait une insertion idempotente, une courte attente synthétique, une mise à jour concurrente du même compteur puis une lecture, ce qui exerce le pool, la file d’acquisition et la contention d’écriture. Résultats sur PostgreSQL 17.11 :

| Workers | Transactions | Durée (ms) | P50 (ms) | P95 (ms) | P99 (ms) | Acquisition pool P95 (ms) | Tx/s | Connexions Prisma max./actives | Attentes verrou max. |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 16 | 160 | 750,59 | 53,61 | 166,97 | 252,60 | 136,47 | 213,17 | 10/10 | 5 |
| 32 | 320 | 1 009,52 | 97,58 | 111,80 | 123,49 | 76,47 | 316,98 | 10/10 | 6 |
| 50 | 500 | 1 580,83 | 156,98 | 166,44 | 170,74 | 131,38 | 316,29 | 10/10 | 6 |

Aucun des trois paliers n’a produit d’erreur ni de timeout; le nombre de lignes et le compteur correspondaient aux transactions, et le rejeu idempotent n’a ajouté aucune ligne. L’acquisition P95 est mesurée par l’application entre la demande de transaction interactive et l’entrée dans son callback; Prisma n’expose pas ici directement les métriques internes de sa file. Le workload synthétique est volontairement contentieux et cette mesure locale n’est ni une garantie de capacité ni une cible de dimensionnement. Aucun hébergeur, système d’exploitation, version PostgreSQL ni dimensionnement n’est déclaré officiellement supporté dans cette livraison. Avant de le faire, répétez au minimum l’installation, la mise à niveau d’une copie représentative, la sauvegarde/restauration vers une base vide et les charges concurrentes représentatives; ne déduisez pas une capacité d’utilisateurs en production de ces essais.

Le benchmark SQLite synthétique existant a été exécuté sur Windows avec Node.js 24.21.0 et Prisma 5.22.0. Dans ce scénario précis, le plus haut palier respectant les seuils du banc était 16 utilisateurs concurrents (P95 lecture 149,47 ms, écriture 255,82 ms, intégrité correcte). Au palier 20, 8 écritures ont échoué par timeout SQLite (P1008/P2028), et l’intégrité attendue n’était plus satisfaite. Cette mesure ne s’extrapole ni à PostgreSQL ni à d’autres machines, et confirme que SQLite ne doit pas être présenté comme base multi-utilisateur à charge élevée.

## Vérifications de cette livraison

- Les deux schémas Prisma valident et les clients SQLite et PostgreSQL ont été générés successivement; le client SQLite a ensuite été régénéré pour laisser l’installation locale dans son état initial.
- Les tests de déploiement de la chaîne Prisma passent 4/4, dont l’installation complète sur SQLite jetable, la mise à niveau synthétique et la conservation des entités. Le contrat statique des migrations PostgreSQL passe 24/24.
- Sauvegarde/restauration SQLite : 3 tests passés. La suite deployment-safety passe 9/9. Après ajout de la migration additive d'instantané de paie, la répétition PostgreSQL a validé 121 tables publiques et 20 migrations SAFE, plus une migration additive synthétique (21 entrées après mise à niveau), l'import/restauration vers une base distincte, les sessions multi-processus et leur révocation.
- Le dossier n’a pas de métadonnées Git, donc aucun diff de référence n’est disponible. Le défaut P3015 est corrigé par le no-op documenté ci-dessus; aucune base de données existante n’a été modifiée dans cette validation.
- Le harnais `npm run test:postgresql:integration` vérifie réellement sur PG 17.11 jetable : installation et redéploiement sans changement; mise à niveau additive synthétique; import SQLite synthétique en dry-run et en application; session vérifiée depuis un autre processus puis révoquée après réinitialisation; course clôture/journal via deux processus applicatifs Prisma distincts avec attente observée dans `pg_stat_activity`; sauvegarde/restauration vers une base vide; charge `pg` directe; et pool Prisma généré PostgreSQL à 16/32/50 workers. Le dernier essai est sorti avec le code 0 après nettoyage; l'arrêt explicite peut afficher un avertissement `exit-hook` du processus PostgreSQL embarqué, bien que les étapes de fermeture et de nettoyage soient terminées. Cela valide des scénarios synthétiques locaux, pas un déploiement multi-hôte, la haute disponibilité ou une capacité de production. Aucun serveur persistant, distant, base client ou donnée réelle n’a été utilisé.
- Le précontrôle de déploiement a aussi été vérifié sur cette cible jetable : il autorise l’installation neuve et un redéploiement avec baseline reconnue, mais bloque une base synthétique non vide sans baseline; la ligne témoin reste intacte et Prisma ne crée même pas `_prisma_migrations`.
- Le dernier `npm audit` signalait quatre avis sur les dépendances existantes : deux modérés (`uuid` transitif d’`exceljs`) et deux élevés (`image-size` transitif de `pptxgenjs`); `npm audit --omit=dev` en retrouve les deux élevés en production. Les correctifs proposés via `--force` impliquent des changements de version cassants/rétrogradations; ils n’ont pas été appliqués. Aucun avis ne visait les dépendances du harnais PostgreSQL.
- La mise à niveau testée est synthétique et non représentative d’une ancienne base client. L’import ne vérifie pas les équilibres métier, la chaîne complète des fonctions métier sur PG n’est pas encore validée, et le test de charge ne couvre ni multi-instance distribué ni capacité de production. Aucun hébergement ni version majeure n’est officiellement supporté.
