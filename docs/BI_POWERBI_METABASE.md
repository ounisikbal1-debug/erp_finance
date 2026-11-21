# SAFE — accès Power BI Desktop

## Parcours depuis SAFE

Depuis le compte de résultat, développez **Préparer un rapport Power BI Desktop sur ce PC** et téléchargez `SAFE_Desktop_Starter.zip`. Extrayez le pack puis suivez le guide inclus pour créer les quatre requêtes (journaux comptabilisés, ventes émises/payées, achats fournisseurs comptabilisés, ancienneté des créances). Le navigateur ne lance pas l’application Windows lui-même : ouvrez Power BI Desktop sur le poste, créez une **Requête vierge** par fichier `.m`, collez son contenu dans l’**Éditeur avancé**, puis actualisez.

L’API BI expose `GET /api/bi/receivables-aging?asOf=YYYY-MM-DD`, un jeu de données en lecture seule à la granularité d’une facture. L’entité est toujours dérivée du compte authentifié; le service d’ancienneté existant fournit les totaux, la couverture et les diagnostics. Le fichier `SAFE_ReceivablesAging.m` lit ce jeu de données; les totaux restent indisponibles lorsque la couverture contient des factures invalides.

Le pack source est `integrations/powerbi/desktop-starter` et sa copie téléchargeable est `public/powerbi/SAFE_Desktop_Starter.zip`. Les requêtes journaux/ventes/achats utilisent une période glissante de 365 jours; l’ancienneté utilise une date d’arrêté. Chaque ligne porte l’entité fournie par SAFE et l’heure de génération. Le serveur dérive l’entité de l’utilisateur authentifié; le rapport ne peut pas imposer un autre `entityId`. Les dates `from` et `to` des trois extractions périodiques sont obligatoires et l’API limite chaque extraction à 366 jours.

Il s’agit d’un pack de requêtes et d’instructions, pas d’un rapport `.pbix`/`.pbit` préconstruit : cet environnement ne peut ni générer sûrement un rapport Desktop valide ni l’ouvrir pour le vérifier. Le guide suggère des visuels de départ à créer dans Desktop. Le dataset d’ancienneté des créances provient de la route BI en lecture seule; le pack n’invente ni factures ni totaux.

SAFE fournit désormais des **repères d’analyse automatiques dans ses propres écrans** : comparaison descriptive des produits/charges sur les deux derniers mois complets dans le tableau de bord, total de créances échues et part de plus de 90 jours dans la balance clients, ainsi que résultat de période, couverture et comparaison descriptive avec N-1 dans le compte de résultat. Le compte de résultat peut être exporté en classeur consultatif comprenant les lignes budgétaires approuvées des mois complets demandés; les brouillons et les mois partiels ne sont pas projetés. Pour une période commençant le 1er janvier, une projection annuelle indicative peut appliquer la variation de la période N/N-1 à l’année N-1 si les trois rapports correspondent à la même société/devise et que leur couverture comptable est complète. Cette extrapolation ne modélise ni saisonnalité ni trésorerie et n’est ni un budget ni une prévision certaine. Les scénarios du module Trésorerie ne sont pas inclus dans le classeur: ils exigent le choix explicite d’un scénario et d’un horizon. Aucun commentaire d’IA n’est ajouté au fichier. Ces repères sont calculés localement à partir des données authentifiées; ils ne sont ni des conseils professionnels ni une validation réglementaire. L’assistant Ollama reste une option distincte, désactivée par défaut.

## Limite de l’affichage automatique dans Power BI Desktop

L’utilisateur a demandé un rapport automatiquement généré et affiché sur son PC, sans configuration ou actualisation manuelle dans Power BI Desktop. Ce parcours n’est pas livré : Desktop est une application Windows séparée; le dépôt ne fournit pas de compagnon local fonctionnel ni de PBIX/PBIT préconstruit et testable. Le wrapper Electron actuellement présent n’est pas raccordé à l’application métier (il référence un script et un endpoint absents), et l’installateur invoque un script `desktop:build` non déclaré dans `package.json`. Aucun mot de passe ou jeton ne sera transmis par un lien navigateur ou stocké en clair.

Le pack `SAFE_Desktop_Starter.zip` et ses fichiers M sont seulement une base technique de requêtes locales nécessitant une configuration dans Desktop; ils ne satisfont pas l’affichage sans intervention et ne sont donc pas présentés comme une solution automatique dans l’écran SAFE. La voie automatique utilisable aujourd’hui est l’analyse native dans SAFE décrite ci-dessus. Une automatisation Desktop future demanderait un compagnon Windows réellement installé, une autorisation SAFE à durée courte et à usage unique, un rapport Desktop préconstruit/validé, ainsi qu’un mécanisme de rafraîchissement pris en charge et testé; aucun de ces composants n’est actuellement en place. Ne pas supposer que l’ouverture d’un fichier local rafraîchit ses données.

