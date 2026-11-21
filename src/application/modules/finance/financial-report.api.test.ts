import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import financeRouter from './api';

describe('financial report route', () => {
  it('validates the requested period and blocks a different entity', async () => {
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
    app.use(financeRouter);
    const server = createServer(app);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const invalidPeriod = await fetch(`http://127.0.0.1:${address.port}/financial-report?from=2025-02-29&to=2025-03-01`);
      assert.equal(invalidPeriod.status, 400);
      assert.match((await invalidPeriod.json()).error, /dates calendaires valides/);

      const otherEntity = await fetch(`http://127.0.0.1:${address.port}/financial-report?entityId=entity-b&from=2025-01-01&to=2025-12-31`);
      assert.equal(otherEntity.status, 403);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
