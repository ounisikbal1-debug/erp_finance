# Déploiement web professionnel

> **Archive historique — ne pas suivre comme procédure de déploiement.** Les sections sur `share-server.mjs`, `shared-db.json`, le port 5300 et l’ancienne architecture ne décrivent pas SAFE ERP actuel. Consultez le nouveau [guide de déploiement SAFE ERP](DEPLOIEMENT_WEB.md). Les sections 7 et 8 ci-dessous restent limitées aux opérations SQLite locales et ne valent pas procédure de mise en production PostgreSQL.

Objectif : rendre SAFE accessible par Internet, en HTTPS, sur un serveur unique, avec sauvegardes et redémarrage automatique.

> **Avertissement historique.** L’ancien serveur (`share-server.mjs`) n’authentifie pas les appels API. N’utilisez pas les procédures de cette archive pour exposer SAFE ERP sur Internet.

## Architecture cible

```
Navigateur (HTTPS)
      │
      ▼
Caddy (443, certificat automatique)
      │ reverse_proxy 127.0.0.1:5300
      ▼
Node share-server.mjs (5300, non exposé)
      │
      ▼
/var/lib/antigravity/shared-db.json
```

Un seul serveur applicatif, une seule base. Caddy fournit HTTPS et peut ajouter une couche d'accès.

## 1. Serveur et DNS

- VPS Ubuntu 24.04 LTS, 2 vCPU, 4 Go RAM, 40 Go SSD.
- Créez un enregistrement DNS `A` : `finance.example.com` → IP du VPS.
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

# Caddy (dépôt officiel)
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

node -v   # v20.x
caddy version
```

## 3. Déployer l'application

Sur votre PC, préparez un dossier `dist/`, `scripts/` et `package.json`. Puis :

```bash
adduser --system --group --home /opt/antigravity antigravity
mkdir -p /opt/antigravity /var/lib/antigravity
```

Copiez les fichiers (depuis votre PC) :

```bash
scp -r dist scripts package.json root@IP_DU_VPS:/opt/antigravity/
chown -R antigravity:antigravity /opt/antigravity /var/lib/antigravity
```

Aucun `npm install` n'est nécessaire : le serveur n'utilise que les modules natifs de Node.

## 4. Service systemd

Créez `/etc/systemd/system/antigravity.service` :

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
    # Générez le hash : caddy hash-password --plaintext 'MotDePasseFort'
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

Caddy obtient automatiquement le certificat Let's Encrypt. Vérifiez `https://finance.example.com`.

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

Attention : les sections 1 à 6 et 9 à 12 décrivent l’ancien serveur `share-server.mjs` et son fichier `shared-db.json`; elles ne déploient pas l’application Prisma/SQLite actuelle de ce dépôt. N’exécutez pas leurs commandes sur l’installation actuelle : certaines agissent sur des services et des chemins hérités. Les sections 7 et 8 sont les seules procédures opérationnelles de ce guide adaptées à la base SQLite actuelle, et elles n’arrêtent aucun service.

Le chemin runtime effectif est défini par `SAFE_ERP_DATABASE_URL` (URL Prisma `file:...`); sans surcharge, l’application utilise `src/data/data.db`. Les commandes Prisma CLI exigent désormais cette variable explicitement et échouent sans elle. Les outils opérateur de sauvegarde/restauration/vérification n’acceptent pas ce chemin par défaut : ils exigent une URL vers un fichier SQLite absolu et une destination distincte pour la sauvegarde. En déploiement, vérifiez le chemin cible attendu avant toute opération.

Depuis la racine du projet, une sauvegarde cohérente peut être créée pendant que SAFE fonctionne. L’outil SQLite en ligne produit un nouveau fichier et vérifie son intégrité; il refuse d’écraser une destination existante. Le dossier de destination doit déjà exister et être protégé comme la base, car la sauvegarde contient toutes les données :

```bash
SAFE_ERP_DATABASE_URL='file:/chemin/absolu/vers/data.db' \
  npm run db:backup -- /chemin/protege/safe-backup.sqlite
```

