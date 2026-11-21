import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  matchesStockReceipt,
  matchesStockPick,
  matchesStockSupplierReturn,
  matchesStockTransfer,
  validateStockReceiptInput,
  validateStockPickInput,
  validateStockDispatchInput,
  validateStockSupplierReturnInput,
  validateStockTransferInput,
  validateWarehouseInput,
} from './warehouse-validation';

describe('stock warehouse and transfer validation', () => {
  it('normalizes warehouse identity fields', () => {
    assert.deepEqual(validateWarehouseInput({ code: ' WH-1 ', name: ' Dépôt central ' }), {
      code: 'WH-1',
      name: 'Dépôt central',
    });
    assert.throws(() => validateWarehouseInput({ code: '', name: 'Dépôt' }));
  });

  it('validates transfer endpoints, positive quantity, reason, and idempotency key', () => {
    const transfer = validateStockTransferInput({
      materialId: 'material-1',
      purchaseInvoiceLineId: 'line-1',
      sourceWarehouseId: null,
      destinationWarehouseId: 'warehouse-1',
      quantity: 3,
      reason: 'Réapprovisionnement dépôt',
      idempotencyKey: 'request-unique-001',
    });
    assert.equal(transfer.sourceWarehouseId, null);
    assert.equal(transfer.quantity, 3);
    assert.equal(validateStockTransferInput({ ...transfer, quantity: 0.125 }).quantity, 0.125);
    assert.equal(matchesStockTransfer(transfer, { ...transfer }), true);
    assert.equal(matchesStockTransfer(transfer, { ...transfer, quantity: 4 }), false);
    assert.throws(() => validateStockTransferInput({
      ...transfer,
      sourceWarehouseId: 'warehouse-1',
    }), /différents/);
    assert.throws(() => validateStockTransferInput({ ...transfer, quantity: 0 }));
    assert.throws(() => validateStockTransferInput({ ...transfer, reason: 'x' }));
  });

  it('validates costed order or invoice receipts and detects idempotent retries', () => {
    const receipt = validateStockReceiptInput({
      materialId: 'material-1',
      purchaseInvoiceId: 'purchase-invoice-1',
      warehouseId: 'warehouse-1',
      quantity: 3,
      unitCost: 12.345,
      reason: 'Réception document fournisseur BL-1',
      idempotencyKey: 'receipt-request-001',
    });
    assert.equal(matchesStockReceipt(receipt, { ...receipt }), true);
    assert.equal(matchesStockReceipt(receipt, { ...receipt, purchaseInvoiceLineId: 'line-1' }), false);
    assert.equal(matchesStockReceipt(receipt, { ...receipt, unitCost: 13 }), false);
    assert.equal(validateStockReceiptInput({ ...receipt, quantity: 1.5 }).quantity, 1.5);
    assert.throws(() => validateStockReceiptInput({ ...receipt, quantity: 1.0001 }), /trois décimales/);
    assert.throws(() => validateStockReceiptInput({ ...receipt, unitCost: -1 }), /coût unitaire/);
    assert.throws(() => validateStockReceiptInput({ ...receipt, reason: 'x' }));
    const orderReceipt = validateStockReceiptInput({
      ...receipt,
      purchaseOrderLineId: 'purchase-order-line-1',
      purchaseInvoiceId: null,
    });
    assert.equal(orderReceipt.purchaseInvoiceId, null);
    assert.throws(
      () => validateStockReceiptInput({ ...receipt, purchaseInvoiceId: null }),
      /commande ou une facture fournisseur/,
    );
    assert.throws(
      () => validateStockReceiptInput({
        ...receipt,
        purchaseOrderLineId: 'purchase-order-line-1',
        purchaseInvoiceId: null,
        purchaseInvoiceLineId: 'line-1',
      }),
      /sans facture fournisseur/,
    );
  });

  it('validates source-receipt returns and idempotent retries', () => {
    const returned = validateStockSupplierReturnInput({
      sourceReceiptId: 'receipt-1',
      quantity: 2,
      reason: 'Retour article endommagé',
      idempotencyKey: 'return-once-1',
    });
    assert.equal(matchesStockSupplierReturn(returned, { ...returned }), true);
    assert.equal(matchesStockSupplierReturn(returned, { ...returned, quantity: 1 }), false);
    assert.equal(validateStockSupplierReturnInput({ ...returned, quantity: 1.5 }).quantity, 1.5);
    assert.throws(() => validateStockSupplierReturnInput({ ...returned, quantity: 1.0001 }), /trois décimales/);
    assert.throws(() => validateStockSupplierReturnInput({ ...returned, reason: 'x' }));
  });

  it('validates non-posting pick lists and idempotent dispatch keys', () => {
    const pick = validateStockPickInput({
      reference: 'DELIVERY-001',
      reason: 'Préparation commande client',
      idempotencyKey: 'pick-request-001',
      lines: [
        { materialId: 'material-1', warehouseId: 'warehouse-1', quantity: 1.25 },
        { materialId: 'material-2', warehouseId: 'warehouse-1', quantity: 2 },
      ],
    });
    assert.equal(matchesStockPick({ ...pick }, pick), true);
    assert.deepEqual(validateStockDispatchInput({ idempotencyKey: 'dispatch-request-001' }), {
      idempotencyKey: 'dispatch-request-001',
    });
    assert.throws(() => validateStockPickInput({
      ...pick,
      lines: [pick.lines[0], pick.lines[0]],
    }), /ne peuvent apparaître qu’une fois/);
    assert.throws(() => validateStockPickInput({ ...pick, lines: [] }), /1 à 100 lignes/);
    assert.throws(() => validateStockDispatchInput({ idempotencyKey: '' }), /obligatoire/);
  });
});
