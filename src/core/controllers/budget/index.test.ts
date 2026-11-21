import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import { getModuleRoles } from '../../../application/auth';
import BudgetService from '../../../application/modules/budget/service';
import budgetRouter from './index';

describe('budget API', () => {
  it('limits data and draft creation to the authenticated entity and requires a distinct approver', async () => {
    assert.deepEqual(getModuleRoles('budget'), ['ADMIN', 'FINANCIAL_MANAGER']);
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'creator',
        username: 'manager',
        role: 'FINANCIAL_MANAGER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(budgetRouter);
    const server = createServer(app);
    const originals = new Map<string, PropertyDescriptor | undefined>();
    const calls: Array<{ operation: string; entityId: string; userId?: string }> = [];
    const stub = (
      name: 'getModuleData' | 'getAnnualForecast' | 'createDraftLine' | 'approveLine' | 'updateDraftAmount' | 'createRevision',
      value: unknown,
    ) => {
      const original = Object.getOwnPropertyDescriptor(BudgetService, name);
      originals.set(name, original);
      Object.defineProperty(BudgetService, name, { configurable: true, value });
    };
    stub('getModuleData', async (entityId: string) => {
      calls.push({ operation: 'read', entityId });
      return { period: '2026-10', lines: [] };
    });
    stub('getAnnualForecast', async (entityId: string, asOfPeriod: string) => {
      calls.push({ operation: `forecast-${asOfPeriod}`, entityId });
      return { year: 2026, asOfPeriod };
    });
    stub('createDraftLine', async (_input: unknown, entityId: string, userId: string) => {
      calls.push({ operation: 'create', entityId, userId });
      return { id: 'line-1' };
    });
    stub('approveLine', async (_id: string, entityId: string, userId: string) => {
      calls.push({ operation: 'approve', entityId, userId });
      return { id: 'line-1', status: 'APPROVED' };
    });
    stub('updateDraftAmount', async (_id: string, entityId: string, _input: unknown) => {
      calls.push({ operation: 'update', entityId });
      return { id: 'line-1', amount: 12 };
    });
    stub('createRevision', async (_id: string, entityId: string, _input: unknown, userId: string) => {
      calls.push({ operation: 'revision', entityId, userId });
      return { id: 'line-2', status: 'DRAFT', revisionNumber: 2 };
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');

      const read = await fetch(`http://127.0.0.1:${address.port}/data?period=2026-10`);
      assert.equal(read.status, 200);
      const forbidden = await fetch(`http://127.0.0.1:${address.port}/data?period=2026-10&entityId=entity-b`);
      assert.equal(forbidden.status, 403);
      const forecast = await fetch(`http://127.0.0.1:${address.port}/annual-forecast?asOfPeriod=2026-10`);
      assert.equal(forecast.status, 200);
      assert.deepEqual(await forecast.json(), { year: 2026, asOfPeriod: '2026-10' });
      const forbiddenForecast = await fetch(`http://127.0.0.1:${address.port}/annual-forecast?asOfPeriod=2026-10&entityId=entity-b`);
      assert.equal(forbiddenForecast.status, 403);
      const created = await fetch(`http://127.0.0.1:${address.port}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b' }),
      });
      assert.equal(created.status, 403);
      const approved = await fetch(`http://127.0.0.1:${address.port}/lines/line-1/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(approved.status, 200);
      const updated = await fetch(`http://127.0.0.1:${address.port}/lines/line-1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 12 }),
      });
      assert.equal(updated.status, 200);
      const forbiddenUpdate = await fetch(`http://127.0.0.1:${address.port}/lines/line-1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', amount: 12 }),
      });
      assert.equal(forbiddenUpdate.status, 403);
      const revision = await fetch(`http://127.0.0.1:${address.port}/lines/line-1/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 15, reason: 'Actualisation budget' }),
      });
      assert.equal(revision.status, 201);
      assert.deepEqual(await revision.json(), { id: 'line-2', status: 'DRAFT', revisionNumber: 2 });
      const forbiddenRevision = await fetch(`http://127.0.0.1:${address.port}/lines/line-1/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', amount: 15, reason: 'Actualisation budget' }),
      });
      assert.equal(forbiddenRevision.status, 403);
      assert.deepEqual(calls, [
        { operation: 'read', entityId: 'entity-a' },
        { operation: 'forecast-2026-10', entityId: 'entity-a' },
        { operation: 'approve', entityId: 'entity-a', userId: 'creator' },
        { operation: 'update', entityId: 'entity-a' },
        { operation: 'revision', entityId: 'entity-a', userId: 'creator' },
      ]);
    } finally {
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(BudgetService, name, descriptor);
        else Reflect.deleteProperty(BudgetService, name);
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
