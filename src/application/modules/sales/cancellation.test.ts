import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Prisma } from '@prisma/client';
import prisma from '../../../data/prisma/client';
import { FinanceService } from '../finance/service';
import { SalesRequestError } from './errors';
import SalesService from './service';

function installCancellationRequest(
  restorers: Array<() => void>,
  options: { paymentCount?: number; revaluationCount?: number; invoiceStatus?: string; reversalStatus?: string },
) {
  const updates: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  let reversalArguments: unknown[] = [];
  const originalInvoiceFinder = Object.getOwnPropertyDescriptor(prisma.invoice, 'findFirst');
  const originalReversal = Object.getOwnPropertyDescriptor(FinanceService, 'createJournalReversal');
  Object.defineProperty(prisma.invoice, 'findFirst', {
    configurable: true,
    value: async () => ({
      id: 'TEST-sales',
      status: options.invoiceStatus ?? 'ISSUED',
      postingJournalEntryId: 'TEST-journal',
    }),
  });
  Object.defineProperty(FinanceService, 'createJournalReversal', {
    configurable: true,
    value: async (...args: unknown[]) => {
      reversalArguments = args;
      const tx = {
        invoice: {
          findFirst: async () => ({
            id: 'TEST-sales',
            status: options.invoiceStatus ?? 'ISSUED',
            createdByUserId: 'TEST-creator',
            approvedByUserId: 'TEST-reviewer',
            issuedByUserId: 'TEST-issuer',
          }),
          updateMany: async (query: Record<string, unknown>) => {
            updates.push(query.data as Record<string, unknown>);
            return { count: 1 };
          },
        },
        cashflowPayment: { count: async () => options.paymentCount ?? 0 },
        fxRevaluationItem: { count: async () => options.revaluationCount ?? 0 },
        salesInvoiceWorkflowEvent: {
          create: async (query: Record<string, unknown>) => {
            events.push(query.data as Record<string, unknown>);
            return {};
          },
        },
      };
      const callback = args[5];
      if (typeof callback !== 'function') throw new Error('reversal callback missing');
      return Reflect.apply(callback, undefined, [
        tx as unknown as Prisma.TransactionClient,
        { id: 'TEST-reversal', status: options.reversalStatus ?? 'TO_REVIEW' },
      ]);
    },
  });
  restorers.push(() => {
    if (originalInvoiceFinder) Object.defineProperty(prisma.invoice, 'findFirst', originalInvoiceFinder);
    else Reflect.deleteProperty(prisma.invoice, 'findFirst');
    if (originalReversal) Object.defineProperty(FinanceService, 'createJournalReversal', originalReversal);
    else Reflect.deleteProperty(FinanceService, 'createJournalReversal');
  });
  return { updates, events, getReversalArguments: () => reversalArguments };
}

describe('sales invoice cancellation request', () => {
  it('creates an audited reversal request and keeps the invoice pending', async () => {
    const restorers: Array<() => void> = [];
    const { updates, events, getReversalArguments } = installCancellationRequest(restorers, {});
    try {
      await SalesService.cancelInvoice(
        'TEST-sales',
        'TEST-entity',
        { id: 'TEST-requester', username: 'TEST_requester' },
        'TEST: facture à corriger',
        '2026-11-03',
      );
      assert.equal(getReversalArguments()[4], '2026-11-03');
      assert.deepEqual(updates, [{ status: 'CANCELLATION_PENDING' }]);
      assert.deepEqual(events, [{
        invoiceId: 'TEST-sales',
        action: 'CANCELLATION_REQUESTED',
        actorUserId: 'TEST-requester',
        actorUsername: 'TEST_requester',
        note: 'TEST: facture à corriger',
      }]);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('rejects cancellation when a payment or revaluation exists', async () => {
    const restorers: Array<() => void> = [];
    installCancellationRequest(restorers, { paymentCount: 1 });
    try {
      await assert.rejects(
        SalesService.cancelInvoice(
          'TEST-sales',
          'TEST-entity',
          { id: 'TEST-requester', username: 'TEST_requester' },
          'TEST: paiement déjà affecté',
        ),
        (error: unknown) => error instanceof SalesRequestError && error.statusCode === 409,
      );
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('finalizes a pending invoice when its linked reversal is already posted', async () => {
    const restorers: Array<() => void> = [];
    const { updates, events } = installCancellationRequest(restorers, {
      invoiceStatus: 'CANCELLATION_PENDING',
      reversalStatus: 'POSTED',
    });
    try {
      await SalesService.cancelInvoice(
        'TEST-sales',
        'TEST-entity',
        { id: 'TEST-requester', username: 'TEST_requester' },
        'TEST: contrepassation terminée',
      );
      assert.deepEqual(updates, [{ status: 'CANCELLED' }]);
      assert.equal(events[0].action, 'CANCELLED');
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });
});
