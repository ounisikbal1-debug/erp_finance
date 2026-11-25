import { getDashboardNativeInsights, type NativeInsight } from './native-analytics';
import { exportMultiSheetExcel, type ExcelSheetData } from './exportUtils';

type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
type AgingBucket = 'notDue' | 'days1To30' | 'days31To60' | 'days61To90' | 'over90' | 'unknownDueDate';

interface DashboardSummary {
  generatedAt: string;
  entity: { name: string; countryCode: string; currencyCode: string };
  periodStart: string;
  periodEnd: string;
  kpis: {
    postedRevenue: number | null;
    postedExpenses: number | null;
    operatingDifference: number | null;
    issuedInvoiceAmount: number | null;
    issuedInvoiceCount: number;
    inventoryAtCost: number | null;
  };
  monthly: Array<{ month: string; revenue: number | null; expenses: number | null }>;
  coverage: {
    revenueAccountCount: number;
    expenseAccountCount: number;
    unclassifiedJournalLineCount: number;
    unclassifiedAccountCodes: string[];
    invalidJournalLineCount: number;
    invalidInvoiceCount: number;
    invalidMaterialCount: number;
    postedJournalLineCount: number;
    materialCount: number;
  };
}

interface FinancialReport {
  entity: { name: string; countryCode: string; currencyCode: string };
  periodStart: string;
  periodEnd: string;
  totals: Array<{ type: AccountType; accountCount: number; movement: number | null }>;
  accounts: Array<{ code: string; description: string; type: AccountType; movement: number | null }>;
  coverage: {
    postedJournalLineCount: number;
    unclassifiedJournalLineCount: number;
    unclassifiedAccountCodes: string[];
    invalidJournalLineCount: number;
  };
}

