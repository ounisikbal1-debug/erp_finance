import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Prisma } from '@prisma/client';
import prisma from '../../../data/prisma/client';
import { PurchaseRequestError } from './errors';
import { PurchasesService } from './service';

const invoice = {
  id: 'purchase-invoice-test',
  invoiceNumber: 'TEST-SUP-001',
  entityId: 'test-entity',
  issueDate: new Date('2026-10-29T00:00:00.000Z'),
  currencyCode: 'TND',
  functionalCurrencyCode: 'TND',
  taxRateId: 'test-rate',
  taxRateCode: 'TEST-VAT',
  taxRate: 19,
  subTotal: 100,
  taxAmount: 19,
  totalAmount: 119,
  documentCurrencyCode: 'TND',
  documentSubTotal: 100,
  documentTaxAmount: 19,
  documentTotalAmount: 119,
  exchangeRate: 1,
  exchangeRateDate: new Date('2026-10-29T00:00:00.000Z'),
  exchangeRateSource: 'Même devise fonctionnelle; aucune conversion.',
  exchangeRateImportedAt: null,
  createdByUserId: 'test-creator',
  createdByUsername: 'TEST_creator',
  approvedByUserId: 'test-approver',
  approvedByUsername: 'TEST_approver',
  approvedAt: new Date('2026-10-30T00:00:00.000Z'),
  status: 'APPROVED',
  postingJournalEntryId: null,
  entity: {
    countryId: 'test-country',
    country: {
      currencyCode: 'TND',
      purchaseExpenseAccountCode: 'TEST-EXPENSE',
      purchaseVatAccountCode: 'TEST-VAT-ASSET',
      taxRates: [{
        id: 'test-rate',
        code: 'TEST-VAT',
        rate: 19,
        purchaseVatRecoverable: true,
      }],
    },
  },
};

const payableAccount = 'TEST-PAYABLE';
const accounts = [
  { code: 'TEST-EXPENSE', type: 'Expense', isPostingAllowed: true },
  { code: 'TEST-VAT-ASSET', type: 'Asset', isPostingAllowed: true },
  { code: payableAccount, type: 'Liability', isPostingAllowed: true },
];

function installTransactionStub(
  tx: Record<string, unknown>,
  restorers: Array<() => void>,
) {
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
}

function createTransaction(invoiceData: typeof invoice, options: {
  journalEntry?: Record<string, unknown>;
  onJournalCreate?: (query: Record<string, unknown>) => void;
} = {}) {
  return {
    purchaseInvoice: {
      findFirst: async () => invoiceData,
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => invoiceData,
    },
    purchaseInvoiceWorkflowEvent: { create: async () => ({ id: 'event-test' }) },
    purchaseInvoiceLine: { findMany: async () => [] },
    monthlyCloseLock: { findFirst: async () => null },
    cashflowAccountingMapping: { findUnique: async () => ({ payableAccountCode: payableAccount }) },
    chartOfAccount: { findMany: async () => accounts },
    journalEntry: {
      create: async (query: Record<string, unknown>) => {
        options.onJournalCreate?.(query);
        return options.journalEntry ?? { id: 'journal-test', entryNumber: 'PURCHASE-test', lines: [] };
      },
      findUnique: async () => options.journalEntry ?? {
        id: 'journal-test',
        entityId: invoiceData.entityId,
        entryNumber: 'PURCHASE-test',
        date: new Date(),
        reference: null,
        description: 'Facture',
        status: 'POSTED',
        createdByUserId: null,
        createdByUsername: null,
        approvedByUserId: null,
        approvedByUsername: null,
        approvedAt: null,
        postedByUserId: 'test-poster',
        postedByUsername: 'TEST_poster',
        postedAt: new Date(),
        createdAt: new Date(),
        lines: [],
      },
    },
    journalEntryAuditRecord: {
      findUnique: async () => null,
      create: async () => ({ sequence: 1, entryHash: 'hash-test' }),
    },
    journalEntryAuditChainHead: {
      upsert: async () => ({ lastSequence: 0, lastHash: null }),
      update: async () => ({}),
    },
  };
}

