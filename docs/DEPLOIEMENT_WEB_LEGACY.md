# DÃ©ploiement web professionnel

> **Archive historique â€” ne pas suivre comme procÃ©dure de dÃ©ploiement.** Les sections sur `share-server.mjs`, `shared-db.json`, le port 5300 et lâ€™ancienne architecture ne dÃ©crivent pas SAFE ERP actuel. Consultez le nouveau [guide de dÃ©ploiement SAFE ERP](DEPLOIEMENT_WEB.md). Les sections 7 et 8 ci-dessous restent limitÃ©es aux opÃ©rations SQLite locales et ne valent pas procÃ©dure de mise en production PostgreSQL.

Objectif : rendre SAFE accessible par Internet, en HTTPS, sur un serveur unique, avec sauvegardes et redÃ©marrage automatique.

> **Avertissement historique.** Lâ€™ancien serveur (`share-server.mjs`) nâ€™authentifie pas les appels API. Nâ€™utilisez pas les procÃ©dures de cette archive pour exposer SAFE ERP sur Internet.

## Architecture cible

```
Navigateur (HTTPS)
      â”‚
      â–¼
Caddy (443, certificat automatique)
      â”‚ reverse_proxy 127.0.0.1:5300
      â–¼
Node share-server.mjs (5300, non exposÃ©)
      â”‚
      â–¼
/var/lib/antigravity/shared-db.json
```

Un seul serveur applicatif, une seule base. Caddy fournit HTTPS et peut ajouter une couche d'accÃ¨s.

## 1. Serveur et DNS

- VPS Ubuntu 24.04 LTS, 2 vCPU, 4 Go RAM, 40 Go SSD.
- CrÃ©ez un enregistrement DNS `A` : `finance.example.com` â†’ IP du VPS.
- Connectez-vous en SSH :

```bash
ssh root@IP_DU_VPS
```

## 2. Installer Node.js et Caddy

```bash
apt update && apt upgrade -y
apt install -y curl ufw

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Caddy (dÃ©pÃ´t officiel)
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

node -v   # v20.x
caddy version
```

## 3. DÃ©ployer l'application

Sur votre PC, prÃ©parez un dossier `dist/`, `scripts/` et `package.json`. Puis :

```bash
adduser --system --group --home /opt/antigravity antigravity
mkdir -p /opt/antigravity /var/lib/antigravity
```

Copiez les fichiers (depuis votre PC) :

```bash
scp -r dist scripts package.json root@IP_DU_VPS:/opt/antigravity/
chown -R antigravity:antigravity /opt/antigravity /var/lib/antigravity
```

Aucun `npm install` n'est nÃ©cessaire : le serveur n'utilise que les modules natifs de Node.

## 4. Service systemd

CrÃ©ez `/etc/systemd/system/antigravity.service` :

```ini
[Unit]
Description=SAFE
After=network.target

[Service]
Type=simple
User=antigravity
Group=antigravity
WorkingDirectory=/opt/antigravity
ExecStart=/usr/bin/node scripts/share-server.mjs 5300 /var/lib/antigravity/shared-db.json
Restart=always
RestartSec=3
Environment=NODE_ENV=production
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/var/lib/antigravity

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now antigravity
systemctl status antigravity
curl http://127.0.0.1:5300/api/health
```

## 5. HTTPS avec Caddy

`/etc/caddy/Caddyfile` :

```caddy
finance.example.com {
    encode zstd gzip

    # Protection minimale si l'application reste sans authentification serveur.
    # GÃ©nÃ©rez le hash : caddy hash-password --plaintext 'MotDePasseFort'
    basic_auth {
        equipe $2a$14$REMPLACER_PAR_LE_HASH
    }

    reverse_proxy 127.0.0.1:5300
}
```

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

Caddy obtient automatiquement le certificat Let's Encrypt. VÃ©rifiez `https://finance.example.com`.

