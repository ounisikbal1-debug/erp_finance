import ExcelJS from 'exceljs';
import type { FinancialDashboardSnapshot } from './financial-dashboard-page';

const unavailableRatios = [
  ['Liquidité générale', 'Les postes détaillés d’actif et de passif à court terme ne sont pas classés ici.'],
  ['FRNG et autonomie financière', 'Le classement des capitaux et actifs n’est pas rapproché de façon fiable pour toutes les entités.'],
  ['DSCR et couverture des intérêts', 'Les échéances de dette et les charges d’intérêts ne sont pas disponibles dans les sources du tableau de bord.'],
  ['ROE, ROA, marges et ROCE', 'Les résultats et dénominateurs de bilan ne sont pas disponibles comme agrégats classés et rapprochés.'],
  ['BFR, DSO et DPO', 'Les règlements partiels et soldes ouverts fiables des clients et fournisseurs ne sont pas tous disponibles.'],
  ['Rotation des stocks', 'Les mouvements historiques et consommations de stock ne sont pas disponibles dans cette agrégation.'],
  ['Flux de trésorerie et croissance', 'Les séries de flux complets et comparables nécessaires ne sont pas calculées par la source actuelle.'],
  ['Gearing et capacité de remboursement', 'Les soldes de dette et échéanciers de remboursement ne sont pas disponibles comme agrégats classés.'],
  ['Efficacité des actifs, EBE et valeur ajoutée', 'Les postes détaillés requis ne sont pas classés et rapprochés dans les sources utilisées.'],
];

function formatWorksheet(sheet: ExcelJS.Worksheet): void {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF183B63' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 30;
  sheet.columns.forEach((column) => {
    column.width = Math.min(Math.max(column.width ?? 14, 14), 52);
  });
}

export function createFinancialDashboardWorkbook(
  snapshots: readonly FinancialDashboardSnapshot[],
  generatedAt = new Date(),
  monthCount = 12,
  dataLabel?: string,
): ExcelJS.Workbook {
  if (snapshots.length === 0) throw new Error('Aucune entité SAFE à exporter.');
  if (!Number.isInteger(monthCount) || monthCount < 1 || monthCount > 12) {
    throw new Error('La période Excel doit comprendre de 1 à 12 mois.');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SAFE ERP';
  workbook.subject = dataLabel ?? 'Instantané du tableau de bord financier SAFE';
  workbook.title = dataLabel
    ? `SAFE — Tableau de bord financier — ${dataLabel}`
    : 'SAFE — Tableau de bord financier';
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  workbook.properties.date1904 = false;

  const summary = workbook.addWorksheet('Synthèse');
  summary.addRow([
    'Entité', 'Pays', 'Devise', 'Début de période', 'Fin de période', 'Indicateur', 'Valeur', 'Unité', 'Couverture',
  ]);
  for (const snapshot of snapshots) {
    const metrics: Array<[string, number | null, string, string]> = [
      ['Revenus comptabilisés', snapshot.kpis.postedRevenue, snapshot.entity.currencyCode, 'Écritures postées sur 12 mois'],
      ['Charges comptabilisées', snapshot.kpis.postedExpenses, snapshot.entity.currencyCode, 'Écritures postées sur 12 mois'],
      ['Différence d’exploitation', snapshot.kpis.operatingDifference, snapshot.entity.currencyCode, 'Revenus moins charges comptabilisés'],
      ['Factures émises', snapshot.kpis.issuedInvoiceAmount, snapshot.entity.currencyCode, 'Factures au statut émis, devise contrôlée'],
      ['Nombre de factures émises', snapshot.kpis.issuedInvoiceCount, 'factures', 'Factures au statut émis'],
      ['Stock au coût enregistré', snapshot.kpis.inventoryAtCost, snapshot.entity.currencyCode, 'Coût enregistré et quantités valides'],
    ];
    for (const [label, value, unit, coverage] of metrics) {
      summary.addRow([
        snapshot.entity.name,
        snapshot.entity.countryCode,
        snapshot.entity.currencyCode,
        snapshot.periodStart,
        snapshot.periodEnd,
        label,
        value ?? 'Indisponible',
        unit,
        coverage,
      ]);
    }
  }
  summary.columns = [
    { width: 26 }, { width: 12 }, { width: 12 }, { width: 18 }, { width: 18 },
    { width: 32 }, { width: 20 }, { width: 14 }, { width: 46 },
  ];
  summary.autoFilter = { from: 'A1', to: `I${Math.max(summary.rowCount, 1)}` };
  formatWorksheet(summary);
  for (let row = 2; row <= summary.rowCount; row += 1) {
    const value = summary.getCell(row, 7);
    if (typeof value.value === 'number') value.numFmt = '#,##0.000;[Red]-#,##0.000';
  }

  const monthly = workbook.addWorksheet('Données mensuelles');
  monthly.addRow(['Entité', 'Pays', 'Devise', 'Mois', 'Revenus comptabilisés', 'Charges comptabilisées']);
  for (const snapshot of snapshots) {
    for (const point of snapshot.monthly.slice(-monthCount)) {
      monthly.addRow([
        snapshot.entity.name,
        snapshot.entity.countryCode,
        snapshot.entity.currencyCode,
        point.month,
        point.revenue ?? 'Indisponible',
        point.expenses ?? 'Indisponible',
      ]);
    }
  }
  monthly.columns = [
    { width: 26 }, { width: 12 }, { width: 12 }, { width: 16 },
    { width: 28 }, { width: 28 },
  ];
  monthly.autoFilter = { from: 'A1', to: `F${Math.max(monthly.rowCount, 1)}` };
  formatWorksheet(monthly);
  for (let row = 2; row <= monthly.rowCount; row += 1) {
    for (const column of [5, 6]) {
      const value = monthly.getCell(row, column);
      if (typeof value.value === 'number') value.numFmt = '#,##0.000;[Red]-#,##0.000';
    }
  }

  const notes = workbook.addWorksheet('Ratios indisponibles');
  notes.addRow(['Indicateur du classeur de référence', 'État', 'Motif']);
  for (const [name, reason] of unavailableRatios) notes.addRow([name, 'Non calculé', reason]);
  notes.addRow([]);
  notes.addRow(['Note', 'Aucune valeur ni seuil n’a été estimé.']);
  notes.addRow(['Actualisation', 'Relancer npm run dashboard:export pour générer un nouvel instantané depuis SAFE.']);
  notes.addRow(['Source', 'Écritures postées, factures émises, plan de comptes et coût de stock existants dans SAFE.']);
  if (dataLabel) notes.addRow(['Type de données', dataLabel]);
  notes.addRow(['Portée', 'Cet export informatif ne constitue pas une validation juridique, réglementaire ou fiscale.']);
  notes.columns = [{ width: 38 }, { width: 22 }, { width: 92 }];
  notes.autoFilter = { from: 'A1', to: `C${unavailableRatios.length + 1}` };
  formatWorksheet(notes);

  return workbook;
}