interface AccountBalance {
  accountCode: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

interface ChartAccount {
  code: string;
  description: string;
  type: string;
}

interface AdvancedFinancialAnalysis {
  countryCode: string;
  currency: string;
  dateImputation: string;
  balanceSheet: {
    available: boolean;
    currentAssets: number | null;
    noncurrentAssets: number | null;
    totalAssets: number | null;
    currentLiabilities: number | null;
    noncurrentLiabilities: number | null;
    totalLiabilities: number | null;
    equity: number | null;
    liabilitiesAndEquity: number | null;
    balanceDifference: number | null;
    isBalanced: boolean;
  };
  incomeStatement: {
    available: boolean;
    revenue: number | null;
    costOfGoodsSold: number | null;
    grossProfit: number | null;
    ebitda: number | null;
    netIncome: number | null;
  };
  ratios: Record<
    'currentRatio' | 'quickRatio' | 'cashRatio' | 'equityRatio' | 'debtRatio'
      | 'grossMarginRate' | 'netMarginRate' | 'roe' | 'roa' | 'dsoDays'
      | 'dioDays' | 'dpoDays' | 'cashConversionCycle' | 'ebitda',
    number | null
  >;
  evaluation: {
    healthStatus: string;
    diagnostic: string;
    recommendations: string[];
  };
  coverage: {
    postingAccountCount: number;
    classifiedPostingAccountCount: number;
    unclassifiedAccountCodes: string[];
    invalidCategoryAccountCodes: string[];
    unclassifiedJournalLineCount: number;
    invalidJournalLineCount: number;
    postedJournalLineCount: number;
    datedJournalLineCount: number;
    balanceSheetAvailable: boolean;
    incomeStatementAvailable: boolean;
    ratiosAvailable: boolean;
    balanceDifference: number | null;
  };
  limitations: string[];
}

interface AgingSnapshot {
  entity: { name: string; currencyCode: string };
  asOf: string;
  totals: Record<AgingBucket | 'outstanding', number | null> & { openInvoiceCount: number };
  invoices: Array<{
    invoiceNumber: string;
    customerCode?: string;
    customerName?: string;
    vendorCode?: string;
    vendorName?: string;
    counterpartyCode?: string;
    counterpartyName?: string;
    issueDate: string | null;
    dueDate: string | null;
    daysOverdue: number | null;
    status: string;
    totalAmount: number | null;
    paidAmount: number | null;
    outstandingAmount: number | null;
    diagnostic: string | null;
  }>;
  coverage: {
    sourceInvoiceCount: number;
    openInvoiceCount: number;
    invalidInvoiceCount: number;
    invalidPaymentCount: number;
    dueDateMissingCount: number;
  };
}

export interface FinancialDashboardExportSources {
  summary: DashboardSummary;
  balance: AccountBalance[];
  chartOfAccounts: ChartAccount[];
  financialReport: FinancialReport;
  advancedFinancialAnalysis: AdvancedFinancialAnalysis;
  receivables: AgingSnapshot;
  payables: AgingSnapshot;
  asOf: string;
  generatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAmount(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isAccountType(value: unknown): value is AccountType {
  return ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'].includes(String(value));
}

export function isFinancialReportPayload(value: unknown): value is FinancialReport {
  if (!isRecord(value) || !isRecord(value.entity) || !isRecord(value.coverage)
    || !Array.isArray(value.totals) || !Array.isArray(value.accounts)) return false;
  return typeof value.entity.name === 'string'
    && typeof value.entity.countryCode === 'string'
    && typeof value.entity.currencyCode === 'string'
    && typeof value.periodStart === 'string'
    && typeof value.periodEnd === 'string'
    && value.totals.every((item) => isRecord(item)
      && isAccountType(item.type)
      && Number.isSafeInteger(item.accountCount)
      && isAmount(item.movement))
    && value.accounts.every((item) => isRecord(item)
      && typeof item.code === 'string'
      && typeof item.description === 'string'
      && isAccountType(item.type)
      && isAmount(item.movement))
    && ['postedJournalLineCount', 'unclassifiedJournalLineCount', 'invalidJournalLineCount']
      .every((field) => Number.isSafeInteger(value.coverage[field]))
    && Array.isArray(value.coverage.unclassifiedAccountCodes)
    && value.coverage.unclassifiedAccountCodes.every((code) => typeof code === 'string');
}

export function isAccountBalancePayload(value: unknown): value is AccountBalance[] {
  return Array.isArray(value) && value.every((item) => isRecord(item)
    && typeof item.accountCode === 'string'
    && typeof item.totalDebit === 'number' && Number.isFinite(item.totalDebit)
    && typeof item.totalCredit === 'number' && Number.isFinite(item.totalCredit)
    && typeof item.balance === 'number' && Number.isFinite(item.balance));
}

export function isChartOfAccountsPayload(value: unknown): value is ChartAccount[] {
  return Array.isArray(value) && value.every((item) => isRecord(item)
    && typeof item.code === 'string'
    && typeof item.description === 'string'
    && typeof item.type === 'string');
}

export function isAdvancedFinancialAnalysisPayload(value: unknown): value is AdvancedFinancialAnalysis {
  if (!isRecord(value)
    || !isRecord(value.balanceSheet)
    || !isRecord(value.incomeStatement)
    || !isRecord(value.ratios)
    || !isRecord(value.evaluation)
    || !isRecord(value.coverage)) return false;
  const amounts = [
    'currentAssets', 'noncurrentAssets', 'totalAssets', 'currentLiabilities', 'noncurrentLiabilities',
    'totalLiabilities', 'equity', 'liabilitiesAndEquity', 'balanceDifference',
  ];
  const incomeAmounts = ['revenue', 'costOfGoodsSold', 'grossProfit', 'ebitda', 'netIncome'];
  const ratioKeys = [
    'currentRatio', 'quickRatio', 'cashRatio', 'equityRatio', 'debtRatio', 'grossMarginRate',
    'netMarginRate', 'roe', 'roa', 'dsoDays', 'dioDays', 'dpoDays', 'cashConversionCycle', 'ebitda',
  ];
  return typeof value.countryCode === 'string'
    && typeof value.currency === 'string'
    && typeof value.dateImputation === 'string'
    && typeof value.balanceSheet.available === 'boolean'
    && typeof value.balanceSheet.isBalanced === 'boolean'
    && amounts.every((key) => isAmount(value.balanceSheet[key]))
    && typeof value.incomeStatement.available === 'boolean'
    && incomeAmounts.every((key) => isAmount(value.incomeStatement[key]))
    && ratioKeys.every((key) => isAmount(value.ratios[key]))
    && typeof value.evaluation.healthStatus === 'string'
    && typeof value.evaluation.diagnostic === 'string'
    && Array.isArray(value.evaluation.recommendations)
    && value.evaluation.recommendations.every((item) => typeof item === 'string')
    && [
      'postingAccountCount', 'classifiedPostingAccountCount', 'unclassifiedJournalLineCount',
      'invalidJournalLineCount', 'postedJournalLineCount', 'datedJournalLineCount',
    ].every((key) => Number.isSafeInteger(value.coverage[key]))
    && typeof value.coverage.balanceSheetAvailable === 'boolean'
    && typeof value.coverage.incomeStatementAvailable === 'boolean'
    && typeof value.coverage.ratiosAvailable === 'boolean'
    && isAmount(value.coverage.balanceDifference)
    && ['unclassifiedAccountCodes', 'invalidCategoryAccountCodes']
      .every((key) => Array.isArray(value.coverage[key])
        && (value.coverage[key] as unknown[]).every((code) => typeof code === 'string'))
    && Array.isArray(value.limitations)
    && value.limitations.every((item) => typeof item === 'string');
}

export function isAgingSnapshotPayload(value: unknown): value is AgingSnapshot {
  if (!isRecord(value) || !isRecord(value.entity) || !isRecord(value.totals)
    || !isRecord(value.coverage) || !Array.isArray(value.invoices)) return false;
  const amounts = ['outstanding', 'notDue', 'days1To30', 'days31To60', 'days61To90', 'over90', 'unknownDueDate'];
  return typeof value.entity.name === 'string'
    && typeof value.entity.currencyCode === 'string'
    && typeof value.asOf === 'string'
    && amounts.every((key) => isAmount(value.totals[key]))
    && Number.isSafeInteger(value.totals.openInvoiceCount)
    && ['sourceInvoiceCount', 'openInvoiceCount', 'invalidInvoiceCount', 'invalidPaymentCount', 'dueDateMissingCount']
      .every((key) => Number.isSafeInteger(value.coverage[key]))
    && value.invoices.every((item) => isRecord(item)
      && typeof item.invoiceNumber === 'string'
      && (
        (typeof item.customerCode === 'string' && typeof item.customerName === 'string')
        || (typeof item.vendorCode === 'string' && typeof item.vendorName === 'string')
      )
      && (item.issueDate === null || typeof item.issueDate === 'string')
      && (item.dueDate === null || typeof item.dueDate === 'string')
      && (item.daysOverdue === null || Number.isSafeInteger(item.daysOverdue))
      && typeof item.status === 'string'
      && isAmount(item.totalAmount)
      && isAmount(item.paidAmount)
      && isAmount(item.outstandingAmount)
      && (item.diagnostic === null || typeof item.diagnostic === 'string'));
}

function formatAmount(value: number | null): number | string {
  return value === null ? 'Indisponible' : value;
}

function ensureSameEntity(sources: FinancialDashboardExportSources) {
  const { summary, financialReport, receivables, payables, advancedFinancialAnalysis } = sources;
  if (
    financialReport.entity.name !== summary.entity.name
    || financialReport.entity.currencyCode !== summary.entity.currencyCode
    || advancedFinancialAnalysis.countryCode !== summary.entity.countryCode
    || advancedFinancialAnalysis.currency !== summary.entity.currencyCode
    || advancedFinancialAnalysis.dateImputation !== sources.asOf
    || financialReport.periodStart !== summary.periodStart
    || financialReport.periodEnd !== summary.periodEnd
    || receivables.entity.name !== summary.entity.name
    || receivables.entity.currencyCode !== summary.entity.currencyCode
    || payables.entity.name !== summary.entity.name
    || payables.entity.currencyCode !== summary.entity.currencyCode
    || receivables.asOf !== sources.asOf
    || payables.asOf !== sources.asOf
  ) {
    throw new Error('Les sources ne correspondent pas à la même société, période ou date d’arrêté. Aucun fichier n’a été généré.');
  }
}

function agingSheet(
  sheetName: string,
  aging: AgingSnapshot,
  currencyCode: string,
): ExcelSheetData {
  const bucketLabels: Array<{ key: AgingBucket; label: string }> = [
    { key: 'notDue', label: 'À échoir' },
    { key: 'days1To30', label: '1–30 jours' },
    { key: 'days31To60', label: '31–60 jours' },
    { key: 'days61To90', label: '61–90 jours' },
    { key: 'over90', label: 'Plus de 90 jours' },
    { key: 'unknownDueDate', label: 'Échéance inconnue' },
  ];
  const data: Array<Record<string, string | number>> = [
    { Type: 'Synthèse', Facture: 'Encours total', Tiers: `${aging.totals.openInvoiceCount} facture(s) ouverte(s)`, 'Restant dû': formatAmount(aging.totals.outstanding), Devise: currencyCode },
    ...bucketLabels.map(({ key, label }) => ({
      Type: 'Tranche', Facture: label, 'Restant dû': formatAmount(aging.totals[key]), Devise: currencyCode,
    })),
    ...aging.invoices.map((invoice) => ({
      Type: 'Facture',
      Facture: invoice.invoiceNumber,
      'Code tiers': invoice.counterpartyCode ?? invoice.customerCode ?? invoice.vendorCode ?? '',
      Tiers: invoice.counterpartyName ?? invoice.customerName ?? invoice.vendorName ?? '',
      'Date facture': invoice.issueDate ?? 'Inconnue',
      Échéance: invoice.dueDate ?? 'Non renseignée',
      'Retard (jours)': invoice.daysOverdue ?? 'Indisponible',
      Statut: invoice.status,
      Total: formatAmount(invoice.totalAmount),
      Réglé: formatAmount(invoice.paidAmount),
      'Restant dû': formatAmount(invoice.outstandingAmount),
      Diagnostic: invoice.diagnostic ?? '',
    })),
  ];
  return {
    sheetName,
    columns: [
      { header: 'Type', key: 'Type' },
      { header: 'Facture / tranche', key: 'Facture' },
      { header: 'Code tiers', key: 'Code tiers' },
      { header: 'Tiers', key: 'Tiers' },
      { header: 'Date facture', key: 'Date facture' },
      { header: 'Échéance', key: 'Échéance' },
      { header: 'Retard (jours)', key: 'Retard (jours)' },
      { header: 'Statut', key: 'Statut' },
      { header: 'Total', key: 'Total' },
      { header: 'Réglé', key: 'Réglé' },
      { header: 'Restant dû', key: 'Restant dû' },
      { header: 'Devise', key: 'Devise' },
      { header: 'Diagnostic', key: 'Diagnostic' },
    ],
    data,
  };
}

export function buildFinancialDashboardSheets(
  sources: FinancialDashboardExportSources,
  insights: readonly NativeInsight[] = getDashboardNativeInsights({
    monthly: sources.summary.monthly,
    periodEnd: sources.summary.periodEnd,
    currencyCode: sources.summary.entity.currencyCode,
    unclassifiedJournalLineCount: sources.summary.coverage.unclassifiedJournalLineCount,
    invalidJournalLineCount: sources.summary.coverage.invalidJournalLineCount,
  }),
): ExcelSheetData[] {
  ensureSameEntity(sources);
  const { summary, financialReport, advancedFinancialAnalysis } = sources;
  const currencyCode = summary.entity.currencyCode;
  const chartAccounts = new Map(sources.chartOfAccounts.map((account) => [account.code, account]));
  const kpis = [
    { indicateur: 'Produits comptabilisés', valeur: formatAmount(summary.kpis.postedRevenue), source: 'Comptes Revenue, écritures POSTED' },
    { indicateur: 'Charges comptabilisées', valeur: formatAmount(summary.kpis.postedExpenses), source: 'Comptes Expense, écritures POSTED' },
    { indicateur: 'Différence produits - charges', valeur: formatAmount(summary.kpis.operatingDifference), source: 'Périmètre des comptes classés uniquement' },
    { indicateur: 'Factures au statut ISSUED', valeur: formatAmount(summary.kpis.issuedInvoiceAmount), source: `${summary.kpis.issuedInvoiceCount} facture(s); montant non diminué des règlements` },
    { indicateur: 'Stock au coût saisi', valeur: formatAmount(summary.kpis.inventoryAtCost), source: `${summary.coverage.materialCount} article(s); quantités × coût enregistré` },
  ];

  const incomeStatement = financialReport.accounts
    .filter((account) => account.type === 'Revenue' || account.type === 'Expense')
    .map((account) => ({
      Type: account.type === 'Revenue' ? 'Produits' : 'Charges',
      Compte: account.code,
      Intitulé: account.description,
      'Mouvement net': formatAmount(account.movement),
      Devise: currencyCode,
    }));
  for (const total of financialReport.totals.filter(({ type }) => type === 'Revenue' || type === 'Expense')) {
    incomeStatement.push({
      Type: `Total ${total.type === 'Revenue' ? 'produits' : 'charges'}`,
      Compte: `${total.accountCount} compte(s)`,
      Intitulé: 'Total de période selon les écritures POSTED classées',
      'Mouvement net': formatAmount(total.movement),
      Devise: currencyCode,
    });
  }

  const balanceRows = sources.balance.map((line) => {
    const account = chartAccounts.get(line.accountCode);
    return {
      Compte: line.accountCode,
      Intitulé: account?.description ?? 'Compte absent du plan pays',
      Type: account?.type ?? 'Non classé',
      'Total débit': line.totalDebit,
      'Total crédit': line.totalCredit,
      'Solde net (débit - crédit)': line.balance,
      Devise: currencyCode,
    };
  });

  const decisionRows = insights.map((insight) => ({
    Priorité: insight.kind === 'warning' ? 'À contrôler' : insight.kind === 'positive' ? 'Repère favorable' : 'Information',
    Observation: insight.text,
    'Action proposée': insight.kind === 'warning'
      ? 'Vérifier les écritures et la couverture des données avant toute décision.'
      : insight.kind === 'positive'
        ? 'Confirmer cette évolution dans le grand livre et la rapprocher du contexte métier.'
        : 'Examiner ce repère; aucune prévision automatique n’est produite.',
  }));
  if (decisionRows.length === 0) {
    decisionRows.push({
      Priorité: 'Information',
      Observation: 'Aucun repère calculable avec les données disponibles.',
      'Action proposée': 'Compléter les sources comptables requises.',
    });
  }

  return [
    {
      sheetName: 'Synthèse financière',
      columns: [
        { header: 'Indicateur', key: 'indicateur' },
        { header: 'Valeur', key: 'valeur' },
        { header: 'Source / périmètre', key: 'source' },
      ],
      data: [
        ...kpis,
        { indicateur: 'Société', valeur: summary.entity.name, source: `${summary.entity.countryCode} · ${currencyCode}` },
        { indicateur: 'Période comptable', valeur: `${summary.periodStart} au ${summary.periodEnd}`, source: 'Mouvements POSTED; période glissante de 12 mois' },
        { indicateur: 'Date d’arrêté des balances âgées', valeur: sources.asOf, source: `Export demandé le ${sources.generatedAt}` },
        { indicateur: 'Lignes comptables classées', valeur: summary.coverage.postedJournalLineCount, source: 'Écritures POSTED' },
        { indicateur: 'Lignes non classées', valeur: summary.coverage.unclassifiedJournalLineCount, source: summary.coverage.unclassifiedAccountCodes.join(', ') || 'Aucun compte signalé' },
        { indicateur: 'Lignes invalides', valeur: summary.coverage.invalidJournalLineCount, source: 'Exclues des indicateurs par type' },
      ],
    },
    {
      sheetName: 'Mouvements mensuels',
      columns: [
        { header: 'Mois', key: 'month' },
        { header: 'Produits POSTED', key: 'revenue' },
        { header: 'Charges POSTED', key: 'expenses' },
        { header: 'Devise', key: 'currency' },
      ],
      data: summary.monthly.map((month) => ({
        month: month.month,
        revenue: formatAmount(month.revenue),
        expenses: formatAmount(month.expenses),
        currency: currencyCode,
      })),
    },
    {
      sheetName: 'Compte de résultat',
      columns: [
        { header: 'Rubrique', key: 'Type' },
        { header: 'Compte', key: 'Compte' },
        { header: 'Intitulé', key: 'Intitulé' },
        { header: 'Mouvement net', key: 'Mouvement net' },
        { header: 'Devise', key: 'Devise' },
      ],
      data: incomeStatement,
    },
    {
      sheetName: 'Balance générale',
      columns: [
        { header: 'Compte', key: 'Compte' },
        { header: 'Intitulé', key: 'Intitulé' },
        { header: 'Type', key: 'Type' },
        { header: 'Total débit', key: 'Total débit' },
        { header: 'Total crédit', key: 'Total crédit' },
        { header: 'Solde net (débit - crédit)', key: 'Solde net (débit - crédit)' },
        { header: 'Devise', key: 'Devise' },
      ],
      data: balanceRows,
    },
    agingSheet('Balance âgée clients', {
      ...sources.receivables,
      invoices: sources.receivables.invoices,
    }, currencyCode),
    agingSheet('Balance âgée fournisseurs', {
      ...sources.payables,
      invoices: sources.payables.invoices,
    }, currencyCode),
    {
      sheetName: 'Décisions à examiner',
      columns: [
        { header: 'Priorité', key: 'Priorité' },
        { header: 'Observation calculée', key: 'Observation' },
        { header: 'Action proposée', key: 'Action proposée' },
      ],
      data: decisionRows,
    },
    {
      sheetName: 'Bilan et ratios',
      columns: [
        { header: 'État / indicateur', key: 'État / indicateur' },
        { header: 'Disponibilité', key: 'Disponibilité' },
        { header: 'Prérequis', key: 'Prérequis' },
      ],
      data: [
        {
          'État / indicateur': 'Total actif',
          Disponibilité: advancedFinancialAnalysis.balanceSheet.available ? 'Calculé — à rapprocher' : 'Indisponible',
          Prérequis: formatAmount(advancedFinancialAnalysis.balanceSheet.totalAssets),
        },
        {
          'État / indicateur': 'Total passif',
          Disponibilité: advancedFinancialAnalysis.balanceSheet.available ? 'Calculé — à rapprocher' : 'Indisponible',
          Prérequis: formatAmount(advancedFinancialAnalysis.balanceSheet.totalLiabilities),
        },
        {
          'État / indicateur': 'Capitaux propres',
          Disponibilité: advancedFinancialAnalysis.balanceSheet.available ? 'Calculé — à rapprocher' : 'Indisponible',
          Prérequis: formatAmount(advancedFinancialAnalysis.balanceSheet.equity),
        },
        {
          'État / indicateur': 'Écart actif − passif − capitaux propres',
          Disponibilité: advancedFinancialAnalysis.balanceSheet.isBalanced ? 'Équilibré' : 'À rapprocher',
          Prérequis: formatAmount(advancedFinancialAnalysis.balanceSheet.balanceDifference),
        },
        ...([
          ['Ratio de liquidité générale', advancedFinancialAnalysis.ratios.currentRatio, 'x'],
          ['Ratio de liquidité réduite', advancedFinancialAnalysis.ratios.quickRatio, 'x'],
          ['Ratio de trésorerie', advancedFinancialAnalysis.ratios.cashRatio, 'x'],
          ['Capitaux propres / actif', advancedFinancialAnalysis.ratios.equityRatio, '%'],
          ['Dettes / actif', advancedFinancialAnalysis.ratios.debtRatio, '%'],
          ['Marge brute', advancedFinancialAnalysis.ratios.grossMarginRate, '%'],
          ['Marge nette', advancedFinancialAnalysis.ratios.netMarginRate, '%'],
          ['Rentabilité des capitaux propres', advancedFinancialAnalysis.ratios.roe, '%'],
          ['Rentabilité des actifs', advancedFinancialAnalysis.ratios.roa, '%'],
          ['DSO (jours clients)', advancedFinancialAnalysis.ratios.dsoDays, 'jours'],
          ['DIO (jours de stock)', advancedFinancialAnalysis.ratios.dioDays, 'jours'],
          ['DPO (jours fournisseurs)', advancedFinancialAnalysis.ratios.dpoDays, 'jours'],
          ['Cycle de conversion de trésorerie', advancedFinancialAnalysis.ratios.cashConversionCycle, 'jours'],
          ['EBITDA', advancedFinancialAnalysis.ratios.ebitda, currencyCode],
        ] as Array<[string, number | null, string]>).map(([label, value, unit]) => ({
          'État / indicateur': label,
          Disponibilité: value === null ? 'Non calculé' : 'Calcul provisoire',
          Prérequis: value === null
            ? advancedFinancialAnalysis.evaluation.diagnostic
            : `${unit === '%' ? `${(value * 100).toFixed(2)}%` : `${value} ${unit}`}; à valider après rapprochement et contrôle des catégories comptables.`,
        })),
        {
          'État / indicateur': 'Couverture des catégories comptables',
          Disponibilité: advancedFinancialAnalysis.coverage.unclassifiedAccountCodes.length === 0
            ? 'Classée'
            : 'À compléter',
          Prérequis: advancedFinancialAnalysis.coverage.unclassifiedAccountCodes.join(', ')
            || 'Catégories saisies par un administrateur; vérifier avec la comptabilité.',
        },
        {
          'État / indicateur': 'Portée de la balance générale exportée',
          Disponibilité: 'Mouvements POSTED cumulés',
          Prérequis: 'Sans soldes d’ouverture et clôture confirmés, cette balance générale ne constitue pas un bilan certifié.',
        },
        {
          'État / indicateur': 'Limites du calcul',
          Disponibilité: 'À vérifier',
          Prérequis: advancedFinancialAnalysis.limitations.join(' '),
        },
      ],
    },
  ];
}

export function downloadFinancialDashboard(
  filename: string,
  sheets: ExcelSheetData[],
  metadata: { companyName: string; currency: string; customDate: string },
): Promise<void> {
  return exportMultiSheetExcel(filename, sheets, {
    moduleName: 'Tableau de bord financier',
    companyName: metadata.companyName,
    currency: metadata.currency,
    customDate: metadata.customDate,
  });
}
