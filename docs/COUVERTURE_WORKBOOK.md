# Couverture du classeur SAFE ERP

Registre ligne par ligne des trois feuilles « Ce qui manque », « Ce qui est
incomplet » et « IA » du classeur `SAFE_ERP_Recapitulatif_Complet.xlsx`.
Les statuts décrivent les capacités vérifiées dans DRAFT2. « Configurable, désactivé » exige une
configuration administrable et une confirmation explicite, sans activer un
calcul ou connecteur dont les règles ou la source ne sont pas validées.

Le registre administrateur par entité et ses brouillons JSON sont maintenant
implémentés avec validation interactive sans sauvegarde, import/export JSON non
activant, historique versionné et restauration comme brouillon. La revue est
auditée et ne constitue jamais une activation; les capacités sans moteur métier
ou contrat validé restent en mode configuration uniquement.

## Règles fiscales multi-juridictions

DRAFT2 dispose d’un modèle séparé pour les juridictions hiérarchiques, règles,
taux, tranches, seuils, périodes d’effet et références de sources. Le panneau
d’administration permet de créer une règle ou une nouvelle version sans
remplacer l’historique. Une règle `APPROVED_FOR_TESTING` est autorisée pour les
calculs de test à la demande de l’utilisateur, mais ce statut n’est pas une
certification juridique et ne comptabilise aucune écriture.

Le calcul générique ne traite actuellement que les méthodes forfaitaire,
progressive et par unité. Les méthodes à seuil conditionnel, composées ou
formulaires restent bloquées tant que leur sémantique métier n’est pas
explicitement implémentée. Ce moteur n’est pas encore branché aux anciens
parcours de paie/fiscalité; ceux-ci conservent leurs paramètres nationaux
existants. La migration préserve les valeurs en place et rend les taux du profil
pays facultatifs afin qu’un profil étranger ne reçoive pas par défaut les
paramètres tunisiens.

L’initialisation additive de « SAFE Groupe » crée les quatre profils nationaux,
les quatre sociétés et leurs rattachements au groupe. Si le profil tunisien
n’existe pas, seuls les paramètres historiques `stampDuty=1` et
`corporateTax=20` du seed DRAFT2 sont repris; tout profil déjà présent reste
inchangé. Les profils France, États-Unis et Émirats ne reçoivent aucun taux
legacy par défaut. Le modèle accepte les juridictions locales américaines, mais
aucune règle fiscale étrangère n’est encore chargée dans la base active. Les
sources officielles consultées sont partielles; les règles et taux/seuils
étrangers restent à sourcer et à configurer. Le jeu SAFE Groupe limite les
juridictions américaines à New York et Boston (avec leurs États parents
nécessaires); aucune autre localité américaine n’est ajoutée.

Les participations à 100 % sont des données de démonstration modifiables. La
politique d’élimination reste `UNCONFIGURED`; aucun cours de change, compte,
écriture, facture, donnée RH ou transaction intersociétés n’est créé par ce
script. Le groupe est donc une structure de départ, pas encore un jeu métier
multi-module ni une consolidation calculable.

## Feuille 1 — Ce qui manque