Sans chemin explicite, `npm run db:backup` crée un nom unique à côté de la base. Copiez les sauvegardes vers un emplacement distinct conformément aux règles de stockage approuvées pour l’installation; aucune fréquence ni durée de conservation n’est définie par le projet. Le contrôle automatique porte sur l’intégrité SQLite, pas sur la cohérence métier ni sur les fichiers externes à la base.

Une restauration remplace le fichier cible : elle exige une fenêtre d’indisponibilité et que le service ait été arrêté par l’exploitant via son superviseur habituel. Ne lancez pas la restauration sur une base ouverte. La commande exige la confirmation explicite, refuse les fichiers SQLite `-wal`/`-shm`/`-journal` résiduels et conserve une copie vérifiée de la base remplacée à côté du fichier :

```bash
SAFE_ERP_DATABASE_URL='file:/chemin/absolu/vers/data.db' \
  npm run db:restore -- /chemin/protege/safe-backup.sqlite --confirm-target-offline
```

La restauration vérifie la sauvegarde et le fichier restauré avant de réussir. Après cette commande, l’exploitant peut redémarrer le service selon la procédure de l’installation et contrôler son état. Le projet ne configure pas de planificateur de sauvegarde, de rétention, de chiffrement ni de stockage distant.

## 8. Migrations Prisma SQLite

La chaîne versionnée se trouve dans `src/data/prisma/migrations`; `20261101190000_core_schema_foundation` établit les tables prérequises par les migrations d’évolution. Les tests de parcours complets utilisent exclusivement des bases temporaires :

```bash
npm run test:prisma-migrations
```

Avant toute migration, définissez `SAFE_ERP_DATABASE_URL` avec une URL `file:` absolue vers la base visée, confirmez le chemin, vérifiez l’état puis sauvegardez et vérifiez la sauvegarde. Exemple PowerShell :

```powershell
$env:SAFE_ERP_DATABASE_URL = 'file:C:/chemin/protege/data.db'
npm run prisma:status
npm run db:backup -- C:/chemin/protege/safe-before-migration.sqlite
```

`npm run prisma:deploy` exécute `prisma migrate deploy` (jamais `db push`) et ne doit être lancé qu’après autorisation, sauvegarde vérifiée et répétition sur une copie jetable. Une base préremplie dépourvue de `_prisma_migrations` n’est pas une base neuve : le déploiement doit s’arrêter tant qu’une procédure de baseline et une comparaison de schéma n’ont pas été validées pour cette cible. Ne marquez pas les migrations comme appliquées pour contourner ce contrôle et n’utilisez pas `baseline_complete.ps1`, qui vise un ancien chemin et une ancienne procédure. Le projet ne déploie ni n’arrête un service dans ces tests.

### Répétition et go/no-go opérateur

Les contrôles suivants ne démarrent/arrêtent aucun service et ne lancent aucune migration. `db:verify` ouvre la cible en lecture seule; le contrôle `--require-up-to-date` ne fait qu’interroger `prisma migrate status`. Les commandes de sauvegarde et de restauration exigent désormais toutes deux `SAFE_ERP_DATABASE_URL` et une cible explicite. Exécuter d’abord les répétitions intégrées, qui ne créent que des SQLite temporaires :

```powershell
npm run test:deployment-safety
npm run test:prisma-migrations
```

Pour préparer une intervention réelle ultérieure, consigner le build/version déployé, l’URL `file:` et son chemin absolu attendu, la destination de sauvegarde protégée, le responsable de l’autorisation, la fenêtre et les contrôles de retour. La destination de sauvegarde doit être nouvelle et située sur un stockage approuvé. En PowerShell :

```powershell
$env:SAFE_ERP_DATABASE_URL = 'file:C:/SAFE/data.db'
npm run db:verify -- --expected-database-path 'C:\SAFE\data.db'
npm run prisma:status
npm run db:backup -- 'C:\SAFE\backups\data-before-deploy.sqlite'
Get-FileHash 'C:\SAFE\backups\data-before-deploy.sqlite' -Algorithm SHA256
```

