# Accès SAFE sur le réseau local

Le lanceur `LANCER_SAFE_ERP_RESEAU.ps1` garde l’API de cette copie SAFE sur `127.0.0.1:3001` et publie l’interface à travers Caddy en HTTPS sur le port `8443`. Le port `3001` permet de démarrer cette copie sans remplacer une autre instance SAFE déjà active sur `3000`. Il détecte l’adresse Wi-Fi du poste à chaque démarrage pour que les appareils connectés au même partage mobile puissent utiliser directement l’IPv4 courante. Il ne configure pas automatiquement le pare-feu Windows ou la confiance des certificats.

## Préparer le poste serveur

1. Installer Caddy avec la procédure officielle : [documentation d’installation de Caddy](https://caddyserver.com/docs/install).
2. Connecter les postes clients au même partage de connexion que le serveur.
3. Sur le pare-feu Windows, autoriser TCP `8443` uniquement sur le profil **Privé** et depuis le réseau local prévu. Ne pas publier les ports `3000` et `5176`.
4. Depuis le dossier SAFE, exécuter `npm run build`, puis `.\LANCER_SAFE_ERP_RESEAU.ps1`. Garder cette fenêtre ouverte pendant le service.

Une fois démarré, cette copie est accessible localement sur `http://127.0.0.1:3001`. Le lanceur affiche une URL HTTPS avec l’adresse Wi-Fi détectée; les autres appareils peuvent l’ouvrir directement, sans DNS ni fichier `hosts`. L’alias facultatif `safe-erp.home.arpa` ne fonctionne que si le DNS local le résout vers le serveur.

## Faire confiance au certificat sur les postes clients

Caddy crée un certificat signé par son autorité locale. Après le premier démarrage, récupérer le certificat public racine sur le serveur depuis :

```text
%AppData%\Caddy\pki\authorities\local\root.crt
```

Transférer ce fichier par un canal administratif sûr, puis installer `root.crt` dans **Autorités de certification racines de confiance** sur chaque appareil client. Ne jamais transférer la clé privée de Caddy (`root.key`). Le navigateur doit afficher un certificat valide avant la connexion.

## Limites de ce mode

- Ce parcours convient à un petit réseau de confiance, avec un seul poste serveur et une seule instance. La base SQLite ne doit pas être placée sur un partage réseau ni ouverte directement depuis les postes clients.
- Sur un hotspot mobile, l’adresse IPv4 peut changer après une reconnexion; relancez le lanceur et utilisez la nouvelle URL affichée. Certains hotspots isolent les appareils; si un client ne peut pas joindre le port `8443`, le téléphone doit autoriser la communication entre appareils ou il faut utiliser un autre réseau local.
- Les comptes SAFE et leurs rôles restent obligatoires; aucun mot de passe commun n’est créé. Créez un compte par personne et attribuez les droits nécessaires.
- L’accès depuis Internet, la haute disponibilité, les sauvegardes hors poste et la capacité multi-utilisateur de production ne sont pas fournis par ce lanceur. Pour un déploiement de production, suivre [Déployer SAFE derrière HTTPS](DEPLOIEMENT_WEB.md) et valider les migrations, la restauration et les règles métier avant ouverture.
