# Consolidation et contrôle de groupe

Le calcul de période utilise les écritures `POSTED` des sociétés membres et conserve un résultat de groupe consultable avec ses diagnostics. Avant de produire des lignes consolidées, il vérifie notamment que chaque écriture comptable de chaque société est équilibrée au millime dans sa devise locale. Deux erreurs qui se compenseraient entre filiales ne suffisent donc pas à valider le groupe.

Le calcul reste bloqué si le périmètre est incomplet, si des comptes utilisés ne sont pas mappés, si un taux requis manque, si les comptes groupe mélangent des types incompatibles, si une écriture est invalide ou déséquilibrée, si le total débit/crédit converti ne s’équilibre pas, ou si le traitement des éliminations n’a pas été explicitement traité.

Deux méthodes configurables sont disponibles par membre : **intégration globale**, qui inclut 100 % des soldes (le pourcentage de participation reste informatif), et **quote-part proportionnelle**, qui applique mécaniquement le pourcentage enregistré aux débits et crédits de chaque ligne, arrondis au millime, puis convertit les montants à l’aide du taux de période validé. Le pourcentage doit être positif, inférieur ou égal à 100 % et précis au millième de point. Il s’agit d’une hypothèse fonctionnelle explicite, non d’une prescription comptable; l’utilisateur doit choisir la méthode et valider la participation.

Les éliminations ne sont pas déduites automatiquement : il faut soit confirmer explicitement leur absence pour la période, soit préparer et faire approuver les ajustements manuels. Les taux de conversion doivent être saisis avec une date appartenant à la période déclarée et une source. Les intérêts minoritaires, les conversions de goodwill et les méthodes equity ne sont pas calculés.

Le résultat affiché peut être téléchargé en CSV UTF-8. Il contient la période, le statut, la devise de reporting, les lignes calculées et les diagnostics. Un résultat bloqué n’exporte aucune ligne de calcul; seuls ses motifs de blocage sont inclus.

## Périmètres distincts non pris en charge

- **Intérêts minoritaires** : à traiter séparément de l’intégration proportionnelle, avec une base de calcul et les comptes de présentation groupe définis explicitement. Critères d’acceptation : les parts groupe et minoritaire sont présentées distinctement à partir des participations validées; les cas de participation à 100 % et de participation minoritaire sont testés; les données ou mappings manquants bloquent le rapport au lieu d’être estimés.

Les participations ne sont pas datées par période dans le modèle actuel; une évolution de participation au cours de l’exercice exige des données effectives datées et un changement de persistance, à coordonner avant toute migration. Aucune règle ni écriture n’est inventée implicitement. SAFE ne revendique ni certification ni conformité non vérifiée; toute règle comptable faisant autorité doit être validée par un expert.
