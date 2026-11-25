import os, sys, datetime, docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

BASE_DIR = r"C:\Users\USER\OneDrive\Desktop\SAFE_ERP_DRAFT 4"
DESKTOP_DIR = r"C:\Users\USER\OneDrive\Desktop"

# Charte Typographique Sobre & Ã‰lÃ©gante
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

def add_callout(doc, text, title="NOTE DE CONFORMITÃ‰"):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    set_cell_background(cell, 'F8FAFC')
    set_cell_margins(cell, top=100, bottom=100, left=160, right=160)
    p = cell.paragraphs[0]
    r_title = p.add_run(f"{title} â€” ")
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
    r_corp = p_meta.add_run("SAFE ERP â€¢ SUITE MÃ‰TIER TUNISIE\nNormes Comptables SCE & RÃ©glementation Fiscale Tunisienne\nArrÃªtÃ© de validation : 18 Novembre 2026")
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
        "Dossier technique, fonctionnel et opÃ©rationnel exhaustif regroupant l'Architecture logicielle, "
        "le Cahier des charges conforme Ã  la lÃ©gislation tunisienne et le Manuel d'utilisation pas-Ã -pas.",
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
        "badge": "Prologiciel MÃ©tier â€¢ Facturation & FiscalitÃ© Ventes/Achats",
        "arch_stack": [
            ["Composant", "Technologie", "RÃ´le & DÃ©tails Techniques"],
            ["Frontend UI", "React 19, TypeScript, TailwindCSS", "Interface de facturation temps rÃ©el, visualiseur XML UBL, modal CEV/QR"],
            ["Backend API", "Node.js 20+, Express REST, crypto", "Endpoints /api/sales, /api/purchases, /api/sales/e-invoices, middleware RBAC"],
            ["Base de DonnÃ©es", "SQLite (Local) / PostgreSQL (Prod)", "Tables : Invoice, InvoiceItem, TunisianEInvoice, PurchaseInvoice, Vendor, Customer"],
            ["Moteur Cryptographique", "SHA-256, TunTrust PKI (X.509)", "Scellement d'intÃ©gritÃ© SHA-256 et signature numÃ©rique qualifiÃ©e ANCE"],
            ["Standard de Flux", "OASIS UBL 2.1 Invoice XML", "Conforme au profil national d'interopÃ©rabilitÃ© Tunisie TradeNet (TTN)"]
        ],
        "cdc_rules": [
            "ConformitÃ© DÃ©cret nÂ° 2016-1098 & DÃ©cret-loi nÂ° 2021-21 : Ã‰mission et archivage probant des factures Ã©lectroniques El Fatoora.",
            "Taux de TVA tunisiens : 19 % (taux standard), 13 % (prestations de services qualifiÃ©es), 7 % (matiÃ¨res et Ã©quipements) et 0 % (exportations).",
            "Droit de Timbre Fiscal : 1,000 DT obligatoire par facture client Ã©mise (compte 432).",
            "Retenue Ã  la Source (RS) : 1,5 % sur tout marchÃ© et achat supÃ©rieur ou Ã©gal Ã  1 000 DT TTC (Art. 52 Code IRPP/IS), 0,5 % et 15 % sur honoraires.",
            "Workflow de validation Ã  sÃ©paration des tÃ¢ches (SoD) : DRAFT -> TO_REVIEW -> APPROVED -> ISSUED -> PAID."
        ],
        "user_guide": [
            ("1. CrÃ©ation d'un Devis & Bon de Commande Client", "AccÃ©der au sous-menu 'Devis & Commandes'. Renseigner le client, la date d'Ã©chÃ©ance et les lignes d'articles. Le systÃ¨me calcule automatiquement le sous-total HT, la TVA selon le taux de l'article, et le timbre fiscal de 1 DT. Valider le bon de commande."),
            ("2. Ã‰mission d'une Facture de Vente", "Cliquer sur 'Nouvelle Facture' ou convertir un bon de commande. Le statut passe Ã  TO_REVIEW. Un rÃ©viseur habilitÃ© valide la conformitÃ© comptable (APPROVED), puis l'agent de facturation Ã©met la facture (ISSUED). L'Ã©criture comptable client (411 au DÃ©bit / 701 et 4367 au CrÃ©dit) est immÃ©diatement gÃ©nÃ©rÃ©e."),
            ("3. GÃ©nÃ©ration & Transmission E-Facture TTN (El Fatoora)", "Dans l'onglet 'E-Factures TTN (El Fatoora)', cliquer sur 'GÃ©nÃ©rer Tout & TTN' ou sur l'action individuelle. Le systÃ¨me gÃ©nÃ¨re le XML UBL 2.1, calcule le hash SHA-256, appose le certificat TunTrust et tÃ©lÃ©transmet le flux Ã  TTN. L'accusÃ© de rÃ©ception TTN (ex: TTN-2026-000184) et le CEV 2D-Doc sont gÃ©nÃ©rÃ©s."),
            ("4. Saisie des Factures d'Achat & Rapprochement 3-Way", "Dans 'Achats & Fournisseurs', saisir la facture fournisseur reÃ§ue. Indiquer le bon de commande d'origine et le bon de rÃ©ception magasin. Si le montant TTC est >= 1 000 DT, le systÃ¨me gÃ©nÃ¨re automatiquement le certificat de Retenue Ã  la Source (RS)."),
            ("5. Suivi des Encaissements, DÃ©caissements & Lettrage", "Lors de la rÃ©ception du virement ou du chÃ¨que bancaire, enregistrer l'encaissement. La facture passe au statut PAID et les Ã©critures de lettrage au compte 411/532 sont Ã©quilibrÃ©es.")
        ]
    },
    {
        "id": "stocks",
        "file_name": "DOSSIER_COMPLET_SAFE_GESTION_DES_STOCKS.docx",
        "folder": "SAFE_Gestion_des_Stocks",
        "title": "SAFE Gestion des Stocks & EntrepÃ´ts (MM)",
        "subtitle": "Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Valorisation PUMP & Douanes",
        "badge": "Prologiciel MÃ©tier â€¢ Stocks, Logistique & Douanes AT/ACT",
        "arch_stack": [
            ["Composant", "Technologie", "RÃ´le & DÃ©tails Techniques"],
            ["Frontend UI", "React 19, TypeScript, Tables dynamiques", "Gestion multi-dÃ©pÃ´ts, fiches articles, alertes de stock mini/maxi, rÃ©gimes AT"],
            ["Backend API", "Node.js Express, Service Materials", "Endpoints /api/materials, /api/customs, calcul atomique du PUMP, traÃ§abilitÃ© des lots"],
            ["Base de DonnÃ©es", "SQLite / PostgreSQL relationnel", "Tables : Material, Warehouse, StockMovement, MaterialWarehouseStock, CustomsDutyRegime"],
            ["MÃ©thode de Valorisation", "Norme Comptable NCT 04", "CoÃ»t Moyen Unitaire PondÃ©rÃ© (PUMP / CMP) recalculÃ© Ã  chaque entrÃ©e en stock"],
            ["ContrÃ´le Douanier", "Code des Douanes Tunisien", "Comptes d'apurement Admission Temporaire (AT / ACT) et suivi des cautions bancaires"]
        ],
        "cdc_rules": [
            "ConformitÃ© NCT 04 : Valorisation obligatoire au CoÃ»t Moyen Unitaire PondÃ©rÃ© (CMP / PUMP) ou FIFO.",
            "Inventaire physique obligatoire au moins une fois par an avec justification formelle de chaque Ã©cart (perte, coulage, avarie).",
            "Gestion des RÃ©gimes Douaniers Suspensifs : Admission Temporaire pour Perfectionnement Actif (AT/ACT) avec dÃ©lais lÃ©gaux de rÃ©exportation.",
            "Ã‰tanchÃ©itÃ© des dÃ©pÃ´ts : ImpossibilitÃ© de mouvementer un stock en valeur nÃ©gative (contrÃ´le bloquant Ã  la saisie).",
            "Mise Ã  jour atomique des stocks lors de la rÃ©ception des commandes d'achat et des sorties pour ordres de fabrication (OF)."
        ],
        "user_guide": [
            ("1. CrÃ©ation des DÃ©pÃ´ts et Magasins", "Dans le module 'Stocks & EntrepÃ´ts', crÃ©er les diffÃ©rents entrepÃ´ts (DÃ©pÃ´t Principal MatiÃ¨res, Magasin PiÃ¨ces, EntrepÃ´t Produits Finis, DÃ©pÃ´t Sous Douane AT)."),
            ("2. CrÃ©ation des Articles & ParamÃ©trage des Seuils", "DÃ©finir la rÃ©fÃ©rence article, la dÃ©signation, l'unitÃ© de mesure (Kg, PiÃ¨ce, MÃ¨tre, Litre), le stock de sÃ©curitÃ© et le stock d'alerte pour rÃ©approvisionnement automatique."),
            ("3. Enregistrement d'une EntrÃ©e de Stock (RÃ©ception Achat)", "Ã€ la livraison du fournisseur, crÃ©er un Bon de RÃ©ception liÃ© Ã  la commande d'achat. Le stock physique augmente et le PUMP est automatiquement recalculÃ© selon la formule : (Valeur Ancien Stock + Valeur Nouvelle EntrÃ©e) / (QuantitÃ© Totale)."),
            ("4. Transfert Inter-DÃ©pÃ´ts & Sorties de Fabrication", "Effectuer les transferts d'un dÃ©pÃ´t Ã  un autre avec traÃ§abilitÃ© de l'Ã©metteur et du rÃ©cepteur. Les sorties pour fabrication dÃ©bitent le stock matiÃ¨res au PUMP en vigueur."),
            ("5. RÃ©alisation des Inventaires Physiques", "Ã‰diter la liste d'inventaire Ã  blanc. Saisir les quantitÃ©s rÃ©elles comptÃ©es. Le systÃ¨me met en Ã©vidence les Ã©carts d'inventaire et gÃ©nÃ¨re les Ã©critures comptables de rÃ©gularisation (compte 603 / 311)."),
            ("6. Gestion des RÃ©gimes Douaniers (AT / ACT)", "Enregistrer les dÃ©clarations de douane d'importation temporaire, suivre les cautions bancaires engagÃ©es et apurer les comptes lors de la rÃ©exportation des produits finis.")
        ]
    },
    {
        "id": "paie",
        "file_name": "DOSSIER_COMPLET_SAFE_PAIE.docx",
        "folder": "SAFE_Paie",
        "title": "SAFE Paie Tunisienne & DÃ©clarations Sociales",
        "subtitle": "Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Moteur IRPP, CNSS & Bulletins",
        "badge": "Prologiciel MÃ©tier â€¢ Paie & DÃ©clarations LÃ©gales Tunisiennes",
        "arch_stack": [
            ["Composant", "Technologie", "RÃ´le & DÃ©tails Techniques"],
            ["Frontend UI", "React 19, TailwindCSS, Ã‰diteur de fiches", "Simulateur Net/Brut, livre de paie, bulletins imprimables normalisÃ©s en TND"],
            ["Backend API", "Node.js Express, Service HR Payroll", "Moteur de calcul IRPP progressif 8 tranches, plafonds CNSS, FOPROLOS, CSS"],
            ["Base de DonnÃ©es", "Prisma ORM, SQLite / PostgreSQL", "Tables : Employee, Payslip, PayrollConfig, PayrollRubrique, PayrollTaxBracket"],
            ["PrÃ©cision MonÃ©taire", "MilliÃ¨mes de Dinar Tunisien (TND)", "Calcul exact Ã  3 dÃ©cimales, aucun arrondi intermÃ©diaire dÃ©viant"],
            ["SÃ©curitÃ© RH", "Chiffrement & RBAC Strict", "DonnÃ©es salariales strictement restreintes aux rÃ´les HR_MANAGER et ADMIN"]
        ],
        "cdc_rules": [
            "BarÃ¨me IRPP Progressif Ã  8 tranches conforme Ã  la Loi de Finances tunisienne en vigueur.",
            "DÃ©ductions familiales lÃ©gales dÃ©ductibles de l'assiette imposable : 300 DT / an pour le chef de famille, 100 DT / an par enfant Ã  charge.",
            "Cotisation CNSS obligatoire : 9,18 % part salariale rÃ©gime gÃ©nÃ©ral + 0,5 % maladie/complÃ©mentaire = 9,68 % total salarial.",
            "Cotisation patronale CNSS : 16,57 % pour le secteur non-agricole, incluant les prestations familiales et les accidents de travail.",
            "FOPROLOS : Taxe patronale de 1 % sur la masse salariale brute pour le Fonds de Promotion du Logement.",
            "Contribution Sociale de SolidaritÃ© (CSS) : 0,5 % applicable sur le revenu imposable pour le redressement des caisses de retraite.",
            "DÃ©claration Trimestrielle des Salaires CNSS (DS) obligatoire avant le 15 du mois suivant le trimestre Ã©chu."
        ],
        "user_guide": [
            ("1. Configuration des Rubriques de Paie & BarÃ¨mes", "AccÃ©der aux paramÃ¨tres de paie. VÃ©rifier l'activation du barÃ¨me IRPP Ã  8 tranches, du taux CNSS (9.68%), du FOPROLOS (1%) et de la CSS (0.5%)."),
            ("2. Fiche SalariÃ© & DonnÃ©es Fiscales / Familiales", "Pour chaque employÃ©, renseigner le statut familial (MariÃ© / CÃ©libataire), le nombre d'enfants Ã  charge, le matricule CNSS et le salaire de base contractuel en TND."),
            ("3. Saisie des Ã‰lÃ©ments Variables du Mois", "Renseigner les heures supplÃ©mentaires effectuÃ©es (bonifiÃ©es Ã  25%, 50% ou 100%), les primes de rendement, indemnitÃ©s de transport et retenues sur absences ou acomptes."),
            ("4. Lancement du Calcul de la Paie", "Cliquer sur 'Calculer la Paie du Mois'. Le moteur dÃ©roule sÃ©quentiellement : Brut -> DÃ©duction CNSS 9.68% -> Salaire Imposable -> DÃ©ductions familiales -> IRPP progressif -> CSS 0.5% -> Salaire Net Ã  payer au millime."),
            ("5. Impression des Bulletins & Livre de Paie", "GÃ©nÃ©rer les bulletins de paie individuels au format officiel et exporter le Livre de Paie mensuel pour transmission Ã  l'expert-comptable et Ã  l'inspection du travail."),
            ("6. Ã‰dition de la DÃ©claration Trimestrielle CNSS (DS)", "Ã€ la fin de chaque trimestre (mars, juin, septembre, dÃ©cembre), gÃ©nÃ©rer l'Ã©tat rÃ©capitulatif CNSS avec ventilation des salaires plafonnÃ©s et cotisations dues.")
        ]
    },
    {
        "id": "rh",
        "file_name": "DOSSIER_COMPLET_SAFE_GESTION_RH.docx",
        "folder": "SAFE_Gestion_RH",
        "title": "SAFE Gestion des Ressources Humaines & Talents",
        "subtitle": "Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Contrats, CongÃ©s & GPEC",
        "badge": "Prologiciel MÃ©tier â€¢ Capital Humain & Code du Travail Tunisien",
        "arch_stack": [
            ["Composant", "Technologie", "RÃ´le & DÃ©tails Techniques"],
            ["Frontend UI", "React 19, TypeScript, Calendrier interactif", "Dossier collaborateur 360Â°, gestion des congÃ©s, organigramme, fiches GPEC"],
            ["Backend API", "Node.js Express, Service HR Workflows", "Endpoints /api/hr, gestion des approbations de congÃ©s, suivi des contrats"],
            ["Base de DonnÃ©es", "Prisma ORM, SQLite / PostgreSQL", "Tables : Employee, LeaveRequest, HrDocumentMetadata, EmployeeContractHistory"],
            ["Calendrier LÃ©gal", "Jours FÃ©riÃ©s Tunisiens", "Gestion native des jours fÃ©riÃ©s lÃ©gaux et chÃ´mÃ©s de la RÃ©publique Tunisienne"],
            ["Protection DonnÃ©es", "RGPD & Normes INPDP", "ConformitÃ© Ã  l'Instance Nationale de Protection des DonnÃ©es Personnelles (INPDP)"]
        ],
        "cdc_rules": [
            "ConformitÃ© Code du Travail Tunisien (Loi nÂ° 66-27 modifiÃ©e) rÃ©gissant les contrats et conditions de travail.",
            "Gestion des diffÃ©rents types de contrats lÃ©gaux : CDI, CDD, CIVP (ex-SIVP), Contrat d'Apprentissage (CAIP), Contrat Karama.",
            "Articles 112 et suivants : Droit au congÃ© payÃ© lÃ©gal fixÃ© Ã  1 jour ouvrable par mois de travail effectif, majorÃ© pour anciennetÃ©.",
            "Suivi de la MÃ©decine du Travail obligatoire (visite d'embauche et visites pÃ©riodiques annuelles).",
            "Ã‰dition obligatoire du Solde de Tout Compte, du Certificat de Travail et de l'Attestation de Salaire lors du dÃ©part d'un collaborateur."
        ],
        "user_guide": [
            ("1. CrÃ©ation & Gestion des Dossiers Collaborateurs", "CrÃ©er la fiche du collaborateur : CIN, matricule interne, matricule CNSS, date de naissance, situation de famille, diplÃ´mes et fonction."),
            ("2. Gestion des Contrats & PÃ©riodes d'Essai", "Saisir le type de contrat (CDI, CDD, CIVP avec convention ANETI). Renseigner la date d'embauche, la durÃ©e de la pÃ©riode d'essai et les dates de renouvellement. Le systÃ¨me alerte sur les Ã©chÃ©ances."),
            ("3. Circuit de Validation des CongÃ©s PayÃ©s", "Le collaborateur soumet sa demande de congÃ© (Annuel, Maladie, MaternitÃ©, Mariage, DÃ©cÃ¨s). Le responsable hiÃ©rarchique reÃ§oit la notification et approuve ou refuse. Le solde de congÃ© est dÃ©comptÃ© automatiquement."),
            ("4. Suivi MÃ©dical & SÃ©curitÃ© au Travail", "Enregistrer les dates des visites mÃ©dicales d'embauche et pÃ©riodiques effectuÃ©es auprÃ¨s du Groupement de MÃ©decine du Travail (GMT)."),
            ("5. Gestion PrÃ©visionnelle des Emplois & CompÃ©tences (GPEC)", "Ã‰valuer les compÃ©tences des collaborateurs lors des entretiens annuels, dÃ©finir les plans de formation professionnelle et suivre l'Ã©volution des carriÃ¨res."),
            ("6. Ã‰dition des Documents LÃ©gaux", "GÃ©nÃ©rer en un clic les attestations de travail, attestations de salaire, certificats d'emploi et reÃ§us de solde de tout compte avec dÃ©charge signÃ©e.")
        ]
    },
    {
        "id": "comptabilite",
        "file_name": "DOSSIER_COMPLET_SAFE_COMPTABILITE_FISCALITE.docx",
        "folder": "SAFE_Comptabilite_Fiscalite",
        "title": "SAFE ComptabilitÃ© GÃ©nÃ©rale & FiscalitÃ© Tunisienne",
        "subtitle": "Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation SCE, G50 & IS 20%",
        "badge": "Prologiciel MÃ©tier â€¢ Normes Comptables SCE & Liasses Fiscales",
        "arch_stack": [
            ["Composant", "Technologie", "RÃ´le & DÃ©tails Techniques"],
            ["Frontend UI", "React 19, Grilles comptables haute performance", "Saisie horizontale, Balance 8 colonnes, Grand Livre interactif, DÃ©clarations G50"],
            ["Backend API", "Node.js Express, Service Finance & Tax", "Endpoints /api/finance, /api/tax-declarations, validation stricte DÃ©bit = CrÃ©dit"],
            ["Base de DonnÃ©es", "Prisma ORM, SQLite / PostgreSQL", "Tables : ChartOfAccount, JournalEntry, JournalLine, TaxDeclarationWorkpaper, BankAccount"],
            ["Audit & SÃ©curitÃ©", "ChaÃ®ne Cryptographique SHA-256", "InviolabilitÃ© des journaux par table JournalEntryAuditChainHead"],
            ["ClÃ´ture PÃ©riodique", "Verrouillage Temporel HermÃ©tique", "Interdiction d'insertion ou modification sur pÃ©riodes closes (MonthlyCloseLock)"]
        ],
        "cdc_rules": [
            "ConformitÃ© absolue Ã  la Loi nÂ° 96-112 portant promulgation du SystÃ¨me Comptable des Entreprises (SCE tunisien).",
            "Plan de comptes standard tunisien (Classes 1 Ã  7) avec tenue des Ã©critures en partie double Ã©quilibrÃ©es au millime.",
            "DÃ©claration Fiscale Mensuelle G50 obligatoire avant le 28 de chaque mois (TVA collectÃ©e, TVA dÃ©ductible, Droit de timbre, Retenue Ã  la source).",
            "ImpÃ´t sur les SociÃ©tÃ©s (IS) au taux normal lÃ©gal de 20 % calculÃ© sur le rÃ©sultat fiscal annuel.",
            "RÃ¨gle de sÃ©paration des tÃ¢ches (SoD) : Interdiction pour un utilisateur de valider ou poster une Ã©criture dont il est l'auteur.",
            "ImmutabilitÃ© lÃ©gale : Une fois un journal clÃ´turÃ©, aucune Ã©criture antidatÃ©e ne peut Ãªtre insÃ©rÃ©e ni modifiÃ©e."
        ],
        "user_guide": [
            ("1. Plan Comptable & Journaux Auxiliaires", "Consulter le plan de comptes officiel tunisien prÃ©configurÃ©. CrÃ©er les journaux nÃ©cessaires (Achats ACH, Ventes VEN, Banque BQ, Caisse CA, OpÃ©rations Diverses OD)."),
            ("2. Saisie Comptable Horizontale Rapide", "Dans le module 'Saisie Comptable Horizontale', renseigner la date, le journal, le numÃ©ro de piÃ¨ce et le libellÃ©. Ajouter les lignes de comptes. Le systÃ¨me vÃ©rifie en temps rÃ©el que Total DÃ©bit = Total CrÃ©dit avant d'autoriser l'enregistrement."),
            ("3. Consultation du Grand Livre & Lettrage", "Filtrer le Grand Livre par compte (ex: 411 Clients ou 401 Fournisseurs) et par pÃ©riode. Effectuer le lettrage manuel ou automatique des rÃ¨glements avec les factures correspondantes."),
            ("4. Balance GÃ©nÃ©rale des Comptes Ã  8 Colonnes", "Ã‰diter la balance gÃ©nÃ©rale Ã  8 colonnes : Solde DÃ©biteur/CrÃ©diteur d'ouverture, Mouvements DÃ©bit/CrÃ©dit du mois, Cumuls Mouvements, Soldes DÃ©biteurs/CrÃ©diteurs de clÃ´ture."),
            ("5. Rapprochement Bancaire (STB, BIAT, BH, BNA)", "Importer les relevÃ©s bancaires. Rapprocher les lignes du relevÃ© bancaire avec les Ã©critures du compte 532. Le systÃ¨me calcule l'Ã©tat de rapprochement exact et dÃ©tecte les chÃ¨ques en circulation."),
            ("6. PrÃ©paration de la DÃ©claration Fiscale G50", "Ã€ la fin de chaque mois, ouvrir le panneau 'DÃ©clarations Fiscales (G50)'. Le systÃ¨me consolide automatiquement la TVA collectÃ©e (19%, 13%, 7%), la TVA dÃ©ductible, le timbre fiscal et les retenues Ã  la source. L'expert-comptable valide et approuve la dÃ©claration.")
        ]
    },
    {
        "id": "production",
        "file_name": "DOSSIER_COMPLET_SAFE_PRODUCTION_GPAO.docx",
        "folder": "SAFE_Production_GPAO",
        "title": "SAFE Production Industrielle & GPAO",
        "subtitle": "Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Nomenclatures, OF & MRP",
        "badge": "Prologiciel MÃ©tier â€¢ GPAO, MRP & Maintenance d'Usine",
        "arch_stack": [
            ["Composant", "Technologie", "RÃ´le & DÃ©tails Techniques"],
            ["Frontend UI", "React 19, Gestion visuelle d'ateliers", "Suivi des ordres de fabrication (OF), arbres de nomenclature BOM, planning MRP"],
            ["Backend API", "Node.js Express, Service Production & MRP", "Endpoints /api/production, /api/mrp, calcul des besoins nets et valorisation des en-cours"],
            ["Base de DonnÃ©es", "Prisma ORM, SQLite / PostgreSQL", "Tables : ProductionOrder, BillOfMaterial, BillOfMaterialItem, EquipmentMaintenance"],
            ["Normes Industrielles", "Normes INNORPI & NCT 04", "Ã‰valuation des produits en-cours et valorisation au coÃ»t de production standard/rÃ©el"],
            ["IntÃ©gration Stocks", "DÃ©crÃ©mentation Atomique des Composants", "DÃ©stockage automatique des matiÃ¨res premiÃ¨res lors de la dÃ©claration d'achÃ¨vement OF"]
        ],
        "cdc_rules": [
            "Gestion des nomenclatures de fabrication multi-niveaux (Bill of Materials - BOM) avec coefficients de pertes.",
            "TraÃ§abilitÃ© ascendante et descendante des lots de fabrication conformÃ©ment aux exigences de certification ISO 9001.",
            "Calcul des Besoins Nets (MRP) synchronisÃ© avec les commandes clients et les dÃ©lais fournisseurs.",
            "RÃ©gularisation comptable obligatoire de la variation des en-cours de production (compte 713).",
            "Suivi de la maintenance prÃ©ventive et curative des machines de production pour Ã©viter les arrÃªts d'atelier."
        ],
        "user_guide": [
            ("1. CrÃ©ation des Nomenclatures (BOM)", "DÃ©finir la fiche du produit fini et ajouter les composants requis (matiÃ¨res premiÃ¨res, consommables, emballages) avec les quantitÃ©s unitaires et pourcentages de pertes tolÃ©rÃ©s."),
            ("2. Lancement des Ordres de Fabrication (OF)", "GÃ©nÃ©rer un ordre de fabrication pour une quantitÃ© donnÃ©e. Le systÃ¨me vÃ©rifie la disponibilitÃ© des matiÃ¨res en stock et rÃ©serve les composants."),
            ("3. Suivi d'Atelier & Gammes OpÃ©ratoires", "Pointer les heures machines et les heures de main-d'Å“uvre directe sur chaque poste de charge (dÃ©coupe, assemblage, conditionnement)."),
            ("4. ClÃ´ture de l'OF & EntrÃ©e en Stock Produits Finis", "Ã€ l'achÃ¨vement du lot, valider la dÃ©claration de production. Le stock de produits finis est automatiquement incrÃ©mentÃ© au coÃ»t de revient rÃ©el, et les stocks de matiÃ¨res sont dÃ©crÃ©mentÃ©s."),
            ("5. Maintenance PrÃ©ventive des Ã‰quipements", "Programmer les entretiens pÃ©riodiques des machines selon les compteurs d'heures ou le calendrier, et consigner les interventions curatives.")
        ]
    },
    {
        "id": "immobilisations",
        "file_name": "DOSSIER_COMPLET_SAFE_IMMOBILISATIONS.docx",
        "folder": "SAFE_Immobilisations",
        "title": "SAFE Immobilisations & Amortissements",
        "subtitle": "Dossier Complet : Architecture, Cahier des Charges & Guide d'Utilisation Amortissements Fiscaux DGI",
        "badge": "Prologiciel MÃ©tier â€¢ Actifs Fiscaux & Amortissements DGI",
        "arch_stack": [
            ["Composant", "Technologie", "RÃ´le & DÃ©tails Techniques"],
            ["Frontend UI", "React 19, Tableaux d'amortissement interactifs", "Fichier des immobilisations, simulations d'amortissement linÃ©aire/dÃ©gressif, inventaire"],
            ["Backend API", "Node.js Express, Service Assets", "Endpoints /api/assets, calcul automatique prorata temporis et dotations 681/28x"],
            ["Base de DonnÃ©es", "Prisma ORM, SQLite / PostgreSQL", "Tables : FixedAsset, AssetDepreciationLine, AssetCategory, ChartOfAccount"],
            ["Cadre RÃ©glementaire", "Norme Comptable NCT 05 & DGI", "Application des taux d'amortissement fiscalement admis par l'administration tunisienne"]
        ],
        "cdc_rules": [
            "ConformitÃ© Ã  la Norme Comptable Tunisienne NCT 05 relative aux immobilisations corporelles et incorporelles.",
            "Calcul d'amortissement linÃ©aire selon la rÃ¨gle du prorata temporis (calcul au jour le jour Ã  compter de la date de mise en service).",
            "Taux d'amortissement fiscaux standards tunisiens : BÃ¢timents d'exploitation (5%), Agencements et installations (10%), MatÃ©riel et outillage (10% Ã  20%), MatÃ©riel de transport (20%), MatÃ©riel informatique et logiciels (33,33%).",
            "Comptabilisation automatique des dotations annuelles aux amortissements : DÃ©bit 6815 / CrÃ©dit 28x.",
            "Traitement fiscal des cessions : Calcul des plus-values ou moins-values de cession (Prix de cession - Valeur Nette Comptable)."
        ],
        "user_guide": [
            ("1. CrÃ©ation d'une Fiche d'Immobilisation", "Renseigner la dÃ©signation du bien, la catÃ©gorie fiscale, la date d'acquisition, la date de mise en service, la valeur d'origine HT et le fournisseur."),
            ("2. Choix de la MÃ©thode & du Taux d'Amortissement", "SÃ©lectionner la mÃ©thode (LinÃ©aire ou DÃ©gressif) et le taux fiscal admis (ex: 20% sur 5 ans pour un vÃ©hicule utilitaire)."),
            ("3. GÃ©nÃ©ration du Tableau d'Amortissement PrÃ©visionnel", "Le systÃ¨me gÃ©nÃ¨re automatiquement l'Ã©chÃ©ancier complet annÃ©e par annÃ©e avec l'annuitÃ© d'amortissement, le cumul des amortissements et la Valeur Nette Comptable (VNC)."),
            ("4. GÃ©nÃ©ration des Ã‰critures de Dotation d'Inventaire", "En fin d'exercice au 31 dÃ©cembre, cliquer sur 'GÃ©nÃ©rer les Ã‰critures d'Inventaire'. Le systÃ¨me poste automatiquement les Ã©critures Ã©quilibrÃ©es DÃ©bit 681 / CrÃ©dit 281 au Grand Livre."),
            ("5. Sortie d'Actif (Cession ou Mise au Rebut)", "En cas de vente ou de rebut, enregistrer la sortie d'actif. Le systÃ¨me comptabilise la sortie de l'immobilisation, l'annulation des amortissements cumulÃ©s et constate la plus-value ou moins-value fiscale.")
        ]
    },
    {
        "id": "erp_global",
        "file_name": "DOSSIER_COMPLET_SAFE_ERP_GLOBAL.docx",
        "folder": "",
        "title": "SAFE ERP Global â€¢ Suite IntÃ©grale d'Entreprise",
        "subtitle": "Dossier Complet : Architecture SystÃ¨me, Cahier des Charges des 28 Modules & Guide Global",
        "badge": "Plateforme ERP d'Entreprise â€¢ Normes Tunisiennes & Internationales",
        "arch_stack": [
            ["Couche SystÃ¨me", "Technologies & Librairies", "RÃ´le & DÃ©tails Techniques"],
            ["Frontend Universel", "React 19, TypeScript, Vite, TailwindCSS", "Interface multi-entitÃ©s, mode sombre/clair, support natif RTL Arabe, 46 panneaux"],
            ["Backend API REST", "Node.js 20+, Express, TypeScript, scrypt", "28 micro-modules Ã©tanches, middleware RBAC, contrÃ´le SoD, service TTN"],
            ["Persistance & ORM", "Prisma 6.x, SQLite (Local) / PostgreSQL", "131 tables relationnelles, 81 migrations versionnÃ©es, transactions ACID"],
            ["SÃ©curitÃ© & TraÃ§abilitÃ©", "SHA-256 chain, HMAC-SHA256, scrypt", "Piste d'audit cryptographique immuable (JournalEntryAuditChainHead)"],
            ["Facturation Ã‰lectronique", "XML UBL 2.1, TunTrust PKI, CEV 2D-Doc", "Homologation nationale Tunisie TradeNet (TTN) El Fatoora"]
        ],
        "cdc_rules": [
            "Couverture fonctionnelle intÃ©grale des 28 modules mÃ©tiers de l'entreprise moderne.",
            "ConformitÃ© SCE (Loi 96-112), TVA tunisienne (19/13/7/0%), IRPP 8 tranches, CNSS 9.68%, FOPROLOS 1%, CSS 0.5%.",
            "Moteur multi-devises et conversion IAS 21 avec gestion des Ã©carts de change latents et rÃ©alisÃ©s.",
            "Consolidation groupe multi-filiales avec Ã©limination automatique des transactions intercompagnies.",
            "ContrÃ´le strict de la sÃ©paration des tÃ¢ches (SoD) et inviolabilitÃ© des pÃ©riodes comptables closes."
        ],
        "user_guide": [
            ("1. Connexion & SÃ©lection du Contexte Filiale", "Se connecter avec son identifiant et mot de passe sÃ©curisÃ©. Choisir l'entitÃ© de travail (Safe Tunisie Industries TN01, Holding Groupe GRP00, etc.) et la devise de rÃ©fÃ©rence."),
            ("2. Navigation par Espace de Travail ou Barre LatÃ©rale", "AccÃ©der aux 28 modules mÃ©tiers via le sÃ©lecteur universel ou la page d'accueil personnalisÃ©e selon les droits RBAC du profil."),
            ("3. Bascule InstantanÃ©e vers un Prologiciel MÃ©tier DÃ©diÃ©", "Utiliser le sÃ©lecteur 'Prologiciel' dans la barre supÃ©rieure pour filtrer l'interface en mode vertical dÃ©diÃ© (Facturation, Stocks, Paie, RH, ComptabilitÃ©, Production)."),
            ("4. ClÃ´ture PÃ©riodique & Verrouillage HermÃ©tique", "ExÃ©cuter la checklist de clÃ´ture mensuelle dans 'ClÃ´ture mensuelle'. Le verrouillage empÃªche toute altÃ©ration ultÃ©rieure."),
            ("5. Ã‰dition des Plaquettes & Rapports Financiers", "GÃ©nÃ©rer les liasses fiscales, comptes de rÃ©sultat (P&L), bilans et rapports de gestion en exports Excel multi-onglets ou PDF officiels.")
        ]
    }
]

