import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import { ProductionRequestError } from './errors';
import { ProductionService } from './service';
import { validateProductionOrderInput } from './validation';
import { calculateIndicativeUnitMargin } from './cost-summary';

describe('production validation and service', () => {
  it('calculates only the configured sale-price minus average-cost difference', () => {
    assert.equal(calculateIndicativeUnitMargin(12.345, 8.111), 4.234);
    assert.equal(calculateIndicativeUnitMargin(5, 6), -1);
    assert.equal(calculateIndicativeUnitMargin(Number.NaN, 1), null);
  });

  it('rejects duplicate or overlapping material lines and invalid quantities', () => {
    assert.throws(() => validateProductionOrderInput({
      orderNumber: 'OF-1',
      outputMaterialId: 'output',
      outputQuantity: 3,
      consumptions: [{ materialId: 'raw', quantity: 1 }],
    }), /dépôt de production/);
    assert.throws(() => validateProductionOrderInput({
      orderNumber: 'OF-1',
      outputMaterialId: 'output',
      warehouseId: 'warehouse-a',
      outputQuantity: 3,
      consumptions: [
        { materialId: 'raw', quantity: 1 },
        { materialId: 'raw', quantity: 2 },
      ],
    }), /une seule fois/);
    assert.throws(() => validateProductionOrderInput({
      orderNumber: 'OF-1',
      outputMaterialId: 'output',
      warehouseId: 'warehouse-a',
      outputQuantity: 0,
      consumptions: [{ materialId: 'raw', quantity: 1 }],
    }), /quantité produite/);
    assert.throws(() => validateProductionOrderInput({
      orderNumber: 'OF-1',
      outputMaterialId: 'raw',
      warehouseId: 'warehouse-a',
      outputQuantity: 1,
      consumptions: [{ materialId: 'raw', quantity: 1 }],
    }), /ne peut pas être consommé/);

    const expandedOrder = validateProductionOrderInput({
      orderNumber: 'OF-COSTED',
      outputMaterialId: 'finished',
      warehouseId: 'output-warehouse',
      outputQuantity: 1.5,
      laborCost: 25.125,
      overheadCost: 4.875,
      scrapQuantity: 0.125,
      scrapReason: 'Défaut mesuré',
      consumptions: [{ materialId: 'raw', quantity: 2.25, warehouseId: 'input-warehouse' }],
    });
    assert.equal(expandedOrder.laborCost, 25.125);
    assert.equal(expandedOrder.overheadCost, 4.875);
    assert.equal(expandedOrder.scrapQuantity, 0.125);
    assert.equal(expandedOrder.consumptions[0].warehouseId, 'input-warehouse');
    assert.throws(() => validateProductionOrderInput({
      orderNumber: 'OF-COSTED',
      outputMaterialId: 'finished',
      warehouseId: 'warehouse-a',
      outputQuantity: 1,
      laborCost: 0.0001,
      consumptions: [{ materialId: 'raw', quantity: 1 }],
    }), /au millime près/);
    assert.throws(() => validateProductionOrderInput({
      orderNumber: 'OF-SCRAP',
      outputMaterialId: 'finished',
      warehouseId: 'warehouse-a',
      outputQuantity: 1,
      scrapQuantity: 0.5,
      consumptions: [{ materialId: 'raw', quantity: 1 }],
    }), /motif significatif/);
  });

  it('creates a draft only from materials belonging to the requested entity', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let materialQuery: Record<string, unknown> | undefined;
    let createQuery: Record<string, unknown> | undefined;
    let warehouseQuery: Record<string, unknown> | undefined;
    stub(prisma.warehouse, 'findMany', async (query: Record<string, unknown>) => {
      warehouseQuery = query;
      return [{ id: 'warehouse-a' }];
    });
    stub(prisma.material, 'findMany', async (query: Record<string, unknown>) => {
      materialQuery = query;
      return [{ id: 'finished', unitCode: 'KG' }, { id: 'raw', unitCode: 'KG' }];
    });
    stub(prisma.productionOrder, 'create', async (query: Record<string, unknown>) => {
      createQuery = query;
      return { id: 'order-1', ...query.data as object };
    });

    try {
      const order = await ProductionService.createDraftOrder({
        orderNumber: ' OF-2026-001 ',
        description: 'First batch',
        outputMaterialId: 'finished',
        warehouseId: 'warehouse-a',
        outputQuantity: 12.125,
        consumptions: [{ materialId: 'raw', quantity: 8.5 }],
      }, 'entity-a');
      assert.deepEqual(materialQuery, {
        where: { entityId: 'entity-a', id: { in: ['finished', 'raw'] } },
        select: { id: true, unitCode: true },
      });
      assert.equal((createQuery?.data as Record<string, unknown>).entityId, 'entity-a');
      assert.equal((createQuery?.data as Record<string, unknown>).orderNumber, 'OF-2026-001');
      assert.equal((createQuery?.data as Record<string, unknown>).warehouseId, 'warehouse-a');
      assert.equal((createQuery?.data as Record<string, unknown>).outputQuantity, 12.125);
      assert.deepEqual(warehouseQuery, {
        where: { id: { in: ['warehouse-a'] }, entityId: 'entity-a' },
        select: { id: true },
      });
      assert.equal((createQuery?.data as Record<string, unknown>).status, 'DRAFT');
      assert.equal((createQuery?.data as Record<string, unknown>).laborCost, 0);
      assert.equal((createQuery?.data as Record<string, unknown>).overheadCost, 0);
      assert.equal((createQuery?.data as Record<string, unknown>).scrapQuantity, 0);
      assert.deepEqual(order.consumptions, {
        create: [{ materialId: 'raw', quantity: 8.5, warehouseId: 'warehouse-a' }],
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('rejects materials outside the entity and converts a duplicate order number to conflict', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    stub(prisma.material, 'findMany', async () => [{ id: 'finished' }]);
    stub(prisma.warehouse, 'findMany', async () => [{ id: 'warehouse-a' }]);
    stub(prisma.productionOrder, 'create', async () => {
      throw { code: 'P2002' };
    });
    const input = {
      orderNumber: 'OF-1',
      outputMaterialId: 'finished',
      warehouseId: 'warehouse-a',
      outputQuantity: 2,
      consumptions: [{ materialId: 'raw', quantity: 1 }],
    };

    try {
      await assert.rejects(ProductionService.createDraftOrder(input, 'entity-a'), (error: unknown) => {
        assert.ok(error instanceof ProductionRequestError);
        assert.equal(error.statusCode, 400);
        return true;
      });

      stub(prisma.material, 'findMany', async () => [{ id: 'finished' }, { id: 'raw' }]);
      await assert.rejects(ProductionService.createDraftOrder(input, 'entity-a'), (error: unknown) => {
        assert.ok(error instanceof ProductionRequestError);
        assert.equal(error.statusCode, 409);
        return true;
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('consumes inputs and adds output atomically only when a draft is posted', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    const stockUpdates: Array<Record<string, unknown>> = [];
    const warehouseUpdates: Array<Record<string, unknown>> = [];
    const rawStatements: Array<{ sql: string; values: unknown[] }> = [];
    const movementCreates: Array<Record<string, unknown>> = [];
    let warehouseOutputUpdate: Record<string, unknown> | undefined;
    let statusUpdate: Record<string, unknown> | undefined;
    const order = {
      id: 'order-1',
      entityId: 'entity-a',
      orderNumber: 'OF-1',
      outputMaterialId: 'finished',
      warehouseId: 'warehouse-a',
      outputQuantity: 12,
      laborCost: 0,
      overheadCost: 0,
      scrapQuantity: 0,
      status: 'DRAFT',
      outputMaterial: { id: 'finished', sku: 'FIN', name: 'Finished', quantity: 0, costPrice: 0 },
      consumptions: [{ materialId: 'raw', quantity: 8 }],
    };
    const accounts = [
      { code: '31', type: 'Asset' },
      { code: '33', type: 'Asset' },
    ];
    const transaction = {
      monthlyCloseLock: { findFirst: async () => null },
      entity: {
        findUnique: async () => ({
          country: {
            id: 'country-a',
            code: 'TN',
            stockAssetAccountCode: '31',
            stockAdjustmentAccountCode: '68',
            productionWipAccountCode: '33',
            productionLaborAccountCode: null,
            productionOverheadAccountCode: null,
          },
        }),
      },
      chartOfAccount: { findMany: async () => accounts },
      warehouse: {
        findFirst: async () => ({ id: 'warehouse-a' }),
        findMany: async () => [{ id: 'warehouse-a' }],
      },
      productionOrder: {
        findFirst: async () => ({ ...order }),
        updateMany: async (query: Record<string, unknown>) => {
          statusUpdate = query;
          return { count: 1 };
        },
      },
      material: {
        findMany: async () => [{ id: 'raw', costPrice: 1.25, unitCode: 'KG' }],
        updateMany: async (query: Record<string, unknown>) => {
          stockUpdates.push(query);
          return { count: 1 };
        },
      },
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        rawStatements.push({ sql: strings.join('?'), values });
        return 1;
      },
      materialWarehouseStock: {
        aggregate: async () => ({ _sum: { quantity: 8 } }),
        updateMany: async (query: Record<string, unknown>) => {
          warehouseUpdates.push(query);
          return { count: 1 };
        },
        findUnique: async () => ({ quantity: 0 }),
        upsert: async (query: Record<string, unknown>) => {
          warehouseOutputUpdate = query;
          return {};
        },
      },
      stockMovement: {
        create: async (query: Record<string, unknown>) => {
          movementCreates.push(query);
          return { id: 'movement-1' };
        },
      },
      journalEntry: {
        create: async () => ({ id: 'journal-1' }),
        findUnique: async () => ({
          id: 'journal-1',
          entityId: 'entity-a',
          entryNumber: 'PRD-1',
          date: new Date('2026-03-04T00:00:00.000Z'),
          reference: 'OF-1',
          description: 'Production',
          status: 'POSTED',
          createdByUserId: null,
          createdByUsername: null,
          approvedByUserId: null,
          approvedByUsername: null,
          approvedAt: null,
          postedByUserId: null,
          postedByUsername: null,
          postedAt: new Date('2026-03-04T00:00:00.000Z'),
          createdAt: new Date('2026-03-04T00:00:00.000Z'),
          lines: [],
        }),
      },
      journalEntryAuditRecord: {
        findUnique: async () => null,
        create: async () => ({}),
      },
      journalEntryAuditChainHead: {
        upsert: async () => ({
          entityId: 'entity-a',
          lastSequence: 0,
          lastHash: null,
          startedAt: new Date('2026-03-04T00:00:00.000Z'),
          createdAt: new Date('2026-03-04T00:00:00.000Z'),
          updatedAt: new Date('2026-03-04T00:00:00.000Z'),
        }),
        update: async () => ({}),
      },
    };
    stub(prisma, '$transaction', async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));

    try {
      const posted = await ProductionService.postOrder('order-1', 'entity-a');
      assert.equal((statusUpdate?.where as Record<string, unknown>).status, 'DRAFT');
      assert.deepEqual(stockUpdates, [
        {
          where: { id: 'finished', entityId: 'entity-a', quantity: { lte: 2_147_483_635 } },
          data: { quantity: { increment: 12 }, costPrice: 10 / 12 },
        },
      ]);
      assert.deepEqual(warehouseUpdates, []);
      assert.equal(rawStatements.length, 2);
      assert.match(rawStatements[0].sql, /UPDATE "Material"/);
      assert.match(rawStatements[0].sql, /"quantity" - "reservedQuantity"/);
      assert.deepEqual(rawStatements[0].values, [8, 'raw', 'entity-a', 8]);
      assert.match(rawStatements[1].sql, /UPDATE "MaterialWarehouseStock"/);
      assert.match(rawStatements[1].sql, /"quantity" - "reservedQuantity"/);
      assert.deepEqual(rawStatements[1].values, [8, 'entity-a', 'raw', 'warehouse-a', 8]);
      assert.equal((warehouseOutputUpdate?.create as Record<string, unknown>).quantity, 12);
      assert.deepEqual(movementCreates.map((movement) => {
        const data = movement.data as Record<string, unknown>;
        return { movementType: data.movementType, deltaQuantity: data.deltaQuantity, warehouseId: data.warehouseId };
      }), [
        { movementType: 'PRODUCTION_CONSUMPTION', deltaQuantity: -8, warehouseId: 'warehouse-a' },
        { movementType: 'PRODUCTION_OUTPUT', deltaQuantity: 12, warehouseId: 'warehouse-a' },
      ]);
      assert.equal(posted?.id, 'order-1');
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('rejects posting when a material update reports insufficient stock', async () => {
    const restorers: Array<() => void> = [];
    const original = Object.getOwnPropertyDescriptor(prisma, '$transaction');
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: async (callback: (tx: unknown) => Promise<unknown>) => callback({
        monthlyCloseLock: { findFirst: async () => null },
        entity: {
          findUnique: async () => ({
            country: {
              id: 'country-a',
              code: 'TN',
              stockAssetAccountCode: '31',
              stockAdjustmentAccountCode: '68',
              productionWipAccountCode: '33',
              productionLaborAccountCode: null,
              productionOverheadAccountCode: null,
            },
          }),
        },
        chartOfAccount: {
          findMany: async () => [
            { code: '31', type: 'Asset' },
            { code: '33', type: 'Asset' },
          ],
        },
        productionOrder: {
          findFirst: async () => ({
            id: 'order-1',
            entityId: 'entity-a',
            outputMaterialId: 'finished',
            outputQuantity: 2,
            laborCost: 0,
            overheadCost: 0,
            scrapQuantity: 0,
            status: 'DRAFT',
            outputMaterial: { id: 'finished', sku: 'FIN', name: 'Finished', quantity: 0, costPrice: 0 },
            consumptions: [{ materialId: 'raw', quantity: 10 }],
          }),
          updateMany: async () => ({ count: 1 }),
        },
        material: {
          findMany: async () => [{ id: 'raw', costPrice: 1 }],
          updateMany: async () => ({ count: 0 }),
        },
        $executeRaw: async () => 0,
        materialWarehouseStock: { aggregate: async () => ({ _sum: { quantity: 0 } }) },
        stockMovement: { create: async () => ({ id: 'movement-1' }) },
        journalEntry: { create: async () => ({ id: 'journal-1' }) },
      }),
    });
    try {
      await assert.rejects(ProductionService.postOrder('order-1', 'entity-a'), /Stock insuffisant/);
    } finally {
      if (original) Object.defineProperty(prisma, '$transaction', original);
      else Reflect.deleteProperty(prisma, '$transaction');
    }
  });

  it('cancels only draft orders with an authenticated actor and a recorded reason', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let updateQuery: Record<string, unknown> | undefined;
    stub(prisma.productionOrder, 'findFirst', async () => ({ id: 'order-1', status: 'DRAFT' }));
    stub(prisma.productionOrder, 'updateMany', async (query: Record<string, unknown>) => {
      updateQuery = query;
      return { count: 1 };
    });
    stub(prisma.productionOrder, 'findFirst', async (query: Record<string, unknown>) => {
      if (query.select) return { id: 'order-1', status: 'DRAFT' };
      return { id: 'order-1', status: 'CANCELLED' };
    });

    try {
      const order = await ProductionService.cancelDraftOrder(
        'order-1',
        'entity-a',
        'Ordre saisi par erreur',
        { id: 'user-1', username: 'logistics' },
      );
      assert.deepEqual(updateQuery?.where, { id: 'order-1', entityId: 'entity-a', status: 'DRAFT' });
      assert.deepEqual(updateQuery?.data, {
        status: 'CANCELLED',
        cancelledAt: (updateQuery?.data as Record<string, unknown>).cancelledAt,
        cancelledByUserId: 'user-1',
        cancelledByUsername: 'logistics',
        cancellationReason: 'Ordre saisi par erreur',
      });
      assert.ok((updateQuery?.data as Record<string, unknown>).cancelledAt instanceof Date);
      assert.equal(order?.status, 'CANCELLED');
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('refuses cancellation without a valid reason or for a posted order', async () => {
    const original = Object.getOwnPropertyDescriptor(prisma.productionOrder, 'findFirst');
    Object.defineProperty(prisma.productionOrder, 'findFirst', {
      configurable: true,
      value: async () => ({ id: 'order-1', status: 'POSTED' }),
    });
    try {
      await assert.rejects(ProductionService.cancelDraftOrder(
        'order-1', 'entity-a', 'ok', { id: 'user-1', username: 'logistics' },
      ), (error: unknown) => error instanceof ProductionRequestError && error.statusCode === 400);
      await assert.rejects(ProductionService.cancelDraftOrder(
        'order-1', 'entity-a', 'Annulation demandée', { id: 'user-1', username: 'logistics' },
      ), (error: unknown) => error instanceof ProductionRequestError && error.statusCode === 409);
    } finally {
      if (original) Object.defineProperty(prisma.productionOrder, 'findFirst', original);
      else Reflect.deleteProperty(prisma.productionOrder, 'findFirst');
    }
  });
});
