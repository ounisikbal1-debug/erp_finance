# Commandes client et facturation

Une commande client ne peut crÃ©er sa facture quâ€™aprÃ¨s confirmation de son expÃ©dition et du dispatch de stock correspondant. Le flux crÃ©e une seule facture brouillon Ã  contrÃ´ler par commande. La relation, lâ€™utilisateur crÃ©ateur et un Ã©vÃ©nement de workflow conservent la traÃ§abilitÃ©; une rÃ©pÃ©tition retourne la facture liÃ©e au lieu dâ€™en crÃ©er une autre.

Les quantitÃ©s, prix unitaires et articles proviennent des lignes de commande. Le taux de TVA doit Ãªtre choisi pour chaque ligne parmi les taux configurÃ©s pour le pays. Le calcul du HT, de la TVA, du droit de timbre et du TTC est celui du workflow de facturation existant; le HT de la facture est contrÃ´lÃ© contre le total de la commande. Le droit de timbre et les comptes de vente restent issus de la configuration existante.

Ce flux nâ€™Ã©tablit pas la conformitÃ© fiscale ou rÃ©glementaire de ces configurations, les mentions obligatoires, les dÃ©lais de conservation, la numÃ©rotation officielle ou le traitement des livraisons partielles. Les taux configurÃ©s, le timbre et les rÃ¨gles applicables doivent Ãªtre validÃ©s par les experts avant tout usage de production. Une commande expÃ©diÃ©e est facturÃ©e en totalitÃ©; la facturation partielle et les avoirs ne sont pas couverts par ce lien.
