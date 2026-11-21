# Commandes client et livraison depuis le stock

Les commandes client sont maintenant des documents de vente composés de lignes obligatoirement liées à des articles du référentiel de leur société. Leur création conserve le prix unitaire et le nom de l'article au moment de la commande. Les lignes de facture peuvent également référencer un article; ce lien reste facultatif pour préserver les prestations et les factures historiques.

Le parcours de livraison est explicite et idempotent:

1. `POST /api/sales/orders` crée une commande ouverte et ses lignes article.
2. `POST /api/sales/orders/:orderId/stock-pick` exige une sélection de dépôt pour chaque ligne et crée le bon via le service existant de préparation de stock. La commande et le bon sont associés dans un lien contrôlé par société; la préparation réserve le stock global et du dépôt.
3. `POST /api/sales/orders/:orderId/dispatch` confirme l'expédition avec la clé stable de la commande. Le service de stock existant décrémente les quantités globale et dépôt, et enregistre le mouvement; le statut de la commande passe à `DISPATCHED`.
4. `POST /api/sales/orders/:orderId/cancel` annule une commande ouverte ou préparée. Pour une commande préparée, le bon non expédié est annulé et la réservation libérée avant le changement de statut de la commande.
5. `GET /api/sales/orders` retourne les lignes, articles, bon de préparation et confirmation d'expédition pour le suivi.

La facturation n'est pas reliée aux commandes client dans ce workflow: aucune conversion commande-facture ni relation de persistance n'existe. La création et le suivi des factures restent un parcours séparé; une facture ne doit donc pas être générée automatiquement depuis une commande sans décision métier dédiée.

Une préparation exige et réserve atomiquement le stock disponible dans chaque dépôt choisi. La quantité physique n'est pas décrémentée à la préparation; les réservations globales et par dépôt empêchent qu'une autre commande, un transfert, un retour fournisseur ou une consommation de production utilise les mêmes unités. Seule la confirmation d'expédition décrémente le stock physique et consomme la réservation. L'annulation avant expédition libère la réservation sans mouvement physique ou comptable. Une commande déjà expédiée ne peut pas être annulée dans ce workflow.

Les commandes et préparations sont isolées par société. Les routes de préparation, d'expédition et d'annulation sont rejouables sans dupliquer une réservation, une libération ou un décrément. Les préparations en attente existant lors du déploiement sont reprises comme réservations par la migration additive `20261110160000_stock_reservations`.

## Limite transactionnelle

La création du bon et l'enregistrement du lien commande-bon restent deux transactions. Si l'écriture du lien échoue après création du bon, la réservation reste portée par le bon idempotent et peut être liée lors d'une reprise; si la commande est annulée entre-temps, la reprise libère le bon orphelin. L'expédition consomme la réservation et décrémente le stock dans une transaction Materials, puis met à jour le statut de la commande. Si cette dernière mise à jour échoue, une reprise réutilise la clé d'expédition sans nouvelle consommation. Quand le dispatch est confirmé mais que le statut de vente est encore `PICKED`, l'écran propose « Synchroniser le statut de la commande »: il rejoue le même endpoint idempotent.

Les tests de reprise simulent les échecs d'écriture du lien de commande après création idempotente du bon et de mise à jour de la commande après confirmation Materials. Ils vérifient la réutilisation des mêmes clés stables. L'annulation de commande annule d'abord atomiquement le bon non expédié et libère ses réservations; elle ne compense jamais un dispatch confirmé.

## Migration

La migration additive `src/data/prisma/migrations/20261110130000_sales_orders_stock_fulfillment/migration.sql` ajoute les lignes de commande, l'association sécurisée des préparations, les champs d'audit/devise requis et la référence d'article facultative des lignes de facture. Les anciennes commandes sont conservées; leur devise reste inconnue (chaîne vide) plutôt que d'inventer une devise, et leur identité d'auteur est marquée `legacy`.

Ne pas appliquer cette migration directement à une base métier depuis un poste de développement. Valider d'abord le parcours et la migration sur une copie de base dédiée (`npm run test:prisma-migrations`), vérifier l'état des migrations, puis sauvegarder la base SQLite avant tout déploiement autorisé. Les commandes Prisma CLI exigent une URL cible explicite (`SAFE_ERP_DATABASE_URL`); `npm run prisma:deploy` lance `prisma migrate deploy`. Une base préremplie sans historique `_prisma_migrations` exige une procédure de baseline vérifiée avant tout déploiement. Ne pas utiliser `prisma db push` ni l'ancien script de baseline pour contourner ce contrôle.
