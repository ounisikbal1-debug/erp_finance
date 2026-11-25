# DÃ©ployer SAFE ERP derriÃ¨re HTTPS

Ce guide dÃ©crit le dÃ©marrage de lâ€™application actuelle (API Express, interface Vite compilÃ©e et Prisma). Il remplace les anciennes procÃ©dures fondÃ©es sur `share-server.mjs` et `shared-db.json`, qui ne doivent pas Ãªtre utilisÃ©es.

## Ã‰tat et limites de sÃ©curitÃ©

- `npm start` et `run-safe.ps1` sont rÃ©servÃ©s au dÃ©veloppement local : ils dÃ©marrent Vite.
- Pour la production, gÃ©nÃ©rez le client Prisma PostgreSQL, compilez le serveur et lâ€™interface, puis utilisez `npm run start:production`.
- Le dÃ©marrage de production refuse SQLite, une clÃ© dâ€™authentification absente/courte, une interface non compilÃ©e et une adresse dâ€™Ã©coute non locale. Le serveur doit rester liÃ© Ã  `127.0.0.1` derriÃ¨re un reverse proxy HTTPS.
- En production, les sessions sont persistÃ©es dans PostgreSQL et partagÃ©es entre processus. Les tÃ¢ches planifiÃ©es restent locales au processus; utilisez **une seule instance applicative** tant quâ€™elles ne sont pas coordonnÃ©es.
- Le dÃ©marrage nâ€™applique aucune migration et nâ€™exÃ©cute aucun seed. Les migrations, les rÃ©pÃ©titions de restauration et les validations mÃ©tier restent des opÃ©rations sÃ©parÃ©es.
- Ce guide ne constitue pas un feu vert de production. La chaÃ®ne de migrations et sa compatibilitÃ© avec une base existante doivent Ãªtre validÃ©es avant tout dÃ©ploiement rÃ©el.

## 1. Construire lâ€™application de production

Construisez dans un environnement de livraison isolÃ©, avec les dÃ©pendances du projet installÃ©es et une URL PostgreSQL de construction (la gÃ©nÃ©ration du client ne se connecte pas Ã  la base) :

```powershell
$env:SAFE_ERP_DATABASE_PROVIDER = 'postgresql'
$env:SAFE_ERP_DATABASE_URL = 'postgresql://build:build@127.0.0.1:5432/safe_build'
npm run build:production
```

Le rÃ©sultat contient `dist/` (interface) et `server-dist/` (serveur compilÃ©), et le client Prisma PostgreSQL gÃ©nÃ©rÃ© dans `node_modules/`. Copiez ces artefacts avec `scripts/start-production.cjs`, `package.json` et les dÃ©pendances runtime vers lâ€™hÃ´te. Ne copiez pas de fichier `.env`, de base de dÃ©veloppement ni de secret. Le paquet de dÃ©pendances runtime doit conserver le client Prisma gÃ©nÃ©rÃ©; sa procÃ©dure de rÃ©duction/assemblage doit Ãªtre validÃ©e avant dâ€™Ãªtre automatisÃ©e.

Le script de construction nâ€™applique pas de migration. La commande de dÃ©marrage ne doit pas servir Ã  gÃ©nÃ©rer ou modifier le schÃ©ma.

## 2. Base et configuration des secrets

Utilisez un PostgreSQL dÃ©diÃ©, un rÃ´le dâ€™application avec privilÃ¨ges minimaux et une URL contenant `sslmode=require` lorsque la base est distante. Avant le premier dÃ©marrage, les migrations et la restauration doivent avoir Ã©tÃ© rÃ©pÃ©tÃ©es sur une base jetable, conformÃ©ment Ã  [PostgreSQL multi-utilisateur](POSTGRESQL_MULTIUSER.md) et au go/no-go ci-dessous.

Fournissez au service, via un gestionnaire de secrets ou un fichier de configuration lisible uniquement par lâ€™administrateur systÃ¨me :

```text
SAFE_ERP_DATABASE_PROVIDER=postgresql
SAFE_ERP_DATABASE_URL=postgresql://...
SAFE_ERP_AUTH_SECRET=<valeur alÃ©atoire unique dâ€™au moins 32 octets>
```

Ne placez pas ces valeurs dans le dÃ©pÃ´t, une image publique, une commande copiÃ©e dans un ticket ou les journaux. Nâ€™utilisez aucun seed de dÃ©monstration en production.

## 3. Service applicatif

