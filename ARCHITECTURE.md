# Architecture modulaire de SAFE

## 1. Vue dâ€™ensemble Ã  trois niveaux
| Niveau | RÃ´le | Technologies suggÃ©rÃ©es |
|--------|------|------------------------|
| **PrÃ©sentation** | Interface utilisateur â€“ Web (React/TypeScript) et Desktop (Electron). | React, TypeScript, HTML/CSS, Electron, Vite/Webpack |
| **Application** | Logique mÃ©tier, API REST, services internes. | Node.jsâ€¯+â€¯Express (ou .NETâ€¯Core), TypeScript, JWT, validation, business services |
| **DonnÃ©es** | Persistance des donnÃ©es, gestion des schÃ©mas. | SQLite/PostgreSQL, Prisma/TypeORM, migrations SQL |

## 2. Structure de rÃ©pertoires proposÃ©e
```
safe/
â”‚   ARCHITECTURE.md      # Ce document
â”‚   README.md            # Description du projet
â”‚   package.json         # DÃ©pendances racine (scripts build, start, lintâ€¦)
â”‚
â”œâ”€ src/
â”‚   â”œâ”€ presentation/      # UI â€“ code client
â”‚   â”‚   â”œâ”€ index.html
â”‚   â”‚   â”œâ”€ main.tsx        # point dâ€™entrÃ©e React
â”‚   â”‚   â””â”€ components/    # composants UI rÃ©utilisables
â”‚   â”‚
â”‚   â”œâ”€ application/       # Backend â€“ logique mÃ©tier
â”‚   â”‚   â”œâ”€ server.ts       # serveur Express minimal
â”‚   â”‚   â”œâ”€ routes/         # routes REST (ex. /api/users)
â”‚   â”‚   â””â”€ services/       # services mÃ©tier (ex. AuthService)
â”‚   â”‚
â”‚   â””â”€ data/               # Persistance
â”‚       â”œâ”€ prisma/          # schÃ©ma Prisma (ou TypeORM)
â”‚       â”‚   â””â”€ schema.prisma
â”‚       â””â”€ migrations/      # scripts SQL de migration
â”‚
â”œâ”€ scripts/                # Outils de build / lint / test
â”‚   â””â”€ build.ps1           # script PowerShell de compilation
â”‚
â””â”€ .gitignore              # fichiers Ã  ignorer
```

## 3. Points clÃ©s dâ€™implÃ©mentation
- **Couche prÃ©sentation**â€¯: le code tourne dans le navigateur ou via Electron. Elle ne touche jamais directement la base de donnÃ©esâ€¯; elle communique avec la couche application via des appels HTTP/HTTPS (fetch, axios).
- **Couche application**â€¯: expose une API RESTful (ou GraphQL) qui implÃ©mente la logique mÃ©tier. Elle valide les entrÃ©es, applique les rÃ¨gles dâ€™entreprise et orchestre les appels aux services de donnÃ©es.
- **Couche donnÃ©es**â€¯: utilise un ORM (Prisma, TypeORM) ou des requÃªtes SQL pures. Les migrations assurent lâ€™Ã©volution du schÃ©ma.
- **SÃ©curitÃ©**â€¯: authentification JWT, contrÃ´le dâ€™accÃ¨s par rÃ´le, chiffrement TLS (en production).
- **DÃ©ploiement**â€¯: Dockerfile unique qui lance le backend et le frontend (via `npm run build` puis `serve -s build`).

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
app.listen(PORT, () => console.log(`ðŸš€ API listening on http://localhost:${PORT}`));
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
> **Prochaine Ã©tape**â€¯: ajouter les dÃ©pendances (`npm i react react-dom express prisma @prisma/client typescript`) et initialiser le projet (`npm init -y && npx prisma init`). Vous pouvez adapter les technologies (ex. .NET) si vous prÃ©fÃ©rez un autre stack.

---
*Cette architecture repose sur une sÃ©paration claire de la **prÃ©sentation**, de la **logique mÃ©tier** et de la **persistance** pour faciliter la maintenabilitÃ©, lâ€™Ã©volutivitÃ© et les tests.*