## 6. Pare-feu

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

**N'ouvrez pas 5300** : il doit rester accessible uniquement en local (Caddy s'en charge).

## 7. Sauvegarde et restauration SQLite

Attention : les sections 1 Ã  6 et 9 Ã  12 dÃ©crivent lâ€™ancien serveur `share-server.mjs` et son fichier `shared-db.json`; elles ne dÃ©ploient pas lâ€™application Prisma/SQLite actuelle de ce dÃ©pÃ´t. Nâ€™exÃ©cutez pas leurs commandes sur lâ€™installation actuelle : certaines agissent sur des services et des chemins hÃ©ritÃ©s. Les sections 7 et 8 sont les seules procÃ©dures opÃ©rationnelles de ce guide adaptÃ©es Ã  la base SQLite actuelle, et elles nâ€™arrÃªtent aucun service.

Le chemin runtime effectif est dÃ©fini par `SAFE_ERP_DATABASE_URL` (URL Prisma `file:...`); sans surcharge, lâ€™application utilise `src/data/data.db`. Les commandes Prisma CLI exigent dÃ©sormais cette variable explicitement et Ã©chouent sans elle. Les outils opÃ©rateur de sauvegarde/restauration/vÃ©rification nâ€™acceptent pas ce chemin par dÃ©faut : ils exigent une URL vers un fichier SQLite absolu et une destination distincte pour la sauvegarde. En dÃ©ploiement, vÃ©rifiez le chemin cible attendu avant toute opÃ©ration.

Depuis la racine du projet, une sauvegarde cohÃ©rente peut Ãªtre crÃ©Ã©e pendant que SAFE fonctionne. Lâ€™outil SQLite en ligne produit un nouveau fichier et vÃ©rifie son intÃ©gritÃ©; il refuse dâ€™Ã©craser une destination existante. Le dossier de destination doit dÃ©jÃ  exister et Ãªtre protÃ©gÃ© comme la base, car la sauvegarde contient toutes les donnÃ©es :

```bash
SAFE_ERP_DATABASE_URL='file:/chemin/absolu/vers/data.db' \
  npm run db:backup -- /chemin/protege/safe-backup.sqlite
```

Sans chemin explicite, `npm run db:backup` crÃ©e un nom unique Ã  cÃ´tÃ© de la base. Copiez les sauvegardes vers un emplacement distinct conformÃ©ment aux rÃ¨gles de stockage approuvÃ©es pour lâ€™installation; aucune frÃ©quence ni durÃ©e de conservation nâ€™est dÃ©finie par le projet. Le contrÃ´le automatique porte sur lâ€™intÃ©gritÃ© SQLite, pas sur la cohÃ©rence mÃ©tier ni sur les fichiers externes Ã  la base.

Une restauration remplace le fichier cible : elle exige une fenÃªtre dâ€™indisponibilitÃ© et que le service ait Ã©tÃ© arrÃªtÃ© par lâ€™exploitant via son superviseur habituel. Ne lancez pas la restauration sur une base ouverte. La commande exige la confirmation explicite, refuse les fichiers SQLite `-wal`/`-shm`/`-journal` rÃ©siduels et conserve une copie vÃ©rifiÃ©e de la base remplacÃ©e Ã  cÃ´tÃ© du fichier :

```bash
SAFE_ERP_DATABASE_URL='file:/chemin/absolu/vers/data.db' \
  npm run db:restore -- /chemin/protege/safe-backup.sqlite --confirm-target-offline
```

La restauration vÃ©rifie la sauvegarde et le fichier restaurÃ© avant de rÃ©ussir. AprÃ¨s cette commande, lâ€™exploitant peut redÃ©marrer le service selon la procÃ©dure de lâ€™installation et contrÃ´ler son Ã©tat. Le projet ne configure pas de planificateur de sauvegarde, de rÃ©tention, de chiffrement ni de stockage distant.

