import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildOfflineSalesOrderPayload } from './offline-order-form';

describe('offline sales-order form', () => {
  it('builds the minimal payload accepted by the authenticated sales-order API', () => {
    assert.deepEqual(buildOfflineSalesOrderPayload({
      customerId: ' customer-1 ',
      lines: [
        { materialId: 'material-1', quantity: '2.5', unitPrice: '12.345' },
        { materialId: 'material-2', quantity: 1, unitPrice: 0 },
      ],
    }), {
      customerId: 'customer-1',
      lines: [
        { materialId: 'material-1', quantity: 2.5, unitPrice: 12.345 },
        { materialId: 'material-2', quantity: 1, unitPrice: 0 },
      ],
    });
  });

  it('rejects missing customers, empty or oversized orders, and invalid quantity or price', () => {
    assert.throws(() => buildOfflineSalesOrderPayload({ customerId: '', lines: [{ materialId: 'm', quantity: 1, unitPrice: 1 }] }), /client/);
    assert.throws(() => buildOfflineSalesOrderPayload({ customerId: 'c', lines: [] }), /1 à 100/);
    assert.throws(() => buildOfflineSalesOrderPayload({ customerId: 'c', lines: [{ materialId: 'm', quantity: 0, unitPrice: 1 }] }), /Vérifiez chaque ligne/);
    assert.throws(() => buildOfflineSalesOrderPayload({ customerId: 'c', lines: [{ materialId: 'm', quantity: 1, unitPrice: -1 }] }), /Vérifiez chaque ligne/);
    assert.throws(() => buildOfflineSalesOrderPayload({ customerId: 'c', lines: [{ materialId: '', quantity: 1, unitPrice: 1 }] }), /Vérifiez chaque ligne/);
  });
});
