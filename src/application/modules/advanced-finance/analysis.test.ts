import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateAdvancedFinancialAnalysis } from './analysis';
import {
  FINANCIAL_ACCOUNT_CATEGORIES,
  TUNISIAN_ACCOUNT_CLASSIFICATION_REVIEW,
  TUNISIAN_ACCOUNT_FINANCIAL_CATEGORIES,
  type FinancialAccountCategory,
} from './financial-categories';

const asOf = new Date('2026-11-01T00:00:00.000Z');
const openingDate = new Date('2025-10-01T00:00:00.000Z');
const activityDate = new Date('2026-06-01T00:00:00.000Z');

const accounts = Object.entries(FINANCIAL_ACCOUNT_CATEGORIES).map(([category, details]) => ({
  code: category,
  type: details.accountType,
  financialCategory: category,
}));

function line(accountCode: FinancialAccountCategory, debit: number, credit: number, date = activityDate) {
  return { accountCode, debit, credit, date };
}

describe('calculateAdvancedFinancialAnalysis', () => {
  it('covers the configured Tunisian seed chart without classifying the two explicit review cases', () => {
    const seedCodes = [
      '101', '111', '120', '218', '221', '281', '311', '33', '370', '401', '411',
      '432', '434', '4366', '4367', '438', '532', '540', '601', '603', '607',
      '640', '647', '661', '701', '707', '716',
    ];
    const classified = Object.keys(TUNISIAN_ACCOUNT_FINANCIAL_CATEGORIES);
    const review = Object.keys(TUNISIAN_ACCOUNT_CLASSIFICATION_REVIEW);
    assert.equal(seedCodes.length, 27);
    assert.equal(classified.length, 25);
    assert.deepEqual(review, ['33', '603']);
    assert.deepEqual([...classified, ...review].sort(), [...seedCodes].sort());
    for (const [code, category] of Object.entries(TUNISIAN_ACCOUNT_FINANCIAL_CATEGORIES)) {
      assert.equal(
        FINANCIAL_ACCOUNT_CATEGORIES[category].accountType,
        code === '101' || code === '111' || code === '120' ? 'Equity'
          : ['218', '221', '281', '311', '370', '411', '4366', '532', '540'].includes(code) ? 'Asset'
            : ['401', '432', '434', '4367', '438'].includes(code) ? 'Liability'
              : ['601', '607', '640', '647', '661'].includes(code) ? 'Expense'
                : 'Revenue',
      );
    }
  });

  it('calculates statements and standard ratios from classified postings without account-code assumptions', () => {
    const result = calculateAdvancedFinancialAnalysis({
      countryCode: 'FR',
      currency: 'EUR',
      accounts,
      asOf,
      journalLines: [
        line('CASH_EQUIVALENT', 700, 0, openingDate),
        line('NONCURRENT_ASSET', 300, 0, openingDate),
        line('INVENTORY', 200, 0, openingDate),
        line('TRADE_RECEIVABLE', 100, 0, openingDate),
        line('TRADE_PAYABLE', 0, 150, openingDate),
        line('EQUITY', 0, 1150, openingDate),
        line('TRADE_RECEIVABLE', 500, 0),
        line('REVENUE', 0, 500),
        line('CASH_EQUIVALENT', 350, 0),
        line('TRADE_RECEIVABLE', 0, 350),
        line('COST_OF_GOODS_SOLD', 200, 0),
        line('INVENTORY', 0, 200),
        line('PURCHASES', 100, 0),
        line('TRADE_PAYABLE', 0, 100),
        line('OPERATING_EXPENSE', 50, 0),
        line('CASH_EQUIVALENT', 0, 50),
        line('CASH_EQUIVALENT', 1000, 0, new Date('2026-12-01T00:00:00.000Z')),
      ],
    });

    assert.equal(result.countryCode, 'FR');
    assert.equal(result.balanceSheet.available, true);
    assert.deepEqual(result.balanceSheet.categories, {
      cash: 1000,
      tradeReceivables: 250,
      inventory: 0,
      otherCurrentAssets: 0,
      noncurrentAssets: 300,
      tradePayables: 250,
      otherCurrentLiabilities: 0,
      noncurrentLiabilities: 0,
      equity: 1300,
    });
    assert.equal(result.balanceSheet.accounts.find((account) => account.code === 'CASH_EQUIVALENT')?.balance, 1000);
    assert.equal(result.balanceSheet.accounts.find((account) => account.code === 'INVENTORY')?.balance, 0);
    assert.equal(result.balanceSheet.accounts.find((account) => account.code === 'EQUITY')?.balance, 1150);
    assert.deepEqual(result.equityStatement, {
      available: true,
      periodStart: '2025-11-01',
      periodEnd: '2026-11-01',
      openingEquity: 1150,
      creditMovements: 0,
      debitMovements: 0,
      netIncome: 150,
      closingEquity: 1300,
      note: 'Les mouvements au crédit et au débit sont des variations comptables nettes sur comptes de capitaux propres; leur nature (apport, distribution, reclassement) n’est pas inférée.',
    });
    assert.equal(result.balanceSheet.totalAssets, 1550);
    assert.equal(result.balanceSheet.totalLiabilities, 250);
    assert.equal(result.balanceSheet.equity, 1300);
    assert.equal(result.balanceSheet.balanceDifference, 0);
    assert.equal(result.balanceSheet.isBalanced, true);
    assert.deepEqual(result.cashFlowStatement, {
      available: true,
      periodStart: '2025-11-01',
      periodEnd: '2026-11-01',
      openingCash: 700,
      cashInflows: 350,
      cashOutflows: 50,
      netCashChange: 300,
      closingCash: 1000,
      operatingFlows: null,
      investingFlows: null,
      financingFlows: null,
      classificationNote: 'La ventilation opérationnel / investissement / financement nécessite une classification vérifiée des contreparties; seuls les mouvements des comptes de trésorerie sont calculés.',
    });
    assert.equal(result.incomeStatement.revenue, 500);
    assert.equal(result.incomeStatement.costOfGoodsSold, 200);
    assert.equal(result.incomeStatement.ebitda, 150);
    assert.equal(result.incomeStatement.netIncome, 150);
    assert.equal(result.aggregates.clientReceivables, 250);
    assert.equal(result.aggregates.vendorDebts, 250);
    assert.equal(result.aggregates.bfr, 0);
    assert.equal(result.aggregates.frng, 1000);
    assert.equal(result.aggregates.netTreasury, 1000);
    assert.equal(result.ratios.currentRatio, 5);
    assert.equal(result.ratios.quickRatio, 5);
    assert.equal(result.ratios.dsoDays, 128);
    assert.equal(result.ratios.dioDays, 183);
    assert.equal(result.ratios.dpoDays, 730);
    assert.equal(result.ratios.cashConversionCycle, -419);
    assert.equal(result.evaluation.healthStatus, 'UNVERIFIED');
    assert.match(result.evaluation.diagnostic, /soldes d’ouverture et le rapprochement de clôture/);
  });

  it('withholds ratios when accounts remain unclassified or a journal line is invalid', () => {
    const incompleteAccounts = accounts.map((account) => account.code === 'TRADE_RECEIVABLE'
      ? { ...account, financialCategory: null }
      : account);
    const incomplete = calculateAdvancedFinancialAnalysis({
      countryCode: 'TN',
      currency: 'TND',
      accounts: incompleteAccounts,
      asOf,
      journalLines: [line('CASH_EQUIVALENT', 1, 0)],
    });
    assert.equal(incomplete.balanceSheet.available, false);
    assert.equal(incomplete.ratios.currentRatio, null);
    assert.deepEqual(incomplete.coverage.unclassifiedAccountCodes, ['TRADE_RECEIVABLE']);
    assert.equal(incomplete.balanceSheet.accounts.find((account) => account.code === 'TRADE_RECEIVABLE')?.balance, null);

    const invalid = calculateAdvancedFinancialAnalysis({
      countryCode: 'TN',
      currency: 'TND',
      accounts,
      asOf,
      journalLines: [line('CASH_EQUIVALENT', 1.0001, 0)],
    });
    assert.equal(invalid.balanceSheet.available, false);
    assert.equal(invalid.incomeStatement.available, false);
    assert.equal(invalid.coverage.invalidJournalLineCount, 1);
  });

  it('accepts zero values only as classified balances and ignores future postings', () => {
    const result = calculateAdvancedFinancialAnalysis({
      countryCode: 'TN',
      currency: 'TND',
      accounts,
      asOf,
      journalLines: [line('CASH_EQUIVALENT', 0, 0, new Date('2026-12-01T00:00:00.000Z'))],
    });
    assert.equal(result.coverage.postedJournalLineCount, 1);
    assert.equal(result.coverage.datedJournalLineCount, 0);
    assert.equal(result.ratios.currentRatio, null);
  });

  it('reconciles equity account debits and credits with the unclosed period result', () => {
    const result = calculateAdvancedFinancialAnalysis({
      countryCode: 'TN',
      currency: 'TND',
      accounts,
      asOf,
      journalLines: [
        line('CASH_EQUIVALENT', 100, 0, openingDate),
        line('EQUITY', 0, 100, openingDate),
        line('CASH_EQUIVALENT', 20, 0),
        line('EQUITY', 0, 20),
        line('EQUITY', 5, 0),
        line('CASH_EQUIVALENT', 0, 5),
      ],
    });

    assert.equal(result.equityStatement.available, true);
    assert.equal(result.equityStatement.openingEquity, 100);
    assert.equal(result.equityStatement.creditMovements, 20);
    assert.equal(result.equityStatement.debitMovements, 5);
    assert.equal(result.equityStatement.netIncome, 0);
    assert.equal(result.equityStatement.closingEquity, 115);
  });
});