Le résultat de `db:backup` confirme la création exclusive et l’intégrité SQLite de la copie. `Get-FileHash` fournit une empreinte à consigner; il ne remplace ni une copie hors machine ni une restauration testée. Les vérifications SQLite ne certifient pas la cohérence métier. Examiner `prisma:status` sans l’interpréter comme un contrôle de parité avec `schema.prisma`.

**Quiescence avant toute écriture autorisée :** l’exploitant doit annoncer la maintenance, empêcher les nouvelles écritures via le mécanisme de maintenance approuvé pour l’installation, drainer les requêtes et tâches en cours, puis confirmer auprès du responsable d’exploitation qu’aucun processus n’utilise le fichier SQLite. Ce dépôt n’implémente pas de mode maintenance ni de commande de quiescence et les scripts ne stoppent pas de serveur. Une restauration exige en plus un service effectivement arrêté par l’exploitant et l’absence de fichiers `-wal`, `-shm` et `-journal`; ne supprimez jamais ces fichiers manuellement.

**Go/no-go avant migration :** le propriétaire du système doit approuver les effets de données, la migration candidate, la cible, la sauvegarde vérifiée, la restauration répétée sur copie jetable, la fenêtre d’indisponibilité, les contrôles post-déploiement et le responsable du retour arrière. Une base préremplie sans historique Prisma exige en plus une procédure de baseline vérifiée. Le go/no-go ne peut pas être déduit du succès d’un test de chaîne neuve, d’un statut Prisma ou de `db:verify`.

**Décision pour l’état actuel : NO-GO.** La dérive destructive entre migrations et `schema.prisma` reste ouverte : `Currency`/`PayrollRule` et les reconstructions de tables/contraintes n’ont pas de décision de conservation approuvée. La base locale préremplie n’a pas d’historique `_prisma_migrations`. Ne lancez donc pas `npm run prisma:deploy`, l’adoption de baseline, `db push` ou une synchronisation de schéma sur une base métier. La reprise requiert une décision documentée du propriétaire sur les données et contraintes touchées, puis une migration non destructive revue, une baseline vérifiée si nécessaire et un nouveau go explicite.

Après un go futur seulement, l’opérateur autorisé pourra exécuter manuellement `npm run prisma:deploy` pendant la fenêtre. Contrôler ensuite `npm run prisma:status`, puis `npm run db:verify -- --expected-database-path 'C:\SAFE\data.db' --require-up-to-date`, les journaux applicatifs, `/api/health` et un parcours fonctionnel approuvé. `--require-up-to-date` atteste seulement que l’historique de migrations est à jour, pas la parité complète du schéma ni l’intégrité métier.

**Retour arrière sur copie jetable :** `npm run test:deployment-safety` crée une base SQLite temporaire, prend une sauvegarde vérifiée, simule une écriture postérieure au point de sauvegarde, restaure cette sauvegarde et vérifie que la base restaurée contient l’état antérieur tandis que la copie de rollback conserve l’état remplacé. La répétition ne cible aucune base métier. En exploitation réelle, si le propriétaire décide le rollback, rétablir d’abord la quiescence, vérifier le chemin et la sauvegarde, puis utiliser la commande `db:restore` uniquement sur la cible explicitement configurée et hors ligne. Conserver la copie pré-restauration ainsi que les journaux; ne pas relancer de migration avant diagnostic et nouvel accord.