| # | Exigence détaillée | État DRAFT2 |
|---|---|---|
| 1.1 | Modèle et suivi AT/ACT | Socle de régimes et paramètres livré. |
| 1.2 | Suivi des intrants sous admission temporaire | Livré dans le module de régimes douaniers. |
| 1.3 | Calcul du taux de transformation | Références de formule, source, champs/unités d’entrée et résultat administrables; aucune formule douanière n’est supposée, calcul/export désactivés jusqu’à validation. |
| 1.4 | Fiches de stock douanières | Suivi fonctionnel livré; validité réglementaire dépend des tarifs importés et vérifiés. |
| 1.5 | Cautions et mainlevées | Modèle et suivi livrés; pas de valeur douanière fictive. |
| 1.6 | Ciblage textile, automobile et agroalimentaire | UI pointant vers le Tarif Web officiel 2026 (`https://www.douane.gov.tn/tarifweb2026/`) par code NGP 10 chiffres, import CSV si la Douane fournit un export, mapping, validation dates/assiettes, empreinte SHA-256, rejet d’un fichier déjà importé et revue manuelle des brouillons. Aucun export public national ni barème produit vérifié n’a pu être récupéré; aucun taux n’est chargé ou activé. L’export détaillé IDB de l’OMC (lignes 8–10 chiffres) exige un accès réservé aux gouvernements membres/organisations autorisées; l’ADB public est HS6 et combine plusieurs sources, donc impropre au chargement NGP. L’archive WITS fournie (20 184 lignes H6, flux « Gross Exports » 2024, valeur en USD) est une statistique commerciale, pas un tarif. |
| 2.1 | Shell PWA et cache hors ligne | Livrés. |
| 2.2 | Manifest installable mobile | Livré. |
| 2.3 | Saisie facture/BC hors ligne | Formulaire hors ligne de commandes client avec listes clients/articles chargées par API authentifiée et conservées en mémoire seulement; saisie de plusieurs lignes, chiffrement AES-GCM/PBKDF2 dans IndexedDB entity-scoped, taille plafonnée à 256 Kio et limites configurées d’âge/nombre; phrase secrète jamais persistée. Aucun cache de données API; aucune facture ou écriture n’est créée. |
| 2.4 | Synchronisation automatique | Opérationnel pour les commandes client uniquement après activation explicite de la politique admin, déverrouillage local pendant la session et authentification normale: tant que l’application reste ouverte, un brouillon créé hors ligne est synchronisé au retour du réseau. Clé UUID idempotente, retry plafonné à 5 tentatives, rejet des clés réutilisées avec contenu différent et conflits conservés pour arbitrage manuel. Après fermeture ou rechargement, il faut déverrouiller puis synchroniser manuellement; les fournisseurs, factures et écritures comptables ne sont pas synchronisés. |
| 2.5 | Notifications push d’approbation | Politique d’événements d’approbation, références de clés/secrets, payload minimal et consentement utilisateur configurable; livraison désactivée jusqu’à intégration du fournisseur et de la gestion des abonnements. |
| 3.1 | Modèles de score client/fournisseur | Moteur administrable et snapshots versionnés livrés; activation après configuration complète et revue explicite. |
| 3.2 | Score basé sur historique de paiement, délais, litiges et encours | Mesures extraites de règlements, litiges ouverts et exposition courante; plages, sens et pondérations restent administrables, sans valeurs métier inventées. |
| 3.3 | Alertes sous un seuil configurable | Seuil administrable; alerte produite uniquement lors du calcul explicite d’un score activé. |
| 3.4 | Affichage sur fiches Client et Fournisseur | Livré dans les fiches client et fournisseur des modules CRM/Achats, avec alerte, version, date et indication historique/configuration actuelle; aucun score ne déclenche de décision automatique. |
| 3.5 | Utilisation pour décisions de crédit | Indicateur d’aide seulement; aucune décision automatique prévue. |
| 4.1 | Projets, tâches, coûts et jalons | Modèles et suivi de projets livrés. |
| 4.2 | Budget prévisionnel/réalisé par projet | Suivi livré; méthodes d’imputation restant configurables. |
| 4.3 | Imputation automatique des achats et main-d’œuvre | Correspondances explicites source→projet administrables et versionnées; calcul et comptabilisation désactivés, revue humaine obligatoire. |
| 4.4 | Marge prévisionnelle en temps réel | Les références de coûts/projets peuvent être préparées, mais le calcul de marge reste désactivé faute de règles d’imputation/validation. |
| 4.5 | Facturation à l’avancement | Références projet/jalon/article/montant configurables; aucun calcul de montant, génération ou comptabilisation de facture n’est activé. |
| 5.1 | AO, documents, cautions | Suivi des marchés et cautions livré. |
| 5.2 | Portail TUNEPS | Profil configuré avec coffre serveur AES-256-GCM des identifiants, mapping/aperçu sandbox synthétique, suppression et vérification de prérequis. Statut `NOT_CONNECTED`; aucun appel réseau ni activation tant que le contrat officiel (authentification, API/format) manque. |
| 5.3 | Checklist de pièces administratives | Pièces requises configurables par appel d’offres, avec statut, référence et date de validité. |
| 5.4 | Cautions provisoires et définitives | Suivi manuel livré; calcul automatique à paramétrer selon dossier. |
| 5.5 | Historique gains/pertes par donneur d’ordre | Résumé des appels d’offres attribués/non retenus par autorité; aucun score ou taux de réussite présumé. |
| 6.1 | Direction RTL conditionnelle | Bascule de document et d’interface selon la langue; arabe en RTL, français en LTR. |
| 6.2 | Traduction arabe de l’interface | Choix initial FR/EN/AR sur l’écran de connexion, mémorisé sur l’appareil et modifiable ensuite; `lang`/`dir` appliqués au démarrage et RTL pour l’arabe. Le test vérifie 862 libellés littéraux sur 27 vues en anglais et arabe. D’autres composants `*Panel.tsx`, les messages serveur inconnus et certains textes non enveloppés ne sont pas encore dans cette couverture et peuvent rester en français. |
| 6.3 | Texte arabe et chiffres LTR bidirectionnels | Direction RTL héritée; champs numériques/date forcés en LTR pour préserver l’ordre des chiffres. |
| 6.4 | PDF bilingues français/arabe | Export générique imprimable livré avec langue FR/EN/AR, direction RTL en arabe, valeurs échappées et données/chiffres isolés en bidi. Il est explicitement marqué « document de travail / non certifié »; les exports réglementaires DGI/CNSS restent désactivés faute de gabarits officiels validés. Certains exports de modules secondaires utilisent encore le français par défaut. |

