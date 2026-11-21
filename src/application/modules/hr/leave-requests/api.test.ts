import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import { getModuleRoles } from '../../../auth';
import hrRouter from '../api';
import HrLeaveRequestService from './service';

describe('HR leave request API', () => {
  it('scopes requests to the authenticated entity and records authenticated actors', async () => {
    assert.deepEqual(getModuleRoles('hr'), ['ADMIN', 'HR_MANAGER']);
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-hr',
        username: 'hr-manager',
        role: 'HR_MANAGER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(hrRouter);
    const server = createServer(app);
    const originals = new Map<string, PropertyDescriptor | undefined>();
    const calls: Array<{ operation: string; args: unknown[] }> = [];
    const stub = (name: 'list' | 'create' | 'review' | 'listEntitlements' | 'setEntitlement', value: (...args: unknown[]) => unknown) => {
      originals.set(name, Object.getOwnPropertyDescriptor(HrLeaveRequestService, name));
      Object.defineProperty(HrLeaveRequestService, name, { configurable: true, value });
    };
    stub('list', async (...args) => {
      calls.push({ operation: 'list', args });
      return [];
    });
    stub('create', async (...args) => {
      calls.push({ operation: 'create', args });
      return { id: 'leave-1', status: 'PENDING' };
    });
    stub('review', async (...args) => {
      calls.push({ operation: 'review', args });
      return { id: 'leave-1', status: 'APPROVED' };
    });
    stub('listEntitlements', async (...args) => {
      calls.push({ operation: 'listEntitlements', args });
      return [];
    });
    stub('setEntitlement', async (...args) => {
      calls.push({ operation: 'setEntitlement', args });
      return { id: 'entitlement-1' };
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      assert.equal((await fetch(`${base}/leave-requests`)).status, 200);
      assert.equal((await fetch(`${base}/leave-entitlements?year=2026`)).status, 200);
      assert.equal((await fetch(`${base}/leave-entitlements?year=invalid`)).status, 400);
      assert.equal((await fetch(`${base}/leave-entitlements`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: 'employee-1', year: 2026, entitlementDays: 24,
          policySource: 'Politique RH v2', effectiveFrom: '2026-01-01', reason: 'Politique RH',
        }),
      })).status, 200);
      assert.equal((await fetch(`${base}/leave-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', employeeId: 'employee-1' }),
      })).status, 201);
      assert.equal((await fetch(`${base}/leave-requests/leave-1/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', note: 'Validé' }),
      })).status, 200);
      assert.deepEqual(calls, [
        { operation: 'list', args: ['entity-a'] },
        { operation: 'listEntitlements', args: ['entity-a', 2026] },
        {
          operation: 'setEntitlement',
          args: [
            {
              employeeId: 'employee-1', year: 2026, entitlementDays: 24,
              policySource: 'Politique RH v2', effectiveFrom: '2026-01-01', reason: 'Politique RH',
            },
            'entity-a',
            { id: 'user-hr', username: 'hr-manager' },
          ],
        },
        { operation: 'create', args: [{ entityId: 'entity-b', employeeId: 'employee-1' }, 'entity-a', 'user-hr'] },
        { operation: 'review', args: ['leave-1', 'entity-a', 'user-hr', 'APPROVED', 'Validé'] },
      ]);
    } finally {
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(HrLeaveRequestService, name, descriptor);
        else Reflect.deleteProperty(HrLeaveRequestService, name);
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
