# Consolidation et contrÃ´le de groupe

Le calcul de pÃ©riode utilise les Ã©critures `POSTED` des sociÃ©tÃ©s membres et conserve un rÃ©sultat de groupe consultable avec ses diagnostics. Avant de produire des lignes consolidÃ©es, il vÃ©rifie notamment que chaque Ã©criture comptable de chaque sociÃ©tÃ© est Ã©quilibrÃ©e au millime dans sa devise locale. Deux erreurs qui se compenseraient entre filiales ne suffisent donc pas Ã  valider le groupe.

Le calcul reste bloquÃ© si le pÃ©rimÃ¨tre est incomplet, si des comptes utilisÃ©s ne sont pas mappÃ©s, si un taux requis manque, si les comptes groupe mÃ©langent des types incompatibles, si une Ã©criture est invalide ou dÃ©sÃ©quilibrÃ©e, si le total dÃ©bit/crÃ©dit converti ne sâ€™Ã©quilibre pas, ou si le traitement des Ã©liminations nâ€™a pas Ã©tÃ© explicitement traitÃ©.

Deux mÃ©thodes configurables sont disponibles par membre : **intÃ©gration globale**, qui inclut 100 % des soldes (le pourcentage de participation reste informatif), et **quote-part proportionnelle**, qui applique mÃ©caniquement le pourcentage enregistrÃ© aux dÃ©bits et crÃ©dits de chaque ligne, arrondis au millime, puis convertit les montants Ã  lâ€™aide du taux de pÃ©riode validÃ©. Le pourcentage doit Ãªtre positif, infÃ©rieur ou Ã©gal Ã  100 % et prÃ©cis au milliÃ¨me de point. Il sâ€™agit dâ€™une hypothÃ¨se fonctionnelle explicite, non dâ€™une prescription comptable; lâ€™utilisateur doit choisir la mÃ©thode et valider la participation.

Les Ã©liminations ne sont pas dÃ©duites automatiquement : il faut soit confirmer explicitement leur absence pour la pÃ©riode, soit prÃ©parer et faire approuver les ajustements manuels. Les taux de conversion doivent Ãªtre saisis avec une date appartenant Ã  la pÃ©riode dÃ©clarÃ©e et une source. Les intÃ©rÃªts minoritaires, les conversions de goodwill et les mÃ©thodes equity ne sont pas calculÃ©s.

Le rÃ©sultat affichÃ© peut Ãªtre tÃ©lÃ©chargÃ© en CSV UTF-8. Il contient la pÃ©riode, le statut, la devise de reporting, les lignes calculÃ©es et les diagnostics. Un rÃ©sultat bloquÃ© nâ€™exporte aucune ligne de calcul; seuls ses motifs de blocage sont inclus.

## PÃ©rimÃ¨tres distincts non pris en charge

- **IntÃ©rÃªts minoritaires** : Ã  traiter sÃ©parÃ©ment de lâ€™intÃ©gration proportionnelle, avec une base de calcul et les comptes de prÃ©sentation groupe dÃ©finis explicitement. CritÃ¨res dâ€™acceptation : les parts groupe et minoritaire sont prÃ©sentÃ©es distinctement Ã  partir des participations validÃ©es; les cas de participation Ã  100 % et de participation minoritaire sont testÃ©s; les donnÃ©es ou mappings manquants bloquent le rapport au lieu dâ€™Ãªtre estimÃ©s.

Les participations ne sont pas datÃ©es par pÃ©riode dans le modÃ¨le actuel; une Ã©volution de participation au cours de lâ€™exercice exige des donnÃ©es effectives datÃ©es et un changement de persistance, Ã  coordonner avant toute migration. Aucune rÃ¨gle ni Ã©criture nâ€™est inventÃ©e implicitement. SAFE ne revendique ni certification ni conformitÃ© non vÃ©rifiÃ©e; toute rÃ¨gle comptable faisant autoritÃ© doit Ãªtre validÃ©e par un expert.
