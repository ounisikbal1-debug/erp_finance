import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import ControllingService from '../service';
import router from './index';

describe('controlling API', () => {
  it('scopes reads and cost center changes to the authenticated entity', async () => {
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'manager-1',
        username: 'manager',
        role: 'FINANCIAL_MANAGER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(router);
    const server = createServer(app);
    const originals = new Map<string, PropertyDescriptor | undefined>();
    const calls: Array<{ operation: string; entityId?: string; period?: string }> = [];
    const stub = (name: 'getCostCenterAnalytics' | 'createCostCenter' | 'updateCostCenter', value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(ControllingService, name);
      originals.set(name, original);
      Object.defineProperty(ControllingService, name, { configurable: true, value });
    };
    stub('getCostCenterAnalytics', async (entityId: string, period: string) => {
      calls.push({ operation: 'analytics', entityId, period });
      return [];
    });
    stub('createCostCenter', async (_input: unknown, entityId: string) => {
      calls.push({ operation: 'create', entityId });
      return { code: 'CC-OPS' };
    });
    stub('updateCostCenter', async (code: string, _input: unknown, entityId: string) => {
      calls.push({ operation: 'update', entityId });
      return { code };
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const analytics = await fetch(`http://127.0.0.1:${address.port}/analytics?period=2026-10`);
      assert.equal(analytics.status, 200);
      const created = await fetch(`http://127.0.0.1:${address.port}/cost-centers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'CC-OPS', name: 'Ops', department: 'Ops' }),
      });
      assert.equal(created.status, 201);
      const updated = await fetch(`http://127.0.0.1:${address.port}/cost-centers/CC-OPS`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Opérations', department: 'Logistique' }),
      });
      assert.equal(updated.status, 200);
      const forbidden = await fetch(`http://127.0.0.1:${address.port}/cost-centers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', code: 'CC-OPS', name: 'Ops', department: 'Ops' }),
      });
      assert.equal(forbidden.status, 403);
      assert.deepEqual(calls, [
        { operation: 'analytics', entityId: 'entity-a', period: '2026-10' },
        { operation: 'create', entityId: 'entity-a' },
        { operation: 'update', entityId: 'entity-a' },
      ]);
    } finally {
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(ControllingService, name, descriptor);
        else Reflect.deleteProperty(ControllingService, name);
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
