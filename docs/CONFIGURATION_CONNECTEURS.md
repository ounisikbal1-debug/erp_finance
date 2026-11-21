# Coffre et état des connecteurs DGI, CNSS et TUNEPS

## Ce qui est opérationnel

Les profils DGI/e-facturation, CNSS et TUNEPS sont configurables dans
**Administration → Préparation des fonctionnalités du classeur**. Chaque profil
permet de saisir un champ d’identification et sa valeur, de remplacer ou
supprimer les identifiants, de consulter seulement les noms des champs stockés,
et de valider localement un contrat/mapping. Les aperçus utilisent des
échantillons synthétiques et ne lancent aucun appel externe.

Les valeurs sont chiffrées par AES-256-GCM côté serveur avec une clé aléatoire
de 32 octets fournie par l’environnement. L’API ne renvoie jamais les valeurs,
les réponses portent `Cache-Control: no-store`, et les secrets sont conservés
dans une table distincte de l’historique des configurations fonctionnelles.
L’interface n’enregistre les valeurs que temporairement en mémoire pendant la
saisie. Seuls les administrateurs de l’entité peuvent gérer ces profils.

Configurez dans le gestionnaire de secrets du serveur :

```dotenv
SAFE_ERP_CONNECTOR_ENCRYPTION_KEY=<64 caractères hexadécimaux aléatoires>
SAFE_ERP_CONNECTOR_ENCRYPTION_KEY_ID=v1
```

Le secret doit rester sauvegardé de manière sécurisée et stable. Les clés
historiques ne sont pas conservées par l’application : changer la clé ou son
identifiant rend les valeurs existantes illisibles; restaurez la clé d’origine
ou supprimez puis ressaisissez ces valeurs. Ne fournissez jamais cette clé à un
client, ne la mettez pas dans le dépôt et ne l’inscrivez pas dans une
configuration de fonctionnalité.

## Limite de connexion

La collecte d’identifiants et la validation locale **ne signifient pas que le
service est connecté**. Le statut reste `NOT_CONNECTED`; le bouton de contrôle
des prérequis indique `BLOCKED` et confirme qu’aucune requête réseau n’a été
faite. L’activation est indisponible dans cette version.

Il manque encore, pour chaque service, un contrat officiel vérifiable qui
précise le point d’accès autorisé, le protocole et la méthode d’authentification,
le schéma/version de la requête et de la réponse, et les paramètres de
l’environnement de test. Les taux TEJ/G50, formats fixes CNSS, pourcentages de
caution et URL RSS/TUNEPS du document fourni ne sont pas activés : ils n’ont pas
été corroborés par des spécifications officielles. Aucun appel n’est fait aux
portails DGI, CNSS ou TUNEPS.

Lorsque les contrats officiels seront fournis, ils pourront être rattachés au
mapping versionné du profil sans migrer les identifiants vers des configurations
JSON ni exposer leurs valeurs dans les journaux. Jusque-là, les sorties et
aperçus sont des outils de préparation uniquement et ne sont ni déclarations,
ni certificats, ni soumissions officielles.
