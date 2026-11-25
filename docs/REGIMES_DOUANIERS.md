# BarÃ¨mes douaniers configurables

SAFE stocke les barÃ¨mes douaniers par profil pays et code NGP Ã  10 chiffres. Une configuration comprend les taux DD, DC, FODEC, TVA Ã  lâ€™importation et RPD, ainsi quâ€™une liste explicite des composantes retenues dans lâ€™assiette de chaque taxe. Aucun taux ni rÃ©gime prÃ©fÃ©rentiel nâ€™est prÃ©chargÃ©.

### Recherche dans le Tarif Web officiel et import

Dans **Administration â†’ prÃ©paration du Tarif Web**, lâ€™administrateur peut saisir un
code NGP Ã  10 chiffres et ouvrir la page officielle Tarif Web 2026
`https://www.douane.gov.tn/tarifweb2026/`. SAFE ne construit pas dâ€™URL interne ni
dâ€™endpoint de recherche supposÃ© et nâ€™interroge pas le site automatiquement.
Consulter le Tarif Web pour un code prÃ©cis nâ€™implique pas que SAFE connaisse ou
ait chargÃ© le taux correspondant.

Si le portail offre un export exploitable, lâ€™administrateur peut importer le
fichier CSV UTF-8 obtenu depuis cette source. Il doit conserver lâ€™Ã©dition ou la
rÃ©fÃ©rence du tarif, la source HTTPS officielle, les dates de validitÃ© et les
assiettes explicitement confirmÃ©es. Lâ€™import prÃ©visualise les lignes, vÃ©rifie les
codes NGP Ã  10 chiffres, les dates et les duplications, enregistre une empreinte
SHA-256 et crÃ©e des brouillons seulement. Chaque ligne doit ensuite Ãªtre vÃ©rifiÃ©e
manuellement; le statut vÃ©rifiÃ© enregistre lâ€™acteur et la date de revue mais ne
vaut pas certification douaniÃ¨re.

Le panneau dâ€™administration fournit aussi un modÃ¨le CSV vierge avec les en-tÃªtes
et leur correspondance prÃ©configurÃ©s. Il ne contient aucun taux dâ€™exemple : les
lignes sont Ã  complÃ©ter uniquement Ã  partir de fiches officielles. Les assiettes
restent Ã  configurer sÃ©parÃ©ment selon des rÃ¨gles validÃ©es avant lâ€™aperÃ§u.

La page officielle indique que le Tarif Web permet la consultation du tarif en
vigueur et du classement tunisien; son index public mentionne une mise Ã  jour du
17 juin 2025. Les tentatives dâ€™accÃ¨s direct au portail ont Ã©chouÃ© depuis
lâ€™environnement de dÃ©veloppement. La recherche nâ€™a pas confirmÃ© dâ€™export CSV ou
Excel public depuis cette page; aucun export national nâ€™a donc pu Ãªtre rÃ©cupÃ©rÃ©.

La base de lâ€™OMC `https://ttd.wto.org/en/download/idb` dÃ©crit des tarifs appliquÃ©s
et prÃ©fÃ©rentiels jusquâ€™aux lignes nationales de 8 Ã  10 chiffres, mais ses
tÃ©lÃ©chargements sont rÃ©servÃ©s aux gouvernements membres de lâ€™OMC et aux
organisations internationales autorisÃ©es. Le tÃ©lÃ©chargement public ADB de lâ€™OMC
est au niveau HS Ã  6 chiffres et combine les donnÃ©es OMC avec des sources
externes; il ne satisfait pas le chargement du tarif national NGP Ã  10 chiffres.
Il faut obtenir un export auprÃ¨s de la Douane tunisienne ou un accÃ¨s autorisÃ© Ã 
lâ€™IDB. Aucun taux produit nâ€™a Ã©tÃ© inventÃ© ni chargÃ© en attendant.

Lâ€™archive WITS fournie pour vÃ©rification (`DataJobID-3208543_3208543_PurchaseManager.csv`)
contient 20 184 lignes de flux dâ€™exportation 2024 au niveau H6 (colonnes
`TradeFlowName`, `Gross Exports`, valeur en milliers de dollars); elle ne contient
aucun champ de taux ou de droit. Elle ne peut pas Ãªtre importÃ©e comme barÃ¨me. Le
lien WITS indiquÃ© redirige vers une page dâ€™authentification dans lâ€™environnement.