## Feuille 2 — Ce qui est incomplet

| # | Exigence détaillée | État DRAFT2 |
|---|---|---|
| 1.1 | Passerelle IA local/cloud et sélection du fournisseur | Passerelle branchée à l’assistant de synthèse financière: Gemini est principal, Groq secours si les deux clés sont configurées. Activation serveur, opt-in agrégé et consentement utilisateur par demande sont tous exigés. Événements d’audit append-only par demande, avec acteur, entité, route, consentement et statut sans prompt ni secret; le journal est fail-closed. Le routage ne s’étend pas aux autres tâches IA. |
| 1.2 | Fallback cloud automatique en panne/RAM | Opérationnel pour la synthèse financière agrégée uniquement: sous 2,5 GiB libres, cloud d’abord; sinon local d’abord puis cloud si le local échoue. Un échec réseau/cloud revient au local; le résultat indique tout changement de route. Les données sensibles et toute demande sans intention fixe restent locales, sans fallback cloud. |
| 1.3 | Anonymisation avant envoi cloud | Pas d’anonymiseur générique: l’envoi utilise une liste blanche de totaux POSTED, périodes, devise, nombres de lignes et intention prédéfinie; le texte libre, détails de comptes, noms, factures, paie et identifiants sont exclus. |
| 2.1 | OCR facture numérisée via modèle local | OCR PDF numérisé local via Tesseract français; PDF texte et .xlsx lus localement. Le fichier n’est pas persisté par le service d’analyse. |
| 2.2 | Interface glisser-déposer OCR | Glisser-déposer et sélection de fichiers PDF/.xlsx; limites de type et 8 Mo validées côté interface et API. |
| 2.3 | Extraction fournisseur, date, montants et lignes | Champs fournisseur/numéro/date affichés; lignes et montants présentés en suggestions à vérifier, avec extrait source et justification. |
| 2.4 | Préremplissage écriture comptable | Non livré; les suggestions restent consultatives et aucune écriture n’est créée ni préremplie automatiquement. |
| 3.1 | Enrichir prévision par ML | Référence de modèle et politique de source locale configurables; exécution ML inactive. Prévision déterministe existante conservée. |
| 3.2 | Analyser historiques | Source explicitement limitée aux transactions locales comptabilisées; préparation de modèle inactive. |
| 3.3 | Horizons 30/60/90 jours | Horizons configurables/validés à 30, 60, 90 jours; aucune prévision ML n’est calculée. |
| 3.4 | Alerte de risque de découvert | Seuil positif/négatif et devise fournis par l’administrateur; revue humaine requise, aucune alerte automatique ni action activée. |
| 4.1 | Couche IA par-dessus détection déterministe | Références de modèle, mesures et règle de comparaison configurables; couche explicative locale inactive. |
| 4.2 | Comparer les montants à l’historique fournisseur | Références de mesures, période et échantillon minimum configurables; aucune détection autonome active. |
| 4.3 | Arbre de raisons auditable | Référence de règle conservée dans la configuration; une explication complète n’est pas produite tant que le moteur d’anomalies reste désactivé. |
| 5.1 | PDF G50 au format DGI | Aperçu local non officiel des correspondances G50 configurées; modèle DGI et export à valider avec source officielle. Identifiants DGI éventuellement saisis conservés dans le coffre chiffré, sans connexion active. |
| 5.2 | Déclaration annuelle employeur | Gabarit versionné et aperçu local des correspondances configurables; export désactivé jusqu’à vérification officielle. |
| 5.3 | Bordereau CNSS | Profil CNSS versionné, identifiants conservés dans le coffre AES-256-GCM et mapping configurable; format, taux et export désactivés jusqu’à validation officielle. |
| 5.4 | Préremplissage automatique | Les correspondances sont administrables, mais aucun préremplissage ni export officiel n’est activé; revue humaine requise. |
| 6.1 | SHA-256 sur écriture validée | Livré. |
| 6.2 | Chaîne hash N liée à N-1 | Livré. |
| 6.3 | Vérification d’intégrité | Livrée. |
| 6.4 | Conformité FEC/audit fiscal | Non revendiquée par la seule chaîne cryptographique. |
| 7.1 | Matching montant, libellé et date | Candidats locaux limités au même compte, date et montant exacts; libellé normalisé signalé et candidats concordants présentés en premier. Confirmation manuelle uniquement. |
| 7.2 | Taux automatique supérieur à 85 % | Exigence de résultat non garantie; aucun seuil de réussite inventé. |
| 7.3 | Suggestions d’écritures non rapprochées | Suggestions d’écritures POSTED non rapprochées, explicables par montant/date/compte/libellé; rapprochement toujours confirmé par un humain et aucune écriture modifiée. |
| 7.4 | Import MT940/OFX | Import OFX/QFX/MT940 livré. |
| 8.1 | Kanban pipeline CRM | Livré. |
| 8.2 | Conversion devis → commande → facture | Livré: acceptation documentée, association manuelle ligne/article, commande entity-scoped et idempotente, lien de conversion atomique; la commande utilise le parcours existant vers facture à contrôler. |
| 8.3 | Relances automatiques programmables | Politique administrable et validable (fuseau, horaire, cadence, seuils et modèles paramétrés); préparation uniquement en brouillon. Le scheduler et l’envoi restent désactivés tant qu’un moteur et le canal autorisé ne sont pas livrés. |
| 8.4 | Score client dans sa fiche | Livré: dernière mesure affichée dans la fiche client, avec alerte, version et horodatage; les scores historiques sont identifiés si la configuration n’est plus confirmée ou a changé. |
| 9.1 | Coût par produit/service en temps réel | Vue d’écart unitaire indicative livrée; coût réel complet à compléter. |
| 9.2 | Ventilation matières, main-d’œuvre, frais généraux | Correspondances de coûts et bases référencées administrables; aucune clé de répartition ou formule n’est fournie ni exécutée. |
| 9.3 | Comparaison prix de vente/coût et marge unitaire | À compléter sans inventer clés de répartition. |
| 9.4 | Clés de répartition configurables | Références de base configurables par composante; calcul non comptabilisé et désactivé jusqu’à validation des règles. |
| 10.1 | Score de santé /100 | Score configurable et versionné activable après revue; mesure manuelle obligatoire, plages/sens/poids/seuil explicitement fournis. |
| 10.2 | Liquidité, solvabilité, rentabilité, BFR, délais de paiement | Les cinq mesures sont configurées et saisies explicitement avec référence de source; aucune extraction ou formule financière implicite. |
| 10.3 | Jauge dashboard | Jauge 0–100 affichée au tableau de bord après calcul explicite; ne montre que le dernier snapshot dont la configuration versionnée est encore active et confirmée. |
| 10.4 | Historique mensuel | Snapshots versionnés historisés à chaque calcul explicite; pas de calcul mensuel automatique ni d’échéancier. |
| 11.1 | Mentions MF/RNE/code TVA sur facture PDF | À compléter; format légal à valider et champs source à configurer. |
| 11.2 | Timbre selon paiement en espèces | Paramètres existants; déclenchement et règle légale à valider/configurer. |
| 11.3 | Préparation API DGI e-facturation | Profil DGI, coffre chiffré, validation locale du contrat et aperçu synthétique des mappings. Endpoint, authentification et schémas officiels à confirmer; statut `NOT_CONNECTED`, aucun appel réseau et aucune valeur secrète exposée. |
| 12.1 | Champs de véhicule (immatriculation, km, carburant) | Livré : immatriculation entity-scoped et unique, compteur kilométrique monotone, type de carburant, assurance, prochaines échéances et affectation. Tests API, service, validation et intégration couvrent ces données; consommations/ravitaillements ne sont pas inclus dans cette ligne du classeur. |
| 12.2 | Alerte préventive date/km | Seuils de préavis date/km configurables et soumis à revue humaine; le canal d’alerte et le déclenchement anticipé restent désactivés tant que le runtime n’est pas livré. Les alertes dues existantes continuent de signaler les échéances dépassées. |
| 12.3 | Coût/km par véhicule | Livré comme indicateur conditionnel non comptabilisé. |
| 12.4 | Affectation véhicule/employé | Modèle d’affectation existant; lot flotte livré. |

