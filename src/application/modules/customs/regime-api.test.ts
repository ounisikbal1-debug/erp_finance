import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import { getModuleRoles } from '../../auth';
import { createCustomsRegimeRouter, type CustomsRegimeApiService } from './regime-api';

describe('customs regime API', () => {
  it('scopes regime, stock, and bond operations to the authenticated entity', async () => {
    assert.deepEqual(getModuleRoles('customs-regimes'), ['ADMIN', 'FINANCIAL_MANAGER', 'LOGISTICS_MGR']);
    const calls: Array<[string, string]> = [];
    const service: CustomsRegimeApiService = {
      async list(entityId) { calls.push(['list', entityId]); return []; },
      async createRegime(entityId) { calls.push(['create', entityId]); return {}; },
      async updateRegimeStatus(entityId) { calls.push(['status', entityId]); return {}; },
      async createStockSheet(entityId) { calls.push(['sheet', entityId]); return {}; },
      async addStockMovement(entityId) { calls.push(['movement', entityId]); return {}; },
      async createBond(entityId) { calls.push(['bond', entityId]); return {}; },
      async releaseBond(entityId) { calls.push(['release', entityId]); return {}; },
    };
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-a',
        username: 'logistics',
        role: 'LOGISTICS_MGR',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(createCustomsRegimeRouter(service));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      assert.equal((await fetch(`${base}/`)).status, 200);
      assert.equal((await fetch(`${base}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'spoofed' }),
      })).status, 201);
      assert.equal((await fetch(`${base}/regime-1/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACTIVE' }),
      })).status, 200);
      assert.equal((await fetch(`${base}/regime-1/stock-sheets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })).status, 201);
      assert.equal((await fetch(`${base}/stock-sheets/sheet-1/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })).status, 201);
      assert.equal((await fetch(`${base}/regime-1/bonds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })).status, 201);
      assert.equal((await fetch(`${base}/regime-1/bonds/bond-1/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })).status, 200);
      assert.deepEqual(calls, [
        ['list', 'entity-a'],
        ['create', 'entity-a'],
        ['status', 'entity-a'],
        ['sheet', 'entity-a'],
        ['movement', 'entity-a'],
        ['bond', 'entity-a'],
        ['release', 'entity-a'],
      ]);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
