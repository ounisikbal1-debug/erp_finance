import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import aiRouter from './index';
import LocalInvoiceAnalysisService from '../../../application/modules/ai/invoice-analysis';
import { MAX_INVOICE_FILE_BYTES, XLSX_MIME_TYPE } from '../../../application/modules/ai/invoice-document';
import LocalFinancialAssistantService from '../../../application/modules/ai/service';
import OperationalInsightsService from '../../../application/modules/ai/operational-insights';

describe('local financial assistant API', () => {
  it('scopes invoice analysis to the authenticated entity and applies the upload limit', async () => {
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
    app.use(aiRouter);
    const server = createServer(app);
    const original = Object.getOwnPropertyDescriptor(LocalInvoiceAnalysisService, 'analyze');
    let analyzedEntity = '';
    let analyzedBuffer = '';
    Object.defineProperty(LocalInvoiceAnalysisService, 'analyze', {
      configurable: true,
      value: async (entityId: string, buffer: Buffer) => {
        analyzedEntity = entityId;
        analyzedBuffer = buffer.toString();
        return { analyzed: true };
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}/invoice-analysis`;
      const response = await fetch(`${base}?entityId=TEST_entity_b`, {
        method: 'POST',
        headers: { 'Content-Type': XLSX_MIME_TYPE },
        body: Buffer.from('synthetic invoice'),
      });
      assert.equal(response.status, 200);
      assert.equal(analyzedEntity, 'TEST_entity_a');
      assert.equal(analyzedBuffer, 'synthetic invoice');
      assert.deepEqual(await response.json(), { analyzed: true });

      const tooLarge = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': XLSX_MIME_TYPE },
        body: Buffer.alloc(MAX_INVOICE_FILE_BYTES + 1),
      });
      assert.equal(tooLarge.status, 413);
    } finally {
      if (original) Object.defineProperty(LocalInvoiceAnalysisService, 'analyze', original);
      else Reflect.deleteProperty(LocalInvoiceAnalysisService, 'analyze');
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('scopes operational snapshots to the authenticated entity', async () => {
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
    app.use(aiRouter);
    const server = createServer(app);
    const original = Object.getOwnPropertyDescriptor(OperationalInsightsService, 'getSnapshot');
    let entityId = '';
    Object.defineProperty(OperationalInsightsService, 'getSnapshot', {
      configurable: true,
      value: async (value: string) => {
        entityId = value;
        return { snapshotDate: '2026-11-07', stock: { lowStockItems: 0 } };
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}/operational-insights`;
      const response = await fetch(`${base}?entityId=TEST_entity_b`);
      assert.equal(response.status, 200);
      assert.equal(entityId, 'TEST_entity_a');
      assert.deepEqual(await response.json(), { snapshotDate: '2026-11-07', stock: { lowStockItems: 0 } });
    } finally {
      if (original) Object.defineProperty(OperationalInsightsService, 'getSnapshot', original);
      else Reflect.deleteProperty(OperationalInsightsService, 'getSnapshot');
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('requires review confirmation and rejects another entity before invoking the assistant', async () => {
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'TEST_finance',
        username: 'TEST_finance',
        role: 'FINANCIAL_MANAGER',
        entityId: 'TEST_entity_a',
      };
      next();
    });
    app.use(aiRouter);
    const server = createServer(app);
    const original = Object.getOwnPropertyDescriptor(LocalFinancialAssistantService, 'ask');
    let called = false;
    let cloudAggregateConsent: boolean | undefined;
    let actorUserId: string | undefined;
    Object.defineProperty(LocalFinancialAssistantService, 'ask', {
      configurable: true,
      value: async (
        _entityId: string,
        _from: unknown,
        _to: unknown,
        _question: unknown,
        consent?: boolean,
        userId?: string,
      ) => {
        called = true;
        cloudAggregateConsent = consent;
        actorUserId = userId;
        return { answer: 'TEST' };
      },
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}/financial-insights`;
      const unconfirmed = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: '2026-01-01', to: '2026-01-31', question: 'TEST question' }),
      });
      assert.equal(unconfirmed.status, 400);
      assert.equal(called, false);

      const response = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId: 'TEST_entity_b',
          from: '2026-01-01',
          to: '2026-01-31',
          question: 'TEST question',
          humanReviewConfirmed: true,
        }),
      });
      assert.equal(response.status, 403);
      assert.equal(called, false);

      const confirmed = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: '2026-01-01',
          to: '2026-01-31',
          question: 'TEST question',
          humanReviewConfirmed: true,
          cloudAggregateConsent: true,
        }),
      });
      assert.equal(confirmed.status, 200);
      assert.equal(called, true);
      assert.equal(cloudAggregateConsent, true);
      assert.equal(actorUserId, 'TEST_finance');
    } finally {
      if (original) Object.defineProperty(LocalFinancialAssistantService, 'ask', original);
      else Reflect.deleteProperty(LocalFinancialAssistantService, 'ask');
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
