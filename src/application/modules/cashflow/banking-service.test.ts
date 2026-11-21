import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import { CashflowRequestError } from './errors';
import { CashflowBankingService } from './banking-service';

function stub(target: object, property: string, value: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, { configurable: true, value });
  return () => {
    if (original) Object.defineProperty(target, property, original);
    else Reflect.deleteProperty(target, property);
  };
}

function statementLine(amount = 10) {
  return {
    id: 'statement-line-a',
    transactionDate: new Date('2026-03-04T00:00:00.000Z'),
    description: 'Receipt',
    amount,
    currencyCode: 'TND',
    bankAccount: {
      ledgerAccountCode: '5121',
      entity: { countryId: 'country-a', country: { currencyCode: 'TND' } },
    },
    reconciliation: null,
  };
}

describe('CashflowBankingService', () => {
  it('posts an idempotent, balanced transfer between functional-currency bank accounts', async () => {
    let journalData: Record<string, unknown> | null = null;
    let transferData: Record<string, unknown> | null = null;
    const restorers = [
      stub(prisma, '$transaction', async (callback: (transaction: typeof prisma) => Promise<unknown>) => callback(prisma)),
      stub(prisma.bankTransfer, 'findUnique', async () => null),
      stub(prisma.entity, 'findUnique', async () => ({
        countryId: 'country-a',
        country: { currencyCode: 'TND' },
      })),
      stub(prisma.bankAccount, 'findMany', async () => [
        { id: 'bank-a', name: 'Compte source', currencyCode: 'TND', ledgerAccountCode: '532' },
        { id: 'bank-b', name: 'Compte destination', currencyCode: 'TND', ledgerAccountCode: '532' },
      ]),
      stub(prisma.chartOfAccount, 'findMany', async () => [
        { code: '532', type: 'Asset', isPostingAllowed: true },
      ]),
      stub(prisma.monthlyCloseLock, 'findFirst', async () => null),
      stub(prisma.journalEntry, 'create', async (query: Record<string, unknown>) => {
        journalData = query.data as Record<string, unknown>;
        return { id: 'journal-a', entryNumber: 'VIR-1', reference: 'VIR-transfer-a', status: 'POSTED' };
      }),
      stub(prisma.journalEntry, 'findUnique', async () => ({
        id: 'journal-a',
        entityId: 'entity-a',
        entryNumber: 'VIR-1',
        date: new Date('2026-03-04T00:00:00.000Z'),
        reference: 'VIR-transfer-a',
        description: 'Transfert entre comptes',
        status: 'POSTED',
        createdByUserId: 'user-a',
        createdByUsername: 'finance',
        approvedByUserId: null,
        approvedByUsername: null,
        approvedAt: null,
        postedByUserId: 'user-a',
        postedByUsername: 'finance',
        postedAt: new Date('2026-03-04T00:00:00.000Z'),
        createdAt: new Date('2026-03-04T00:00:00.000Z'),
        lines: [
          { accountCode: '532', debit: 25.125, credit: 0, description: 'Débit', costCenterCode: null },
          { accountCode: '532', debit: 0, credit: 25.125, description: 'Crédit', costCenterCode: null },
        ],
      })),
      stub(prisma.journalEntryAuditRecord, 'findUnique', async () => null),
      stub(prisma.journalEntryAuditChainHead, 'upsert', async () => ({
        entityId: 'entity-a',
        lastSequence: 0,
        lastHash: null,
        startedAt: new Date('2026-03-04T00:00:00.000Z'),
        createdAt: new Date('2026-03-04T00:00:00.000Z'),
        updatedAt: new Date('2026-03-04T00:00:00.000Z'),
      })),
      stub(prisma.journalEntryAuditRecord, 'create', async () => ({})),
      stub(prisma.journalEntryAuditChainHead, 'update', async () => ({})),
      stub(prisma.bankTransfer, 'create', async (query: Record<string, unknown>) => {
        transferData = query.data as Record<string, unknown>;
        return {
          id: 'transfer-a',
          amount: 25.125,
          currencyCode: 'TND',
          transferredAt: new Date('2026-03-04T00:00:00.000Z'),
          sourceBankAccount: { id: 'bank-a', name: 'Compte source', ledgerAccountCode: '5321' },
          destinationBankAccount: { id: 'bank-b', name: 'Compte destination', ledgerAccountCode: '5322' },
          postingJournalEntry: { id: 'journal-a', entryNumber: 'VIR-1', status: 'POSTED', lines: [] },
        };
      }),
    ];
    try {
      const result = await CashflowBankingService.createBankTransfer({
        sourceBankAccountId: 'bank-a',
        destinationBankAccountId: 'bank-b',
        amount: 25.125,
        transferredAt: '2026-03-04',
        reference: 'BREF-42',
        description: 'Transfert entre comptes',
        idempotencyKey: 'request-transfer-a',
      }, 'entity-a', { id: 'user-a', username: 'finance' });
      assert.equal(result.id, 'transfer-a');
      assert.equal(transferData?.currencyCode, 'TND');
      assert.equal(transferData?.createdByUserId, 'user-a');
      const data = journalData as { status?: string; lines?: { create?: Array<{ accountCode: string; debit: number; credit: number }> } };
      assert.equal(data.status, 'POSTED');
      assert.deepEqual(data.lines?.create, [
        { accountCode: '532', debit: 25.125, credit: 0, description: 'Virement reçu — Compte source vers Compte destination' },
        { accountCode: '532', debit: 0, credit: 25.125, description: 'Virement émis — Compte source vers Compte destination' },
      ]);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('rejects invalid transfer dates before opening a database transaction', async () => {
    let transactionStarted = false;
    const restore = stub(prisma, '$transaction', async () => {
      transactionStarted = true;
      return null;
    });
    try {
      await assert.rejects(
        CashflowBankingService.createBankTransfer({
          sourceBankAccountId: 'bank-a',
          destinationBankAccountId: 'bank-b',
          amount: 5,
          transferredAt: '2026-02-30',
          description: 'Transfert invalide',
          idempotencyKey: 'request-transfer-b',
        }, 'entity-a', { id: 'user-a', username: 'finance' }),
        (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 400,
      );
      assert.equal(transactionStarted, false);
    } finally {
      restore();
    }
  });

  it('nets posted supplier credits from payment targets without treating them as payments', async () => {
    const restorers = [
      stub(prisma.invoice, 'findMany', async () => []),
      stub(prisma.purchaseInvoice, 'findMany', async () => [{
        id: 'purchase-invoice-a',
        invoiceNumber: 'SUP-1',
        status: 'POSTED',
        totalAmount: 100,
        documentTotalAmount: 100,
        currencyCode: 'TND',
        documentCurrencyCode: 'TND',
        functionalCurrencyCode: 'TND',
        supplierCreditNotes: [{
          documentTotalAmount: 25,
          totalAmount: 25,
          currencyCode: 'TND',
        }],
        supplierCreditApplications: [],
      }]),
      stub(prisma.cashflowPayment, 'findMany', async () => []),
    ];
    try {
      const [target] = await CashflowBankingService.listPaymentTargets('entity-a');
      assert.equal(target.paidAmount, 0);
      assert.equal(target.creditedAmount, 25);
      assert.equal(target.remainingAmount, 75);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('only proposes exact candidates with valid, unsigned ledger amounts and scopes their journal date', async () => {
    const restorers = [
      stub(prisma.bankStatementLine, 'findFirst', async () => statementLine()),
      stub(prisma.chartOfAccount, 'findFirst', async () => ({ code: '5121' })),
      stub(prisma.journalLine, 'findMany', async (query: Record<string, unknown>) => {
        assert.deepEqual(query.where, {
          accountCode: '5121',
          journalEntry: {
            entityId: 'entity-a',
            status: 'POSTED',
            date: { gte: new Date('2026-03-04T00:00:00.000Z'), lt: new Date('2026-03-05T00:00:00.000Z') },
          },
        });
        return [
          { id: 'exact', debit: 10, credit: 0, description: null, journalEntry: { entryNumber: 'JE-1', date: new Date('2026-03-04T00:00:00.000Z'), description: 'Receipt' } },
          { id: 'same-amount-other-label', debit: 10, credit: 0, description: 'Autre libellé', journalEntry: { entryNumber: 'JE-6', date: new Date('2026-03-04T00:00:00.000Z'), description: 'Other' } },
          { id: 'negative', debit: -10, credit: 0, description: null, journalEntry: { entryNumber: 'JE-2', date: new Date('2026-03-04T00:00:00.000Z'), description: 'Invalid' } },
          { id: 'zero', debit: 0, credit: 0, description: null, journalEntry: { entryNumber: 'JE-3', date: new Date('2026-03-04T00:00:00.000Z'), description: 'Invalid' } },
          { id: 'both-sides', debit: 10, credit: 1, description: null, journalEntry: { entryNumber: 'JE-4', date: new Date('2026-03-04T00:00:00.000Z'), description: 'Invalid' } },
          { id: 'different-amount', debit: 9, credit: 0, description: null, journalEntry: { entryNumber: 'JE-5', date: new Date('2026-03-04T00:00:00.000Z'), description: 'Different' } },
        ];
      }),
      stub(prisma.bankReconciliation, 'findMany', async () => [{ journalLineId: 'different-amount' }]),
    ];
    try {
      const result = await CashflowBankingService.getReconciliationCandidates('statement-line-a', 'entity-a');
      assert.deepEqual(result.candidates.map((candidate) => candidate.id), ['exact', 'same-amount-other-label']);
      assert.equal(result.candidates[0].labelMatch, true);
      assert.equal(result.candidates[1].labelMatch, false);
      assert.match(result.candidates[0].suggestionReason, /libellé identique/);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('rejects invalid signed ledger amounts before creating a reconciliation', async () => {
    let createCalled = false;
    const restorers = [
      stub(prisma, '$transaction', async (callback: (transaction: typeof prisma) => Promise<unknown>) => callback(prisma)),
      stub(prisma.bankStatementLine, 'findFirst', async () => statementLine()),
      stub(prisma.journalLine, 'findFirst', async () => ({
        id: 'journal-line-a',
        accountCode: '5121',
        debit: -10,
        credit: 0,
        journalEntry: { date: new Date('2026-03-04T00:00:00.000Z') },
      })),
      stub(prisma.chartOfAccount, 'findFirst', async () => {
        throw new Error('Chart validation must not run for invalid journal amounts.');
      }),
      stub(prisma.bankReconciliation, 'create', async () => {
        createCalled = true;
        return { id: 'unexpected' };
      }),
    ];
    try {
      await assert.rejects(
        CashflowBankingService.reconcile({
          statementLineId: 'statement-line-a',
          journalLineId: 'journal-line-a',
        }, 'entity-a'),
        (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 409,
      );
      assert.equal(createCalled, false);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('deletes only an entity-scoped reconciliation and reports stale or foreign identifiers as not found', async () => {
    let query: unknown;
    const restorers = [
      stub(prisma.bankReconciliation, 'findFirst', async () => ({
        statementLine: { cashflowPayment: null },
      })),
      stub(prisma.bankReconciliation, 'deleteMany', async (value: unknown) => {
        query = value;
        return { count: 1 };
      }),
    ];
    try {
      assert.deepEqual(await CashflowBankingService.removeReconciliation('reconciliation-a', 'entity-a'), {
        id: 'reconciliation-a',
      });
      assert.deepEqual(query, { where: { id: 'reconciliation-a', entityId: 'entity-a' } });
      Object.defineProperty(prisma.bankReconciliation, 'deleteMany', {
        configurable: true,
        value: async () => ({ count: 0 }),
      });
      await assert.rejects(
        CashflowBankingService.removeReconciliation('reconciliation-b', 'entity-a'),
        (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 404,
      );
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });
});
