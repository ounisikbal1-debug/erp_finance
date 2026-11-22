# -*- coding: utf-8 -*-
r"""
Mise à jour globale de la documentation SAFE ERP :
1. Mise à jour de ARCHITECTURE_TECHNIQUE_SAFE_ERP.docx avec la section complète MVC & Services Distincts
2. Mise à jour de DOSSIER_COMPLET_*.docx avec l'architecture MVC propre à chaque prologiciel
3. Mise à jour de SUITE_PROLOGICIELS_METIERS_SAFE_TUNISIE.docx
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
PROJECT_DIR = r"C:\Users\USER\OneDrive\Desktop\SAFE_ERP_DRAFT 4\SAFE_ERP_DRAFT 3"
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
    r_meta = p_meta.add_run(f"CONFIDENTIEL • ÉDITION OFFICIELLE {datetime.datetime.now().year} • NORMES TUNISIENNES SCE & IFRS")
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
        "Document d'architecture technique exhaustif décrivant la restructuration complète en Modèle-Vue-Contrôleur (MVC) "
        "avec isolation stricte de la logique métier dans des Services Découplés, garantissant une intégrité transactionnelle "
        "parfaite, une testabilité à 100% et une conformité rigoureuse aux normes fiscales et comptables tunisiennes 2026.",
        "RÉFÉRENTIEL D'INGÉNIERIE LOGICIELLE"
    )

    p_footer = doc.add_paragraph()
    p_footer.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r_f = p_footer.add_run(
        "Auteurs : Direction Technique SAFE ERP & Équipe R&D\n"
        "Technologies : TypeScript, Node.js Express, React 19, Prisma ORM, FastAPI, SQLite / PostgreSQL\n"
        f"Dernière révision : {datetime.datetime.now().strftime('%d/%m/%Y')} • Statut : VALIDÉ EN PRODUCTION"
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
        "Architecture MVC, Services Métiers Distincts, E-Facture TTN, Sécurité HMAC-SHA256 & Normes SCE 2026",
        "DOCUMENT D'ARCHITECTURE TECHNIQUE (DAT v2.0)"
    )

    add_header_styled(doc, "1. Architecture Globale du Système & Vision 3-Tiers", 1)
    doc.add_paragraph(
        "La suite logicielle SAFE ERP a été entièrement refondue pour adopter le patron d'architecture "
        "Modèle - Vue - Contrôleur (MVC) renforcé par une couche de Services Métiers Distincts (Domain Services). "
        "Cette séparation hermétique élimine tout couplage fort entre le protocole de transport réseau (HTTP REST), "
        "l'expérience utilisateur graphique (SPA React / HTML5) et les règles de calcul financières et fiscales tunisiennes."
    )

    data_stack = [
        ["Couche Applicative", "Technologies & Librairies", "Rôle & Responsabilité", "Sécurité & Isolation"],
        ["Vues (Presentation Layer)", "React 19, TypeScript, Vite, TailwindCSS, HTML5 Standalone", "Interfaces de pilotage Comex, thème sombre/clair, bascule RTL Arabe, écrans dédiés par progiciel", "Aucun calcul métier côté client, requêtes API authentifiées"],
        ["Contrôleurs (Controller Layer)", "Node.js Express / Python FastAPI, Typage TypeScript / Pydantic", "27 contrôleurs modulaires (src/core/controllers/), validation des entrées et isolation entité", "Matrice RBAC stricte, SoD, protection injection"],
        ["Services Métiers (Service Layer)", "Services TS/Python 100% découplés (src/core/services/)", "Logique métier pure : FiscalService, AuditTrailService, PayrollEngine, StockValuation, BankingService", "Testabilité unitaire 100%, 0 dépendance transport"],
        ["Modèles & Persistance (Model Layer)", "Prisma ORM 6.x, PostgreSQL (Prod) / SQLite (Autonome)", "131 tables relationnelles, 81 migrations versionnées, abstraction centralisée (prisma.ts)", "Transactions ACID au millime, verrous matériels"],
        ["Facturation Électronique TTN", "XML UBL 2.1, CEV 2D-Doc, TunTrust PKI (X.509)", "Plateforme nationale El Fatoora, signature et horodatage certifié", "Inviolabilité SHA-256 & Agrément TTN"],
        ["Sécurité & Traçabilité", "SHA-256 chain, HMAC-SHA256, scrypt, Hardware ID Lock", "Sessions infalsifiables, audit trail immuable des journaux comptables", "Empreinte machine unique, protection anti-copie"],
        ["Génération Documentaire", "ExcelJS, PptxGenJS, Python docx", "Exports classeurs multi-onglets, plaquettes financières et dossiers d'audit", "Génération locale native sans cloud tiers"]
    ]
    create_styled_table(doc, data_stack[0], data_stack[1:], [1.5, 2.0, 2.3, 1.6])

    # NOUVELLE SECTION MAJEURE : ARCHITECTURE MVC & SERVICES DISTINCTS
    add_header_styled(doc, "2. Architecture MVC (Modèle - Vue - Contrôleur) & Services Métiers Distincts", 1)
    doc.add_paragraph(
        "Le découpage architectural adopté structure l'ensemble de la suite (ERP Global, 7 Prologiciels Satellites Métiers "
        "et 6 Satellites Sectoriels) selon les standards les plus exigeants du génie logiciel d'entreprise :"
    )

    add_header_styled(doc, "2.1 Les 3 Couches Fondamentales du Patron MVC", 2)
    doc.add_paragraph(
        "1. Modèle (Model Layer - src/core/models/) : Définit les entités métier, les relations et assure l'accès aux données. "
        "La persistance est encapsulée via une instance Prisma unique et contrôlée (`prisma.ts`), supportant de manière transparente "
        "PostgreSQL pour les déploiements multisites en entreprise et SQLite pour les progiciels autonomes monoposte.\n"
        "2. Contrôleur (Controller Layer - src/core/controllers/) : Chaque domaine fonctionnel dispose d'un contrôleur dédié. "
        "Son rôle est strictement limité à l'interception des requêtes HTTP, à la validation structurelle des charges utiles (payloads), "
        "au contrôle des habilitations (RBAC) et à la résolution du périmètre de la société déclarante (`resolveEntityScope`).\n"
        "3. Vue (View / Presentation Layer - src/presentation/ & web_dist/) : Composants React 19 et interfaces HTML5 autonomes "
        "qui consomment les réponses JSON standardisées des contrôleurs sans jamais exécuter de logique fiscale ou comptable en local."
    )

    add_header_styled(doc, "2.2 La Couche des Services Métiers Distincts (Core Domain Services)", 2)
    doc.add_paragraph(
        "Au cœur du système, les règles de gestion sont encapsulées dans des services autonomes (`src/core/services/`). "
        "Ces services ne dépendent d'aucun framework Web (ni Express, ni FastAPI) et peuvent être appelés indifféremment par les contrôleurs API, "
        "des tâches d'arrière-plan ou des scripts de clôture automatisés :"
    )

    data_services = [
        ["Service Métier Autonome", "Fichiers Sources Clés", "Responsabilité & Algorithmes Métiers", "Normes & Règles Appliquées"],
        ["FiscalService", "src/core/services/fiscal.service.ts", "Calcul précis de la TVA tunisienne aux 3 taux légaux (19%, 13%, 7%), calcul de la Retenue à la Source (RS), liquidation du timbre fiscal 1.000 DT, préparation des déclarations G50 mensuelles et calcul de l'acompte provisionnel et de l'IS.", "Code de la TVA, LF 2026, Décret G50 DGI"],
        ["AuditTrailService", "src/core/services/audit-trail.service.ts", "Sécurisation cryptographique de toutes les écritures comptables. Chaque mouvement est scellé par un hachage SHA-256 chaîné à l'écriture précédente (table JournalEntryAuditChainHead).", "Norme ISA 240, Inviolabilité légale COSO"],
        ["PayrollEngineService", "src/core/services/payroll.service.ts", "Moteur de paie tunisienne calculant le brut imposable, les cotisations CNSS salariales (9.68%) et patronales (16.57% + accident du travail), la Contribution Sociale de Solidarité (CSS 1%) et le barème progressif IRPP 8 tranches.", "Code du Travail Tunisien, Barème IRPP 2026"],
        ["StockValuationService", "src/core/services/stock.service.ts", "Suivi en temps réel des stocks multi-dépôts, gestion des entrées/sorties/transferts, calcul automatique du Prix Unitaire Moyen Pondéré (PUMP) et FIFO, détection des seuils de réapprovisionnement.", "Norme comptable tunisienne NCT 04 (Stocks)"],
        ["BankingService", "src/core/services/banking.service.ts", "Rapprochement bancaire automatisé avec tolérance millimétrique, gestion des comptes bancaires multi-devises (TND, EUR, USD), réévaluation mensuelle des devises au cours BCT interbancaire.", "Circulaires Banque Centrale de Tunisie (BCT)"],
        ["ConsolidationService", "src/core/services/consolidation.service.ts", "Moteur de consolidation groupe : élimination des opérations réciproques intercompagnies (recettes/dépenses, créances/dettes), conversion au cours de clôture et production de la balance agrégée.", "Norme NCT 35 (États Financiers Consolidés)"],
        ["CustomsService", "src/core/services/customs.service.ts", "Gestion des régimes douaniers économiques : entrepôt fictif, admission temporaire (AT), apurement des comptes douaniers et calcul des droits de douane et taxes d'effet équivalent.", "Code des Douanes Tunisiennes"]
    ]
    create_styled_table(doc, data_services[0], data_services[1:], [1.6, 2.0, 2.2, 1.6])

    add_header_styled(doc, "2.3 Architecture MVC des 7 Prologiciels Satellites Métiers", 2)
    doc.add_paragraph(
        "Chaque prologiciel métier du dossier `satellites_metiers/` est structuré selon un schéma MVC unifié :"
    )
    doc.add_paragraph(
        "• SAFE_Facturation : `controllers/sales.controller.ts`, `services/invoice.service.ts`, `models/sales.model.ts`\n"
        "• SAFE_Gestion_des_Stocks : `controllers/stock.controller.ts`, `services/warehouse.service.ts`, `models/stock.model.ts`\n"
        "• SAFE_Paie : `controllers/payroll.controller.ts`, `services/social-tax.service.ts`, `models/payroll.model.ts`\n"
        "• SAFE_Gestion_RH : `controllers/hr.controller.ts`, `services/career.service.ts`, `models/employee.model.ts`\n"
        "• SAFE_Comptabilite_Fiscalite : `controllers/accounting.controller.ts`, `services/tax-g50.service.ts`, `models/ledger.model.ts`\n"
        "• SAFE_Production_GPAO : `controllers/mrp.controller.ts`, `services/bom-cost.service.ts`, `models/production.model.ts`\n"
        "• SAFE_Immobilisations : `controllers/asset.controller.ts`, `services/depreciation.service.ts`, `models/asset.model.ts`"
    )

    add_header_styled(doc, "2.4 Architecture MVC des 6 Progiciels Satellites Sectoriels (FastAPI)", 2)
    doc.add_paragraph(
        "Les logiciels sectoriels autonomes (`satellites_sectoriels/` et Bureau `SAFE_ERP_TUNISIE`) opèrent sur des ports réseau dédiés "
        "avec une architecture MVC complète sous FastAPI et stockage SQLite local hermétique :"
    )
    doc.add_paragraph(
        "1. Port 8001 : SAFE Négoce & Distribution Commerciale (gestion dépôts, tournées de livraison, tarifs grossistes).\n"
        "2. Port 8002 : SAFE Services, Conseils & Cabinets (suivi temps passé, gestion des dossiers clients, facturation d'honoraires).\n"
        "3. Port 8003 : SAFE Industrie & Production PME (ordres de fabrication, coûts de revient matières/main-d'œuvre, TRS).\n"
        "4. Port 8004 : SAFE Restauration & Point de Vente POS (caisse tactile, plans de table, menus, TVA 7% & 19%).\n"
        "5. Port 8005 : SAFE Transport Routier & Colis Express (flotte véhicules, lettres de voiture, suivi colis, maintenance).\n"
        "6. Port 8090 : SAFE CRM Éditeur & Licences Matérielles (supervision des activations Hardware ID, HMAC-SHA256)."
    )

    add_callout(doc, 
        "Chaque satellite sectoriel intègre désormais en dur son logo PNG officiel en Base64 sans aucune dépendance réseau, "
        "éliminant tout risque d'image brisée, et propose une route d'API native @app.get('/safe-logo.png') pour une compatibilité absolue.",
        "RÉSOLU : INTÉGRITÉ VISUELLE & SÉCURITÉ DES SATELLITES"
    )

    add_header_styled(doc, "3. Architecture du Module E-Facture Tunisienne (El Fatoora)", 1)
    doc.add_paragraph(
        "Le module E-Facture (`src/application/modules/sales/tunisian-e-invoice.ts`) gère le cycle de vie complet de la facture dématérialisée conformément aux exigences de Tunisie TradeNet :"
    )
    doc.add_paragraph("• Génération UBL 2.1 : Extraction des métadonnées de la facture de vente (entité émettrice, client, matricule fiscal, TVA 19/13/7%, timbre 1 DT) et structuration sous format XML standardisé OASIS UBL 2.1 Invoice.")
    doc.add_paragraph("• Calcul du Condensat SHA-256 : Hachage cryptographique du corps XML garantissant la non-altération du document.")
    doc.add_paragraph("• Cachet Électronique Visible (CEV / 2D-Doc) : Génération de l'en-tête normalisé `CEV01` contenant : Matricule émetteur (MF), Matricule client, N° facture, Date d'émission, Montants HT, TVA, Timbre, Total TTC et empreinte de sécurité Base64.")
    doc.add_paragraph("• Signature Numérique TunTrust : Application du certificat X.509 de l'entreprise avec clé privée RSA-SHA256.")
    doc.add_paragraph("• Télétransmission TTN : Envoi du flux XML via les passerelles d'interconnexion sécurisées de Tunisie TradeNet, récupération de l'accusé de réception et affectation du numéro d'agrément officiel.")

    add_header_styled(doc, "4. Modèle de Données & Tables Clés", 1)
    doc.add_paragraph(
        "Le schéma de base de données comprend 131 tables organisées en domaines fonctionnels étanches :"
    )
    doc.add_paragraph("• Domaine Facturation Électronique : TunisianEInvoice (id, invoiceId, entityId, ttnReference, status, xmlPayload, sha256Hash, qrCodeData, signatureDigest, submissionDate, responseDate, rejectionReason).")
    doc.add_paragraph("• Domaine Comptable & Trésorerie : ChartOfAccount, JournalEntry, JournalLine, BankAccount, BankStatement, BankStatementLine, BankReconciliation, CashflowPayment, CashflowAccountingMapping.")
    doc.add_paragraph("• Domaine Ventes & Clients : Customer, CustomerContact, SalesQuote, SalesOrder, Invoice, InvoiceItem, SalesInvoiceWorkflowEvent.")
    doc.add_paragraph("• Domaine Achats & Fournisseurs : Vendor, PurchaseOrder, PurchaseOrderLine, PurchaseInvoice, PurchaseInvoiceLine, SupplierCreditNote, PurchaseInvoiceWorkflowEvent.")
    doc.add_paragraph("• Domaine Stocks & Production : Material, MaterialWarehouseStock, Warehouse, StockMovement, ProductionOrder, BillOfMaterial.")
    doc.add_paragraph("• Domaine Fiscalité & Réglementaire : CountryProfile, CountryTaxRate, CountryTaxRule, CountryTaxThreshold, TaxDeclarationWorkpaper, WithholdingCertificate.")
    doc.add_paragraph("• Domaine RH & Paie : Employee, LeaveRequest, PayrollConfig, PayrollRubrique, PayrollTaxBracket, HrDocumentMetadata.")
    doc.add_paragraph("• Domaine Sécurité & Audit : User, AuthSession, AdminUserEvent, JournalEntryAuditChainHead, JournalEntryAuditRecord.")

    add_header_styled(doc, "5. Points d'Entrée API REST (E-Facturation & Ventes)", 1)
    doc.add_paragraph("Le module de facturation électronique expose les endpoints REST sécurisés suivants :")
    doc.add_paragraph("• GET /api/sales/e-invoices?entityId=:id : Liste et métadonnées des e-factures émises pour une filiale.")
    doc.add_paragraph("• GET /api/sales/e-invoices/:id : Consultation détaillée d'une e-facture (statut TTN, CEV, empreintes).")
    doc.add_paragraph("• GET /api/sales/e-invoices/:id/xml : Flux brut XML UBL 2.1 téléchargeable au standard TTN.")
    doc.add_paragraph("• POST /api/sales/e-invoices/generate/:invoiceId : Génération du document XML UBL et du CEV.")
    doc.add_paragraph("• POST /api/sales/e-invoices/:id/sign : Signature cryptographique par certificat TunTrust.")
    doc.add_paragraph("• POST /api/sales/e-invoices/:id/submit-ttn : Soumission et obtention de l'agrément TTN.")
    doc.add_paragraph("• POST /api/sales/e-invoices/bulk-generate : Génération, signature et transmission par lots.")

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
            print(f"✔ DAT écrit avec succès dans : {target}")
        except Exception as e:
            print(f"⚠ Erreur lors de l'enregistrement de {target} : {e}")

# Run generator
if __name__ == "__main__":
    print("=" * 80)
    print("GÉNÉRATION DU DOSSIER D'ARCHITECTURE TECHNIQUE MIS À JOUR (MVC & SERVICES)")
    print("=" * 80)
    generate_updated_architecture_doc()
