# Réinitialisation sûre du mot de passe administrateur SAFE

## Contenu

Ce paquet contient uniquement l’outil de réinitialisation de mot de passe et ses éléments nécessaires :

- `src/scripts/reset-admin-password.ts` : commande, saisie masquée, validation, sauvegarde SQLite puis mise à jour du seul `passwordHash` ciblé ;
- `src/application/security/passwords.ts` : hachage scrypt compatible avec l’authentification SAFE ;
- `src/scripts/reset-admin-password.test.ts` : test automatisé sur une base SQLite temporaire synthétique.

Il ne contient ni base de données, ni compte, ni secret, ni dépendances préinstallées.

## Installation dans un checkout SAFE

1. Décompresser le ZIP dans un emplacement temporaire et copier les trois fichiers en conservant exactement leurs chemins relatifs à la racine du projet SAFE.
2. Vérifier que le projet possède les dépendances `@prisma/client`, `sqlite3` et `ts-node`, ainsi que le client Prisma généré pour `src/data/prisma/schema.prisma`. Dans le checkout source complet, elles sont déclarées dans `package.json`.
3. Vérifier que les scripts `reset-admin-password` et `test:password-reset` existent dans `package.json`. Dans le cas contraire, les ajouter sans remplacer les autres scripts :

   ```json
   {
     "reset-admin-password": "ts-node --transpile-only src/scripts/reset-admin-password.ts",
     "test:password-reset": "node --test --require ts-node/register src/scripts/reset-admin-password.test.ts"
   }
   ```

4. Depuis la racine du projet, lancer le test synthétique :

   ```powershell
   npm run test:password-reset
   ```

   Le test fabrique une base jetable sous le répertoire temporaire Windows, vérifie l’isolation du compte ciblé et le contenu de la sauvegarde, puis supprime cette base.

## Utilisation opérationnelle

Cette opération modifie le compte sélectionné dans la base SAFE configurée : ne l’exécuter que pour une réinitialisation autorisée. Ne fournir aucun mot de passe en argument ni dans une variable d’environnement.

Depuis la racine du projet, ouvrir un terminal interactif :

```powershell
npm run reset-admin-password
```

Par défaut, le compte ciblé est `admin`; le nouveau mot de passe et sa confirmation sont saisis sans affichage. Un mot de passe de 12 caractères minimum est requis. Pour choisir un autre nom de compte :

```powershell
npm run reset-admin-password -- nom_utilisateur
```

La base SQLite par défaut du schéma SAFE est `src/data/data.db`. Avant de lancer l’opération, contrôler que le fichier ciblé est bien celui de l’installation prévue. Pour utiliser explicitement une autre base SQLite, définir `SAFE_ERP_RESET_DATABASE_URL` au format Prisma `file:...` dans le terminal courant. L’outil refuse les bases non-SQLite, absentes ou en mémoire.

Une sauvegarde SQLite cohérente au nom unique est créée à côté de la base avant toute mise à jour. Conserver cette sauvegarde en lieu sûr. En cas d’échec de la mise à jour, la sauvegarde reste disponible; ne pas relancer à l’aveugle et vérifier d’abord l’état de la base. La commande affiche le chemin de sauvegarde après succès.

## Limites

L’outil ne réinitialise que le mot de passe d’un utilisateur existant; il ne crée ni compte ni rôle et ne change aucun paramètre métier. Il requiert une console interactive pour saisir les mots de passe et une base SQLite accessible en écriture pour la mise à jour. Ne jamais valider son fonctionnement sur une vraie base ou un vrai compte : utiliser `npm run test:password-reset`.