Le parcours fresh confirme que les fichiers SQL s’appliquent, mais ce n’est pas encore une preuve de parité complète avec `schema.prisma`. Le diff Prisma propose notamment de supprimer `Currency` et `PayrollRule`, puis de reconstruire `ChartOfAccount`, `Employee`, `Entity`, `Invoice`, `Material`, `MaterialWarehouseStock`, `ProductionOrder`, `ProductionOrderMaterialLine`, `PurchaseInvoiceLine`, `PurchaseOrderLine`, `SalesOrder`, `SalesQuoteItem`, `StockMovement`, `StockReceipt`, `StockSupplierReturn`, `StockTransfer`, `TaxRate` et `User`. Il supprimerait aussi plusieurs index et en créerait de nouveaux aux portées différentes. Les copies générées ne reprennent que des colonnes communes : par exemple, la reconstruction proposée de `Entity` copie seulement `id` et `name` alors que le schéma cible exige aussi `countryId`; celle de `Invoice` omet des montants obligatoires. Sur des données existantes cela peut échouer ou perdre des champs/tables. Ces différences ne sont pas exécutées par `migrate deploy` tant qu’elles ne sont pas écrites dans des migrations versionnées, mais elles bloquent la parité déclarée.

### Répétition générale finale après les lots

À la fin de la période de travail de 72 h et après résolution des lacunes, la validation d’acceptation doit rester entièrement isolée des bases métier et utiliser des SQLite jetables. Elle comporte deux parcours séparés :

1. **Installation neuve** : déployer la chaîne candidate complète sur une SQLite neuve, vérifier `migrate status`, `PRAGMA integrity_check` et `PRAGMA foreign_key_check`, puis charger un jeu synthétique plus volumineux et cohérent (plusieurs sociétés/utilisateurs, référentiels, stocks, commandes, factures et écritures équilibrées) et exécuter des parcours fonctionnels de vente/commande-facture, réservation/déstockage, achats/avoirs et comptabilité.
2. **Mise à niveau** : préparer une autre SQLite synthétique avec le schéma antérieur aux migrations candidates, charger le même type de jeu fictif, capturer avant migration les nombres de lignes et invariants/agrégats sur les tables critiques (notamment `Currency`, `PayrollRule`, stocks, commandes, factures et journaux), prendre une copie jetable de référence, puis appliquer les migrations candidates uniquement à la copie. Comparer les comptages et agrégats après migration; vérifier les lignes et relations conservées, les transformations attendues séparément, l’intégrité/FK, puis rejouer les parcours fonctionnels sur les données mises à niveau.

Le test d’upgrade existant `npm run test:prisma-migrations` amorce ce harness : il part d’une chaîne pré-dernière cohorte, conserve des enregistrements synthétiques et compare désormais le nombre, le total des montants et les entités distinctes de 251 commandes avant/après les migrations ciblées. Il ne couvre pas encore le jeu multi-domaines complet décrit ci-dessus et n’autorise pas à conclure qu’aucune donnée ne pourrait être perdue dans toutes les installations. La répétition générale complète reste un critère d’acceptation à exécuter après les lots, et seulement une fois la dérive migrations/`schema.prisma` résolue de façon non destructive. Des données synthétiques, même volumineuses et traitées comme un scénario réaliste, ne sont pas des données de production et ne garantissent pas le comportement de la base métier réelle.

Ne pas fabriquer une migration de « synchronisation » à partir de ce diff sans décisions explicites sur le devenir des tables `Currency` et `PayrollRule`, les changements de contraintes/index globaux ou par société, et les valeurs de reprise des champs devenus obligatoires. La chaîne fresh corrigée et ses migrations suivantes restent distinctes de la base locale préremplie : cette dernière n’a pas `_prisma_migrations` et nécessite en plus une procédure de baseline qui compare son schéma réel et ses données à un historique approuvé. Le test d’upgrade synthétique vérifie uniquement les migrations incrémentales versionnées et la conservation des données synthétiques ciblées; il ne constitue pas cette baseline et ne justifie aucune application sur une vraie base.

### Précontrôle et baseline d'une base existante

`npm run db:baseline` exige une URL SQLite explicite et un chemin absolu attendu identique. Sans `--adopt`, l’outil est en précontrôle : il lit la cible en mode lecture seule, vérifie intégrité et clés étrangères, refuse les fichiers annexes SQLite ou un historique Prisma existant, rejoue l’historique complet sur une base temporaire, puis compare exactement les objets SQLite de la cible à cette sortie. Exemple PowerShell :

