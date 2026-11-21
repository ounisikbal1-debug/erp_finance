import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculatePurchaseInvoiceAmounts, validatePurchaseInvoiceInput } from './invoice';

const validInput = {
  invoiceNumber: 'SUP-2026-001',
  vendorId: 'vendor-1',
  issueDate: '2026-10-01',
  dueDate: '2026-11-01',
  subTotal: 100,
  taxRateId: 'tax-rate-1',
};

describe('purchase invoice draft validation', () => {
  it('accepts a source invoice summary with an explicit configured tax rate reference', () => {
    assert.deepEqual(validatePurchaseInvoiceInput(validInput), {
      ...validInput,
      lines: undefined,
      documentCurrencyCode: undefined,
      exchangeRate: undefined,
      exchangeRateDate: undefined,
      exchangeRateSource: undefined,
      exchangeRateImportedAt: undefined,
    });

    it('accepts item lines only when their millime total equals the invoice subtotal', () => {
      const lines = [
        { description: 'Matière A', materialId: 'material-1', quantity: 3, unitPrice: 12.345 },
        { description: 'Service', materialId: null, quantity: 1, unitPrice: 62.965 },
      ];
      assert.deepEqual(validatePurchaseInvoiceInput({ ...validInput, subTotal: 100, lines }).lines, lines);
      assert.throws(() => validatePurchaseInvoiceInput({
        ...validInput,
        lines: [{ description: 'Matière A', materialId: 'material-1', quantity: 3, unitPrice: 12.345 }],
      }), /somme exacte/);
      assert.deepEqual(validatePurchaseInvoiceInput({
        ...validInput,
        subTotal: 150,
        lines: [{ description: 'Matière A', quantity: 1.5, unitPrice: 100 }],
      }).lines, [{ description: 'Matière A', materialId: null, quantity: 1.5, unitPrice: 100 }]);
      assert.throws(() => validatePurchaseInvoiceInput({
        ...validInput,
        subTotal: 100.01,
        lines: [{ description: 'Matière A', quantity: 1.0001, unitPrice: 100 }],
      }), /trois décimales/);
    });
  });

  it('rejects invalid dates, reversed terms, unrepresentable amounts, and missing tax settings', () => {
    assert.throws(() => validatePurchaseInvoiceInput({ ...validInput, issueDate: '2026-02-29' }), /dates de facture/);
    assert.throws(() => validatePurchaseInvoiceInput({ ...validInput, dueDate: '2026-09-30' }), /date d’échéance/);
    assert.throws(() => validatePurchaseInvoiceInput({ ...validInput, subTotal: 1.0004 }), /millime/);
    assert.throws(() => validatePurchaseInvoiceInput({ ...validInput, taxRateId: '' }), /taux pays/);
  });

  it('calculates tax using the configured rate with millime rounding', () => {
    assert.deepEqual(calculatePurchaseInvoiceAmounts(100.001, 19), {
      subTotal: 100.001,
      taxAmount: 19,
      totalAmount: 119.001,
    });
    assert.deepEqual(calculatePurchaseInvoiceAmounts(100, 0), {
      subTotal: 100,
      taxAmount: 0,
      totalAmount: 100,
    });
    assert.throws(() => calculatePurchaseInvoiceAmounts(100, 101), /taux pays configuré/);
  });
});