def generate_dossier_doc(dossier):
    doc = docx.Document()
    build_cover_page(doc, dossier["title"], dossier["subtitle"], dossier["badge"])

    # PARTIE I : ARCHITECTURE TECHNIQUE
    add_header_styled(doc, "Partie I : Architecture Technique & Logicielle DÃ©taillÃ©e", 1)
    doc.add_paragraph(
        f"Le prologiciel {dossier['title']} repose sur une architecture dÃ©couplÃ©e, performante et sÃ©curisÃ©e, "
        "conÃ§ue pour un dÃ©ploiement autonome ou en synergie directe avec le socle central SAFE ERP. "
        "Cette architecture garantit une parfaite Ã©tanchÃ©itÃ© des donnÃ©es tout en maintenant l'intÃ©gritÃ© transactionnelle globale."
    )
    create_styled_table(doc, dossier["arch_stack"][0], dossier["arch_stack"][1:], [1.8, 2.2, 3.2])

    add_header_styled(doc, "1.1 SÃ©curitÃ©, ContrÃ´le d'AccÃ¨s & InviolabilitÃ©", 2)
    doc.add_paragraph(
        "L'accÃ¨s au prologiciel est gouvernÃ© par une matrice de contrÃ´le RBAC (Role-Based Access Control) stricte. "
        "Chaque opÃ©ration d'Ã©criture, de validation ou d'Ã©mission est horodatÃ©e et attribuÃ©e Ã  un acteur certifiÃ©. "
        "Les donnÃ©es sensibles (salaires, donnÃ©es personnelles, coordonnÃ©es bancaires) sont cloisonnÃ©es au niveau applicatif."
    )

    add_header_styled(doc, "1.2 DÃ©coupage Architectural MVC & Services MÃ©tiers DÃ©couplÃ©s", 2)
    doc.add_paragraph(
        f"Le module {dossier['title']} applique rigoureusement le patron d'architecture ModÃ¨le - Vue - ContrÃ´leur (MVC) "
        "appuyÃ© par des Services MÃ©tiers Distincts (Domain Services) :\n"
        "â€¢ Couche ModÃ¨le (Models) : DÃ©finition des schÃ©mas de persistance et accÃ¨s base relationnelle (Prisma ORM / SQLite local).\n"
        "â€¢ Couche ContrÃ´leur (Controllers) : Routage HTTP REST, validation des entrÃ©es et isolation du pÃ©rimÃ¨tre multi-sociÃ©tÃ©s.\n"
        "â€¢ Couche Services MÃ©tiers (Services) : Logique mÃ©tier 100% autonome et dÃ©couplÃ©e de toute interface ou protocole de transport, "
        "assurant des calculs arithmÃ©tiques et fiscaux certifiÃ©s, conformes aux exigences du SystÃ¨me Comptable des Entreprises (SCE).\n"
        "â€¢ Couche Vue (Views) : Interface utilisateur rÃ©active React 19 / HTML5 sans logique mÃ©tier rÃ©sidente."
    )

    # PARTIE II : CAHIER DES CHARGES FONCTIONNEL
    add_header_styled(doc, "Partie II : Cahier des Charges Fonctionnel & LÃ©gislation Tunisienne", 1)
    doc.add_paragraph(
        "Ce prologiciel a Ã©tÃ© conÃ§u et paramÃ©trÃ© pour respecter Ã  100 % le corpus juridique, fiscal et comptable "
        "en vigueur en RÃ©publique Tunisienne. L'ensemble des rÃ¨gles et formules de calcul a Ã©tÃ© auditÃ© et validÃ© par l'expert-comptable du projet :"
    )
    for rule in dossier["cdc_rules"]:
        doc.add_paragraph(f"â€¢ {rule}")

    # PARTIE III : MODE DE FONCTIONNEMENT ET GUIDE D'UTILISATION
    add_header_styled(doc, "Partie III : Mode de Fonctionnement & Guide Utilisateur Pas-Ã -Pas", 1)
    doc.add_paragraph(
        "Ce guide opÃ©ratoire dÃ©taille les flux de travail standard et les bonnes pratiques d'exploitation au quotidien :"
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
    print(f"âœ” GÃ©nÃ©ration sobre & Ã©lÃ©gante rÃ©ussie : {dossier['file_name']}")

def run_all():
    print("=" * 80)
    print("GÃ‰NÃ‰RATION D'UNE Ã‰CRITURE PLUS SOBRE ET PLUS Ã‰LÃ‰GANTE POUR TOUS LES DOSSIERS")
    print("=" * 80)
    for dossier in DOSSIERS:
        generate_dossier_doc(dossier)
    print("=" * 80)
    print("âœ” TOUS LES 8 DOSSIERS ONT Ã‰TÃ‰ MIS Ã€ JOUR AVEC UNE Ã‰LÃ‰GANCE ET UNE SOBRIÃ‰TÃ‰ MAXIMALES !")
    print("=" * 80)

if __name__ == "__main__":
    run_all()
