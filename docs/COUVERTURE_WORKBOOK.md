# Couverture du classeur SAFE ERP

Registre ligne par ligne des trois feuilles Â« Ce qui manque Â», Â« Ce qui est
incomplet Â» et Â« IA Â» du classeur `SAFE_ERP_Recapitulatif_Complet.xlsx`.
Les statuts dÃ©crivent les capacitÃ©s vÃ©rifiÃ©es dans DRAFT2. Â« Configurable, dÃ©sactivÃ© Â» exige une
configuration administrable et une confirmation explicite, sans activer un
calcul ou connecteur dont les rÃ¨gles ou la source ne sont pas validÃ©es.

Le registre administrateur par entitÃ© et ses brouillons JSON sont maintenant
implÃ©mentÃ©s avec validation interactive sans sauvegarde, import/export JSON non
activant, historique versionnÃ© et restauration comme brouillon. La revue est
auditÃ©e et ne constitue jamais une activation; les capacitÃ©s sans moteur mÃ©tier
ou contrat validÃ© restent en mode configuration uniquement.

## RÃ¨gles fiscales multi-juridictions

DRAFT2 dispose dâ€™un modÃ¨le sÃ©parÃ© pour les juridictions hiÃ©rarchiques, rÃ¨gles,
taux, tranches, seuils, pÃ©riodes dâ€™effet et rÃ©fÃ©rences de sources. Le panneau
dâ€™administration permet de crÃ©er une rÃ¨gle ou une nouvelle version sans
remplacer lâ€™historique. Une rÃ¨gle `APPROVED_FOR_TESTING` est autorisÃ©e pour les
calculs de test Ã  la demande de lâ€™utilisateur, mais ce statut nâ€™est pas une
certification juridique et ne comptabilise aucune Ã©criture.

Le calcul gÃ©nÃ©rique ne traite actuellement que les mÃ©thodes forfaitaire,
progressive et par unitÃ©. Les mÃ©thodes Ã  seuil conditionnel, composÃ©es ou
formulaires restent bloquÃ©es tant que leur sÃ©mantique mÃ©tier nâ€™est pas
explicitement implÃ©mentÃ©e. Ce moteur nâ€™est pas encore branchÃ© aux anciens
parcours de paie/fiscalitÃ©; ceux-ci conservent leurs paramÃ¨tres nationaux
existants. La migration prÃ©serve les valeurs en place et rend les taux du profil
pays facultatifs afin quâ€™un profil Ã©tranger ne reÃ§oive pas par dÃ©faut les
paramÃ¨tres tunisiens.

Lâ€™initialisation additive de Â« SAFE Groupe Â» crÃ©e les quatre profils nationaux,
les quatre sociÃ©tÃ©s et leurs rattachements au groupe. Si le profil tunisien
nâ€™existe pas, seuls les paramÃ¨tres historiques `stampDuty=1` et
`corporateTax=20` du seed DRAFT2 sont repris; tout profil dÃ©jÃ  prÃ©sent reste
inchangÃ©. Les profils France, Ã‰tats-Unis et Ã‰mirats ne reÃ§oivent aucun taux
legacy par dÃ©faut. Le modÃ¨le accepte les juridictions locales amÃ©ricaines, mais
aucune rÃ¨gle fiscale Ã©trangÃ¨re nâ€™est encore chargÃ©e dans la base active. Les
sources officielles consultÃ©es sont partielles; les rÃ¨gles et taux/seuils
Ã©trangers restent Ã  sourcer et Ã  configurer. Le jeu SAFE Groupe limite les
juridictions amÃ©ricaines Ã  New York et Boston (avec leurs Ã‰tats parents
nÃ©cessaires); aucune autre localitÃ© amÃ©ricaine nâ€™est ajoutÃ©e.

Les participations Ã  100 % sont des donnÃ©es de dÃ©monstration modifiables. La
politique dâ€™Ã©limination reste `UNCONFIGURED`; aucun cours de change, compte,
Ã©criture, facture, donnÃ©e RH ou transaction intersociÃ©tÃ©s nâ€™est crÃ©Ã© par ce
script. Le groupe est donc une structure de dÃ©part, pas encore un jeu mÃ©tier
multi-module ni une consolidation calculable.

## Feuille 1 â€” Ce qui manque

