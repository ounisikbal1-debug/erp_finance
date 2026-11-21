# Suivi des coûts d’entretien de flotte

À la clôture d’une intervention véhicule, l’utilisateur peut saisir le coût réellement constaté dans la devise fonctionnelle de l’entité et le kilométrage du compteur. Les deux valeurs sont facultatives, mais doivent être saisies ensemble; le kilométrage enregistré ne peut pas diminuer le compteur déjà connu. Les interventions sur les équipements non-véhicules ne prennent pas ces données.

Le coût moyen par kilomètre n’est affiché que si toutes les interventions clôturées du véhicule disposent d’un coût, d’une devise et d’un relevé kilométrique, si plusieurs relevés sont disponibles et si la distance entre le premier et le dernier est positive. Le premier relevé sert de référence; seuls les coûts des interventions suivantes sont rapportés à la distance parcourue depuis cette référence. Le résultat est un indicateur basé sur les coûts saisis, pas un coût complet de possession: le carburant et les dépenses non saisies en sont exclus. Aucune valeur n’est estimée en cas de données manquantes.

Ces enregistrements restent un suivi opérationnel et ne créent aucune écriture comptable.
