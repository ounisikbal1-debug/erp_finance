import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import { getModuleRoles } from '../../../application/auth';
import { ProductionService } from '../../../application/modules/production/service';
import productionRouter from './index';

describe('production API', () => {
  it('is mounted for logistics and limits all operations to the authenticated entity', async () => {
    assert.deepEqual(getModuleRoles('production'), ['ADMIN', 'LOGISTICS_MGR']);
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-1',
        username: 'logistics',
        role: 'LOGISTICS_MGR',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(productionRouter);
    const server = createServer(app);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const forbidden = await fetch(`http://127.0.0.1:${address.port}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b' }),
      });
      assert.equal(forbidden.status, 403);

      const restorers: Array<() => void> = [];
      const original = Object.getOwnPropertyDescriptor(ProductionService, 'createDraftOrder');
      const originalCancel = Object.getOwnPropertyDescriptor(ProductionService, 'cancelDraftOrder');
      let cancellation: unknown[] | undefined;
      Object.defineProperty(ProductionService, 'createDraftOrder', {
        configurable: true,
        value: async (_input: unknown, entityId: string) => ({ id: 'order-1', entityId }),
      });
      Object.defineProperty(ProductionService, 'cancelDraftOrder', {
        configurable: true,
        value: async (...args: unknown[]) => {
          cancellation = args;
          return { id: 'order-1', status: 'CANCELLED' };
        },
      });
      restorers.push(() => {
        if (original) Object.defineProperty(ProductionService, 'createDraftOrder', original);
      });
      try {
        const created = await fetch(`http://127.0.0.1:${address.port}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderNumber: 'OF-1' }),
        });
        assert.equal(created.status, 201);
        assert.deepEqual(await created.json(), { id: 'order-1', entityId: 'entity-a' });

        const cancelled = await fetch(`http://127.0.0.1:${address.port}/orders/order-1/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Saisie en double', entityId: 'entity-a' }),
        });
        assert.equal(cancelled.status, 200);
        assert.deepEqual(await cancelled.json(), { id: 'order-1', status: 'CANCELLED' });
        assert.deepEqual(cancellation?.slice(0, 3), ['order-1', 'entity-a', 'Saisie en double']);
        assert.deepEqual(cancellation?.[3], {
          id: 'user-1',
          username: 'logistics',
          role: 'LOGISTICS_MGR',
          entityId: 'entity-a',
        });
      } finally {
        if (originalCancel) Object.defineProperty(ProductionService, 'cancelDraftOrder', originalCancel);
        else Reflect.deleteProperty(ProductionService, 'cancelDraftOrder');
        restorers.reverse().forEach((restore) => restore());
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
