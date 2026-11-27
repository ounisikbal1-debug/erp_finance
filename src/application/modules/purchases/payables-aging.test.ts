import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculatePayablesAging, parsePayablesAsOf, type PayableInvoice } from './payables-aging';

const asOf = '2026-03-31';

function invoice(overrides: Partial<PayableInvoice> = {}): PayableInvoice {
  return {
    id: 'invoice-1',
    invoiceNumber: 'SUP-001',
    postedAt: new Date('2026-01-02T00:00:00.000Z'),
    dueDate: new Date('2026-03-30T00:00:00.000Z'),
    status: 'POSTED',
    totalAmount: 100,
    currencyCode: 'TND',
    functionalCurrencyCode: 'TND',
    vendor: { code: 'V001', name: 'Fournisseur' },
    cashflowPayments: [],
    ...overrides,
  };
}

describe('payables aging', () => {
  it('validates a calendar cutoff date', () => {
    assert.throws(() => parsePayablesAsOf('2026-02-30'), /date calendaire valide/);
    assert.equal(parsePayablesAsOf(asOf).endExclusive.toISOString(), '2026-04-01T00:00:00.000Z');
  });

  it('calculates only posted, unpaid supplier invoices and millime-exact aging buckets', () => {
    const report = calculatePayablesAging({
      entity: { name: 'SAFE TN', currencyCode: 'TND' },
      asOf,
      invoices: [
        invoice({
          id: 'part-paid',
          cashflowPayments: [{
            amount: 25.125,
            currencyCode: 'TND',
            direction: 'SUPPLIER_PAYMENT',
            paidAt: new Date('2026-03-15T00:00:00.000Z'),
          }],
        }),
        invoice({ id: 'not-due', dueDate: new Date('2026-04-01T00:00:00.000Z'), totalAmount: 40 }),
        invoice({ id: 'paid-after-cutoff', cashflowPayments: [{
          amount: 100,
          currencyCode: 'TND',
          direction: 'SUPPLIER_PAYMENT',
          paidAt: new Date('2026-04-01T00:00:00.000Z'),
        }] }),
        invoice({ id: 'not-posted', status: 'APPROVED', totalAmount: 99 }),
        invoice({ id: 'future-posting', postedAt: new Date('2026-04-01T00:00:00.000Z'), totalAmount: 99 }),
      ],
    });

    assert.equal(report.totals.outstanding, 214.875);
    assert.equal(report.totals.notDue, 40);
    assert.equal(report.totals.days1To30, 174.875);
    assert.equal(report.totals.days31To60, 0);
    assert.equal(report.totals.days61To90, 0);
    assert.equal(report.totals.over90, 0);
    assert.equal(report.coverage.openInvoiceCount, 3);
    assert.equal(report.invoices.some(({ id }) => id === 'not-posted' || id === 'future-posting'), false);
  });

  it('makes totals unavailable when amounts, currencies, or payment allocations are unreliable', () => {
    const report = calculatePayablesAging({
      entity: { name: 'SAFE TN', currencyCode: 'TND' },
      asOf,
      invoices: [
        invoice({ id: 'valid' }),
        invoice({ id: 'bad-currency', functionalCurrencyCode: 'EUR' }),
        invoice({ id: 'bad-payment', cashflowPayments: [{
          amount: 1.001,
          currencyCode: 'EUR',
          direction: 'SUPPLIER_PAYMENT',
          paidAt: new Date('2026-03-01T00:00:00.000Z'),
        }] }),
        invoice({ id: 'missing-post-date', postedAt: null }),
      ],
    });

    assert.equal(report.totals.outstanding, 100);
    assert.equal(report.totals.days1To30, 100);
    assert.equal(report.coverage.invalidInvoiceCount, 3);
    assert.equal(report.coverage.invalidPaymentCount, 1);
    assert.equal(report.invoices.filter(({ diagnostic }) => diagnostic !== null).length, 3);
  });

  it('rejects cumulative payments above the posted invoice amount', () => {
    const report = calculatePayablesAging({
      entity: { name: 'SAFE TN', currencyCode: 'TND' },
      asOf,
      invoices: [invoice({
        cashflowPayments: [{
          amount: 100.001,
          currencyCode: 'TND',
          direction: 'SUPPLIER_PAYMENT',
          paidAt: new Date('2026-03-01T00:00:00.000Z'),
        }],
      })],
    });
    assert.equal(report.totals.outstanding, 0);
  });

  it('subtracts posted supplier credits from open payables and exposes the credited amount', () => {
    const report = calculatePayablesAging({
      entity: { name: 'SAFE TN', currencyCode: 'TND' },
      asOf,
      invoices: [invoice({
        cashflowPayments: [{
          amount: 20,
          currencyCode: 'TND',
          direction: 'SUPPLIER_PAYMENT',
          paidAt: new Date('2026-03-01T00:00:00.000Z'),
        }],
        supplierCreditNotes: [{
          totalAmount: 30,
          currencyCode: 'TND',
          status: 'POSTED',
          postedAt: new Date('2026-03-10T00:00:00.000Z'),
        }],
      })],
    });
    assert.equal(report.totals.outstanding, 50);
    assert.equal(report.invoices[0].paidAmount, 20);
    assert.equal(report.invoices[0].creditedAmount, 30);
    assert.equal(report.invoices[0].outstandingAmount, 50);
  });

  it('caps source credit offsets at the open payable and leaves the excess unapplied', () => {
    const report = calculatePayablesAging({
      entity: { name: 'SAFE TN', currencyCode: 'TND' },
      asOf,
      invoices: [invoice({
        cashflowPayments: [{
          amount: 80,
          currencyCode: 'TND',
          direction: 'SUPPLIER_PAYMENT',
          paidAt: new Date('2026-03-01T00:00:00.000Z'),
        }],
        supplierCreditNotes: [{
          totalAmount: 30,
          currencyCode: 'TND',
          status: 'POSTED',
          postedAt: new Date('2026-03-10T00:00:00.000Z'),
        }],
      })],
    });
    assert.equal(report.totals.outstanding, 0);
    assert.equal(report.coverage.invalidInvoiceCount, 0);
  });
});
