
SAFE ERP â€¢ SUITE MÃ‰TIER TUNISIE
Normes Comptables SCE & RÃ©glementation Fiscale Tunisienne
ArrÃªtÃ© de validation : 18 Novembre 2026


PLATEFORME ERP D'ENTREPRISE â€¢ NORMES TUNISIENNES & INTERNATIONALES
SAFE ERP Global â€¢ Suite IntÃ©grale d'Entreprise
Dossier Complet : Architecture SystÃ¨me, Cahier des Charges des 28 Modules & Guide Global


| VALIDATION OFFICIELLE EXPERT-COMPTABLE â€” Dossier technique, fonctionnel et opÃ©rationnel exhaustif regroupant l'Architecture logicielle, le Cahier des charges conforme Ã  la lÃ©gislation tunisienne et le Manuel d'utilisation pas-Ã -pas. |
| --- |



# Partie I : Architecture Technique & Logicielle DÃ©taillÃ©e


Le prologiciel SAFE ERP Global â€¢ Suite IntÃ©grale d'Entreprise repose sur une architecture dÃ©couplÃ©e, performante et sÃ©curisÃ©e, conÃ§ue pour un dÃ©ploiement autonome ou en synergie directe avec le socle central SAFE ERP. Cette architecture garantit une parfaite Ã©tanchÃ©itÃ© des donnÃ©es tout en maintenant l'intÃ©gritÃ© transactionnelle globale.


| Couche SystÃ¨me | Technologies & Librairies | RÃ´le & DÃ©tails Techniques |
| --- | --- | --- |
| Frontend Universel | React 19, TypeScript, Vite, TailwindCSS | Interface multi-entitÃ©s, mode sombre/clair, support natif RTL Arabe, 46 panneaux |
| Backend API REST | Node.js 20+, Express, TypeScript, scrypt | 28 micro-modules Ã©tanches, middleware RBAC, contrÃ´le SoD, service TTN |
| Persistance & ORM | Prisma 6.x, SQLite (Local) / PostgreSQL | 131 tables relationnelles, 81 migrations versionnÃ©es, transactions ACID |
| SÃ©curitÃ© & TraÃ§abilitÃ© | SHA-256 chain, HMAC-SHA256, scrypt | Piste d'audit cryptographique immuable (JournalEntryAuditChainHead) |
| Facturation Ã‰lectronique | XML UBL 2.1, TunTrust PKI, CEV 2D-Doc | Homologation nationale Tunisie TradeNet (TTN) El Fatoora |



## 1.1 SÃ©curitÃ©, ContrÃ´le d'AccÃ¨s & InviolabilitÃ©


L'accÃ¨s au prologiciel est gouvernÃ© par une matrice de contrÃ´le RBAC (Role-Based Access Control) stricte. Chaque opÃ©ration d'Ã©criture, de validation ou d'Ã©mission est horodatÃ©e et attribuÃ©e Ã  un acteur certifiÃ©. Les donnÃ©es sensibles (salaires, donnÃ©es personnelles, coordonnÃ©es bancaires) sont cloisonnÃ©es au niveau applicatif.


# Partie II : Cahier des Charges Fonctionnel & LÃ©gislation Tunisienne


Ce prologiciel a Ã©tÃ© conÃ§u et paramÃ©trÃ© pour respecter Ã  100 % le corpus juridique, fiscal et comptable en vigueur en RÃ©publique Tunisienne. L'ensemble des rÃ¨gles et formules de calcul a Ã©tÃ© auditÃ© et validÃ© par l'expert-comptable du projet :


â€¢ Couverture fonctionnelle intÃ©grale des 28 modules mÃ©tiers de l'entreprise moderne.


â€¢ ConformitÃ© SCE (Loi 96-112), TVA tunisienne (19/13/7/0%), IRPP 8 tranches, CNSS 9.68%, FOPROLOS 1%, CSS 0.5%.


â€¢ Moteur multi-devises et conversion IAS 21 avec gestion des Ã©carts de change latents et rÃ©alisÃ©s.


â€¢ Consolidation groupe multi-filiales avec Ã©limination automatique des transactions intercompagnies.


â€¢ ContrÃ´le strict de la sÃ©paration des tÃ¢ches (SoD) et inviolabilitÃ© des pÃ©riodes comptables closes.


# Partie III : Mode de Fonctionnement & Guide Utilisateur Pas-Ã -Pas


Ce guide opÃ©ratoire dÃ©taille les flux de travail standard et les bonnes pratiques d'exploitation au quotidien :


## 1. Connexion & SÃ©lection du Contexte Filiale


Se connecter avec son identifiant et mot de passe sÃ©curisÃ©. Choisir l'entitÃ© de travail (Safe Tunisie Industries TN01, Holding Groupe GRP00, etc.) et la devise de rÃ©fÃ©rence.


## 2. Navigation par Espace de Travail ou Barre LatÃ©rale


AccÃ©der aux 28 modules mÃ©tiers via le sÃ©lecteur universel ou la page d'accueil personnalisÃ©e selon les droits RBAC du profil.


## 3. Bascule InstantanÃ©e vers un Prologiciel MÃ©tier DÃ©diÃ©


Utiliser le sÃ©lecteur 'Prologiciel' dans la barre supÃ©rieure pour filtrer l'interface en mode vertical dÃ©diÃ© (Facturation, Stocks, Paie, RH, ComptabilitÃ©, Production).


## 4. ClÃ´ture PÃ©riodique & Verrouillage HermÃ©tique


ExÃ©cuter la checklist de clÃ´ture mensuelle dans 'ClÃ´ture mensuelle'. Le verrouillage empÃªche toute altÃ©ration ultÃ©rieure.


## 5. Ã‰dition des Plaquettes & Rapports Financiers


GÃ©nÃ©rer les liasses fiscales, comptes de rÃ©sultat (P&L), bilans et rapports de gestion en exports Excel multi-onglets ou PDF officiels.
