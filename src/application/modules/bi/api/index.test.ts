import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import biRouter from './index';
import BusinessIntelligenceService from '../service';
import ReceivablesService from '../../receivables/service';
import { authenticateBusinessIntelligence, authorize } from '../../../auth';
import prisma from '../../../../data/prisma/client';
import { hashPassword } from '../../../security/passwords';

describe('Power BI read-only API', () => {
  it('exposes receivables aging for the authenticated entity and cutoff date only', async () => {
    const app = express();
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'TEST_finance',
        username: 'TEST_finance',
        role: 'FINANCIAL_MANAGER',
        entityId: 'TEST_entity_a',
      };
      next();
    });
    app.use(biRouter);
    const server = createServer(app);
    const originalAging = Object.getOwnPropertyDescriptor(ReceivablesService, 'getAging');
    let args: unknown[] = [];
    Object.defineProperty(ReceivablesService, 'getAging', {
      configurable: true,
      value: async (...values: unknown[]) => {
        args = values;
        return { asOf: '2026-03-31', totals: { outstanding: 100 }, invoices: [] };
      },
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      const forbidden = await fetch(`${base}/receivables-aging?entityId=TEST_entity_b&asOf=2026-03-31`);
      assert.equal(forbidden.status, 403);
      assert.deepEqual(args, []);

      const response = await fetch(`${base}/receivables-aging?asOf=2026-03-31`);
      assert.equal(response.status, 200);
      assert.deepEqual(args, ['TEST_entity_a', '2026-03-31']);
      assert.deepEqual(await response.json(), {
        asOf: '2026-03-31',
        totals: { outstanding: 100 },
        invoices: [],
      });

      const manifest = await fetch(`${base}/manifest`);
      assert.equal(manifest.status, 200);
      assert.ok((await manifest.json()).datasets.some((dataset: { id: string }) => dataset.id === 'receivables-aging'));
    } finally {
      if (originalAging) Object.defineProperty(ReceivablesService, 'getAging', originalAging);
      else Reflect.deleteProperty(ReceivablesService, 'getAging');
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('limits datasets to the authenticated entity and requires a valid date period', async () => {
    const app = express();
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'TEST_finance',
        username: 'TEST_finance',
        role: 'FINANCIAL_MANAGER',
        entityId: 'TEST_entity_a',
      };
      next();
    });
    app.use(biRouter);
    const server = createServer(app);
    const original = Object.getOwnPropertyDescriptor(BusinessIntelligenceService, 'getJournalLines');
    let args: unknown[] = [];
    Object.defineProperty(BusinessIntelligenceService, 'getJournalLines', {
      configurable: true,
      value: async (...values: unknown[]) => {
        args = values;
        return { rows: [] };
      },
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      const forbidden = await fetch(`${base}/journal-lines?entityId=TEST_entity_b&from=2026-01-01&to=2026-01-31`);
      assert.equal(forbidden.status, 403);
      assert.deepEqual(args, []);

      const invalidPeriod = await fetch(`${base}/journal-lines?from=2026-02-31&to=2026-03-01`);
      assert.equal(invalidPeriod.status, 400);
      assert.deepEqual(args, []);

      const response = await fetch(`${base}/journal-lines?from=2026-01-01&to=2026-01-31`);
      assert.equal(response.status, 200);
      assert.deepEqual(args, ['TEST_entity_a', '2026-01-01', '2026-01-31']);
    } finally {
      if (original) Object.defineProperty(BusinessIntelligenceService, 'getJournalLines', original);
      else Reflect.deleteProperty(BusinessIntelligenceService, 'getJournalLines');
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('supports local Power BI Desktop credentials for GET only', async () => {
    const app = express();
    const originalUserLookup = Object.getOwnPropertyDescriptor(prisma.user, 'findUnique');
    const passwordHash = await hashPassword('TEST_password');
    Object.defineProperty(prisma.user, 'findUnique', {
      configurable: true,
      value: async ({ where }: { where: { username: string } }) => where.username === 'TEST_finance'
        ? {
          id: 'TEST_user',
          username: 'TEST_finance',
          role: 'FINANCIAL_MANAGER',
          entityId: 'TEST_entity',
          passwordHash,
        }
        : null,
    });
    app.use(authenticateBusinessIntelligence, authorize('ADMIN', 'FINANCIAL_MANAGER'), biRouter);
    const server = createServer(app);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      const authorization = `Basic ${Buffer.from('TEST_finance:TEST_password').toString('base64')}`;
      const readable = await fetch(`${base}/manifest`, { headers: { Authorization: authorization } });
      assert.equal(readable.status, 200);

      const writeAttempt = await fetch(`${base}/journal-lines`, {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'TEST_entity', rows: [{ amount: 1 }] }),
      });
      assert.equal(writeAttempt.status, 405);
      assert.match((await writeAttempt.json()).error, /strictement en lecture seule/);
    } finally {
      if (originalUserLookup) Object.defineProperty(prisma.user, 'findUnique', originalUserLookup);
      else Reflect.deleteProperty(prisma.user, 'findUnique');
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
