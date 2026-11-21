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

Le test crée une base SQLite et un schéma temporaires sous le répertoire temporaire du système; il n'utilise que des comptes et enregistrements synthétiques, monte une API locale sur une adresse de boucle locale et un port éphémère, puis supprime la base. Il ne lance aucune migration, ne contacte pas le serveur applicatif configuré et ne lit ni n'écrit la base métier. Les quatre parcours partagent la même base : budget (lecture et ligne brouillon), ventes (factures en lecture et création client), comptabilité (journal en lecture et écriture comptable à contrôler) et trésorerie (lecture et création de scénario). Les écritures ont des clés distinctes; les lignes comptables sont vérifiées comme équilibrées et les auteurs/périmètres des données sont contrôlés après chaque palier.

Les paliers de concurrence totale sont 1, 2, 4, 8, 12, 16, 20, 24, 28 et 32 utilisateurs virtuels, distribués à tour de rôle entre les quatre modules. Ainsi, le palier 20 représente cinq utilisateurs par module (20 au total), et le plafond 32 en représente huit par module. Les seuils de ce test sont : P95 de lecture ≤ 500 ms, P95 d'écriture ≤ 1 000 ms, aucune réponse HTTP en erreur ou en conflit, et intégrité exacte des enregistrements attendus. Le test s'arrête dès le premier seuil dépassé ou la première anomalie d'intégrité; son plafond est limité à 32 utilisateurs. Le maximum satisfaisant n'est valable que pour la configuration mesurée (machine, version de Node.js, routeur de test et SQLite temporaire) et ne définit ni une capacité universelle ni un SLA.
