import os, sys, datetime, docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

BASE_DIR = r"C:\Users\USER\OneDrive\Desktop\SAFE_ERP_DRAFT 4"
DESKTOP_DIR = r"C:\Users\USER\OneDrive\Desktop"

# Charte Typographique Sobre & Élégante
FONT_PRIMARY = "Calibri"
COLOR_NAVY_SLATE = RGBColor(15, 23, 42)     # #0F172A
COLOR_STEEL_BLUE = RGBColor(30, 58, 138)    # #1E3A8A
COLOR_SUBTITLE   = RGBColor(71, 85, 105)    # #475569
COLOR_MUTED      = RGBColor(100, 116, 139)  # #64748B
COLOR_BODY       = RGBColor(30, 41, 59)     # #1E293B

def set_cell_background(cell, fill_hex):
    tcPr = cell._element.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill_hex)
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=140, right=140):
    tcPr = cell._element.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def create_styled_table(doc, headers, data, col_widths=None):
    table = doc.add_table(rows=len(data) + 1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].text = title
        set_cell_background(hdr_cells[i], '0F172A')  # Ardoise Noble Sobre
        set_cell_margins(hdr_cells[i], top=120, bottom=120, left=140, right=140)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in p.runs:
            run.font.bold = True
            run.font.color.rgb = RGBColor(255, 255, 255)
            run.font.size = Pt(9.5)
            run.font.name = FONT_PRIMARY

    for r_idx, row in enumerate(data):
        row_cells = table.rows[r_idx + 1].cells
        bg_color = 'F8FAFC' if r_idx % 2 == 1 else 'FFFFFF'
        for c_idx, val in enumerate(row):
            row_cells[c_idx].text = str(val)
            set_cell_background(row_cells[c_idx], bg_color)
            set_cell_margins(row_cells[c_idx], top=75, bottom=75, left=120, right=120)
            p = row_cells[c_idx].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            for run in p.runs:
                run.font.size = Pt(9)
                run.font.name = FONT_PRIMARY
                run.font.color.rgb = COLOR_BODY

    if col_widths and len(col_widths) == len(headers):
        for row in table.rows:
            for idx, width in enumerate(col_widths):
                row.cells[idx].width = Inches(width)

    doc.add_paragraph()
    return table

def add_header_styled(doc, text, level):
    h = doc.add_heading(text, level=level)
    for run in h.runs:
        run.font.name = FONT_PRIMARY
        if level == 1:
            run.font.color.rgb = COLOR_NAVY_SLATE
            run.font.size = Pt(14.5)
            run.font.bold = True
        elif level == 2:
            run.font.color.rgb = COLOR_STEEL_BLUE
            run.font.size = Pt(12)
            run.font.bold = True
        elif level == 3:
            run.font.color.rgb = COLOR_SUBTITLE
            run.font.size = Pt(10.5)
            run.font.bold = True
    return h

def add_callout(doc, text, title="NOTE DE CONFORMITÉ"):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    set_cell_background(cell, 'F8FAFC')
    set_cell_margins(cell, top=100, bottom=100, left=160, right=160)
    p = cell.paragraphs[0]
    r_title = p.add_run(f"{title} — ")
    r_title.bold = True
    r_title.font.color.rgb = COLOR_STEEL_BLUE
    r_title.font.size = Pt(9.5)
    r_title.font.name = FONT_PRIMARY
    r_text = p.add_run(text)
    r_text.font.size = Pt(9)
    r_text.font.color.rgb = COLOR_BODY
    r_text.font.name = FONT_PRIMARY
    doc.add_paragraph()

def build_cover_page(doc, title, subtitle, badge_text):
    p_meta = doc.add_paragraph()
    p_meta.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r_corp = p_meta.add_run("SAFE ERP • SUITE MÉTIER TUNISIE\nNormes Comptables SCE & Réglementation Fiscale Tunisienne\nArrêté de validation : 18 Novembre 2026")
    r_corp.font.size = Pt(8.5)
    r_corp.font.color.rgb = COLOR_MUTED
    r_corp.font.name = FONT_PRIMARY

    doc.add_paragraph("\n\n")

    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r_type = p_title.add_run(f"{badge_text.upper()}\n")
    r_type.font.size = Pt(11)
    r_type.font.bold = True
    r_type.font.color.rgb = COLOR_STEEL_BLUE
    r_type.font.name = FONT_PRIMARY

    r_title = p_title.add_run(f"{title}\n")
    r_title.font.size = Pt(22)
    r_title.font.bold = True
    r_title.font.color.rgb = COLOR_NAVY_SLATE
    r_title.font.name = FONT_PRIMARY

    r_sub = p_title.add_run(f"{subtitle}\n")
    r_sub.font.size = Pt(12)
    r_sub.font.color.rgb = COLOR_SUBTITLE
    r_sub.font.name = FONT_PRIMARY

    doc.add_paragraph("\n")

    add_callout(doc, 
        "Dossier technique, fonctionnel et opérationnel exhaustif regroupant l'Architecture logicielle, "
        "le Cahier des charges conforme à la législation tunisienne et le Manuel d'utilisation pas-à-pas.",
        "VALIDATION OFFICIELLE EXPERT-COMPTABLE"
    )

    doc.add_page_break()

