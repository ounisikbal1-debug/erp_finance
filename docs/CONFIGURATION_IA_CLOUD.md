# Configuration du cloud IA agrÃ©gÃ©

## PÃ©rimÃ¨tre et consentement

Le cloud est dÃ©sactivÃ© par dÃ©faut. Le seul parcours cloud actuellement intÃ©grÃ©
est lâ€™assistant de synthÃ¨se financiÃ¨re de pÃ©riode. Il nâ€™achemine pas lâ€™OCR, la
paie, les Ã©critures dÃ©taillÃ©es, les fiches client/fournisseur, les scores, les
rapprochements, les anomalies ou le chatbot.

Une requÃªte cloud exige les deux variables dâ€™activation serveur ci-dessous, au
moins une clÃ© fournisseur et une case de consentement distincte cochÃ©e pour la
demande courante. Sans la case, la question est traitÃ©e localement; elle ne peut
pas basculer au cloud si Ollama est indisponible. Le consentement expire lorsque
la demande (entitÃ©, pÃ©riode ou question) change.

Le cloud reÃ§oit uniquement les sommes de mouvements POSTED agrÃ©gÃ©es par type,
les bornes de pÃ©riodes, la devise fonctionnelle, le nombre de lignes POSTED et
une question prÃ©dÃ©finie. La question libre, les identifiants, le nom de sociÃ©tÃ©,
les comptes, les factures, les salaires et les dÃ©tails bruts ne sont pas envoyÃ©s.
Les rÃ©sultats sont consultatifs et doivent Ãªtre vÃ©rifiÃ©s.

Chaque demande produit des Ã©vÃ©nements de mÃ©tadonnÃ©es `STARTED`, puis
`SUCCEEDED` ou `FAILED`, associÃ©s Ã  lâ€™entitÃ© et Ã  lâ€™utilisateur authentifiÃ©.
Le journal ne conserve ni prompt, ni question libre, ni hash de prompt, ni clÃ©
fournisseur, ni corps dâ€™erreur. Les Ã©vÃ©nements sont append-only; si lâ€™Ã©criture
du journal est indisponible, la demande Ã©choue avant lecture des donnÃ©es
financiÃ¨res ou appel fournisseur. Le rÃ©sultat indique Ã©galement quand le
routeur a changÃ© de fournisseur.

## Activation cÃ´tÃ© serveur

Injecter les variables dans le gestionnaire de secrets de lâ€™environnement du
serveur; ne pas inscrire de clÃ© rÃ©elle dans le dÃ©pÃ´t, le navigateur ou un fichier
versionnÃ©:

```dotenv
SAFE_ERP_AI_ENABLED=true
SAFE_ERP_AI_PROVIDER=ollama-local
SAFE_ERP_AI_CLOUD_ENABLED=true
SAFE_ERP_AI_CLOUD_CONSENT_AGGREGATES=true
GEMINI_API_KEY=
GROQ_API_KEY=
SAFE_ERP_AI_GEMINI_MODEL=gemini-3.8-flash
SAFE_ERP_AI_GEMINI_LITE_MODEL=gemini-3.5-flash-lite
SAFE_ERP_AI_GROQ_MODEL=llama-3.3-70b-versatile
```

Le cloud reste inactif si lâ€™activation ou le consentement administrateur agrÃ©gÃ©
est absent. Une clÃ© Gemini est obligatoire pour activer le cloud et garantir quâ€™il reste le
fournisseur principal; Groq est facultatif et utilisÃ© en secours aprÃ¨s un Ã©chec
Gemini. Le modÃ¨le Lite est paramÃ©trable, mais aucun parcours actuel ne le
sÃ©lectionne encore.

Le routeur utilise la mÃ©moire libre du serveur: sous 2,5 GiB, le cloud est essayÃ©
dâ€™abord; Ã  partir de 2,5 GiB, Ollama est prioritaire. Si Ollama Ã©choue, le cloud
peut Ãªtre essayÃ© uniquement pour une synthÃ¨se agrÃ©gÃ©e autorisÃ©e. En cas dâ€™Ã©chec
cloud, SAFE revient Ã  Ollama lorsquâ€™il est disponible. Lâ€™absence de rÃ©seau ne
permet donc jamais dâ€™envoyer des donnÃ©es sensibles vers un fournisseur.

## Fournisseurs, coÃ»ts et confidentialitÃ©

- Google documente `gemini-3.8-flash` et `gemini-3.5-flash-lite`. Les offres
  gratuites sont limitÃ©es et modifiables; la documentation indique que le
  contenu de lâ€™offre gratuite peut Ãªtre utilisÃ© pour amÃ©liorer les produits.
  Lâ€™offre payante indique que ce contenu nâ€™est pas utilisÃ© Ã  cette fin. VÃ©rifier
  les conditions en vigueur et la politique de lâ€™organisation avant activation.
- Groq documente `llama-3.3-70b-versatile` comme accÃ¨s Enterprise / Contact
  Sales; aucune gratuitÃ© de ce modÃ¨le nâ€™est garantie. Le fallback peut donc ne
  pas Ãªtre disponible avec un compte dÃ©veloppeur ou gratuit.
- Aucun tarif, quota ou coÃ»t nul nâ€™est garanti par SAFE. Les paramÃ¨tres et
  conditions des fournisseurs peuvent changer.

Sources officielles consultÃ©es:

- [ModÃ¨les Gemini](https://ai.google.dev/gemini-api/docs/models)
- [Tarification et conditions Gemini](https://ai.google.dev/gemini-api/docs/pricing)
- [ModÃ¨les Groq pris en charge](https://console.groq.com/docs/models)

Les autres tÃ¢ches mentionnÃ©es dans le tableau utilisateur restent locales ou
non branchÃ©es au cloud tant quâ€™un chemin permettant de garantir la mÃªme
minimisation et le consentement appropriÃ© nâ€™a pas Ã©tÃ© livrÃ© et testÃ©.

## Transport et secrets

Les clients utilisent uniquement les endpoints HTTPS fixes des fournisseurs,
placent les clÃ©s dans des en-tÃªtes dâ€™authentification (jamais dans lâ€™URL) et
appliquent un dÃ©lai maximal de 30 secondes ainsi que lâ€™en-tÃªte
`Cache-Control: no-store`. Cela ne garantit pas la version TLS effectivement
nÃ©gociÃ©e ni la politique de conservation du fournisseur. Le fichier racine
`.gitignore` exclut `.env` et `.env.*` tout en autorisant `.env.example`;
conserver les clÃ©s dans le gestionnaire de secrets du serveur.