## 8. Migrations Prisma SQLite

La chaÃ®ne versionnÃ©e se trouve dans `src/data/prisma/migrations`; `20261101190000_core_schema_foundation` Ã©tablit les tables prÃ©requises par les migrations dâ€™Ã©volution. Les tests de parcours complets utilisent exclusivement des bases temporaires :

```bash
npm run test:prisma-migrations
```

Avant toute migration, dÃ©finissez `SAFE_ERP_DATABASE_URL` avec une URL `file:` absolue vers la base visÃ©e, confirmez le chemin, vÃ©rifiez lâ€™Ã©tat puis sauvegardez et vÃ©rifiez la sauvegarde. Exemple PowerShell :

```powershell
$env:SAFE_ERP_DATABASE_URL = 'file:C:/chemin/protege/data.db'
npm run prisma:status
npm run db:backup -- C:/chemin/protege/safe-before-migration.sqlite
```

`npm run prisma:deploy` exÃ©cute `prisma migrate deploy` (jamais `db push`) et ne doit Ãªtre lancÃ© quâ€™aprÃ¨s autorisation, sauvegarde vÃ©rifiÃ©e et rÃ©pÃ©tition sur une copie jetable. Une base prÃ©remplie dÃ©pourvue de `_prisma_migrations` nâ€™est pas une base neuve : le dÃ©ploiement doit sâ€™arrÃªter tant quâ€™une procÃ©dure de baseline et une comparaison de schÃ©ma nâ€™ont pas Ã©tÃ© validÃ©es pour cette cible. Ne marquez pas les migrations comme appliquÃ©es pour contourner ce contrÃ´le et nâ€™utilisez pas `baseline_complete.ps1`, qui vise un ancien chemin et une ancienne procÃ©dure. Le projet ne dÃ©ploie ni nâ€™arrÃªte un service dans ces tests.

### RÃ©pÃ©tition et go/no-go opÃ©rateur

Les contrÃ´les suivants ne dÃ©marrent/arrÃªtent aucun service et ne lancent aucune migration. `db:verify` ouvre la cible en lecture seule; le contrÃ´le `--require-up-to-date` ne fait quâ€™interroger `prisma migrate status`. Les commandes de sauvegarde et de restauration exigent dÃ©sormais toutes deux `SAFE_ERP_DATABASE_URL` et une cible explicite. ExÃ©cuter dâ€™abord les rÃ©pÃ©titions intÃ©grÃ©es, qui ne crÃ©ent que des SQLite temporaires :

```powershell
npm run test:deployment-safety
npm run test:prisma-migrations
```

Pour prÃ©parer une intervention rÃ©elle ultÃ©rieure, consigner le build/version dÃ©ployÃ©, lâ€™URL `file:` et son chemin absolu attendu, la destination de sauvegarde protÃ©gÃ©e, le responsable de lâ€™autorisation, la fenÃªtre et les contrÃ´les de retour. La destination de sauvegarde doit Ãªtre nouvelle et situÃ©e sur un stockage approuvÃ©. En PowerShell :

```powershell
$env:SAFE_ERP_DATABASE_URL = 'file:C:/SAFE/data.db'
npm run db:verify -- --expected-database-path 'C:\SAFE\data.db'
npm run prisma:status
npm run db:backup -- 'C:\SAFE\backups\data-before-deploy.sqlite'
Get-FileHash 'C:\SAFE\backups\data-before-deploy.sqlite' -Algorithm SHA256
```

Le rÃ©sultat de `db:backup` confirme la crÃ©ation exclusive et lâ€™intÃ©gritÃ© SQLite de la copie. `Get-FileHash` fournit une empreinte Ã  consigner; il ne remplace ni une copie hors machine ni une restauration testÃ©e. Les vÃ©rifications SQLite ne certifient pas la cohÃ©rence mÃ©tier. Examiner `prisma:status` sans lâ€™interprÃ©ter comme un contrÃ´le de paritÃ© avec `schema.prisma`.

