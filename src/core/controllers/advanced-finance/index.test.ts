import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import { authorize, getModuleRoles, type UserRole } from '../../../application/auth';
import advancedFinanceRouter from './index';

describe('advanced financial analysis route', () => {
  it('validates the snapshot date and refuses a different entity', async () => {
    const app = express();
    let activeRole: UserRole = 'FINANCIAL_MANAGER';
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-1',
        username: 'manager',
        role: activeRole,
        entityId: 'entity-a',
      };
      next();
    });
    app.use(authorize(...getModuleRoles('advanced-finance')!), advancedFinanceRouter);
    const server = createServer(app);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');

      const invalidDate = await fetch(`http://127.0.0.1:${address.port}/analysis?asOf=2026-02-29`);
      assert.equal(invalidDate.status, 400);
      assert.match((await invalidDate.json()).error, /date calendaire valide/);

      const anotherEntity = await fetch(`http://127.0.0.1:${address.port}/analysis?entityId=entity-b&asOf=2026-11-09`);
      assert.equal(anotherEntity.status, 403);

      activeRole = 'HR_MANAGER';
      const forbiddenRole = await fetch(`http://127.0.0.1:${address.port}/analysis?asOf=2026-11-09`);
      assert.equal(forbiddenRole.status, 403);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
