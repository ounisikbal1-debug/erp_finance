import prisma from '../../../data/prisma/client';
import { toStockQuantityMilliUnits } from '../materials/quantity';

const DISCRETE_STOCK_UNITS = new Set(['EA', 'BOX', 'PACK']);
const KNOWN_STOCK_UNITS = new Set(['EA', 'KG', 'G', 'L', 'ML', 'M', 'M2', 'M3', 'BOX', 'PACK']);

function isValidStockValue(value: number, unitCode: string): boolean {
  const normalizedUnitCode = unitCode.toUpperCase();
  if (!KNOWN_STOCK_UNITS.has(normalizedUnitCode)) return false;
  const milliUnits = toStockQuantityMilliUnits(value);
  return milliUnits !== null
    && (!DISCRETE_STOCK_UNITS.has(normalizedUnitCode) || milliUnits % 1000 === 0);
}

export class OperationalInsightsService {
  static async getSnapshot(entityId: string, now = new Date()) {
    const asOf = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const nextThirtyDays = new Date(asOf.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [
      materials,
      purchaseOrdersAwaitingReview,
      overduePurchaseOrders,
      approvedPurchaseOrdersMissingExpectedDate,
      draftProductionOrders,
      maintenanceOrders,
      highSeverityOpenFindings,
      overdueQualityFindings,
      overdueQualityActions,
      pendingLeaveRequests,
      expiredEmployeeDocuments,
      documentsExpiringSoon,
      documentsMissingValidityDate,
      openFindingsMissingDueDate,
      openActionsMissingDueDate,
    ] = await Promise.all([
      prisma.material.findMany({
        where: { entityId },
        select: { quantity: true, minimumStock: true, unitCode: true },
      }),
      prisma.purchaseOrder.count({
        where: { entityId, status: 'TO_REVIEW' },
      }),
      prisma.purchaseOrder.count({
        where: { entityId, status: 'APPROVED', expectedAt: { lt: asOf } },
      }),
      prisma.purchaseOrder.count({
        where: { entityId, status: 'APPROVED', expectedAt: null },
      }),
      prisma.productionOrder.count({
        where: { entityId, status: 'DRAFT' },
      }),
      prisma.maintenanceWorkOrder.findMany({
        where: { entityId, status: { in: ['PLANNED', 'IN_PROGRESS'] } },
        select: { scheduledAt: true },
      }),
      prisma.qualityFinding.count({
        where: {
          entityId,
          status: { notIn: ['CLOSED', 'CANCELLED'] },
          severity: { in: ['HIGH', 'CRITICAL'] },
        },
      }),
      prisma.qualityFinding.count({
        where: {
          entityId,
          status: { notIn: ['CLOSED', 'CANCELLED'] },
          dueAt: { lt: asOf },
        },
      }),
      prisma.qualityAction.count({
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          dueAt: { lt: asOf },
          finding: { entityId, status: { notIn: ['CLOSED', 'CANCELLED'] } },
        },
      }),
      prisma.hrLeaveRequest.count({
        where: { entityId, status: 'PENDING' },
      }),
      prisma.employeeDocument.count({
        where: {
          employee: { entityId },
          status: 'ACTIVE',
          validUntil: { lt: asOf },
        },
      }),
      prisma.employeeDocument.count({
        where: {
          employee: { entityId },
          status: 'ACTIVE',
          validUntil: { gte: asOf, lt: nextThirtyDays },
        },
      }),
      prisma.employeeDocument.count({
        where: {
          employee: { entityId },
          status: 'ACTIVE',
          validUntil: null,
        },
      }),
      prisma.qualityFinding.count({
        where: {
          entityId,
          status: { notIn: ['CLOSED', 'CANCELLED'] },
          dueAt: null,
        },
      }),
      Promise.resolve(0),
    ]);

    return {
      snapshotDate: asOf.toISOString().slice(0, 10),
      stock: {
        lowStockItems: materials.filter((material) => material.minimumStock !== null
          && isValidStockValue(material.quantity, material.unitCode)
          && isValidStockValue(material.minimumStock, material.unitCode)
          && material.quantity < material.minimumStock).length,
        monitoredItems: materials.filter((material) => material.minimumStock !== null
          && isValidStockValue(material.quantity, material.unitCode)
          && isValidStockValue(material.minimumStock, material.unitCode)).length,
        unmonitoredItems: materials.filter((material) => material.minimumStock === null
          && isValidStockValue(material.quantity, material.unitCode)).length,
        invalidItems: materials.filter((material) => !isValidStockValue(material.quantity, material.unitCode)
          || (material.minimumStock !== null && !isValidStockValue(material.minimumStock, material.unitCode))).length,
      },
      purchases: {
        ordersAwaitingReview: purchaseOrdersAwaitingReview,
        overdueApprovedOrders: overduePurchaseOrders,
        approvedOrdersMissingExpectedDate: approvedPurchaseOrdersMissingExpectedDate,
      },
      production: { draftOrders: draftProductionOrders },
      maintenance: {
        overdueOpenOrders: maintenanceOrders.filter((order) => order.scheduledAt < asOf).length,
        openOrders: maintenanceOrders.length,
      },
      quality: {
        highSeverityOpenFindings,
        overdueOpenFindings: overdueQualityFindings,
        overdueActions: overdueQualityActions,
        openFindingsMissingDueDate,
        openActionsMissingDueDate,
      },
      hr: {
        pendingLeaveRequests,
        expiredEmployeeDocuments,
        documentsExpiringWithin30Days: documentsExpiringSoon,
        documentsMissingValidityDate,
      },
    };
  }
}

export default OperationalInsightsService;
