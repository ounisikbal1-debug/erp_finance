import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import { getModuleRoles } from '../../../application/auth';
import { createTendersRouter, type TenderApiService } from './index';

describe('public tenders API', () => {
  it('uses the authenticated entity and exposes scoped tracking operations', async () => {
    assert.deepEqual(getModuleRoles('tenders'), ['ADMIN', 'FINANCIAL_MANAGER']);
    const calls: Array<{ operation: string; entityId: string; tenderId?: string; itemId?: string }> = [];
    const service: TenderApiService = {
      async list(entityId) { calls.push({ operation: 'list', entityId }); return []; },
      async create(entityId) { calls.push({ operation: 'create', entityId }); return { id: 'tender-1' }; },
      async updateStatus(entityId, tenderId) {
        calls.push({ operation: 'status', entityId, tenderId });
        return { id: tenderId };
      },
      async addDocument(entityId, tenderId) {
        calls.push({ operation: 'document', entityId, tenderId });
        return { tenderBidId: tenderId };
      },
      async updateDocument(entityId, tenderId, documentId) {
        calls.push({ operation: 'update-document', entityId, tenderId, itemId: documentId });
        return { id: documentId };
      },
      async addCaution(entityId, tenderId) {
        calls.push({ operation: 'caution', entityId, tenderId });
        return { tenderBidId: tenderId };
      },
      async updateCaution(entityId, tenderId, cautionId) {
        calls.push({ operation: 'update-caution', entityId, tenderId, itemId: cautionId });
        return { id: cautionId };
      },
    };
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-a',
        username: 'manager',
        role: 'FINANCIAL_MANAGER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(createTendersRouter(service));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      assert.equal((await fetch(`${base}/`)).status, 200);
      assert.equal((await fetch(`${base}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'spoofed' }),
      })).status, 201);
      assert.equal((await fetch(`${base}/tender-1/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SUBMITTED' }),
      })).status, 200);
      assert.equal((await fetch(`${base}/tender-1/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Pièce' }),
      })).status, 201);
      assert.equal((await fetch(`${base}/tender-1/documents/document-1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'READY' }),
      })).status, 200);
      assert.equal((await fetch(`${base}/tender-1/cautions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 10 }),
      })).status, 201);
      assert.equal((await fetch(`${base}/tender-1/cautions/caution-1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'RELEASED', releasedAt: '2026-12-10' }),
      })).status, 200);
      assert.deepEqual(calls.map(({ operation, entityId, tenderId, itemId }) => [operation, entityId, tenderId, itemId]), [
        ['list', 'entity-a', undefined, undefined],
        ['create', 'entity-a', undefined, undefined],
        ['status', 'entity-a', 'tender-1', undefined],
        ['document', 'entity-a', 'tender-1', undefined],
        ['update-document', 'entity-a', 'tender-1', 'document-1'],
        ['caution', 'entity-a', 'tender-1', undefined],
        ['update-caution', 'entity-a', 'tender-1', 'caution-1'],
      ]);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('rejects accounts without an entity scope', async () => {
    const service: TenderApiService = {
      async list() { return []; },
      async create() { return {}; },
      async updateStatus() { return {}; },
      async addDocument() { return {}; },
      async updateDocument() { return {}; },
      async addCaution() { return {}; },
      async updateCaution() { return {}; },
    };
    const app = express();
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = { id: 'user-a', username: 'manager', role: 'ADMIN', entityId: null };
      next();
    });
    app.use(createTendersRouter(service));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      assert.equal((await fetch(`http://127.0.0.1:${address.port}/`)).status, 403);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
