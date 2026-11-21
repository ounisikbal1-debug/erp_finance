import prisma from '../../../data/prisma/client';
import type { Prisma } from '@prisma/client';
import { MaintenanceRequestError } from './validation';
import type {
  EquipmentRecord,
  MaintenanceRepository,
  MaintenanceWorkOrder,
} from './service';
import type { EquipmentStatus, MaintenanceType, WorkOrderStatus } from './validation';

function assertEquipmentStatus(value: string): EquipmentStatus {
  if (value === 'ACTIVE' || value === 'OUT_OF_SERVICE' || value === 'RETIRED') return value;
  throw new Error(`Statut équipement non pris en charge dans la base : ${value}`);
}

function assertMaintenanceType(value: string): MaintenanceType {
  if (value === 'PREVENTIVE' || value === 'CORRECTIVE') return value;
  throw new Error(`Type d’intervention non pris en charge dans la base : ${value}`);
}

function assertWorkOrderStatus(value: string): WorkOrderStatus {
  if (value === 'PLANNED' || value === 'IN_PROGRESS' || value === 'COMPLETED' || value === 'CANCELLED') {
    return value;
  }
  throw new Error(`Statut d’intervention non pris en charge dans la base : ${value}`);
}

const EQUIPMENT_INCLUDE = {
  entity: {
    select: {
      country: { select: { currencyCode: true } },
    },
  },
  vehicleAssignment: {
    include: {
      employee: {
        select: { id: true, empId: true, firstName: true, lastName: true },
      },
    },
  },
} satisfies Prisma.EquipmentInclude;

type EquipmentRow = Prisma.EquipmentGetPayload<{ include: typeof EQUIPMENT_INCLUDE }>;

function toEquipmentRecord(row: EquipmentRow): EquipmentRecord {
  const { entity, ...equipment } = row;
  return {
    ...equipment,
    currencyCode: entity.country.currencyCode,
    status: assertEquipmentStatus(equipment.status),
    vehicleAssignment: equipment.vehicleAssignment
      ? {
        employeeId: equipment.vehicleAssignment.employeeId,
        assignedAt: equipment.vehicleAssignment.assignedAt,
        employee: equipment.vehicleAssignment.employee,
      }
      : null,
  };
}

function toWorkOrderRecord(row: {
  id: string;
  entityId: string;
  equipmentId: string;
  type: string;
  description: string;
  scheduledAt: Date;
  status: string;
  completedAt: Date | null;
  actualCost: number | null;
  actualCostCurrencyCode: string | null;
  completionOdometerKm: number | null;
  createdAt: Date;
}): MaintenanceWorkOrder {
  return {
    ...row,
    type: assertMaintenanceType(row.type),
    status: assertWorkOrderStatus(row.status),
  };
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'P2002';
}

export class PrismaMaintenanceRepository implements MaintenanceRepository {
  async listEquipment(entityId: string) {
    const records = await prisma.equipment.findMany({
      where: { entityId },
      orderBy: [{ assetTag: 'asc' }],
      include: EQUIPMENT_INCLUDE,
    });
    return records.map(toEquipmentRecord);
  }

  async findEquipment(entityId: string, equipmentId: string) {
    const record = await prisma.equipment.findFirst({
      where: { id: equipmentId, entityId },
      include: EQUIPMENT_INCLUDE,
    });
    return record ? toEquipmentRecord(record) : null;
  }

  async findEquipmentByAssetTag(entityId: string, assetTag: string) {
    const record = await prisma.equipment.findUnique({
      where: { entityId_assetTag: { entityId, assetTag } },
      include: EQUIPMENT_INCLUDE,
    });
    return record ? toEquipmentRecord(record) : null;
  }

