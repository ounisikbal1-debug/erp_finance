# AccÃ¨s SAFE sur le rÃ©seau local

Le lanceur `LANCER_SAFE_ERP_RESEAU.ps1` garde lâ€™API de cette copie SAFE sur `127.0.0.1:3001` et publie lâ€™interface Ã  travers Caddy en HTTPS sur le port `8443`. Le port `3001` permet de dÃ©marrer cette copie sans remplacer une autre instance SAFE dÃ©jÃ  active sur `3000`. Il dÃ©tecte lâ€™adresse Wi-Fi du poste Ã  chaque dÃ©marrage pour que les appareils connectÃ©s au mÃªme partage mobile puissent utiliser directement lâ€™IPv4 courante. Il ne configure pas automatiquement le pare-feu Windows ou la confiance des certificats.

## PrÃ©parer le poste serveur

1. Installer Caddy avec la procÃ©dure officielle : [documentation dâ€™installation de Caddy](https://caddyserver.com/docs/install).
2. Connecter les postes clients au mÃªme partage de connexion que le serveur.
3. Sur le pare-feu Windows, autoriser TCP `8443` uniquement sur le profil **PrivÃ©** et depuis le rÃ©seau local prÃ©vu. Ne pas publier les ports `3000` et `5176`.
4. Depuis le dossier SAFE, exÃ©cuter `npm run build`, puis `.\LANCER_SAFE_ERP_RESEAU.ps1`. Garder cette fenÃªtre ouverte pendant le service.

Une fois dÃ©marrÃ©, cette copie est accessible localement sur `http://127.0.0.1:3001`. Le lanceur affiche une URL HTTPS avec lâ€™adresse Wi-Fi dÃ©tectÃ©e; les autres appareils peuvent lâ€™ouvrir directement, sans DNS ni fichier `hosts`. Lâ€™alias facultatif `safe-erp.home.arpa` ne fonctionne que si le DNS local le rÃ©sout vers le serveur.

## Faire confiance au certificat sur les postes clients

Caddy crÃ©e un certificat signÃ© par son autoritÃ© locale. AprÃ¨s le premier dÃ©marrage, rÃ©cupÃ©rer le certificat public racine sur le serveur depuis :

```text
%AppData%\Caddy\pki\authorities\local\root.crt
```

TransfÃ©rer ce fichier par un canal administratif sÃ»r, puis installer `root.crt` dans **AutoritÃ©s de certification racines de confiance** sur chaque appareil client. Ne jamais transfÃ©rer la clÃ© privÃ©e de Caddy (`root.key`). Le navigateur doit afficher un certificat valide avant la connexion.

## Limites de ce mode

- Ce parcours convient Ã  un petit rÃ©seau de confiance, avec un seul poste serveur et une seule instance. La base SQLite ne doit pas Ãªtre placÃ©e sur un partage rÃ©seau ni ouverte directement depuis les postes clients.
- Sur un hotspot mobile, lâ€™adresse IPv4 peut changer aprÃ¨s une reconnexion; relancez le lanceur et utilisez la nouvelle URL affichÃ©e. Certains hotspots isolent les appareils; si un client ne peut pas joindre le port `8443`, le tÃ©lÃ©phone doit autoriser la communication entre appareils ou il faut utiliser un autre rÃ©seau local.
- Les comptes SAFE et leurs rÃ´les restent obligatoires; aucun mot de passe commun nâ€™est crÃ©Ã©. CrÃ©ez un compte par personne et attribuez les droits nÃ©cessaires.
- Lâ€™accÃ¨s depuis Internet, la haute disponibilitÃ©, les sauvegardes hors poste et la capacitÃ© multi-utilisateur de production ne sont pas fournis par ce lanceur. Pour un dÃ©ploiement de production, suivre [DÃ©ployer SAFE derriÃ¨re HTTPS](DEPLOIEMENT_WEB.md) et valider les migrations, la restauration et les rÃ¨gles mÃ©tier avant ouverture.
