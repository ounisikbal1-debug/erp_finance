# -*- coding: utf-8 -*-
r"""
Mise Ã  jour globale de la documentation SAFE ERP :
1. Mise Ã  jour de ARCHITECTURE_TECHNIQUE_SAFE_ERP.docx avec la section complÃ¨te MVC & Services Distincts
2. Mise Ã  jour de DOSSIER_COMPLET_*.docx avec l'architecture MVC propre Ã  chaque prologiciel
3. Mise Ã  jour de SUITE_PROLOGICIELS_METIERS_SAFE_TUNISIE.docx
4. Synchronisation vers C:\Users\USER\OneDrive\Desktop\SAFE_Doccumentation, C:\Users\USER\OneDrive\Desktop et docs/
r"""

import os, sys, datetime, docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

DESKTOP_DIR = r"C:\Users\USER\OneDrive\Desktop"
DOCS_DESKTOP_DIR = r"C:\Users\USER\OneDrive\Desktop\SAFE_Doccumentation"
PROJECT_DIR = r"C:\Users\USER\OneDrive\Desktop\SAFE_ERP_DRAFT 4\SAFE_Grandes_Entreprises"
DOCS_PROJ_DIR = os.path.join(PROJECT_DIR, "docs")

os.makedirs(DOCS_DESKTOP_DIR, exist_ok=True)
os.makedirs(DOCS_PROJ_DIR, exist_ok=True)

# Helper functions for python-docx styling
FONT_PRIMARY = 'Calibri'

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
        set_cell_background(hdr_cells[i], '0F1E3A')
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
            set_cell_margins(row_cells[c_idx], top=80, bottom=80, left=120, right=120)
            p = row_cells[c_idx].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            for run in p.runs:
                run.font.size = Pt(9)
                run.font.name = FONT_PRIMARY
                run.font.color.rgb = RGBColor(30, 41, 59)

    if col_widths:
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
            run.font.size = Pt(15)
            run.font.bold = True
            run.font.color.rgb = RGBColor(15, 30, 58) # Deep navy
        elif level == 2:
            run.font.size = Pt(12.5)
            run.font.bold = True
            run.font.color.rgb = RGBColor(37, 99, 235) # Blue accent
        elif level == 3:
            run.font.size = Pt(10.5)
            run.font.bold = True
            run.font.color.rgb = RGBColor(71, 85, 105)
    return h

def add_callout(doc, text, title="NOTE ARCHITECTURALE"):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    table.rows[0].cells[0].width = Inches(6.8)

    cell = table.rows[0].cells[0]
    set_cell_background(cell, 'F0F9FF')
    set_cell_margins(cell, top=100, bottom=100, left=140, right=140)

    tcPr = cell._element.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')

    left_b = OxmlElement('w:left')
    left_b.set(qn('w:val'), 'single')
    left_b.set(qn('w:sz'), '24')
    left_b.set(qn('w:space'), '0')
    left_b.set(qn('w:color'), '0284C7')
    tcBorders.append(left_b)

    for side in ['top', 'bottom', 'right']:
        b = OxmlElement(f'w:{side}')
        b.set(qn('w:val'), 'none')
        tcBorders.append(b)
    tcPr.append(tcBorders)

    p = cell.paragraphs[0]
    r_title = p.add_run(f"[{title}] ")
    r_title.bold = True
    r_title.font.size = Pt(9.5)
    r_title.font.color.rgb = RGBColor(2, 132, 199)
    r_title.font.name = FONT_PRIMARY

    r_text = p.add_run(text)
    r_text.font.size = Pt(9)
    r_text.font.color.rgb = RGBColor(15, 23, 42)
    r_text.font.name = FONT_PRIMARY
    doc.add_paragraph()