describe('supplier invoice approval and posting workflow', () => {
  it('approves with an auditable note only after account, tax and amount pre-validation', async () => {
    const restorers: Array<() => void> = [];
    let updateData: Record<string, unknown> | undefined;
    const tx = createTransaction({ ...invoice, status: 'TO_REVIEW' });
    const purchaseInvoice = tx.purchaseInvoice as Record<string, unknown>;
    purchaseInvoice.updateMany = async (query: Record<string, unknown>) => {
      updateData = query.data as Record<string, unknown>;
      return { count: 1 };
    };
    installTransactionStub(tx as unknown as Record<string, unknown>, restorers);

    try {
      await PurchasesService.approveInvoice(
        invoice.id,
        invoice.entityId,
        { id: 'test-approver', username: 'TEST_approver' },
        'TEST: facture contrôlée et comptes vérifiés',
      );
      assert.equal(updateData?.status, 'APPROVED');
      assert.equal(updateData?.approvedByUserId, 'test-approver');
      assert.ok(updateData?.approvedAt instanceof Date);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('posts a balanced journal once and records the separate poster identity', async () => {
    const restorers: Array<() => void> = [];
    let journalData: Record<string, unknown> | undefined;
    let updateData: Record<string, unknown> | undefined;
    const journal = {
      id: 'journal-test',
      entityId: invoice.entityId,
      entryNumber: `PURCHASE-${invoice.id}`,
      date: new Date(),
      reference: null,
      description: 'Facture',
      status: 'POSTED',
      createdByUserId: null,
      createdByUsername: null,
      approvedByUserId: null,
      approvedByUsername: null,
      approvedAt: null,
      postedByUserId: 'test-poster',
      postedByUsername: 'TEST_poster',
      postedAt: new Date(),
      createdAt: new Date(),
      lines: [],
    };
    const tx = createTransaction(invoice, {
      journalEntry: journal,
      onJournalCreate: (query) => { journalData = query.data as Record<string, unknown>; },
    });
    const purchaseInvoice = tx.purchaseInvoice as Record<string, unknown>;
    purchaseInvoice.updateMany = async (query: Record<string, unknown>) => {
      updateData = query.data as Record<string, unknown>;
      return { count: 1 };
    };
    installTransactionStub(tx as unknown as Record<string, unknown>, restorers);

    try {
      const result = await PurchasesService.postInvoice(
        invoice.id,
        invoice.entityId,
        { id: 'test-poster', username: 'TEST_poster' },
        'TEST: posting après double contrôle',
      );
      assert.equal(result, journal);
      assert.equal(journalData?.entryNumber, `PURCHASE-${invoice.id}`);
      const journalLines = journalData?.lines as { create: Array<{ debit: number; credit: number }> };
      assert.equal(journalLines.create.reduce((sum, line) => sum + line.debit, 0), 119);
      assert.equal(journalLines.create.reduce((sum, line) => sum + line.credit, 0), 119);
      assert.equal(updateData?.status, 'POSTED');
      assert.equal(updateData?.postedByUserId, 'test-poster');
      assert.equal(updateData?.postingJournalEntryId, journal.id);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('does not allow the approver to post the same invoice', async () => {
    const restorers: Array<() => void> = [];
    let journalCreated = false;
    const tx = createTransaction(invoice, {
      onJournalCreate: () => { journalCreated = true; },
    });
    installTransactionStub(tx as unknown as Record<string, unknown>, restorers);

    try {
      await assert.rejects(
        PurchasesService.postInvoice(
          invoice.id,
          invoice.entityId,
          { id: 'test-approver', username: 'TEST_approver' },
          'TEST: posting non autorisé par le validateur',
        ),
        (error: unknown) => error instanceof PurchaseRequestError && error.statusCode === 422,
      );
      assert.equal(journalCreated, false);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('blocks invoice posting until each stock line is received net of supplier returns', async () => {
    const restorers: Array<() => void> = [];
    let journalCreated = false;
    const tx = createTransaction(invoice, {
      onJournalCreate: () => { journalCreated = true; },
    });
    (tx.purchaseInvoiceLine as { findMany: () => Promise<unknown[]> }).findMany = async () => [{
      id: 'invoice-line-material',
      quantity: 5,
      receiptMatches: [{
        receipt: {
          quantity: 5,
          supplierReturns: [{ quantity: 1 }],
        },
      }],
    }];
    installTransactionStub(tx as unknown as Record<string, unknown>, restorers);

    try {
      await assert.rejects(
        PurchasesService.postInvoice(
          invoice.id,
          invoice.entityId,
          { id: 'test-poster', username: 'TEST_poster' },
          'TEST: facture avant réception complète',
        ),
        (error: unknown) => error instanceof PurchaseRequestError
          && error.statusCode === 409
          && /doit être réceptionnée intégralement/.test(error.message),
      );
      assert.equal(journalCreated, false);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('refuses to post an approved invoice into a closed accounting period', async () => {
    const restorers: Array<() => void> = [];
    let journalCreated = false;
    const tx = createTransaction(invoice, {
      onJournalCreate: () => { journalCreated = true; },
    });
    (tx.monthlyCloseLock as { findFirst: () => Promise<unknown> }).findFirst = async () => ({ period: '2026-10' });
    installTransactionStub(tx as unknown as Record<string, unknown>, restorers);

    try {
      await assert.rejects(
        PurchasesService.postInvoice(
          invoice.id,
          invoice.entityId,
          { id: 'test-poster', username: 'TEST_poster' },
          'TEST: tentative de posting après clôture',
        ),
        (error: unknown) => error instanceof PurchaseRequestError
          && error.statusCode === 409
          && /période comptable 2026-10 est clôturée/.test(error.message),
      );
      assert.equal(journalCreated, false);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('returns the linked journal on a repeated post request without creating another entry', async () => {
    const restorers: Array<() => void> = [];
    let journalCreated = false;
    const postedInvoice = { ...invoice, status: 'POSTED', postingJournalEntryId: 'journal-test' };
    const journal = {
      id: 'journal-test',
      entityId: invoice.entityId,
      entryNumber: `PURCHASE-${invoice.id}`,
      date: new Date(),
      reference: null,
      description: 'Facture',
      status: 'POSTED',
      createdByUserId: null,
      createdByUsername: null,
      approvedByUserId: null,
      approvedByUsername: null,
      approvedAt: null,
      postedByUserId: 'test-poster',
      postedByUsername: 'TEST_poster',
      postedAt: new Date(),
      createdAt: new Date(),
      lines: [],
    };
    const tx = createTransaction(postedInvoice, {
      journalEntry: journal,
      onJournalCreate: () => { journalCreated = true; },
    });
    installTransactionStub(tx as unknown as Record<string, unknown>, restorers);

    try {
      const result = await PurchasesService.postInvoice(
        invoice.id,
        invoice.entityId,
        { id: 'test-retry', username: 'TEST_retry' },
        'TEST: répétition idempotente',
      );
      assert.equal(result, journal);
      assert.equal(journalCreated, false);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });
});
