import os, sys, datetime, docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

DESKTOP_DIR = r"C:\Users\USER\OneDrive\Desktop"
DRAFT4_DIR = r"C:\Users\USER\OneDrive\Desktop\SAFE_ERP_DRAFT 4"

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
        set_cell_background(hdr_cells[i], '1E3A8A')
        set_cell_margins(hdr_cells[i], top=120, bottom=120, left=140, right=140)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in p.runs:
            run.font.bold = True
            run.font.color.rgb = RGBColor(255, 255, 255)
            run.font.size = Pt(10)
            run.font.name = 'Calibri'

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
                run.font.size = Pt(9.5)
                run.font.name = 'Calibri'
                run.font.color.rgb = RGBColor(30, 41, 59)

    if col_widths and len(col_widths) == len(headers):
        for row in table.rows:
            for idx, width in enumerate(col_widths):
                row.cells[idx].width = Inches(width)

    doc.add_paragraph()
    return table

def add_header_styled(doc, text, level):
    h = doc.add_heading(text, level=level)
    for run in h.runs:
        run.font.name = 'Calibri'
        if level == 1:
            run.font.color.rgb = RGBColor(30, 58, 138)
            run.font.size = Pt(16)
            run.font.bold = True
        elif level == 2:
            run.font.color.rgb = RGBColor(14, 116, 144)
            run.font.size = Pt(13)
            run.font.bold = True
        elif level == 3:
            run.font.color.rgb = RGBColor(71, 85, 105)
            run.font.size = Pt(11)
            run.font.bold = True
    return h

def add_callout(doc, text, title="NOTE OFFICIELLE"):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    set_cell_background(cell, 'F0FDF4' if 'VALIDÃ‰' in title or 'CONFORME' in title else 'EFF6FF')
    set_cell_margins(cell, top=120, bottom=120, left=180, right=180)
    p = cell.paragraphs[0]
    r_title = p.add_run(f"ðŸ“Œ {title} : ")
    r_title.bold = True
    r_title.font.color.rgb = RGBColor(22, 101, 52) if 'VALIDÃ‰' in title or 'CONFORME' in title else RGBColor(30, 58, 138)
    r_title.font.size = Pt(10)
    r_text = p.add_run(text)
    r_text.font.size = Pt(9.5)
    r_text.font.color.rgb = RGBColor(15, 23, 42)
    doc.add_paragraph()

