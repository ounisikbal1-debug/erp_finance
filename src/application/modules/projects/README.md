# Projets et chantiers

Le module conserve des projets cloisonnés par entité avec budget, montant contractuel, tâches, jalons et coûts saisis par l’utilisateur. Le résumé compare le budget aux coûts enregistrés et affiche le montant contractuel moins ces coûts; il ne s’agit pas d’une marge comptable officielle.

Les catégories de coûts sont Matières, Main-d’œuvre, Frais généraux et Autre. Elles ne sont pas automatiquement imputées depuis les achats, les ordres de production ou la paie. Les rapprochements automatisés et la facturation à l’avancement restent à traiter.

Les routes sont exposées sous `/api/projects`; l’accès est réservé aux rôles administrateur et responsable financier. Tests ciblés: `npm run test:projects`.
