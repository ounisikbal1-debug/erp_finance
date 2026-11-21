import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateFinancialPeriodSummary, parseFinancialReportPeriod } from './financial-report';

describe('financial period report', () => {
  it('uses configured country account types and millime-exact posted movements', () => {
    const summary = calculateFinancialPeriodSummary({
      entity: { name: 'SAFE FR', countryCode: 'FR', currencyCode: 'EUR' },
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      generatedAt: new Date('2026-02-01T00:00:00.000Z'),
      accounts: [
        { code: 'A.1', description: 'Cash', type: 'Asset' },
        { code: 'L.1', description: 'Payables', type: 'Liability' },
        { code: 'R.1', description: 'Sales', type: 'Revenue', financialCategory: 'REVENUE' },
        { code: 'E.1', description: 'Expenses', type: 'Expense', financialCategory: 'OPERATING_EXPENSE' },
      ],
      journalLines: [
        { accountCode: 'A.1', debit: 100.125, credit: 0 },
        { accountCode: 'L.1', debit: 0, credit: 100.125 },
        { accountCode: 'R.1', debit: 0, credit: 80.125 },
        { accountCode: 'E.1', debit: 20, credit: 0 },
      ],
    });

    assert.equal(summary.entity.currencyCode, 'EUR');
    assert.equal(summary.currencyPrecision, 3);
    assert.deepEqual(summary.totals.find(({ type }) => type === 'Asset'), {
      type: 'Asset', accountCount: 1, movement: 100.125,
    });
    assert.deepEqual(summary.totals.find(({ type }) => type === 'Liability'), {
      type: 'Liability', accountCount: 1, movement: 100.125,
    });
    assert.deepEqual(summary.totals.find(({ type }) => type === 'Revenue'), {
      type: 'Revenue', accountCount: 1, movement: 80.125,
    });
    assert.equal(summary.accounts.find(({ code }) => code === 'R.1')?.financialCategory, 'REVENUE');
    assert.equal(summary.coverage.invalidJournalLineCount, 0);
  });

  it('makes a type total unavailable when account classifications or source lines are incomplete', () => {
    const summary = calculateFinancialPeriodSummary({
      entity: { name: 'SAFE', countryCode: 'TN', currencyCode: 'TND' },
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      accounts: [
        { code: 'REV', description: 'Sales', type: 'Revenue' },
        { code: 'AST', description: 'Bank', type: 'Asset' },
      ],
      journalLines: [
        { accountCode: 'REV', debit: 0, credit: 30 },
        { accountCode: 'AST', debit: 1, credit: 1 },
        { accountCode: 'UNKNOWN', debit: 1, credit: 0 },
      ],
    });

    assert.equal(summary.totals.find(({ type }) => type === 'Revenue')?.movement, 30);
    assert.equal(summary.totals.find(({ type }) => type === 'Asset')?.movement, null);
    assert.equal(summary.totals.find(({ type }) => type === 'Equity')?.movement, null);
    assert.equal(summary.coverage.invalidJournalLineCount, 1);
    assert.equal(summary.coverage.unclassifiedJournalLineCount, 1);
    assert.deepEqual(summary.coverage.unclassifiedAccountCodes, ['UNKNOWN']);
  });

  it('validates calendar dates and ordered periods', () => {
    assert.equal(parseFinancialReportPeriod('2024-02-29', '2024-03-01').endExclusive.toISOString(), '2024-03-02T00:00:00.000Z');
    assert.throws(() => parseFinancialReportPeriod('2025-02-29', '2025-03-01'), /dates calendaires valides/);
    assert.throws(() => parseFinancialReportPeriod('2026-02-01', '2026-01-31'), /date de début/);
  });
});