## Feuille 3 — IA

### A. 10 tâches de routage

| # | Tâche du classeur | État DRAFT2 |
|---|---|---|
| A1 | OCR factures | Local Tesseract/PDF.js, sélection ou glisser-déposer; aucun fallback cloud. |
| A2 | Classification comptable | Parcours actifs locaux; aucun flux de classification n’est branché au cloud. |
| A3 | Suggestions d’imputation | Suggestions locales explicables depuis les données et le plan comptable de l’entité; aucune écriture automatique. |
| A4 | Rapports en langage naturel | Synthèse financière de période opérationnelle: Ollama local prioritaire au-dessus de 2,5 GiB; Gemini/Groq ne reçoivent que les agrégats et l’intention prédéfinie après opt-ins serveur et utilisateur. Données de compte, société, question libre, factures et autres données sensibles non transmises. |
| A5 | Prédiction trésorerie | Politique de modèle local, source POSTED, horizons et seuil explicites configurables; exécution inactive et aucun cloud. |
| A6 | Détection anomalies | Politique locale de mesures/période/règle configurable; moteur et actions automatiques inactifs. |
| A7 | Scoring client/fournisseur | Score local calculé depuis les données internes; aucune transmission cloud. Paramètres administrables, activation contrôlée, sans décision automatique. |
| A8 | Rapprochement bancaire IA | Suggestion déterministe locale fondée sur montant/date/compte exacts et signalement du libellé; pas d’IA générative, d’auto-rapprochement ou d’écriture modifiée. |
| A9 | Chatbot aide utilisateur | Traitement local; aucun transfert cloud branché. |
| A10 | Vérification piste d’audit | Vérification déterministe locale livrée; aucun envoi cloud. |

