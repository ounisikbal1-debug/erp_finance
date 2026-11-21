import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reconcileInvoiceLineReceipt } from './invoice-line-reconciliation';

const line = {
  lineQuantity: 5,
  lineUnitPrice: 10,
  exchangeRate: 1,
  previousReceipts: [] as Array<{ quantity: number; unitCost: number }>,
};

describe('supplier invoice line receipt matching', () => {
  it('accepts partial receipts and requires exact quantity and value when the line is completed', () => {
    assert.equal(reconcileInvoiceLineReceipt({
      ...line, receiptQuantity: 2, receiptUnitCost: 10,
    }).accepted, true);
    assert.equal(reconcileInvoiceLineReceipt({
      ...line,
      previousReceipts: [{ quantity: 2, unitCost: 10 }],
      receiptQuantity: 3,
      receiptUnitCost: 10,
    }).accepted, true);
  });

  it('rejects excess quantities, excess values, and an under-valued completed line', () => {
    assert.match(reconcileInvoiceLineReceipt({
      ...line, receiptQuantity: 6, receiptUnitCost: 10,
    }).error ?? '', /quantité facturée/);
    assert.match(reconcileInvoiceLineReceipt({
      ...line, receiptQuantity: 1, receiptUnitCost: 60,
    }).error ?? '', /dépasserait le montant/);
    assert.match(reconcileInvoiceLineReceipt({
      ...line, receiptQuantity: 5, receiptUnitCost: 9,
    }).error ?? '', /ne peut être soldée/);
  });

  it('converts the line amount to functional currency before reconciliation', () => {
    const result = reconcileInvoiceLineReceipt({
      ...line,
      exchangeRate: 3.4,
      receiptQuantity: 5,
      receiptUnitCost: 34,
    });
    assert.equal(result.accepted, true);
    assert.equal(result.expectedValueMillimes, 170_000);
  });

  it('reconciles fractional measured quantities at millime precision', () => {
    const result = reconcileInvoiceLineReceipt({
      lineQuantity: 2.5,
      lineUnitPrice: 8,
      exchangeRate: 1,
      previousReceipts: [{ quantity: 0.75, unitCost: 8 }],
      receiptQuantity: 1.75,
      receiptUnitCost: 8,
    });
    assert.equal(result.accepted, true);
    assert.equal(result.receivedQuantity, 2.5);
    assert.equal(result.receivedValueMillimes, 20_000);
    assert.equal(result.expectedValueMillimes, 20_000);
  });
});