| # | Exigence dÃ©taillÃ©e | Ã‰tat DRAFT2 |
|---|---|---|
| 1.1 | ModÃ¨le et suivi AT/ACT | Socle de rÃ©gimes et paramÃ¨tres livrÃ©. |
| 1.2 | Suivi des intrants sous admission temporaire | LivrÃ© dans le module de rÃ©gimes douaniers. |
| 1.3 | Calcul du taux de transformation | RÃ©fÃ©rences de formule, source, champs/unitÃ©s dâ€™entrÃ©e et rÃ©sultat administrables; aucune formule douaniÃ¨re nâ€™est supposÃ©e, calcul/export dÃ©sactivÃ©s jusquâ€™Ã  validation. |
| 1.4 | Fiches de stock douaniÃ¨res | Suivi fonctionnel livrÃ©; validitÃ© rÃ©glementaire dÃ©pend des tarifs importÃ©s et vÃ©rifiÃ©s. |
| 1.5 | Cautions et mainlevÃ©es | ModÃ¨le et suivi livrÃ©s; pas de valeur douaniÃ¨re fictive. |
| 1.6 | Ciblage textile, automobile et agroalimentaire | UI pointant vers le Tarif Web officiel 2026 (`https://www.douane.gov.tn/tarifweb2026/`) par code NGP 10 chiffres, import CSV si la Douane fournit un export, mapping, validation dates/assiettes, empreinte SHA-256, rejet dâ€™un fichier dÃ©jÃ  importÃ© et revue manuelle des brouillons. Aucun export public national ni barÃ¨me produit vÃ©rifiÃ© nâ€™a pu Ãªtre rÃ©cupÃ©rÃ©; aucun taux nâ€™est chargÃ© ou activÃ©. Lâ€™export dÃ©taillÃ© IDB de lâ€™OMC (lignes 8â€“10 chiffres) exige un accÃ¨s rÃ©servÃ© aux gouvernements membres/organisations autorisÃ©es; lâ€™ADB public est HS6 et combine plusieurs sources, donc impropre au chargement NGP. Lâ€™archive WITS fournie (20 184 lignes H6, flux Â« Gross Exports Â» 2024, valeur en USD) est une statistique commerciale, pas un tarif. |
| 2.1 | Shell PWA et cache hors ligne | LivrÃ©s. |
| 2.2 | Manifest installable mobile | LivrÃ©. |
| 2.3 | Saisie facture/BC hors ligne | Formulaire hors ligne de commandes client avec listes clients/articles chargÃ©es par API authentifiÃ©e et conservÃ©es en mÃ©moire seulement; saisie de plusieurs lignes, chiffrement AES-GCM/PBKDF2 dans IndexedDB entity-scoped, taille plafonnÃ©e Ã  256 Kio et limites configurÃ©es dâ€™Ã¢ge/nombre; phrase secrÃ¨te jamais persistÃ©e. Aucun cache de donnÃ©es API; aucune facture ou Ã©criture nâ€™est crÃ©Ã©e. |
| 2.4 | Synchronisation automatique | OpÃ©rationnel pour les commandes client uniquement aprÃ¨s activation explicite de la politique admin, dÃ©verrouillage local pendant la session et authentification normale: tant que lâ€™application reste ouverte, un brouillon crÃ©Ã© hors ligne est synchronisÃ© au retour du rÃ©seau. ClÃ© UUID idempotente, retry plafonnÃ© Ã  5 tentatives, rejet des clÃ©s rÃ©utilisÃ©es avec contenu diffÃ©rent et conflits conservÃ©s pour arbitrage manuel. AprÃ¨s fermeture ou rechargement, il faut dÃ©verrouiller puis synchroniser manuellement; les fournisseurs, factures et Ã©critures comptables ne sont pas synchronisÃ©s. |
| 2.5 | Notifications push dâ€™approbation | Politique dâ€™Ã©vÃ©nements dâ€™approbation, rÃ©fÃ©rences de clÃ©s/secrets, payload minimal et consentement utilisateur configurable; livraison dÃ©sactivÃ©e jusquâ€™Ã  intÃ©gration du fournisseur et de la gestion des abonnements. |
| 3.1 | ModÃ¨les de score client/fournisseur | Moteur administrable et snapshots versionnÃ©s livrÃ©s; activation aprÃ¨s configuration complÃ¨te et revue explicite. |
| 3.2 | Score basÃ© sur historique de paiement, dÃ©lais, litiges et encours | Mesures extraites de rÃ¨glements, litiges ouverts et exposition courante; plages, sens et pondÃ©rations restent administrables, sans valeurs mÃ©tier inventÃ©es. |
| 3.3 | Alertes sous un seuil configurable | Seuil administrable; alerte produite uniquement lors du calcul explicite dâ€™un score activÃ©. |
| 3.4 | Affichage sur fiches Client et Fournisseur | LivrÃ© dans les fiches client et fournisseur des modules CRM/Achats, avec alerte, version, date et indication historique/configuration actuelle; aucun score ne dÃ©clenche de dÃ©cision automatique. |
| 3.5 | Utilisation pour dÃ©cisions de crÃ©dit | Indicateur dâ€™aide seulement; aucune dÃ©cision automatique prÃ©vue. |
| 4.1 | Projets, tÃ¢ches, coÃ»ts et jalons | ModÃ¨les et suivi de projets livrÃ©s. |
| 4.2 | Budget prÃ©visionnel/rÃ©alisÃ© par projet | Suivi livrÃ©; mÃ©thodes dâ€™imputation restant configurables. |
| 4.3 | Imputation automatique des achats et main-dâ€™Å“uvre | Correspondances explicites sourceâ†’projet administrables et versionnÃ©es; calcul et comptabilisation dÃ©sactivÃ©s, revue humaine obligatoire. |
| 4.4 | Marge prÃ©visionnelle en temps rÃ©el | Les rÃ©fÃ©rences de coÃ»ts/projets peuvent Ãªtre prÃ©parÃ©es, mais le calcul de marge reste dÃ©sactivÃ© faute de rÃ¨gles dâ€™imputation/validation. |
| 4.5 | Facturation Ã  lâ€™avancement | RÃ©fÃ©rences projet/jalon/article/montant configurables; aucun calcul de montant, gÃ©nÃ©ration ou comptabilisation de facture nâ€™est activÃ©. |
| 5.1 | AO, documents, cautions | Suivi des marchÃ©s et cautions livrÃ©. |
| 5.2 | Portail TUNEPS | Profil configurÃ© avec coffre serveur AES-256-GCM des identifiants, mapping/aperÃ§u sandbox synthÃ©tique, suppression et vÃ©rification de prÃ©requis. Statut `NOT_CONNECTED`; aucun appel rÃ©seau ni activation tant que le contrat officiel (authentification, API/format) manque. |
| 5.3 | Checklist de piÃ¨ces administratives | PiÃ¨ces requises configurables par appel dâ€™offres, avec statut, rÃ©fÃ©rence et date de validitÃ©. |
| 5.4 | Cautions provisoires et dÃ©finitives | Suivi manuel livrÃ©; calcul automatique Ã  paramÃ©trer selon dossier. |
| 5.5 | Historique gains/pertes par donneur dâ€™ordre | RÃ©sumÃ© des appels dâ€™offres attribuÃ©s/non retenus par autoritÃ©; aucun score ou taux de rÃ©ussite prÃ©sumÃ©. |
| 6.1 | Direction RTL conditionnelle | Bascule de document et dâ€™interface selon la langue; arabe en RTL, franÃ§ais en LTR. |
| 6.2 | Traduction arabe de lâ€™interface | Choix initial FR/EN/AR sur lâ€™Ã©cran de connexion, mÃ©morisÃ© sur lâ€™appareil et modifiable ensuite; `lang`/`dir` appliquÃ©s au dÃ©marrage et RTL pour lâ€™arabe. Le test vÃ©rifie 862 libellÃ©s littÃ©raux sur 27 vues en anglais et arabe. Dâ€™autres composants `*Panel.tsx`, les messages serveur inconnus et certains textes non enveloppÃ©s ne sont pas encore dans cette couverture et peuvent rester en franÃ§ais. |
| 6.3 | Texte arabe et chiffres LTR bidirectionnels | Direction RTL hÃ©ritÃ©e; champs numÃ©riques/date forcÃ©s en LTR pour prÃ©server lâ€™ordre des chiffres. |
| 6.4 | PDF bilingues franÃ§ais/arabe | Export gÃ©nÃ©rique imprimable livrÃ© avec langue FR/EN/AR, direction RTL en arabe, valeurs Ã©chappÃ©es et donnÃ©es/chiffres isolÃ©s en bidi. Il est explicitement marquÃ© Â« document de travail / non certifiÃ© Â»; les exports rÃ©glementaires DGI/CNSS restent dÃ©sactivÃ©s faute de gabarits officiels validÃ©s. Certains exports de modules secondaires utilisent encore le franÃ§ais par dÃ©faut. |