### B. 5 critères de basculement

| # | Critère | État DRAFT2 |
|---|---|---|
| B1 | Sensibilité des données | Le seul appel cloud actif est construit à partir d’agrégats comptables et d’une intention fixe; les classes sensibles ou les intentions inconnues ne produisent pas de requête cloud. |
| B2 | Forçage par utilisateur | Case de consentement séparée, par demande et liée au texte/période/entity UI; l’API transmet le booléen et le service force le local si absent. Activation serveur et consentement agrégé restent également obligatoires. |
| B3 | Disponibilité Ollama | Si le local échoue pour une synthèse agrégée consentie, Gemini puis Groq peuvent être utilisés; échec cloud revient au local. Aucun fallback cloud pour les autres tâches/données. |
| B4 | RAM disponible et seuil de 2 500 Mo | RAM libre du serveur lue via `freemem()`: <2,5 GiB choisit le cloud d’abord uniquement pour une synthèse consentie; à partir de 2,5 GiB le local est prioritaire. L’échec cloud revient au local. |
| B5 | Échec d’un provider/quota | Gemini est essayé en premier; Groq est secours si configuré. Si Groq échoue, l’appel cloud échoue; le routeur revient au local lorsque celui-ci n’a pas déjà échoué. |

### C. 6 scénarios de basculement

