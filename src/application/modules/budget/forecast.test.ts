import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildBudgetForecastReport } from './forecast';

const expenseAccount = { code: '601', description: 'Achats', type: 'Expense' };
const revenueAccount = { code: '701', description: 'Ventes', type: 'Revenue' };
const annualBudgets = (accountCode: string, amount: number) => Array.from({ length: 12 }, (_, index) => ({
  period: `2026-${String(index + 1).padStart(2, '0')}`,
  accountCode,
  amount,
  status: 'APPROVED',
}));

describe('annual budget forecast', () => {
  it('combines posted year-to-date actuals with remaining approved monthly budget', () => {
    const result = buildBudgetForecastReport({
      entity: { name: 'SAFE', countryCode: 'TN', currencyCode: 'TND' },
      year: 2026,
      asOfPeriod: '2026-03',
      accounts: [expenseAccount, revenueAccount],
      budgetLines: [...annualBudgets('601', 100), ...annualBudgets('701', 500)],
      journalLines: [
        { accountCode: '601', debit: 10, credit: 0, date: '2026-01-15T00:00:00.000Z' },
        { accountCode: '601', debit: 20, credit: 0, date: '2026-02-15T00:00:00.000Z' },
        { accountCode: '601', debit: 30, credit: 0, date: '2026-03-15T00:00:00.000Z' },
        { accountCode: '701', debit: 0, credit: 100, date: '2026-01-15T00:00:00.000Z' },
        { accountCode: '701', debit: 0, credit: 200, date: '2026-02-15T00:00:00.000Z' },
        { accountCode: '701', debit: 0, credit: 300, date: '2026-03-15T00:00:00.000Z' },
        { accountCode: '601', debit: 999, credit: 0, date: '2026-04-15T00:00:00.000Z' },
      ],
    });

    assert.deepEqual(result.lines.map(({ accountCode, annualBudget, actualYtd, forecast, linearRunRate, variance }) => ({
      accountCode, annualBudget, actualYtd, forecast, linearRunRate, variance,
    })), [
      { accountCode: '601', annualBudget: 1200, actualYtd: 60, forecast: 960, linearRunRate: 240, variance: 240 },
      { accountCode: '701', annualBudget: 6000, actualYtd: 600, forecast: 5100, linearRunRate: 2400, variance: -900 },
    ]);
    assert.equal(result.totals.Expense.forecast, 960);
    assert.equal(result.totals.Revenue.forecast, 5100);
    assert.equal(result.diagnostics.postedJournalLineCount, 7);
  });

  it('leaves a forecast unavailable when future approved monthly budgets are missing', () => {
    const result = buildBudgetForecastReport({
      entity: { name: 'SAFE', countryCode: 'TN', currencyCode: 'TND' },
      year: 2026,
      asOfPeriod: '2026-10',
      accounts: [expenseAccount],
      budgetLines: annualBudgets('601', 100).filter(({ period }) => period !== '2026-12'),
      journalLines: [{ accountCode: '601', debit: 70, credit: 0, date: '2026-10-10T00:00:00.000Z' }],
    });

    assert.equal(result.lines[0].forecast, null);
    assert.equal(result.lines[0].linearRunRate, 84);
    assert.equal(result.lines[0].remainingBudgetMonths, 1);
    assert.deepEqual(result.diagnostics.unavailableForecastAccountCodes, ['601']);
  });

  it('reports invalid journal input without producing a plausible forecast', () => {
    const result = buildBudgetForecastReport({
      entity: { name: 'SAFE', countryCode: 'TN', currencyCode: 'TND' },
      year: 2026,
      asOfPeriod: '2026-06',
      accounts: [expenseAccount],
      budgetLines: annualBudgets('601', 100),
      journalLines: [{ accountCode: '601', debit: 1, credit: 1, date: '2026-02-10T00:00:00.000Z' }],
    });

    assert.equal(result.lines[0].actualYtd, null);
    assert.equal(result.lines[0].forecast, null);
    assert.equal(result.diagnostics.invalidJournalLineCount, 1);
  });
});