**Quiescence avant toute Ã©criture autorisÃ©e :** lâ€™exploitant doit annoncer la maintenance, empÃªcher les nouvelles Ã©critures via le mÃ©canisme de maintenance approuvÃ© pour lâ€™installation, drainer les requÃªtes et tÃ¢ches en cours, puis confirmer auprÃ¨s du responsable dâ€™exploitation quâ€™aucun processus nâ€™utilise le fichier SQLite. Ce dÃ©pÃ´t nâ€™implÃ©mente pas de mode maintenance ni de commande de quiescence et les scripts ne stoppent pas de serveur. Une restauration exige en plus un service effectivement arrÃªtÃ© par lâ€™exploitant et lâ€™absence de fichiers `-wal`, `-shm` et `-journal`; ne supprimez jamais ces fichiers manuellement.

**Go/no-go avant migration :** le propriÃ©taire du systÃ¨me doit approuver les effets de donnÃ©es, la migration candidate, la cible, la sauvegarde vÃ©rifiÃ©e, la restauration rÃ©pÃ©tÃ©e sur copie jetable, la fenÃªtre dâ€™indisponibilitÃ©, les contrÃ´les post-dÃ©ploiement et le responsable du retour arriÃ¨re. Une base prÃ©remplie sans historique Prisma exige en plus une procÃ©dure de baseline vÃ©rifiÃ©e. Le go/no-go ne peut pas Ãªtre dÃ©duit du succÃ¨s dâ€™un test de chaÃ®ne neuve, dâ€™un statut Prisma ou de `db:verify`.

**DÃ©cision pour lâ€™Ã©tat actuel : NO-GO.** La dÃ©rive destructive entre migrations et `schema.prisma` reste ouverte : `Currency`/`PayrollRule` et les reconstructions de tables/contraintes nâ€™ont pas de dÃ©cision de conservation approuvÃ©e. La base locale prÃ©remplie nâ€™a pas dâ€™historique `_prisma_migrations`. Ne lancez donc pas `npm run prisma:deploy`, lâ€™adoption de baseline, `db push` ou une synchronisation de schÃ©ma sur une base mÃ©tier. La reprise requiert une dÃ©cision documentÃ©e du propriÃ©taire sur les donnÃ©es et contraintes touchÃ©es, puis une migration non destructive revue, une baseline vÃ©rifiÃ©e si nÃ©cessaire et un nouveau go explicite.

AprÃ¨s un go futur seulement, lâ€™opÃ©rateur autorisÃ© pourra exÃ©cuter manuellement `npm run prisma:deploy` pendant la fenÃªtre. ContrÃ´ler ensuite `npm run prisma:status`, puis `npm run db:verify -- --expected-database-path 'C:\SAFE\data.db' --require-up-to-date`, les journaux applicatifs, `/api/health` et un parcours fonctionnel approuvÃ©. `--require-up-to-date` atteste seulement que lâ€™historique de migrations est Ã  jour, pas la paritÃ© complÃ¨te du schÃ©ma ni lâ€™intÃ©gritÃ© mÃ©tier.

**Retour arriÃ¨re sur copie jetable :** `npm run test:deployment-safety` crÃ©e une base SQLite temporaire, prend une sauvegarde vÃ©rifiÃ©e, simule une Ã©criture postÃ©rieure au point de sauvegarde, restaure cette sauvegarde et vÃ©rifie que la base restaurÃ©e contient lâ€™Ã©tat antÃ©rieur tandis que la copie de rollback conserve lâ€™Ã©tat remplacÃ©. La rÃ©pÃ©tition ne cible aucune base mÃ©tier. En exploitation rÃ©elle, si le propriÃ©taire dÃ©cide le rollback, rÃ©tablir dâ€™abord la quiescence, vÃ©rifier le chemin et la sauvegarde, puis utiliser la commande `db:restore` uniquement sur la cible explicitement configurÃ©e et hors ligne. Conserver la copie prÃ©-restauration ainsi que les journaux; ne pas relancer de migration avant diagnostic et nouvel accord.

