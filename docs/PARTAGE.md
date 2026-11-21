# Mode base partagée — plusieurs utilisateurs, plusieurs PC

## Principe

Une base partagée = **un seul serveur actif** + **un seul fichier de données** accessible par le serveur.

- Les navigateurs des utilisateurs ne se parlent pas directement : ils passent par le serveur (HTTP + SSE).
- N'importe quel PC peut tenir le rôle de serveur : il suffit qu'il lance le serveur avec **le même fichier de données**.
- Il ne doit jamais y avoir **deux serveurs actifs en même temps** sur le même fichier (risque d'écrasement).

## Découverte automatique : le premier héberge, les autres rejoignent

Chaque poste possède le même lanceur. Au double-clic :

1. il cherche un serveur déjà actif sur le PC (port 5300) ;
2. sinon, il envoie une requête de découverte sur le réseau local (UDP 5301) ;
3. si un serveur répond, il ouvre directement l'application sur ce serveur — **aucun serveur à lancer** ;
4. si personne ne répond, ce PC devient le serveur et ouvre l'application.

Ainsi, le premier utilisateur qui lance l'application héberge la base ; les suivants sont détectés automatiquement et n'ont ni adresse IP à saisir ni serveur à démarrer.

**Pare-feu :** au premier lancement, Windows peut demander l'autorisation pour Node.js. Autorisez les réseaux privés (ports 5300 et 5301) pour que la découverte fonctionne.

**Un seul serveur à la fois.** Si deux personnes lancent le lanceur exactement en même temps avant que la découverte n'aboutisse, fermez l'un des deux serveurs et relancez : le second rejoindra le premier.
## Scénario A — un PC fixe sert les autres (le plus simple)

1. Sur le PC serveur : double-clic sur `Lancer SAFE Partage.cmd`.
2. Noter l'adresse **Réseau** affichée, par exemple `http://192.168.1.20:5300`.
3. Les autres PC ouvrent cette adresse.

Le PC serveur doit rester allumé pendant l'utilisation.

## Scénario B — aucun PC principal : le serveur suit la clé USB

Placez le fichier de données sur une clé USB ou un dossier réseau partagé :

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

1. Fermer le serveur sur l'ancien PC (fenêtre du lanceur).
2. Brancher la clé USB sur le nouveau PC.
3. Relancer le lanceur avec le même fichier.

Les autres utilisateurs continuent d'ouvrir l'adresse réseau du PC actif. Si l'adresse IP change, ils utilisent la nouvelle adresse affichée.

> Le fichier `shared-db.json` contient **toutes** les données (écritures, utilisateurs, budgets, clôture). Sauvegardez-le régulièrement.

## Scénario C — serveur toujours disponible (recommandé en production)

Installez le serveur sur un petit PC allumé en permanence, un NAS, un Raspberry Pi ou un VPS :

```bash
node scripts/share-server.mjs 5300 /chemin/partage/shared-db.json
```

Pour un accès Internet, placez-le derrière HTTPS (reverse proxy Caddy/Nginx) et ajoutez une authentification.

## Limites actuelles

- Réseau local recommandé ; pas d'authentification sur l'API (réseau de confiance).
- Résolution des conflits : dernier écrivain gagne.
- Un seul serveur à la fois sur un fichier donné.
- Les préférences d'affichage (langue, thème, devise) restent propres à chaque navigateur ; elles ne sont pas synchronisées.

## Dépannage

| Symptôme | Cause | Solution |
|---|---|---|
| Badge « Base partagée » absent | Serveur non lancé ou port bloqué | Lancer le serveur, vérifier `http://IP:5300/api/health` |
| Les autres PC ne voient pas les modifications | Ils sont sur le serveur local (5200) au lieu du serveur partagé (5300) | Ouvrir l'adresse réseau du PC serveur |
| Deux bases différentes | Chaque PC a lancé son serveur avec un fichier local différent | Utiliser le même fichier de données |
| Écran blanc sur un autre PC | Ancienne version en cache | Recharger (Ctrl+F5) |

## Sécurité du mode équipe (serveur de partage)
- Connexion vérifiée **par le serveur** (`/api/login`) ; mots de passe stockés en PBKDF2-SHA256 (100 000 itérations, sel aléatoire).
- Toute donnée (`/api/db`, événements, sauvegardes, flux BI) exige une session ; l'auditeur est en lecture seule ; seul l'administrateur voit les comptes, restaure une sauvegarde ou modifie les utilisateurs.
- 5 échecs de connexion verrouillent le compte 5 minutes (tracé dans le journal d'audit).
- Flux BI : session ou authentification HTTP « Basic » (identifiant:mot de passe) — utilisable dans Power BI.
- Limites : la connexion circule en clair sur un réseau en http (placez le serveur derrière HTTPS ou un VPN pour un usage hors réseau local) ; les données synchronisées restent copiées dans le navigateur de chaque poste connecté.

## Rapports automatiques par e-mail (serveur partagé)

Réglages → « Rapports automatiques » (administrateur, mode équipe). Renseignez le serveur SMTP (port 587 STARTTLS, ou 465 avec « SSL direct »), puis créez un ou plusieurs plannings : nom, heure, jours, destinataires. Chaque jour à l'heure prévue, le serveur génère un classeur Excel (synthèse par entité + tables de référence) et l'envoie en pièce jointe. Une copie est toujours enregistrée dans `rapports-auto/`. Le serveur doit être allumé à l'heure prévue ; le mot de passe SMTP reste sur le serveur (fichier `reports-config.json`). Le bouton « Envoyer maintenant » permet de tester.

## Application Windows (installateur)

Sur un poste Windows avec Node.js : double-clic sur `Construire l'installateur Windows.cmd`. Il produit `release/SAFE-Setup-x.y.z.exe` (Electron + NSIS) : l'application embarque le serveur partagé, stocke ses données dans le profil de l'utilisateur et s'ouvre dans sa propre fenêtre. Cette étape n'a pas pu être testée sur Linux.
