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
    set_cell_background(cell, 'F0FDF4' if 'VALIDÉ' in title or 'CONFORME' in title else 'EFF6FF')
    set_cell_margins(cell, top=120, bottom=120, left=180, right=180)
    p = cell.paragraphs[0]
    r_title = p.add_run(f"📌 {title} : ")
    r_title.bold = True
    r_title.font.color.rgb = RGBColor(22, 101, 52) if 'VALIDÉ' in title or 'CONFORME' in title else RGBColor(30, 58, 138)
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
    r_corp = p_meta.add_run("SAFE ERP • SUITE DE PROLOGICIELS MÉTIERS\nRépublique Tunisienne • Normes SCE, Fiscales & Sociales\nDate d’arrêté : 18 Novembre 2026")
    r_corp.font.size = Pt(9)
    r_corp.font.color.rgb = RGBColor(100, 116, 139)

    doc.add_paragraph("\n\n")

    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r_type = p_title.add_run("ARCHITECTURE PRODUIT & DÉCOUPAGE MÉTIER\n")
    r_type.font.size = Pt(12)
    r_type.font.bold = True
    r_type.font.color.rgb = RGBColor(14, 116, 144)

    r_title = p_title.add_run("SAFE SUITE TUNISIE\n")
    r_title.font.size = Pt(26)
    r_title.font.bold = True
    r_title.font.color.rgb = RGBColor(30, 58, 138)

    r_sub = p_title.add_run("Gamme de Prologiciels Verticaux Autonomes & Intégrés adaptés à la Législation Tunisienne\n")
    r_sub.font.size = Pt(14)
    r_sub.font.color.rgb = RGBColor(71, 85, 105)

    doc.add_paragraph("\n")

    add_callout(doc, 
        "Ce dossier formalise le découpage modulaire du progiciel SAFE ERP en une collection de prologiciels métiers autonomes et complémentaires, "
        "implantés à l'adresse C:\\Users\\USER\\OneDrive\\Desktop\\SAFE_ERP_DRAFT 4. "
        "Chaque prologiciel est conforme à 100 % aux normes tunisiennes (SCE, TVA, TTN El Fatoora, IRPP, CNSS, NCT).",
        "CONFORMITÉ LÉGISLATIVE TUNISIENNE"
    )

    doc.add_page_break()

    # Section 1
    add_header_styled(doc, "1. Vision Stratégique & Architecture Modulaire Découplée", 1)
    doc.add_paragraph(
        "Pour répondre aux exigences des PME, grands comptes et cabinets d'expertise comptable tunisiens, "
        "SAFE ERP adopte une stratégie produit à double détente : « Best-of-Breed » modulaire ou ERP global intégré. "
        "Cette approche permet aux entreprises d'acquérir et de déployer uniquement le prologiciel métier dont elles ont besoin "
        "(ex: uniquement la Facturation ou uniquement la Paie), tout en garantissant une montée de version et une intégration native sans ressaisie "
        "vers la comptabilité générale et la consolidation groupe."
    )

    summary_table = [
        ["Prologiciel Métier", "Répertoire Dédié", "Cœur Fonctionnel", "Cadre Légal Tunisien Applicable"],
        ["SAFE Facturation", "SAFE_Facturation", "Devis, Bons de commande, Factures Ventes/Achats, Retenues RS", "Décret 2016-1098, Décret-loi 2021-21 (TTN), TVA 19/13/7%, RS 1.5%"],
        ["SAFE Gestion des Stocks", "SAFE_Gestion_des_Stocks", "Multi-dépôts, Valorisation PUMP, Inventaires, Douanes AT", "Norme NCT 04, Code des Douanes (Admission Temporaire AT/ACT)"],
        ["SAFE Paie", "SAFE_Paie", "Bulletins de paie, IRPP 8 tranches, CNSS 9.68%, Déclarations DS", "Loi de Finances, Barème IRPP, CNSS 9.68%, FOPROLOS 1%, CSS 0.5%"],
        ["SAFE Gestion RH", "SAFE_Gestion_RH", "Dossiers salariés, Contrats CIVP/CDI, Congés légaux, GPEC", "Code du Travail (Loi 66-27), Décrets ANETI, Médecine du Travail"],
        ["SAFE Comptabilité & Fiscalité", "SAFE_Comptabilite_Fiscalite", "Grand Livre, Balance 8 col, Déclaration G50, IS 20%, Banques", "Loi 96-112 (SCE), G50 mensuel (CDPF), Barème IS 20%"],
        ["SAFE Production & GPAO", "SAFE_Production_GPAO", "Nomenclatures BOM, Ordres de fabrication (OF), MRP, CAPA", "Normes INNORPI, NCT 04 (évaluation des en-cours de production)"],
        ["SAFE Immobilisations", "SAFE_Immobilisations", "Fichier actifs, Amortissements linéaire/dégressif, Dotations", "Norme NCT 05, Barèmes fiscaux de la Direction Générale des Impôts (DGI)"],
    ]
    create_styled_table(doc, summary_table[0], summary_table[1:], [1.6, 1.6, 2.2, 1.8])

    # Section 2: Prologiciels Detail
    add_header_styled(doc, "2. Fiches Techniques des Prologiciels Métiers", 1)

    # 2.1 Facturation
    add_header_styled(doc, "2.1 SAFE Facturation (Achat & Vente)", 2)
    doc.add_paragraph(
        "Ce prologiciel concentre l'intégralité du cycle commercial amont et aval. "
        "Il intègre nativement le système national de facturation électronique « El Fatoora » connecté à la plateforme Tunisie TradeNet (TTN) :"
    )
    doc.add_paragraph("• Standard XML UBL 2.1 : Émission automatique des factures au format légal avec validation des schémas OASIS.")
    doc.add_paragraph("• Sécurité Cryptographique TunTrust : Signature numérique qualifiée X.509 délivrée par l'Agence Nationale de Certification Électronique (ANCE).")
    doc.add_paragraph("• Cachet Électronique Visible (CEV / 2D-Doc) : QR code de sécurisation haute densité conforme aux directives de la DGI.")
    doc.add_paragraph("• Retenue à la Source (RS) : Génération instantanée des certificats légaux de retenue à la source de 1,5 % (achats généraux >= 1 000 DT TTC), 0,5 % et 15 % (honoraires professionnels).")

    # 2.2 Stocks
    add_header_styled(doc, "2.2 SAFE Gestion des Stocks & Entrepôts (MM)", 2)
    doc.add_paragraph(
        "Dédié à la supply chain industrielle et commerciale, ce prologiciel garantit une traçabilité totale des flux physiques et valorisés :"
    )
    doc.add_paragraph("• Valorisation PUMP (NCT 04) : Calcul dynamique en temps réel du Prix Unitaire Moyen Pondéré pour chaque article à chaque entrée en stock.")
    doc.add_paragraph("• Régimes Douaniers Suspensifs : Registre réglementaire d'Admission Temporaire (AT) et d'Amélioration Active (ACT) sous contrôle de la Douane tunisienne, avec gestion des cautions bancaires et comptes d'apurement.")
    doc.add_paragraph("• Gestion Multi-Dépôts : Dépôts centraux, dépôts régionaux, magasins de pièces de rechange et transferts inter-dépôts sécurisés.")

    # 2.3 Paie
    add_header_styled(doc, "2.3 SAFE Paie Tunisienne & Déclarations Sociales", 2)
    doc.add_paragraph(
        "Conçu pour traiter les spécificités de la législation sociale et fiscale tunisienne :"
    )
    doc.add_paragraph("• Barème IRPP à 8 Tranches : Calcul progressif automatisé avec prise en compte des déductions familiales (300 DT chef de famille, 100 DT par enfant à charge).")
    doc.add_paragraph("• Cotisations CNSS : Prélèvement de 9,68 % pour la part salariale et calcul de la part patronale (16,57 % secteur non-agricole).")
    doc.add_paragraph("• Taxes Annexes : FOPROLOS à 1 % et Contribution Sociale de Solidarité (CSS) à 0,5 %.")
    doc.add_paragraph("• Déclaration Trimestrielle CNSS (DS) : Génération automatisée des états déclaratifs trimestriels pour télé-déclaration.")

    # 2.4 RH
    add_header_styled(doc, "2.4 SAFE Gestion des Ressources Humaines & Talents", 2)
    doc.add_paragraph(
        "Gestion administrative et stratégique du capital humain conforme au Code du Travail tunisien (Loi n° 66-27) :"
    )
    doc.add_paragraph("• Contrats de Travail : Gestion des CDI, CDD et conventions d'insertion ANETI (CIVP / SIVP, CAIP, Contrat Karama).")
    doc.add_paragraph("• Congés Payés Légaux : Calcul automatique des droits à congés (1 jour par mois + bonifications d'ancienneté) et calendrier des jours fériés légaux.")
    doc.add_paragraph("• Médecine du Travail : Suivi des visites médicales obligatoires et attestations d'aptitude.")

    # 2.5 Comptabilité
    add_header_styled(doc, "2.5 SAFE Comptabilité Générale & Fiscalité Tunisienne", 2)
    doc.add_paragraph(
        "Cœur financier d'entreprise conforme au Système Comptable des Entreprises (SCE - Loi n° 96-112) :"
    )
    doc.add_paragraph("• Balance Générale 8 Colonnes : Balances initiales, mouvements débits/crédits de la période et soldes de clôture sans aucun centime d'écart.")
    doc.add_paragraph("• Déclarations Fiscales G50 : Liasses mensuelles automatisées avec calcul précis de la TVA nette due (ou crédit de TVA), du timbre fiscal et des retenues à la source.")
    doc.add_paragraph("• Liasse IS Annuelle : Détermination du résultat fiscal et liquidation de l'Impôt sur les Sociétés au taux légal de 20 %.")
    doc.add_paragraph("• Rapprochement Bancaire : Lettrage automatisé avec les banques locales (STB, BIAT, BH, BNA, etc.).")

    # Section 3: Modalités d'Exécution
    add_header_styled(doc, "3. Modalités d'Installation & Déploiement en Clientèle", 1)
    doc.add_paragraph(
        "L'ensemble des prologiciels a été implanté directement dans le dossier racine :"
    )
    doc.add_paragraph("Répertoire physique : C:\\Users\\USER\\OneDrive\\Desktop\\SAFE_ERP_DRAFT 4")
    doc.add_paragraph(
        "Chaque dossier métier contient son propre lanceur exécutable Windows (.cmd et .ps1) ainsi que sa documentation technique et légale. "
        "Un lanceur central interactif (MENU_PROLOGICIELS_SAFE.cmd) permet également de piloter toute la suite depuis un point d'entrée unique."
    )

    path_d4 = os.path.join(DRAFT4_DIR, "SUITE_PROLOGICIELS_METIERS_SAFE_TUNISIE.docx")
    path_desktop = os.path.join(DESKTOP_DIR, "SUITE_PROLOGICIELS_METIERS_SAFE_TUNISIE.docx")
    doc.save(path_d4)
    doc.save(path_desktop)
    print(f"✔ Document generated: {path_d4}")
    print(f"✔ Document generated: {path_desktop}")

if __name__ == "__main__":
    generate_prologiciels_doc()
