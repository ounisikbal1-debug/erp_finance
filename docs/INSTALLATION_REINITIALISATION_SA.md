# RÃ©initialisation sÃ»re du mot de passe administrateur SAFE

## Contenu

Ce paquet contient uniquement lâ€™outil de rÃ©initialisation de mot de passe et ses Ã©lÃ©ments nÃ©cessaires :

- `src/scripts/reset-admin-password.ts` : commande, saisie masquÃ©e, validation, sauvegarde SQLite puis mise Ã  jour du seul `passwordHash` ciblÃ© ;
- `src/application/security/passwords.ts` : hachage scrypt compatible avec lâ€™authentification SAFE ;
- `src/scripts/reset-admin-password.test.ts` : test automatisÃ© sur une base SQLite temporaire synthÃ©tique.

Il ne contient ni base de donnÃ©es, ni compte, ni secret, ni dÃ©pendances prÃ©installÃ©es.

## Installation dans un checkout SAFE

1. DÃ©compresser le ZIP dans un emplacement temporaire et copier les trois fichiers en conservant exactement leurs chemins relatifs Ã  la racine du projet SAFE.
2. VÃ©rifier que le projet possÃ¨de les dÃ©pendances `@prisma/client`, `sqlite3` et `ts-node`, ainsi que le client Prisma gÃ©nÃ©rÃ© pour `src/data/prisma/schema.prisma`. Dans le checkout source complet, elles sont dÃ©clarÃ©es dans `package.json`.
3. VÃ©rifier que les scripts `reset-admin-password` et `test:password-reset` existent dans `package.json`. Dans le cas contraire, les ajouter sans remplacer les autres scripts :

   ```json
   {
     "reset-admin-password": "ts-node --transpile-only src/scripts/reset-admin-password.ts",
     "test:password-reset": "node --test --require ts-node/register src/scripts/reset-admin-password.test.ts"
   }
   ```

4. Depuis la racine du projet, lancer le test synthÃ©tique :

   ```powershell
   npm run test:password-reset
   ```

   Le test fabrique une base jetable sous le rÃ©pertoire temporaire Windows, vÃ©rifie lâ€™isolation du compte ciblÃ© et le contenu de la sauvegarde, puis supprime cette base.

## Utilisation opÃ©rationnelle

Cette opÃ©ration modifie le compte sÃ©lectionnÃ© dans la base SAFE configurÃ©e : ne lâ€™exÃ©cuter que pour une rÃ©initialisation autorisÃ©e. Ne fournir aucun mot de passe en argument ni dans une variable dâ€™environnement.

Depuis la racine du projet, ouvrir un terminal interactif :

```powershell
npm run reset-admin-password
```

Par dÃ©faut, le compte ciblÃ© est `admin`; le nouveau mot de passe et sa confirmation sont saisis sans affichage. Un mot de passe de 12 caractÃ¨res minimum est requis. Pour choisir un autre nom de compte :

```powershell
npm run reset-admin-password -- nom_utilisateur
```

La base SQLite par dÃ©faut du schÃ©ma SAFE est `src/data/data.db`. Avant de lancer lâ€™opÃ©ration, contrÃ´ler que le fichier ciblÃ© est bien celui de lâ€™installation prÃ©vue. Pour utiliser explicitement une autre base SQLite, dÃ©finir `SAFE_ERP_RESET_DATABASE_URL` au format Prisma `file:...` dans le terminal courant. Lâ€™outil refuse les bases non-SQLite, absentes ou en mÃ©moire.

Une sauvegarde SQLite cohÃ©rente au nom unique est crÃ©Ã©e Ã  cÃ´tÃ© de la base avant toute mise Ã  jour. Conserver cette sauvegarde en lieu sÃ»r. En cas dâ€™Ã©chec de la mise Ã  jour, la sauvegarde reste disponible; ne pas relancer Ã  lâ€™aveugle et vÃ©rifier dâ€™abord lâ€™Ã©tat de la base. La commande affiche le chemin de sauvegarde aprÃ¨s succÃ¨s.

## Limites

Lâ€™outil ne rÃ©initialise que le mot de passe dâ€™un utilisateur existant; il ne crÃ©e ni compte ni rÃ´le et ne change aucun paramÃ¨tre mÃ©tier. Il requiert une console interactive pour saisir les mots de passe et une base SQLite accessible en Ã©criture pour la mise Ã  jour. Ne jamais valider son fonctionnement sur une vraie base ou un vrai compte : utiliser `npm run test:password-reset`.
