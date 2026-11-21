import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import { MaterialsService } from './service';

describe('MaterialsService stock pick and dispatch', () => {
  it('reserves on pick, releases once on cancellation, and leaves physical stock unchanged', async () => {
    const original = Object.getOwnPropertyDescriptor(prisma, '$transaction');
    let materialQuantity = 8;
    let materialReserved = 2;
    let warehouseQuantity = 5;
    let warehouseReserved = 2;
    let pickStatus = 'PICKED';
    let releaseCalls = 0;
    const pick = {
      id: 'pick-cancel',
      entityId: 'entity-a',
      status: 'PICKED',
      lines: [{ materialId: 'material-1', warehouseId: 'warehouse-1', quantity: 2 }],
      dispatch: null,
    };
    const transaction = {
      stockPick: {
        findFirst: async () => ({ ...pick, status: pickStatus }),
        updateMany: async () => {
          if (pickStatus !== 'PICKED') return { count: 0 };
          pickStatus = 'CANCELLED';
          return { count: 1 };
        },
        findUniqueOrThrow: async () => ({ ...pick, status: pickStatus }),
      },
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        releaseCalls += 1;
        const sql = strings.join('?');
        const quantity = Number(values[0]);
        if (sql.includes('UPDATE "MaterialWarehouseStock"')) {
          if (warehouseReserved < quantity) return 0;
          warehouseReserved -= quantity;
        } else {
          if (materialReserved < quantity) return 0;
          materialReserved -= quantity;
        }
        return 1;
      },
    };
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
    });

    try {
      const first = await MaterialsService.cancelStockPick('pick-cancel', 'entity-a', {
        id: 'user-1',
        username: 'logistics',
      });
      const retry = await MaterialsService.cancelStockPick('pick-cancel', 'entity-a', {
        id: 'user-1',
        username: 'logistics',
      });
      assert.equal(first.status, 'CANCELLED');
      assert.equal(retry.status, 'CANCELLED');
      assert.equal(pickStatus, 'CANCELLED');
      assert.equal(materialQuantity, 8);
      assert.equal(warehouseQuantity, 5);
      assert.equal(materialReserved, 0);
      assert.equal(warehouseReserved, 0);
      assert.equal(releaseCalls, 2, 'only the first cancellation releases stock counters');
    } finally {
      if (original) Object.defineProperty(prisma, '$transaction', original);
      else Reflect.deleteProperty(prisma, '$transaction');
    }
  });

  it('creates a non-posting pick and decrements stock only once on idempotent dispatch', async () => {
    const original = Object.getOwnPropertyDescriptor(prisma, '$transaction');
    let materialQuantity = 8;
    let materialReserved = 0;
    let warehouseQuantity = 5;
    let warehouseReserved = 0;
    let pickStatus = 'PICKED';
    let dispatchRecord: Record<string, unknown> | null = null;
    let pickCreated = false;
    let movementCount = 0;
    const pick = {
      id: 'pick-1',
      entityId: 'entity-a',
      reference: 'DELIVERY-001',
      reason: 'Commande client SO-1',
      status: 'PICKED',
      idempotencyKey: 'pick-once-1',
      createdByUserId: 'user-1',
      createdByUsername: 'logistics',
      createdAt: new Date('2026-11-10T12:00:00.000Z'),
      lines: [{
        id: 'pick-line-1',
        materialId: 'material-1',
        warehouseId: 'warehouse-1',
        quantity: 2,
        material: { id: 'material-1', sku: 'MAT-1', name: 'Article', unitCode: 'EA' },
        warehouse: { id: 'warehouse-1', code: 'WH-1', name: 'Dépôt' },
      }],
      dispatch: null,
    };
    const dispatchResult = {
      id: 'dispatch-1',
      entityId: 'entity-a',
      pickId: 'pick-1',
      idempotencyKey: 'dispatch-once-1',
      confirmedAt: new Date('2026-11-10T12:05:00.000Z'),
      confirmedByUserId: 'user-1',
      confirmedByUsername: 'logistics',
      pick: {
        ...pick,
        status: 'DISPATCHED',
        lines: [{
          ...pick.lines[0],
          material: { ...pick.lines[0].material },
          warehouse: { ...pick.lines[0].warehouse },
        }],
      },
    };
    const transaction = {
      stockPick: {
        findUnique: async () => pickCreated ? pick : null,
        create: async () => {
          pickCreated = true;
          return pick;
        },
        findUniqueOrThrow: async () => pick,
        findFirst: async () => ({ ...pick, status: pickStatus, dispatch: dispatchRecord, lines: [{
          ...pick.lines[0],
          material: { id: 'material-1', quantity: materialQuantity, unitCode: 'EA' },
          warehouse: { id: 'warehouse-1' },
        }] }),
        updateMany: async () => {
          pickStatus = 'DISPATCHED';
          return { count: 1 };
        },
      },
      stockPickLine: { create: async () => ({}) },
      stockDispatch: {
        findUnique: async () => dispatchRecord,
        create: async () => {
          dispatchRecord = dispatchResult;
          return dispatchResult;
        },
        findUniqueOrThrow: async () => dispatchResult,
      },
      material: {
        findMany: async () => [{ id: 'material-1', unitCode: 'EA' }],
      },
      warehouse: { findMany: async () => [{ id: 'warehouse-1' }] },
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?');
        const quantity = Number(values[0]);
        if (sql.includes('UPDATE "MaterialWarehouseStock"')) {
          if (sql.includes('"reservedQuantity" +')) {
            if (warehouseQuantity - warehouseReserved < quantity) return 0;
            warehouseReserved += quantity;
          } else if (sql.includes('"reservedQuantity" -')) {
            if (warehouseQuantity < quantity || warehouseReserved < quantity) return 0;
            warehouseQuantity -= quantity;
            warehouseReserved -= quantity;
          }
          return 1;
        }
        if (sql.includes('"reservedQuantity" +')) {
          if (materialQuantity - materialReserved < quantity) return 0;
          materialReserved += quantity;
        } else if (sql.includes('"reservedQuantity" -')) {
          if (materialQuantity < quantity || materialReserved < quantity) return 0;
          materialQuantity -= quantity;
          materialReserved -= quantity;
        }
        return 1;
      },
      stockMovement: {
        create: async () => {
          movementCount += 1;
          return {};
        },
      },
    };
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
    });

    try {
      const created = await MaterialsService.createStockPick({
        reference: 'DELIVERY-001',
        reason: 'Commande client SO-1',
        idempotencyKey: 'pick-once-1',
        lines: [{ materialId: 'material-1', warehouseId: 'warehouse-1', quantity: 2 }],
      }, 'entity-a', { id: 'user-1', username: 'logistics' });
      assert.equal(created.id, 'pick-1');
      assert.equal(materialQuantity, 8);
      assert.equal(warehouseQuantity, 5);
      assert.equal(materialReserved, 2);
      assert.equal(warehouseReserved, 2);
      assert.equal(movementCount, 0);

      const retriedPick = await MaterialsService.createStockPick({
        reference: 'DELIVERY-001',
        reason: 'Commande client SO-1',
        idempotencyKey: 'pick-once-1',
        lines: [{ materialId: 'material-1', warehouseId: 'warehouse-1', quantity: 2 }],
      }, 'entity-a', { id: 'user-1', username: 'logistics' });
      assert.equal(retriedPick.id, 'pick-1');
      assert.equal(materialReserved, 2);
      assert.equal(warehouseReserved, 2);

      const dispatched = await MaterialsService.confirmStockDispatch('pick-1', {
        idempotencyKey: 'dispatch-once-1',
      }, 'entity-a', { id: 'user-1', username: 'logistics' });
      assert.equal(dispatched.id, 'dispatch-1');
      assert.equal(materialQuantity, 6);
      assert.equal(warehouseQuantity, 3);
      assert.equal(materialReserved, 0);
      assert.equal(warehouseReserved, 0);
      assert.equal(movementCount, 1);
      assert.equal(pickStatus, 'DISPATCHED');
      assert.equal(dispatchRecord && 'idempotencyKey' in dispatchRecord, true);

      const retried = await MaterialsService.confirmStockDispatch('pick-1', {
        idempotencyKey: 'dispatch-once-1',
      }, 'entity-a', { id: 'user-1', username: 'logistics' });
      assert.equal(retried.id, 'dispatch-1');
      assert.equal(materialQuantity, 6);
      assert.equal(warehouseQuantity, 3);
      assert.equal(movementCount, 1);
      await assert.rejects(
        MaterialsService.cancelStockPick('pick-1', 'entity-a', { id: 'user-1', username: 'logistics' }),
        /Seul un bon préparé et non expédié peut être annulé/,
      );
    } finally {
      if (original) Object.defineProperty(prisma, '$transaction', original);
      else Reflect.deleteProperty(prisma, '$transaction');
    }
  });
});
