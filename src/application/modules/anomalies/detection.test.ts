import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectAnomalies } from './detection';

const baseInput = {
  entityId: 'entity-1',
  periodFrom: '2026-01-01',
  periodTo: '2026-11-01T12:00:00.000Z',
  generatedAt: new Date('2026-11-01T12:00:00.000Z'),
  journalEntries: [],
  invoices: [],
  payslips: [],
};

describe('detectAnomalies', () => {
  it('reports a clean result separately from checks that are unavailable', () => {
    const report = detectAnomalies(baseInput);
    assert.equal(report.result, 'no_detected_anomalies');
    assert.equal(report.anomalies.length, 0);
    assert.ok(report.checkedAreas.length > 0);
    assert.ok(report.unavailableChecks.some((check) => check.includes('Rapprochement bancaire')));
  });

  it('discloses when a source scan has been capped', () => {
    const report = detectAnomalies({ ...baseInput, limitedSources: ['Écritures'] });
    assert.equal(report.result, 'no_detected_anomalies');
    assert.ok(report.unavailableChecks.some((check) => check.includes('scan limité à 10 000')));
  });

  it('detects unbalanced posted entries and missing invoice postings with traceable references', () => {
    const report = detectAnomalies({
      ...baseInput,
      journalEntries: [{
        entryNumber: 'JE-1',
        reference: 'OTHER',
        date: new Date('2026-10-12T00:00:00.000Z'),
        lines: [{ accountCode: '411', debit: 100, credit: 0 }, { accountCode: '707', debit: 0, credit: 90 }],
      }],
      invoices: [{
        invoiceNumber: 'INV-1',
        createdAt: new Date('2026-10-12T00:00:00.000Z'),
        taxAmount: 19,
        items: [{ quantity: 1, unitPrice: 100, taxRate: 19 }],
      }],
    });
    assert.deepEqual(report.anomalies.map(({ id }) => id), ['journal:JE-1', 'invoice-missing-entry:INV-1']);
    assert.equal(report.result, 'anomalies_found');
  });

  it('detects VAT differences and duplicate payroll records', () => {
    const report = detectAnomalies({
      ...baseInput,
      journalEntries: [{
        entryNumber: 'JE-INV-2',
        reference: 'INV-2',
        date: new Date('2026-10-12T00:00:00.000Z'),
        lines: [
          { accountCode: '411', debit: 119, credit: 0 },
          { accountCode: '4367', debit: 0, credit: 18 },
          { accountCode: '707', debit: 0, credit: 101 },
        ],
      }],
      invoices: [{
        invoiceNumber: 'INV-2',
        createdAt: new Date('2026-10-12T00:00:00.000Z'),
        vatAccountCode: '4367',
        taxAmount: 19,
        items: [{ quantity: 1, unitPrice: 100, taxRate: 19 }],
      }],
      payslips: [
        { employeeId: 'EMP-1', period: '2026-10', createdAt: new Date('2026-10-30T00:00:00.000Z'), employee: { firstName: 'Amina', lastName: 'Ali' } },
        { employeeId: 'EMP-1', period: '2026-10', createdAt: new Date('2026-10-31T00:00:00.000Z'), employee: { firstName: 'Amina', lastName: 'Ali' } },
      ],
    });
    assert.ok(report.anomalies.some(({ id }) => id === 'invoice-vat:INV-2'));
    assert.ok(report.anomalies.some(({ id, reference }) => id === 'duplicate-payslip:EMP-1:2026-10' && reference.includes('Amina Ali')));
  });

  it('flags multiple posted journal entries linked to the same invoice for review', () => {
    const report = detectAnomalies({
      ...baseInput,
      journalEntries: ['JE-1', 'JE-2'].map((entryNumber) => ({
        entryNumber,
        reference: 'INV-3',
        date: new Date('2026-10-12T00:00:00.000Z'),
        lines: [
          { accountCode: '411', debit: 100, credit: 0 },
          { accountCode: '707', debit: 0, credit: 100 },
        ],
      })),
      invoices: [{
        invoiceNumber: 'INV-3',
        createdAt: new Date('2026-10-12T00:00:00.000Z'),
        taxAmount: 0,
        items: [{ quantity: 1, unitPrice: 100, taxRate: 0 }],
      }],
    });
    assert.ok(report.anomalies.some(({ id, reason }) => (
      id === 'invoice-multiple-entries:INV-3' && reason.includes('double comptabilisation')
    )));
  });

  it('uses the same millime rounding sequence as invoice creation', () => {
    const report = detectAnomalies({
      ...baseInput,
      journalEntries: [{
        entryNumber: 'JE-ROUND',
        reference: 'INV-ROUND',
        date: new Date('2026-10-12T00:00:00.000Z'),
        lines: [
          { accountCode: '411', debit: 0.005, credit: 0 },
          { accountCode: '4367', debit: 0, credit: 0.002 },
          { accountCode: '707', debit: 0, credit: 0.003 },
        ],
      }],
      invoices: [{
        invoiceNumber: 'INV-ROUND',
        createdAt: new Date('2026-10-12T00:00:00.000Z'),
        taxAmount: 0.002,
        items: [{ quantity: 2, unitPrice: 0.00125, taxRate: 50 }],
      }],
    });
    assert.equal(report.anomalies.some(({ id }) => id === 'invoice-vat:INV-ROUND'), false);
  });

  it('reconciles VAT against the account recorded on the invoice instead of a fixed country code', () => {
    const report = detectAnomalies({
      ...baseInput,
      journalEntries: [{
        entryNumber: 'JE-INV-COUNTRY',
        reference: 'INV-COUNTRY',
        date: new Date('2026-10-12T00:00:00.000Z'),
        lines: [
          { accountCode: 'CUST.REC', debit: 120, credit: 0 },
          { accountCode: 'TAX.OUT', debit: 0, credit: 20 },
          { accountCode: 'SALES.REV', debit: 0, credit: 100 },
        ],
      }],
      invoices: [{
        invoiceNumber: 'INV-COUNTRY',
        createdAt: new Date('2026-10-12T00:00:00.000Z'),
        vatAccountCode: 'TAX.OUT',
        taxAmount: 20,
        items: [{ quantity: 1, unitPrice: 100, taxRate: 20 }],
      }],
    });
    assert.equal(report.anomalies.some(({ id }) => id === 'invoice-vat:INV-COUNTRY'), false);
  });

  it('discloses that historical VAT cannot be reconciled when its account was not captured', () => {
    const report = detectAnomalies({
      ...baseInput,
      invoices: [{
        invoiceNumber: 'INV-LEGACY',
        createdAt: new Date('2026-10-12T00:00:00.000Z'),
        taxAmount: 19,
        items: [{ quantity: 1, unitPrice: 100, taxRate: 19 }],
      }],
    });
    assert.ok(report.unavailableChecks.some((check) => check.includes('factures historiques sans code de compte TVA')));
  });
});
