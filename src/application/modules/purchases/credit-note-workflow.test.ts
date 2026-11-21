import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Prisma } from '@prisma/client';
import prisma from '../../../core/models/prisma';
import { PurchaseRequestError } from './errors';
import { PurchasesService } from './service';

const sourceInvoice = {
  id: 'invoice-1',
  invoiceNumber: 'SUP-001',
  entityId: 'entity-1',
  vendorId: 'vendor-1',
  issueDate: new Date('2026-10-01T00:00:00.000Z'),
  currencyCode: 'TND',
  functionalCurrencyCode: 'TND',
  taxRateId: 'rate-1',
  taxRateCode: 'VAT19',
  taxRate: 19,
  subTotal: 100,
  taxAmount: 19,
  totalAmount: 119,
  documentCurrencyCode: 'TND',
  documentSubTotal: 100,
  documentTaxAmount: 19,
  documentTotalAmount: 119,
  exchangeRate: 1,
  exchangeRateDate: new Date('2026-10-01T00:00:00.000Z'),
  exchangeRateSource: 'Même devise fonctionnelle',
  exchangeRateImportedAt: null,
  status: 'POSTED',
  entity: {
    countryId: 'country-1',
    country: {
      currencyCode: 'TND',
      purchaseExpenseAccountCode: 'EXP',
      purchaseVatAccountCode: 'VAT-REC',
      taxRates: [{ id: 'rate-1', code: 'VAT19', rate: 19, purchaseVatRecoverable: true }],
    },
  },
};

const creditNote = {
  id: 'credit-1',
  entityId: 'entity-1',
  vendorId: 'vendor-1',
  sourceInvoiceId: 'invoice-1',
  supplierDocumentNumber: 'AV-001',
  creditDate: new Date('2026-10-15T00:00:00.000Z'),
  currencyCode: 'TND',
  functionalCurrencyCode: 'TND',
  documentSubTotal: 20,
  documentTaxAmount: 3.8,
  documentTotalAmount: 23.8,
  subTotal: 20,
  taxAmount: 3.8,
  totalAmount: 23.8,
  taxRateId: 'rate-1',
  taxRateCode: 'VAT19',
  taxRate: 19,
  exchangeRate: 1,
  exchangeRateDate: new Date('2026-10-01T00:00:00.000Z'),
  exchangeRateSource: 'Même devise fonctionnelle',
  exchangeRateImportedAt: null,
  quantity: 2,
  unitPrice: 10,
  status: 'APPROVED',
  createdByUserId: 'creator',
  createdByUsername: 'creator',
  approvedByUserId: 'reviewer',
  approvedByUsername: 'reviewer',
  postingJournalEntryId: null,
};

const accounts = [
  { code: 'EXP', type: 'Expense', isPostingAllowed: true },
  { code: 'VAT-REC', type: 'Asset', isPostingAllowed: true },
  { code: 'AP', type: 'Liability', isPostingAllowed: true },
];

