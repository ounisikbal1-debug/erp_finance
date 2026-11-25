# Commandes client et livraison depuis le stock

Les commandes client sont maintenant des documents de vente composÃ©s de lignes obligatoirement liÃ©es Ã  des articles du rÃ©fÃ©rentiel de leur sociÃ©tÃ©. Leur crÃ©ation conserve le prix unitaire et le nom de l'article au moment de la commande. Les lignes de facture peuvent Ã©galement rÃ©fÃ©rencer un article; ce lien reste facultatif pour prÃ©server les prestations et les factures historiques.

Le parcours de livraison est explicite et idempotent:

1. `POST /api/sales/orders` crÃ©e une commande ouverte et ses lignes article.
2. `POST /api/sales/orders/:orderId/stock-pick` exige une sÃ©lection de dÃ©pÃ´t pour chaque ligne et crÃ©e le bon via le service existant de prÃ©paration de stock. La commande et le bon sont associÃ©s dans un lien contrÃ´lÃ© par sociÃ©tÃ©; la prÃ©paration rÃ©serve le stock global et du dÃ©pÃ´t.
3. `POST /api/sales/orders/:orderId/dispatch` confirme l'expÃ©dition avec la clÃ© stable de la commande. Le service de stock existant dÃ©crÃ©mente les quantitÃ©s globale et dÃ©pÃ´t, et enregistre le mouvement; le statut de la commande passe Ã  `DISPATCHED`.
4. `POST /api/sales/orders/:orderId/cancel` annule une commande ouverte ou prÃ©parÃ©e. Pour une commande prÃ©parÃ©e, le bon non expÃ©diÃ© est annulÃ© et la rÃ©servation libÃ©rÃ©e avant le changement de statut de la commande.
5. `GET /api/sales/orders` retourne les lignes, articles, bon de prÃ©paration et confirmation d'expÃ©dition pour le suivi.

La facturation n'est pas reliÃ©e aux commandes client dans ce workflow: aucune conversion commande-facture ni relation de persistance n'existe. La crÃ©ation et le suivi des factures restent un parcours sÃ©parÃ©; une facture ne doit donc pas Ãªtre gÃ©nÃ©rÃ©e automatiquement depuis une commande sans dÃ©cision mÃ©tier dÃ©diÃ©e.

Une prÃ©paration exige et rÃ©serve atomiquement le stock disponible dans chaque dÃ©pÃ´t choisi. La quantitÃ© physique n'est pas dÃ©crÃ©mentÃ©e Ã  la prÃ©paration; les rÃ©servations globales et par dÃ©pÃ´t empÃªchent qu'une autre commande, un transfert, un retour fournisseur ou une consommation de production utilise les mÃªmes unitÃ©s. Seule la confirmation d'expÃ©dition dÃ©crÃ©mente le stock physique et consomme la rÃ©servation. L'annulation avant expÃ©dition libÃ¨re la rÃ©servation sans mouvement physique ou comptable. Une commande dÃ©jÃ  expÃ©diÃ©e ne peut pas Ãªtre annulÃ©e dans ce workflow.

Les commandes et prÃ©parations sont isolÃ©es par sociÃ©tÃ©. Les routes de prÃ©paration, d'expÃ©dition et d'annulation sont rejouables sans dupliquer une rÃ©servation, une libÃ©ration ou un dÃ©crÃ©ment. Les prÃ©parations en attente existant lors du dÃ©ploiement sont reprises comme rÃ©servations par la migration additive `20261110160000_stock_reservations`.

## Limite transactionnelle

La crÃ©ation du bon et l'enregistrement du lien commande-bon restent deux transactions. Si l'Ã©criture du lien Ã©choue aprÃ¨s crÃ©ation du bon, la rÃ©servation reste portÃ©e par le bon idempotent et peut Ãªtre liÃ©e lors d'une reprise; si la commande est annulÃ©e entre-temps, la reprise libÃ¨re le bon orphelin. L'expÃ©dition consomme la rÃ©servation et dÃ©crÃ©mente le stock dans une transaction Materials, puis met Ã  jour le statut de la commande. Si cette derniÃ¨re mise Ã  jour Ã©choue, une reprise rÃ©utilise la clÃ© d'expÃ©dition sans nouvelle consommation. Quand le dispatch est confirmÃ© mais que le statut de vente est encore `PICKED`, l'Ã©cran propose Â« Synchroniser le statut de la commande Â»: il rejoue le mÃªme endpoint idempotent.

Les tests de reprise simulent les Ã©checs d'Ã©criture du lien de commande aprÃ¨s crÃ©ation idempotente du bon et de mise Ã  jour de la commande aprÃ¨s confirmation Materials. Ils vÃ©rifient la rÃ©utilisation des mÃªmes clÃ©s stables. L'annulation de commande annule d'abord atomiquement le bon non expÃ©diÃ© et libÃ¨re ses rÃ©servations; elle ne compense jamais un dispatch confirmÃ©.

## Migration

La migration additive `src/data/prisma/migrations/20261110130000_sales_orders_stock_fulfillment/migration.sql` ajoute les lignes de commande, l'association sÃ©curisÃ©e des prÃ©parations, les champs d'audit/devise requis et la rÃ©fÃ©rence d'article facultative des lignes de facture. Les anciennes commandes sont conservÃ©es; leur devise reste inconnue (chaÃ®ne vide) plutÃ´t que d'inventer une devise, et leur identitÃ© d'auteur est marquÃ©e `legacy`.

Ne pas appliquer cette migration directement Ã  une base mÃ©tier depuis un poste de dÃ©veloppement. Valider d'abord le parcours et la migration sur une copie de base dÃ©diÃ©e (`npm run test:prisma-migrations`), vÃ©rifier l'Ã©tat des migrations, puis sauvegarder la base SQLite avant tout dÃ©ploiement autorisÃ©. Les commandes Prisma CLI exigent une URL cible explicite (`SAFE_ERP_DATABASE_URL`); `npm run prisma:deploy` lance `prisma migrate deploy`. Une base prÃ©remplie sans historique `_prisma_migrations` exige une procÃ©dure de baseline vÃ©rifiÃ©e avant tout dÃ©ploiement. Ne pas utiliser `prisma db push` ni l'ancien script de baseline pour contourner ce contrÃ´le.