  async createEquipment(entityId: string, input: Parameters<MaintenanceRepository['createEquipment']>[1]) {
    try {
      const record = await prisma.equipment.create({
        data: { ...input, entityId },
        include: EQUIPMENT_INCLUDE,
      });
      return toEquipmentRecord(record);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        if (input.vehicleRegistrationNumber) {
          throw new MaintenanceRequestError('Cette immatriculation est déjà utilisée dans cette entité.', 409);
        }
        throw new MaintenanceRequestError('Ce code équipement existe déjà dans cette entité.', 409);
      }
      throw error;
    }
  }

  async listEmployees(entityId: string) {
    return prisma.employee.findMany({
      where: { entityId },
      select: { id: true, empId: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    });
  }

  async findEmployee(entityId: string, employeeId: string) {
    return prisma.employee.findFirst({
      where: { id: employeeId, entityId },
      select: { id: true, empId: true, firstName: true, lastName: true },
    });
  }

  async updateVehicleData(
    entityId: string,
    equipmentId: string,
    input: Parameters<MaintenanceRepository['updateVehicleData']>[2],
  ) {
    const { employeeId, ...equipmentData } = input;
    try {
      return await prisma.$transaction(async (tx) => {
        const current = await tx.equipment.findFirst({
          where: { id: equipmentId, entityId, isVehicle: true },
          select: { vehicleOdometerKm: true },
        });
        if (!current) return null;

        if (Object.keys(equipmentData).length > 0) {
          const result = await tx.equipment.updateMany({
            where: {
              id: equipmentId,
              entityId,
              isVehicle: true,
              vehicleOdometerKm: current.vehicleOdometerKm,
            },
            data: equipmentData,
          });
          if (result.count !== 1) return null;
        }

        if (employeeId !== undefined) {
          if (employeeId === null) {
            await tx.equipmentVehicleAssignment.deleteMany({
              where: { entityId, equipmentId },
            });
          } else {
            await tx.equipmentVehicleAssignment.upsert({
              where: { equipmentId_entityId: { equipmentId, entityId } },
              create: { equipmentId, entityId, employeeId },
              update: { employeeId, assignedAt: new Date() },
            });
          }
        }

        const updated = await tx.equipment.findFirst({
          where: { id: equipmentId, entityId },
          include: EQUIPMENT_INCLUDE,
        });
        return updated ? toEquipmentRecord(updated) : null;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error) && input.vehicleRegistrationNumber) {
        throw new MaintenanceRequestError('Cette immatriculation est déjà utilisée dans cette entité.', 409);
      }
      throw error;
    }
  }

  async listWorkOrders(entityId: string) {
    const records = await prisma.maintenanceWorkOrder.findMany({
      where: { entityId },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
    });
    return records.map(toWorkOrderRecord);
  }

  async createWorkOrder(entityId: string, input: Parameters<MaintenanceRepository['createWorkOrder']>[1]) {
    const record = await prisma.maintenanceWorkOrder.create({
      data: { ...input, entityId },
    });
    return toWorkOrderRecord(record);
  }

  async findWorkOrder(entityId: string, workOrderId: string) {
    const record = await prisma.maintenanceWorkOrder.findFirst({
      where: { id: workOrderId, entityId },
    });
    return record ? toWorkOrderRecord(record) : null;
  }

  async updateWorkOrderStatus(
    entityId: string,
    workOrderId: string,
    expectedStatus: WorkOrderStatus,
    status: WorkOrderStatus,
    completedAt: Date | null,
    completionDetails: Parameters<MaintenanceRepository['updateWorkOrderStatus']>[5],
    costCurrencyCode: string | null,
    expectedOdometerKm: number | null,
  ) {
    class ConcurrentVehicleUpdate extends Error {}
    try {
      return await prisma.$transaction(async (tx) => {
        const current = await tx.maintenanceWorkOrder.findFirst({
          where: { id: workOrderId, entityId, status: expectedStatus },
          select: { equipmentId: true },
        });
        if (!current) return null;
        const result = await tx.maintenanceWorkOrder.updateMany({
          where: { id: workOrderId, entityId, status: expectedStatus },
          data: {
            status,
            completedAt,
            actualCost: completionDetails.actualCost,
            actualCostCurrencyCode: costCurrencyCode,
            completionOdometerKm: completionDetails.completionOdometerKm,
          },
        });
        if (result.count !== 1) return null;

        if (completionDetails.completionOdometerKm !== null) {
          const equipmentUpdate = await tx.equipment.updateMany({
            where: {
              id: current.equipmentId,
              entityId,
              isVehicle: true,
              vehicleOdometerKm: expectedOdometerKm,
            },
            data: { vehicleOdometerKm: completionDetails.completionOdometerKm },
          });
          if (equipmentUpdate.count !== 1) throw new ConcurrentVehicleUpdate();
        }

        const record = await tx.maintenanceWorkOrder.findFirst({
          where: { id: workOrderId, entityId },
        });
        return record ? toWorkOrderRecord(record) : null;
      });
    } catch (error) {
      if (error instanceof ConcurrentVehicleUpdate) return null;
      throw error;
    }
  }
}
