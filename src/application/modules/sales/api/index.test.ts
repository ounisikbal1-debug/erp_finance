import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import salesRouter from './index';
import SalesService from '../service';

async function withAuthenticatedSalesServer(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.authenticatedUser = {
      id: 'TEST_user',
      username: 'TEST_user',
      role: 'FINANCIAL_MANAGER',
      entityId: 'entity-a',
    };
    next();
  });
  app.use(salesRouter);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

describe('sales approval API scope', () => {
  it('uses the authenticated company and identity instead of request-supplied values', async () => {
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'TEST_reviewer',
        username: 'TEST_reviewer',
        role: 'FINANCIAL_MANAGER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(salesRouter);
    const server = createServer(app);
    const original = Object.getOwnPropertyDescriptor(SalesService, 'approveInvoice');
    let received: unknown[] = [];
    Object.defineProperty(SalesService, 'approveInvoice', {
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
        body: JSON.stringify({ entityId: 'entity-b', note: 'TEST: revue approuvée' }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(received, [
        'invoice-a',
        'entity-a',
        { id: 'TEST_reviewer', username: 'TEST_reviewer' },
        'TEST: revue approuvée',
      ]);
    } finally {
      if (original) Object.defineProperty(SalesService, 'approveInvoice', original);
      else Reflect.deleteProperty(SalesService, 'approveInvoice');
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});

describe('sales invoice pagination API', () => {
  it('uses the 50-row default and keeps the authenticated entity scope', async () => {
    const original = Object.getOwnPropertyDescriptor(SalesService, 'listInvoices');
    const calls: unknown[][] = [];
    Object.defineProperty(SalesService, 'listInvoices', {
      configurable: true,
      value: async (...args: unknown[]) => {
        calls.push(args);
        return {
          items: [{ id: 'invoice-a' }],
          pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
        };
      },
    });

    try {
      await withAuthenticatedSalesServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/invoices`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          items: [{ id: 'invoice-a' }],
          pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
        });
        const otherEntityResponse = await fetch(`${baseUrl}/invoices?entityId=entity-b`);
        assert.equal(otherEntityResponse.status, 403);
      });
    } finally {
      if (original) Object.defineProperty(SalesService, 'listInvoices', original);
      else Reflect.deleteProperty(SalesService, 'listInvoices');
    }

    assert.deepEqual(calls, [['entity-a', { page: 1, pageSize: 50 }]]);
  });

  it('accepts bounded page navigation parameters', async () => {
    const original = Object.getOwnPropertyDescriptor(SalesService, 'listInvoices');
    let received: unknown[] = [];
    Object.defineProperty(SalesService, 'listInvoices', {
      configurable: true,
      value: async (...args: unknown[]) => {
        received = args;
        return { items: [], pagination: { page: 2, pageSize: 10, total: 25, totalPages: 3 } };
      },
    });

    try {
      await withAuthenticatedSalesServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/invoices?page=2&pageSize=10`);
        assert.equal(response.status, 200);
      });
    } finally {
      if (original) Object.defineProperty(SalesService, 'listInvoices', original);
      else Reflect.deleteProperty(SalesService, 'listInvoices');
    }

    assert.deepEqual(received, ['entity-a', { page: 2, pageSize: 10 }]);
  });

  it('rejects invalid and out-of-range pagination parameters', async () => {
    const original = Object.getOwnPropertyDescriptor(SalesService, 'listInvoices');
    let called = false;
    Object.defineProperty(SalesService, 'listInvoices', {
      configurable: true,
      value: async () => {
        called = true;
        return { items: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 } };
      },
    });

    try {
      await withAuthenticatedSalesServer(async (baseUrl) => {
        for (const query of ['page=0', 'page=1.5', 'pageSize=101', 'pageSize=5&pageSize=10']) {
          const response = await fetch(`${baseUrl}/invoices?${query}`);
          assert.equal(response.status, 400, query);
        }
      });
    } finally {
      if (original) Object.defineProperty(SalesService, 'listInvoices', original);
      else Reflect.deleteProperty(SalesService, 'listInvoices');
    }

    assert.equal(called, false);
  });
});