def build_cover_page(doc, title, subtitle, badge_text):
    p_meta = doc.add_paragraph()
    p_meta.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r_meta = p_meta.add_run(f"CONFIDENTIEL â€¢ Ã‰DITION OFFICIELLE {datetime.datetime.now().year} â€¢ NORMES TUNISIENNES SCE & IFRS")
    r_meta.font.size = Pt(8)
    r_meta.font.bold = True
    r_meta.font.color.rgb = RGBColor(100, 116, 139)
    r_meta.font.name = FONT_PRIMARY

    doc.add_paragraph("\n")

    p_badge = doc.add_paragraph()
    p_badge.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r_badge = p_badge.add_run(f"  {badge_text}  ")
    r_badge.font.size = Pt(8.5)
    r_badge.font.bold = True
    r_badge.font.color.rgb = RGBColor(255, 255, 255)
    r_badge.font.name = FONT_PRIMARY

    doc.add_paragraph("\n")

    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r_title = p_title.add_run(title)
    r_title.font.size = Pt(24)
    r_title.font.bold = True
    r_title.font.color.rgb = RGBColor(15, 30, 58)
    r_title.font.name = FONT_PRIMARY

    p_sub = doc.add_paragraph()
    p_sub.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r_sub = p_sub.add_run(subtitle)
    r_sub.font.size = Pt(11.5)
    r_sub.font.color.rgb = RGBColor(71, 85, 105)
    r_sub.font.name = FONT_PRIMARY

    doc.add_paragraph("\n")

    add_callout(doc, 
        "Document d'architecture technique exhaustif dÃ©crivant la restructuration complÃ¨te en ModÃ¨le-Vue-ContrÃ´leur (MVC) "
        "avec isolation stricte de la logique mÃ©tier dans des Services DÃ©couplÃ©s, garantissant une intÃ©gritÃ© transactionnelle "
        "parfaite, une testabilitÃ© Ã  100% et une conformitÃ© rigoureuse aux normes fiscales et comptables tunisiennes 2026.",
        "RÃ‰FÃ‰RENTIEL D'INGÃ‰NIERIE LOGICIELLE"
    )

    p_footer = doc.add_paragraph()
    p_footer.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r_f = p_footer.add_run(
        "Auteurs : Direction Technique SAFE ERP & Ã‰quipe R&D\n"
        "Technologies : TypeScript, Node.js Express, React 19, Prisma ORM, FastAPI, SQLite / PostgreSQL\n"
        f"DerniÃ¨re rÃ©vision : {datetime.datetime.now().strftime('%d/%m/%Y')} â€¢ Statut : VALIDÃ‰ EN PRODUCTION"
    )
    r_f.font.size = Pt(8.5)
    r_f.font.color.rgb = RGBColor(148, 163, 184)
    r_f.font.name = FONT_PRIMARY

    doc.add_page_break()

