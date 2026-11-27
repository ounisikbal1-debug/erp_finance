import ExcelJS from 'exceljs';
import type { FinancialInsightMessage } from './financial-insights';
import { buildIncomeStatementLines } from './income-statement-layout';
import { buildCashFlowLines, buildDetailedBalanceLines, buildEquityChangesLines, buildFinancialPositionLines, type FinancialPositionSummary } from './financial-position';
import {
  getFullMonthsInPeriod,
  getPriorYearPeriod,
  type FinancialBudgetMonth,
  type FinancialComparisonLine,
} from './financial-report-comparison';

type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

export interface FinancialWorkbookSummary {
  generatedAt?: string;
  entity: { name: string; countryCode: string; currencyCode: string; corporateTax?: number | null };
  periodStart: string;
  periodEnd: string;
  totals: Array<{ type: AccountType; accountCount: number; movement: number | null }>;
  accounts: Array<{ code: string; description: string; type: AccountType; financialCategory?: string | null; movement: number | null }>;
  coverage: {
    postedJournalLineCount: number;
    unclassifiedJournalLineCount: number;
    unclassifiedAccountCodes: string[];
    invalidJournalLineCount: number;
  };
}

function sameEntity(
  left: FinancialWorkbookSummary['entity'],
  right: FinancialWorkbookSummary['entity'],
): boolean {
  return left.name === right.name
    && left.countryCode === right.countryCode
    && left.currencyCode === right.currencyCode;
}

