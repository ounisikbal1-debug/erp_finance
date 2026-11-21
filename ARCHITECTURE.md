# Architecture modulaire de SAFE

## 1. Vue d’ensemble à trois niveaux
| Niveau | Rôle | Technologies suggérées |
|--------|------|------------------------|
| **Présentation** | Interface utilisateur – Web (React/TypeScript) et Desktop (Electron). | React, TypeScript, HTML/CSS, Electron, Vite/Webpack |
| **Application** | Logique métier, API REST, services internes. | Node.js + Express (ou .NET Core), TypeScript, JWT, validation, business services |
| **Données** | Persistance des données, gestion des schémas. | SQLite/PostgreSQL, Prisma/TypeORM, migrations SQL |

## 2. Structure de répertoires proposée
```
safe/
│   ARCHITECTURE.md      # Ce document
│   README.md            # Description du projet
│   package.json         # Dépendances racine (scripts build, start, lint…)
│
├─ src/
│   ├─ presentation/      # UI – code client
│   │   ├─ index.html
│   │   ├─ main.tsx        # point d’entrée React
│   │   └─ components/    # composants UI réutilisables
│   │
│   ├─ application/       # Backend – logique métier
│   │   ├─ server.ts       # serveur Express minimal
│   │   ├─ routes/         # routes REST (ex. /api/users)
│   │   └─ services/       # services métier (ex. AuthService)
│   │
│   └─ data/               # Persistance
│       ├─ prisma/          # schéma Prisma (ou TypeORM)
│       │   └─ schema.prisma
│       └─ migrations/      # scripts SQL de migration
│
├─ scripts/                # Outils de build / lint / test
│   └─ build.ps1           # script PowerShell de compilation
│
└─ .gitignore              # fichiers à ignorer
```

## 3. Points clés d’implémentation
- **Couche présentation** : le code tourne dans le navigateur ou via Electron. Elle ne touche jamais directement la base de données ; elle communique avec la couche application via des appels HTTP/HTTPS (fetch, axios).
- **Couche application** : expose une API RESTful (ou GraphQL) qui implémente la logique métier. Elle valide les entrées, applique les règles d’entreprise et orchestre les appels aux services de données.
- **Couche données** : utilise un ORM (Prisma, TypeORM) ou des requêtes SQL pures. Les migrations assurent l’évolution du schéma.
- **Sécurité** : authentification JWT, contrôle d’accès par rôle, chiffrement TLS (en production).
- **Déploiement** : Dockerfile unique qui lance le backend et le frontend (via `npm run build` puis `serve -s build`).

## 4. Exemple minimal de code
### `src/presentation/index.html`
```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Safe</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

### `src/presentation/main.tsx`
```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./components/App";

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(<React.StrictMode><App /></React.StrictMode>);
```

### `src/application/server.ts`
```ts
import express from "express";
import cors from "cors";
import routes from "./routes";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", routes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 API listening on http://localhost:${PORT}`));
```

### `src/data/prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:../data.db"
}

model User {
  id       Int    @id @default(autoincrement())
  email    String @unique
  name     String?
  password String
}
```

---
> **Prochaine étape** : ajouter les dépendances (`npm i react react-dom express prisma @prisma/client typescript`) et initialiser le projet (`npm init -y && npx prisma init`). Vous pouvez adapter les technologies (ex. .NET) si vous préférez un autre stack.

---
*Cette architecture repose sur une séparation claire de la **présentation**, de la **logique métier** et de la **persistance** pour faciliter la maintenabilité, l’évolutivité et les tests.*