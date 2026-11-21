import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Prisma } from '@prisma/client';
import prisma from '../../../data/prisma/client';
import { FinanceService } from '../finance/service';
import { PurchaseRequestError } from './errors';
import PurchasesService from './service';

function installCancellationRequest(
  restorers: Array<() => void>,
  options: { paymentCount?: number; revaluationCount?: number; creditNoteCount?: number; invoiceStatus?: string; reversalStatus?: string },
) {
  const updates: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  let reversalArguments: unknown[] = [];
  const originalInvoiceFinder = Object.getOwnPropertyDescriptor(prisma.purchaseInvoice, 'findFirst');
  const originalReversal = Object.getOwnPropertyDescriptor(FinanceService, 'createJournalReversal');
  Object.defineProperty(prisma.purchaseInvoice, 'findFirst', {
    configurable: true,
    value: async () => ({
      id: 'TEST-purchase',
      status: options.invoiceStatus ?? 'POSTED',
      postingJournalEntryId: 'TEST-journal',
    }),
  });
  Object.defineProperty(FinanceService, 'createJournalReversal', {
    configurable: true,
    value: async (...args: unknown[]) => {
      reversalArguments = args;
      const tx = {
        purchaseInvoice: {
          findFirst: async () => ({
            id: 'TEST-purchase',
            status: options.invoiceStatus ?? 'POSTED',
            createdByUserId: 'TEST-creator',
            approvedByUserId: 'TEST-reviewer',
            postedByUserId: 'TEST-poster',
          }),
          updateMany: async (query: Record<string, unknown>) => {
            updates.push(query.data as Record<string, unknown>);
            return { count: 1 };
          },
        },
        cashflowPayment: { count: async () => options.paymentCount ?? 0 },
        fxRevaluationItem: { count: async () => options.revaluationCount ?? 0 },
        supplierCreditNote: { count: async () => options.creditNoteCount ?? 0 },
        purchaseInvoiceWorkflowEvent: {
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
    if (originalInvoiceFinder) Object.defineProperty(prisma.purchaseInvoice, 'findFirst', originalInvoiceFinder);
    else Reflect.deleteProperty(prisma.purchaseInvoice, 'findFirst');
    if (originalReversal) Object.defineProperty(FinanceService, 'createJournalReversal', originalReversal);
    else Reflect.deleteProperty(FinanceService, 'createJournalReversal');
  });
  return { updates, events, getReversalArguments: () => reversalArguments };
}

describe('supplier invoice cancellation request', () => {
  it('requests a controlled reversal and preserves the posted journal link', async () => {
    const restorers: Array<() => void> = [];
    const { updates, events, getReversalArguments } = installCancellationRequest(restorers, {});
    try {
      await PurchasesService.cancelInvoice(
        'TEST-purchase',
        'TEST-entity',
        { id: 'TEST-requester', username: 'TEST_requester' },
        'TEST: facture à corriger',
        '2026-11-03',
      );
      assert.equal(getReversalArguments()[4], '2026-11-03');
      assert.deepEqual(updates, [{ status: 'CANCELLATION_PENDING' }]);
      assert.deepEqual(events, [{
        purchaseInvoiceId: 'TEST-purchase',
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
    installCancellationRequest(restorers, { revaluationCount: 1 });
    try {
      await assert.rejects(
        PurchasesService.cancelInvoice(
          'TEST-purchase',
          'TEST-entity',
          { id: 'TEST-requester', username: 'TEST_requester' },
          'TEST: réévaluation existante',
        ),
        (error: unknown) => error instanceof PurchaseRequestError && error.statusCode === 409,
      );
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('rejects cancellation while a supplier credit note is linked to the invoice', async () => {
    const restorers: Array<() => void> = [];
    installCancellationRequest(restorers, { creditNoteCount: 1 });
    try {
      await assert.rejects(
        PurchasesService.cancelInvoice(
          'TEST-purchase',
          'TEST-entity',
          { id: 'TEST-requester', username: 'TEST_requester' },
          'TEST: avoir fournisseur lié',
        ),
        (error: unknown) => error instanceof PurchaseRequestError
          && error.statusCode === 409
          && /avoir fournisseur/.test(error.message),
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
      await PurchasesService.cancelInvoice(
        'TEST-purchase',
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