Le parcours fresh confirme que les fichiers SQL sâ€™appliquent, mais ce nâ€™est pas encore une preuve de paritÃ© complÃ¨te avec `schema.prisma`. Le diff Prisma propose notamment de supprimer `Currency` et `PayrollRule`, puis de reconstruire `ChartOfAccount`, `Employee`, `Entity`, `Invoice`, `Material`, `MaterialWarehouseStock`, `ProductionOrder`, `ProductionOrderMaterialLine`, `PurchaseInvoiceLine`, `PurchaseOrderLine`, `SalesOrder`, `SalesQuoteItem`, `StockMovement`, `StockReceipt`, `StockSupplierReturn`, `StockTransfer`, `TaxRate` et `User`. Il supprimerait aussi plusieurs index et en crÃ©erait de nouveaux aux portÃ©es diffÃ©rentes. Les copies gÃ©nÃ©rÃ©es ne reprennent que des colonnes communes : par exemple, la reconstruction proposÃ©e de `Entity` copie seulement `id` et `name` alors que le schÃ©ma cible exige aussi `countryId`; celle de `Invoice` omet des montants obligatoires. Sur des donnÃ©es existantes cela peut Ã©chouer ou perdre des champs/tables. Ces diffÃ©rences ne sont pas exÃ©cutÃ©es par `migrate deploy` tant quâ€™elles ne sont pas Ã©crites dans des migrations versionnÃ©es, mais elles bloquent la paritÃ© dÃ©clarÃ©e.

### RÃ©pÃ©tition gÃ©nÃ©rale finale aprÃ¨s les lots

Ã€ la fin de la pÃ©riode de travail de 72 h et aprÃ¨s rÃ©solution des lacunes, la validation dâ€™acceptation doit rester entiÃ¨rement isolÃ©e des bases mÃ©tier et utiliser des SQLite jetables. Elle comporte deux parcours sÃ©parÃ©s :

1. **Installation neuve** : dÃ©ployer la chaÃ®ne candidate complÃ¨te sur une SQLite neuve, vÃ©rifier `migrate status`, `PRAGMA integrity_check` et `PRAGMA foreign_key_check`, puis charger un jeu synthÃ©tique plus volumineux et cohÃ©rent (plusieurs sociÃ©tÃ©s/utilisateurs, rÃ©fÃ©rentiels, stocks, commandes, factures et Ã©critures Ã©quilibrÃ©es) et exÃ©cuter des parcours fonctionnels de vente/commande-facture, rÃ©servation/dÃ©stockage, achats/avoirs et comptabilitÃ©.
2. **Mise Ã  niveau** : prÃ©parer une autre SQLite synthÃ©tique avec le schÃ©ma antÃ©rieur aux migrations candidates, charger le mÃªme type de jeu fictif, capturer avant migration les nombres de lignes et invariants/agrÃ©gats sur les tables critiques (notamment `Currency`, `PayrollRule`, stocks, commandes, factures et journaux), prendre une copie jetable de rÃ©fÃ©rence, puis appliquer les migrations candidates uniquement Ã  la copie. Comparer les comptages et agrÃ©gats aprÃ¨s migration; vÃ©rifier les lignes et relations conservÃ©es, les transformations attendues sÃ©parÃ©ment, lâ€™intÃ©gritÃ©/FK, puis rejouer les parcours fonctionnels sur les donnÃ©es mises Ã  niveau.

