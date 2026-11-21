# Déployer SAFE ERP derrière HTTPS

Ce guide décrit le démarrage de l’application actuelle (API Express, interface Vite compilée et Prisma). Il remplace les anciennes procédures fondées sur `share-server.mjs` et `shared-db.json`, qui ne doivent pas être utilisées.

## État et limites de sécurité

- `npm start` et `run-safe.ps1` sont réservés au développement local : ils démarrent Vite.
- Pour la production, générez le client Prisma PostgreSQL, compilez le serveur et l’interface, puis utilisez `npm run start:production`.
- Le démarrage de production refuse SQLite, une clé d’authentification absente/courte, une interface non compilée et une adresse d’écoute non locale. Le serveur doit rester lié à `127.0.0.1` derrière un reverse proxy HTTPS.
- En production, les sessions sont persistées dans PostgreSQL et partagées entre processus. Les tâches planifiées restent locales au processus; utilisez **une seule instance applicative** tant qu’elles ne sont pas coordonnées.
- Le démarrage n’applique aucune migration et n’exécute aucun seed. Les migrations, les répétitions de restauration et les validations métier restent des opérations séparées.
- Ce guide ne constitue pas un feu vert de production. La chaîne de migrations et sa compatibilité avec une base existante doivent être validées avant tout déploiement réel.

## 1. Construire l’application de production

Construisez dans un environnement de livraison isolé, avec les dépendances du projet installées et une URL PostgreSQL de construction (la génération du client ne se connecte pas à la base) :

```powershell
$env:SAFE_ERP_DATABASE_PROVIDER = 'postgresql'
$env:SAFE_ERP_DATABASE_URL = 'postgresql://build:build@127.0.0.1:5432/safe_build'
npm run build:production
```

Le résultat contient `dist/` (interface) et `server-dist/` (serveur compilé), et le client Prisma PostgreSQL généré dans `node_modules/`. Copiez ces artefacts avec `scripts/start-production.cjs`, `package.json` et les dépendances runtime vers l’hôte. Ne copiez pas de fichier `.env`, de base de développement ni de secret. Le paquet de dépendances runtime doit conserver le client Prisma généré; sa procédure de réduction/assemblage doit être validée avant d’être automatisée.

Le script de construction n’applique pas de migration. La commande de démarrage ne doit pas servir à générer ou modifier le schéma.

## 2. Base et configuration des secrets

Utilisez un PostgreSQL dédié, un rôle d’application avec privilèges minimaux et une URL contenant `sslmode=require` lorsque la base est distante. Avant le premier démarrage, les migrations et la restauration doivent avoir été répétées sur une base jetable, conformément à [PostgreSQL multi-utilisateur](POSTGRESQL_MULTIUSER.md) et au go/no-go ci-dessous.

Fournissez au service, via un gestionnaire de secrets ou un fichier de configuration lisible uniquement par l’administrateur système :

```text
SAFE_ERP_DATABASE_PROVIDER=postgresql
SAFE_ERP_DATABASE_URL=postgresql://...
SAFE_ERP_AUTH_SECRET=<valeur aléatoire unique d’au moins 32 octets>
```

Ne placez pas ces valeurs dans le dépôt, une image publique, une commande copiée dans un ticket ou les journaux. N’utilisez aucun seed de démonstration en production.

## 3. Service applicatif

Exécutez un seul processus sous un compte système sans privilège, avec `NODE_ENV=production`, `API_HOST=127.0.0.1` et un port local (par exemple `3000`). Exemple systemd :

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

Protégez `/etc/safe-erp/runtime.env` contre la lecture par les autres utilisateurs (propriétaire root, permissions `0600`). Vérifiez que le compte de service peut lire l’application et ses dépendances, mais pas les secrets d’autres services. Activez le service seulement après les contrôles de migration et de restauration; le processus de démarrage ne les remplace pas.

## 4. HTTPS avec Caddy

Faites terminer TLS sur le même hôte par Caddy, et ne publiez pas directement le port Node :

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

Caddy gère le certificat et la redirection HTTP vers HTTPS. Ouvrez uniquement SSH, 80 et 443 dans le pare-feu; le port applicatif 3000 et le port PostgreSQL ne doivent pas être exposés à Internet. Testez le renouvellement du certificat, l’accès depuis un réseau externe et l’absence d’accès HTTP non chiffré avant l’ouverture aux utilisateurs.

## 5. Sauvegarde, restauration et migrations

Définissez une politique de sauvegarde PostgreSQL chiffrée, hors hôte et à rétention documentée. Répétez une restauration dans une base isolée et vérifiez les données, les relations et les parcours métier avant tout feu vert. Ne restaurez jamais sur la base de production comme test.

Les migrations doivent être répétées sur une copie de la version cible, avec comparaison des schémas et conservation des données synthétiques. N’exécutez pas `prisma migrate deploy` sur une base métier tant que les écarts de schéma, la baseline, la stratégie de rollback, la sauvegarde et la fenêtre d’indisponibilité n’ont pas été revus. Le démarrage applicatif n’exécute aucune migration.

La documentation existante sur la chaîne PostgreSQL détaille le précontrôle et les limites de l’import; le guide historique [DEPLOIEMENT_WEB_LEGACY.md](DEPLOIEMENT_WEB_LEGACY.md) ne décrit que des procédures SQLite et n’est pas une procédure PostgreSQL.

## 6. Exploitation et feu vert

Avant le premier usage réel, vérifier au minimum :

- certificat HTTPS valide, renouvellement automatique et ports internes non publiés;
- démarrage `start:production` avec une clé unique, PostgreSQL, et un seul processus;
- sauvegarde chiffrée puis restauration réellement répétée sur une base isolée;
- tests de migration avant/après sur des données synthétiques représentatives;
- alertes de disponibilité, journaux sans secrets, rotation et accès opérateur restreint;
- procédure de mise à jour, retour arrière, incident et restauration;
- validation fonctionnelle des calculs et déclarations par le responsable métier compétent.

Les déclarations fiscales actuelles ne sont pas toutes des parcours officiels complets; les sorties consultatives ne doivent pas être déposées comme déclarations réglementaires. La conformité des règles tunisiennes validées ne certifie pas à elle seule l’implémentation de chaque calcul ou formulaire.
