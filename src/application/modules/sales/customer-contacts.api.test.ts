import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import salesRouter from './api';
import SalesService from './service';

describe('customer contact audit API scope', () => {
  it('uses the authenticated company and actor for contact edits and history', async () => {
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
    const originalUpdate = Object.getOwnPropertyDescriptor(SalesService, 'updateCustomerContacts');
    const originalHistory = Object.getOwnPropertyDescriptor(SalesService, 'listCustomerContactHistory');
    const originalScore = Object.getOwnPropertyDescriptor(SalesService, 'getCustomerScore');
    const updateCalls: unknown[][] = [];
    const historyCalls: unknown[][] = [];
    const scoreCalls: unknown[][] = [];
    Object.defineProperty(SalesService, 'updateCustomerContacts', {
      configurable: true,
      value: async (...args: unknown[]) => { updateCalls.push(args); return { id: 'customer-a', email: 'new@example.test' }; },
    });
    Object.defineProperty(SalesService, 'listCustomerContactHistory', {
      configurable: true,
      value: async (...args: unknown[]) => { historyCalls.push(args); return []; },
    });
    Object.defineProperty(SalesService, 'getCustomerScore', {
      configurable: true,
      value: async (...args: unknown[]) => {
        scoreCalls.push(args);
        return { score: 82, isCurrent: true };
      },
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');

      const forbiddenUpdate = await fetch(`http://127.0.0.1:${address.port}/customers/customer-a/contacts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', email: 'foreign@example.test' }),
      });
      assert.equal(forbiddenUpdate.status, 403);
      assert.deepEqual(updateCalls, []);

      const update = await fetch(`http://127.0.0.1:${address.port}/customers/customer-a/contacts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-a', email: 'new@example.test' }),
      });
      assert.equal(update.status, 200);
      assert.deepEqual(updateCalls, [[
        'customer-a',
        { entityId: 'entity-a', email: 'new@example.test' },
        'entity-a',
        { id: 'user-a', username: 'sales-a' },
      ]]);

      const forbiddenHistory = await fetch(`http://127.0.0.1:${address.port}/customers/customer-a/contact-history?entityId=entity-b`);
      assert.equal(forbiddenHistory.status, 403);
      assert.deepEqual(historyCalls, []);

      const history = await fetch(`http://127.0.0.1:${address.port}/customers/customer-a/contact-history`);
      assert.equal(history.status, 200);
      assert.deepEqual(await history.json(), []);
      assert.deepEqual(historyCalls, [['customer-a', 'entity-a']]);

      const forbiddenScore = await fetch(`http://127.0.0.1:${address.port}/customers/customer-a/score?entityId=entity-b`);
      assert.equal(forbiddenScore.status, 403);
      assert.deepEqual(scoreCalls, []);

      const score = await fetch(`http://127.0.0.1:${address.port}/customers/customer-a/score`);
      assert.equal(score.status, 200);
      assert.deepEqual(await score.json(), { score: 82, isCurrent: true });
      assert.deepEqual(scoreCalls, [['customer-a', 'entity-a']]);
    } finally {
      if (originalUpdate) Object.defineProperty(SalesService, 'updateCustomerContacts', originalUpdate);
      else Reflect.deleteProperty(SalesService, 'updateCustomerContacts');
      if (originalHistory) Object.defineProperty(SalesService, 'listCustomerContactHistory', originalHistory);
      else Reflect.deleteProperty(SalesService, 'listCustomerContactHistory');
      if (originalScore) Object.defineProperty(SalesService, 'getCustomerScore', originalScore);
      else Reflect.deleteProperty(SalesService, 'getCustomerScore');
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
