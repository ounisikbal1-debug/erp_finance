import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import { getModuleRoles } from '../../../auth';
import MonthlyCloseService from '../service';
import monthlyCloseRouter from './index';

describe('monthly close API', () => {
  it('protects entity scope, validates period and check updates, and records the authenticated actor', async () => {
    assert.deepEqual(getModuleRoles('monthly-close'), ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT']);
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-a',
        username: 'finance',
        role: 'FINANCIAL_MANAGER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(monthlyCloseRouter);
    const originalGet = Object.getOwnPropertyDescriptor(MonthlyCloseService, 'getChecklist');
    const originalRecord = Object.getOwnPropertyDescriptor(MonthlyCloseService, 'recordCheck');
    const originalLock = Object.getOwnPropertyDescriptor(MonthlyCloseService, 'lockPeriod');
    const recorded: unknown[] = [];
    const locked: unknown[] = [];
    Object.defineProperty(MonthlyCloseService, 'getChecklist', {
      configurable: true,
      value: async (entityId: string, period: unknown) => ({ entityId, period, checks: [], history: [] }),
    });
    Object.defineProperty(MonthlyCloseService, 'recordCheck', {
      configurable: true,
      value: async (input: unknown) => {
        recorded.push(input);
        return { entityId: 'entity-a', period: '2026-03', checks: [], history: [] };
      },
    });
    Object.defineProperty(MonthlyCloseService, 'lockPeriod', {
      configurable: true,
      value: async (input: unknown) => {
        locked.push(input);
        return { entityId: 'entity-a', period: '2026-03', checks: [], history: [], lock: { actorUsername: 'finance' } };
      },
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}/checklist`;
      assert.equal((await fetch(`${base}?period=2026-03`)).status, 200);
      assert.equal((await fetch(`${base}?period=2026-13`)).status, 400);
      assert.equal((await fetch(`${base}?period=2026`)).status, 200);
      assert.equal((await fetch(`${base}?period=2026-03&entityId=entity-b`)).status, 403);
      assert.equal((await fetch(`${base}/2026-03/journal-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked: true, note: 'Écritures revues.' }),
      })).status, 200);
      assert.equal((await fetch(`${base}/2026-03/not-a-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked: true, note: 'Test invalide.' }),
      })).status, 400);
      assert.equal((await fetch(`${base.replace('/checklist', '/periods')}/2026-03/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'Clôture vérifiée par finance.' }),
      })).status, 200);
      assert.equal((await fetch(`${base.replace('/checklist', '/periods')}/2026/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'no' }),
      })).status, 400);
      assert.equal((await fetch(`${base}/2026/annual-inventory-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked: true, note: 'Inventaire annuel contrôlé.' }),
      })).status, 200);
      assert.equal((await fetch(`${base}/2026-03/journal-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked: true, note: 'no' }),
      })).status, 400);
      assert.deepEqual(recorded[0], {
        entityId: 'entity-a',
        period: '2026-03',
        checkKey: 'journal-workflow',
        checked: true,
        note: 'Écritures revues.',
        actorUserId: 'user-a',
        actorUsername: 'finance',
      });
      assert.deepEqual(recorded[1], {
        entityId: 'entity-a',
        period: '2026',
        checkKey: 'annual-inventory-review',
        checked: true,
        note: 'Inventaire annuel contrôlé.',
        actorUserId: 'user-a',
        actorUsername: 'finance',
      });
      assert.deepEqual(locked[0], {
        entityId: 'entity-a',
        period: '2026-03',
        note: 'Clôture vérifiée par finance.',
        actorUserId: 'user-a',
        actorUsername: 'finance',
      });
    } finally {
      if (originalGet) Object.defineProperty(MonthlyCloseService, 'getChecklist', originalGet);
      else Reflect.deleteProperty(MonthlyCloseService, 'getChecklist');
      if (originalRecord) Object.defineProperty(MonthlyCloseService, 'recordCheck', originalRecord);
      else Reflect.deleteProperty(MonthlyCloseService, 'recordCheck');
      if (originalLock) Object.defineProperty(MonthlyCloseService, 'lockPeriod', originalLock);
      else Reflect.deleteProperty(MonthlyCloseService, 'lockPeriod');
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