| # | Scénario du classeur | État DRAFT2 |
|---|---|---|
| C1 | OCR local normal | Parcours OCR à compléter; le traitement doit rester local. |
| C2 | Ollama arrêté puis fallback cloud | Synthèse agrégée consentie: bascule Gemini puis Groq; données sensibles et parcours non branchés restent locaux. Tests fournisseurs simulés, aucun appel réseau de test. |
| C3 | RAM sous 2 500 Mo puis fallback cloud | RAM réelle côté serveur inférieure à 2,5 GiB sélectionne le cloud pour la synthèse agrégée uniquement, après le consentement utilisateur et les opt-ins serveur. |
| C4 | Internet absent puis fallback local | Pas de cloud initié; parcours local indépendant. |
| C5 | Quota cloud épuisé puis fallback local | Aucun provider cloud utilisé. |
| C6 | Tous les providers échouent | Erreur explicite; ne pas fabriquer de résultat ni fallback réseau. |

### D. 10 actions de fichiers/dépendances

| # | Action du classeur | État DRAFT2 |
|---|---|---|
| D1 | `ai/gateway.ts` | Passerelle Gemini/Groq HTTPS réelle pour le seul parcours de synthèse agrégée autorisé; endpoints fixes, clés en en-têtes, `no-store` et délai maximal de 30 s. La version TLS négociée n’est pas garantie par l’application. |
| D2 | `ai/gemini.ts` | Client Gemini réel intégré; Gemini reste obligatoire comme principal, Groq est optionnel et utilisé en secours. Aucun coût nul ou quota permanent n’est garanti. |
| D3 | `ai/anonymizer.ts` | Pas d’anonymiseur générique ni de réidentification: une liste blanche transmet seulement les agrégats autorisés et une intention prédéfinie; aucune donnée sensible n’est envoyée. |
| D4 | Modifier `ai/service.ts` | Le service conserve le texte libre localement, audite les événements de demande sans prompt/hash/secret et refuse le traitement si l’écriture initiale d’audit échoue. |
| D5 | Endpoints OCR/classify/score | Endpoint d’analyse OCR et scores configurables existants; aucune sortie réseau cloud. |
| D6 | Dépendance `@google/genai` | Non ajoutée; inutile sans intégration cloud autorisée. |
| D7 | `AiOcrPanel.tsx` | Capacité présente dans `AiInvoiceAnalysisPanel.tsx`; glisser-déposer ajouté et provider réel affiché. |
| D8 | Provider affiché dans Decision Support | Provider utilisé et bascule/fallback visibles dans le parcours d’analyse financière; provider Ollama est aussi affiché dans le résultat OCR. |
| D9 | Prévision ML | Référence et paramètres locaux administrables/inactifs, sans formule prédictive inventée ni cloud. |
| D10 | Détection IA | Références de mesures et de règle configurables/inactives; aucune action automatique ni résultat non expliqué. |

