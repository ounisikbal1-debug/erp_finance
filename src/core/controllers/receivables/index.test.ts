import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import { getModuleRoles } from '../../../application/auth';
import { FinanceRequestError } from '../../../application/modules/finance/errors';
import ReceivablesService from '../../../application/modules/receivables/service';
import receivablesRouter from './index';

describe('receivables API', () => {
  it('uses the authenticated entity and rejects malformed cutoff dates', async () => {
    assert.deepEqual(getModuleRoles('receivables'), ['ADMIN', 'FINANCIAL_MANAGER', 'SALES_OFFICER']);
    const app = express();
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-a',
        username: 'sales',
        role: 'SALES_OFFICER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(receivablesRouter);
    const original = Object.getOwnPropertyDescriptor(ReceivablesService, 'getAging');
    const calls: Array<{ entityId: string; asOf: unknown }> = [];
    Object.defineProperty(ReceivablesService, 'getAging', {
      configurable: true,
      value: async (entityId: string, asOf: unknown) => {
        calls.push({ entityId, asOf });
        if (asOf === '2026-02-30') {
          throw new FinanceRequestError('La date d’arrêté doit être une date calendaire valide.', 400);
        }
        return { entity: { name: 'SAFE TN' }, asOf, totals: { outstanding: 100 } };
      },
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}/aging`;
      const report = await fetch(`${base}?asOf=2026-03-31`);
      assert.equal(report.status, 200);
      assert.deepEqual(await report.json(), {
        entity: { name: 'SAFE TN' },
        asOf: '2026-03-31',
        totals: { outstanding: 100 },
      });
      const crossEntity = await fetch(`${base}?asOf=2026-03-31&entityId=entity-b`);
      assert.equal(crossEntity.status, 403);
      const invalid = await fetch(`${base}?asOf=2026-02-30`);
      assert.equal(invalid.status, 400);
      assert.deepEqual(calls, [
        { entityId: 'entity-a', asOf: '2026-03-31' },
        { entityId: 'entity-a', asOf: '2026-02-30' },
      ]);
    } finally {
      if (original) Object.defineProperty(ReceivablesService, 'getAging', original);
      else Reflect.deleteProperty(ReceivablesService, 'getAging');
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
