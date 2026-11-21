import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import purchasesRouter from './index';
import PurchasesService from '../../../application/modules/purchases/service';
import MaterialsService from '../../../application/modules/materials/service';
import { getModuleRoles } from '../../../application/auth';

describe('purchases API entity scope', () => {
  it('scopes purchase order reads and writes to the authenticated company and actor', async () => {
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'TEST_order-creator',
        username: 'TEST_order_creator',
        role: 'FINANCIAL_MANAGER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(purchasesRouter);
    const server = createServer(app);
    const originals = [
      Object.getOwnPropertyDescriptor(PurchasesService, 'getPurchaseOrders'),
      Object.getOwnPropertyDescriptor(PurchasesService, 'createPurchaseOrder'),
    ];
    const calls: unknown[][] = [];
    Object.defineProperty(PurchasesService, 'getPurchaseOrders', {
      configurable: true,
      value: async (...args: unknown[]) => {
        calls.push(['list', ...args]);
        return [];
      },
    });
    Object.defineProperty(PurchasesService, 'createPurchaseOrder', {
      configurable: true,
      value: async (...args: unknown[]) => {
        calls.push(['create', ...args]);
        return { id: 'order-1', status: 'TO_REVIEW' };
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}/orders`;
      assert.equal((await fetch(`${base}?entityId=entity-b`)).status, 403);
      assert.equal((await fetch(base)).status, 200);
      const response = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-a', orderNumber: 'PO-1' }),
      });
      assert.equal(response.status, 201);
      assert.deepEqual(calls, [
        ['list', 'entity-a'],
        ['create', { entityId: 'entity-a', orderNumber: 'PO-1' }, 'entity-a', {
          id: 'TEST_order-creator',
          username: 'TEST_order_creator',
        }],
      ]);
    } finally {
      if (originals[0]) Object.defineProperty(PurchasesService, 'getPurchaseOrders', originals[0]);
      else Reflect.deleteProperty(PurchasesService, 'getPurchaseOrders');
      if (originals[1]) Object.defineProperty(PurchasesService, 'createPurchaseOrder', originals[1]);
      else Reflect.deleteProperty(PurchasesService, 'createPurchaseOrder');
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('lets purchasing roles manage company-scoped suppliers', async () => {
    assert.deepEqual(getModuleRoles('purchases'), ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT']);
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-1',
        username: 'manager',
        role: 'FINANCIAL_MANAGER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(purchasesRouter);
    const server = createServer(app);
    const originalList = Object.getOwnPropertyDescriptor(MaterialsService, 'listVendors');
    const originalCreate = Object.getOwnPropertyDescriptor(MaterialsService, 'createVendor');
    const originalScore = Object.getOwnPropertyDescriptor(PurchasesService, 'getSupplierScore');
    const calls: Array<{ operation: string; entityId: string; input?: unknown }> = [];
    const scoreCalls: unknown[][] = [];
    Object.defineProperty(MaterialsService, 'listVendors', {
      configurable: true,
      value: async (entityId: string) => {
        calls.push({ operation: 'list', entityId });
        return [{ id: 'vendor-1', code: 'V-1', name: 'Fournisseur' }];
      },
    });
    Object.defineProperty(MaterialsService, 'createVendor', {
      configurable: true,
      value: async (input: unknown, entityId: string) => {
        calls.push({ operation: 'create', entityId, input });
        return { id: 'vendor-2', code: 'V-2', name: 'Nouveau fournisseur', entityId };
      },
    });
    Object.defineProperty(PurchasesService, 'getSupplierScore', {
      configurable: true,
      value: async (...args: unknown[]) => {
        scoreCalls.push(args);
        return { score: 55, isCurrent: false };
      },
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}/vendors`;
      assert.equal((await fetch(base)).status, 200);
      const scoreResponse = await fetch(`${base}/vendor-1/score`);
      assert.equal(scoreResponse.status, 200);
      assert.deepEqual(await scoreResponse.json(), { score: 55, isCurrent: false });
      assert.deepEqual(scoreCalls, [['vendor-1', 'entity-a']]);
      assert.equal((await fetch(`${base}/vendor-1/score?entityId=entity-b`)).status, 403);
      assert.equal(scoreCalls.length, 1);
      const created = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-a', code: 'V-2', name: 'Nouveau fournisseur' }),
      });
      assert.equal(created.status, 201);
      const forbidden = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', code: 'V-3', name: 'Hors société' }),
      });
      assert.equal(forbidden.status, 403);
      assert.deepEqual(calls, [
        { operation: 'list', entityId: 'entity-a' },
        {
          operation: 'create',
          entityId: 'entity-a',
          input: { entityId: 'entity-a', code: 'V-2', name: 'Nouveau fournisseur' },
        },
      ]);
    } finally {
      if (originalList) Object.defineProperty(MaterialsService, 'listVendors', originalList);
      else Reflect.deleteProperty(MaterialsService, 'listVendors');
      if (originalCreate) Object.defineProperty(MaterialsService, 'createVendor', originalCreate);
      else Reflect.deleteProperty(MaterialsService, 'createVendor');
      if (originalScore) Object.defineProperty(PurchasesService, 'getSupplierScore', originalScore);
      else Reflect.deleteProperty(PurchasesService, 'getSupplierScore');
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('scopes supplier credit-note routes and forwards the authenticated actor', async () => {
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'TEST_credit-operator',
        username: 'TEST_credit_operator',
        role: 'FINANCIAL_MANAGER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(purchasesRouter);
    const server = createServer(app);
    const methodNames = [
      'getSupplierCreditNotes',
      'applySupplierCreditNote',
      'recordSupplierCreditNoteDocument',
      'approveSupplierCreditNote',
      'postSupplierCreditNote',
    ] as const;
    const originals = methodNames.map((method) => Object.getOwnPropertyDescriptor(PurchasesService, method));
    const calls: unknown[][] = [];
    methodNames.forEach((method) => {
      Object.defineProperty(PurchasesService, method, {
        configurable: true,
        value: async (...args: unknown[]) => {
          calls.push([method, ...args]);
          return [];
        },
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}/credit-notes`;
      assert.equal((await fetch(`${base}?entityId=entity-b`)).status, 403);
      assert.equal((await fetch(base)).status, 200);
      assert.equal((await fetch(`${base}/credit-1/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPurchaseInvoiceId: 'invoice-target',
          documentAmount: 5,
          idempotencyKey: 'TEST-app-key',
          note: 'TEST application audit',
        }),
      })).status, 201);
      assert.equal((await fetch(`${base}/credit-1/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b' }),
      })).status, 403);
      for (const action of ['document', 'approve', 'post']) {
        const response = await fetch(`${base}/credit-1/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ supplierDocumentNumber: 'AV-1', note: 'TEST audit note' }),
        });
        assert.equal(response.status, 200);
      }
      assert.deepEqual(calls, [
        ['getSupplierCreditNotes', 'entity-a'],
        ['applySupplierCreditNote', 'credit-1', 'entity-a', {
          id: 'TEST_credit-operator',
          username: 'TEST_credit_operator',
        }, {
          targetPurchaseInvoiceId: 'invoice-target',
          documentAmount: 5,
          idempotencyKey: 'TEST-app-key',
          note: 'TEST application audit',
        }],
        ['recordSupplierCreditNoteDocument', 'credit-1', 'entity-a', {
          id: 'TEST_credit-operator',
          username: 'TEST_credit_operator',
        }, { supplierDocumentNumber: 'AV-1', note: 'TEST audit note' }],
        ['approveSupplierCreditNote', 'credit-1', 'entity-a', {
          id: 'TEST_credit-operator',
          username: 'TEST_credit_operator',
        }, 'TEST audit note'],
        ['postSupplierCreditNote', 'credit-1', 'entity-a', {
          id: 'TEST_credit-operator',
          username: 'TEST_credit_operator',
        }, 'TEST audit note'],
      ]);
    } finally {
      methodNames.forEach((method, index) => {
        const original = originals[index];
        if (original) Object.defineProperty(PurchasesService, method, original);
        else Reflect.deleteProperty(PurchasesService, method);
      });
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('rejects invoice writes for another entity and malformed invoices', async () => {
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-1',
        username: 'manager',
        role: 'FINANCIAL_MANAGER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(purchasesRouter);
    const server = createServer(app);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const forbidden = await fetch(`http://127.0.0.1:${address.port}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b' }),
      });
      assert.equal(forbidden.status, 403);

      const invalid = await fetch(`http://127.0.0.1:${address.port}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceNumber: 'SUP-1',
          vendorId: 'vendor-1',
          issueDate: '2026-01-01',
          dueDate: '2025-12-31',
          subTotal: 10,
          taxRateId: 'rate-1',
        }),
      });
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /date d’échéance/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('passes the authenticated reviewer and scoped entity to invoice approval', async () => {
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'TEST_reviewer-id',
        username: 'TEST_reviewer',
        role: 'FINANCIAL_MANAGER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(purchasesRouter);
    const server = createServer(app);
    const original = Object.getOwnPropertyDescriptor(PurchasesService, 'approveInvoice');
    let received: unknown[] = [];
    Object.defineProperty(PurchasesService, 'approveInvoice', {
      configurable: true,
      value: async (...args: unknown[]) => {
        received = args;
        return { status: 'APPROVED' };
      },
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const response = await fetch(`http://127.0.0.1:${address.port}/invoices/invoice-a/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', note: 'TEST: comptes vérifiés' }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(received, [
        'invoice-a',
        'entity-a',
        { id: 'TEST_reviewer-id', username: 'TEST_reviewer' },
        'TEST: comptes vérifiés',
      ]);
    } finally {
      if (original) Object.defineProperty(PurchasesService, 'approveInvoice', original);
      else Reflect.deleteProperty(PurchasesService, 'approveInvoice');
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
