# Registre qualité et CAPA

Le module enregistre les non-conformités par entité, leur origine et gravité, l’analyse de cause racine, les mesures immédiates, les échéances et les actions correctives/préventives. Une action ne peut être marquée terminée sans preuve de vérification; un dossier ne peut être clôturé sans cause racine, conclusion et actions vérifiées.

Les routes sont exposées sous `/api/quality` et protégées par les rôles `ADMIN`, `HR_MANAGER` et `LOGISTICS_MGR`. Toutes les lectures et écritures sont limitées à l’entité de la session authentifiée. L’origine « Équipement » requiert une référence à un équipement actif de cette même entité; la relation est nullable et devient nulle si l’équipement est supprimé. CAPA ne crée ni ne modifie les ordres ou échéances de maintenance.

Routes:

- `GET /equipment` — équipements actifs accessibles pour la sélection dans un dossier.
- `GET /findings` et `POST /findings` — registre et création des non-conformités.
- `PATCH /findings/:id` — mise à jour et transitions de statut contrôlées.
- `POST /findings/:id/actions` — création d’une action CAPA.
- `PATCH /actions/:id` — progression d’une action et enregistrement des preuves.

Tests synthétiques: `npm run test:quality`. Le test de persistance SQLite est activé uniquement lorsque `NODE_ENV=test` et `SAFE_ERP_TEST_DATABASE_URL` pointent vers une base dédiée; aucun test ne se connecte à une base SAFE réelle.

Les échéances passées des dossiers encore actifs et des actions CAPA ouvertes/en cours sont signalées dans le registre et le détail. Les dossiers clôturés/annulés et actions terminées/annulées ne sont pas comptés en retard; l’indicateur se rafraîchit chaque minute.