DOSSIERS = [
    {
        "id": "facturation",
        "file_name": "DOSSIER_COMPLET_SAFE_FACTURATION.docx",
        "folder": "SAFE_Facturation",
        "title": "SAFE Facturation (Achat & Vente)",
        "subtitle": "Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation E-Facture TTN & SCE",
        "badge": "Prologiciel Métier • Facturation & Fiscalité Ventes/Achats",
        "arch_stack": [
            ["Composant", "Technologie", "Rôle & Détails Techniques"],
            ["Frontend UI", "React 19, TypeScript, TailwindCSS", "Interface de facturation temps réel, visualiseur XML UBL, modal CEV/QR"],
            ["Backend API", "Node.js 20+, Express REST, crypto", "Endpoints /api/sales, /api/purchases, /api/sales/e-invoices, middleware RBAC"],
            ["Base de Données", "SQLite (Local) / PostgreSQL (Prod)", "Tables : Invoice, InvoiceItem, TunisianEInvoice, PurchaseInvoice, Vendor, Customer"],
            ["Moteur Cryptographique", "SHA-256, TunTrust PKI (X.509)", "Scellement d'intégrité SHA-256 et signature numérique qualifiée ANCE"],
            ["Standard de Flux", "OASIS UBL 2.1 Invoice XML", "Conforme au profil national d'interopérabilité Tunisie TradeNet (TTN)"]
        ],
        "cdc_rules": [
            "Conformité Décret n° 2016-1098 & Décret-loi n° 2021-21 : Émission et archivage probant des factures électroniques El Fatoora.",
            "Taux de TVA tunisiens : 19 % (taux standard), 13 % (prestations de services qualifiées), 7 % (matières et équipements) et 0 % (exportations).",
            "Droit de Timbre Fiscal : 1,000 DT obligatoire par facture client émise (compte 432).",
            "Retenue à la Source (RS) : 1,5 % sur tout marché et achat supérieur ou égal à 1 000 DT TTC (Art. 52 Code IRPP/IS), 0,5 % et 15 % sur honoraires.",
            "Workflow de validation à séparation des tâches (SoD) : DRAFT -> TO_REVIEW -> APPROVED -> ISSUED -> PAID."
        ],
        "user_guide": [
            ("1. Création d'un Devis & Bon de Commande Client", "Accéder au sous-menu 'Devis & Commandes'. Renseigner le client, la date d'échéance et les lignes d'articles. Le système calcule automatiquement le sous-total HT, la TVA selon le taux de l'article, et le timbre fiscal de 1 DT. Valider le bon de commande."),
            ("2. Émission d'une Facture de Vente", "Cliquer sur 'Nouvelle Facture' ou convertir un bon de commande. Le statut passe à TO_REVIEW. Un réviseur habilité valide la conformité comptable (APPROVED), puis l'agent de facturation émet la facture (ISSUED). L'écriture comptable client (411 au Débit / 701 et 4367 au Crédit) est immédiatement générée."),
            ("3. Génération & Transmission E-Facture TTN (El Fatoora)", "Dans l'onglet 'E-Factures TTN (El Fatoora)', cliquer sur 'Générer Tout & TTN' ou sur l'action individuelle. Le système génère le XML UBL 2.1, calcule le hash SHA-256, appose le certificat TunTrust et télétransmet le flux à TTN. L'accusé de réception TTN (ex: TTN-2026-000184) et le CEV 2D-Doc sont générés."),
            ("4. Saisie des Factures d'Achat & Rapprochement 3-Way", "Dans 'Achats & Fournisseurs', saisir la facture fournisseur reçue. Indiquer le bon de commande d'origine et le bon de réception magasin. Si le montant TTC est >= 1 000 DT, le système génère automatiquement le certificat de Retenue à la Source (RS)."),
            ("5. Suivi des Encaissements, Décaissements & Lettrage", "Lors de la réception du virement ou du chèque bancaire, enregistrer l'encaissement. La facture passe au statut PAID et les écritures de lettrage au compte 411/532 sont équilibrées.")
        ]
    },
    {
        "id": "stocks",
        "file_name": "DOSSIER_COMPLET_SAFE_GESTION_DES_STOCKS.docx",
        "folder": "SAFE_Gestion_des_Stocks",
        "title": "SAFE Gestion des Stocks & Entrepôts (MM)",
        "subtitle": "Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Valorisation PUMP & Douanes",
        "badge": "Prologiciel Métier • Stocks, Logistique & Douanes AT/ACT",
        "arch_stack": [
            ["Composant", "Technologie", "Rôle & Détails Techniques"],
            ["Frontend UI", "React 19, TypeScript, Tables dynamiques", "Gestion multi-dépôts, fiches articles, alertes de stock mini/maxi, régimes AT"],
            ["Backend API", "Node.js Express, Service Materials", "Endpoints /api/materials, /api/customs, calcul atomique du PUMP, traçabilité des lots"],
            ["Base de Données", "SQLite / PostgreSQL relationnel", "Tables : Material, Warehouse, StockMovement, MaterialWarehouseStock, CustomsDutyRegime"],
            ["Méthode de Valorisation", "Norme Comptable NCT 04", "Coût Moyen Unitaire Pondéré (PUMP / CMP) recalculé à chaque entrée en stock"],
            ["Contrôle Douanier", "Code des Douanes Tunisien", "Comptes d'apurement Admission Temporaire (AT / ACT) et suivi des cautions bancaires"]
        ],
        "cdc_rules": [
            "Conformité NCT 04 : Valorisation obligatoire au Coût Moyen Unitaire Pondéré (CMP / PUMP) ou FIFO.",
            "Inventaire physique obligatoire au moins une fois par an avec justification formelle de chaque écart (perte, coulage, avarie).",
            "Gestion des Régimes Douaniers Suspensifs : Admission Temporaire pour Perfectionnement Actif (AT/ACT) avec délais légaux de réexportation.",
            "Étanchéité des dépôts : Impossibilité de mouvementer un stock en valeur négative (contrôle bloquant à la saisie).",
            "Mise à jour atomique des stocks lors de la réception des commandes d'achat et des sorties pour ordres de fabrication (OF)."
        ],
        "user_guide": [
            ("1. Création des Dépôts et Magasins", "Dans le module 'Stocks & Entrepôts', créer les différents entrepôts (Dépôt Principal Matières, Magasin Pièces, Entrepôt Produits Finis, Dépôt Sous Douane AT)."),
            ("2. Création des Articles & Paramétrage des Seuils", "Définir la référence article, la désignation, l'unité de mesure (Kg, Pièce, Mètre, Litre), le stock de sécurité et le stock d'alerte pour réapprovisionnement automatique."),
            ("3. Enregistrement d'une Entrée de Stock (Réception Achat)", "À la livraison du fournisseur, créer un Bon de Réception lié à la commande d'achat. Le stock physique augmente et le PUMP est automatiquement recalculé selon la formule : (Valeur Ancien Stock + Valeur Nouvelle Entrée) / (Quantité Totale)."),
            ("4. Transfert Inter-Dépôts & Sorties de Fabrication", "Effectuer les transferts d'un dépôt à un autre avec traçabilité de l'émetteur et du récepteur. Les sorties pour fabrication débitent le stock matières au PUMP en vigueur."),
            ("5. Réalisation des Inventaires Physiques", "Éditer la liste d'inventaire à blanc. Saisir les quantités réelles comptées. Le système met en évidence les écarts d'inventaire et génère les écritures comptables de régularisation (compte 603 / 311)."),
            ("6. Gestion des Régimes Douaniers (AT / ACT)", "Enregistrer les déclarations de douane d'importation temporaire, suivre les cautions bancaires engagées et apurer les comptes lors de la réexportation des produits finis.")
        ]
    },
    {
        "id": "paie",
        "file_name": "DOSSIER_COMPLET_SAFE_PAIE.docx",
        "folder": "SAFE_Paie",
        "title": "SAFE Paie Tunisienne & Déclarations Sociales",
        "subtitle": "Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Moteur IRPP, CNSS & Bulletins",
        "badge": "Prologiciel Métier • Paie & Déclarations Légales Tunisiennes",
        "arch_stack": [
            ["Composant", "Technologie", "Rôle & Détails Techniques"],
            ["Frontend UI", "React 19, TailwindCSS, Éditeur de fiches", "Simulateur Net/Brut, livre de paie, bulletins imprimables normalisés en TND"],
            ["Backend API", "Node.js Express, Service HR Payroll", "Moteur de calcul IRPP progressif 8 tranches, plafonds CNSS, FOPROLOS, CSS"],
            ["Base de Données", "Prisma ORM, SQLite / PostgreSQL", "Tables : Employee, Payslip, PayrollConfig, PayrollRubrique, PayrollTaxBracket"],
            ["Précision Monétaire", "Millièmes de Dinar Tunisien (TND)", "Calcul exact à 3 décimales, aucun arrondi intermédiaire déviant"],
            ["Sécurité RH", "Chiffrement & RBAC Strict", "Données salariales strictement restreintes aux rôles HR_MANAGER et ADMIN"]
        ],
        "cdc_rules": [
            "Barème IRPP Progressif à 8 tranches conforme à la Loi de Finances tunisienne en vigueur.",
            "Déductions familiales légales déductibles de l'assiette imposable : 300 DT / an pour le chef de famille, 100 DT / an par enfant à charge.",
            "Cotisation CNSS obligatoire : 9,18 % part salariale régime général + 0,5 % maladie/complémentaire = 9,68 % total salarial.",
            "Cotisation patronale CNSS : 16,57 % pour le secteur non-agricole, incluant les prestations familiales et les accidents de travail.",
            "FOPROLOS : Taxe patronale de 1 % sur la masse salariale brute pour le Fonds de Promotion du Logement.",
            "Contribution Sociale de Solidarité (CSS) : 0,5 % applicable sur le revenu imposable pour le redressement des caisses de retraite.",
            "Déclaration Trimestrielle des Salaires CNSS (DS) obligatoire avant le 15 du mois suivant le trimestre échu."
        ],
        "user_guide": [
            ("1. Configuration des Rubriques de Paie & Barèmes", "Accéder aux paramètres de paie. Vérifier l'activation du barème IRPP à 8 tranches, du taux CNSS (9.68%), du FOPROLOS (1%) et de la CSS (0.5%)."),
            ("2. Fiche Salarié & Données Fiscales / Familiales", "Pour chaque employé, renseigner le statut familial (Marié / Célibataire), le nombre d'enfants à charge, le matricule CNSS et le salaire de base contractuel en TND."),
            ("3. Saisie des Éléments Variables du Mois", "Renseigner les heures supplémentaires effectuées (bonifiées à 25%, 50% ou 100%), les primes de rendement, indemnités de transport et retenues sur absences ou acomptes."),
            ("4. Lancement du Calcul de la Paie", "Cliquer sur 'Calculer la Paie du Mois'. Le moteur déroule séquentiellement : Brut -> Déduction CNSS 9.68% -> Salaire Imposable -> Déductions familiales -> IRPP progressif -> CSS 0.5% -> Salaire Net à payer au millime."),
            ("5. Impression des Bulletins & Livre de Paie", "Générer les bulletins de paie individuels au format officiel et exporter le Livre de Paie mensuel pour transmission à l'expert-comptable et à l'inspection du travail."),
            ("6. Édition de la Déclaration Trimestrielle CNSS (DS)", "À la fin de chaque trimestre (mars, juin, septembre, décembre), générer l'état récapitulatif CNSS avec ventilation des salaires plafonnés et cotisations dues.")
        ]
    },
    {
        "id": "rh",
        "file_name": "DOSSIER_COMPLET_SAFE_GESTION_RH.docx",
        "folder": "SAFE_Gestion_RH",
        "title": "SAFE Gestion des Ressources Humaines & Talents",
        "subtitle": "Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Contrats, Congés & GPEC",
        "badge": "Prologiciel Métier • Capital Humain & Code du Travail Tunisien",
        "arch_stack": [
            ["Composant", "Technologie", "Rôle & Détails Techniques"],
            ["Frontend UI", "React 19, TypeScript, Calendrier interactif", "Dossier collaborateur 360°, gestion des congés, organigramme, fiches GPEC"],
            ["Backend API", "Node.js Express, Service HR Workflows", "Endpoints /api/hr, gestion des approbations de congés, suivi des contrats"],
            ["Base de Données", "Prisma ORM, SQLite / PostgreSQL", "Tables : Employee, LeaveRequest, HrDocumentMetadata, EmployeeContractHistory"],
            ["Calendrier Légal", "Jours Fériés Tunisiens", "Gestion native des jours fériés légaux et chômés de la République Tunisienne"],
            ["Protection Données", "RGPD & Normes INPDP", "Conformité à l'Instance Nationale de Protection des Données Personnelles (INPDP)"]
        ],
        "cdc_rules": [
            "Conformité Code du Travail Tunisien (Loi n° 66-27 modifiée) régissant les contrats et conditions de travail.",
            "Gestion des différents types de contrats légaux : CDI, CDD, CIVP (ex-SIVP), Contrat d'Apprentissage (CAIP), Contrat Karama.",
            "Articles 112 et suivants : Droit au congé payé légal fixé à 1 jour ouvrable par mois de travail effectif, majoré pour ancienneté.",
            "Suivi de la Médecine du Travail obligatoire (visite d'embauche et visites périodiques annuelles).",
            "Édition obligatoire du Solde de Tout Compte, du Certificat de Travail et de l'Attestation de Salaire lors du départ d'un collaborateur."
        ],
        "user_guide": [
            ("1. Création & Gestion des Dossiers Collaborateurs", "Créer la fiche du collaborateur : CIN, matricule interne, matricule CNSS, date de naissance, situation de famille, diplômes et fonction."),
            ("2. Gestion des Contrats & Périodes d'Essai", "Saisir le type de contrat (CDI, CDD, CIVP avec convention ANETI). Renseigner la date d'embauche, la durée de la période d'essai et les dates de renouvellement. Le système alerte sur les échéances."),
            ("3. Circuit de Validation des Congés Payés", "Le collaborateur soumet sa demande de congé (Annuel, Maladie, Maternité, Mariage, Décès). Le responsable hiérarchique reçoit la notification et approuve ou refuse. Le solde de congé est décompté automatiquement."),
            ("4. Suivi Médical & Sécurité au Travail", "Enregistrer les dates des visites médicales d'embauche et périodiques effectuées auprès du Groupement de Médecine du Travail (GMT)."),
            ("5. Gestion Prévisionnelle des Emplois & Compétences (GPEC)", "Évaluer les compétences des collaborateurs lors des entretiens annuels, définir les plans de formation professionnelle et suivre l'évolution des carrières."),
            ("6. Édition des Documents Légaux", "Générer en un clic les attestations de travail, attestations de salaire, certificats d'emploi et reçus de solde de tout compte avec décharge signée.")
        ]
    },
    {
        "id": "comptabilite",
        "file_name": "DOSSIER_COMPLET_SAFE_COMPTABILITE_FISCALITE.docx",
        "folder": "SAFE_Comptabilite_Fiscalite",
        "title": "SAFE Comptabilité Générale & Fiscalité Tunisienne",
        "subtitle": "Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation SCE, G50 & IS 20%",
        "badge": "Prologiciel Métier • Normes Comptables SCE & Liasses Fiscales",
        "arch_stack": [
            ["Composant", "Technologie", "Rôle & Détails Techniques"],
            ["Frontend UI", "React 19, Grilles comptables haute performance", "Saisie horizontale, Balance 8 colonnes, Grand Livre interactif, Déclarations G50"],
            ["Backend API", "Node.js Express, Service Finance & Tax", "Endpoints /api/finance, /api/tax-declarations, validation stricte Débit = Crédit"],
            ["Base de Données", "Prisma ORM, SQLite / PostgreSQL", "Tables : ChartOfAccount, JournalEntry, JournalLine, TaxDeclarationWorkpaper, BankAccount"],
            ["Audit & Sécurité", "Chaîne Cryptographique SHA-256", "Inviolabilité des journaux par table JournalEntryAuditChainHead"],
            ["Clôture Périodique", "Verrouillage Temporel Hermétique", "Interdiction d'insertion ou modification sur périodes closes (MonthlyCloseLock)"]
        ],
        "cdc_rules": [
            "Conformité absolue à la Loi n° 96-112 portant promulgation du Système Comptable des Entreprises (SCE tunisien).",
            "Plan de comptes standard tunisien (Classes 1 à 7) avec tenue des écritures en partie double équilibrées au millime.",
            "Déclaration Fiscale Mensuelle G50 obligatoire avant le 28 de chaque mois (TVA collectée, TVA déductible, Droit de timbre, Retenue à la source).",
            "Impôt sur les Sociétés (IS) au taux normal légal de 20 % calculé sur le résultat fiscal annuel.",
            "Règle de séparation des tâches (SoD) : Interdiction pour un utilisateur de valider ou poster une écriture dont il est l'auteur.",
            "Immutabilité légale : Une fois un journal clôturé, aucune écriture antidatée ne peut être insérée ni modifiée."
        ],
        "user_guide": [
            ("1. Plan Comptable & Journaux Auxiliaires", "Consulter le plan de comptes officiel tunisien préconfiguré. Créer les journaux nécessaires (Achats ACH, Ventes VEN, Banque BQ, Caisse CA, Opérations Diverses OD)."),
            ("2. Saisie Comptable Horizontale Rapide", "Dans le module 'Saisie Comptable Horizontale', renseigner la date, le journal, le numéro de pièce et le libellé. Ajouter les lignes de comptes. Le système vérifie en temps réel que Total Débit = Total Crédit avant d'autoriser l'enregistrement."),
            ("3. Consultation du Grand Livre & Lettrage", "Filtrer le Grand Livre par compte (ex: 411 Clients ou 401 Fournisseurs) et par période. Effectuer le lettrage manuel ou automatique des règlements avec les factures correspondantes."),
            ("4. Balance Générale des Comptes à 8 Colonnes", "Éditer la balance générale à 8 colonnes : Solde Débiteur/Créditeur d'ouverture, Mouvements Débit/Crédit du mois, Cumuls Mouvements, Soldes Débiteurs/Créditeurs de clôture."),
            ("5. Rapprochement Bancaire (STB, BIAT, BH, BNA)", "Importer les relevés bancaires. Rapprocher les lignes du relevé bancaire avec les écritures du compte 532. Le système calcule l'état de rapprochement exact et détecte les chèques en circulation."),
            ("6. Préparation de la Déclaration Fiscale G50", "À la fin de chaque mois, ouvrir le panneau 'Déclarations Fiscales (G50)'. Le système consolide automatiquement la TVA collectée (19%, 13%, 7%), la TVA déductible, le timbre fiscal et les retenues à la source. L'expert-comptable valide et approuve la déclaration.")
        ]
    },
    {
        "id": "production",
        "file_name": "DOSSIER_COMPLET_SAFE_PRODUCTION_GPAO.docx",
        "folder": "SAFE_Production_GPAO",
        "title": "SAFE Production Industrielle & GPAO",
        "subtitle": "Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Nomenclatures, OF & MRP",
        "badge": "Prologiciel Métier • GPAO, MRP & Maintenance d'Usine",
        "arch_stack": [
            ["Composant", "Technologie", "Rôle & Détails Techniques"],
            ["Frontend UI", "React 19, Gestion visuelle d'ateliers", "Suivi des ordres de fabrication (OF), arbres de nomenclature BOM, planning MRP"],
            ["Backend API", "Node.js Express, Service Production & MRP", "Endpoints /api/production, /api/mrp, calcul des besoins nets et valorisation des en-cours"],
            ["Base de Données", "Prisma ORM, SQLite / PostgreSQL", "Tables : ProductionOrder, BillOfMaterial, BillOfMaterialItem, EquipmentMaintenance"],
            ["Normes Industrielles", "Normes INNORPI & NCT 04", "Évaluation des produits en-cours et valorisation au coût de production standard/réel"],
            ["Intégration Stocks", "Décrémentation Atomique des Composants", "Déstockage automatique des matières premières lors de la déclaration d'achèvement OF"]
        ],
        "cdc_rules": [
            "Gestion des nomenclatures de fabrication multi-niveaux (Bill of Materials - BOM) avec coefficients de pertes.",
            "Traçabilité ascendante et descendante des lots de fabrication conformément aux exigences de certification ISO 9001.",
            "Calcul des Besoins Nets (MRP) synchronisé avec les commandes clients et les délais fournisseurs.",
            "Régularisation comptable obligatoire de la variation des en-cours de production (compte 713).",
            "Suivi de la maintenance préventive et curative des machines de production pour éviter les arrêts d'atelier."
        ],
        "user_guide": [
            ("1. Création des Nomenclatures (BOM)", "Définir la fiche du produit fini et ajouter les composants requis (matières premières, consommables, emballages) avec les quantités unitaires et pourcentages de pertes tolérés."),
            ("2. Lancement des Ordres de Fabrication (OF)", "Générer un ordre de fabrication pour une quantité donnée. Le système vérifie la disponibilité des matières en stock et réserve les composants."),
            ("3. Suivi d'Atelier & Gammes Opératoires", "Pointer les heures machines et les heures de main-d'œuvre directe sur chaque poste de charge (découpe, assemblage, conditionnement)."),
            ("4. Clôture de l'OF & Entrée en Stock Produits Finis", "À l'achèvement du lot, valider la déclaration de production. Le stock de produits finis est automatiquement incrémenté au coût de revient réel, et les stocks de matières sont décrémentés."),
            ("5. Maintenance Préventive des Équipements", "Programmer les entretiens périodiques des machines selon les compteurs d'heures ou le calendrier, et consigner les interventions curatives.")
        ]
    },
    {
        "id": "immobilisations",
        "file_name": "DOSSIER_COMPLET_SAFE_IMMOBILISATIONS.docx",
        "folder": "SAFE_Immobilisations",
        "title": "SAFE Immobilisations & Amortissements",
        "subtitle": "Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Amortissements Fiscaux DGI",
        "badge": "Prologiciel Métier • Actifs Fiscaux & Amortissements DGI",
        "arch_stack": [
            ["Composant", "Technologie", "Rôle & Détails Techniques"],
            ["Frontend UI", "React 19, Tableaux d'amortissement interactifs", "Fichier des immobilisations, simulations d'amortissement linéaire/dégressif, inventaire"],
            ["Backend API", "Node.js Express, Service Assets", "Endpoints /api/assets, calcul automatique prorata temporis et dotations 681/28x"],
            ["Base de Données", "Prisma ORM, SQLite / PostgreSQL", "Tables : FixedAsset, AssetDepreciationLine, AssetCategory, ChartOfAccount"],
            ["Cadre Réglementaire", "Norme Comptable NCT 05 & DGI", "Application des taux d'amortissement fiscalement admis par l'administration tunisienne"]
        ],
        "cdc_rules": [
            "Conformité à la Norme Comptable Tunisienne NCT 05 relative aux immobilisations corporelles et incorporelles.",
            "Calcul d'amortissement linéaire selon la règle du prorata temporis (calcul au jour le jour à compter de la date de mise en service).",
            "Taux d'amortissement fiscaux standards tunisiens : Bâtiments d'exploitation (5%), Agencements et installations (10%), Matériel et outillage (10% à 20%), Matériel de transport (20%), Matériel informatique et logiciels (33,33%).",
            "Comptabilisation automatique des dotations annuelles aux amortissements : Débit 6815 / Crédit 28x.",
            "Traitement fiscal des cessions : Calcul des plus-values ou moins-values de cession (Prix de cession - Valeur Nette Comptable)."
        ],
        "user_guide": [
            ("1. Création d'une Fiche d'Immobilisation", "Renseigner la désignation du bien, la catégorie fiscale, la date d'acquisition, la date de mise en service, la valeur d'origine HT et le fournisseur."),
            ("2. Choix de la Méthode & du Taux d'Amortissement", "Sélectionner la méthode (Linéaire ou Dégressif) et le taux fiscal admis (ex: 20% sur 5 ans pour un véhicule utilitaire)."),
            ("3. Génération du Tableau d'Amortissement Prévisionnel", "Le système génère automatiquement l'échéancier complet année par année avec l'annuité d'amortissement, le cumul des amortissements et la Valeur Nette Comptable (VNC)."),
            ("4. Génération des Écritures de Dotation d'Inventaire", "En fin d'exercice au 31 décembre, cliquer sur 'Générer les Écritures d'Inventaire'. Le système poste automatiquement les écritures équilibrées Débit 681 / Crédit 281 au Grand Livre."),
            ("5. Sortie d'Actif (Cession ou Mise au Rebut)", "En cas de vente ou de rebut, enregistrer la sortie d'actif. Le système comptabilise la sortie de l'immobilisation, l'annulation des amortissements cumulés et constate la plus-value ou moins-value fiscale.")
        ]
    },
    {
        "id": "erp_global",
        "file_name": "DOSSIER_COMPLET_SAFE_ERP_GLOBAL.docx",
        "folder": "",
        "title": "SAFE ERP Global • Suite Intégrale d'Entreprise",
        "subtitle": "Dossier Complet : Architecture Système, Cahier des Charges des 28 Modules & Guide Global",
        "badge": "Plateforme ERP d'Entreprise • Normes Tunisiennes & Internationales",
        "arch_stack": [
            ["Couche Système", "Technologies & Librairies", "Rôle & Détails Techniques"],
            ["Frontend Universel", "React 19, TypeScript, Vite, TailwindCSS", "Interface multi-entités, mode sombre/clair, support natif RTL Arabe, 46 panneaux"],
            ["Backend API REST", "Node.js 20+, Express, TypeScript, scrypt", "28 micro-modules étanches, middleware RBAC, contrôle SoD, service TTN"],
            ["Persistance & ORM", "Prisma 6.x, SQLite (Local) / PostgreSQL", "131 tables relationnelles, 81 migrations versionnées, transactions ACID"],
            ["Sécurité & Traçabilité", "SHA-256 chain, HMAC-SHA256, scrypt", "Piste d'audit cryptographique immuable (JournalEntryAuditChainHead)"],
            ["Facturation Électronique", "XML UBL 2.1, TunTrust PKI, CEV 2D-Doc", "Homologation nationale Tunisie TradeNet (TTN) El Fatoora"]
        ],
        "cdc_rules": [
            "Couverture fonctionnelle intégrale des 28 modules métiers de l'entreprise moderne.",
            "Conformité SCE (Loi 96-112), TVA tunisienne (19/13/7/0%), IRPP 8 tranches, CNSS 9.68%, FOPROLOS 1%, CSS 0.5%.",
            "Moteur multi-devises et conversion IAS 21 avec gestion des écarts de change latents et réalisés.",
            "Consolidation groupe multi-filiales avec élimination automatique des transactions intercompagnies.",
            "Contrôle strict de la séparation des tâches (SoD) et inviolabilité des périodes comptables closes."
        ],
        "user_guide": [
            ("1. Connexion & Sélection du Contexte Filiale", "Se connecter avec son identifiant et mot de passe sécurisé. Choisir l'entité de travail (Safe Tunisie Industries TN01, Holding Groupe GRP00, etc.) et la devise de référence."),
            ("2. Navigation par Espace de Travail ou Barre Latérale", "Accéder aux 28 modules métiers via le sélecteur universel ou la page d'accueil personnalisée selon les droits RBAC du profil."),
            ("3. Bascule Instantanée vers un Prologiciel Métier Dédié", "Utiliser le sélecteur 'Prologiciel' dans la barre supérieure pour filtrer l'interface en mode vertical dédié (Facturation, Stocks, Paie, RH, Comptabilité, Production)."),
            ("4. Clôture Périodique & Verrouillage Hermétique", "Exécuter la checklist de clôture mensuelle dans 'Clôture mensuelle'. Le verrouillage empêche toute altération ultérieure."),
            ("5. Édition des Plaquettes & Rapports Financiers", "Générer les liasses fiscales, comptes de résultat (P&L), bilans et rapports de gestion en exports Excel multi-onglets ou PDF officiels.")
        ]
    }
]

