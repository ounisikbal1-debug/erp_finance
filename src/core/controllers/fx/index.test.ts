import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import fxRatesRouter from './index';

describe('FX rate API entity scope', () => {
  it('rejects another entity and validates the requested currency and date', async () => {
    const app = express();
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-1',
        username: 'sales',
        role: 'SALES_OFFICER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(fxRatesRouter);
    const server = createServer(app);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const otherEntity = await fetch(`http://127.0.0.1:${address.port}/suggestion?entityId=entity-b&documentCurrencyCode=EUR&date=2026-10-29`);
      assert.equal(otherEntity.status, 403);

      const invalid = await fetch(`http://127.0.0.1:${address.port}/suggestion?documentCurrencyCode=EURO&date=2026-02-30`);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /trois lettres/);

      const forbiddenRevaluation = await fetch(`http://127.0.0.1:${address.port}/revaluations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ effectiveDate: '2026-03-31' }),
      });
      assert.equal(forbiddenRevaluation.status, 403);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
