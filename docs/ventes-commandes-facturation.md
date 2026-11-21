# Commandes client et facturation

Une commande client ne peut créer sa facture qu’après confirmation de son expédition et du dispatch de stock correspondant. Le flux crée une seule facture brouillon à contrôler par commande. La relation, l’utilisateur créateur et un événement de workflow conservent la traçabilité; une répétition retourne la facture liée au lieu d’en créer une autre.

Les quantités, prix unitaires et articles proviennent des lignes de commande. Le taux de TVA doit être choisi pour chaque ligne parmi les taux configurés pour le pays. Le calcul du HT, de la TVA, du droit de timbre et du TTC est celui du workflow de facturation existant; le HT de la facture est contrôlé contre le total de la commande. Le droit de timbre et les comptes de vente restent issus de la configuration existante.

Ce flux n’établit pas la conformité fiscale ou réglementaire de ces configurations, les mentions obligatoires, les délais de conservation, la numérotation officielle ou le traitement des livraisons partielles. Les taux configurés, le timbre et les règles applicables doivent être validés par les experts avant tout usage de production. Une commande expédiée est facturée en totalité; la facturation partielle et les avoirs ne sont pas couverts par ce lien.
