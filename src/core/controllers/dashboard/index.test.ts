import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import dashboardRouter from './index';

describe('dashboard summary route', () => {
  it('rejects a dashboard request for a different authenticated entity', async () => {
    const app = express();
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-1',
        username: 'manager',
        role: 'FINANCIAL_MANAGER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(dashboardRouter);
    const server = createServer(app);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const response = await fetch(`http://127.0.0.1:${address.port}/summary?entityId=entity-b`);
      assert.equal(response.status, 403);
      assert.match((await response.json()).error, /périmètre de votre compte/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
