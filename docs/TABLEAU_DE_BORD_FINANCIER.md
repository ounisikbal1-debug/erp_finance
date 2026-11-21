# Tableau de bord financier SAFE

Générer une copie locale consultable depuis le projet :

```powershell
npm run dashboard:export
```

Les fichiers `SAFE - Tableau de bord financier.html` et `SAFE - Tableau de bord financier.xlsx` sont enregistrés sur le Bureau Windows (Bureau OneDrive si disponible). La page HTML contient aussi un lien vers le classeur Excel associé. Pour choisir un autre chemin et nom de fichier, définir `SAFE_DASHBOARD_EXPORT_PATH` avec un chemin de fichier complet avant de lancer la commande ; le classeur est créé avec le même nom et l'extension `.xlsx`.

L'export lit les entités, les écritures postées, les factures émises, les comptes et les données de stock déjà présentes dans SAFE. Il ne crée ni ne modifie de données métier. Les deux fichiers sont des instantanés à la date affichée, pas une connexion en temps réel ; relancer la commande pour les actualiser. La page HTML permet de filtrer par entité et par période de 3, 6 ou 12 mois, d'afficher les tendances mensuelles, d'imprimer et de télécharger un CSV des séries affichées. Le classeur Excel comprend une feuille de synthèse filtrable par entité et indicateur, une table mensuelle filtrable à utiliser pour une analyse ou des graphiques Excel, et une feuille expliquant les ratios non calculés. Il conserve les périodes mensuelles et nombres comme données numériques ; les champs impossibles à calculer sont indiqués comme « Indisponible ».

Les indicateurs disponibles sont les revenus et charges comptabilisés, leur différence, les factures émises et le stock au coût enregistré. Les ratios du classeur (notamment liquidité, dette, rentabilité avancée, BFR, DSO/DPO, rotation et valeur ajoutée) restent explicitement indisponibles dans cet export tant que leurs sources et règles de classement n'ont pas été rapprochées de manière fiable. Les valeurs invalides ou comptes non classés sont signalés ; aucune valeur n'est complétée par une estimation. Cette vue n'est pas une validation juridique, réglementaire ou fiscale.

Dans l'application, le bouton **Générer le tableau de bord Excel** (administrateur ou responsable financier) produit un classeur multi-feuilles avec la balance, le compte de résultat, les balances âgées et les indicateurs calculés à partir des API SAFE. Les états et ratios avancés ne sont disponibles que si les comptes comptabilisables sont explicitement classés avec une `financialCategory` compatible avec leur type, et si les écritures postées couvrent la période et les soldes requis. Les catégories ne sont jamais déduites des numéros de compte ; une analyse disponible reste provisoire et doit être rapprochée par la comptabilité. La page de configuration des comptes permet de consulter et transmettre ces classifications.

Pour créer une base isolée réservée à l'exemple synthétique de DRAFT 2, vérifier d'abord que le fichier `src\data\dashboard-demo-synthetic.db` n'existe pas, puis lancer depuis DRAFT 2 :

```powershell
$env:SAFE_ERP_DATABASE_URL = 'file:../dashboard-demo-synthetic.db'
npx prisma db push --schema=src\data\prisma\schema.prisma
$env:SAFE_ERP_DASHBOARD_DEMO_CONFIRM = 'YES'
npm run demo:dashboard:seed
$env:SAFE_DASHBOARD_EXPORT_PATH = Join-Path (Get-Location) 'src\data\demo-output\SAFE-Tableau-Financier-EXEMPLE-SYNTHETIQUE.html'
$env:SAFE_DASHBOARD_EXPORT_LABEL = 'EXEMPLE — DONNÉES SYNTHÉTIQUES FICTIVES'
npm run dashboard:export
```

Le seed refuse une autre URL de base et refuse de dupliquer sa société fictive ; il n'importe aucune donnée client. Les rapports créés de cette façon sont des exemples synthétiques, pas des données réelles ni une autorisation d'import d'un client. L'export CLI reste limité aux indicateurs ci-dessus et indique séparément les ratios qu'il ne calcule pas.
