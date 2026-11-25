# Benchmarks de performance

## Liste des factures de vente

Lancer depuis la racine du projet :

```powershell
npm run benchmark:sales-invoice-list
```

Le benchmark cree une base SQLite temporaire sous le repertoire temporaire du systeme, y pousse le schema Prisma actuel, puis y insere uniquement des donnees synthetiques. Il mesure la premiere page de 50 lignes de `SalesService.listInvoices` pour des ensembles de 100, 1 000 et 5 000 factures, chacune associee a deux evenements de workflow, et verifie que le total restitue correspond au volume insere. Le temps rapporte inclut la requete du service et la serialisation JSON; la creation du schema et les insertions sont exclues. Une execution de chauffe est faite avant sept mesures par volume; la sortie donne la mediane, le maximum observe et la taille JSON de la page. La base temporaire est supprimee a la fin.

Les valeurs sont indicatives et dependent de la machine, de la version de Node.js et du moteur Prisma. Le projet ne definit pas de SLA ni de volume cible; les mesures ne constituent donc pas un seuil de conformite. Ce benchmark n'appelle aucun serveur applicatif, n'utilise pas la base metier et ne deploie aucune migration. `prisma db push` est limite au fichier de schema temporaire et a la base temporaire du benchmark.

### Mesure initiale avant pagination

Execution du 9 novembre 2026, Windows 10.0.26200, Node.js v24.21.0, AMD Ryzen 5 7520U. Cette mesure de la liste non paginee est conservee comme baseline historique; une execution de chauffe puis sept mesures par volume :

| Factures | Mediane service + JSON | Maximum observe | JSON |
|---:|---:|---:|---:|
| 100 | 17.28 ms | 18.24 ms | 95 801 octets |
| 1 000 | 139.04 ms | 141.91 ms | 958 001 octets |
| 5 000 | 674.35 ms | 732.10 ms | 4 790 001 octets |

Le parcours historique renvoyait tous les enregistrements et evenements associes; la reponse de 5 000 factures atteignait 4 790 001 octets. Ces chiffres ne definissent pas un seuil de performance ni un SLA.

### Mesure de la premiere page

Execution apres l'ajout de la pagination, avec les memes donnees synthetiques et la meme machine :

| Factures au total | Lignes de la page | Mediane service + JSON | Maximum observe | JSON de la page |
|---:|---:|---:|---:|---:|
| 100 | 50 | 18.46 ms | 25.45 ms | 47 976 octets |
| 1 000 | 50 | 28.37 ms | 44.29 ms | 47 978 octets |
| 5 000 | 50 | 33.13 ms | 51.51 ms | 47 979 octets |

La page ne grossit pas avec le nombre total de factures dans ces jeux de donnees; le comptage total est renvoye dans les metadonnees. Les temps restent indicatifs et dependent de la machine, de la version de Node.js et du moteur Prisma.

## Utilisateurs concurrents sur l'API

Lancer depuis la racine du projet :

```powershell
npm run benchmark:concurrent-capacity
```

Le test crÃ©e une base SQLite et un schÃ©ma temporaires sous le rÃ©pertoire temporaire du systÃ¨me; il n'utilise que des comptes et enregistrements synthÃ©tiques, monte une API locale sur une adresse de boucle locale et un port Ã©phÃ©mÃ¨re, puis supprime la base. Il ne lance aucune migration, ne contacte pas le serveur applicatif configurÃ© et ne lit ni n'Ã©crit la base mÃ©tier. Les quatre parcours partagent la mÃªme base : budget (lecture et ligne brouillon), ventes (factures en lecture et crÃ©ation client), comptabilitÃ© (journal en lecture et Ã©criture comptable Ã  contrÃ´ler) et trÃ©sorerie (lecture et crÃ©ation de scÃ©nario). Les Ã©critures ont des clÃ©s distinctes; les lignes comptables sont vÃ©rifiÃ©es comme Ã©quilibrÃ©es et les auteurs/pÃ©rimÃ¨tres des donnÃ©es sont contrÃ´lÃ©s aprÃ¨s chaque palier.

Les paliers de concurrence totale sont 1, 2, 4, 8, 12, 16, 20, 24, 28 et 32 utilisateurs virtuels, distribuÃ©s Ã  tour de rÃ´le entre les quatre modules. Ainsi, le palier 20 reprÃ©sente cinq utilisateurs par module (20 au total), et le plafond 32 en reprÃ©sente huit par module. Les seuils de ce test sont : P95 de lecture â‰¤ 500 ms, P95 d'Ã©criture â‰¤ 1 000 ms, aucune rÃ©ponse HTTP en erreur ou en conflit, et intÃ©gritÃ© exacte des enregistrements attendus. Le test s'arrÃªte dÃ¨s le premier seuil dÃ©passÃ© ou la premiÃ¨re anomalie d'intÃ©gritÃ©; son plafond est limitÃ© Ã  32 utilisateurs. Le maximum satisfaisant n'est valable que pour la configuration mesurÃ©e (machine, version de Node.js, routeur de test et SQLite temporaire) et ne dÃ©finit ni une capacitÃ© universelle ni un SLA.
