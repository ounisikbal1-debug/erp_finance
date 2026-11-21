import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateDashboardSummary } from './dashboard';

describe('calculateDashboardSummary', () => {
  const asOf = new Date('2026-11-15T12:00:00.000Z');
  const entity = { name: 'SAFE FR', countryCode: 'FR', currencyCode: 'EUR' };

  it('builds current-entity KPIs and monthly trends from country account types', () => {
    const result = calculateDashboardSummary({
      entity,
      asOf,
      materials: [{ quantity: 3, costPrice: 2.345 }],
      invoices: [
        { status: 'ISSUED', totalAmount: 120, currencyCode: 'EUR' },
        { status: 'PAID', totalAmount: 30, currencyCode: 'EUR' },
        { status: 'DRAFT', totalAmount: 50, currencyCode: 'EUR' },
      ],
      accounts: [
        { code: 'REV.01', type: 'Revenue' },
        { code: 'EXP.01', type: 'Expense' },
        { code: 'CASH.01', type: 'Asset' },
      ],
      journalLines: [
        { date: new Date('2026-11-04T00:00:00.000Z'), accountCode: 'REV.01', debit: 0, credit: 200 },
        { date: new Date('2026-11-05T00:00:00.000Z'), accountCode: 'EXP.01', debit: 80, credit: 0 },
        { date: new Date('2026-10-15T00:00:00.000Z'), accountCode: 'REV.01', debit: 10, credit: 0 },
        { date: new Date('2026-11-06T00:00:00.000Z'), accountCode: 'CASH.01', debit: 25, credit: 0 },
        { date: new Date('2026-11-07T00:00:00.000Z'), accountCode: 'MISSING', debit: 1, credit: 0 },
      ],
    });

    assert.equal(result.entity.currencyCode, 'EUR');
    assert.equal(result.periodStart, '2025-12-01');
    assert.equal(result.periodEnd, '2026-11-15');
    assert.equal(result.kpis.postedRevenue, 190);
    assert.equal(result.kpis.postedExpenses, 80);
    assert.equal(result.kpis.operatingDifference, 110);
    assert.equal(result.kpis.issuedInvoiceAmount, 120);
    assert.equal(result.kpis.issuedInvoiceCount, 1);
    assert.equal(result.kpis.inventoryAtCost, 7.035);
    assert.equal(result.monthly.length, 12);
    assert.equal(result.monthly[10].revenue, -10);
    assert.equal(result.monthly[11].revenue, 200);
    assert.equal(result.monthly[11].expenses, 80);
    assert.equal(result.coverage.unclassifiedJournalLineCount, 1);
    assert.deepEqual(result.coverage.unclassifiedAccountCodes, ['MISSING']);
  });

  it('keeps categories unavailable when the country chart has no accounts of that type', () => {
    const result = calculateDashboardSummary({
      entity,
      asOf,
      materials: [],
      invoices: [],
      journalLines: [],
      accounts: [{ code: 'A.01', type: 'Asset' }],
    });
    assert.equal(result.kpis.postedRevenue, null);
    assert.equal(result.kpis.postedExpenses, null);
    assert.equal(result.kpis.operatingDifference, null);
    assert.equal(result.kpis.inventoryAtCost, null);
    assert.equal(result.coverage.revenueAccountCount, 0);
    assert.equal(result.coverage.expenseAccountCount, 0);
  });

  it('does not publish stock or invoice totals when their source values are invalid', () => {
    const result = calculateDashboardSummary({
      entity,
      asOf,
      materials: [{ quantity: 1, costPrice: -2 }],
      invoices: [{ status: 'ISSUED', totalAmount: Number.NaN, currencyCode: 'EUR' }],
      journalLines: [],
      accounts: [],
    });
    assert.equal(result.kpis.inventoryAtCost, null);
    assert.equal(result.kpis.issuedInvoiceAmount, null);
    assert.equal(result.coverage.invalidMaterialCount, 1);
    assert.equal(result.coverage.invalidInvoiceCount, 1);
  });

  it('does not combine an invoice whose issue-time currency was not recorded', () => {
    const result = calculateDashboardSummary({
      entity,
      asOf,
      materials: [],
      invoices: [{ status: 'ISSUED', totalAmount: 100, currencyCode: null }],
      journalLines: [],
      accounts: [],
    });
    assert.equal(result.kpis.issuedInvoiceAmount, null);
    assert.equal(result.coverage.invalidInvoiceCount, 1);
  });
});