## Feuille 2 â€” Ce qui est incomplet

| # | Exigence dÃ©taillÃ©e | Ã‰tat DRAFT2 |
|---|---|---|
| 1.1 | Passerelle IA local/cloud et sÃ©lection du fournisseur | Passerelle branchÃ©e Ã  lâ€™assistant de synthÃ¨se financiÃ¨re: Gemini est principal, Groq secours si les deux clÃ©s sont configurÃ©es. Activation serveur, opt-in agrÃ©gÃ© et consentement utilisateur par demande sont tous exigÃ©s. Ã‰vÃ©nements dâ€™audit append-only par demande, avec acteur, entitÃ©, route, consentement et statut sans prompt ni secret; le journal est fail-closed. Le routage ne sâ€™Ã©tend pas aux autres tÃ¢ches IA. |
| 1.2 | Fallback cloud automatique en panne/RAM | OpÃ©rationnel pour la synthÃ¨se financiÃ¨re agrÃ©gÃ©e uniquement: sous 2,5 GiB libres, cloud dâ€™abord; sinon local dâ€™abord puis cloud si le local Ã©choue. Un Ã©chec rÃ©seau/cloud revient au local; le rÃ©sultat indique tout changement de route. Les donnÃ©es sensibles et toute demande sans intention fixe restent locales, sans fallback cloud. |
| 1.3 | Anonymisation avant envoi cloud | Pas dâ€™anonymiseur gÃ©nÃ©rique: lâ€™envoi utilise une liste blanche de totaux POSTED, pÃ©riodes, devise, nombres de lignes et intention prÃ©dÃ©finie; le texte libre, dÃ©tails de comptes, noms, factures, paie et identifiants sont exclus. |
| 2.1 | OCR facture numÃ©risÃ©e via modÃ¨le local | OCR PDF numÃ©risÃ© local via Tesseract franÃ§ais; PDF texte et .xlsx lus localement. Le fichier nâ€™est pas persistÃ© par le service dâ€™analyse. |
| 2.2 | Interface glisser-dÃ©poser OCR | Glisser-dÃ©poser et sÃ©lection de fichiers PDF/.xlsx; limites de type et 8 Mo validÃ©es cÃ´tÃ© interface et API. |
| 2.3 | Extraction fournisseur, date, montants et lignes | Champs fournisseur/numÃ©ro/date affichÃ©s; lignes et montants prÃ©sentÃ©s en suggestions Ã  vÃ©rifier, avec extrait source et justification. |
| 2.4 | PrÃ©remplissage Ã©criture comptable | Non livrÃ©; les suggestions restent consultatives et aucune Ã©criture nâ€™est crÃ©Ã©e ni prÃ©remplie automatiquement. |
| 3.1 | Enrichir prÃ©vision par ML | RÃ©fÃ©rence de modÃ¨le et politique de source locale configurables; exÃ©cution ML inactive. PrÃ©vision dÃ©terministe existante conservÃ©e. |
| 3.2 | Analyser historiques | Source explicitement limitÃ©e aux transactions locales comptabilisÃ©es; prÃ©paration de modÃ¨le inactive. |
| 3.3 | Horizons 30/60/90 jours | Horizons configurables/validÃ©s Ã  30, 60, 90 jours; aucune prÃ©vision ML nâ€™est calculÃ©e. |
| 3.4 | Alerte de risque de dÃ©couvert | Seuil positif/nÃ©gatif et devise fournis par lâ€™administrateur; revue humaine requise, aucune alerte automatique ni action activÃ©e. |
| 4.1 | Couche IA par-dessus dÃ©tection dÃ©terministe | RÃ©fÃ©rences de modÃ¨le, mesures et rÃ¨gle de comparaison configurables; couche explicative locale inactive. |
| 4.2 | Comparer les montants Ã  lâ€™historique fournisseur | RÃ©fÃ©rences de mesures, pÃ©riode et Ã©chantillon minimum configurables; aucune dÃ©tection autonome active. |
| 4.3 | Arbre de raisons auditable | RÃ©fÃ©rence de rÃ¨gle conservÃ©e dans la configuration; une explication complÃ¨te nâ€™est pas produite tant que le moteur dâ€™anomalies reste dÃ©sactivÃ©. |
| 5.1 | PDF G50 au format DGI | AperÃ§u local non officiel des correspondances G50 configurÃ©es; modÃ¨le DGI et export Ã  valider avec source officielle. Identifiants DGI Ã©ventuellement saisis conservÃ©s dans le coffre chiffrÃ©, sans connexion active. |
| 5.2 | DÃ©claration annuelle employeur | Gabarit versionnÃ© et aperÃ§u local des correspondances configurables; export dÃ©sactivÃ© jusquâ€™Ã  vÃ©rification officielle. |
| 5.3 | Bordereau CNSS | Profil CNSS versionnÃ©, identifiants conservÃ©s dans le coffre AES-256-GCM et mapping configurable; format, taux et export dÃ©sactivÃ©s jusquâ€™Ã  validation officielle. |
| 5.4 | PrÃ©remplissage automatique | Les correspondances sont administrables, mais aucun prÃ©remplissage ni export officiel nâ€™est activÃ©; revue humaine requise. |
| 6.1 | SHA-256 sur Ã©criture validÃ©e | LivrÃ©. |
| 6.2 | ChaÃ®ne hash N liÃ©e Ã  N-1 | LivrÃ©. |
| 6.3 | VÃ©rification dâ€™intÃ©gritÃ© | LivrÃ©e. |
| 6.4 | ConformitÃ© FEC/audit fiscal | Non revendiquÃ©e par la seule chaÃ®ne cryptographique. |
| 7.1 | Matching montant, libellÃ© et date | Candidats locaux limitÃ©s au mÃªme compte, date et montant exacts; libellÃ© normalisÃ© signalÃ© et candidats concordants prÃ©sentÃ©s en premier. Confirmation manuelle uniquement. |
| 7.2 | Taux automatique supÃ©rieur Ã  85 % | Exigence de rÃ©sultat non garantie; aucun seuil de rÃ©ussite inventÃ©. |
| 7.3 | Suggestions dâ€™Ã©critures non rapprochÃ©es | Suggestions dâ€™Ã©critures POSTED non rapprochÃ©es, explicables par montant/date/compte/libellÃ©; rapprochement toujours confirmÃ© par un humain et aucune Ã©criture modifiÃ©e. |
| 7.4 | Import MT940/OFX | Import OFX/QFX/MT940 livrÃ©. |
| 8.1 | Kanban pipeline CRM | LivrÃ©. |
| 8.2 | Conversion devis â†’ commande â†’ facture | LivrÃ©: acceptation documentÃ©e, association manuelle ligne/article, commande entity-scoped et idempotente, lien de conversion atomique; la commande utilise le parcours existant vers facture Ã  contrÃ´ler. |
| 8.3 | Relances automatiques programmables | Politique administrable et validable (fuseau, horaire, cadence, seuils et modÃ¨les paramÃ©trÃ©s); prÃ©paration uniquement en brouillon. Le scheduler et lâ€™envoi restent dÃ©sactivÃ©s tant quâ€™un moteur et le canal autorisÃ© ne sont pas livrÃ©s. |
| 8.4 | Score client dans sa fiche | LivrÃ©: derniÃ¨re mesure affichÃ©e dans la fiche client, avec alerte, version et horodatage; les scores historiques sont identifiÃ©s si la configuration nâ€™est plus confirmÃ©e ou a changÃ©. |
| 9.1 | CoÃ»t par produit/service en temps rÃ©el | Vue dâ€™Ã©cart unitaire indicative livrÃ©e; coÃ»t rÃ©el complet Ã  complÃ©ter. |
| 9.2 | Ventilation matiÃ¨res, main-dâ€™Å“uvre, frais gÃ©nÃ©raux | Correspondances de coÃ»ts et bases rÃ©fÃ©rencÃ©es administrables; aucune clÃ© de rÃ©partition ou formule nâ€™est fournie ni exÃ©cutÃ©e. |
| 9.3 | Comparaison prix de vente/coÃ»t et marge unitaire | Ã€ complÃ©ter sans inventer clÃ©s de rÃ©partition. |
| 9.4 | ClÃ©s de rÃ©partition configurables | RÃ©fÃ©rences de base configurables par composante; calcul non comptabilisÃ© et dÃ©sactivÃ© jusquâ€™Ã  validation des rÃ¨gles. |
| 10.1 | Score de santÃ© /100 | Score configurable et versionnÃ© activable aprÃ¨s revue; mesure manuelle obligatoire, plages/sens/poids/seuil explicitement fournis. |
| 10.2 | LiquiditÃ©, solvabilitÃ©, rentabilitÃ©, BFR, dÃ©lais de paiement | Les cinq mesures sont configurÃ©es et saisies explicitement avec rÃ©fÃ©rence de source; aucune extraction ou formule financiÃ¨re implicite. |
| 10.3 | Jauge dashboard | Jauge 0â€“100 affichÃ©e au tableau de bord aprÃ¨s calcul explicite; ne montre que le dernier snapshot dont la configuration versionnÃ©e est encore active et confirmÃ©e. |
| 10.4 | Historique mensuel | Snapshots versionnÃ©s historisÃ©s Ã  chaque calcul explicite; pas de calcul mensuel automatique ni dâ€™Ã©chÃ©ancier. |
| 11.1 | Mentions MF/RNE/code TVA sur facture PDF | Ã€ complÃ©ter; format lÃ©gal Ã  valider et champs source Ã  configurer. |
| 11.2 | Timbre selon paiement en espÃ¨ces | ParamÃ¨tres existants; dÃ©clenchement et rÃ¨gle lÃ©gale Ã  valider/configurer. |
| 11.3 | PrÃ©paration API DGI e-facturation | Profil DGI, coffre chiffrÃ©, validation locale du contrat et aperÃ§u synthÃ©tique des mappings. Endpoint, authentification et schÃ©mas officiels Ã  confirmer; statut `NOT_CONNECTED`, aucun appel rÃ©seau et aucune valeur secrÃ¨te exposÃ©e. |
| 12.1 | Champs de vÃ©hicule (immatriculation, km, carburant) | LivrÃ© : immatriculation entity-scoped et unique, compteur kilomÃ©trique monotone, type de carburant, assurance, prochaines Ã©chÃ©ances et affectation. Tests API, service, validation et intÃ©gration couvrent ces donnÃ©es; consommations/ravitaillements ne sont pas inclus dans cette ligne du classeur. |
| 12.2 | Alerte prÃ©ventive date/km | Seuils de prÃ©avis date/km configurables et soumis Ã  revue humaine; le canal dâ€™alerte et le dÃ©clenchement anticipÃ© restent dÃ©sactivÃ©s tant que le runtime nâ€™est pas livrÃ©. Les alertes dues existantes continuent de signaler les Ã©chÃ©ances dÃ©passÃ©es. |
| 12.3 | CoÃ»t/km par vÃ©hicule | LivrÃ© comme indicateur conditionnel non comptabilisÃ©. |
| 12.4 | Affectation vÃ©hicule/employÃ© | ModÃ¨le dâ€™affectation existant; lot flotte livrÃ©. |

