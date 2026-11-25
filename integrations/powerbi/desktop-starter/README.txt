SAFE ERP â€” pack de dÃ©marrage Power BI Desktop

CONTENU
Ce pack fournit quatre requÃªtes Power Query M pour Power BI Desktop : journaux comptabilisÃ©s, factures de vente Ã©mises/payÃ©es, factures fournisseurs comptabilisÃ©es et balance Ã¢gÃ©e des crÃ©ances. Ce nâ€™est pas un rapport PBIX/PBIT : les pages et visuels doivent Ãªtre crÃ©Ã©s dans Power BI Desktop, puis actualisÃ©s depuis Desktop.

DONNÃ‰ES ET SÃ‰CURITÃ‰
Les requÃªtes lisent uniquement lâ€™API BI SAFE en lecture seule. Elles ne transmettent pas dâ€™identifiant de sociÃ©tÃ© : SAFE dÃ©duit la sociÃ©tÃ© du compte authentifiÃ© et contrÃ´le son autorisation cÃ´tÃ© serveur. Les rÃ©ponses incluent lâ€™entitÃ©, la pÃ©riode et lâ€™heure de gÃ©nÃ©ration. Les brouillons et Ã©critures non comptabilisÃ©es sont exclus.

Les requÃªtes de ce pack sont prÃ©vues pour un usage local lorsque SAFE et Power BI Desktop sont sur le mÃªme PC. Power BI utilise lâ€™authentification Basic de SAFE, acceptÃ©e par lâ€™API BI uniquement depuis la boucle locale et pour des lectures. Power BI conserve les identifiants dans ses paramÃ¨tres de source de donnÃ©es; ne les inscrivez jamais dans le code M.

Pour un SAFE accessible depuis un autre PC, nâ€™utilisez pas les requÃªtes locales ni Basic vers le rÃ©seau. Le connecteur Power Query personnalisÃ© `integrations/powerbi/SAFEERP.pq` utilise les identifiants entrÃ©s dans Power BI pour obtenir un jeton SAFE Bearer. Il requiert une API SAFE distante en HTTPS, un secret `SAFE_ERP_AUTH_SECRET` configurÃ© et le connecteur compilÃ©/autorisÃ© sur le poste Desktop. La compilation du connecteur nâ€™a pas Ã©tÃ© vÃ©rifiÃ©e sur cette machine; le SDK Power Query est requis.

CRÃ‰ER LE RAPPORT DANS DESKTOP
1. Extrayez le ZIP, dÃ©marrez SAFE sur ce PC et ouvrez Power BI Desktop.
2. Dans Desktop, choisissez Obtenir des donnÃ©es > RequÃªte vierge. Renommez la requÃªte en SAFE_JournalLines, ouvrez lâ€™Ã‰diteur avancÃ© et collez SAFE_JournalLines.m.
3. RÃ©pÃ©tez pour SAFE_SalesInvoices.m et SAFE_PurchaseInvoices.m, avec les noms SAFE_SalesInvoices et SAFE_PurchaseInvoices.
4. RÃ©pÃ©tez pour SAFE_ReceivablesAging.m avec le nom SAFE_ReceivablesAging.
5. Ã€ la premiÃ¨re actualisation de `http://127.0.0.1:3000`, choisissez Basic et saisissez les identifiants dâ€™un utilisateur SAFE `ADMIN` ou `FINANCIAL_MANAGER`.
6. Construisez les pages/visuels et les filtres dans Desktop. Exemples : dÃ©bit/crÃ©dit par type de compte et mois; total des factures de vente par mois/statut; total achats par mois/code de TVA; encours clients par anciennetÃ©.
7. Utilisez les colonnes SAFE_Entity et SAFE_PeriodStart/SAFE_PeriodEnd, ou SAFE_AsOf pour lâ€™anciennetÃ©, afin de rendre visibles la source, la sociÃ©tÃ© et la pÃ©riode/date dâ€™arrÃªtÃ©.
8. Actualisez le rapport manuellement depuis Power BI Desktop.

PÃ‰RIODE ET PÃ‰RIMÃˆTRE
Les requÃªtes journaux/ventes/achats dÃ©marrent sur une pÃ©riode glissante de 365 jours jusquâ€™Ã  aujourdâ€™hui sur le PC. Cette pÃ©riode respecte le plafond API de 366 jours. La requÃªte receivables-aging utilise la date du jour comme date dâ€™arrÃªtÃ©; changez son paramÃ¨tre AsOf pour un autre arrÃªtÃ© valide.

- Les journaux sont limitÃ©s aux lignes POSTED.
- Les ventes comprennent les factures ISSUED/PAID.
- Les achats comprennent les factures fournisseurs POSTED.
- La balance Ã¢gÃ©e des crÃ©ances utilise les factures Ã©mises/payÃ©es et les rÃ¨glements enregistrÃ©s jusquâ€™Ã  la date dâ€™arrÃªtÃ©; les lignes comportent les diagnostics et les montants agrÃ©gÃ©s sont nuls si la couverture est invalide.
- Aucune donnÃ©e Power BI nâ€™est importÃ©e dans SAFE.
- Ce pack ne gÃ©nÃ¨re ni nâ€™ouvre automatiquement Power BI Desktop et ne contient aucun rapport PBIX/PBIT prÃ©construit.
