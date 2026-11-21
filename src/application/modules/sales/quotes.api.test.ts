import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import salesRouter from './api';
import SalesService from './service';

describe('sales quote API entity scope', () => {
  it('uses the authenticated entity and actor for draft quote routes', async () => {
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
    const originalList = Object.getOwnPropertyDescriptor(SalesService, 'listQuotes');
    const originalCreate = Object.getOwnPropertyDescriptor(SalesService, 'createQuote');
    const originalUpdate = Object.getOwnPropertyDescriptor(SalesService, 'updateQuote');
    const originalConvert = Object.getOwnPropertyDescriptor(SalesService, 'convertQuoteToInvoice');
    const originalConvertToOrder = Object.getOwnPropertyDescriptor(SalesService, 'convertQuoteToOrder');
    const listCalls: unknown[][] = [];
    const createCalls: unknown[][] = [];
    const updateCalls: unknown[][] = [];
    const convertCalls: unknown[][] = [];
    const convertToOrderCalls: unknown[][] = [];
    Object.defineProperty(SalesService, 'listQuotes', {
      configurable: true,
      value: async (...args: unknown[]) => { listCalls.push(args); return []; },
    });
    Object.defineProperty(SalesService, 'createQuote', {
      configurable: true,
      value: async (...args: unknown[]) => {
        createCalls.push(args);
        return { id: 'quote-a', quoteNumber: 'DEV-2026-TEST' };
      },
    });
    Object.defineProperty(SalesService, 'updateQuote', {
      configurable: true,
      value: async (...args: unknown[]) => {
        updateCalls.push(args);
        return { id: 'quote-a', status: 'DRAFT' };
      },
    });
    Object.defineProperty(SalesService, 'convertQuoteToInvoice', {
      configurable: true,
      value: async (...args: unknown[]) => {
        convertCalls.push(args);
        return { id: 'invoice-a', status: 'TO_REVIEW' };
      },
    });
    Object.defineProperty(SalesService, 'convertQuoteToOrder', {
      configurable: true,
      value: async (...args: unknown[]) => {
        convertToOrderCalls.push(args);
        return { id: 'order-a', orderNumber: 'CMD-2026-TEST' };
      },
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');

      const forbiddenList = await fetch(`http://127.0.0.1:${address.port}/quotes?entityId=entity-b`);
      assert.equal(forbiddenList.status, 403);
      assert.deepEqual(listCalls, []);

      const list = await fetch(`http://127.0.0.1:${address.port}/quotes`);
      assert.equal(list.status, 200);
      assert.deepEqual(await list.json(), []);
      assert.deepEqual(listCalls, [['entity-a']]);

      const forbiddenCreate = await fetch(`http://127.0.0.1:${address.port}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', customerId: 'customer-b', items: [] }),
      });
      assert.equal(forbiddenCreate.status, 403);
      assert.deepEqual(createCalls, []);

      const created = await fetch(`http://127.0.0.1:${address.port}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-a', customerId: 'customer-a', items: [] }),
      });
      assert.equal(created.status, 201);
      assert.deepEqual(await created.json(), { id: 'quote-a', quoteNumber: 'DEV-2026-TEST' });
      assert.deepEqual(createCalls, [[
        { entityId: 'entity-a', customerId: 'customer-a', items: [] },
        { id: 'user-a', username: 'sales-a' },
      ]]);
      const updated = await fetch(`http://127.0.0.1:${address.port}/quotes/quote-a`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-a', customerId: 'customer-a', items: [] }),
      });
      assert.equal(updated.status, 200);
      assert.deepEqual(updateCalls, [[
        'quote-a',
        { entityId: 'entity-a', customerId: 'customer-a', items: [] },
        'entity-a',
      ]]);
      const forbiddenUpdate = await fetch(`http://127.0.0.1:${address.port}/quotes/quote-a`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', customerId: 'customer-a', items: [] }),
      });
      assert.equal(forbiddenUpdate.status, 403);
      assert.equal(updateCalls.length, 1);
      const conversion = await fetch(`http://127.0.0.1:${address.port}/quotes/quote-a/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId: 'entity-a',
          acceptanceConfirmed: true,
          acceptanceNote: 'Bon de commande BC-42',
        }),
      });
      assert.equal(conversion.status, 201);
      assert.deepEqual(await conversion.json(), { id: 'invoice-a', status: 'TO_REVIEW' });
      assert.deepEqual(convertCalls, [[
        'quote-a',
        { entityId: 'entity-a', acceptanceConfirmed: true, acceptanceNote: 'Bon de commande BC-42' },
        'entity-a',
        { id: 'user-a', username: 'sales-a' },
      ]]);
      const forbiddenConversion = await fetch(`http://127.0.0.1:${address.port}/quotes/quote-a/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', acceptanceConfirmed: true }),
      });
      assert.equal(forbiddenConversion.status, 403);
      assert.equal(convertCalls.length, 1);
      const orderConversion = await fetch(`http://127.0.0.1:${address.port}/quotes/quote-a/convert-to-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId: 'entity-a',
          acceptanceConfirmed: true,
          acceptanceNote: 'Bon de commande BC-42',
          itemMappings: [{ position: 0, materialId: 'material-a' }],
        }),
      });
      assert.equal(orderConversion.status, 201);
      assert.deepEqual(await orderConversion.json(), { id: 'order-a', orderNumber: 'CMD-2026-TEST' });
      assert.deepEqual(convertToOrderCalls, [[
        'quote-a',
        {
          entityId: 'entity-a',
          acceptanceConfirmed: true,
          acceptanceNote: 'Bon de commande BC-42',
          itemMappings: [{ position: 0, materialId: 'material-a' }],
        },
        'entity-a',
        { id: 'user-a', username: 'sales-a' },
      ]]);
      const forbiddenOrderConversion = await fetch(`http://127.0.0.1:${address.port}/quotes/quote-a/convert-to-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', acceptanceConfirmed: true }),
      });
      assert.equal(forbiddenOrderConversion.status, 403);
      assert.equal(convertToOrderCalls.length, 1);
    } finally {
      if (originalList) Object.defineProperty(SalesService, 'listQuotes', originalList);
      else Reflect.deleteProperty(SalesService, 'listQuotes');
      if (originalCreate) Object.defineProperty(SalesService, 'createQuote', originalCreate);
      else Reflect.deleteProperty(SalesService, 'createQuote');
      if (originalUpdate) Object.defineProperty(SalesService, 'updateQuote', originalUpdate);
      else Reflect.deleteProperty(SalesService, 'updateQuote');
      if (originalConvert) Object.defineProperty(SalesService, 'convertQuoteToInvoice', originalConvert);
      else Reflect.deleteProperty(SalesService, 'convertQuoteToInvoice');
      if (originalConvertToOrder) Object.defineProperty(SalesService, 'convertQuoteToOrder', originalConvertToOrder);
      else Reflect.deleteProperty(SalesService, 'convertQuoteToOrder');
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