## Feuille 3 â€” IA

### A. 10 tÃ¢ches de routage

| # | TÃ¢che du classeur | Ã‰tat DRAFT2 |
|---|---|---|
| A1 | OCR factures | Local Tesseract/PDF.js, sÃ©lection ou glisser-dÃ©poser; aucun fallback cloud. |
| A2 | Classification comptable | Parcours actifs locaux; aucun flux de classification nâ€™est branchÃ© au cloud. |
| A3 | Suggestions dâ€™imputation | Suggestions locales explicables depuis les donnÃ©es et le plan comptable de lâ€™entitÃ©; aucune Ã©criture automatique. |
| A4 | Rapports en langage naturel | SynthÃ¨se financiÃ¨re de pÃ©riode opÃ©rationnelle: Ollama local prioritaire au-dessus de 2,5 GiB; Gemini/Groq ne reÃ§oivent que les agrÃ©gats et lâ€™intention prÃ©dÃ©finie aprÃ¨s opt-ins serveur et utilisateur. DonnÃ©es de compte, sociÃ©tÃ©, question libre, factures et autres donnÃ©es sensibles non transmises. |
| A5 | PrÃ©diction trÃ©sorerie | Politique de modÃ¨le local, source POSTED, horizons et seuil explicites configurables; exÃ©cution inactive et aucun cloud. |
| A6 | DÃ©tection anomalies | Politique locale de mesures/pÃ©riode/rÃ¨gle configurable; moteur et actions automatiques inactifs. |
| A7 | Scoring client/fournisseur | Score local calculÃ© depuis les donnÃ©es internes; aucune transmission cloud. ParamÃ¨tres administrables, activation contrÃ´lÃ©e, sans dÃ©cision automatique. |
| A8 | Rapprochement bancaire IA | Suggestion dÃ©terministe locale fondÃ©e sur montant/date/compte exacts et signalement du libellÃ©; pas dâ€™IA gÃ©nÃ©rative, dâ€™auto-rapprochement ou dâ€™Ã©criture modifiÃ©e. |
| A9 | Chatbot aide utilisateur | Traitement local; aucun transfert cloud branchÃ©. |
| A10 | VÃ©rification piste dâ€™audit | VÃ©rification dÃ©terministe locale livrÃ©e; aucun envoi cloud. |

