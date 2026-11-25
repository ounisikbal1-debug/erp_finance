# Projets et chantiers

Le module conserve des projets cloisonnÃ©s par entitÃ© avec budget, montant contractuel, tÃ¢ches, jalons et coÃ»ts saisis par lâ€™utilisateur. Le rÃ©sumÃ© compare le budget aux coÃ»ts enregistrÃ©s et affiche le montant contractuel moins ces coÃ»ts; il ne sâ€™agit pas dâ€™une marge comptable officielle.

Les catÃ©gories de coÃ»ts sont MatiÃ¨res, Main-dâ€™Å“uvre, Frais gÃ©nÃ©raux et Autre. Elles ne sont pas automatiquement imputÃ©es depuis les achats, les ordres de production ou la paie. Les rapprochements automatisÃ©s et la facturation Ã  lâ€™avancement restent Ã  traiter.

Les routes sont exposÃ©es sous `/api/projects`; lâ€™accÃ¨s est rÃ©servÃ© aux rÃ´les administrateur et responsable financier. Tests ciblÃ©s: `npm run test:projects`.
