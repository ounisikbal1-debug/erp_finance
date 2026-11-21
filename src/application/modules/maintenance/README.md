# Registre de maintenance

Le module gère les équipements par entité et les ordres d’intervention préventive ou corrective. Les ordres suivent les transitions `PLANNED → IN_PROGRESS → COMPLETED`; un ordre planifié ou en cours peut être annulé depuis le tableau. Une intervention ne peut être planifiée que sur un équipement actif de la même entité.

Les interventions planifiées ou en cours dont l’échéance est passée sont signalées comme en retard dans le tableau et dans un compteur. Les interventions terminées ou annulées ne sont pas considérées en retard. Le panneau actualise l’indicateur chaque minute.

Le registre peut aussi identifier un équipement comme véhicule et conserver son immatriculation, son compteur kilométrique, son type de carburant, l’échéance d’assurance, les seuils de prochaine maintenance et un salarié affecté. Les alertes affichées signalent une maintenance échue par date ou kilométrage et une assurance expirée. Les salariés et affectations sont limités à l’entité active; une mise à jour du compteur ne peut pas le faire diminuer. Le module ne calcule pas encore de coût par kilomètre et ne suit pas les consommations/ravitaillements.

Les routes sont exposées sous `/api/maintenance`. Tests d’acceptation synthétiques: `npm run test:maintenance`. Le test de persistance SQLite ne s’exécute qu’avec `NODE_ENV=test` et `SAFE_ERP_TEST_DATABASE_URL` configuré pour une base dédiée.