Le test dâ€™upgrade existant `npm run test:prisma-migrations` amorce ce harness : il part dâ€™une chaÃ®ne prÃ©-derniÃ¨re cohorte, conserve des enregistrements synthÃ©tiques et compare dÃ©sormais le nombre, le total des montants et les entitÃ©s distinctes de 251 commandes avant/aprÃ¨s les migrations ciblÃ©es. Il ne couvre pas encore le jeu multi-domaines complet dÃ©crit ci-dessus et nâ€™autorise pas Ã  conclure quâ€™aucune donnÃ©e ne pourrait Ãªtre perdue dans toutes les installations. La rÃ©pÃ©tition gÃ©nÃ©rale complÃ¨te reste un critÃ¨re dâ€™acceptation Ã  exÃ©cuter aprÃ¨s les lots, et seulement une fois la dÃ©rive migrations/`schema.prisma` rÃ©solue de faÃ§on non destructive. Des donnÃ©es synthÃ©tiques, mÃªme volumineuses et traitÃ©es comme un scÃ©nario rÃ©aliste, ne sont pas des donnÃ©es de production et ne garantissent pas le comportement de la base mÃ©tier rÃ©elle.

Ne pas fabriquer une migration de Â« synchronisation Â» Ã  partir de ce diff sans dÃ©cisions explicites sur le devenir des tables `Currency` et `PayrollRule`, les changements de contraintes/index globaux ou par sociÃ©tÃ©, et les valeurs de reprise des champs devenus obligatoires. La chaÃ®ne fresh corrigÃ©e et ses migrations suivantes restent distinctes de la base locale prÃ©remplie : cette derniÃ¨re nâ€™a pas `_prisma_migrations` et nÃ©cessite en plus une procÃ©dure de baseline qui compare son schÃ©ma rÃ©el et ses donnÃ©es Ã  un historique approuvÃ©. Le test dâ€™upgrade synthÃ©tique vÃ©rifie uniquement les migrations incrÃ©mentales versionnÃ©es et la conservation des donnÃ©es synthÃ©tiques ciblÃ©es; il ne constitue pas cette baseline et ne justifie aucune application sur une vraie base.

### PrÃ©contrÃ´le et baseline d'une base existante

`npm run db:baseline` exige une URL SQLite explicite et un chemin absolu attendu identique. Sans `--adopt`, lâ€™outil est en prÃ©contrÃ´le : il lit la cible en mode lecture seule, vÃ©rifie intÃ©gritÃ© et clÃ©s Ã©trangÃ¨res, refuse les fichiers annexes SQLite ou un historique Prisma existant, rejoue lâ€™historique complet sur une base temporaire, puis compare exactement les objets SQLite de la cible Ã  cette sortie. Exemple PowerShell :

```powershell
$env:SAFE_ERP_DATABASE_URL = 'file:C:/SAFE/data.db'
npm run db:baseline -- --expected-database-path 'C:\SAFE\data.db'
```

Le prÃ©contrÃ´le dâ€™adoption vÃ©rifie Ã©galement que le rÃ©sultat des migrations correspond au `schema.prisma` courant. Cette vÃ©rification Ã©choue actuellement Ã  cause de la dÃ©rive destructive dÃ©crite ci-dessus; lâ€™outil doit donc refuser lâ€™adoption mÃªme si une cible correspond Ã  la chaÃ®ne de migrations. Aucun historique ne peut Ãªtre adoptÃ© tant que cette dÃ©rive nâ€™a pas Ã©tÃ© rÃ©solue par une dÃ©cision et une migration non destructives approuvÃ©es.

AprÃ¨s rÃ©solution et revue des effets de donnÃ©es/destructifs listÃ©s par lâ€™outil, une adoption future devra se faire sur une cible hors ligne, avec une sauvegarde vÃ©rifiÃ©e vers un nouveau fichier distinct. Les confirmations requises sont explicites :

```powershell
npm run db:baseline -- --expected-database-path 'C:\SAFE\data.db' `
  --adopt --backup-path 'C:\SAFE\backups\data-before-baseline.sqlite' `
  --confirm-target-offline --confirm-data-effects-reviewed
```

