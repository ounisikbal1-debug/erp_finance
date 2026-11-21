import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import OperationalInsightsService from './operational-insights';

function stub(target: object, property: string, value: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, { configurable: true, value });
  return () => {
    if (original) Object.defineProperty(target, property, original);
    else Reflect.deleteProperty(target, property);
  };
}

describe('OperationalInsightsService', () => {
  it('returns entity-scoped aggregates only and classifies overdue operational items as of UTC day', async () => {
    const now = new Date('2026-11-07T18:30:00.000Z');
    const queries: Record<string, unknown> = {};
    let documentQueryCount = 0;
    const restorers = [
      stub(prisma.material, 'findMany', async (query: unknown) => {
        queries.materials = query;
        return [
          { quantity: 2, minimumStock: 5, unitCode: 'EA' },
          { quantity: 7, minimumStock: 5, unitCode: 'EA' },
          { quantity: 0, minimumStock: null, unitCode: 'EA' },
          { quantity: 0.0001, minimumStock: 1, unitCode: 'EA' },
        ];
      }),
      stub(prisma.purchaseOrder, 'count', async (query: unknown) => {
        const where = (query as { where: Record<string, unknown> }).where;
        if (where.status === 'TO_REVIEW') {
          queries.purchaseOrdersAwaitingReview = query;
          return 2;
        }
        if (where.expectedAt === null) {
          queries.approvedOrdersMissingExpectedDate = query;
          return 3;
        }
        queries.overduePurchaseOrders = query;
        return 1;
      }),
      stub(prisma.productionOrder, 'count', async (query: unknown) => {
        queries.productionOrders = query;
        return 3;
      }),
      stub(prisma.maintenanceWorkOrder, 'findMany', async (query: unknown) => {
        queries.maintenance = query;
        return [
          { scheduledAt: new Date('2026-11-06T00:00:00.000Z') },
          { scheduledAt: new Date('2026-11-07T00:00:00.000Z') },
          { scheduledAt: new Date('2026-11-08T00:00:00.000Z') },
        ];
      }),
      stub(prisma.qualityFinding, 'count', async (query: unknown) => {
        const where = (query as { where: Record<string, unknown> }).where;
        if ('severity' in where) {
          queries.highSeverityFindings = query;
          return 4;
        }
        if (where.dueAt === null) {
          queries.findingsMissingDueDate = query;
          return 1;
        }
        queries.overdueFindings = query;
        return 2;
      }),
      stub(prisma.qualityAction, 'count', async (query: unknown) => {
        const where = (query as { where: Record<string, unknown> }).where;
        if (where.dueAt === null) {
          queries.actionsMissingDueDate = query;
          return 2;
        }
        queries.qualityActions = query;
        return 1;
      }),
      stub(prisma.hrLeaveRequest, 'count', async (query: unknown) => {
        queries.leaveRequests = query;
        return 5;
      }),
      stub(prisma.employeeDocument, 'count', async (query: unknown) => {
        documentQueryCount += 1;
        if (documentQueryCount === 1) {
          queries.expiredDocuments = query;
          return 1;
        }
        if (documentQueryCount === 2) {
          queries.expiringDocuments = query;
          return 2;
        }
        queries.documentsMissingValidityDate = query;
        return 3;
      }),
    ];
    try {
      const snapshot = await OperationalInsightsService.getSnapshot('entity-a', now);
      assert.equal(snapshot.snapshotDate, '2026-11-07');
      assert.deepEqual(snapshot.stock, { lowStockItems: 1, monitoredItems: 2, unmonitoredItems: 1, invalidItems: 1 });
      assert.deepEqual(snapshot.purchases, {
        ordersAwaitingReview: 2,
        overdueApprovedOrders: 1,
        approvedOrdersMissingExpectedDate: 3,
      });
      assert.deepEqual(snapshot.production, { draftOrders: 3 });
      assert.deepEqual(snapshot.maintenance, { overdueOpenOrders: 1, openOrders: 3 });
      assert.deepEqual(snapshot.quality, {
        highSeverityOpenFindings: 4,
        overdueOpenFindings: 2,
        overdueActions: 1,
        openFindingsMissingDueDate: 1,
        openActionsMissingDueDate: 2,
      });
      assert.deepEqual(snapshot.hr, {
        pendingLeaveRequests: 5,
        expiredEmployeeDocuments: 1,
        documentsExpiringWithin30Days: 2,
        documentsMissingValidityDate: 3,
      });
      assert.equal((queries.materials as { where: { entityId: string } }).where.entityId, 'entity-a');
      assert.equal((queries.maintenance as { where: { entityId: string } }).where.entityId, 'entity-a');
      assert.deepEqual((queries.overduePurchaseOrders as {
        where: { expectedAt: { lt: Date } };
      }).where.expectedAt.lt, new Date('2026-11-07T00:00:00.000Z'));
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });
});