```powershell
$env:SAFE_ERP_DATABASE_URL = 'file:C:/SAFE/data.db'
npm run db:baseline -- --expected-database-path 'C:\SAFE\data.db'
```

Le précontrôle d’adoption vérifie également que le résultat des migrations correspond au `schema.prisma` courant. Cette vérification échoue actuellement à cause de la dérive destructive décrite ci-dessus; l’outil doit donc refuser l’adoption même si une cible correspond à la chaîne de migrations. Aucun historique ne peut être adopté tant que cette dérive n’a pas été résolue par une décision et une migration non destructives approuvées.

Après résolution et revue des effets de données/destructifs listés par l’outil, une adoption future devra se faire sur une cible hors ligne, avec une sauvegarde vérifiée vers un nouveau fichier distinct. Les confirmations requises sont explicites :

```powershell
npm run db:baseline -- --expected-database-path 'C:\SAFE\data.db' `
  --adopt --backup-path 'C:\SAFE\backups\data-before-baseline.sqlite' `
  --confirm-target-offline --confirm-data-effects-reviewed
```

L’adoption ne rejoue pas le SQL des migrations; elle demande à Prisma de résoudre leur statut comme déjà appliqué sur une copie de sauvegarde, puis copie l’historique vérifié vers la cible dans une transaction SQLite unique. Une erreur pendant cette écriture annule toute la transaction; si la validation Prisma échoue après le commit, n’exécutez pas `migrate deploy`, préservez les journaux et restaurez la sauvegarde vérifiée selon la procédure autorisée avant diagnostic. La sauvegarde vérifie l’intégrité SQLite, le schéma et les clés étrangères, pas la cohérence métier. Le précontrôle et les tests n’ont été exécutés que sur des fichiers temporaires; aucune migration ni baseline n’a été appliquée à la base métier.

## 9. Mises à jour

```bash
# Depuis votre PC
scp -r dist/* root@IP_DU_VPS:/opt/antigravity/dist/
ssh root@IP_DU_VPS "chown -R antigravity:antigravity /opt/antigravity/dist && systemctl restart antigravity"
```

Le service worker met le cache à jour à la prochaine visite ; un `Ctrl+F5` force le rechargement.

## 10. Supervision

```bash
# Santé applicative
curl -fsS https://finance.example.com/api/health

# Journaux
journalctl -u antigravity -f
```

Ajoutez une supervision externe (UptimeRobot, BetterStack) sur `/api/health` et une alerte disque.

## 10. Passer à PostgreSQL (recommandé pour la production)

Le fichier JSON convient à une PME et à un serveur unique, mais montre ses limites en charge et en concurrence.

Étapes :

1. Créer une base PostgreSQL et un utilisateur dédié.
2. Remplacer la lecture/écriture du fichier par une API REST :
   - `GET /api/db` → lecture ;
   - `PUT /api/db` → écriture transactionnelle avec numéro de version ;
   - `GET /api/events` → SSE.
3. Ajouter une authentification serveur (JWT/SSO) et des permissions par rôle.
4. Gérer les conflits par verrou optimiste (`version` en base) au lieu du « dernier écrivain gagne ».
5. Sauvegardes `pg_dump` quotidiennes + réplication.

Le front-end n'a pas à être réécrit : seule la couche `src/data/store.tsx` change.

## 11. Haute disponibilité (optionnel)

- Deux instances Node derrière Caddy, mais **une seule base primaire**.
- PostgreSQL avec réplique en lecture.
- Stockage des fichiers statiques sur CDN.
- Pour un groupe multi-sites, privilégier un hébergement central et des accès HTTPS plutôt que plusieurs serveurs indépendants.

## 12. Checklist avant mise en production

- [ ] Nom de domaine et HTTPS valides
- [ ] Port 5300 non exposé
- [ ] Authentification d'accès (Caddy ou SSO)
- [ ] Sauvegardes quotidiennes testées (restauration incluse)
- [ ] Supervision `/api/health` et alertes
- [ ] Journalisation et rotation des logs
- [ ] Procédure de mise à jour documentée
- [ ] Test de coupure et de reprise