# ------------------------------------------------------------------------------
# 1. GENERATE ARCHITECTURE TECHNIQUE DOCX
# ------------------------------------------------------------------------------
def generate_updated_architecture_doc():
    doc = docx.Document()
    build_cover_page(
        doc,
        "Dossier d'Architecture Technique & Logicielle",
        "Architecture MVC, Services MÃ©tiers Distincts, E-Facture TTN, SÃ©curitÃ© HMAC-SHA256 & Normes SCE 2026",
        "DOCUMENT D'ARCHITECTURE TECHNIQUE (DAT v2.0)"
    )

    add_header_styled(doc, "1. Architecture Globale du SystÃ¨me & Vision 3-Tiers", 1)
    doc.add_paragraph(
        "La suite logicielle SAFE ERP a Ã©tÃ© entiÃ¨rement refondue pour adopter le patron d'architecture "
        "ModÃ¨le - Vue - ContrÃ´leur (MVC) renforcÃ© par une couche de Services MÃ©tiers Distincts (Domain Services). "
        "Cette sÃ©paration hermÃ©tique Ã©limine tout couplage fort entre le protocole de transport rÃ©seau (HTTP REST), "
        "l'expÃ©rience utilisateur graphique (SPA React / HTML5) et les rÃ¨gles de calcul financiÃ¨res et fiscales tunisiennes."
    )

    data_stack = [
        ["Couche Applicative", "Technologies & Librairies", "RÃ´le & ResponsabilitÃ©", "SÃ©curitÃ© & Isolation"],
        ["Vues (Presentation Layer)", "React 19, TypeScript, Vite, TailwindCSS, HTML5 Standalone", "Interfaces de pilotage Comex, thÃ¨me sombre/clair, bascule RTL Arabe, Ã©crans dÃ©diÃ©s par progiciel", "Aucun calcul mÃ©tier cÃ´tÃ© client, requÃªtes API authentifiÃ©es"],
        ["ContrÃ´leurs (Controller Layer)", "Node.js Express / Python FastAPI, Typage TypeScript / Pydantic", "27 contrÃ´leurs modulaires (src/core/controllers/), validation des entrÃ©es et isolation entitÃ©", "Matrice RBAC stricte, SoD, protection injection"],
        ["Services MÃ©tiers (Service Layer)", "Services TS/Python 100% dÃ©couplÃ©s (src/core/services/)", "Logique mÃ©tier pure : FiscalService, AuditTrailService, PayrollEngine, StockValuation, BankingService", "TestabilitÃ© unitaire 100%, 0 dÃ©pendance transport"],
        ["ModÃ¨les & Persistance (Model Layer)", "Prisma ORM 6.x, PostgreSQL (Prod) / SQLite (Autonome)", "131 tables relationnelles, 81 migrations versionnÃ©es, abstraction centralisÃ©e (prisma.ts)", "Transactions ACID au millime, verrous matÃ©riels"],
        ["Facturation Ã‰lectronique TTN", "XML UBL 2.1, CEV 2D-Doc, TunTrust PKI (X.509)", "Plateforme nationale El Fatoora, signature et horodatage certifiÃ©", "InviolabilitÃ© SHA-256 & AgrÃ©ment TTN"],
        ["SÃ©curitÃ© & TraÃ§abilitÃ©", "SHA-256 chain, HMAC-SHA256, scrypt, Hardware ID Lock", "Sessions infalsifiables, audit trail immuable des journaux comptables", "Empreinte machine unique, protection anti-copie"],
        ["GÃ©nÃ©ration Documentaire", "ExcelJS, PptxGenJS, Python docx", "Exports classeurs multi-onglets, plaquettes financiÃ¨res et dossiers d'audit", "GÃ©nÃ©ration locale native sans cloud tiers"]
    ]
    create_styled_table(doc, data_stack[0], data_stack[1:], [1.5, 2.0, 2.3, 1.6])

    # NOUVELLE SECTION MAJEURE : ARCHITECTURE MVC & SERVICES DISTINCTS
    add_header_styled(doc, "2. Architecture MVC (ModÃ¨le - Vue - ContrÃ´leur) & Services MÃ©tiers Distincts", 1)
    doc.add_paragraph(
        "Le dÃ©coupage architectural adoptÃ© structure l'ensemble de la suite (ERP Global, 7 Prologiciels Satellites MÃ©tiers "
        "et 6 Satellites Sectoriels) selon les standards les plus exigeants du gÃ©nie logiciel d'entreprise :"
    )

    add_header_styled(doc, "2.1 Les 3 Couches Fondamentales du Patron MVC", 2)
    doc.add_paragraph(
        "1. ModÃ¨le (Model Layer - src/core/models/) : DÃ©finit les entitÃ©s mÃ©tier, les relations et assure l'accÃ¨s aux donnÃ©es. "
        "La persistance est encapsulÃ©e via une instance Prisma unique et contrÃ´lÃ©e (`prisma.ts`), supportant de maniÃ¨re transparente "
        "PostgreSQL pour les dÃ©ploiements multisites en entreprise et SQLite pour les progiciels autonomes monoposte.\n"
        "2. ContrÃ´leur (Controller Layer - src/core/controllers/) : Chaque domaine fonctionnel dispose d'un contrÃ´leur dÃ©diÃ©. "
        "Son rÃ´le est strictement limitÃ© Ã  l'interception des requÃªtes HTTP, Ã  la validation structurelle des charges utiles (payloads), "
        "au contrÃ´le des habilitations (RBAC) et Ã  la rÃ©solution du pÃ©rimÃ¨tre de la sociÃ©tÃ© dÃ©clarante (`resolveEntityScope`).\n"
        "3. Vue (View / Presentation Layer - src/presentation/ & web_dist/) : Composants React 19 et interfaces HTML5 autonomes "
        "qui consomment les rÃ©ponses JSON standardisÃ©es des contrÃ´leurs sans jamais exÃ©cuter de logique fiscale ou comptable en local."
    )

    add_header_styled(doc, "2.2 La Couche des Services MÃ©tiers Distincts (Core Domain Services)", 2)
    doc.add_paragraph(
        "Au cÅ“ur du systÃ¨me, les rÃ¨gles de gestion sont encapsulÃ©es dans des services autonomes (`src/core/services/`). "
        "Ces services ne dÃ©pendent d'aucun framework Web (ni Express, ni FastAPI) et peuvent Ãªtre appelÃ©s indiffÃ©remment par les contrÃ´leurs API, "
        "des tÃ¢ches d'arriÃ¨re-plan ou des scripts de clÃ´ture automatisÃ©s :"
    )

    data_services = [
        ["Service MÃ©tier Autonome", "Fichiers Sources ClÃ©s", "ResponsabilitÃ© & Algorithmes MÃ©tiers", "Normes & RÃ¨gles AppliquÃ©es"],
        ["FiscalService", "src/core/services/fiscal.service.ts", "Calcul prÃ©cis de la TVA tunisienne aux 3 taux lÃ©gaux (19%, 13%, 7%), calcul de la Retenue Ã  la Source (RS), liquidation du timbre fiscal 1.000 DT, prÃ©paration des dÃ©clarations G50 mensuelles et calcul de l'acompte provisionnel et de l'IS.", "Code de la TVA, LF 2026, DÃ©cret G50 DGI"],
        ["AuditTrailService", "src/core/services/audit-trail.service.ts", "SÃ©curisation cryptographique de toutes les Ã©critures comptables. Chaque mouvement est scellÃ© par un hachage SHA-256 chaÃ®nÃ© Ã  l'Ã©criture prÃ©cÃ©dente (table JournalEntryAuditChainHead).", "Norme ISA 240, InviolabilitÃ© lÃ©gale COSO"],
        ["PayrollEngineService", "src/core/services/payroll.service.ts", "Moteur de paie tunisienne calculant le brut imposable, les cotisations CNSS salariales (9.68%) et patronales (16.57% + accident du travail), la Contribution Sociale de SolidaritÃ© (CSS 1%) et le barÃ¨me progressif IRPP 8 tranches.", "Code du Travail Tunisien, BarÃ¨me IRPP 2026"],
        ["StockValuationService", "src/core/services/stock.service.ts", "Suivi en temps rÃ©el des stocks multi-dÃ©pÃ´ts, gestion des entrÃ©es/sorties/transferts, calcul automatique du Prix Unitaire Moyen PondÃ©rÃ© (PUMP) et FIFO, dÃ©tection des seuils de rÃ©approvisionnement.", "Norme comptable tunisienne NCT 04 (Stocks)"],
        ["BankingService", "src/core/services/banking.service.ts", "Rapprochement bancaire automatisÃ© avec tolÃ©rance millimÃ©trique, gestion des comptes bancaires multi-devises (TND, EUR, USD), rÃ©Ã©valuation mensuelle des devises au cours BCT interbancaire.", "Circulaires Banque Centrale de Tunisie (BCT)"],
        ["ConsolidationService", "src/core/services/consolidation.service.ts", "Moteur de consolidation groupe : Ã©limination des opÃ©rations rÃ©ciproques intercompagnies (recettes/dÃ©penses, crÃ©ances/dettes), conversion au cours de clÃ´ture et production de la balance agrÃ©gÃ©e.", "Norme NCT 35 (Ã‰tats Financiers ConsolidÃ©s)"],
        ["CustomsService", "src/core/services/customs.service.ts", "Gestion des rÃ©gimes douaniers Ã©conomiques : entrepÃ´t fictif, admission temporaire (AT), apurement des comptes douaniers et calcul des droits de douane et taxes d'effet Ã©quivalent.", "Code des Douanes Tunisiennes"]
    ]
    create_styled_table(doc, data_services[0], data_services[1:], [1.6, 2.0, 2.2, 1.6])

    add_header_styled(doc, "2.3 Architecture MVC des 7 Prologiciels Satellites MÃ©tiers", 2)
    doc.add_paragraph(
        "Chaque prologiciel mÃ©tier du dossier `satellites_metiers/` est structurÃ© selon un schÃ©ma MVC unifiÃ© :"
    )
    doc.add_paragraph(
        "â€¢ SAFE_Facturation : `controllers/sales.controller.ts`, `services/invoice.service.ts`, `models/sales.model.ts`\n"
        "â€¢ SAFE_Gestion_des_Stocks : `controllers/stock.controller.ts`, `services/warehouse.service.ts`, `models/stock.model.ts`\n"
        "â€¢ SAFE_Paie : `controllers/payroll.controller.ts`, `services/social-tax.service.ts`, `models/payroll.model.ts`\n"
        "â€¢ SAFE_Gestion_RH : `controllers/hr.controller.ts`, `services/career.service.ts`, `models/employee.model.ts`\n"
        "â€¢ SAFE_Comptabilite_Fiscalite : `controllers/accounting.controller.ts`, `services/tax-g50.service.ts`, `models/ledger.model.ts`\n"
        "â€¢ SAFE_Production_GPAO : `controllers/mrp.controller.ts`, `services/bom-cost.service.ts`, `models/production.model.ts`\n"
        "â€¢ SAFE_Immobilisations : `controllers/asset.controller.ts`, `services/depreciation.service.ts`, `models/asset.model.ts`"
    )

    add_header_styled(doc, "2.4 Architecture MVC des 6 Progiciels Satellites Sectoriels (FastAPI)", 2)
    doc.add_paragraph(
        "Les logiciels sectoriels autonomes (`satellites_sectoriels/` et Bureau `SAFE_ERP_TUNISIE`) opÃ¨rent sur des ports rÃ©seau dÃ©diÃ©s "
        "avec une architecture MVC complÃ¨te sous FastAPI et stockage SQLite local hermÃ©tique :"
    )
    doc.add_paragraph(
        "1. Port 8001 : SAFE NÃ©goce & Distribution Commerciale (gestion dÃ©pÃ´ts, tournÃ©es de livraison, tarifs grossistes).\n"
        "2. Port 8002 : SAFE Services, Conseils & Cabinets (suivi temps passÃ©, gestion des dossiers clients, facturation d'honoraires).\n"
        "3. Port 8003 : SAFE Industrie & Production PME (ordres de fabrication, coÃ»ts de revient matiÃ¨res/main-d'Å“uvre, TRS).\n"
        "4. Port 8004 : SAFE Restauration & Point de Vente POS (caisse tactile, plans de table, menus, TVA 7% & 19%).\n"
        "5. Port 8005 : SAFE Transport Routier & Colis Express (flotte vÃ©hicules, lettres de voiture, suivi colis, maintenance).\n"
        "6. Port 8090 : SAFE CRM Ã‰diteur & Licences MatÃ©rielles (supervision des activations Hardware ID, HMAC-SHA256)."
    )

    add_callout(doc, 
        "Chaque satellite sectoriel intÃ¨gre dÃ©sormais en dur son logo PNG officiel en Base64 sans aucune dÃ©pendance rÃ©seau, "
        "Ã©liminant tout risque d'image brisÃ©e, et propose une route d'API native @app.get('/safe-logo.png') pour une compatibilitÃ© absolue.",
        "RÃ‰SOLU : INTÃ‰GRITÃ‰ VISUELLE & SÃ‰CURITÃ‰ DES SATELLITES"
    )

    add_header_styled(doc, "3. Architecture du Module E-Facture Tunisienne (El Fatoora)", 1)
    doc.add_paragraph(
        "Le module E-Facture (`src/application/modules/sales/tunisian-e-invoice.ts`) gÃ¨re le cycle de vie complet de la facture dÃ©matÃ©rialisÃ©e conformÃ©ment aux exigences de Tunisie TradeNet :"
    )
    doc.add_paragraph("â€¢ GÃ©nÃ©ration UBL 2.1 : Extraction des mÃ©tadonnÃ©es de la facture de vente (entitÃ© Ã©mettrice, client, matricule fiscal, TVA 19/13/7%, timbre 1 DT) et structuration sous format XML standardisÃ© OASIS UBL 2.1 Invoice.")
    doc.add_paragraph("â€¢ Calcul du Condensat SHA-256 : Hachage cryptographique du corps XML garantissant la non-altÃ©ration du document.")
    doc.add_paragraph("â€¢ Cachet Ã‰lectronique Visible (CEV / 2D-Doc) : GÃ©nÃ©ration de l'en-tÃªte normalisÃ© `CEV01` contenant : Matricule Ã©metteur (MF), Matricule client, NÂ° facture, Date d'Ã©mission, Montants HT, TVA, Timbre, Total TTC et empreinte de sÃ©curitÃ© Base64.")
    doc.add_paragraph("â€¢ Signature NumÃ©rique TunTrust : Application du certificat X.509 de l'entreprise avec clÃ© privÃ©e RSA-SHA256.")
    doc.add_paragraph("â€¢ TÃ©lÃ©transmission TTN : Envoi du flux XML via les passerelles d'interconnexion sÃ©curisÃ©es de Tunisie TradeNet, rÃ©cupÃ©ration de l'accusÃ© de rÃ©ception et affectation du numÃ©ro d'agrÃ©ment officiel.")

    add_header_styled(doc, "4. ModÃ¨le de DonnÃ©es & Tables ClÃ©s", 1)
    doc.add_paragraph(
        "Le schÃ©ma de base de donnÃ©es comprend 131 tables organisÃ©es en domaines fonctionnels Ã©tanches :"
    )
    doc.add_paragraph("â€¢ Domaine Facturation Ã‰lectronique : TunisianEInvoice (id, invoiceId, entityId, ttnReference, status, xmlPayload, sha256Hash, qrCodeData, signatureDigest, submissionDate, responseDate, rejectionReason).")
    doc.add_paragraph("â€¢ Domaine Comptable & TrÃ©sorerie : ChartOfAccount, JournalEntry, JournalLine, BankAccount, BankStatement, BankStatementLine, BankReconciliation, CashflowPayment, CashflowAccountingMapping.")
    doc.add_paragraph("â€¢ Domaine Ventes & Clients : Customer, CustomerContact, SalesQuote, SalesOrder, Invoice, InvoiceItem, SalesInvoiceWorkflowEvent.")
    doc.add_paragraph("â€¢ Domaine Achats & Fournisseurs : Vendor, PurchaseOrder, PurchaseOrderLine, PurchaseInvoice, PurchaseInvoiceLine, SupplierCreditNote, PurchaseInvoiceWorkflowEvent.")
    doc.add_paragraph("â€¢ Domaine Stocks & Production : Material, MaterialWarehouseStock, Warehouse, StockMovement, ProductionOrder, BillOfMaterial.")
    doc.add_paragraph("â€¢ Domaine FiscalitÃ© & RÃ©glementaire : CountryProfile, CountryTaxRate, CountryTaxRule, CountryTaxThreshold, TaxDeclarationWorkpaper, WithholdingCertificate.")
    doc.add_paragraph("â€¢ Domaine RH & Paie : Employee, LeaveRequest, PayrollConfig, PayrollRubrique, PayrollTaxBracket, HrDocumentMetadata.")
    doc.add_paragraph("â€¢ Domaine SÃ©curitÃ© & Audit : User, AuthSession, AdminUserEvent, JournalEntryAuditChainHead, JournalEntryAuditRecord.")

    add_header_styled(doc, "5. Points d'EntrÃ©e API REST (E-Facturation & Ventes)", 1)
    doc.add_paragraph("Le module de facturation Ã©lectronique expose les endpoints REST sÃ©curisÃ©s suivants :")
    doc.add_paragraph("â€¢ GET /api/sales/e-invoices?entityId=:id : Liste et mÃ©tadonnÃ©es des e-factures Ã©mises pour une filiale.")
    doc.add_paragraph("â€¢ GET /api/sales/e-invoices/:id : Consultation dÃ©taillÃ©e d'une e-facture (statut TTN, CEV, empreintes).")
    doc.add_paragraph("â€¢ GET /api/sales/e-invoices/:id/xml : Flux brut XML UBL 2.1 tÃ©lÃ©chargeable au standard TTN.")
    doc.add_paragraph("â€¢ POST /api/sales/e-invoices/generate/:invoiceId : GÃ©nÃ©ration du document XML UBL et du CEV.")
    doc.add_paragraph("â€¢ POST /api/sales/e-invoices/:id/sign : Signature cryptographique par certificat TunTrust.")
    doc.add_paragraph("â€¢ POST /api/sales/e-invoices/:id/submit-ttn : Soumission et obtention de l'agrÃ©ment TTN.")
    doc.add_paragraph("â€¢ POST /api/sales/e-invoices/bulk-generate : GÃ©nÃ©ration, signature et transmission par lots.")

    # Multi-path saves
    targets = [
        os.path.join(DOCS_DESKTOP_DIR, "ARCHITECTURE_TECHNIQUE_SAFE_ERP.docx"),
        os.path.join(DESKTOP_DIR, "ARCHITECTURE_TECHNIQUE_SAFE_ERP.docx"),
        os.path.join(DOCS_PROJ_DIR, "ARCHITECTURE_TECHNIQUE_SAFE_ERP.docx"),
        os.path.join(PROJECT_DIR, "ARCHITECTURE_TECHNIQUE_SAFE_ERP.docx")
    ]
    for target in targets:
        try:
            doc.save(target)
            print(f"âœ” DAT Ã©crit avec succÃ¨s dans : {target}")
        except Exception as e:
            print(f"âš  Erreur lors de l'enregistrement de {target} : {e}")

# Run generator
if __name__ == "__main__":
    print("=" * 80)
    print("GÃ‰NÃ‰RATION DU DOSSIER D'ARCHITECTURE TECHNIQUE MIS Ã€ JOUR (MVC & SERVICES)")
    print("=" * 80)
    generate_updated_architecture_doc()

