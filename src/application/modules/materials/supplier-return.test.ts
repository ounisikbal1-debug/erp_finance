import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import { MaterialsRequestError } from './errors';
import { MaterialsService } from './service';

describe('MaterialsService.returnStockToSupplier', () => {
  it('limits returns to the source receipt and atomically posts warehouse, stock and accounting changes', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    const calls: Record<string, unknown> = {};
    const returned = {
      id: 'return-1',
      sourceReceiptId: 'receipt-1',
      entityId: 'entity-a',
      quantity: 2,
      unitCost: 3,
      reason: 'Retour marchandise endommagée',
      idempotencyKey: 'return-key-1',
    };
    const transaction = {
      monthlyCloseLock: { findFirst: async () => null },
      stockSupplierReturn: {
        findUnique: async () => null,
        create: async (query: Record<string, unknown>) => {
          calls.returnCreate = query;
          return returned;
        },
      },
      supplierCreditNote: {
        findMany: async () => [],
        create: async (query: Record<string, unknown>) => {
          calls.creditNote = query;
          return { id: 'credit-note-1' };
        },
      },
      stockReceipt: {
        findFirst: async (query: Record<string, unknown>) => {
          calls.receiptFind = query;
          return {
            id: 'receipt-1',
            materialId: 'material-1',
            warehouseId: 'warehouse-1',
            quantity: 5,
            returnedQuantity: 1,
            purchaseInvoiceId: 'invoice-1',
            material: { unitCode: 'EA' },
            invoiceLineMatch: {
              line: {
                id: 'invoice-line-1',
                purchaseInvoiceId: 'invoice-1',
                quantity: 5,
                unitPrice: 10,
                purchaseInvoice: {
                  vendorId: 'vendor-1',
                  status: 'POSTED',
                  currencyCode: 'TND',
                  documentCurrencyCode: 'TND',
                  functionalCurrencyCode: 'TND',
                  taxRateId: 'tax-1',
                  taxRateCode: 'TVA19',
                  taxRate: 19,
                  exchangeRate: 1,
                  exchangeRateDate: new Date('2026-10-01T00:00:00.000Z'),
                  exchangeRateSource: 'Même devise fonctionnelle',
                  exchangeRateImportedAt: null,
                },
              },
            },
          };
        },
        findMany: async () => [{ supplierReturns: [{ quantity: 2 }] }],
        updateMany: async (query: Record<string, unknown>) => {
          calls.receiptUpdate = query;
          return { count: 1 };
        },
      },
      material: {
        findFirst: async () => ({ id: 'material-1', sku: 'MAT-1', quantity: 8, costPrice: 3, unitCode: 'EA' }),
        updateMany: async (query: Record<string, unknown>) => {
          calls.materialUpdate = query;
          return { count: 1 };
        },
      },
      materialWarehouseStock: {
        findUnique: async () => ({ quantity: 4 }),
      },
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const statements = (calls.stockDecrements ?? []) as Array<{ sql: string; values: unknown[] }>;
        statements.push({ sql: strings.join('?'), values });
        calls.stockDecrements = statements;
        return 1;
      },
      entity: {
        findUnique: async () => ({
          country: {
            id: 'country-a',
            code: 'TN',
            stockAssetAccountCode: '31',
            stockAdjustmentAccountCode: '68',
          },
        }),
      },
      chartOfAccount: {
        findMany: async () => [
          { code: '31', type: 'Asset', isPostingAllowed: true },
          { code: '68', type: 'Expense', isPostingAllowed: true },
        ],
      },
      journalEntry: {
        create: async (query: Record<string, unknown>) => {
          calls.journal = query;
          return { id: 'journal-1' };
        },
        findUnique: async (query: Record<string, unknown>) => {
          calls.auditJournalFind = query;
          return {
            id: 'journal-1',
            entityId: 'entity-a',
            entryNumber: 'STK-RET-return-1',
            date: new Date('2026-10-01T00:00:00.000Z'),
            reference: 'STK-RET-return-1',
            description: 'Supplier stock return',
            status: 'POSTED',
            createdByUserId: 'user-1',
            createdByUsername: 'logistics',
            approvedByUserId: null,
            approvedByUsername: null,
            approvedAt: null,
            postedByUserId: 'user-1',
            postedByUsername: 'logistics',
            postedAt: new Date('2026-10-01T00:00:00.000Z'),
            createdAt: new Date('2026-10-01T00:00:00.000Z'),
            lines: [
              { accountCode: '68', debit: 6, credit: 0, description: null, costCenterCode: null },
              { accountCode: '31', debit: 0, credit: 6, description: null, costCenterCode: null },
            ],
          };
        },
      },
      journalEntryAuditRecord: {
        findUnique: async () => null,
        create: async (query: Record<string, unknown>) => {
          calls.auditRecord = query;
          return { sequence: 1, entryHash: 'audit-hash' };
        },
      },
      journalEntryAuditChainHead: {
        upsert: async () => ({ lastSequence: 0, lastHash: null }),
        update: async (query: Record<string, unknown>) => {
          calls.auditHeadUpdate = query;
          return { lastSequence: 1, lastHash: 'audit-hash' };
        },
      },
      stockMovement: {
        create: async (query: Record<string, unknown>) => {
          calls.movement = query;
          return { id: 'movement-1' };
        },
      },
    };
    stub(prisma, '$transaction', async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));
    stub(prisma.stockSupplierReturn, 'findUnique', async () => null);

    try {
      const result = await MaterialsService.returnStockToSupplier({
        sourceReceiptId: 'receipt-1',
        quantity: 2,
        reason: 'Retour marchandise endommagée',
        idempotencyKey: 'return-key-1',
      }, 'entity-a', { id: 'user-1', username: 'logistics' });
      assert.equal(result, returned);
      assert.deepEqual(calls.receiptUpdate, {
        where: { id: 'receipt-1', entityId: 'entity-a', returnedQuantity: { lte: 3 } },
        data: { returnedQuantity: { increment: 2 } },
      });
      assert.deepEqual((calls.stockDecrements as Array<{ sql: string; values: unknown[] }>).map(({ sql, values }) => ({
        table: sql.match(/UPDATE "([^"]+)"/)?.[1],
        availableGuard: sql.includes('"quantity" - "reservedQuantity"'),
        values,
      })), [
        {
          table: 'MaterialWarehouseStock',
          availableGuard: true,
          values: [2, 'entity-a', 'material-1', 'warehouse-1', 2],
        },
        {
          table: 'Material',
          availableGuard: true,
          values: [2, 'material-1', 'entity-a', 2],
        },
      ]);
      const journal = calls.journal as {
        data: {
          reference: string;
          lines: { create: Array<{ accountCode: string; debit: number; credit: number }> };
        };
      };
      assert.equal(journal.data.reference, 'STK-RET-return-1');
      assert.deepEqual(journal.data.lines.create.map(({ accountCode, debit, credit }) => ({
        accountCode, debit, credit,
      })), [
        { accountCode: '68', debit: 6, credit: 0 },
        { accountCode: '31', debit: 0, credit: 6 },
      ]);
      assert.deepEqual(calls.auditJournalFind, {
        where: { id: 'journal-1' },
        include: { lines: true },
      });
      assert.ok(calls.auditRecord);
      const creditNote = calls.creditNote as {
        data: {
          vendorId: string;
          sourceInvoiceId: string;
          sourceInvoiceLineId: string;
          sourceReturnId: string;
          quantity: number;
          documentSubTotal: number;
          documentTaxAmount: number;
          documentTotalAmount: number;
          status: string;
          workflowEvents: { create: { action: string } };
        };
      };
      assert.equal(creditNote.data.vendorId, 'vendor-1');
      assert.equal(creditNote.data.sourceInvoiceId, 'invoice-1');
      assert.equal(creditNote.data.sourceInvoiceLineId, 'invoice-line-1');
      assert.equal(creditNote.data.sourceReturnId, 'return-1');
      assert.equal(creditNote.data.quantity, 2);
      assert.equal(creditNote.data.documentSubTotal, 20);
      assert.equal(creditNote.data.documentTaxAmount, 3.8);
      assert.equal(creditNote.data.documentTotalAmount, 23.8);
      assert.equal(creditNote.data.status, 'AWAITING_SUPPLIER_DOCUMENT');
      assert.equal(creditNote.data.workflowEvents.create.action, 'RETURN_LINKED');
      assert.deepEqual(calls.movement, {
        data: {
          entityId: 'entity-a',
          materialId: 'material-1',
          warehouseId: 'warehouse-1',
          movementType: 'SUPPLIER_RETURN',
          deltaQuantity: -2,
          reason: 'Retour marchandise endommagée',
          createdByUserId: 'user-1',
          createdByUsername: 'logistics',
        },
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('rejects returns that exceed the receipt balance before changing stock', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let updateAttempted = false;
    const transaction = {
      monthlyCloseLock: { findFirst: async () => null },
      stockSupplierReturn: { findUnique: async () => null },
      stockReceipt: {
        findFirst: async () => ({
          id: 'receipt-1',
          materialId: 'material-1',
          warehouseId: 'warehouse-1',
          quantity: 5,
          returnedQuantity: 4,
          material: { unitCode: 'EA' },
        }),
      },
      materialWarehouseStock: { updateMany: async () => { updateAttempted = true; return { count: 1 }; } },
    };
    stub(prisma, '$transaction', async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));
    stub(prisma.stockSupplierReturn, 'findUnique', async () => null);
    try {
      await assert.rejects(MaterialsService.returnStockToSupplier({
        sourceReceiptId: 'receipt-1',
        quantity: 2,
        reason: 'Retour au-delà du solde',
        idempotencyKey: 'return-key-2',
      }, 'entity-a', { id: 'user-1', username: 'logistics' }), (error: unknown) => (
        error instanceof MaterialsRequestError && error.statusCode === 409
      ));
      assert.equal(updateAttempted, false);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });
});
