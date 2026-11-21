import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Prisma } from '@prisma/client';
import prisma from '../../../core/models/prisma';
import { PurchaseRequestError } from './errors';
import { PurchasesService } from './service';

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

describe('supplier purchase order approval', () => {
  it('requires a separate approver and writes an approval audit event', async () => {
    const restorers: Array<() => void> = [];
    let updateData: Record<string, unknown> | undefined;
    let eventData: Record<string, unknown> | undefined;
    const tx = {
      purchaseOrder: {
        findFirst: async () => ({ id: 'order-1', status: 'TO_REVIEW', createdByUserId: 'creator' }),
        updateMany: async (query: Record<string, unknown>) => {
          updateData = query.data as Record<string, unknown>;
          return { count: 1 };
        },
        findUnique: async () => ({ id: 'order-1', status: 'APPROVED' }),
      },
      purchaseOrderWorkflowEvent: {
        create: async (query: Record<string, unknown>) => {
          eventData = query.data as Record<string, unknown>;
          return { id: 'event-1' };
        },
      },
    };
    installTransactionStub(tx, restorers);
    try {
      await PurchasesService.approvePurchaseOrder(
        'order-1',
        'entity-1',
        { id: 'reviewer', username: 'reviewer' },
        'Quantités et prix contrôlés',
      );
      assert.equal(updateData?.status, 'APPROVED');
      assert.equal(updateData?.approvedByUserId, 'reviewer');
      assert.equal(eventData?.action, 'APPROVED');
      assert.equal(eventData?.actorUserId, 'reviewer');
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('rejects approval by the order creator', async () => {
    const restorers: Array<() => void> = [];
    const tx = {
      purchaseOrder: {
        findFirst: async () => ({ id: 'order-1', status: 'TO_REVIEW', createdByUserId: 'creator' }),
      },
    };
    installTransactionStub(tx, restorers);
    try {
      await assert.rejects(
        PurchasesService.approvePurchaseOrder(
          'order-1',
          'entity-1',
          { id: 'creator', username: 'creator' },
          'Contrôle indépendant',
        ),
        (error: unknown) => error instanceof PurchaseRequestError && /distincte/.test(error.message),
      );
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });
});

describe('supplier purchase order receipt eligibility', () => {
  it('only exposes an approved stock line for the same order and entity', async () => {
    const restorers: Array<() => void> = [];
    let query: Record<string, unknown> | undefined;
    const original = Object.getOwnPropertyDescriptor(prisma.purchaseOrderLine, 'findFirst');
    Object.defineProperty(prisma.purchaseOrderLine, 'findFirst', {
      configurable: true,
      value: async (value: Record<string, unknown>) => {
        query = value;
        return { id: 'line-1', materialId: 'material-1', order: { status: 'APPROVED' } };
      },
    });
    restorers.push(() => {
      if (original) Object.defineProperty(prisma.purchaseOrderLine, 'findFirst', original);
      else Reflect.deleteProperty(prisma.purchaseOrderLine, 'findFirst');
    });
    try {
      assert.deepEqual(
        await PurchasesService.getReceivablePurchaseOrderLine('order-1', 'line-1', 'entity-1'),
        { id: 'line-1', materialId: 'material-1' },
      );
      assert.deepEqual(query, {
        where: { id: 'line-1', entityId: 'entity-1', orderId: 'order-1' },
        include: { order: { select: { status: true } } },
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('rejects unapproved orders, service-only lines, and foreign order lines', async () => {
    const restorers: Array<() => void> = [];
    let line: { id: string; materialId: string | null; order: { status: string } } | null = null;
    const original = Object.getOwnPropertyDescriptor(prisma.purchaseOrderLine, 'findFirst');
    Object.defineProperty(prisma.purchaseOrderLine, 'findFirst', {
      configurable: true,
      value: async () => line,
    });
    restorers.push(() => {
      if (original) Object.defineProperty(prisma.purchaseOrderLine, 'findFirst', original);
      else Reflect.deleteProperty(prisma.purchaseOrderLine, 'findFirst');
    });
    try {
      line = { id: 'line-1', materialId: 'material-1', order: { status: 'TO_REVIEW' } };
      await assert.rejects(
        PurchasesService.getReceivablePurchaseOrderLine('order-1', 'line-1', 'entity-1'),
        (error: unknown) => error instanceof PurchaseRequestError && error.statusCode === 409,
      );
      line = { id: 'line-1', materialId: null, order: { status: 'APPROVED' } };
      await assert.rejects(
        PurchasesService.getReceivablePurchaseOrderLine('order-1', 'line-1', 'entity-1'),
        (error: unknown) => error instanceof PurchaseRequestError && error.statusCode === 422,
      );
      line = null;
      await assert.rejects(
        PurchasesService.getReceivablePurchaseOrderLine('order-1', 'line-1', 'entity-1'),
        (error: unknown) => error instanceof PurchaseRequestError && error.statusCode === 404,
      );
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });
});