| Endpoint | Granularité |
|---|---|
| `/api/bi/manifest` | Manifest des données et limites |
| `/api/bi/journal-lines?from=AAAA-MM-JJ&to=AAAA-MM-JJ` | Une ligne de journal comptabilisée |
| `/api/bi/sales-invoices?from=AAAA-MM-JJ&to=AAAA-MM-JJ` | Une facture émise ou payée |
| `/api/bi/purchase-invoices?from=AAAA-MM-JJ&to=AAAA-MM-JJ` | Une facture fournisseur comptabilisée |
| `/api/bi/receivables-aging?asOf=AAAA-MM-JJ` | Une facture ouverte et ses diagnostics d’ancienneté |

## Même PC que SAFE

Les requêtes M du pack utilisent `http://127.0.0.1:3000`. Démarrez SAFE sur le même PC que Power BI Desktop. Lorsque Power BI demande les identifiants, choisissez **Basic** et saisissez les identifiants SAFE d’un utilisateur `ADMIN` ou `FINANCIAL_MANAGER`. SAFE n’accepte Basic que pour les requêtes locales GET; il vérifie le compte, son rôle et utilise l’entité attachée à ce compte. Power BI mémorise les identifiants dans son gestionnaire de connexions; ne les inscrivez pas dans le code M.

## Power BI sur un autre PC

L’accès depuis un client réseau est possible via l’API SAFE et des jetons Bearer; il ne dépend pas d’une connexion locale loopback. Il exige SAFE déployé derrière HTTPS avec `SAFE_ERP_AUTH_SECRET` configuré. Le connecteur Power Query personnalisé se trouve dans `integrations/powerbi/SAFEERP.pq`; compilez-le en `.mez` avec le Power Query SDK pour Visual Studio, installez-le sous `Documents\Power BI Desktop\Custom Connectors`, autorisez les extensions personnalisées et saisissez l’URL HTTPS de SAFE ainsi que les identifiants SAFE dans l’interface Power BI. Le connecteur obtient un jeton de courte durée depuis SAFE puis l’utilise sur les datasets; les autorisations sont vérifiées côté serveur à chaque requête. Ne publiez pas l’API sur un réseau sans TLS ni secret d’authentification.

Cette extension personnalisée n’a pas été compilée/validée sur ce poste; le SDK n’est pas installé. Le pack M téléchargé depuis SAFE est destiné au scénario local le plus simple et demande la création des requêtes, pages et visuels dans Desktop. Le dossier Power BI Desktop Store fourni paraît être un profil/cache; il n’a pas été consulté ni modifié.

## Limites

Power BI Desktop reste une application séparée : le navigateur SAFE ne lance pas arbitrairement un programme Windows et n’intègre pas sa fenêtre. Pour afficher un rapport dans la page SAFE, il faudrait publier le rapport sur Power BI Service/Embedded avec une capacité/licence, un tenant Microsoft Entra et un flux serveur d’incorporation; ces éléments ne sont pas configurés. L’actualisation planifiée Power BI Service n’est pas fournie.

Les routes `/api/bi` sont GET-only, ne créent ni ne mettent à jour des données SAFE, ne reçoivent pas d’import Power BI et n’exposent aucune écriture comptable. Aucune donnée Power BI préexistante n’est rétro-importée. Le serveur historique `Lancer SAFE Partage.cmd` sur le port 5300 publie des CSV sans authentification et ne doit pas servir pour des données réelles.

## Assistant IA analytique local

L’assistant du compte de résultat est désactivé par défaut. Son utilisation exige une approbation explicite du matériel et du modèle exact sur la machine cible, puis les trois variables `SAFE_ERP_AI_ENABLED=true`, `SAFE_ERP_AI_HARDWARE_READY=true` et `SAFE_ERP_AI_MODEL_APPROVED=true` dans la configuration protégée du serveur, ainsi que `SAFE_ERP_AI_MODEL=<nom-du-modèle-local>`. Toute variable d’approbation absente bloque les requêtes. L’utilisateur doit aussi confirmer dans l’interface qu’il vérifiera chaque réponse avant une décision; l’API refuse les demandes sans cette confirmation. Ollama doit être local à l’API; toute URL hors loopback est refusée. Seule la période, la devise et les totaux agrégés POSTED sont envoyés au modèle; aucune action d’écriture n’est exposée. Les réponses sont indicatives, non certifiées, et doivent être vérifiées.
