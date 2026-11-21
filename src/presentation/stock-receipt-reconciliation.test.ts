import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateReceiptInvoiceBalances } from './stock-receipt-reconciliation';

describe('calculateReceiptInvoiceBalances', () => {
  it('calculates matched and remaining amounts from linked receipts at millime precision', () => {
    const balances = calculateReceiptInvoiceBalances(
      [{ id: 'invoice-a', subTotal: 100 }],
      [
        { quantity: 2, unitCost: 12.345, purchaseInvoice: { id: 'invoice-a' } },
        { quantity: 1, unitCost: 5.555, purchaseInvoice: { id: 'invoice-a' } },
        { quantity: 4, unitCost: 99, purchaseInvoice: null },
      ],
    );

    assert.deepEqual(balances.get('invoice-a'), {
      matchedAmount: 30.245,
      remainingAmount: 69.755,
      overMatched: false,
    });
  });

  it('reports an overmatched invoice rather than hiding the negative balance', () => {
    const balances = calculateReceiptInvoiceBalances(
      [{ id: 'invoice-a', subTotal: 10 }],
      [{ quantity: 3, unitCost: 4, purchaseInvoice: { id: 'invoice-a' } }],
    );

    assert.deepEqual(balances.get('invoice-a'), {
      matchedAmount: 12,
      remainingAmount: -2,
      overMatched: true,
    });

    it('calculates fractional measurement receipts without rounding their quantities', () => {
      const balances = calculateReceiptInvoiceBalances(
        [{ id: 'invoice-a', subTotal: 10 }],
        [{ quantity: 0.75, unitCost: 4, purchaseInvoice: { id: 'invoice-a' } }],
      );

      assert.deepEqual(balances.get('invoice-a'), {
        matchedAmount: 3,
        remainingAmount: 7,
        overMatched: false,
      });
    });
  });

  it('marks invalid or unrepresentable totals unavailable and ignores unrelated invoices', () => {
    const balances = calculateReceiptInvoiceBalances(
      [
        { id: 'invoice-a', subTotal: 10 },
        { id: 'invoice-b', subTotal: 1.0001 },
      ],
      [
        { quantity: 1, unitCost: 2, purchaseInvoice: { id: 'invoice-a' } },
        { quantity: 1, unitCost: 0.0001, purchaseInvoice: { id: 'invoice-b' } },
        { quantity: 1, unitCost: 8, purchaseInvoice: { id: 'not-listed' } },
      ],
    );

    assert.deepEqual(balances.get('invoice-a'), {
      matchedAmount: 2,
      remainingAmount: 8,
      overMatched: false,
    });
    assert.equal(balances.get('invoice-b'), null);
  });
});
