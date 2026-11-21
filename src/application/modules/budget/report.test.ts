import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildBudgetReport } from './report';

const entity = { name: 'SAFE TN', countryCode: 'TN', currencyCode: 'TND' };

function budgetLine(input: Partial<Parameters<typeof buildBudgetReport>[0]['budgetLines'][number]> = {}) {
  return {
    id: 'budget-1',
    period: '2026-10',
    accountCode: '601',
    amount: 100,
    status: 'APPROVED',
    createdByUserId: 'creator',
    createdBy: { username: 'admin' },
    approvedByUserId: 'approver',
    approvedBy: { username: 'finance' },
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    approvedAt: new Date('2026-10-02T00:00:00.000Z'),
    ...input,
  };
}

describe('buildBudgetReport', () => {
  it('compares only posted natural expense and revenue movements to approved budgets', () => {
    const report = buildBudgetReport({
      entity,
      period: '2026-10',
      accounts: [
        { code: '601', description: 'Achats', type: 'Expense' },
        { code: '602', description: 'Services', type: 'Expense' },
        { code: '707', description: 'Ventes', type: 'Revenue' },
        { code: '411', description: 'Clients', type: 'Asset' },
      ],
      budgetLines: [
        budgetLine(),
        budgetLine({
          id: 'budget-2',
          accountCode: '707',
          amount: 300,
          createdByUserId: 'creator',
          createdBy: { username: 'admin' },
        }),
        budgetLine({ id: 'draft', accountCode: '602', status: 'DRAFT', amount: 99 }),
      ],
      journalLines: [
        { accountCode: '601', debit: 125, credit: 0 },
        { accountCode: '601', debit: 0, credit: 5 },
        { accountCode: '707', debit: 0, credit: 250 },
        { accountCode: '411', debit: 40, credit: 0 },
        { accountCode: 'UNKNOWN', debit: 1, credit: 0 },
      ],
    });

    assert.equal(report.lines[0].actual, 120);
    assert.equal(report.lines[0].variance, -20);
    assert.equal(report.lines[1].actual, 250);
    assert.equal(report.lines[1].variance, -50);
    assert.equal(report.lines[2].variance, null);
    assert.equal(report.totals.expenseBudget, 100);
    assert.equal(report.totals.expenseActual, 120);
    assert.equal(report.totals.expenseVariance, -20);
    assert.equal(report.totals.revenueBudget, 300);
    assert.equal(report.totals.revenueActual, 250);
    assert.equal(report.totals.revenueVariance, -50);
    assert.equal(report.diagnostics.postedJournalLineCount, 5);
    assert.equal(report.diagnostics.unclassifiedJournalLineCount, 1);
    assert.deepEqual(report.diagnostics.unclassifiedAccountCodes, ['UNKNOWN']);
  });

  it('does not present malformed posted lines as actuals', () => {
    const report = buildBudgetReport({
      entity,
      period: '2026-10',
      accounts: [{ code: '601', description: 'Achats', type: 'Expense' }],
      budgetLines: [budgetLine()],
      journalLines: [
        { accountCode: '601', debit: 10, credit: 10 },
        { accountCode: '601', debit: Number.NaN, credit: 0 },
      ],
    });
    assert.equal(report.lines[0].actual, null);
    assert.equal(report.lines[0].variance, null);
    assert.equal(report.totals.expenseActual, null);
    assert.equal(report.diagnostics.invalidJournalLineCount, 2);
  });
});