### B. 5 critÃ¨res de basculement

| # | CritÃ¨re | Ã‰tat DRAFT2 |
|---|---|---|
| B1 | SensibilitÃ© des donnÃ©es | Le seul appel cloud actif est construit Ã  partir dâ€™agrÃ©gats comptables et dâ€™une intention fixe; les classes sensibles ou les intentions inconnues ne produisent pas de requÃªte cloud. |
| B2 | ForÃ§age par utilisateur | Case de consentement sÃ©parÃ©e, par demande et liÃ©e au texte/pÃ©riode/entity UI; lâ€™API transmet le boolÃ©en et le service force le local si absent. Activation serveur et consentement agrÃ©gÃ© restent Ã©galement obligatoires. |
| B3 | DisponibilitÃ© Ollama | Si le local Ã©choue pour une synthÃ¨se agrÃ©gÃ©e consentie, Gemini puis Groq peuvent Ãªtre utilisÃ©s; Ã©chec cloud revient au local. Aucun fallback cloud pour les autres tÃ¢ches/donnÃ©es. |
| B4 | RAM disponible et seuil de 2 500 Mo | RAM libre du serveur lue via `freemem()`: <2,5 GiB choisit le cloud dâ€™abord uniquement pour une synthÃ¨se consentie; Ã  partir de 2,5 GiB le local est prioritaire. Lâ€™Ã©chec cloud revient au local. |
| B5 | Ã‰chec dâ€™un provider/quota | Gemini est essayÃ© en premier; Groq est secours si configurÃ©. Si Groq Ã©choue, lâ€™appel cloud Ã©choue; le routeur revient au local lorsque celui-ci nâ€™a pas dÃ©jÃ  Ã©chouÃ©. |

