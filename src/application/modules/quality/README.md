# Registre qualitÃ© et CAPA

Le module enregistre les non-conformitÃ©s par entitÃ©, leur origine et gravitÃ©, lâ€™analyse de cause racine, les mesures immÃ©diates, les Ã©chÃ©ances et les actions correctives/prÃ©ventives. Une action ne peut Ãªtre marquÃ©e terminÃ©e sans preuve de vÃ©rification; un dossier ne peut Ãªtre clÃ´turÃ© sans cause racine, conclusion et actions vÃ©rifiÃ©es.

Les routes sont exposÃ©es sous `/api/quality` et protÃ©gÃ©es par les rÃ´les `ADMIN`, `HR_MANAGER` et `LOGISTICS_MGR`. Toutes les lectures et Ã©critures sont limitÃ©es Ã  lâ€™entitÃ© de la session authentifiÃ©e. Lâ€™origine Â« Ã‰quipement Â» requiert une rÃ©fÃ©rence Ã  un Ã©quipement actif de cette mÃªme entitÃ©; la relation est nullable et devient nulle si lâ€™Ã©quipement est supprimÃ©. CAPA ne crÃ©e ni ne modifie les ordres ou Ã©chÃ©ances de maintenance.

Routes:

- `GET /equipment` â€” Ã©quipements actifs accessibles pour la sÃ©lection dans un dossier.
- `GET /findings` et `POST /findings` â€” registre et crÃ©ation des non-conformitÃ©s.
- `PATCH /findings/:id` â€” mise Ã  jour et transitions de statut contrÃ´lÃ©es.
- `POST /findings/:id/actions` â€” crÃ©ation dâ€™une action CAPA.
- `PATCH /actions/:id` â€” progression dâ€™une action et enregistrement des preuves.

Tests synthÃ©tiques: `npm run test:quality`. Le test de persistance SQLite est activÃ© uniquement lorsque `NODE_ENV=test` et `SAFE_ERP_TEST_DATABASE_URL` pointent vers une base dÃ©diÃ©e; aucun test ne se connecte Ã  une base SAFE rÃ©elle.

Les Ã©chÃ©ances passÃ©es des dossiers encore actifs et des actions CAPA ouvertes/en cours sont signalÃ©es dans le registre et le dÃ©tail. Les dossiers clÃ´turÃ©s/annulÃ©s et actions terminÃ©es/annulÃ©es ne sont pas comptÃ©s en retard; lâ€™indicateur se rafraÃ®chit chaque minute.