Lâ€™adoption ne rejoue pas le SQL des migrations; elle demande Ã  Prisma de rÃ©soudre leur statut comme dÃ©jÃ  appliquÃ© sur une copie de sauvegarde, puis copie lâ€™historique vÃ©rifiÃ© vers la cible dans une transaction SQLite unique. Une erreur pendant cette Ã©criture annule toute la transaction; si la validation Prisma Ã©choue aprÃ¨s le commit, nâ€™exÃ©cutez pas `migrate deploy`, prÃ©servez les journaux et restaurez la sauvegarde vÃ©rifiÃ©e selon la procÃ©dure autorisÃ©e avant diagnostic. La sauvegarde vÃ©rifie lâ€™intÃ©gritÃ© SQLite, le schÃ©ma et les clÃ©s Ã©trangÃ¨res, pas la cohÃ©rence mÃ©tier. Le prÃ©contrÃ´le et les tests nâ€™ont Ã©tÃ© exÃ©cutÃ©s que sur des fichiers temporaires; aucune migration ni baseline nâ€™a Ã©tÃ© appliquÃ©e Ã  la base mÃ©tier.

## 9. Mises Ã  jour

```bash
# Depuis votre PC
scp -r dist/* root@IP_DU_VPS:/opt/antigravity/dist/
ssh root@IP_DU_VPS "chown -R antigravity:antigravity /opt/antigravity/dist && systemctl restart antigravity"
```

Le service worker met le cache Ã  jour Ã  la prochaine visite ; un `Ctrl+F5` force le rechargement.

## 10. Supervision

```bash
# SantÃ© applicative
curl -fsS https://finance.example.com/api/health

# Journaux
journalctl -u antigravity -f
```

Ajoutez une supervision externe (UptimeRobot, BetterStack) sur `/api/health` et une alerte disque.

## 10. Passer Ã  PostgreSQL (recommandÃ© pour la production)

Le fichier JSON convient Ã  une PME et Ã  un serveur unique, mais montre ses limites en charge et en concurrence.

Ã‰tapes :

1. CrÃ©er une base PostgreSQL et un utilisateur dÃ©diÃ©.
2. Remplacer la lecture/Ã©criture du fichier par une API REST :
   - `GET /api/db` â†’ lecture ;
   - `PUT /api/db` â†’ Ã©criture transactionnelle avec numÃ©ro de version ;
   - `GET /api/events` â†’ SSE.
3. Ajouter une authentification serveur (JWT/SSO) et des permissions par rÃ´le.
4. GÃ©rer les conflits par verrou optimiste (`version` en base) au lieu du Â« dernier Ã©crivain gagne Â».
5. Sauvegardes `pg_dump` quotidiennes + rÃ©plication.

Le front-end n'a pas Ã  Ãªtre rÃ©Ã©crit : seule la couche `src/data/store.tsx` change.

## 11. Haute disponibilitÃ© (optionnel)

- Deux instances Node derriÃ¨re Caddy, mais **une seule base primaire**.
- PostgreSQL avec rÃ©plique en lecture.
- Stockage des fichiers statiques sur CDN.
- Pour un groupe multi-sites, privilÃ©gier un hÃ©bergement central et des accÃ¨s HTTPS plutÃ´t que plusieurs serveurs indÃ©pendants.

## 12. Checklist avant mise en production

- [ ] Nom de domaine et HTTPS valides
- [ ] Port 5300 non exposÃ©
- [ ] Authentification d'accÃ¨s (Caddy ou SSO)
- [ ] Sauvegardes quotidiennes testÃ©es (restauration incluse)
- [ ] Supervision `/api/health` et alertes
- [ ] Journalisation et rotation des logs
- [ ] ProcÃ©dure de mise Ã  jour documentÃ©e
- [ ] Test de coupure et de reprise
