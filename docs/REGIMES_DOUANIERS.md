# Barèmes douaniers configurables

SAFE stocke les barèmes douaniers par profil pays et code NGP à 10 chiffres. Une configuration comprend les taux DD, DC, FODEC, TVA à l’importation et RPD, ainsi qu’une liste explicite des composantes retenues dans l’assiette de chaque taxe. Aucun taux ni régime préférentiel n’est préchargé.

### Recherche dans le Tarif Web officiel et import

Dans **Administration → préparation du Tarif Web**, l’administrateur peut saisir un
code NGP à 10 chiffres et ouvrir la page officielle Tarif Web 2026
`https://www.douane.gov.tn/tarifweb2026/`. SAFE ne construit pas d’URL interne ni
d’endpoint de recherche supposé et n’interroge pas le site automatiquement.
Consulter le Tarif Web pour un code précis n’implique pas que SAFE connaisse ou
ait chargé le taux correspondant.

Si le portail offre un export exploitable, l’administrateur peut importer le
fichier CSV UTF-8 obtenu depuis cette source. Il doit conserver l’édition ou la
référence du tarif, la source HTTPS officielle, les dates de validité et les
assiettes explicitement confirmées. L’import prévisualise les lignes, vérifie les
codes NGP à 10 chiffres, les dates et les duplications, enregistre une empreinte
SHA-256 et crée des brouillons seulement. Chaque ligne doit ensuite être vérifiée
manuellement; le statut vérifié enregistre l’acteur et la date de revue mais ne
vaut pas certification douanière.

Le panneau d’administration fournit aussi un modèle CSV vierge avec les en-têtes
et leur correspondance préconfigurés. Il ne contient aucun taux d’exemple : les
lignes sont à compléter uniquement à partir de fiches officielles. Les assiettes
restent à configurer séparément selon des règles validées avant l’aperçu.

La page officielle indique que le Tarif Web permet la consultation du tarif en
vigueur et du classement tunisien; son index public mentionne une mise à jour du
17 juin 2025. Les tentatives d’accès direct au portail ont échoué depuis
l’environnement de développement. La recherche n’a pas confirmé d’export CSV ou
Excel public depuis cette page; aucun export national n’a donc pu être récupéré.

La base de l’OMC `https://ttd.wto.org/en/download/idb` décrit des tarifs appliqués
et préférentiels jusqu’aux lignes nationales de 8 à 10 chiffres, mais ses
téléchargements sont réservés aux gouvernements membres de l’OMC et aux
organisations internationales autorisées. Le téléchargement public ADB de l’OMC
est au niveau HS à 6 chiffres et combine les données OMC avec des sources
externes; il ne satisfait pas le chargement du tarif national NGP à 10 chiffres.
Il faut obtenir un export auprès de la Douane tunisienne ou un accès autorisé à
l’IDB. Aucun taux produit n’a été inventé ni chargé en attendant.

L’archive WITS fournie pour vérification (`DataJobID-3208543_3208543_PurchaseManager.csv`)
contient 20 184 lignes de flux d’exportation 2024 au niveau H6 (colonnes
`TradeFlowName`, `Gross Exports`, valeur en milliers de dollars); elle ne contient
aucun champ de taux ou de droit. Elle ne peut pas être importée comme barème. Le
lien WITS indiqué redirige vers une page d’authentification dans l’environnement.

Le parcours WITS approprié pour consulter des tarifs est **Tariffs → UNCTAD
TRAINS**, également accessible à
`https://wits.worldbank.org/tariff/trains/en/country/TUN`. Sa documentation
publique confirme toutefois que les données TRAINS sont harmonisées à HS6 et
renvoient des moyennes des lignes nationales à l’intérieur de chaque code HS6,
pas les taux individuels NGP à 10 chiffres. Ce parcours peut servir de référence
indicative, mais pas de source pour peupler ou activer les barèmes SAFE.

Les nouveaux barèmes sont créés en brouillon avec l’identifiant de leur auteur. Seul un administrateur peut les vérifier, après contrôle manuel de la période, du code NGP, des taux et de leur référence sur une source HTTPS du domaine officiel `douane.gov.tn`. Les périodes vérifiées qui se chevauchent pour le même code et le même régime sont refusées. Ce contrôle enregistre l’attestation de l’administrateur; il ne constitue pas une vérification automatique du contenu de la source.

Une préférence est conservée séparément avec son pays d’origine, son accord, son taux DD et sa période. Le calcul ne l’applique que si l’utilisateur confirme l’éligibilité et indique une référence de justificatif; le pays, l’accord et la source du tarif doivent aussi correspondre. Il appartient à un déclarant en douane de vérifier l’origine, la qualification du produit et les justificatifs.

API d’administration (`/api/admin/countries/:code/customs-tariffs`) :

- `GET` liste les barèmes configurés;
- `POST` crée un brouillon sans l’activer;
- `POST /:id/verify` vérifie explicitement un brouillon;
- `POST /calculate` calcule une estimation à partir d’un barème vérifié et des assiettes enregistrées.

Les montants sont arrondis au millime. Le calcul suit l’ordre DD, DC, FODEC, TVA à l’importation puis RPD, mais les assiettes sont stockées explicitement et ne reçoivent pas de valeur par défaut. Ce module n’importe pas le Tarif Web, ne déduit pas de taux à partir d’une catégorie générale et ne produit pas de déclaration douanière. Tant que les barèmes officiels n’ont pas été saisis et vérifiés, le calcul reste indisponible.

## Suivi AT / ACT

Le module `/api/customs-regimes` conserve les régimes AT/ACT par entité, les fiches de stock et les mouvements entrants/sortants saisis avec une référence, ainsi que les cautions et références de mainlevée. Les quantités et montants sont des données de suivi manuel; aucune caution n’est calculée en pourcentage.

Ce registre ne calcule pas de solde douanier officiel ni de taux de transformation, n’importe pas de données TUNEPS/Tarif Web et ne remplace ni une autorisation, ni un document réglementaire, ni la validation d’un déclarant. Les taux de transformation et les règles de régularisation sont à fournir et valider à partir de consignes officielles avant toute automatisation.
