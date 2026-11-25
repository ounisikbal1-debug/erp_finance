# Regenerer le client Prisma

Le dossier de reference du projet est `SAFE_ERP-DRAFT 1`. Depuis ce projet, utilisez toujours la commande npm fournie:

```powershell
npm run prisma:generate
```

Le script du `package.json` utilise `src/data/prisma/schema.prisma`. Avec le provider `prisma-client-js`, le client importe par `@prisma/client` est genere dans `node_modules/.prisma/client` du projet. N'utilisez pas un autre dossier de travail, une autre copie de SAFE ou une option `--output` differente: cela risque de generer un client qui ne correspond pas a celui charge par l'application.

## Erreur Windows `EPERM` lors du remplacement du moteur

Le serveur Node peut garder `query_engine-windows.dll.node` ouvert pendant toute son execution. Prisma prepare alors le nouveau moteur dans un fichier temporaire, mais Windows refuse son renommage vers le DLL utilise. Ce n'est pas une erreur de schema et il ne faut ni supprimer le DLL ni forcer son remplacement.

1. Identifiez d'abord le processus qui reference `node_modules\.prisma\client\query_engine-windows.dll.node` dans Resource Monitor (`resmon.exe`, onglet CPU, section *Associated Handles*) ou avec Process Explorer (*Find Handle or DLL*). Verifiez son proprietaire, sa ligne de commande et son origine; un processus `node.exe` ne prouve pas a lui seul qui l'a demarre.
2. S'il s'agit d'une instance que vous avez demarree et dont vous connaissez le terminal, arretez-la normalement (par exemple avec `Ctrl+C`). Si son proprietaire ou son origine n'est pas etabli, ne l'arretez pas et ne forcez pas la fermeture: obtenez l'accord du responsable du processus avant toute action qui l'interrompt.
3. Apres liberation confirmee du verrou, depuis la racine `SAFE_ERP-DRAFT 1`, executez:

   ```powershell
   $env:SAFE_ERP_DATABASE_URL = 'file:../prisma-validation-only.db'
   npx prisma validate --schema src/data/prisma/schema.prisma
   Remove-Item Env:\SAFE_ERP_DATABASE_URL
   npm run prisma:generate
   ```

4. Verifiez que Prisma indique la generation du client dans `node_modules/.prisma/client`, puis redemarrez SAFE.

La generation et la validation ne deployent aucune migration et ne modifient pas les donnees de la base. Le schema exige une URL explicite pour les commandes Prisma CLI; l'URL ci-dessus est un chemin de validation et ne doit pas servir a deployer. `npm run prisma:deploy` execute `prisma migrate deploy`, mais ne l'utilisez pas sur la base locale pre-remplie sans historique `_prisma_migrations` et baseline verifiee. N'utilisez pas `prisma db push` pour contourner cette exigence.
