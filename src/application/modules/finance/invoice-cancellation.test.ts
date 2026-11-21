import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Prisma } from '@prisma/client';
import prisma from '../../../core/models/prisma';
import { FinanceService } from './service';

function installReversalPosting(
  restorers: Array<() => void>,
  document: 'sales' | 'purchase',
) {
  const updates: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const journal = {
    id: 'TEST-reversal',
    entryNumber: 'TEST-REVERSAL',
    entityId: 'TEST-entity',
    date: new Date('2026-11-01T00:00:00.000Z'),
    reference: 'TEST-original',
    description: 'TEST reversal',
    lines: [
      { accountCode: 'TEST-CASH', debit: 10, credit: 0 },
      { accountCode: 'TEST-EXPENSE', debit: 0, credit: 10 },
    ],
    entity: { countryId: 'TEST-country' },
  };
  const tx = {
    monthlyCloseLock: { findFirst: async () => null },
    intercompanyTransaction: { findFirst: async () => null },
    journalEntry: {
      findFirst: async (query: Record<string, unknown>) => 'include' in query
        ? journal
        : {
          status: 'APPROVED',
          createdByUserId: 'TEST-creator',
          approvedByUserId: 'TEST-reviewer',
          reversesEntryId: 'TEST-original',
          date: journal.date,
        },
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => ({
        id: 'TEST-reversal',
        entityId: 'TEST-entity',
        entryNumber: 'TEST-REV-001',
        date: journal.date,
        reference: null,
        description: 'Contrepassation',
        status: 'POSTED',
        createdByUserId: 'TEST-creator',
        createdByUsername: 'TEST_creator',
        approvedByUserId: 'TEST-reviewer',
        approvedByUsername: 'TEST_reviewer',
        approvedAt: new Date(),
        postedByUserId: 'TEST-poster',
        postedByUsername: 'TEST_poster',
        postedAt: new Date(),
        createdAt: new Date(),
        lines: journal.lines,
      }),
    },
    chartOfAccount: {
      findMany: async () => [
        { code: 'TEST-CASH', isPostingAllowed: true },
        { code: 'TEST-EXPENSE', isPostingAllowed: true },
      ],
    },
    journalEntryAuditRecord: {
      findUnique: async () => null,
      create: async () => ({ sequence: 1, entryHash: 'hash-test' }),
    },
    journalEntryAuditChainHead: {
      upsert: async () => ({ lastSequence: 0, lastHash: null }),
      update: async () => ({}),
    },
    journalEntryWorkflowEvent: { create: async () => ({}) },
    fxRevaluationRun: { updateMany: async () => ({ count: 0 }) },
    purchaseInvoice: {
      findFirst: async () => document === 'purchase' ? { id: 'TEST-purchase' } : null,
      updateMany: async (query: Record<string, unknown>) => {
        updates.push(query.data as Record<string, unknown>);
        return { count: 1 };
      },
    },
    purchaseInvoiceWorkflowEvent: {
      create: async (query: Record<string, unknown>) => {
        events.push(query.data as Record<string, unknown>);
        return {};
      },
    },
    invoice: {
      findFirst: async () => document === 'sales' ? { id: 'TEST-sales' } : null,
      updateMany: async (query: Record<string, unknown>) => {
        updates.push(query.data as Record<string, unknown>);
        return { count: 1 };
      },
    },
    salesInvoiceWorkflowEvent: {
      create: async (query: Record<string, unknown>) => {
        events.push(query.data as Record<string, unknown>);
        return {};
      },
    },
  };
  const original = Object.getOwnPropertyDescriptor(prisma, '$transaction');
  Object.defineProperty(prisma, '$transaction', {
    configurable: true,
    value: async (callback: unknown) => {
      if (typeof callback !== 'function') throw new Error('transaction callback missing');
      return Reflect.apply(callback, undefined, [tx as unknown as Prisma.TransactionClient]);
    },
  });
  restorers.push(() => {
    if (original) Object.defineProperty(prisma, '$transaction', original);
    else Reflect.deleteProperty(prisma, '$transaction');
  });
  return { updates, events };
}

