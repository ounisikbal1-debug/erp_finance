# Registre de maintenance

Le module gÃ¨re les Ã©quipements par entitÃ© et les ordres dâ€™intervention prÃ©ventive ou corrective. Les ordres suivent les transitions `PLANNED â†’ IN_PROGRESS â†’ COMPLETED`; un ordre planifiÃ© ou en cours peut Ãªtre annulÃ© depuis le tableau. Une intervention ne peut Ãªtre planifiÃ©e que sur un Ã©quipement actif de la mÃªme entitÃ©.

Les interventions planifiÃ©es ou en cours dont lâ€™Ã©chÃ©ance est passÃ©e sont signalÃ©es comme en retard dans le tableau et dans un compteur. Les interventions terminÃ©es ou annulÃ©es ne sont pas considÃ©rÃ©es en retard. Le panneau actualise lâ€™indicateur chaque minute.

Le registre peut aussi identifier un Ã©quipement comme vÃ©hicule et conserver son immatriculation, son compteur kilomÃ©trique, son type de carburant, lâ€™Ã©chÃ©ance dâ€™assurance, les seuils de prochaine maintenance et un salariÃ© affectÃ©. Les alertes affichÃ©es signalent une maintenance Ã©chue par date ou kilomÃ©trage et une assurance expirÃ©e. Les salariÃ©s et affectations sont limitÃ©s Ã  lâ€™entitÃ© active; une mise Ã  jour du compteur ne peut pas le faire diminuer. Le module ne calcule pas encore de coÃ»t par kilomÃ¨tre et ne suit pas les consommations/ravitaillements.

Les routes sont exposÃ©es sous `/api/maintenance`. Tests dâ€™acceptation synthÃ©tiques: `npm run test:maintenance`. Le test de persistance SQLite ne sâ€™exÃ©cute quâ€™avec `NODE_ENV=test` et `SAFE_ERP_TEST_DATABASE_URL` configurÃ© pour une base dÃ©diÃ©e.
