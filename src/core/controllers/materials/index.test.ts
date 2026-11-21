import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import { getModuleRoles } from '../../../application/auth';
import MaterialsService from '../../../application/modules/materials/service';
import materialsRouter from './index';

describe('materials API', () => {
  it('creates suppliers only in the authenticated entity', async () => {
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-1',
        username: 'purchaser',
        role: 'PURCHASING_MGR',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(materialsRouter);
    const server = createServer(app);
    const originalCreateVendor = Object.getOwnPropertyDescriptor(MaterialsService, 'createVendor');
    const calls: Array<{ input: unknown; entityId: string }> = [];
    Object.defineProperty(MaterialsService, 'createVendor', {
      configurable: true,
      value: async (input: unknown, entityId: string) => {
        calls.push({ input, entityId });
        return { id: 'vendor-1', code: 'V-1', name: 'Fournisseur', entityId };
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}/vendors`;
      const created = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-a', code: 'V-1', name: 'Fournisseur' }),
      });
      assert.equal(created.status, 201);
      assert.deepEqual(calls, [{
        input: { entityId: 'entity-a', code: 'V-1', name: 'Fournisseur' },
        entityId: 'entity-a',
      }]);
      const forbidden = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', code: 'V-2', name: 'Autre' }),
      });
      assert.equal(forbidden.status, 403);
    } finally {
      if (originalCreateVendor) Object.defineProperty(MaterialsService, 'createVendor', originalCreateVendor);
      else Reflect.deleteProperty(MaterialsService, 'createVendor');
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('serves entity-scoped receipt reconciliation options and history', async () => {
    const app = express();
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-1',
        username: 'logistics',
        role: 'LOGISTICS_MGR',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(materialsRouter);
    const server = createServer(app);
    const originals = new Map<string, PropertyDescriptor | undefined>();
    const calls: Array<{ method: string; entityId: string }> = [];
    for (const [method, result] of [
      ['listPurchaseInvoices', []],
      ['listReceivablePurchaseOrderLines', []],
      ['listStockReceipts', []],
      ['listStockSupplierReturns', []],
      ['listStockPicks', []],
    ] as const) {
      originals.set(method, Object.getOwnPropertyDescriptor(MaterialsService, method));
      Object.defineProperty(MaterialsService, method, {
        configurable: true,
        value: async (entityId: string) => {
          calls.push({ method, entityId });
          return result;
        },
      });
    }
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      assert.equal((await fetch(`${base}/purchase-invoices`)).status, 200);
      assert.equal((await fetch(`${base}/receivable-purchase-order-lines`)).status, 200);
      assert.equal((await fetch(`${base}/stock-receipts`)).status, 200);
      assert.equal((await fetch(`${base}/stock-supplier-returns`)).status, 200);
      assert.equal((await fetch(`${base}/stock-picks`)).status, 200);
      assert.equal((await fetch(`${base}/stock-receipts?entityId=entity-b`)).status, 403);
      assert.deepEqual(calls, [
        { method: 'listPurchaseInvoices', entityId: 'entity-a' },
        { method: 'listReceivablePurchaseOrderLines', entityId: 'entity-a' },
        { method: 'listStockReceipts', entityId: 'entity-a' },
        { method: 'listStockSupplierReturns', entityId: 'entity-a' },
        { method: 'listStockPicks', entityId: 'entity-a' },
      ]);
    } finally {
      for (const [method, descriptor] of originals) {
        if (descriptor) Object.defineProperty(MaterialsService, method, descriptor);
        else Reflect.deleteProperty(MaterialsService, method);
      }
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('scopes stock picks, dispatches, cancellations, and records the authenticated actor', async () => {
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
    app.use(materialsRouter);
    const server = createServer(app);
    const originals = new Map<string, PropertyDescriptor | undefined>();
    const calls: unknown[] = [];
    Object.defineProperty(MaterialsService, 'createStockPick', {
      configurable: true,
      value: async (input: unknown, entityId: string, actor: unknown) => {
        calls.push({ method: 'createStockPick', input, entityId, actor });
        return { id: 'pick-1', entityId };
      },
    });
    originals.set('createStockPick', Object.getOwnPropertyDescriptor(MaterialsService, 'createStockPick'));
    Object.defineProperty(MaterialsService, 'confirmStockDispatch', {
      configurable: true,
      value: async (pickId: string, input: unknown, entityId: string, actor: unknown) => {
        calls.push({ method: 'confirmStockDispatch', pickId, input, entityId, actor });
        return { id: 'dispatch-1', pickId, entityId };
      },
    });
    originals.set('confirmStockDispatch', Object.getOwnPropertyDescriptor(MaterialsService, 'confirmStockDispatch'));
    Object.defineProperty(MaterialsService, 'cancelStockPick', {
      configurable: true,
      value: async (pickId: string, entityId: string, actor: unknown) => {
        calls.push({ method: 'cancelStockPick', pickId, entityId, actor });
        return { id: pickId, entityId, status: 'CANCELLED' };
      },
    });
    originals.set('cancelStockPick', Object.getOwnPropertyDescriptor(MaterialsService, 'cancelStockPick'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      const pickInput = { entityId: 'entity-a', reference: 'PICK-1', idempotencyKey: 'pick-key' };
      assert.equal((await fetch(`${base}/stock-picks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pickInput),
      })).status, 201);
      const dispatchInput = { entityId: 'entity-a', idempotencyKey: 'dispatch-key' };
      assert.equal((await fetch(`${base}/stock-picks/pick-1/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dispatchInput),
      })).status, 201);
      assert.equal((await fetch(`${base}/stock-picks/pick-1/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...dispatchInput, entityId: 'entity-b' }),
      })).status, 403);
      assert.equal((await fetch(`${base}/stock-picks/pick-1/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-a' }),
      })).status, 200);
      assert.deepEqual(calls, [
        {
          method: 'createStockPick',
          input: pickInput,
          entityId: 'entity-a',
          actor: { id: 'user-1', username: 'logistics', role: 'LOGISTICS_MGR', entityId: 'entity-a' },
        },
        {
          method: 'confirmStockDispatch',
          pickId: 'pick-1',
          input: dispatchInput,
          entityId: 'entity-a',
          actor: { id: 'user-1', username: 'logistics', role: 'LOGISTICS_MGR', entityId: 'entity-a' },
        },
        {
          method: 'cancelStockPick',
          pickId: 'pick-1',
          entityId: 'entity-a',
          actor: { id: 'user-1', username: 'logistics', role: 'LOGISTICS_MGR', entityId: 'entity-a' },
        },
      ]);
    } finally {
      for (const [method, descriptor] of originals) {
        if (descriptor) Object.defineProperty(MaterialsService, method, descriptor);
        else Reflect.deleteProperty(MaterialsService, method);
      }
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('scopes supplier returns and records the authenticated actor', async () => {
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
    app.use(materialsRouter);
    const server = createServer(app);
    const original = Object.getOwnPropertyDescriptor(MaterialsService, 'returnStockToSupplier');
    let receivedInput: unknown;
    Object.defineProperty(MaterialsService, 'returnStockToSupplier', {
      configurable: true,
      value: async (input: unknown, entityId: string, actor: { id: string; username: string }) => {
        receivedInput = { input, entityId, actor };
        return { id: 'return-1', entityId };
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const response = await fetch(`http://127.0.0.1:${address.port}/stock-supplier-returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-a', sourceReceiptId: 'receipt-a', quantity: 1 }),
      });
      assert.equal(response.status, 201);
      assert.deepEqual(receivedInput, {
        input: { entityId: 'entity-a', sourceReceiptId: 'receipt-a', quantity: 1 },
        entityId: 'entity-a',
        actor: { id: 'user-1', username: 'logistics', role: 'LOGISTICS_MGR', entityId: 'entity-a' },
      });
      assert.equal((await fetch(`http://127.0.0.1:${address.port}/stock-supplier-returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b' }),
      })).status, 403);
    } finally {
      if (original) Object.defineProperty(MaterialsService, 'returnStockToSupplier', original);
      else Reflect.deleteProperty(MaterialsService, 'returnStockToSupplier');
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('scopes stock receipts and records the authenticated actor', async () => {
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
    app.use(materialsRouter);
    const server = createServer(app);
    const originalReceiveStock = Object.getOwnPropertyDescriptor(MaterialsService, 'receiveStock');
    let receivedInput: unknown;
    let receivedEntityId: string | undefined;
    Object.defineProperty(MaterialsService, 'receiveStock', {
      configurable: true,
      value: async (input: unknown, entityId: string, actor: { id: string; username: string }) => {
        receivedInput = input;
        receivedEntityId = entityId;
        assert.deepEqual(actor, { id: 'user-1', username: 'logistics', role: 'LOGISTICS_MGR', entityId: 'entity-a' });
        return { receipt: { id: 'receipt-1' }, material: { id: 'material-1', entityId } };
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const response = await fetch(`http://127.0.0.1:${address.port}/stock-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-a', purchaseInvoiceId: 'invoice-1', idempotencyKey: 'receipt-1' }),
      });
      assert.equal(response.status, 201);
      assert.equal(receivedEntityId, 'entity-a');
      assert.deepEqual(receivedInput, { entityId: 'entity-a', purchaseInvoiceId: 'invoice-1', idempotencyKey: 'receipt-1' });
      assert.deepEqual(await response.json(), {
        receipt: { id: 'receipt-1' },
        material: { id: 'material-1', entityId: 'entity-a' },
      });
      const forbidden = await fetch(`http://127.0.0.1:${address.port}/stock-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b' }),
      });
      assert.equal(forbidden.status, 403);
    } finally {
      if (originalReceiveStock) Object.defineProperty(MaterialsService, 'receiveStock', originalReceiveStock);
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('serves company-scoped data and creates stock records for the authenticated entity', async () => {
    assert.deepEqual(getModuleRoles('materials'), ['ADMIN', 'LOGISTICS_MGR']);
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
    app.use(materialsRouter);
    const server = createServer(app);
    const originalGetModuleData = Object.getOwnPropertyDescriptor(MaterialsService, 'getModuleData');
    const originalCreateMaterial = Object.getOwnPropertyDescriptor(MaterialsService, 'createMaterial');
    const originalUpdateStock = Object.getOwnPropertyDescriptor(MaterialsService, 'updateStock');
    const calls: Array<{
      operation: string;
      entityId: string;
      input?: unknown;
      deltaQuantity?: unknown;
      reason?: unknown;
      actorId?: string;
    }> = [];
    Object.defineProperty(MaterialsService, 'getModuleData', {
      configurable: true,
      value: async (entityId: string) => {
        calls.push({ operation: 'list', entityId });
        return { entity: { name: 'Entity A', countryCode: 'TN', currencyCode: 'TND' }, materials: [] };
      },
    });
    Object.defineProperty(MaterialsService, 'createMaterial', {
      configurable: true,
      value: async (data: unknown, entityId: string, actor: { id: string }) => {
        calls.push({ operation: 'create', entityId, input: data });
        assert.equal(actor.id, 'user-1');
        return {
          id: 'material-1',
          sku: 'MAT-1',
          name: 'Matière 1',
          quantity: 3,
          unitPrice: 12,
          costPrice: 8,
          entityId,
        };
      },
    });
    Object.defineProperty(MaterialsService, 'updateStock', {
      configurable: true,
      value: async (
        id: string,
        entityId: string,
        deltaQuantity: unknown,
        reason: unknown,
        actor: { id: string },
      ) => {
        calls.push({ operation: 'adjust', entityId, deltaQuantity, reason, actorId: actor.id });
        return { id, entityId, sku: 'MAT-1', name: 'Matière 1', quantity: 1, unitPrice: 12, costPrice: 8 };
      },
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');

      const moduleData = await fetch(`http://127.0.0.1:${address.port}/data`);
      assert.equal(moduleData.status, 200);
      assert.deepEqual(await moduleData.json(), {
        entity: { name: 'Entity A', countryCode: 'TN', currencyCode: 'TND' },
        materials: [],
      });

      const created = await fetch(`http://127.0.0.1:${address.port}/materials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: 'MAT-1',
          name: 'Matière 1',
          quantity: 3,
          unitPrice: 12,
          costPrice: 8,
          initialStockReason: 'Inventaire initial',
        }),
      });
      assert.equal(created.status, 201);
      assert.deepEqual(await created.json(), {
        id: 'material-1',
        sku: 'MAT-1',
        name: 'Matière 1',
        quantity: 3,
        unitPrice: 12,
        costPrice: 8,
        entityId: 'entity-a',
      });
      const adjusted = await fetch(`http://127.0.0.1:${address.port}/materials/material-1/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deltaQuantity: -2, reason: 'Inventaire corrigé' }),
      });
      assert.equal(adjusted.status, 200);
      assert.deepEqual(await adjusted.json(), {
        id: 'material-1',
        entityId: 'entity-a',
        sku: 'MAT-1',
        name: 'Matière 1',
        quantity: 1,
        unitPrice: 12,
        costPrice: 8,
      });
      assert.deepEqual(calls, [
        { operation: 'list', entityId: 'entity-a' },
        {
          operation: 'create',
          entityId: 'entity-a',
          input: {
            sku: 'MAT-1',
            name: 'Matière 1',
            quantity: 3,
            unitPrice: 12,
            costPrice: 8,
            initialStockReason: 'Inventaire initial',
          },
        },
        {
          operation: 'adjust',
          entityId: 'entity-a',
          deltaQuantity: -2,
          reason: 'Inventaire corrigé',
          actorId: 'user-1',
        },
      ]);
    } finally {
      if (originalGetModuleData) Object.defineProperty(MaterialsService, 'getModuleData', originalGetModuleData);
      if (originalCreateMaterial) Object.defineProperty(MaterialsService, 'createMaterial', originalCreateMaterial);
      if (originalUpdateStock) Object.defineProperty(MaterialsService, 'updateStock', originalUpdateStock);
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('rejects attempts to access or create stock for another entity', async () => {
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
    app.use(materialsRouter);
    const server = createServer(app);
    const originalCreateMaterial = Object.getOwnPropertyDescriptor(MaterialsService, 'createMaterial');
    const originalUpdateStock = Object.getOwnPropertyDescriptor(MaterialsService, 'updateStock');
    const originalTransferStock = Object.getOwnPropertyDescriptor(MaterialsService, 'transferStock');
    Object.defineProperty(MaterialsService, 'createMaterial', {
      configurable: true,
      value: async () => {
        throw new Error('La route ne doit pas appeler le service');
      },
    });
    Object.defineProperty(MaterialsService, 'updateStock', {
      configurable: true,
      value: async () => {
        throw new Error('La route ne doit pas appeler le service');
      },
    });
    Object.defineProperty(MaterialsService, 'transferStock', {
      configurable: true,
      value: async () => {
        throw new Error('La route ne doit pas appeler le service');
      },
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');

      const forbiddenList = await fetch(`http://127.0.0.1:${address.port}/data?entityId=entity-b`);
      assert.equal(forbiddenList.status, 403);

      const forbiddenCreate = await fetch(`http://127.0.0.1:${address.port}/materials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b' }),
      });
      assert.equal(forbiddenCreate.status, 403);

      const forbiddenAdjustment = await fetch(`http://127.0.0.1:${address.port}/materials/material-1/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', deltaQuantity: 1 }),
      });
      assert.equal(forbiddenAdjustment.status, 403);

      const forbiddenTransfer = await fetch(`http://127.0.0.1:${address.port}/stock-transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b' }),
      });
      assert.equal(forbiddenTransfer.status, 403);
    } finally {
      if (originalCreateMaterial) Object.defineProperty(MaterialsService, 'createMaterial', originalCreateMaterial);
      if (originalUpdateStock) Object.defineProperty(MaterialsService, 'updateStock', originalUpdateStock);
      if (originalTransferStock) Object.defineProperty(MaterialsService, 'transferStock', originalTransferStock);
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