### C. 6 scÃ©narios de basculement

| # | ScÃ©nario du classeur | Ã‰tat DRAFT2 |
|---|---|---|
| C1 | OCR local normal | Parcours OCR Ã  complÃ©ter; le traitement doit rester local. |
| C2 | Ollama arrÃªtÃ© puis fallback cloud | SynthÃ¨se agrÃ©gÃ©e consentie: bascule Gemini puis Groq; donnÃ©es sensibles et parcours non branchÃ©s restent locaux. Tests fournisseurs simulÃ©s, aucun appel rÃ©seau de test. |
| C3 | RAM sous 2 500 Mo puis fallback cloud | RAM rÃ©elle cÃ´tÃ© serveur infÃ©rieure Ã  2,5 GiB sÃ©lectionne le cloud pour la synthÃ¨se agrÃ©gÃ©e uniquement, aprÃ¨s le consentement utilisateur et les opt-ins serveur. |
| C4 | Internet absent puis fallback local | Pas de cloud initiÃ©; parcours local indÃ©pendant. |
| C5 | Quota cloud Ã©puisÃ© puis fallback local | Aucun provider cloud utilisÃ©. |
| C6 | Tous les providers Ã©chouent | Erreur explicite; ne pas fabriquer de rÃ©sultat ni fallback rÃ©seau. |

