import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFinancialDashboardSheets,
  isAdvancedFinancialAnalysisPayload,
  isAccountBalancePayload,
  isAgingSnapshotPayload,
  isChartOfAccountsPayload,
  isFinancialReportPayload,
  type FinancialDashboardExportSources,
} from './financial-dashboard-export';

function createSources(): FinancialDashboardExportSources {
  const periodStart = '2025-12-01';
  const periodEnd = '2026-11-08';
  const report: FinancialDashboardExportSources['financialReport'] = {
    entity: { name: 'SAFE Test', countryCode: 'TN', currencyCode: 'TND' },
    periodStart,
    periodEnd,
    totals: [
      { type: 'Revenue', accountCount: 1, movement: 1200 },
      { type: 'Expense', accountCount: 1, movement: 450 },
      { type: 'Asset', accountCount: 1, movement: 750 },
      { type: 'Liability', accountCount: 0, movement: null },
      { type: 'Equity', accountCount: 0, movement: null },
    ],
    accounts: [
      { code: '707', description: 'Ventes', type: 'Revenue', movement: 1200 },
      { code: '601', description: 'Achats', type: 'Expense', movement: 450 },
    ],
    coverage: {
      postedJournalLineCount: 2,
      unclassifiedJournalLineCount: 0,
      unclassifiedAccountCodes: [],
      invalidJournalLineCount: 0,
    },
  };
  const aging = {
    entity: { name: 'SAFE Test', currencyCode: 'TND' },
    asOf: '2026-11-09',
    totals: {
      outstanding: 100,
      notDue: 30,
      days1To30: 20,
      days31To60: 10,
      days61To90: 15,
      over90: 25,
      unknownDueDate: 0,
      openInvoiceCount: 1,
    },
    invoices: [{
      invoiceNumber: 'INV-001',
      customerCode: 'C001',
      customerName: 'Client test',
      issueDate: '2026-08-01',
      dueDate: '2026-09-01',
      daysOverdue: 69,
      status: 'ISSUED',
      totalAmount: 100,
      paidAmount: 0,
      outstandingAmount: 100,
      diagnostic: null,
    }],
    coverage: {
      sourceInvoiceCount: 1,
      openInvoiceCount: 1,
      invalidInvoiceCount: 0,
      invalidPaymentCount: 0,
      dueDateMissingCount: 0,
    },
  };
  const payables = {
    ...aging,
    invoices: [{
      ...aging.invoices[0],
      vendorCode: 'V001',
      vendorName: 'Fournisseur test',
      customerCode: undefined,
      customerName: undefined,
    }],
  };
  const advancedFinancialAnalysis: FinancialDashboardExportSources['advancedFinancialAnalysis'] = {
    countryCode: 'TN',
    currency: 'TND',
    dateImputation: '2026-11-09',
    balanceSheet: {
      available: false,
      currentAssets: null,
      noncurrentAssets: null,
      totalAssets: null,
      currentLiabilities: null,
      noncurrentLiabilities: null,
      totalLiabilities: null,
      equity: null,
      liabilitiesAndEquity: null,
      balanceDifference: null,
      isBalanced: false,
    },
    incomeStatement: {
      available: false,
      revenue: null,
      costOfGoodsSold: null,
      grossProfit: null,
      ebitda: null,
      netIncome: null,
    },
    ratios: {
      currentRatio: null,
      quickRatio: null,
      cashRatio: null,
      equityRatio: null,
      debtRatio: null,
      grossMarginRate: null,
      netMarginRate: null,
      roe: null,
      roa: null,
      dsoDays: null,
      dioDays: null,
      dpoDays: null,
      cashConversionCycle: null,
      ebitda: null,
    },
    evaluation: {
      healthStatus: 'INSUFFICIENT_DATA',
      diagnostic: 'Affecter les catégories financières.',
      recommendations: ['Classer les comptes.'],
    },
    coverage: {
      postingAccountCount: 2,
      classifiedPostingAccountCount: 0,
      unclassifiedAccountCodes: ['707', '601'],
      invalidCategoryAccountCodes: [],
      unclassifiedJournalLineCount: 0,
      invalidJournalLineCount: 0,
      postedJournalLineCount: 2,
      datedJournalLineCount: 2,
      balanceSheetAvailable: false,
      incomeStatementAvailable: false,
      ratiosAvailable: false,
      balanceDifference: null,
    },
    limitations: ['Les catégories doivent être vérifiées.'],
  };
  return {
    summary: {
      generatedAt: '2026-11-09T10:00:00.000Z',
      entity: { name: 'SAFE Test', countryCode: 'TN', currencyCode: 'TND' },
      periodStart,
      periodEnd,
      kpis: {
        postedRevenue: 1200,
        postedExpenses: 450,
        operatingDifference: 750,
        issuedInvoiceAmount: 100,
        issuedInvoiceCount: 1,
        inventoryAtCost: null,
      },
      monthly: Array.from({ length: 12 }, (_, index) => ({
        month: `2025-${String(index + 1).padStart(2, '0')}`,
        revenue: 100,
        expenses: 50,
      })),
      coverage: {
        revenueAccountCount: 1,
        expenseAccountCount: 1,
        unclassifiedJournalLineCount: 0,
        unclassifiedAccountCodes: [],
        invalidJournalLineCount: 0,
        invalidInvoiceCount: 0,
        invalidMaterialCount: 0,
        postedJournalLineCount: 2,
        materialCount: 0,
      },
    },
    balance: [{ accountCode: '707', totalDebit: 0, totalCredit: 1200, balance: -1200 }],
    chartOfAccounts: [{ code: '707', description: 'Ventes', type: 'Revenue' }],
    financialReport: report,
    advancedFinancialAnalysis,
    receivables: aging,
    payables,
    asOf: '2026-11-09',
    generatedAt: '2026-11-09T10:01:00.000Z',
  };
}