def generate_dossier_doc(dossier):
    doc = docx.Document()
    build_cover_page(doc, dossier["title"], dossier["subtitle"], dossier["badge"])

    # PARTIE I : ARCHITECTURE TECHNIQUE
    add_header_styled(doc, "Partie I : Architecture Technique & Logicielle Détaillée", 1)
    doc.add_paragraph(
        f"Le prologiciel {dossier['title']} repose sur une architecture découplée, performante et sécurisée, "
        "conçue pour un déploiement autonome ou en synergie directe avec le socle central SAFE ERP. "
        "Cette architecture garantit une parfaite étanchéité des données tout en maintenant l'intégrité transactionnelle globale."
    )
    create_styled_table(doc, dossier["arch_stack"][0], dossier["arch_stack"][1:], [1.8, 2.2, 3.2])

    add_header_styled(doc, "1.1 Sécurité, Contrôle d'Accès & Inviolabilité", 2)
    doc.add_paragraph(
        "L'accès au prologiciel est gouverné par une matrice de contrôle RBAC (Role-Based Access Control) stricte. "
        "Chaque opération d'écriture, de validation ou d'émission est horodatée et attribuée à un acteur certifié. "
        "Les données sensibles (salaires, données personnelles, coordonnées bancaires) sont cloisonnées au niveau applicatif."
    )

    add_header_styled(doc, "1.2 Découpage Architectural MVC & Services Métiers Découplés", 2)
    doc.add_paragraph(
        f"Le module {dossier['title']} applique rigoureusement le patron d'architecture Modèle - Vue - Contrôleur (MVC) "
        "appuyé par des Services Métiers Distincts (Domain Services) :\n"
        "• Couche Modèle (Models) : Définition des schémas de persistance et accès base relationnelle (Prisma ORM / SQLite local).\n"
        "• Couche Contrôleur (Controllers) : Routage HTTP REST, validation des entrées et isolation du périmètre multi-sociétés.\n"
        "• Couche Services Métiers (Services) : Logique métier 100% autonome et découplée de toute interface ou protocole de transport, "
        "assurant des calculs arithmétiques et fiscaux certifiés, conformes aux exigences du Système Comptable des Entreprises (SCE).\n"
        "• Couche Vue (Views) : Interface utilisateur réactive React 19 / HTML5 sans logique métier résidente."
    )

    # PARTIE II : CAHIER DES CHARGES FONCTIONNEL
    add_header_styled(doc, "Partie II : Cahier des Charges Fonctionnel & Législation Tunisienne", 1)
    doc.add_paragraph(
        "Ce prologiciel a été conçu et paramétré pour respecter à 100 % le corpus juridique, fiscal et comptable "
        "en vigueur en République Tunisienne. L'ensemble des règles et formules de calcul a été audité et validé par l'expert-comptable du projet :"
    )
    for rule in dossier["cdc_rules"]:
        doc.add_paragraph(f"• {rule}")

    # PARTIE III : MODE DE FONCTIONNEMENT ET GUIDE D'UTILISATION
    add_header_styled(doc, "Partie III : Mode de Fonctionnement & Guide Utilisateur Pas-à-Pas", 1)
    doc.add_paragraph(
        "Ce guide opératoire détaille les flux de travail standard et les bonnes pratiques d'exploitation au quotidien :"
    )
    for title, desc in dossier["user_guide"]:
        add_header_styled(doc, title, 2)
        doc.add_paragraph(desc)

    # Sauvegardes
    if dossier["folder"]:
        dest_folder = os.path.join(BASE_DIR, dossier["folder"])
        os.makedirs(dest_folder, exist_ok=True)
        path_local = os.path.join(dest_folder, dossier["file_name"])
        doc.save(path_local)

    path_root = os.path.join(BASE_DIR, dossier["file_name"])
    doc.save(path_root)

    path_desktop = os.path.join(DESKTOP_DIR, dossier["file_name"])
    doc.save(path_desktop)
    
    doc_desktop_folder = r"C:\Users\USER\OneDrive\Desktop\SAFE_Doccumentation"
    os.makedirs(doc_desktop_folder, exist_ok=True)
    path_safe_doc = os.path.join(doc_desktop_folder, dossier["file_name"])
    doc.save(path_safe_doc)
    print(f"✔ Génération sobre & élégante réussie : {dossier['file_name']}")

def run_all():
    print("=" * 80)
    print("GÉNÉRATION D'UNE ÉCRITURE PLUS SOBRE ET PLUS ÉLÉGANTE POUR TOUS LES DOSSIERS")
    print("=" * 80)
    for dossier in DOSSIERS:
        generate_dossier_doc(dossier)
    print("=" * 80)
    print("✔ TOUS LES 8 DOSSIERS ONT ÉTÉ MIS À JOUR AVEC UNE ÉLÉGANCE ET UNE SOBRIÉTÉ MAXIMALES !")
    print("=" * 80)

if __name__ == "__main__":
    run_all()
