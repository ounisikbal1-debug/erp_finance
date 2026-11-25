# Mode base partagÃ©e â€” plusieurs utilisateurs, plusieurs PC

## Principe

Une base partagÃ©e = **un seul serveur actif** + **un seul fichier de donnÃ©es** accessible par le serveur.

- Les navigateurs des utilisateurs ne se parlent pas directement : ils passent par le serveur (HTTP + SSE).
- N'importe quel PC peut tenir le rÃ´le de serveur : il suffit qu'il lance le serveur avec **le mÃªme fichier de donnÃ©es**.
- Il ne doit jamais y avoir **deux serveurs actifs en mÃªme temps** sur le mÃªme fichier (risque d'Ã©crasement).

## DÃ©couverte automatique : le premier hÃ©berge, les autres rejoignent

Chaque poste possÃ¨de le mÃªme lanceur. Au double-clic :

1. il cherche un serveur dÃ©jÃ  actif sur le PC (port 5300) ;
2. sinon, il envoie une requÃªte de dÃ©couverte sur le rÃ©seau local (UDP 5301) ;
3. si un serveur rÃ©pond, il ouvre directement l'application sur ce serveur â€” **aucun serveur Ã  lancer** ;
4. si personne ne rÃ©pond, ce PC devient le serveur et ouvre l'application.

Ainsi, le premier utilisateur qui lance l'application hÃ©berge la base ; les suivants sont dÃ©tectÃ©s automatiquement et n'ont ni adresse IP Ã  saisir ni serveur Ã  dÃ©marrer.

**Pare-feu :** au premier lancement, Windows peut demander l'autorisation pour Node.js. Autorisez les rÃ©seaux privÃ©s (ports 5300 et 5301) pour que la dÃ©couverte fonctionne.

**Un seul serveur Ã  la fois.** Si deux personnes lancent le lanceur exactement en mÃªme temps avant que la dÃ©couverte n'aboutisse, fermez l'un des deux serveurs et relancez : le second rejoindra le premier.
## ScÃ©nario A â€” un PC fixe sert les autres (le plus simple)

1. Sur le PC serveur : double-clic sur `Lancer SAFE Partage.cmd`.
2. Noter l'adresse **RÃ©seau** affichÃ©e, par exemple `http://192.168.1.20:5300`.
3. Les autres PC ouvrent cette adresse.

Le PC serveur doit rester allumÃ© pendant l'utilisation.

## ScÃ©nario B â€” aucun PC principal : le serveur suit la clÃ© USB

Placez le fichier de donnÃ©es sur une clÃ© USB ou un dossier rÃ©seau partagÃ© :

```
E:\SAFE\shared-db.json
```

Sur **n'importe quel PC**, lancez :

```powershell
cd "C:\...\antigravity-finance"
Lancer SAFE Partage.cmd "E:\SAFE\shared-db.json"
```

ou, en ligne de commande :

```powershell
node scripts/share-server.mjs 5300 "E:\SAFE\shared-db.json"
```

Le PC qui lance le serveur devient le serveur du moment. Pour changer de PC :

1. Fermer le serveur sur l'ancien PC (fenÃªtre du lanceur).
2. Brancher la clÃ© USB sur le nouveau PC.
3. Relancer le lanceur avec le mÃªme fichier.

Les autres utilisateurs continuent d'ouvrir l'adresse rÃ©seau du PC actif. Si l'adresse IP change, ils utilisent la nouvelle adresse affichÃ©e.

> Le fichier `shared-db.json` contient **toutes** les donnÃ©es (Ã©critures, utilisateurs, budgets, clÃ´ture). Sauvegardez-le rÃ©guliÃ¨rement.

## ScÃ©nario C â€” serveur toujours disponible (recommandÃ© en production)

Installez le serveur sur un petit PC allumÃ© en permanence, un NAS, un Raspberry Pi ou un VPS :

```bash
node scripts/share-server.mjs 5300 /chemin/partage/shared-db.json
```

Pour un accÃ¨s Internet, placez-le derriÃ¨re HTTPS (reverse proxy Caddy/Nginx) et ajoutez une authentification.

## Limites actuelles

- RÃ©seau local recommandÃ© ; pas d'authentification sur l'API (rÃ©seau de confiance).
- RÃ©solution des conflits : dernier Ã©crivain gagne.
- Un seul serveur Ã  la fois sur un fichier donnÃ©.
- Les prÃ©fÃ©rences d'affichage (langue, thÃ¨me, devise) restent propres Ã  chaque navigateur ; elles ne sont pas synchronisÃ©es.

## DÃ©pannage

| SymptÃ´me | Cause | Solution |
|---|---|---|
| Badge Â« Base partagÃ©e Â» absent | Serveur non lancÃ© ou port bloquÃ© | Lancer le serveur, vÃ©rifier `http://IP:5300/api/health` |
| Les autres PC ne voient pas les modifications | Ils sont sur le serveur local (5200) au lieu du serveur partagÃ© (5300) | Ouvrir l'adresse rÃ©seau du PC serveur |
| Deux bases diffÃ©rentes | Chaque PC a lancÃ© son serveur avec un fichier local diffÃ©rent | Utiliser le mÃªme fichier de donnÃ©es |
| Ã‰cran blanc sur un autre PC | Ancienne version en cache | Recharger (Ctrl+F5) |

## SÃ©curitÃ© du mode Ã©quipe (serveur de partage)
- Connexion vÃ©rifiÃ©e **par le serveur** (`/api/login`) ; mots de passe stockÃ©s en PBKDF2-SHA256 (100 000 itÃ©rations, sel alÃ©atoire).
- Toute donnÃ©e (`/api/db`, Ã©vÃ©nements, sauvegardes, flux BI) exige une session ; l'auditeur est en lecture seule ; seul l'administrateur voit les comptes, restaure une sauvegarde ou modifie les utilisateurs.
- 5 Ã©checs de connexion verrouillent le compte 5 minutes (tracÃ© dans le journal d'audit).
- Flux BI : session ou authentification HTTP Â« Basic Â» (identifiant:mot de passe) â€” utilisable dans Power BI.
- Limites : la connexion circule en clair sur un rÃ©seau en http (placez le serveur derriÃ¨re HTTPS ou un VPN pour un usage hors rÃ©seau local) ; les donnÃ©es synchronisÃ©es restent copiÃ©es dans le navigateur de chaque poste connectÃ©.

## Rapports automatiques par e-mail (serveur partagÃ©)

RÃ©glages â†’ Â« Rapports automatiques Â» (administrateur, mode Ã©quipe). Renseignez le serveur SMTP (port 587 STARTTLS, ou 465 avec Â« SSL direct Â»), puis crÃ©ez un ou plusieurs plannings : nom, heure, jours, destinataires. Chaque jour Ã  l'heure prÃ©vue, le serveur gÃ©nÃ¨re un classeur Excel (synthÃ¨se par entitÃ© + tables de rÃ©fÃ©rence) et l'envoie en piÃ¨ce jointe. Une copie est toujours enregistrÃ©e dans `rapports-auto/`. Le serveur doit Ãªtre allumÃ© Ã  l'heure prÃ©vue ; le mot de passe SMTP reste sur le serveur (fichier `reports-config.json`). Le bouton Â« Envoyer maintenant Â» permet de tester.

## Application Windows (installateur)

Sur un poste Windows avec Node.js : double-clic sur `Construire l'installateur Windows.cmd`. Il produit `release/SAFE-Setup-x.y.z.exe` (Electron + NSIS) : l'application embarque le serveur partagÃ©, stocke ses donnÃ©es dans le profil de l'utilisateur et s'ouvre dans sa propre fenÃªtre. Cette Ã©tape n'a pas pu Ãªtre testÃ©e sur Linux.
