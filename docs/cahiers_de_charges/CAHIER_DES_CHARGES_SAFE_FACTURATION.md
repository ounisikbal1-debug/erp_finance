
SAFE ERP • SUITE MÉTIER TUNISIE
Normes Comptables SCE & Réglementation Fiscale Tunisienne
Arrêté de validation : 18 Novembre 2026


PROLOGICIEL MÉTIER • FACTURATION & FISCALITÉ VENTES/ACHATS
SAFE Facturation (Achat & Vente)
Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation E-Facture TTN & SCE


| VALIDATION OFFICIELLE EXPERT-COMPTABLE — Dossier technique, fonctionnel et opérationnel exhaustif regroupant l'Architecture logicielle, le Cahier des charges conforme à la législation tunisienne et le Manuel d'utilisation pas-à-pas. |
| --- |



# Partie I : Architecture Technique & Logicielle Détaillée


Le prologiciel SAFE Facturation (Achat & Vente) repose sur une architecture découplée, performante et sécurisée, conçue pour un déploiement autonome ou en synergie directe avec le socle central SAFE ERP. Cette architecture garantit une parfaite étanchéité des données tout en maintenant l'intégrité transactionnelle globale.


| Composant | Technologie | Rôle & Détails Techniques |
| --- | --- | --- |
| Frontend UI | React 19, TypeScript, TailwindCSS | Interface de facturation temps réel, visualiseur XML UBL, modal CEV/QR |
| Backend API | Node.js 20+, Express REST, crypto | Endpoints /api/sales, /api/purchases, /api/sales/e-invoices, middleware RBAC |
| Base de Données | SQLite (Local) / PostgreSQL (Prod) | Tables : Invoice, InvoiceItem, TunisianEInvoice, PurchaseInvoice, Vendor, Customer |
| Moteur Cryptographique | SHA-256, TunTrust PKI (X.509) | Scellement d'intégrité SHA-256 et signature numérique qualifiée ANCE |
| Standard de Flux | OASIS UBL 2.1 Invoice XML | Conforme au profil national d'interopérabilité Tunisie TradeNet (TTN) |



## 1.1 Sécurité, Contrôle d'Accès & Inviolabilité


L'accès au prologiciel est gouverné par une matrice de contrôle RBAC (Role-Based Access Control) stricte. Chaque opération d'écriture, de validation ou d'émission est horodatée et attribuée à un acteur certifié. Les données sensibles (salaires, données personnelles, coordonnées bancaires) sont cloisonnées au niveau applicatif.


# Partie II : Cahier des Charges Fonctionnel & Législation Tunisienne


Ce prologiciel a été conçu et paramétré pour respecter à 100 % le corpus juridique, fiscal et comptable en vigueur en République Tunisienne. L'ensemble des règles et formules de calcul a été audité et validé par l'expert-comptable du projet :


• Conformité Décret n° 2016-1098 & Décret-loi n° 2021-21 : Émission et archivage probant des factures électroniques El Fatoora.


• Taux de TVA tunisiens : 19 % (taux standard), 13 % (prestations de services qualifiées), 7 % (matières et équipements) et 0 % (exportations).


• Droit de Timbre Fiscal : 1,000 DT obligatoire par facture client émise (compte 432).


• Retenue à la Source (RS) : 1,5 % sur tout marché et achat supérieur ou égal à 1 000 DT TTC (Art. 52 Code IRPP/IS), 0,5 % et 15 % sur honoraires.


• Workflow de validation à séparation des tâches (SoD) : DRAFT -> TO_REVIEW -> APPROVED -> ISSUED -> PAID.


# Partie III : Mode de Fonctionnement & Guide Utilisateur Pas-à-Pas


Ce guide opératoire détaille les flux de travail standard et les bonnes pratiques d'exploitation au quotidien :


## 1. Création d'un Devis & Bon de Commande Client


Accéder au sous-menu 'Devis & Commandes'. Renseigner le client, la date d'échéance et les lignes d'articles. Le système calcule automatiquement le sous-total HT, la TVA selon le taux de l'article, et le timbre fiscal de 1 DT. Valider le bon de commande.


## 2. Émission d'une Facture de Vente


Cliquer sur 'Nouvelle Facture' ou convertir un bon de commande. Le statut passe à TO_REVIEW. Un réviseur habilité valide la conformité comptable (APPROVED), puis l'agent de facturation émet la facture (ISSUED). L'écriture comptable client (411 au Débit / 701 et 4367 au Crédit) est immédiatement générée.


## 3. Génération & Transmission E-Facture TTN (El Fatoora)


Dans l'onglet 'E-Factures TTN (El Fatoora)', cliquer sur 'Générer Tout & TTN' ou sur l'action individuelle. Le système génère le XML UBL 2.1, calcule le hash SHA-256, appose le certificat TunTrust et télétransmet le flux à TTN. L'accusé de réception TTN (ex: TTN-2026-000184) et le CEV 2D-Doc sont générés.


## 4. Saisie des Factures d'Achat & Rapprochement 3-Way


Dans 'Achats & Fournisseurs', saisir la facture fournisseur reçue. Indiquer le bon de commande d'origine et le bon de réception magasin. Si le montant TTC est >= 1 000 DT, le système génère automatiquement le certificat de Retenue à la Source (RS).


## 5. Suivi des Encaissements, Décaissements & Lettrage


Lors de la réception du virement ou du chèque bancaire, enregistrer l'encaissement. La facture passe au statut PAID et les écritures de lettrage au compte 411/532 sont équilibrées.