ExÃ©cutez un seul processus sous un compte systÃ¨me sans privilÃ¨ge, avec `NODE_ENV=production`, `API_HOST=127.0.0.1` et un port local (par exemple `3000`). Exemple systemd :

```ini
[Unit]
Description=SAFE ERP
After=network.target

[Service]
Type=simple
User=safe-erp
Group=safe-erp
WorkingDirectory=/opt/safe-erp
Environment=NODE_ENV=production
Environment=API_HOST=127.0.0.1
Environment=PORT=3000
EnvironmentFile=/etc/safe-erp/runtime.env
ExecStart=/usr/bin/node scripts/start-production.cjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

ProtÃ©gez `/etc/safe-erp/runtime.env` contre la lecture par les autres utilisateurs (propriÃ©taire root, permissions `0600`). VÃ©rifiez que le compte de service peut lire lâ€™application et ses dÃ©pendances, mais pas les secrets dâ€™autres services. Activez le service seulement aprÃ¨s les contrÃ´les de migration et de restauration; le processus de dÃ©marrage ne les remplace pas.

## 4. HTTPS avec Caddy

Faites terminer TLS sur le mÃªme hÃ´te par Caddy, et ne publiez pas directement le port Node :

```caddy
erp.example.com {
    encode zstd gzip
    header {
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        Strict-Transport-Security "max-age=31536000"
    }
    reverse_proxy 127.0.0.1:3000
}
```

Caddy gÃ¨re le certificat et la redirection HTTP vers HTTPS. Ouvrez uniquement SSH, 80 et 443 dans le pare-feu; le port applicatif 3000 et le port PostgreSQL ne doivent pas Ãªtre exposÃ©s Ã  Internet. Testez le renouvellement du certificat, lâ€™accÃ¨s depuis un rÃ©seau externe et lâ€™absence dâ€™accÃ¨s HTTP non chiffrÃ© avant lâ€™ouverture aux utilisateurs.

## 5. Sauvegarde, restauration et migrations

DÃ©finissez une politique de sauvegarde PostgreSQL chiffrÃ©e, hors hÃ´te et Ã  rÃ©tention documentÃ©e. RÃ©pÃ©tez une restauration dans une base isolÃ©e et vÃ©rifiez les donnÃ©es, les relations et les parcours mÃ©tier avant tout feu vert. Ne restaurez jamais sur la base de production comme test.

Les migrations doivent Ãªtre rÃ©pÃ©tÃ©es sur une copie de la version cible, avec comparaison des schÃ©mas et conservation des donnÃ©es synthÃ©tiques. Nâ€™exÃ©cutez pas `prisma migrate deploy` sur une base mÃ©tier tant que les Ã©carts de schÃ©ma, la baseline, la stratÃ©gie de rollback, la sauvegarde et la fenÃªtre dâ€™indisponibilitÃ© nâ€™ont pas Ã©tÃ© revus. Le dÃ©marrage applicatif nâ€™exÃ©cute aucune migration.

La documentation existante sur la chaÃ®ne PostgreSQL dÃ©taille le prÃ©contrÃ´le et les limites de lâ€™import; le guide historique [DEPLOIEMENT_WEB_LEGACY.md](DEPLOIEMENT_WEB_LEGACY.md) ne dÃ©crit que des procÃ©dures SQLite et nâ€™est pas une procÃ©dure PostgreSQL.

## 6. Exploitation et feu vert

Avant le premier usage rÃ©el, vÃ©rifier au minimum :

- certificat HTTPS valide, renouvellement automatique et ports internes non publiÃ©s;
- dÃ©marrage `start:production` avec une clÃ© unique, PostgreSQL, et un seul processus;
- sauvegarde chiffrÃ©e puis restauration rÃ©ellement rÃ©pÃ©tÃ©e sur une base isolÃ©e;
- tests de migration avant/aprÃ¨s sur des donnÃ©es synthÃ©tiques reprÃ©sentatives;
- alertes de disponibilitÃ©, journaux sans secrets, rotation et accÃ¨s opÃ©rateur restreint;
- procÃ©dure de mise Ã  jour, retour arriÃ¨re, incident et restauration;
- validation fonctionnelle des calculs et dÃ©clarations par le responsable mÃ©tier compÃ©tent.

Les dÃ©clarations fiscales actuelles ne sont pas toutes des parcours officiels complets; les sorties consultatives ne doivent pas Ãªtre dÃ©posÃ©es comme dÃ©clarations rÃ©glementaires. La conformitÃ© des rÃ¨gles tunisiennes validÃ©es ne certifie pas Ã  elle seule lâ€™implÃ©mentation de chaque calcul ou formulaire.