Le parcours WITS appropriÃ© pour consulter des tarifs est **Tariffs â†’ UNCTAD
TRAINS**, Ã©galement accessible Ã 
`https://wits.worldbank.org/tariff/trains/en/country/TUN`. Sa documentation
publique confirme toutefois que les donnÃ©es TRAINS sont harmonisÃ©es Ã  HS6 et
renvoient des moyennes des lignes nationales Ã  lâ€™intÃ©rieur de chaque code HS6,
pas les taux individuels NGP Ã  10 chiffres. Ce parcours peut servir de rÃ©fÃ©rence
indicative, mais pas de source pour peupler ou activer les barÃ¨mes SAFE.

Les nouveaux barÃ¨mes sont crÃ©Ã©s en brouillon avec lâ€™identifiant de leur auteur. Seul un administrateur peut les vÃ©rifier, aprÃ¨s contrÃ´le manuel de la pÃ©riode, du code NGP, des taux et de leur rÃ©fÃ©rence sur une source HTTPS du domaine officiel `douane.gov.tn`. Les pÃ©riodes vÃ©rifiÃ©es qui se chevauchent pour le mÃªme code et le mÃªme rÃ©gime sont refusÃ©es. Ce contrÃ´le enregistre lâ€™attestation de lâ€™administrateur; il ne constitue pas une vÃ©rification automatique du contenu de la source.

Une prÃ©fÃ©rence est conservÃ©e sÃ©parÃ©ment avec son pays dâ€™origine, son accord, son taux DD et sa pÃ©riode. Le calcul ne lâ€™applique que si lâ€™utilisateur confirme lâ€™Ã©ligibilitÃ© et indique une rÃ©fÃ©rence de justificatif; le pays, lâ€™accord et la source du tarif doivent aussi correspondre. Il appartient Ã  un dÃ©clarant en douane de vÃ©rifier lâ€™origine, la qualification du produit et les justificatifs.

API dâ€™administration (`/api/admin/countries/:code/customs-tariffs`) :

- `GET` liste les barÃ¨mes configurÃ©s;
- `POST` crÃ©e un brouillon sans lâ€™activer;
- `POST /:id/verify` vÃ©rifie explicitement un brouillon;
- `POST /calculate` calcule une estimation Ã  partir dâ€™un barÃ¨me vÃ©rifiÃ© et des assiettes enregistrÃ©es.

Les montants sont arrondis au millime. Le calcul suit lâ€™ordre DD, DC, FODEC, TVA Ã  lâ€™importation puis RPD, mais les assiettes sont stockÃ©es explicitement et ne reÃ§oivent pas de valeur par dÃ©faut. Ce module nâ€™importe pas le Tarif Web, ne dÃ©duit pas de taux Ã  partir dâ€™une catÃ©gorie gÃ©nÃ©rale et ne produit pas de dÃ©claration douaniÃ¨re. Tant que les barÃ¨mes officiels nâ€™ont pas Ã©tÃ© saisis et vÃ©rifiÃ©s, le calcul reste indisponible.

## Suivi AT / ACT

Le module `/api/customs-regimes` conserve les rÃ©gimes AT/ACT par entitÃ©, les fiches de stock et les mouvements entrants/sortants saisis avec une rÃ©fÃ©rence, ainsi que les cautions et rÃ©fÃ©rences de mainlevÃ©e. Les quantitÃ©s et montants sont des donnÃ©es de suivi manuel; aucune caution nâ€™est calculÃ©e en pourcentage.

Ce registre ne calcule pas de solde douanier officiel ni de taux de transformation, nâ€™importe pas de donnÃ©es TUNEPS/Tarif Web et ne remplace ni une autorisation, ni un document rÃ©glementaire, ni la validation dâ€™un dÃ©clarant. Les taux de transformation et les rÃ¨gles de rÃ©gularisation sont Ã  fournir et valider Ã  partir de consignes officielles avant toute automatisation.