Les taux, formules fiscales, scores et critères de conformité non établis par une
source fiable ne sont pas déduits du classeur. Une configuration sauvegardée ne
constitue ni une validation réglementaire ni une autorisation de transfert.

### Contrôles de sources officielles

- Douane tunisienne : la page officielle Tarif Web 2026 est référencée à `https://www.douane.gov.tn/tarifweb2026/` et décrit un service de consultation du tarif en vigueur. L’index public indique une mise à jour le 17 juin 2025. L’accès direct a échoué au niveau transport/DNS/TLS dans cet environnement; les recherches ciblées n’ont pas trouvé d’export CSV/Excel public. Le panneau renvoie vers cette page et ne devine pas d’endpoint ni de paramètres de recherche.
- OMC : `https://ttd.wto.org/en/download/idb` documente un téléchargement de données de tarifs appliqués/préférentiels aux lignes nationales de 8 à 10 chiffres, mais réserve l’accès aux gouvernements membres et organisations internationales autorisées. Le téléchargement ADB décrit sur le site public est HS6 et agrège des sources OMC et externes; il n’est pas utilisé comme tarif tunisien NGP.
- Archive fournie via WITS : le CSV `DataJobID-3208543_3208543_PurchaseManager.csv` est limité aux exportations tunisiennes 2024 en nomenclature H6. Il ne contient aucun taux tarifaire; le lien de téléchargement WITS redirige vers l’authentification.
- Le parcours tarifaire public WITS/UNCTAD TRAINS est `https://wits.worldbank.org/tariff/trains/en/country/TUN`. La documentation WITS confirme que le résultat est harmonisé HS6 et correspond à une moyenne des lignes nationales sous chaque HS6; ce n’est donc pas un tarif individuel NGP à 10 chiffres et il n’est pas chargé dans SAFE.
- Ministère des Finances (`https://www.finances.gov.tn/fr`) : page publique accessible avec lois et FAQ, mais aucun barème NGP exhaustif ou contrat d’API tarifaire n’y a été exposé pendant cette vérification.
- DGI (`https://www.impots.finances.gov.tn/`) : l’accès a échoué au niveau transport/DNS/TLS; aucun endpoint e-facture ou format d’échange ne peut être confirmé.
- TUNEPS (`https://www.tuneps.tn/` et `/portal/`) : pages servies comme écran de chargement, sans documentation de protocole exploitable.
- CNSS (`https://www.cnss.tn/`) : portail officiel accessible, avec liens vers des services web de déclaration et paiement, mais sans schéma d’API ou format d’échange d’intégration publique vérifiable dans les pages consultées.

En conséquence, aucun export public approprié n’a été trouvé et aucun taux
produit n’a été chargé. Il faut obtenir un export de la Douane ou un accès
autorisé à l’IDB, puis vérifier sa version et sa couverture avant import. Les
connecteurs ont un onboarding local avec coffre d’identifiants
chiffré et aperçu sandbox, mais restent `NOT_CONNECTED`; aucun identifiant n’est
fourni dans ce dépôt, aucune requête réelle n’est faite et l’activation dépend
encore de contrats officiels vérifiables.
