import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateReceivablesAging, parseReceivablesAsOf, type ReceivableInvoice } from './aging';

const asOf = '2026-03-31';

function invoice(overrides: Partial<ReceivableInvoice> = {}): ReceivableInvoice {
  return {
    id: 'invoice-1',
    invoiceNumber: 'INV-001',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    dueDate: new Date('2026-03-30T00:00:00.000Z'),
    status: 'ISSUED',
    totalAmount: 100,
    currencyCode: 'TND',
    functionalCurrencyCode: 'TND',
    customer: { code: 'C001', name: 'Client' },
    cashflowPayments: [],
    ...overrides,
  };
}

describe('receivables aging', () => {
  it('validates the cutoff date as a calendar date', () => {
    assert.throws(() => parseReceivablesAsOf('2026-02-30'), /date calendaire valide/);
    assert.equal(parseReceivablesAsOf(asOf).endExclusive.toISOString(), '2026-04-01T00:00:00.000Z');
  });

  it('calculates open balances and millime-exact aging buckets from recorded receipts', () => {
    const report = calculateReceivablesAging({
      entity: { name: 'SAFE TN', currencyCode: 'TND' },
      asOf,
      invoices: [
        invoice({ id: 'not-due', dueDate: new Date('2026-04-01T00:00:00.000Z'), totalAmount: 40 }),
        invoice({ id: 'one-day', totalAmount: 100, cashflowPayments: [{
          amount: 25.125,
          currencyCode: 'TND',
          direction: 'CUSTOMER_RECEIPT',
          paidAt: new Date('2026-03-15T00:00:00.000Z'),
        }] }),
        invoice({ id: 'thirty-days', dueDate: new Date('2026-03-01T00:00:00.000Z'), totalAmount: 11 }),
        invoice({ id: 'thirty-one-days', dueDate: new Date('2026-02-28T00:00:00.000Z'), totalAmount: 50 }),
        invoice({ id: 'sixty-days', dueDate: new Date('2026-01-30T00:00:00.000Z'), totalAmount: 13 }),
        invoice({ id: 'ninety-days', dueDate: new Date('2025-12-31T00:00:00.000Z'), totalAmount: 17 }),
        invoice({ id: 'over-ninety-days', dueDate: new Date('2025-12-30T00:00:00.000Z'), totalAmount: 19 }),
        invoice({ id: 'unknown-due', dueDate: null, totalAmount: 10 }),
        invoice({
          id: 'paid-after-cutoff',
          status: 'PAID',
          dueDate: new Date('2026-03-01T00:00:00.000Z'),
          totalAmount: 20,
          cashflowPayments: [{
            amount: 20,
            currencyCode: 'TND',
            direction: 'CUSTOMER_RECEIPT',
            paidAt: new Date('2026-04-01T00:00:00.000Z'),
          }],
        }),
        invoice({ id: 'future', createdAt: new Date('2026-04-01T00:00:00.000Z'), totalAmount: 99 }),
      ],
    });

    assert.equal(report.totals.outstanding, 254.875);
    assert.equal(report.totals.notDue, 40);
    assert.equal(report.totals.days1To30, 105.875);
    assert.equal(report.totals.days31To60, 63);
    assert.equal(report.totals.days61To90, 17);
    assert.equal(report.totals.over90, 19);
    assert.equal(report.totals.unknownDueDate, 10);
    assert.equal(report.coverage.openInvoiceCount, 9);
    assert.equal(report.coverage.dueDateMissingCount, 1);
    assert.equal(report.invoices.some(({ id }) => id === 'future'), false);
  });

  it('makes all totals unavailable when an invoice amount or payment allocation is unreliable', () => {
    const report = calculateReceivablesAging({
      entity: { name: 'SAFE TN', currencyCode: 'TND' },
      asOf,
      invoices: [
        invoice({ id: 'valid' }),
        invoice({ id: 'bad-currency', functionalCurrencyCode: 'EUR' }),
        invoice({ id: 'bad-payment', cashflowPayments: [{
          amount: 1.001,
          currencyCode: 'EUR',
          direction: 'CUSTOMER_RECEIPT',
          paidAt: new Date('2026-03-01T00:00:00.000Z'),
        }] }),
      ],
    });

    assert.equal(report.totals.outstanding, 100);
    assert.equal(report.totals.days1To30, 100);
    assert.equal(report.coverage.invalidInvoiceCount, 2);
    assert.equal(report.coverage.invalidPaymentCount, 1);
    assert.equal(report.invoices.filter(({ diagnostic }) => diagnostic !== null).length, 2);
  });

  it('rejects cumulative receipts above the issued invoice amount', () => {
    const report = calculateReceivablesAging({
      entity: { name: 'SAFE TN', currencyCode: 'TND' },
      asOf,
      invoices: [invoice({
        cashflowPayments: [{
          amount: 100.001,
          currencyCode: 'TND',
          direction: 'CUSTOMER_RECEIPT',
          paidAt: new Date('2026-03-01T00:00:00.000Z'),
        }],
      })],
    });
    assert.equal(report.totals.outstanding, 0);
  });

  it('reduces functional-currency receivables by their carrying amount, not the bank amount', () => {
    const report = calculateReceivablesAging({
      entity: { name: 'SAFE TN', currencyCode: 'TND' },
      asOf,
      invoices: [invoice({
        totalAmount: 285,
        currencyCode: 'TND',
        functionalCurrencyCode: 'TND',
        cashflowPayments: [{
          amount: 140,
          carryingAmount: 142.5,
          currencyCode: 'TND',
          direction: 'CUSTOMER_RECEIPT',
          paidAt: new Date('2026-03-07T00:00:00.000Z'),
        }],
      })],
    });

    assert.equal(report.totals.outstanding, 142.5);
  });
});
