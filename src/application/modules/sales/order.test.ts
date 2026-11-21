import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SalesRequestError } from './errors';
import {
  validateSalesOrderInput,
  validateSalesOrderInvoiceInput,
  validateSalesOrderPickInput,
} from './order';

describe('sales order validation', () => {
  it('accepts article-linked order lines with stock precision and millime prices', () => {
    assert.deepEqual(validateSalesOrderInput({
      customerId: ' customer-1 ',
      lines: [{ materialId: ' material-1 ', quantity: 1.25, unitPrice: 10.001 }],
    }), {
      customerId: 'customer-1',
      lines: [{ materialId: 'material-1', quantity: 1.25, unitPrice: 10.001, totalAmount: 12.501 }],
    });
  });

  it('accepts only a UUID idempotency key for retried offline orders', () => {
    const idempotencyKey = '39dc9878-89e2-4c97-9105-24ed8fe51fe7';
    assert.equal(validateSalesOrderInput({
      customerId: 'customer-1',
      idempotencyKey,
      lines: [{ materialId: 'material-1', quantity: 1, unitPrice: 10 }],
    }).idempotencyKey, idempotencyKey);
    assert.throws(() => validateSalesOrderInput({
      customerId: 'customer-1',
      idempotencyKey: 'not-a-uuid',
      lines: [{ materialId: 'material-1', quantity: 1, unitPrice: 10 }],
    }), /clé d’idempotence/);
  });

  it('rejects empty orders, invalid articles, quantities, prices, and unsafe totals', () => {
    assert.throws(() => validateSalesOrderInput({ customerId: 'customer-1', lines: [] }), SalesRequestError);
    assert.throws(() => validateSalesOrderInput({
      customerId: 'customer-1', lines: [{ materialId: '', quantity: 1, unitPrice: 10 }],
    }), /article/);
    assert.throws(() => validateSalesOrderInput({
      customerId: 'customer-1', lines: [{ materialId: 'material-1', quantity: 0.0001, unitPrice: 10 }],
    }), /quantité/);
    assert.throws(() => validateSalesOrderInput({
      customerId: 'customer-1', lines: [{ materialId: 'material-1', quantity: 1, unitPrice: 10.0001 }],
    }), /millime/);
  });

  it('requires exactly one warehouse selection per sales-order line', () => {
    assert.deepEqual(validateSalesOrderPickInput({
      lines: [{ salesOrderLineId: 'line-1', warehouseId: 'warehouse-1' }],
    }), { lines: [{ salesOrderLineId: 'line-1', warehouseId: 'warehouse-1' }] });
    assert.throws(() => validateSalesOrderPickInput({
      lines: [
        { salesOrderLineId: 'line-1', warehouseId: 'warehouse-1' },
        { salesOrderLineId: 'line-1', warehouseId: 'warehouse-2' },
      ],
    }), /une seule fois/);
    assert.throws(() => validateSalesOrderPickInput({ lines: [] }), /dépôt/);
  });

  it('requires a valid tax rate exactly once for every invoiced order line', () => {
    assert.deepEqual(validateSalesOrderInvoiceInput({
      lines: [
        { salesOrderLineId: 'line-1', taxRate: 19 },
        { salesOrderLineId: 'line-2', taxRate: 0 },
      ],
    }), {
      lines: [
        { salesOrderLineId: 'line-1', taxRate: 19 },
        { salesOrderLineId: 'line-2', taxRate: 0 },
      ],
    });
    assert.throws(() => validateSalesOrderInvoiceInput({ lines: [] }), /taux de TVA/);
    assert.throws(() => validateSalesOrderInvoiceInput({
      lines: [{ salesOrderLineId: 'line-1', taxRate: 101 }],
    }), /taux de TVA configuré/);
    assert.throws(() => validateSalesOrderInvoiceInput({
      lines: [
        { salesOrderLineId: 'line-1', taxRate: 19 },
        { salesOrderLineId: 'line-1', taxRate: 20 },
      ],
    }), /une seule fois/);
  });
});