### D. 10 actions de fichiers/dÃ©pendances

| # | Action du classeur | Ã‰tat DRAFT2 |
|---|---|---|
| D1 | `ai/gateway.ts` | Passerelle Gemini/Groq HTTPS rÃ©elle pour le seul parcours de synthÃ¨se agrÃ©gÃ©e autorisÃ©; endpoints fixes, clÃ©s en en-tÃªtes, `no-store` et dÃ©lai maximal de 30 s. La version TLS nÃ©gociÃ©e nâ€™est pas garantie par lâ€™application. |
| D2 | `ai/gemini.ts` | Client Gemini rÃ©el intÃ©grÃ©; Gemini reste obligatoire comme principal, Groq est optionnel et utilisÃ© en secours. Aucun coÃ»t nul ou quota permanent nâ€™est garanti. |
| D3 | `ai/anonymizer.ts` | Pas dâ€™anonymiseur gÃ©nÃ©rique ni de rÃ©identification: une liste blanche transmet seulement les agrÃ©gats autorisÃ©s et une intention prÃ©dÃ©finie; aucune donnÃ©e sensible nâ€™est envoyÃ©e. |
| D4 | Modifier `ai/service.ts` | Le service conserve le texte libre localement, audite les Ã©vÃ©nements de demande sans prompt/hash/secret et refuse le traitement si lâ€™Ã©criture initiale dâ€™audit Ã©choue. |
| D5 | Endpoints OCR/classify/score | Endpoint dâ€™analyse OCR et scores configurables existants; aucune sortie rÃ©seau cloud. |
| D6 | DÃ©pendance `@google/genai` | Non ajoutÃ©e; inutile sans intÃ©gration cloud autorisÃ©e. |
| D7 | `AiOcrPanel.tsx` | CapacitÃ© prÃ©sente dans `AiInvoiceAnalysisPanel.tsx`; glisser-dÃ©poser ajoutÃ© et provider rÃ©el affichÃ©. |
| D8 | Provider affichÃ© dans Decision Support | Provider utilisÃ© et bascule/fallback visibles dans le parcours dâ€™analyse financiÃ¨re; provider Ollama est aussi affichÃ© dans le rÃ©sultat OCR. |
| D9 | PrÃ©vision ML | RÃ©fÃ©rence et paramÃ¨tres locaux administrables/inactifs, sans formule prÃ©dictive inventÃ©e ni cloud. |
| D10 | DÃ©tection IA | RÃ©fÃ©rences de mesures et de rÃ¨gle configurables/inactives; aucune action automatique ni rÃ©sultat non expliquÃ©. |