function safeCellText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function styleSheet(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A3D62' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.properties.defaultRowHeight = 20;
  if (sheet.columnCount > 0) {
    sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(sheet.columnCount).letter}1` };
  }
}

export async function createFinancialWorkbook(input: {
  current: FinancialWorkbookSummary;
  previous?: FinancialWorkbookSummary | null;
  previousFullYear?: FinancialWorkbookSummary | null;
  comparisons: readonly FinancialComparisonLine[];
  insights: readonly FinancialInsightMessage[];
  budgetMonths?: readonly FinancialBudgetMonth[];
  budgetUnavailableReason?: string;
  forecastUnavailableReason?: string;
  taxRatePercent?: number | null;
  balanceSheet?: FinancialPositionSummary | null;
}): Promise<ArrayBuffer> {
  const {
    current,
    previous,
    previousFullYear,
    comparisons,
    insights,
    budgetMonths = [],
    budgetUnavailableReason = '',
    forecastUnavailableReason = '',
    taxRatePercent,
    balanceSheet = null,
  } = input;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SAFE_ERP';
  workbook.subject = 'Instantané consultatif des indicateurs financiers calculés par SAFE';
  workbook.title = `SAFE - ${current.periodStart} au ${current.periodEnd}`;
  workbook.description = 'Export en lecture seule. Les calculs SAFE sont présentés sans conclusion réglementaire ni décision automatisée.';
  workbook.created = current.generatedAt ? new Date(current.generatedAt) : new Date();
  workbook.modified = workbook.created;

  const revenue = current.totals.find(({ type }) => type === 'Revenue')?.movement ?? null;
  const expenses = current.totals.find(({ type }) => type === 'Expense')?.movement ?? null;
  const netResult = revenue === null || expenses === null ? null : revenue - expenses;
  const statementLines = buildIncomeStatementLines({
    accounts: current.accounts,
    revenue,
    expenses,
    taxRatePercent: taxRatePercent ?? current.entity.corporateTax ?? null,
  });
  const period = `${current.periodStart} au ${current.periodEnd}`;

  const summary = workbook.addWorksheet('Synthèse SAFE');
  summary.columns = [
    { header: 'Indicateur', key: 'label', width: 36 },
    { header: 'Valeur SAFE', key: 'value', width: 28 },
    { header: 'Période', key: 'period', width: 28 },
    { header: 'Devise', key: 'currency', width: 14 },
  ];
  summary.addRows([
    { label: 'Société', value: safeCellText(current.entity.name), period, currency: current.entity.currencyCode },
    { label: 'Code pays', value: current.entity.countryCode },
    { label: 'Produits', value: revenue, period, currency: current.entity.currencyCode },
    { label: 'Charges', value: expenses, period, currency: current.entity.currencyCode },
    { label: 'Résultat de période calculé par SAFE', value: netResult, period, currency: current.entity.currencyCode },
    { label: 'Lignes comptabilisées POSTED', value: current.coverage.postedJournalLineCount },
    { label: 'Lignes non classées', value: current.coverage.unclassifiedJournalLineCount },
    { label: 'Lignes invalides exclues', value: current.coverage.invalidJournalLineCount },
    { label: 'Généré le', value: current.generatedAt ?? workbook.created.toISOString() },
    { label: 'Nature du fichier', value: 'Instantané consultatif; SAFE reste la source de vérité.' },
    { label: 'Actualisation', value: 'Actualisez les données dans SAFE et relancez l’export pour inclure les changements.' },
  ]);
  styleSheet(summary);
  summary.getColumn('B').numFmt = '#,##0.000;[Red]-#,##0.000';

  const incomeStatement = workbook.addWorksheet('Compte de résultat');
  incomeStatement.columns = [
    { key: 'section', width: 30 },
    { key: 'label', width: 48 },
    { key: 'amount', width: 24 },
    { key: 'percentageOfRevenue', width: 24 },
    { key: 'notes', width: 88 },
  ];
  incomeStatement.addRow([
    'Entreprise',
    safeCellText(current.entity.name),
    'Période',
    period,
    `Devise : ${current.entity.currencyCode}`,
  ]);
  incomeStatement.addRow([
    'Section',
    'Poste',
    `Montant (${current.entity.currencyCode})`,
    '% du chiffre d’affaires',
    'Notes / méthode',
  ]);
  incomeStatement.addRows(statementLines.map((line) => ({
    ...line,
    amount: line.amount ?? 0,
    percentageOfRevenue: line.percentageOfRevenue === null ? 0 : line.percentageOfRevenue / 100,
    notes: safeCellText(line.notes),
  })));
  const statementHeader = incomeStatement.getRow(2);
  statementHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  statementHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A3D62' } };
  statementHeader.alignment = { vertical: 'middle', wrapText: true };
  incomeStatement.views = [{ state: 'frozen', ySplit: 2 }];
  incomeStatement.autoFilter = { from: 'A2', to: 'E2' };
  incomeStatement.properties.defaultRowHeight = 20;
  incomeStatement.getColumn('C').numFmt = '#,##0.000;[Red]-#,##0.000';
  incomeStatement.getColumn('D').numFmt = '0.00%;[Red]-0.00%';
  incomeStatement.getColumn('E').alignment = { wrapText: true, vertical: 'top' };
  incomeStatement.eachRow((row, rowNumber) => { if (rowNumber > 1) row.height = 36; });

  const bilan = workbook.addWorksheet('Bilan');
  bilan.columns = [
    { key: 'section', width: 30 },
    { key: 'label', width: 48 },
    { key: 'amount', width: 24 },
    { key: 'notes', width: 90 },
  ];
  bilan.addRow([
    'Société',
    safeCellText(current.entity.name),
    'Date d’arrêté',
    input.balanceSheet?.dateImputation ?? current.periodEnd,
  ]);
  bilan.addRow([
    'Section',
    'Poste',
    `Montant (${current.entity.currencyCode})`,
    'Notes / méthode',
  ]);
  bilan.addRows(buildFinancialPositionLines(balanceSheet).map((line) => ({
    ...line,
    amount: line.amount ?? 0,
    notes: safeCellText(line.notes),
  })));
  const balanceHeader = bilan.getRow(2);
  balanceHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  balanceHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A3D62' } };
  balanceHeader.alignment = { vertical: 'middle', wrapText: true };
  bilan.views = [{ state: 'frozen', ySplit: 2 }];
  bilan.autoFilter = { from: 'A2', to: 'D2' };
  bilan.properties.defaultRowHeight = 20;
  bilan.getColumn('C').numFmt = '#,##0.000;[Red]-#,##0.000';
  bilan.getColumn('D').alignment = { wrapText: true, vertical: 'top' };
  bilan.eachRow((row, rowNumber) => { if (rowNumber > 1) row.height = 36; });

  const cashFlow = workbook.addWorksheet('Flux de trésorerie');
  cashFlow.columns = [
    { key: 'section', width: 30 },
    { key: 'label', width: 48 },
    { key: 'amount', width: 24 },
    { key: 'notes', width: 90 },
  ];
  cashFlow.addRow([
    'Société',
    safeCellText(current.entity.name),
    'Période',
    balanceSheet ? `${balanceSheet.cashFlowStatement.periodStart} au ${balanceSheet.cashFlowStatement.periodEnd}` : 'Indisponible',
  ]);
  cashFlow.addRow([
    'Section',
    'Poste',
    `Montant (${current.entity.currencyCode})`,
    'Notes / méthode',
  ]);
  cashFlow.addRows(buildCashFlowLines(balanceSheet).map((line) => ({
    ...line,
    amount: line.amount ?? 0,
    notes: safeCellText(line.notes),
  })));
  const cashFlowHeader = cashFlow.getRow(2);
  cashFlowHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cashFlowHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A3D62' } };
  cashFlowHeader.alignment = { vertical: 'middle', wrapText: true };
  cashFlow.views = [{ state: 'frozen', ySplit: 2 }];
  cashFlow.autoFilter = { from: 'A2', to: 'D2' };
  cashFlow.properties.defaultRowHeight = 20;
  cashFlow.getColumn('C').numFmt = '#,##0.000;[Red]-#,##0.000';
  cashFlow.getColumn('D').alignment = { wrapText: true, vertical: 'top' };
  cashFlow.eachRow((row, rowNumber) => { if (rowNumber > 1) row.height = 36; });

  const detailedBalance = workbook.addWorksheet('Bilan détaillé');
  detailedBalance.columns = [
    { header: 'Section', key: 'section', width: 28 },
    { header: 'Compte / poste', key: 'account', width: 48 },
    { header: 'Classement', key: 'category', width: 30 },
    { header: `Solde (${current.entity.currencyCode})`, key: 'amount', width: 24 },
    { header: 'Notes / méthode', key: 'notes', width: 88 },
  ];
  detailedBalance.addRows(buildDetailedBalanceLines(balanceSheet).map((line) => ({
    section: line.section,
    account: line.accountCode ? `${safeCellText(line.accountCode)} — ${safeCellText(line.label)}` : safeCellText(line.label),
    category: safeCellText(line.category),
    amount: line.amount ?? 0,
    notes: safeCellText(line.notes),
  })));
  styleSheet(detailedBalance);
  detailedBalance.getColumn('D').numFmt = '#,##0.000;[Red]-#,##0.000';
  detailedBalance.getColumn('E').alignment = { wrapText: true, vertical: 'top' };
  detailedBalance.eachRow((row, rowNumber) => { if (rowNumber > 1) row.height = 38; });

  const equityChanges = workbook.addWorksheet('Variations capitaux propres');
  equityChanges.columns = [
    { header: 'Section', key: 'section', width: 30 },
    { header: 'Poste', key: 'label', width: 52 },
    { header: `Montant (${current.entity.currencyCode})`, key: 'amount', width: 24 },
    { header: 'Notes / méthode', key: 'notes', width: 90 },
  ];
  equityChanges.addRows(buildEquityChangesLines(balanceSheet).map((line) => ({
    ...line,
    label: safeCellText(line.label),
    amount: line.amount ?? 0,
    notes: safeCellText(line.notes),
  })));
  styleSheet(equityChanges);
  equityChanges.getColumn('C').numFmt = '#,##0.000;[Red]-#,##0.000';
  equityChanges.getColumn('D').alignment = { wrapText: true, vertical: 'top' };
  equityChanges.eachRow((row, rowNumber) => { if (rowNumber > 1) row.height = 38; });

  const comparison = workbook.addWorksheet('Comparatif N-1');
  comparison.columns = [
    { header: 'Indicateur', key: 'label', width: 30 },
    { header: 'Période sélectionnée', key: 'current', width: 24 },
    { header: 'Même période N-1', key: 'priorYear', width: 24 },
    { header: 'Écart', key: 'difference', width: 20 },
    { header: 'Variation (%)', key: 'percentChange', width: 20 },
    { header: 'Statut', key: 'status', width: 36 },
  ];
  comparison.addRows(comparisons.map((line) => ({
    ...line,
    status: !previous
      ? 'Comparatif N-1 indisponible'
      : line.current === null || line.priorYear === null
        ? 'Valeur indisponible'
        : line.priorYear === 0 && line.percentChange === null
          ? 'Pourcentage non calculé: base N-1 égale à zéro'
          : 'Valeurs calculées par SAFE',
  })));
  styleSheet(comparison);
  comparison.getColumn('B').numFmt = '#,##0.000;[Red]-#,##0.000';
  comparison.getColumn('C').numFmt = '#,##0.000;[Red]-#,##0.000';
  comparison.getColumn('D').numFmt = '+#,##0.000;[Red]-#,##0.000';
  comparison.getColumn('E').numFmt = '+0.0%;[Red]-0.0%';
  comparison.getColumn('E').eachCell({ includeEmpty: false }, (cell, rowNumber) => {
    if (rowNumber > 1 && typeof cell.value === 'number') cell.value = cell.value / 100;
  });

  const accounts = workbook.addWorksheet('Détail comptes');
  accounts.columns = [
    { header: 'Code compte', key: 'code', width: 20 },
    { header: 'Intitulé', key: 'description', width: 48 },
    { header: 'Type', key: 'type', width: 18 },
    { header: 'Mouvement net SAFE', key: 'movement', width: 26 },
    { header: 'Devise', key: 'currency', width: 14 },
  ];
  accounts.addRows(current.accounts.map((account) => ({
    code: safeCellText(account.code),
    description: safeCellText(account.description),
    type: account.type,
    movement: account.movement,
    currency: current.entity.currencyCode,
  })));
  styleSheet(accounts);
  accounts.getColumn('D').numFmt = '#,##0.000;[Red]-#,##0.000';

  const analysis = workbook.addWorksheet('Analyse SAFE');
  analysis.columns = [
    { header: 'Type', key: 'kind', width: 18 },
    { header: 'Observation calculée dans SAFE', key: 'text', width: 110 },
  ];
  analysis.addRows(insights.map((insight) => ({
    kind: insight.kind === 'warning' ? 'Vigilance' : insight.kind === 'positive' ? 'Indicateur' : 'Information',
    text: safeCellText(insight.text),
  })));
  if (insights.length === 0) analysis.addRow({ kind: 'Information', text: 'Aucune analyse déterministe disponible pour cette période.' });
  analysis.addRow({ kind: 'Limite', text: 'Ces constats ne sont ni un avis professionnel, ni une prévision, ni une conclusion de liquidité ou réglementaire.' });
  analysis.addRow({ kind: 'Supervision', text: 'Toute interprétation et décision doivent être vérifiées par une personne habilitée.' });
  styleSheet(analysis);
  analysis.getColumn('B').alignment = { wrapText: true, vertical: 'top' };
  analysis.eachRow((row, rowNumber) => { if (rowNumber > 1) row.height = 42; });

  const forecast = workbook.addWorksheet('Projection annuelle indicative');
  forecast.columns = [
    { header: 'Indicateur', key: 'label', width: 30 },
    { header: 'Période N sélectionnée', key: 'current', width: 24 },
    { header: 'Même période N-1', key: 'priorPeriod', width: 24 },
    { header: 'Variation observée SAFE', key: 'change', width: 26 },
    { header: 'Année complète N-1', key: 'priorFullYear', width: 24 },
    { header: 'Projection annuelle indicative', key: 'projected', width: 32 },
    { header: 'Statut / hypothèse', key: 'status', width: 72 },
  ];
  const currentYear = Number(current.periodStart.slice(0, 4));
  const startsAtYearBeginning = current.periodStart === `${currentYear}-01-01`
    && current.periodEnd.slice(0, 4) === String(currentYear);
  const expectedPriorPeriod = getPriorYearPeriod(current.periodStart, current.periodEnd);
  const priorPeriodMatches = Boolean(previous && expectedPriorPeriod
    && previous.periodStart === expectedPriorPeriod.from
    && previous.periodEnd === expectedPriorPeriod.to);
  const priorFullYearMatches = Boolean(previousFullYear && currentYear > 1
    && previousFullYear.periodStart === `${currentYear - 1}-01-01`
    && previousFullYear.periodEnd === `${currentYear - 1}-12-31`);
  const reports = [current, previous, previousFullYear].filter(
    (report): report is FinancialWorkbookSummary => Boolean(report),
  );
  const entitiesMatch = reports.every((report) => sameEntity(report.entity, current.entity));
  const coverageComplete = reports.length === 3 && priorPeriodMatches && priorFullYearMatches && reports.every((report) =>
    report.coverage.unclassifiedJournalLineCount === 0 && report.coverage.invalidJournalLineCount === 0);
  const revenueChange = comparisons.find(({ label }) => label === 'Produits');
  const expenseChange = comparisons.find(({ label }) => label === 'Charges');
  const revenueBase = previousFullYear?.totals.find(({ type }) => type === 'Revenue')?.movement ?? null;
  const expenseBase = previousFullYear?.totals.find(({ type }) => type === 'Expense')?.movement ?? null;
  const canProject = startsAtYearBeginning
    && entitiesMatch
    && coverageComplete
    && revenueBase !== null
    && expenseBase !== null
    && revenueChange?.percentChange !== null
    && revenueChange?.percentChange !== undefined
    && expenseChange?.percentChange !== null
    && expenseChange?.percentChange !== undefined;
  const unavailableProjectionReason = forecastUnavailableReason
    || (!startsAtYearBeginning
      ? 'Projection disponible uniquement pour une période commençant le 1er janvier et se terminant dans la même année.'
      : !entitiesMatch
        ? 'Projection suspendue: les rapports ne correspondent pas à la même société et devise.'
        : !coverageComplete
          ? 'Projection suspendue: rapports antérieurs manquants ou couverture comptable incomplète.'
          : 'Projection indisponible: bases annuelles ou variations comparables absentes, ou base N-1 égale à zéro.');
  const revenueCurrent = revenueChange?.current ?? null;
  const expenseCurrent = expenseChange?.current ?? null;
  const resultCurrent = revenueCurrent === null || expenseCurrent === null ? null : revenueCurrent - expenseCurrent;
  const resultPrior = revenueChange?.priorYear === null || revenueChange?.priorYear === undefined
    || expenseChange?.priorYear === null || expenseChange?.priorYear === undefined
    ? null
    : revenueChange.priorYear - expenseChange.priorYear;
  const projectedRevenue = canProject && revenueBase !== null && revenueChange?.percentChange !== null
    && revenueChange?.percentChange !== undefined
    ? revenueBase * (1 + revenueChange.percentChange / 100)
    : null;
  const projectedExpenses = canProject && expenseBase !== null && expenseChange?.percentChange !== null
    && expenseChange?.percentChange !== undefined
    ? expenseBase * (1 + expenseChange.percentChange / 100)
    : null;
  const projectionRows = [
    {
      label: 'Produits',
      current: revenueCurrent,
      priorPeriod: revenueChange?.priorYear ?? null,
      change: revenueChange?.percentChange ?? null,
      priorFullYear: revenueBase,
      projected: projectedRevenue,
    },
    {
      label: 'Charges',
      current: expenseCurrent,
      priorPeriod: expenseChange?.priorYear ?? null,
      change: expenseChange?.percentChange ?? null,
      priorFullYear: expenseBase,
      projected: projectedExpenses,
    },
    {
      label: 'Résultat de période',
      current: resultCurrent,
      priorPeriod: resultPrior,
      change: comparisons.find(({ label }) => label === 'Résultat de période')?.percentChange ?? null,
      priorFullYear: revenueBase === null || expenseBase === null ? null : revenueBase - expenseBase,
      projected: projectedRevenue === null || projectedExpenses === null
        ? null
        : projectedRevenue - projectedExpenses,
    },
  ];
  forecast.addRows(projectionRows.map((row) => ({
    ...row,
    change: row.change === null ? null : row.change / 100,
    status: !canProject
      ? unavailableProjectionReason
      : 'Scénario mécanique: variation observée N/N-1 appliquée à l’année complète N-1; non saisonnalisé.',
  })));
  forecast.addRow({
    label: 'Limite de lecture',
    status: 'Extrapolation consultative, ni budget approuvé ni prévision certaine. Les effets saisonniers, événements non récurrents, changements de périmètre et flux de trésorerie ne sont pas modélisés.',
  });
  styleSheet(forecast);
  for (const column of ['B', 'C', 'E', 'F']) forecast.getColumn(column).numFmt = '#,##0.000;[Red]-#,##0.000';
  forecast.getColumn('D').numFmt = '+0.0%;[Red]-0.0%';
  forecast.getColumn('G').alignment = { wrapText: true, vertical: 'top' };
  forecast.eachRow((row, rowNumber) => { if (rowNumber > 1) row.height = 58; });

  const budget = workbook.addWorksheet('Budget SAFE approuvé');
  budget.columns = [
    { header: 'Mois', key: 'period', width: 12 },
    { header: 'Code compte', key: 'accountCode', width: 18 },
    { header: 'Intitulé', key: 'description', width: 42 },
    { header: 'Type', key: 'type', width: 16 },
    { header: 'Budget approuvé SAFE', key: 'amount', width: 24 },
    { header: 'Réalisé POSTED SAFE', key: 'actual', width: 24 },
    { header: 'Écart budgétaire SAFE', key: 'variance', width: 24 },
    { header: 'Statut', key: 'status', width: 16 },
  ];
  const requestedBudgetMonths = new Set(getFullMonthsInPeriod(current.periodStart, current.periodEnd));
  const scopedBudgetMonths = budgetMonths.filter((month) =>
    requestedBudgetMonths.has(month.period) && sameEntity(month.entity, current.entity));
  const budgetDataMismatch = scopedBudgetMonths.length !== budgetMonths.length;
  for (const month of scopedBudgetMonths) {
    for (const line of month.lines.filter(({ status }) => status === 'APPROVED')) {
      budget.addRow({
        period: month.period,
        accountCode: safeCellText(line.accountCode),
        description: safeCellText(line.description),
        type: line.accountType ?? 'Non classé',
        amount: line.amount,
        actual: line.actual,
        variance: line.variance,
        status: line.amount === null || line.actual === null || line.variance === null
          ? 'Valeur indisponible'
          : 'Approuvé',
      });
    }
  }
  if (budget.rowCount === 1) {
    budget.addRow([
      'Information',
      '',
      budgetUnavailableReason
        || (budgetDataMismatch ? 'Certains rapports budgétaires ne correspondent pas à la société ou aux mois de la période et ont été exclus.'
          : 'Aucune ligne budgétaire approuvée disponible pour les mois civils complets de la période.'),
      '',
      '',
      '',
      '',
      'Aucune ligne en brouillon exportée.',
    ]);
  } else {
    budget.addRow([
      'Limite',
      '',
      budgetUnavailableReason
        || (budgetDataMismatch
          ? 'Certains rapports budgétaires ne correspondent pas à la société ou aux mois de la période et ont été exclus.'
          : 'Seules les lignes budgétaires approuvées sont incluses; les mois civils partiels sont exclus.'),
      '',
      '',
      '',
      '',
      `Diagnostic SAFE: ${scopedBudgetMonths.reduce((sum, month) => sum + month.diagnostics.unclassifiedJournalLineCount, 0)} ligne(s) non classée(s), ${scopedBudgetMonths.reduce((sum, month) => sum + month.diagnostics.invalidJournalLineCount, 0)} ligne(s) invalide(s).`,
    ]);
  }
  styleSheet(budget);
  for (const column of ['E', 'F', 'G']) budget.getColumn(column).numFmt = '#,##0.000;[Red]-#,##0.000';
  budget.getColumn('C').alignment = { wrapText: true, vertical: 'top' };
  budget.getColumn('H').alignment = { wrapText: true, vertical: 'top' };
  budget.eachRow((row, rowNumber) => { if (rowNumber > 1) row.height = 48; });

  const rules = workbook.addWorksheet('Règles & limites');
  rules.columns = [
    { header: 'Sujet', key: 'topic', width: 28 },
    { header: 'Description', key: 'description', width: 110 },
  ];
  rules.addRows([
    { topic: 'Source', description: 'Les montants et mouvements de comptes proviennent du rapport SAFE en lecture seule pour la société authentifiée.' },
    { topic: 'Périmètre', description: 'Les montants sont calculés à partir des écritures POSTED de la période et du plan comptable associé au pays de la société.' },
    { topic: 'Comparaison', description: 'Les écarts sont descriptifs. Une variation positive ou négative n’est pas automatiquement favorable ou défavorable.' },
    { topic: 'Budget SAFE', description: 'Données mensuelles lues via l’API budget authentifiée; seules les lignes approuvées des mois civils complets sont exportées. Les montants réalisés sont ceux calculés par SAFE à partir des écritures POSTED.' },
    { topic: 'Projection annuelle indicative', description: 'Scénario mécanique appliquant la variation observée N/N-1 à l’année complète N-1 uniquement si les rapports correspondent à la même entité/devise et que leur couverture est complète. Aucune saisonnalité ni flux de trésorerie n’est modélisé.' },
    { topic: 'Avertissement', description: 'Ce document est consultatif et ne constitue pas un état réglementaire certifié, un conseil professionnel ou une conclusion comptable.' },
    { topic: 'IA', description: 'Aucun commentaire d’IA n’est inclus dans le classeur.' },
    { topic: 'Décision', description: 'Aucune décision ni action n’est déclenchée par cet export.' },
  ]);
  styleSheet(rules);
  rules.getColumn('B').alignment = { wrapText: true, vertical: 'top' };
  rules.eachRow((row, rowNumber) => { if (rowNumber > 1) row.height = 38; });

  const bytes = await workbook.xlsx.writeBuffer();
  return new Uint8Array(bytes).buffer as ArrayBuffer;
}
