import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import { MaterialsService } from './service';

describe('MaterialsService.receiveStock', () => {
  it('receives into a scoped warehouse and applies weighted average cost without posting accounting', async () => {
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
    const initialMaterial = { id: 'material-1', sku: 'MAT-1', quantity: 10, costPrice: 2 };
    const updatedMaterial = { ...initialMaterial, quantity: 15, costPrice: 35 / 15 };
    const receipt = {
      id: 'receipt-1',
      entityId: 'entity-a',
      materialId: 'material-1',
      warehouseId: 'warehouse-1',
      purchaseInvoiceId: 'purchase-invoice-1',
      quantity: 5,
      unitCost: 3,
      reason: 'Bon de livraison BL-1',
      idempotencyKey: 'receipt-once-1',
      createdByUserId: 'user-1',
      createdByUsername: 'logistics',
    };
    let materialRead = 0;
    const transaction = {
      stockReceipt: {
        findUnique: async () => null,
        findMany: async (query: Record<string, unknown>) => {
          calls.linkedReceipts = query;
          return [];
        },
        create: async (query: Record<string, unknown>) => {
          calls.receiptCreate = query;
          return receipt;
        },
      },
      material: {
        findFirst: async () => (++materialRead === 1 ? initialMaterial : updatedMaterial),
        updateMany: async (query: Record<string, unknown>) => {
          calls.materialUpdate = query;
          return { count: 1 };
        },
      },
      warehouse: { findFirst: async () => ({ id: 'warehouse-1' }) },
      purchaseInvoice: {
        findFirst: async (query: Record<string, unknown>) => {
          calls.purchaseInvoice = query;
          return { id: 'purchase-invoice-1', status: 'APPROVED', subTotal: 15, currencyCode: 'TND' };
        },
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
      materialWarehouseStock: {
        findUnique: async () => ({ quantity: 2 }),
        upsert: async (query: Record<string, unknown>) => {
          calls.warehouseUpsert = query;
          return {};
        },
      },
      stockMovement: {
        create: async (query: Record<string, unknown>) => {
          calls.movementCreate = query;
          return {};
        },
      },
    };
    stub(prisma, '$transaction', async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));

    try {
      const result = await MaterialsService.receiveStock({
        materialId: 'material-1',
        warehouseId: 'warehouse-1',
        purchaseInvoiceId: 'purchase-invoice-1',
        quantity: 5,
        unitCost: 3,
        reason: 'Bon de livraison BL-1',
        idempotencyKey: 'receipt-once-1',
      }, 'entity-a', { id: 'user-1', username: 'logistics' });
      assert.equal(result.receipt, receipt);
      assert.equal(result.material, updatedMaterial);
      assert.deepEqual(calls.purchaseInvoice, {
        where: { id: 'purchase-invoice-1', entityId: 'entity-a' },
        select: {
          id: true,
          status: true,
          subTotal: true,
          currencyCode: true,
          vendorId: true,
          lines: { select: { id: true, materialId: true, purchaseOrderLineId: true }, take: 1 },
        },
      });
      assert.deepEqual(calls.linkedReceipts, {
        where: { entityId: 'entity-a', purchaseInvoiceId: 'purchase-invoice-1' },
        select: { quantity: true, unitCost: true },
      });
      assert.equal((calls.receiptCreate as { data: { purchaseInvoiceId: string } }).data.purchaseInvoiceId, 'purchase-invoice-1');
      assert.deepEqual(calls.materialUpdate, {
        where: { id: 'material-1', entityId: 'entity-a', quantity: 10 },
        data: { quantity: { increment: 5 }, costPrice: 35 / 15 },
      });
      assert.deepEqual(calls.warehouseUpsert, {
        where: { materialId_warehouseId: { materialId: 'material-1', warehouseId: 'warehouse-1' } },
        create: { entityId: 'entity-a', materialId: 'material-1', warehouseId: 'warehouse-1', quantity: 5 },
        update: { quantity: { increment: 5 } },
      });
      assert.equal(calls.journalCreate, undefined);
      assert.deepEqual(calls.movementCreate, {
        data: {
          entityId: 'entity-a',
          materialId: 'material-1',
          warehouseId: 'warehouse-1',
          movementType: 'RECEIPT',
          deltaQuantity: 5,
          reason: 'Bon de livraison BL-1',
          createdByUserId: 'user-1',
          createdByUsername: 'logistics',
        },
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('rejects a receipt linked to a supplier invoice that has not been approved', async () => {
    let receiptCreated = false;
    const transaction = {
      stockReceipt: {
        findUnique: async () => null,
        create: async () => { receiptCreated = true; return {}; },
      },
      purchaseInvoice: {
        findFirst: async () => ({
          id: 'purchase-invoice-1',
          status: 'TO_REVIEW',
          vendorId: 'vendor-a',
          subTotal: 10,
          currencyCode: 'TND',
          lines: [],
        }),
      },
    };
    const original = Object.getOwnPropertyDescriptor(prisma, '$transaction');
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
    });

    try {
      await assert.rejects(
        MaterialsService.receiveStock({
          materialId: 'material-1',
          purchaseInvoiceId: 'purchase-invoice-1',
          warehouseId: 'warehouse-1',
          quantity: 1,
          unitCost: 10,
          reason: 'Bon de livraison BL-1',
          idempotencyKey: 'receipt-unapproved-invoice',
        }, 'entity-a', { id: 'user-1', username: 'logistics' }),
        /facture fournisseur approuvée/,
      );
      assert.equal(receiptCreated, false);
    } finally {
      if (original) Object.defineProperty(prisma, '$transaction', original);
      else Reflect.deleteProperty(prisma, '$transaction');
    }
  });

  it('rejects a receipt linked to an invoice from a different purchase-order supplier', async () => {
    const original = Object.getOwnPropertyDescriptor(prisma, '$transaction');
    const transaction = {
      stockReceipt: {
        findUnique: async () => null,
        findMany: async () => [],
      },
      purchaseOrderLine: {
        findFirst: async () => ({
          id: 'order-line-1',
          materialId: 'material-1',
          quantity: 5,
          unitPrice: 3,
          order: { status: 'APPROVED', currencyCode: 'TND', vendorId: 'vendor-a' },
        }),
      },
      entity: {
        findUnique: async () => ({ country: { currencyCode: 'TND' } }),
      },
      purchaseInvoice: {
        findFirst: async () => ({
          id: 'purchase-invoice-1',
          status: 'APPROVED',
          subTotal: 15,
          currencyCode: 'TND',
          vendorId: 'vendor-b',
          lines: [],
        }),
      },
    };
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
    });

    try {
      await assert.rejects(
        MaterialsService.receiveStock({
          materialId: 'material-1',
          purchaseOrderLineId: 'order-line-1',
          purchaseInvoiceId: 'purchase-invoice-1',
          warehouseId: 'warehouse-1',
          quantity: 1,
          unitCost: 3,
          reason: 'Bon de livraison BL-1',
          idempotencyKey: 'receipt-order-invoice-vendor-mismatch',
        }, 'entity-a', { id: 'user-1', username: 'logistics' }),
        /Le fournisseur de la facture diffère de celui de la commande/,
      );
    } finally {
      if (original) Object.defineProperty(prisma, '$transaction', original);
      else Reflect.deleteProperty(prisma, '$transaction');
    }
  });

  it('rejects an invoice line that is not the selected purchase-order line', async () => {
    const original = Object.getOwnPropertyDescriptor(prisma, '$transaction');
    const transaction = {
      stockReceipt: {
        findUnique: async () => null,
        findMany: async () => [],
      },
      purchaseOrderLine: {
        findFirst: async () => ({
          id: 'order-line-1',
          materialId: 'material-1',
          quantity: 5,
          unitPrice: 3,
          order: { status: 'APPROVED', currencyCode: 'TND', vendorId: 'vendor-a' },
        }),
      },
      entity: {
        findUnique: async () => ({ country: { currencyCode: 'TND' } }),
      },
      purchaseInvoice: {
        findFirst: async () => ({
          id: 'purchase-invoice-1',
          status: 'APPROVED',
          subTotal: 15,
          currencyCode: 'TND',
          vendorId: 'vendor-a',
          lines: [{ id: 'invoice-line-1', materialId: 'material-1', purchaseOrderLineId: 'another-order-line' }],
        }),
      },
      purchaseInvoiceLine: {
        findFirst: async () => ({
          materialId: 'material-1',
          purchaseOrderLineId: 'another-order-line',
        }),
      },
    };
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
    });

    try {
      await assert.rejects(
        MaterialsService.receiveStock({
          materialId: 'material-1',
          purchaseOrderLineId: 'order-line-1',
          purchaseInvoiceId: 'purchase-invoice-1',
          purchaseInvoiceLineId: 'invoice-line-1',
          warehouseId: 'warehouse-1',
          quantity: 1,
          unitCost: 3,
          reason: 'Bon de livraison BL-1',
          idempotencyKey: 'receipt-order-invoice-line-mismatch',
        }, 'entity-a', { id: 'user-1', username: 'logistics' }),
        /La ligne de facture ne correspond pas à la ligne de commande réceptionnée/,
      );
    } finally {
      if (original) Object.defineProperty(prisma, '$transaction', original);
      else Reflect.deleteProperty(prisma, '$transaction');
    }
  });

  it('returns an existing matching receipt on retry without creating another journal or movement', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    const existing = {
      entityId: 'entity-a',
      materialId: 'material-1',
      purchaseInvoiceId: 'purchase-invoice-1',
      warehouseId: 'warehouse-1',
      quantity: 5,
      unitCost: 3,
      reason: 'Bon de livraison BL-1',
      idempotencyKey: 'receipt-once-1',
      material: { id: 'material-1', entityId: 'entity-a' },
    };
    let mutationAttempted = false;
    const transaction = {
      monthlyCloseLock: { findFirst: async () => null },
      stockReceipt: { findUnique: async () => existing, create: async () => { mutationAttempted = true; return existing; } },
      journalEntry: { create: async () => { mutationAttempted = true; return {}; } },
      stockMovement: { create: async () => { mutationAttempted = true; return {}; } },
    };
    stub(prisma, '$transaction', async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));

    try {
      const result = await MaterialsService.receiveStock({
        materialId: 'material-1',
        purchaseInvoiceId: 'purchase-invoice-1',
        warehouseId: 'warehouse-1',
        quantity: 5,
        unitCost: 3,
        reason: 'Bon de livraison BL-1',
        idempotencyKey: 'receipt-once-1',
      }, 'entity-a', { id: 'user-1', username: 'logistics' });
      assert.equal(result.receipt, existing);
      assert.equal(result.material, existing.material);
      assert.equal(mutationAttempted, false);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('refuses a receipt that would exceed the linked invoice HT without creating stock or a journal', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let writeAttempted = false;
    const transaction = {
      monthlyCloseLock: { findFirst: async () => null },
      stockReceipt: {
        findUnique: async () => null,
        findMany: async () => [{ quantity: 2, unitCost: 5 }],
        create: async () => { writeAttempted = true; return {}; },
      },
      purchaseInvoice: {
        findFirst: async () => ({ id: 'purchase-invoice-1', status: 'APPROVED', subTotal: 10, currencyCode: 'TND' }),
      },
    };
    stub(prisma, '$transaction', async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));
    try {
      await assert.rejects(
        MaterialsService.receiveStock({
          materialId: 'material-1',
          purchaseInvoiceId: 'purchase-invoice-1',
          warehouseId: 'warehouse-1',
          quantity: 1,
          unitCost: 1,
          reason: 'Complément au-delà facture',
          idempotencyKey: 'receipt-over-invoice-1',
        }, 'entity-a', { id: 'user-1', username: 'logistics' }),
        (error: unknown) => error instanceof Error
          && error.message.includes('dépasserait le HT')
          && 'statusCode' in error
          && error.statusCode === 409,
      );
      assert.equal(writeAttempted, false);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('refuses receipt quantities that exceed their invoice line before writing stock', async () => {
    let writeAttempted = false;
    const transaction = {
      stockReceipt: {
        findUnique: async () => null,
        findMany: async () => [],
        create: async () => { writeAttempted = true; return {}; },
      },
      purchaseInvoice: {
        findFirst: async () => ({
          id: 'purchase-invoice-1',
          status: 'APPROVED',
          subTotal: 10,
          currencyCode: 'TND',
          lines: [{ id: 'line-1' }],
        }),
      },
      purchaseInvoiceLine: {
        findFirst: async () => ({
          id: 'line-1',
          materialId: 'material-1',
          quantity: 1,
          unitPrice: 10,
          purchaseInvoice: { exchangeRate: 1 },
          receiptMatches: [],
        }),
      },
    };
    const original = Object.getOwnPropertyDescriptor(prisma, '$transaction');
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
    });
    try {
      await assert.rejects(
        MaterialsService.receiveStock({
          materialId: 'material-1',
          purchaseInvoiceId: 'purchase-invoice-1',
          purchaseInvoiceLineId: 'line-1',
          warehouseId: 'warehouse-1',
          quantity: 2,
          unitCost: 10,
          reason: 'Réception au-delà de la ligne',
          idempotencyKey: 'receipt-line-over-1',
        }, 'entity-a', { id: 'user-1', username: 'logistics' }),
        /quantité reçue dépasserait la quantité facturée/,
      );
      assert.equal(writeAttempted, false);
    } finally {
      if (original) Object.defineProperty(prisma, '$transaction', original);
      else Reflect.deleteProperty(prisma, '$transaction');
    }
  });
});