def generate_prologiciels_doc():
    doc = docx.Document()

    # Cover Page
    p_meta = doc.add_paragraph()
    p_meta.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r_corp = p_meta.add_run("SAFE ERP â€¢ SUITE DE PROLOGICIELS MÃ‰TIERS\nRÃ©publique Tunisienne â€¢ Normes SCE, Fiscales & Sociales\nDate dâ€™arrÃªtÃ© : 18 Novembre 2026")
    r_corp.font.size = Pt(9)
    r_corp.font.color.rgb = RGBColor(100, 116, 139)

    doc.add_paragraph("\n\n")

    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r_type = p_title.add_run("ARCHITECTURE PRODUIT & DÃ‰COUPAGE MÃ‰TIER\n")
    r_type.font.size = Pt(12)
    r_type.font.bold = True
    r_type.font.color.rgb = RGBColor(14, 116, 144)

    r_title = p_title.add_run("SAFE SUITE TUNISIE\n")
    r_title.font.size = Pt(26)
    r_title.font.bold = True
    r_title.font.color.rgb = RGBColor(30, 58, 138)

    r_sub = p_title.add_run("Gamme de Prologiciels Verticaux Autonomes & IntÃ©grÃ©s adaptÃ©s Ã  la LÃ©gislation Tunisienne\n")
    r_sub.font.size = Pt(14)
    r_sub.font.color.rgb = RGBColor(71, 85, 105)

    doc.add_paragraph("\n")

    add_callout(doc, 
        "Ce dossier formalise le dÃ©coupage modulaire du progiciel SAFE ERP en une collection de prologiciels mÃ©tiers autonomes et complÃ©mentaires, "
        "implantÃ©s Ã  l'adresse C:\\Users\\USER\\OneDrive\\Desktop\\SAFE_ERP_DRAFT 4. "
        "Chaque prologiciel est conforme Ã  100 % aux normes tunisiennes (SCE, TVA, TTN El Fatoora, IRPP, CNSS, NCT).",
        "CONFORMITÃ‰ LÃ‰GISLATIVE TUNISIENNE"
    )

    doc.add_page_break()

    # Section 1
    add_header_styled(doc, "1. Vision StratÃ©gique & Architecture Modulaire DÃ©couplÃ©e", 1)
    doc.add_paragraph(
        "Pour rÃ©pondre aux exigences des PME, grands comptes et cabinets d'expertise comptable tunisiens, "
        "SAFE ERP adopte une stratÃ©gie produit Ã  double dÃ©tente : Â« Best-of-Breed Â» modulaire ou ERP global intÃ©grÃ©. "
        "Cette approche permet aux entreprises d'acquÃ©rir et de dÃ©ployer uniquement le prologiciel mÃ©tier dont elles ont besoin "
        "(ex: uniquement la Facturation ou uniquement la Paie), tout en garantissant une montÃ©e de version et une intÃ©gration native sans ressaisie "
        "vers la comptabilitÃ© gÃ©nÃ©rale et la consolidation groupe."
    )

    summary_table = [
        ["Prologiciel MÃ©tier", "RÃ©pertoire DÃ©diÃ©", "CÅ“ur Fonctionnel", "Cadre LÃ©gal Tunisien Applicable"],
        ["SAFE Facturation", "SAFE_Facturation", "Devis, Bons de commande, Factures Ventes/Achats, Retenues RS", "DÃ©cret 2016-1098, DÃ©cret-loi 2021-21 (TTN), TVA 19/13/7%, RS 1.5%"],
        ["SAFE Gestion des Stocks", "SAFE_Gestion_des_Stocks", "Multi-dÃ©pÃ´ts, Valorisation PUMP, Inventaires, Douanes AT", "Norme NCT 04, Code des Douanes (Admission Temporaire AT/ACT)"],
        ["SAFE Paie", "SAFE_Paie", "Bulletins de paie, IRPP 8 tranches, CNSS 9.68%, DÃ©clarations DS", "Loi de Finances, BarÃ¨me IRPP, CNSS 9.68%, FOPROLOS 1%, CSS 0.5%"],
        ["SAFE Gestion RH", "SAFE_Gestion_RH", "Dossiers salariÃ©s, Contrats CIVP/CDI, CongÃ©s lÃ©gaux, GPEC", "Code du Travail (Loi 66-27), DÃ©crets ANETI, MÃ©decine du Travail"],
        ["SAFE ComptabilitÃ© & FiscalitÃ©", "SAFE_Comptabilite_Fiscalite", "Grand Livre, Balance 8 col, DÃ©claration G50, IS 20%, Banques", "Loi 96-112 (SCE), G50 mensuel (CDPF), BarÃ¨me IS 20%"],
        ["SAFE Production & GPAO", "SAFE_Production_GPAO", "Nomenclatures BOM, Ordres de fabrication (OF), MRP, CAPA", "Normes INNORPI, NCT 04 (Ã©valuation des en-cours de production)"],
        ["SAFE Immobilisations", "SAFE_Immobilisations", "Fichier actifs, Amortissements linÃ©aire/dÃ©gressif, Dotations", "Norme NCT 05, BarÃ¨mes fiscaux de la Direction GÃ©nÃ©rale des ImpÃ´ts (DGI)"],
    ]
    create_styled_table(doc, summary_table[0], summary_table[1:], [1.6, 1.6, 2.2, 1.8])

    # Section 2: Prologiciels Detail
    add_header_styled(doc, "2. Fiches Techniques des Prologiciels MÃ©tiers", 1)

    # 2.1 Facturation
    add_header_styled(doc, "2.1 SAFE Facturation (Achat & Vente)", 2)
    doc.add_paragraph(
        "Ce prologiciel concentre l'intÃ©gralitÃ© du cycle commercial amont et aval. "
        "Il intÃ¨gre nativement le systÃ¨me national de facturation Ã©lectronique Â« El Fatoora Â» connectÃ© Ã  la plateforme Tunisie TradeNet (TTN) :"
    )
    doc.add_paragraph("â€¢ Standard XML UBL 2.1 : Ã‰mission automatique des factures au format lÃ©gal avec validation des schÃ©mas OASIS.")
    doc.add_paragraph("â€¢ SÃ©curitÃ© Cryptographique TunTrust : Signature numÃ©rique qualifiÃ©e X.509 dÃ©livrÃ©e par l'Agence Nationale de Certification Ã‰lectronique (ANCE).")
    doc.add_paragraph("â€¢ Cachet Ã‰lectronique Visible (CEV / 2D-Doc) : QR code de sÃ©curisation haute densitÃ© conforme aux directives de la DGI.")
    doc.add_paragraph("â€¢ Retenue Ã  la Source (RS) : GÃ©nÃ©ration instantanÃ©e des certificats lÃ©gaux de retenue Ã  la source de 1,5 % (achats gÃ©nÃ©raux >= 1 000 DT TTC), 0,5 % et 15 % (honoraires professionnels).")

    # 2.2 Stocks
    add_header_styled(doc, "2.2 SAFE Gestion des Stocks & EntrepÃ´ts (MM)", 2)
    doc.add_paragraph(
        "DÃ©diÃ© Ã  la supply chain industrielle et commerciale, ce prologiciel garantit une traÃ§abilitÃ© totale des flux physiques et valorisÃ©s :"
    )
    doc.add_paragraph("â€¢ Valorisation PUMP (NCT 04) : Calcul dynamique en temps rÃ©el du Prix Unitaire Moyen PondÃ©rÃ© pour chaque article Ã  chaque entrÃ©e en stock.")
    doc.add_paragraph("â€¢ RÃ©gimes Douaniers Suspensifs : Registre rÃ©glementaire d'Admission Temporaire (AT) et d'AmÃ©lioration Active (ACT) sous contrÃ´le de la Douane tunisienne, avec gestion des cautions bancaires et comptes d'apurement.")
    doc.add_paragraph("â€¢ Gestion Multi-DÃ©pÃ´ts : DÃ©pÃ´ts centraux, dÃ©pÃ´ts rÃ©gionaux, magasins de piÃ¨ces de rechange et transferts inter-dÃ©pÃ´ts sÃ©curisÃ©s.")

    # 2.3 Paie
    add_header_styled(doc, "2.3 SAFE Paie Tunisienne & DÃ©clarations Sociales", 2)
    doc.add_paragraph(
        "ConÃ§u pour traiter les spÃ©cificitÃ©s de la lÃ©gislation sociale et fiscale tunisienne :"
    )
    doc.add_paragraph("â€¢ BarÃ¨me IRPP Ã  8 Tranches : Calcul progressif automatisÃ© avec prise en compte des dÃ©ductions familiales (300 DT chef de famille, 100 DT par enfant Ã  charge).")
    doc.add_paragraph("â€¢ Cotisations CNSS : PrÃ©lÃ¨vement de 9,68 % pour la part salariale et calcul de la part patronale (16,57 % secteur non-agricole).")
    doc.add_paragraph("â€¢ Taxes Annexes : FOPROLOS Ã  1 % et Contribution Sociale de SolidaritÃ© (CSS) Ã  0,5 %.")
    doc.add_paragraph("â€¢ DÃ©claration Trimestrielle CNSS (DS) : GÃ©nÃ©ration automatisÃ©e des Ã©tats dÃ©claratifs trimestriels pour tÃ©lÃ©-dÃ©claration.")

    # 2.4 RH
    add_header_styled(doc, "2.4 SAFE Gestion des Ressources Humaines & Talents", 2)
    doc.add_paragraph(
        "Gestion administrative et stratÃ©gique du capital humain conforme au Code du Travail tunisien (Loi nÂ° 66-27) :"
    )
    doc.add_paragraph("â€¢ Contrats de Travail : Gestion des CDI, CDD et conventions d'insertion ANETI (CIVP / SIVP, CAIP, Contrat Karama).")
    doc.add_paragraph("â€¢ CongÃ©s PayÃ©s LÃ©gaux : Calcul automatique des droits Ã  congÃ©s (1 jour par mois + bonifications d'anciennetÃ©) et calendrier des jours fÃ©riÃ©s lÃ©gaux.")
    doc.add_paragraph("â€¢ MÃ©decine du Travail : Suivi des visites mÃ©dicales obligatoires et attestations d'aptitude.")

    # 2.5 ComptabilitÃ©
    add_header_styled(doc, "2.5 SAFE ComptabilitÃ© GÃ©nÃ©rale & FiscalitÃ© Tunisienne", 2)
    doc.add_paragraph(
        "CÅ“ur financier d'entreprise conforme au SystÃ¨me Comptable des Entreprises (SCE - Loi nÂ° 96-112) :"
    )
    doc.add_paragraph("â€¢ Balance GÃ©nÃ©rale 8 Colonnes : Balances initiales, mouvements dÃ©bits/crÃ©dits de la pÃ©riode et soldes de clÃ´ture sans aucun centime d'Ã©cart.")
    doc.add_paragraph("â€¢ DÃ©clarations Fiscales G50 : Liasses mensuelles automatisÃ©es avec calcul prÃ©cis de la TVA nette due (ou crÃ©dit de TVA), du timbre fiscal et des retenues Ã  la source.")
    doc.add_paragraph("â€¢ Liasse IS Annuelle : DÃ©termination du rÃ©sultat fiscal et liquidation de l'ImpÃ´t sur les SociÃ©tÃ©s au taux lÃ©gal de 20 %.")
    doc.add_paragraph("â€¢ Rapprochement Bancaire : Lettrage automatisÃ© avec les banques locales (STB, BIAT, BH, BNA, etc.).")

    # Section 3: ModalitÃ©s d'ExÃ©cution
    add_header_styled(doc, "3. ModalitÃ©s d'Installation & DÃ©ploiement en ClientÃ¨le", 1)
    doc.add_paragraph(
        "L'ensemble des prologiciels a Ã©tÃ© implantÃ© directement dans le dossier racine :"
    )
    doc.add_paragraph("RÃ©pertoire physique : C:\\Users\\USER\\OneDrive\\Desktop\\SAFE_ERP_DRAFT 4")
    doc.add_paragraph(
        "Chaque dossier mÃ©tier contient son propre lanceur exÃ©cutable Windows (.cmd et .ps1) ainsi que sa documentation technique et lÃ©gale. "
        "Un lanceur central interactif (MENU_PROLOGICIELS_SAFE.cmd) permet Ã©galement de piloter toute la suite depuis un point d'entrÃ©e unique."
    )

    path_d4 = os.path.join(DRAFT4_DIR, "SUITE_PROLOGICIELS_METIERS_SAFE_TUNISIE.docx")
    path_desktop = os.path.join(DESKTOP_DIR, "SUITE_PROLOGICIELS_METIERS_SAFE_TUNISIE.docx")
    doc.save(path_d4)
    doc.save(path_desktop)
    
    doc_desktop_folder = r"C:\Users\USER\OneDrive\Desktop\SAFE_Doccumentation"
    os.makedirs(doc_desktop_folder, exist_ok=True)
    doc.save(os.path.join(doc_desktop_folder, "SUITE_PROLOGICIELS_METIERS_SAFE_TUNISIE.docx"))
    print(f"âœ” Document generated: {path_d4}")
    print(f"âœ” Document generated: {path_desktop}")

if __name__ == "__main__":
    generate_prologiciels_doc()