function installTransactionStub(tx: Record<string, unknown>, restorers: Array<() => void>) {
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

describe('supplier credit note workflow', () => {
  it('records a real supplier document only when its amounts match the linked return calculation', async () => {
    const restorers: Array<() => void> = [];
    let update: Record<string, unknown> | undefined;
    let event: Record<string, unknown> | undefined;
    const tx = {
      supplierCreditNote: {
        findFirst: async () => ({
          id: 'credit-1',
          status: 'AWAITING_SUPPLIER_DOCUMENT',
          documentSubTotal: 20,
          documentTaxAmount: 3.8,
          documentTotalAmount: 23.8,
        }),
        updateMany: async (query: Record<string, unknown>) => {
          update = query.data as Record<string, unknown>;
          return { count: 1 };
        },
        findUnique: async () => ({ ...creditNote, status: 'TO_REVIEW' }),
      },
      supplierCreditNoteWorkflowEvent: {
        create: async (query: Record<string, unknown>) => {
          event = query.data as Record<string, unknown>;
          return { id: 'event-1' };
        },
      },
    };
    installTransactionStub(tx, restorers);
    try {
      await PurchasesService.recordSupplierCreditNoteDocument(
        'credit-1',
        'entity-1',
        { id: 'operator', username: 'operator' },
        {
          supplierDocumentNumber: 'AV-001',
          creditDate: '2026-10-15',
          documentSubTotal: 20,
          documentTaxAmount: 3.8,
          documentTotalAmount: 23.8,
          note: 'Référence et montants vérifiés',
        },
      );
      assert.equal(update?.status, 'TO_REVIEW');
      assert.equal(update?.supplierDocumentNumber, 'AV-001');
      assert.equal(event?.action, 'DOCUMENT_RECORDED');
      await assert.rejects(
        PurchasesService.recordSupplierCreditNoteDocument(
          'credit-1',
          'entity-1',
          { id: 'operator', username: 'operator' },
          {
            supplierDocumentNumber: 'AV-002',
            creditDate: '2026-10-15',
            documentSubTotal: 21,
            documentTaxAmount: 3.99,
            documentTotalAmount: 24.99,
            note: 'Montants différents du rapprochement',
          },
        ),
        (error: unknown) => error instanceof PurchaseRequestError && error.statusCode === 409,
      );
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('requires a separate reviewer and a posted source invoice', async () => {
    const restorers: Array<() => void> = [];
    let changed = false;
    const tx = {
      supplierCreditNote: {
        findFirst: async () => ({
          id: 'credit-1',
          status: 'TO_REVIEW',
          createdByUserId: 'creator',
          supplierDocumentNumber: 'AV-001',
          creditDate: new Date('2026-10-15T00:00:00.000Z'),
          sourceInvoiceId: 'invoice-1',
        }),
        updateMany: async () => { changed = true; return { count: 1 }; },
        findUnique: async () => ({ ...creditNote, status: 'APPROVED' }),
      },
      purchaseInvoice: { findFirst: async () => ({ id: 'invoice-1' }) },
      supplierCreditNoteWorkflowEvent: { create: async () => ({ id: 'event-1' }) },
    };
    installTransactionStub(tx, restorers);
    try {
      await assert.rejects(
        PurchasesService.approveSupplierCreditNote('credit-1', 'entity-1', {
          id: 'creator',
          username: 'creator',
        }, 'Contrôle indépendant'),
        (error: unknown) => error instanceof PurchaseRequestError && error.statusCode === 422,
      );
      assert.equal(changed, false);
      await PurchasesService.approveSupplierCreditNote('credit-1', 'entity-1', {
        id: 'reviewer',
        username: 'reviewer',
      }, 'Document externe et montants contrôlés');
      assert.equal(changed, true);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('posts the payable, expense, and recoverable VAT reversal exactly once with separated roles', async () => {
    const restorers: Array<() => void> = [];
    let journalData: Record<string, unknown> | undefined;
    let noteUpdate: Record<string, unknown> | undefined;
    const tx = {
      supplierCreditNote: {
        findFirst: async () => creditNote,
        findMany: async () => [],
        updateMany: async (query: Record<string, unknown>) => {
          noteUpdate = query.data as Record<string, unknown>;
          return { count: 1 };
        },
        findUnique: async () => creditNote,
      },
      purchaseInvoice: { findFirst: async () => sourceInvoice },
      cashflowAccountingMapping: { findUnique: async () => ({ payableAccountCode: 'AP' }) },
      cashflowPayment: { findMany: async () => [] },
      chartOfAccount: { findMany: async () => accounts },
      monthlyCloseLock: { findFirst: async () => null },
      supplierCreditNoteWorkflowEvent: { create: async () => ({ id: 'event-1' }) },
      journalEntry: {
        create: async (query: Record<string, unknown>) => {
          journalData = query.data as Record<string, unknown>;
          return {
            id: 'journal-credit',
            entityId: 'entity-1',
            entryNumber: 'PURCHASE-CREDIT-credit-1',
            date: new Date(),
            reference: null,
            description: 'Avoir',
            status: 'POSTED',
            createdByUserId: null,
            createdByUsername: null,
            approvedByUserId: null,
            approvedByUsername: null,
            approvedAt: null,
            postedByUserId: 'poster',
            postedByUsername: 'poster',
            postedAt: new Date(),
            createdAt: new Date(),
            lines: (query.data as { lines: { create: unknown[] } }).lines.create,
          };
        },
        findUnique: async () => ({
          id: 'journal-credit',
          entityId: 'entity-1',
          entryNumber: 'PURCHASE-CREDIT-credit-1',
          date: new Date(),
          reference: null,
          description: 'Avoir',
          status: 'POSTED',
          createdByUserId: null,
          createdByUsername: null,
          approvedByUserId: null,
          approvedByUsername: null,
          approvedAt: null,
          postedByUserId: 'poster',
          postedByUsername: 'poster',
          postedAt: new Date(),
          createdAt: new Date(),
          lines: [],
        }),
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
    installTransactionStub(tx, restorers);
    try {
      await assert.rejects(
        PurchasesService.postSupplierCreditNote('credit-1', 'entity-1', {
          id: 'reviewer',
          username: 'reviewer',
        }, 'Comptabilisation séparée'),
        (error: unknown) => error instanceof PurchaseRequestError && error.statusCode === 422,
      );
      const journal = await PurchasesService.postSupplierCreditNote('credit-1', 'entity-1', {
        id: 'poster',
        username: 'poster',
      }, 'Avoir documenté et comptabilisé');
      assert.equal(noteUpdate?.status, 'POSTED');
      assert.equal(noteUpdate?.postingJournalEntryId, 'journal-credit');
      assert.equal((journal as { entryNumber: string }).entryNumber, 'PURCHASE-CREDIT-credit-1');
      const lines = (journalData?.lines as { create: Array<{ accountCode: string; debit: number; credit: number }> }).create;
      assert.deepEqual(lines.map(({ accountCode, debit, credit }) => ({ accountCode, debit, credit })), [
        { accountCode: 'EXP', debit: 0, credit: 20 },
        { accountCode: 'VAT-REC', debit: 0, credit: 3.8 },
        { accountCode: 'AP', debit: 23.8, credit: 0 },
      ]);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });
});
