import assert from 'node:assert/strict';
import test from 'node:test';
import { PurchaseRequestError } from './errors';
import { validatePurchaseOrderInput, validatePurchaseOrderNote } from './order';

const validOrder = {
  orderNumber: 'PO-2026-001',
  vendorId: 'vendor-1',
  currencyCode: 'TND',
  expectedAt: '2026-12-01',
  description: 'Réapprovisionnement planifié',
  lines: [
    { description: 'Matière première', materialId: 'material-1', quantity: 3, unitPrice: 12.345 },
  ],
};

test('validates purchase order header and line values', () => {
  assert.deepEqual(validatePurchaseOrderInput(validOrder), validOrder);
  assert.equal(validatePurchaseOrderNote('Contrôle conforme'), 'Contrôle conforme');
});

test('rejects invalid dates, over-precise quantities, and non-millime prices', () => {
  for (const invalid of [
    { ...validOrder, expectedAt: '2026-02-30' },
    { ...validOrder, lines: [] },
    { ...validOrder, lines: [{ ...validOrder.lines[0], quantity: 1.0001 }] },
    { ...validOrder, lines: [{ ...validOrder.lines[0], unitPrice: 12.3456 }] },
  ]) {
    assert.throws(() => validatePurchaseOrderInput(invalid), PurchaseRequestError);
  }
});

test('supports fractional quantities for measured purchase-order lines', () => {
  const order = validatePurchaseOrderInput({
    ...validOrder,
    lines: [{ ...validOrder.lines[0], quantity: 1.5, unitPrice: 10 }],
  });
  assert.equal(order.lines[0].quantity, 1.5);
});

test('requires a separate auditable workflow note', () => {
  assert.throws(() => validatePurchaseOrderNote('bref'), PurchaseRequestError);
});