function installReversalRejection(
  restorers: Array<() => void>,
  document: 'sales' | 'purchase',
) {
  const journalUpdates: Array<Record<string, unknown>> = [];
  const journalEvents: Array<Record<string, unknown>> = [];
  const invoiceUpdates: Array<Record<string, unknown>> = [];
  const invoiceEvents: Array<Record<string, unknown>> = [];
  const tx = {
    intercompanyTransaction: { findFirst: async () => null },
    journalEntry: {
      findFirst: async () => ({
        status: 'TO_REVIEW',
        createdByUserId: 'TEST-canceller',
        reversesEntryId: 'TEST-original',
      }),
      updateMany: async (query: Record<string, unknown>) => {
        journalUpdates.push(query.data as Record<string, unknown>);
        return { count: 1 };
      },
      findUnique: async () => ({ id: 'TEST-reversal', status: 'REJECTED' }),
    },
    journalEntryWorkflowEvent: {
      create: async (query: Record<string, unknown>) => {
        journalEvents.push(query.data as Record<string, unknown>);
        return {};
      },
    },
    purchaseInvoice: {
      findFirst: async () => document === 'purchase' ? { id: 'TEST-purchase' } : null,
      updateMany: async (query: Record<string, unknown>) => {
        invoiceUpdates.push(query.data as Record<string, unknown>);
        return { count: 1 };
      },
    },
    purchaseInvoiceWorkflowEvent: {
      create: async (query: Record<string, unknown>) => {
        invoiceEvents.push(query.data as Record<string, unknown>);
        return {};
      },
    },
    invoice: {
      findFirst: async () => document === 'sales' ? { id: 'TEST-sales' } : null,
      updateMany: async (query: Record<string, unknown>) => {
        invoiceUpdates.push(query.data as Record<string, unknown>);
        return { count: 1 };
      },
    },
    salesInvoiceWorkflowEvent: {
      create: async (query: Record<string, unknown>) => {
        invoiceEvents.push(query.data as Record<string, unknown>);
        return {};
      },
    },
  };
  const original = Object.getOwnPropertyDescriptor(prisma, '$transaction');
  Object.defineProperty(prisma, '$transaction', {
    configurable: true,
    value: async (callback: unknown) => {
      if (typeof callback !== 'function') throw new Error('transaction callback missing');
      return Reflect.apply(callback, undefined, [tx as unknown as Prisma.TransactionClient]);
    },
  });
  restorers.push(() => {
    if (original) Object.defineProperty(prisma, '$transaction', original);
    else Reflect.deleteProperty(prisma, '$transaction');
  });
  return { journalUpdates, journalEvents, invoiceUpdates, invoiceEvents };
}

describe('posting an invoice reversal', () => {
  for (const document of ['sales', 'purchase'] as const) {
    it(`marks a ${document} invoice cancelled and audits the poster`, async () => {
      const restorers: Array<() => void> = [];
      const { updates, events } = installReversalPosting(restorers, document);
      try {
        await FinanceService.postJournalEntry(
          'TEST-reversal',
          'TEST-entity',
          { id: 'TEST-poster', username: 'TEST_poster' },
          'TEST: contrepassation comptabilisée',
        );
        assert.deepEqual(updates, [{ status: 'CANCELLED' }]);
        assert.equal(events.length, 1);
        assert.equal(events[0].action, 'CANCELLED');
        assert.equal(events[0].actorUserId, 'TEST-poster');
        assert.equal(events[0].note, 'Contrepassation comptabilisée: TEST: contrepassation comptabilisée');
      } finally {
        restorers.reverse().forEach((restore) => restore());
      }
    });
  }
});

describe('rejecting an invoice reversal', () => {
  for (const document of ['sales', 'purchase'] as const) {
    it(`reopens a ${document} invoice and keeps the rejected journal audited`, async () => {
      const restorers: Array<() => void> = [];
      const { journalUpdates, journalEvents, invoiceUpdates, invoiceEvents } = installReversalRejection(restorers, document);
      try {
        const rejected = await FinanceService.rejectJournalEntry(
          'TEST-reversal',
          'TEST-entity',
          { id: 'TEST-reviewer', username: 'TEST_reviewer' },
          'TEST: contrepassation rejetée',
        );
        assert.equal(rejected?.status, 'REJECTED');
        assert.deepEqual(journalUpdates, [{ status: 'REJECTED' }]);
        assert.equal(journalEvents[0].action, 'REJECTED');
        assert.equal(journalEvents[1].action, 'REVERSAL_REJECTED');
        assert.deepEqual(invoiceUpdates, [{ status: document === 'sales' ? 'ISSUED' : 'POSTED' }]);
        assert.equal(invoiceEvents[0].action, 'CANCELLATION_REOPENED');
      } finally {
        restorers.reverse().forEach((restore) => restore());
      }
    });
  }
});
