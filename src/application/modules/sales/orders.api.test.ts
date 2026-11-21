import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import SalesService from './service';
import salesRouter from './api';

describe('sales order API entity scope', () => {
  it('uses the authenticated entity and actor for order, pick, dispatch, and cancellation routes', async () => {
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-a',
        username: 'sales-a',
        role: 'SALES_OFFICER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(salesRouter);
    const server = createServer(app);
    const originals = new Map<string, PropertyDescriptor | undefined>();
    const calls: Array<{ method: string; args: unknown[] }> = [];
    let invoiceCreated = true;
    const stub = (method: string, value: (...args: unknown[]) => unknown) => {
      const original = Object.getOwnPropertyDescriptor(SalesService, method);
      originals.set(method, original);
      Object.defineProperty(SalesService, method, { configurable: true, value });
    };
    stub('listSalesOrders', async (...args) => { calls.push({ method: 'listSalesOrders', args }); return []; });
    stub('createSalesOrder', async (...args) => { calls.push({ method: 'createSalesOrder', args }); return { id: 'order-a' }; });
    stub('createSalesOrderStockPick', async (...args) => { calls.push({ method: 'createSalesOrderStockPick', args }); return { id: 'pick-a' }; });
    stub('dispatchSalesOrder', async (...args) => { calls.push({ method: 'dispatchSalesOrder', args }); return { id: 'dispatch-a' }; });
    stub('convertSalesOrderToInvoice', async (...args) => {
      calls.push({ method: 'convertSalesOrderToInvoice', args });
      const created = invoiceCreated;
      invoiceCreated = false;
      return { invoice: { id: 'invoice-a' }, created };
    });
    stub('cancelSalesOrder', async (...args) => { calls.push({ method: 'cancelSalesOrder', args }); return { id: 'order-a', status: 'CANCELLED' }; });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');

      const forbiddenList = await fetch(`http://127.0.0.1:${address.port}/orders?entityId=entity-b`);
      assert.equal(forbiddenList.status, 403);
      assert.deepEqual(calls, []);

      const list = await fetch(`http://127.0.0.1:${address.port}/orders`);
      assert.equal(list.status, 200);
      assert.deepEqual(await list.json(), []);
      assert.deepEqual(calls[0], { method: 'listSalesOrders', args: ['entity-a'] });

      const forbiddenCreate = await fetch(`http://127.0.0.1:${address.port}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b' }),
      });
      assert.equal(forbiddenCreate.status, 403);
      assert.equal(calls.length, 1);

      const created = await fetch(`http://127.0.0.1:${address.port}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-a', customerId: 'customer-a', lines: [] }),
      });
      assert.equal(created.status, 201);
      assert.deepEqual(calls[1], {
        method: 'createSalesOrder',
        args: [
          { entityId: 'entity-a', customerId: 'customer-a', lines: [] },
          'entity-a',
          { id: 'user-a', username: 'sales-a' },
        ],
      });

      const pick = await fetch(`http://127.0.0.1:${address.port}/orders/order-a/stock-pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-a', lines: [{ salesOrderLineId: 'line-a', warehouseId: 'warehouse-a' }] }),
      });
      assert.equal(pick.status, 201);
      assert.deepEqual(calls[2], {
        method: 'createSalesOrderStockPick',
        args: [
          'order-a',
          { entityId: 'entity-a', lines: [{ salesOrderLineId: 'line-a', warehouseId: 'warehouse-a' }] },
          'entity-a',
          { id: 'user-a', username: 'sales-a' },
        ],
      });

      const dispatched = await fetch(`http://127.0.0.1:${address.port}/orders/order-a/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-a' }),
      });
      assert.equal(dispatched.status, 201);
      assert.deepEqual(calls[3], {
        method: 'dispatchSalesOrder',
        args: ['order-a', 'entity-a', { id: 'user-a', username: 'sales-a' }],
      });

      const forbiddenInvoice = await fetch(`http://127.0.0.1:${address.port}/orders/order-a/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', lines: [{ salesOrderLineId: 'line-a', taxRate: 19 }] }),
      });
      assert.equal(forbiddenInvoice.status, 403);
      assert.equal(calls.length, 4);

      const invoiced = await fetch(`http://127.0.0.1:${address.port}/orders/order-a/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-a', lines: [{ salesOrderLineId: 'line-a', taxRate: 19 }] }),
      });
      assert.equal(invoiced.status, 201);
      assert.deepEqual(await invoiced.json(), { id: 'invoice-a' });
      assert.deepEqual(calls[4], {
        method: 'convertSalesOrderToInvoice',
        args: [
          'order-a',
          { entityId: 'entity-a', lines: [{ salesOrderLineId: 'line-a', taxRate: 19 }] },
          'entity-a',
          { id: 'user-a', username: 'sales-a' },
        ],
      });
      const repeatedInvoice = await fetch(`http://127.0.0.1:${address.port}/orders/order-a/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-a' }),
      });
      assert.equal(repeatedInvoice.status, 200);
      assert.deepEqual(await repeatedInvoice.json(), { id: 'invoice-a' });

      const cancelled = await fetch(`http://127.0.0.1:${address.port}/orders/order-a/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-a' }),
      });
      assert.equal(cancelled.status, 200);
      assert.deepEqual(await cancelled.json(), { id: 'order-a', status: 'CANCELLED' });
      assert.deepEqual(calls[6], {
        method: 'cancelSalesOrder',
        args: ['order-a', 'entity-a', { id: 'user-a', username: 'sales-a' }],
      });
    } finally {
      for (const [method, original] of originals) {
        if (original) Object.defineProperty(SalesService, method, original);
        else Reflect.deleteProperty(SalesService, method);
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
