import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import financeRouter from './index';
import FinanceService from '../../../application/modules/finance/service';

describe('manual journal workflow API', () => {
  it('uses the authenticated company and actor rather than request-supplied identity', async () => {
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'TEST_preparer',
        username: 'TEST_preparer',
        role: 'FINANCIAL_MANAGER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(financeRouter);
    const server = createServer(app);
    const originalCreate = Object.getOwnPropertyDescriptor(FinanceService, 'createJournalEntry');
    const originalApprove = Object.getOwnPropertyDescriptor(FinanceService, 'approveJournalEntry');
    const originalReverse = Object.getOwnPropertyDescriptor(FinanceService, 'createJournalReversal');
    let createArgs: unknown[] = [];
    let approveArgs: unknown[] = [];
    let reverseArgs: unknown[] = [];
    Object.defineProperty(FinanceService, 'createJournalEntry', {
      configurable: true,
      value: async (...args: unknown[]) => {
        createArgs = args;
        return { id: 'journal-a', status: 'TO_REVIEW' };
      },
    });
    Object.defineProperty(FinanceService, 'approveJournalEntry', {
      configurable: true,
      value: async (...args: unknown[]) => {
        approveArgs = args;
        return { id: 'journal-a', status: 'APPROVED' };
      },
    });
    Object.defineProperty(FinanceService, 'createJournalReversal', {
      configurable: true,
      value: async (...args: unknown[]) => {
        reverseArgs = args;
        return { id: 'journal-reversal', reversesEntryId: 'journal-a', status: 'TO_REVIEW' };
      },
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      const forbidden = await fetch(`${base}/journal-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', id: 'forged-user', note: 'TEST note' }),
      });
      assert.equal(forbidden.status, 403);
      assert.deepEqual(createArgs, []);

      const created = await fetch(`${base}/journal-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryNumber: 'TEST-OD-1',
          entityId: 'entity-a',
          description: 'TEST manual journal',
          note: 'TEST source reference recorded',
          userId: 'forged-user',
        }),
      });
      assert.equal(created.status, 201);
      assert.equal(createArgs[0] && typeof createArgs[0] === 'object' && 'entityId' in createArgs[0]
        ? createArgs[0].entityId
        : undefined, 'entity-a');
      assert.deepEqual(createArgs[1], { id: 'TEST_preparer', username: 'TEST_preparer' });
      assert.equal(createArgs[2], 'TEST source reference recorded');

      const approved = await fetch(`${base}/journal-entries/journal-a/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'TEST independent review', actorUserId: 'forged-user' }),
      });
      assert.equal(approved.status, 200);
      assert.deepEqual(approveArgs, [
        'journal-a',
        'entity-a',
        { id: 'TEST_preparer', username: 'TEST_preparer' },
        'TEST independent review',
      ]);

      const reversed = await fetch(`${base}/journal-entries/journal-a/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'TEST duplicate charge identified', date: '2026-10-30', entityId: 'entity-b' }),
      });
      assert.equal(reversed.status, 201);
      assert.deepEqual(reverseArgs, [
        'journal-a',
        'entity-a',
        { id: 'TEST_preparer', username: 'TEST_preparer' },
        'TEST duplicate charge identified',
        '2026-10-30',
      ]);
    } finally {
      if (originalCreate) Object.defineProperty(FinanceService, 'createJournalEntry', originalCreate);
      else Reflect.deleteProperty(FinanceService, 'createJournalEntry');
      if (originalApprove) Object.defineProperty(FinanceService, 'approveJournalEntry', originalApprove);
      else Reflect.deleteProperty(FinanceService, 'approveJournalEntry');
      if (originalReverse) Object.defineProperty(FinanceService, 'createJournalReversal', originalReverse);
      else Reflect.deleteProperty(FinanceService, 'createJournalReversal');
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
