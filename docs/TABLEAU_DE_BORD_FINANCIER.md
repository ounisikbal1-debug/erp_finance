# Tableau de bord financier SAFE

GÃ©nÃ©rer une copie locale consultable depuis le projet :

```powershell
npm run dashboard:export
```

Les fichiers `SAFE - Tableau de bord financier.html` et `SAFE - Tableau de bord financier.xlsx` sont enregistrÃ©s sur le Bureau Windows (Bureau OneDrive si disponible). La page HTML contient aussi un lien vers le classeur Excel associÃ©. Pour choisir un autre chemin et nom de fichier, dÃ©finir `SAFE_DASHBOARD_EXPORT_PATH` avec un chemin de fichier complet avant de lancer la commande ; le classeur est crÃ©Ã© avec le mÃªme nom et l'extension `.xlsx`.

L'export lit les entitÃ©s, les Ã©critures postÃ©es, les factures Ã©mises, les comptes et les donnÃ©es de stock dÃ©jÃ  prÃ©sentes dans SAFE. Il ne crÃ©e ni ne modifie de donnÃ©es mÃ©tier. Les deux fichiers sont des instantanÃ©s Ã  la date affichÃ©e, pas une connexion en temps rÃ©el ; relancer la commande pour les actualiser. La page HTML permet de filtrer par entitÃ© et par pÃ©riode de 3, 6 ou 12 mois, d'afficher les tendances mensuelles, d'imprimer et de tÃ©lÃ©charger un CSV des sÃ©ries affichÃ©es. Le classeur Excel comprend une feuille de synthÃ¨se filtrable par entitÃ© et indicateur, une table mensuelle filtrable Ã  utiliser pour une analyse ou des graphiques Excel, et une feuille expliquant les ratios non calculÃ©s. Il conserve les pÃ©riodes mensuelles et nombres comme donnÃ©es numÃ©riques ; les champs impossibles Ã  calculer sont indiquÃ©s comme Â« Indisponible Â».

Les indicateurs disponibles sont les revenus et charges comptabilisÃ©s, leur diffÃ©rence, les factures Ã©mises et le stock au coÃ»t enregistrÃ©. Les ratios du classeur (notamment liquiditÃ©, dette, rentabilitÃ© avancÃ©e, BFR, DSO/DPO, rotation et valeur ajoutÃ©e) restent explicitement indisponibles dans cet export tant que leurs sources et rÃ¨gles de classement n'ont pas Ã©tÃ© rapprochÃ©es de maniÃ¨re fiable. Les valeurs invalides ou comptes non classÃ©s sont signalÃ©s ; aucune valeur n'est complÃ©tÃ©e par une estimation. Cette vue n'est pas une validation juridique, rÃ©glementaire ou fiscale.

Dans l'application, le bouton **GÃ©nÃ©rer le tableau de bord Excel** (administrateur ou responsable financier) produit un classeur multi-feuilles avec la balance, le compte de rÃ©sultat, les balances Ã¢gÃ©es et les indicateurs calculÃ©s Ã  partir des API SAFE. Les Ã©tats et ratios avancÃ©s ne sont disponibles que si les comptes comptabilisables sont explicitement classÃ©s avec une `financialCategory` compatible avec leur type, et si les Ã©critures postÃ©es couvrent la pÃ©riode et les soldes requis. Les catÃ©gories ne sont jamais dÃ©duites des numÃ©ros de compte ; une analyse disponible reste provisoire et doit Ãªtre rapprochÃ©e par la comptabilitÃ©. La page de configuration des comptes permet de consulter et transmettre ces classifications.

Pour crÃ©er une base isolÃ©e rÃ©servÃ©e Ã  l'exemple synthÃ©tique de DRAFT 2, vÃ©rifier d'abord que le fichier `src\data\dashboard-demo-synthetic.db` n'existe pas, puis lancer depuis DRAFT 2 :

```powershell
$env:SAFE_ERP_DATABASE_URL = 'file:../dashboard-demo-synthetic.db'
npx prisma db push --schema=src\data\prisma\schema.prisma
$env:SAFE_ERP_DASHBOARD_DEMO_CONFIRM = 'YES'
npm run demo:dashboard:seed
$env:SAFE_DASHBOARD_EXPORT_PATH = Join-Path (Get-Location) 'src\data\demo-output\SAFE-Tableau-Financier-EXEMPLE-SYNTHETIQUE.html'
$env:SAFE_DASHBOARD_EXPORT_LABEL = 'EXEMPLE â€” DONNÃ‰ES SYNTHÃ‰TIQUES FICTIVES'
npm run dashboard:export
```

Le seed refuse une autre URL de base et refuse de dupliquer sa sociÃ©tÃ© fictive ; il n'importe aucune donnÃ©e client. Les rapports crÃ©Ã©s de cette faÃ§on sont des exemples synthÃ©tiques, pas des donnÃ©es rÃ©elles ni une autorisation d'import d'un client. L'export CLI reste limitÃ© aux indicateurs ci-dessus et indique sÃ©parÃ©ment les ratios qu'il ne calcule pas.
