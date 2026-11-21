# Passerelle IA SAFE — première tranche

L’assistant d’insights financiers reste local. La passerelle accepte `ollama-local` (valeur par défaut pour préserver le comportement existant) et refuse tout fournisseur non pris en charge via `SAFE_ERP_AI_PROVIDER`. Elle ne réalise aucun basculement automatique vers le cloud.

Le service ne transmet à Ollama que les totaux agrégés de la période et la question de l’utilisateur. L’URL Ollama demeure limitée à la boucle locale. Les réponses sont indicatives et ne déclenchent aucune écriture ni action comptable.

Chaque demande d’analyse financière exige une confirmation explicite dans l’interface que l’utilisateur vérifiera la réponse avant toute décision. L’API refuse les demandes sans cette confirmation. Le routage reste strictement local; aucune panne Ollama, faible mémoire, expiration ou erreur de quota ne déclenche un basculement cloud. L’anonymisation automatique proposée dans le document Smart AI Gateway n’est pas considérée comme une garantie suffisante pour transmettre des données financières à un service externe.

Après chaque réponse financière, SAFE affiche les données effectivement fournies au modèle (période, devise, nombre de lignes POSTED et totaux agrégés), les types dont les totaux étaient indisponibles et les règles de périmètre/limitation appliquées. Ces éléments sont construits par SAFE; ils ne sont pas générés par le modèle.

## Comparaisons et langue d’analyse

Le compte de résultat fournit des repères déterministes en français ou en anglais à partir du code pays. La comparaison du panneau est limitée aux totaux POSTED de la même période de l’année précédente; le service de l’assistant local compare la période sélectionnée à une période antérieure contiguë de durée égale. Les deux exposent les montants comparés et leurs écarts. Un pourcentage n’est pas calculé lorsque le montant de référence est nul ou lorsque le calcul n’est pas fini. Les codes pays non configurés ou ambigus ne conduisent pas à deviner une langue: le panneau affiche un avertissement bilingue et l’API de l’assistant renvoie une erreur 422.

Les écarts sont calculés par SAFE, pas par le modèle. Les messages peuvent signaler une évolution comptable et suggérer une vérification humaine; ils ne constituent ni une prévision, ni un indicateur de trésorerie/retards clients, ni une recommandation fiscale ou réglementaire. Aucune règle ou taux fiscal n’est modifié.

Gemini Free n’est pas activé dans cette tranche. Les requêtes/réponses de son offre gratuite peuvent être utilisées pour améliorer les produits; aucune donnée SAFE réelle, personnelle, confidentielle ou financière ne doit lui être envoyée. Une future intégration cloud nécessitera un modèle et des conditions vérifiés, un choix explicite de l’utilisateur et une politique de données distincte; elle ne pourra pas être un fallback transparent pour des données SAFE.

Le registre administrateur peut conserver une politique cloud de préparation avec fournisseur/modèle choisis manuellement, information de traitement, consentement explicite obligatoire et rédaction par défaut. Cette politique est uniquement déclarative : les catégories de données autorisées doivent rester vides, et l’activation du transfert, le routage financier automatique ou le fallback sont refusés. Aucun fournisseur cloud n’est appelé par cette version, même après revue de la politique.

L’assistant reste désactivé tant que ces trois variables ne sont pas explicitement définies à `true` dans la configuration protégée du processus serveur : `SAFE_ERP_AI_ENABLED`, `SAFE_ERP_AI_HARDWARE_READY` et `SAFE_ERP_AI_MODEL_APPROVED`. Les deux dernières attestent respectivement qu’un responsable a vérifié la capacité matérielle de la machine cible et évalué/approuvé le modèle exact; le code ne peut pas certifier ces conditions automatiquement. Toute variable absente ou différente de `true` bloque l’appel avant la lecture des données financières. Après approbation séparée, configurer `SAFE_ERP_AI_MODEL` avec un modèle Ollama déjà disponible et, facultativement, `SAFE_ERP_AI_PROVIDER=ollama-local`. SAFE ne télécharge ni n’installe de modèle, et aucune commande de préparation ne doit lancer une inférence.

La génération Ollama est non diffusée (`stream=false`), sans mode de raisonnement (`think=false`), avec température 0,1, contexte de 4 096 tokens, sortie maximale de 700 tokens et délai maximal de 60 secondes. Les valeurs d’entrée restent des données de travail; les essais synthétiques ne valent pas approbation d’un modèle ou d’un hébergement.

Le guide de référence indique que le modèle Qwen3 32B n’a pas été évalué pour SAFE et qu’une machine d’environ 7,21 Gio de RAM n’est pas une cible adéquate pour son inférence. La taille téléchargée ne représente pas les besoins mémoire à l’exécution. Ne pas approuver ce modèle ou lancer Ollama sur une machine insuffisante; le service IA ne doit pas être activé sans évaluation sur la machine cible. Aucune activation n’est effectuée par ce changement.

## Analyse locale des factures

Le panneau d’achats accepte des PDF et des classeurs `.xlsx`. Les PDF contenant déjà du texte sont extraits localement; les pages numérisées ou insuffisamment lisibles sont rendues avec PDF.js et traitées par Tesseract.js avec les données françaises empaquetées. Le classeur Excel est lu localement, première feuille seulement; SAFE n’exécute pas de formules ni de macros. Le texte extrait et les candidats du plan comptable de l’entité sont transmis uniquement au modèle Ollama local configuré.

Les limites sont de 8 Mio par fichier, 5 pages PDF, 250 lignes et 60 colonnes pour la première feuille Excel, 24 000 caractères analysés, 50 Mio décompressés et 2 000 entrées ZIP. Un seul worker OCR est partagé et la file est limitée à trois analyses en cours. Les documents ne sont pas persistés par cette fonction; leur contenu demeure en mémoire pendant l’analyse.

Les suggestions d’imputation sont indicatives et ne choisissent qu’un seul compte par ligne. Chaque ligne cite un extrait retrouvé dans le document et expose la justification du modèle, les termes communs, le score lexical déterministe (termes communs / termes cités) et les contrôles d’admissibilité du compte. Ce score décrit uniquement un recouvrement de texte, pas une probabilité ni une confiance calibrée; la confiance du modèle reste qualitative. Les comptes sont limités aux comptes de charge ou d’actif autorisés à la comptabilisation dans le plan de l’entité. Une validation humaine reste obligatoire; cette fonction ne crée ni écriture, ni déclaration, ni approbation. Les taux et règles fiscales existants ne sont pas calculés ni modifiés.

Les factures sont des données sensibles. N’exposez pas Ollama sur un réseau non fiable et ne configurez pas de fournisseur distant pour cette fonction. Toute indisponibilité locale est signalée; aucun basculement cloud n’est effectué.