Les taux, formules fiscales, scores et critÃ¨res de conformitÃ© non Ã©tablis par une
source fiable ne sont pas dÃ©duits du classeur. Une configuration sauvegardÃ©e ne
constitue ni une validation rÃ©glementaire ni une autorisation de transfert.

### ContrÃ´les de sources officielles

- Douane tunisienne : la page officielle Tarif Web 2026 est rÃ©fÃ©rencÃ©e Ã  `https://www.douane.gov.tn/tarifweb2026/` et dÃ©crit un service de consultation du tarif en vigueur. Lâ€™index public indique une mise Ã  jour le 17 juin 2025. Lâ€™accÃ¨s direct a Ã©chouÃ© au niveau transport/DNS/TLS dans cet environnement; les recherches ciblÃ©es nâ€™ont pas trouvÃ© dâ€™export CSV/Excel public. Le panneau renvoie vers cette page et ne devine pas dâ€™endpoint ni de paramÃ¨tres de recherche.
- OMC : `https://ttd.wto.org/en/download/idb` documente un tÃ©lÃ©chargement de donnÃ©es de tarifs appliquÃ©s/prÃ©fÃ©rentiels aux lignes nationales de 8 Ã  10 chiffres, mais rÃ©serve lâ€™accÃ¨s aux gouvernements membres et organisations internationales autorisÃ©es. Le tÃ©lÃ©chargement ADB dÃ©crit sur le site public est HS6 et agrÃ¨ge des sources OMC et externes; il nâ€™est pas utilisÃ© comme tarif tunisien NGP.
- Archive fournie via WITS : le CSV `DataJobID-3208543_3208543_PurchaseManager.csv` est limitÃ© aux exportations tunisiennes 2024 en nomenclature H6. Il ne contient aucun taux tarifaire; le lien de tÃ©lÃ©chargement WITS redirige vers lâ€™authentification.
- Le parcours tarifaire public WITS/UNCTAD TRAINS est `https://wits.worldbank.org/tariff/trains/en/country/TUN`. La documentation WITS confirme que le rÃ©sultat est harmonisÃ© HS6 et correspond Ã  une moyenne des lignes nationales sous chaque HS6; ce nâ€™est donc pas un tarif individuel NGP Ã  10 chiffres et il nâ€™est pas chargÃ© dans SAFE.
- MinistÃ¨re des Finances (`https://www.finances.gov.tn/fr`) : page publique accessible avec lois et FAQ, mais aucun barÃ¨me NGP exhaustif ou contrat dâ€™API tarifaire nâ€™y a Ã©tÃ© exposÃ© pendant cette vÃ©rification.
- DGI (`https://www.impots.finances.gov.tn/`) : lâ€™accÃ¨s a Ã©chouÃ© au niveau transport/DNS/TLS; aucun endpoint e-facture ou format dâ€™Ã©change ne peut Ãªtre confirmÃ©.
- TUNEPS (`https://www.tuneps.tn/` et `/portal/`) : pages servies comme Ã©cran de chargement, sans documentation de protocole exploitable.
- CNSS (`https://www.cnss.tn/`) : portail officiel accessible, avec liens vers des services web de dÃ©claration et paiement, mais sans schÃ©ma dâ€™API ou format dâ€™Ã©change dâ€™intÃ©gration publique vÃ©rifiable dans les pages consultÃ©es.

En consÃ©quence, aucun export public appropriÃ© nâ€™a Ã©tÃ© trouvÃ© et aucun taux
produit nâ€™a Ã©tÃ© chargÃ©. Il faut obtenir un export de la Douane ou un accÃ¨s
autorisÃ© Ã  lâ€™IDB, puis vÃ©rifier sa version et sa couverture avant import. Les
connecteurs ont un onboarding local avec coffre dâ€™identifiants
chiffrÃ© et aperÃ§u sandbox, mais restent `NOT_CONNECTED`; aucun identifiant nâ€™est
fourni dans ce dÃ©pÃ´t, aucune requÃªte rÃ©elle nâ€™est faite et lâ€™activation dÃ©pend
encore de contrats officiels vÃ©rifiables.
