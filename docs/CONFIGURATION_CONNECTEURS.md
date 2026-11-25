# Coffre et Ã©tat des connecteurs DGI, CNSS et TUNEPS

## Ce qui est opÃ©rationnel

Les profils DGI/e-facturation, CNSS et TUNEPS sont configurables dans
**Administration â†’ PrÃ©paration des fonctionnalitÃ©s du classeur**. Chaque profil
permet de saisir un champ dâ€™identification et sa valeur, de remplacer ou
supprimer les identifiants, de consulter seulement les noms des champs stockÃ©s,
et de valider localement un contrat/mapping. Les aperÃ§us utilisent des
Ã©chantillons synthÃ©tiques et ne lancent aucun appel externe.

Les valeurs sont chiffrÃ©es par AES-256-GCM cÃ´tÃ© serveur avec une clÃ© alÃ©atoire
de 32 octets fournie par lâ€™environnement. Lâ€™API ne renvoie jamais les valeurs,
les rÃ©ponses portent `Cache-Control: no-store`, et les secrets sont conservÃ©s
dans une table distincte de lâ€™historique des configurations fonctionnelles.
Lâ€™interface nâ€™enregistre les valeurs que temporairement en mÃ©moire pendant la
saisie. Seuls les administrateurs de lâ€™entitÃ© peuvent gÃ©rer ces profils.

Configurez dans le gestionnaire de secrets du serveur :

```dotenv
SAFE_ERP_CONNECTOR_ENCRYPTION_KEY=<64 caractÃ¨res hexadÃ©cimaux alÃ©atoires>
SAFE_ERP_CONNECTOR_ENCRYPTION_KEY_ID=v1
```

Le secret doit rester sauvegardÃ© de maniÃ¨re sÃ©curisÃ©e et stable. Les clÃ©s
historiques ne sont pas conservÃ©es par lâ€™application : changer la clÃ© ou son
identifiant rend les valeurs existantes illisibles; restaurez la clÃ© dâ€™origine
ou supprimez puis ressaisissez ces valeurs. Ne fournissez jamais cette clÃ© Ã  un
client, ne la mettez pas dans le dÃ©pÃ´t et ne lâ€™inscrivez pas dans une
configuration de fonctionnalitÃ©.

## Limite de connexion

La collecte dâ€™identifiants et la validation locale **ne signifient pas que le
service est connectÃ©**. Le statut reste `NOT_CONNECTED`; le bouton de contrÃ´le
des prÃ©requis indique `BLOCKED` et confirme quâ€™aucune requÃªte rÃ©seau nâ€™a Ã©tÃ©
faite. Lâ€™activation est indisponible dans cette version.

Il manque encore, pour chaque service, un contrat officiel vÃ©rifiable qui
prÃ©cise le point dâ€™accÃ¨s autorisÃ©, le protocole et la mÃ©thode dâ€™authentification,
le schÃ©ma/version de la requÃªte et de la rÃ©ponse, et les paramÃ¨tres de
lâ€™environnement de test. Les taux TEJ/G50, formats fixes CNSS, pourcentages de
caution et URL RSS/TUNEPS du document fourni ne sont pas activÃ©s : ils nâ€™ont pas
Ã©tÃ© corroborÃ©s par des spÃ©cifications officielles. Aucun appel nâ€™est fait aux
portails DGI, CNSS ou TUNEPS.

Lorsque les contrats officiels seront fournis, ils pourront Ãªtre rattachÃ©s au
mapping versionnÃ© du profil sans migrer les identifiants vers des configurations
JSON ni exposer leurs valeurs dans les journaux. Jusque-lÃ , les sorties et
aperÃ§us sont des outils de prÃ©paration uniquement et ne sont ni dÃ©clarations,
ni certificats, ni soumissions officielles.
