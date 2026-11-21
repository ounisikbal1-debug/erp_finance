
SAFE ERP • SUITE MÉTIER TUNISIE
Normes Comptables SCE & Réglementation Fiscale Tunisienne
Arrêté de validation : 18 Novembre 2026


PLATEFORME ERP D'ENTREPRISE • NORMES TUNISIENNES & INTERNATIONALES
SAFE ERP Global • Suite Intégrale d'Entreprise
Dossier Complet : Architecture Système, Cahier des Charges des 28 Modules & Guide Global


| VALIDATION OFFICIELLE EXPERT-COMPTABLE — Dossier technique, fonctionnel et opérationnel exhaustif regroupant l'Architecture logicielle, le Cahier des charges conforme à la législation tunisienne et le Manuel d'utilisation pas-à-pas. |
| --- |



# Partie I : Architecture Technique & Logicielle Détaillée


Le prologiciel SAFE ERP Global • Suite Intégrale d'Entreprise repose sur une architecture découplée, performante et sécurisée, conçue pour un déploiement autonome ou en synergie directe avec le socle central SAFE ERP. Cette architecture garantit une parfaite étanchéité des données tout en maintenant l'intégrité transactionnelle globale.


| Couche Système | Technologies & Librairies | Rôle & Détails Techniques |
| --- | --- | --- |
| Frontend Universel | React 19, TypeScript, Vite, TailwindCSS | Interface multi-entités, mode sombre/clair, support natif RTL Arabe, 46 panneaux |
| Backend API REST | Node.js 20+, Express, TypeScript, scrypt | 28 micro-modules étanches, middleware RBAC, contrôle SoD, service TTN |
| Persistance & ORM | Prisma 6.x, SQLite (Local) / PostgreSQL | 131 tables relationnelles, 81 migrations versionnées, transactions ACID |
| Sécurité & Traçabilité | SHA-256 chain, HMAC-SHA256, scrypt | Piste d'audit cryptographique immuable (JournalEntryAuditChainHead) |
| Facturation Électronique | XML UBL 2.1, TunTrust PKI, CEV 2D-Doc | Homologation nationale Tunisie TradeNet (TTN) El Fatoora |



## 1.1 Sécurité, Contrôle d'Accès & Inviolabilité


L'accès au prologiciel est gouverné par une matrice de contrôle RBAC (Role-Based Access Control) stricte. Chaque opération d'écriture, de validation ou d'émission est horodatée et attribuée à un acteur certifié. Les données sensibles (salaires, données personnelles, coordonnées bancaires) sont cloisonnées au niveau applicatif.


# Partie II : Cahier des Charges Fonctionnel & Législation Tunisienne


Ce prologiciel a été conçu et paramétré pour respecter à 100 % le corpus juridique, fiscal et comptable en vigueur en République Tunisienne. L'ensemble des règles et formules de calcul a été audité et validé par l'expert-comptable du projet :


• Couverture fonctionnelle intégrale des 28 modules métiers de l'entreprise moderne.


• Conformité SCE (Loi 96-112), TVA tunisienne (19/13/7/0%), IRPP 8 tranches, CNSS 9.68%, FOPROLOS 1%, CSS 0.5%.


• Moteur multi-devises et conversion IAS 21 avec gestion des écarts de change latents et réalisés.


• Consolidation groupe multi-filiales avec élimination automatique des transactions intercompagnies.


• Contrôle strict de la séparation des tâches (SoD) et inviolabilité des périodes comptables closes.


# Partie III : Mode de Fonctionnement & Guide Utilisateur Pas-à-Pas


Ce guide opératoire détaille les flux de travail standard et les bonnes pratiques d'exploitation au quotidien :


## 1. Connexion & Sélection du Contexte Filiale


Se connecter avec son identifiant et mot de passe sécurisé. Choisir l'entité de travail (Safe Tunisie Industries TN01, Holding Groupe GRP00, etc.) et la devise de référence.


## 2. Navigation par Espace de Travail ou Barre Latérale


Accéder aux 28 modules métiers via le sélecteur universel ou la page d'accueil personnalisée selon les droits RBAC du profil.


## 3. Bascule Instantanée vers un Prologiciel Métier Dédié


Utiliser le sélecteur 'Prologiciel' dans la barre supérieure pour filtrer l'interface en mode vertical dédié (Facturation, Stocks, Paie, RH, Comptabilité, Production).


## 4. Clôture Périodique & Verrouillage Hermétique


Exécuter la checklist de clôture mensuelle dans 'Clôture mensuelle'. Le verrouillage empêche toute altération ultérieure.


## 5. Édition des Plaquettes & Rapports Financiers


Générer les liasses fiscales, comptes de résultat (P&L), bilans et rapports de gestion en exports Excel multi-onglets ou PDF officiels.
