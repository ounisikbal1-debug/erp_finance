# Configuration du cloud IA agrégé

## Périmètre et consentement

Le cloud est désactivé par défaut. Le seul parcours cloud actuellement intégré
est l’assistant de synthèse financière de période. Il n’achemine pas l’OCR, la
paie, les écritures détaillées, les fiches client/fournisseur, les scores, les
rapprochements, les anomalies ou le chatbot.

Une requête cloud exige les deux variables d’activation serveur ci-dessous, au
moins une clé fournisseur et une case de consentement distincte cochée pour la
demande courante. Sans la case, la question est traitée localement; elle ne peut
pas basculer au cloud si Ollama est indisponible. Le consentement expire lorsque
la demande (entité, période ou question) change.

Le cloud reçoit uniquement les sommes de mouvements POSTED agrégées par type,
les bornes de périodes, la devise fonctionnelle, le nombre de lignes POSTED et
une question prédéfinie. La question libre, les identifiants, le nom de société,
les comptes, les factures, les salaires et les détails bruts ne sont pas envoyés.
Les résultats sont consultatifs et doivent être vérifiés.

Chaque demande produit des événements de métadonnées `STARTED`, puis
`SUCCEEDED` ou `FAILED`, associés à l’entité et à l’utilisateur authentifié.
Le journal ne conserve ni prompt, ni question libre, ni hash de prompt, ni clé
fournisseur, ni corps d’erreur. Les événements sont append-only; si l’écriture
du journal est indisponible, la demande échoue avant lecture des données
financières ou appel fournisseur. Le résultat indique également quand le
routeur a changé de fournisseur.

## Activation côté serveur

Injecter les variables dans le gestionnaire de secrets de l’environnement du
serveur; ne pas inscrire de clé réelle dans le dépôt, le navigateur ou un fichier
versionné:

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

Le cloud reste inactif si l’activation ou le consentement administrateur agrégé
est absent. Une clé Gemini est obligatoire pour activer le cloud et garantir qu’il reste le
fournisseur principal; Groq est facultatif et utilisé en secours après un échec
Gemini. Le modèle Lite est paramétrable, mais aucun parcours actuel ne le
sélectionne encore.

Le routeur utilise la mémoire libre du serveur: sous 2,5 GiB, le cloud est essayé
d’abord; à partir de 2,5 GiB, Ollama est prioritaire. Si Ollama échoue, le cloud
peut être essayé uniquement pour une synthèse agrégée autorisée. En cas d’échec
cloud, SAFE revient à Ollama lorsqu’il est disponible. L’absence de réseau ne
permet donc jamais d’envoyer des données sensibles vers un fournisseur.

## Fournisseurs, coûts et confidentialité

- Google documente `gemini-3.8-flash` et `gemini-3.5-flash-lite`. Les offres
  gratuites sont limitées et modifiables; la documentation indique que le
  contenu de l’offre gratuite peut être utilisé pour améliorer les produits.
  L’offre payante indique que ce contenu n’est pas utilisé à cette fin. Vérifier
  les conditions en vigueur et la politique de l’organisation avant activation.
- Groq documente `llama-3.3-70b-versatile` comme accès Enterprise / Contact
  Sales; aucune gratuité de ce modèle n’est garantie. Le fallback peut donc ne
  pas être disponible avec un compte développeur ou gratuit.
- Aucun tarif, quota ou coût nul n’est garanti par SAFE. Les paramètres et
  conditions des fournisseurs peuvent changer.

Sources officielles consultées:

- [Modèles Gemini](https://ai.google.dev/gemini-api/docs/models)
- [Tarification et conditions Gemini](https://ai.google.dev/gemini-api/docs/pricing)
- [Modèles Groq pris en charge](https://console.groq.com/docs/models)

Les autres tâches mentionnées dans le tableau utilisateur restent locales ou
non branchées au cloud tant qu’un chemin permettant de garantir la même
minimisation et le consentement approprié n’a pas été livré et testé.

## Transport et secrets

Les clients utilisent uniquement les endpoints HTTPS fixes des fournisseurs,
placent les clés dans des en-têtes d’authentification (jamais dans l’URL) et
appliquent un délai maximal de 30 secondes ainsi que l’en-tête
`Cache-Control: no-store`. Cela ne garantit pas la version TLS effectivement
négociée ni la politique de conservation du fournisseur. Le fichier racine
`.gitignore` exclut `.env` et `.env.*` tout en autorisant `.env.example`;
conserver les clés dans le gestionnaire de secrets du serveur.