describe('financial dashboard Excel export', () => {
  it('builds a snapshot workbook from scoped synthetic sources and labels unsupported statements', () => {
    const sheets = buildFinancialDashboardSheets(createSources(), [
      { kind: 'warning', text: 'Couverture à vérifier.' },
    ]);

    assert.deepEqual(sheets.map(({ sheetName }) => sheetName), [
      'Synthèse financière',
      'Mouvements mensuels',
      'Compte de résultat',
      'Balance générale',
      'Balance âgée clients',
      'Balance âgée fournisseurs',
      'Décisions à examiner',
      'Bilan et ratios',
    ]);
    assert.equal(sheets[2].data[0]['Mouvement net'], 1200);
    assert.equal(sheets[4].data.find((row) => row.Type === 'Facture')?.Tiers, 'Client test');
    assert.equal(sheets[5].data.find((row) => row.Type === 'Facture')?.Tiers, 'Fournisseur test');
    assert.match(String(sheets[6].data[0]['Action proposée']), /Vérifier les écritures/);
    assert.equal(sheets[7].data[0].Disponibilité, 'Indisponible');
    assert.equal(sheets[7].data.find((row) => row['État / indicateur'] === 'Ratio de liquidité générale')?.Disponibilité, 'Non calculé');
    assert.equal(sheets[0].data.find((row) => row.indicateur === 'Stock au coût saisi')?.valeur, 'Indisponible');
  });

  it('refuses to combine sources that do not match the authenticated entity and report period', () => {
    const sources = createSources();
    sources.receivables.entity.name = 'Autre société';
    assert.throws(
      () => buildFinancialDashboardSheets(sources),
      /même société, période ou date d’arrêté/,
    );
  });

  it('exports available synthetic statement balances and ratios with clear review labels', () => {
    const sources = createSources();
    sources.advancedFinancialAnalysis.balanceSheet = {
      available: true,
      currentAssets: 1250,
      noncurrentAssets: 300,
      totalAssets: 1550,
      currentLiabilities: 250,
      noncurrentLiabilities: 0,
      totalLiabilities: 250,
      equity: 1150,
      liabilitiesAndEquity: 1400,
      balanceDifference: 150,
      isBalanced: false,
    };
    sources.advancedFinancialAnalysis.ratios.currentRatio = 5;
    sources.advancedFinancialAnalysis.ratios.quickRatio = 5;
    sources.advancedFinancialAnalysis.ratios.dsoDays = 128;
    const sheets = buildFinancialDashboardSheets(sources);
    const metrics = sheets.find(({ sheetName }) => sheetName === 'Bilan et ratios')?.data ?? [];
    assert.equal(
      metrics.find((row) => row['État / indicateur'] === 'Total actif')?.Prérequis,
      1550,
    );
    assert.equal(
      metrics.find((row) => row['État / indicateur'] === 'Ratio de liquidité générale')?.Prérequis,
      '5 x; à valider après rapprochement et contrôle des catégories comptables.',
    );
    assert.equal(
      metrics.find((row) => row['État / indicateur'] === 'DSO (jours clients)')?.Prérequis,
      '128 jours; à valider après rapprochement et contrôle des catégories comptables.',
    );
  });

  it('validates API snapshots before they reach the workbook builder', () => {
    const sources = createSources();
    assert.equal(isFinancialReportPayload(sources.financialReport), true);
    assert.equal(isAdvancedFinancialAnalysisPayload(sources.advancedFinancialAnalysis), true);
    assert.equal(isAccountBalancePayload(sources.balance), true);
    assert.equal(isChartOfAccountsPayload(sources.chartOfAccounts), true);
    assert.equal(isAgingSnapshotPayload(sources.receivables), true);
    assert.equal(isAgingSnapshotPayload(sources.payables), true);
    assert.equal(isAccountBalancePayload([{ accountCode: '411', totalDebit: Number.NaN, totalCredit: 0, balance: 0 }]), false);
    assert.equal(isFinancialReportPayload({ ...sources.financialReport, periodEnd: 1 }), false);
    assert.equal(isAdvancedFinancialAnalysisPayload({
      ...sources.advancedFinancialAnalysis,
      ratios: { ...sources.advancedFinancialAnalysis.ratios, currentRatio: Number.NaN },
    }), false);
  });
});
