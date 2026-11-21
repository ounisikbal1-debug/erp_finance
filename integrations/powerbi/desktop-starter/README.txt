SAFE ERP — pack de démarrage Power BI Desktop

CONTENU
Ce pack fournit quatre requêtes Power Query M pour Power BI Desktop : journaux comptabilisés, factures de vente émises/payées, factures fournisseurs comptabilisées et balance âgée des créances. Ce n’est pas un rapport PBIX/PBIT : les pages et visuels doivent être créés dans Power BI Desktop, puis actualisés depuis Desktop.

DONNÉES ET SÉCURITÉ
Les requêtes lisent uniquement l’API BI SAFE en lecture seule. Elles ne transmettent pas d’identifiant de société : SAFE déduit la société du compte authentifié et contrôle son autorisation côté serveur. Les réponses incluent l’entité, la période et l’heure de génération. Les brouillons et écritures non comptabilisées sont exclus.

Les requêtes de ce pack sont prévues pour un usage local lorsque SAFE et Power BI Desktop sont sur le même PC. Power BI utilise l’authentification Basic de SAFE, acceptée par l’API BI uniquement depuis la boucle locale et pour des lectures. Power BI conserve les identifiants dans ses paramètres de source de données; ne les inscrivez jamais dans le code M.

Pour un SAFE accessible depuis un autre PC, n’utilisez pas les requêtes locales ni Basic vers le réseau. Le connecteur Power Query personnalisé `integrations/powerbi/SAFEERP.pq` utilise les identifiants entrés dans Power BI pour obtenir un jeton SAFE Bearer. Il requiert une API SAFE distante en HTTPS, un secret `SAFE_ERP_AUTH_SECRET` configuré et le connecteur compilé/autorisé sur le poste Desktop. La compilation du connecteur n’a pas été vérifiée sur cette machine; le SDK Power Query est requis.

CRÉER LE RAPPORT DANS DESKTOP
1. Extrayez le ZIP, démarrez SAFE sur ce PC et ouvrez Power BI Desktop.
2. Dans Desktop, choisissez Obtenir des données > Requête vierge. Renommez la requête en SAFE_JournalLines, ouvrez l’Éditeur avancé et collez SAFE_JournalLines.m.
3. Répétez pour SAFE_SalesInvoices.m et SAFE_PurchaseInvoices.m, avec les noms SAFE_SalesInvoices et SAFE_PurchaseInvoices.
4. Répétez pour SAFE_ReceivablesAging.m avec le nom SAFE_ReceivablesAging.
5. À la première actualisation de `http://127.0.0.1:3000`, choisissez Basic et saisissez les identifiants d’un utilisateur SAFE `ADMIN` ou `FINANCIAL_MANAGER`.
6. Construisez les pages/visuels et les filtres dans Desktop. Exemples : débit/crédit par type de compte et mois; total des factures de vente par mois/statut; total achats par mois/code de TVA; encours clients par ancienneté.
7. Utilisez les colonnes SAFE_Entity et SAFE_PeriodStart/SAFE_PeriodEnd, ou SAFE_AsOf pour l’ancienneté, afin de rendre visibles la source, la société et la période/date d’arrêté.
8. Actualisez le rapport manuellement depuis Power BI Desktop.

PÉRIODE ET PÉRIMÈTRE
Les requêtes journaux/ventes/achats démarrent sur une période glissante de 365 jours jusqu’à aujourd’hui sur le PC. Cette période respecte le plafond API de 366 jours. La requête receivables-aging utilise la date du jour comme date d’arrêté; changez son paramètre AsOf pour un autre arrêté valide.

- Les journaux sont limités aux lignes POSTED.
- Les ventes comprennent les factures ISSUED/PAID.
- Les achats comprennent les factures fournisseurs POSTED.
- La balance âgée des créances utilise les factures émises/payées et les règlements enregistrés jusqu’à la date d’arrêté; les lignes comportent les diagnostics et les montants agrégés sont nuls si la couverture est invalide.
- Aucune donnée Power BI n’est importée dans SAFE.
- Ce pack ne génère ni n’ouvre automatiquement Power BI Desktop et ne contient aucun rapport PBIX/PBIT préconstruit.
