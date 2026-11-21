import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MaintenanceService,
  type EquipmentRecord,
  type MaintenanceRepository,
  type MaintenanceWorkOrder,
} from './service';

function createRepository(isVehicle = false): MaintenanceRepository {
  const equipment: EquipmentRecord = {
    id: 'equipment-1',
    entityId: 'entity-1',
    currencyCode: 'TND',
    assetTag: 'EQ-01',
    name: 'Presse',
    category: 'Production',
    location: 'Atelier A',
    status: 'ACTIVE',
    isVehicle,
    vehicleRegistrationNumber: null,
    vehicleOdometerKm: isVehicle ? 12000 : null,
    vehicleFuelType: null,
    vehicleInsuranceExpiry: null,
    vehicleNextServiceAt: null,
    vehicleNextServiceOdometerKm: null,
    vehicleAssignment: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const employee = { id: 'employee-1', empId: 'EMP-01', firstName: 'Sami', lastName: 'Test' };
  const orders: MaintenanceWorkOrder[] = [];
  return {
    async listEquipment(entityId) {
      return entityId === equipment.entityId ? [equipment] : [];
    },
    async findEquipment(entityId, id) {
      return entityId === equipment.entityId && id === equipment.id ? equipment : null;
    },
    async findEquipmentByAssetTag(entityId, assetTag) {
      return entityId === equipment.entityId && assetTag === equipment.assetTag ? equipment : null;
    },
    async createEquipment(entityId, input) {
      return {
        id: 'equipment-2',
        ...input,
        location: input.location ?? null,
        entityId,
        currencyCode: equipment.currencyCode,
        status: 'ACTIVE',
        isVehicle: input.isVehicle ?? false,
        vehicleRegistrationNumber: input.vehicleRegistrationNumber ?? null,
        vehicleOdometerKm: input.vehicleOdometerKm ?? null,
        vehicleFuelType: input.vehicleFuelType ?? null,
        vehicleInsuranceExpiry: input.vehicleInsuranceExpiry ?? null,
        vehicleNextServiceAt: input.vehicleNextServiceAt ?? null,
        vehicleNextServiceOdometerKm: input.vehicleNextServiceOdometerKm ?? null,
        vehicleAssignment: null,
        createdAt: new Date(),
      };
    },
    async listEmployees(entityId) {
      return entityId === equipment.entityId ? [employee] : [];
    },
    async findEmployee(entityId, employeeId) {
      return entityId === equipment.entityId && employeeId === employee.id ? employee : null;
    },
    async updateVehicleData(entityId, equipmentId, input) {
      if (entityId !== equipment.entityId || equipmentId !== equipment.id || !equipment.isVehicle) return null;
      const { employeeId, ...vehicleFields } = input;
      Object.assign(equipment, vehicleFields);
      if (employeeId !== undefined) {
        equipment.vehicleAssignment = employeeId === null
          ? null
          : { employeeId, assignedAt: new Date(), employee };
      }
      return equipment;
    },
    async listWorkOrders(entityId) {
      return orders.filter((order) => order.entityId === entityId);
    },
    async createWorkOrder(entityId, input) {
      const order: MaintenanceWorkOrder = {
        id: 'order-1',
        entityId,
        ...input,
        status: 'PLANNED',
        completedAt: null,
        actualCost: null,
        actualCostCurrencyCode: null,
        completionOdometerKm: null,
        createdAt: new Date(),
      };
      orders.push(order);
      return order;
    },
    async findWorkOrder(entityId, id) {
      return orders.find((order) => order.entityId === entityId && order.id === id) ?? null;
    },
    async updateWorkOrderStatus(
      entityId,
      id,
      expectedStatus,
      status,
      completedAt,
      completionDetails,
      costCurrencyCode,
      expectedOdometerKm,
    ) {
      const order = orders.find((item) => item.entityId === entityId && item.id === id);
      if (!order || order.status !== expectedStatus) return null;
      if (completionDetails.completionOdometerKm !== null) {
        if (equipment.vehicleOdometerKm !== expectedOdometerKm) return null;
        equipment.vehicleOdometerKm = completionDetails.completionOdometerKm;
      }
      Object.assign(order, {
        status,
        completedAt,
        actualCost: completionDetails.actualCost,
        actualCostCurrencyCode: costCurrencyCode,
        completionOdometerKm: completionDetails.completionOdometerKm,
      });
      return order;
    },
  };
}

describe('MaintenanceService', () => {
  it('keeps equipment and work orders scoped to the requested entity', async () => {
    const service = new MaintenanceService(createRepository());
    assert.equal((await service.listEquipment('entity-1')).length, 1);
    assert.equal((await service.listEquipment('entity-2')).length, 0);
    await assert.rejects(
      service.createWorkOrder({
        equipmentId: 'equipment-1',
        type: 'PREVENTIVE',
        description: 'Inspection',
        scheduledAt: '2026-12-01T08:30:00.000Z',
      }, 'entity-2'),
      /Équipement introuvable pour cette entité/,
    );
  });

  it('prevents duplicate equipment codes within the same entity', async () => {
    const service = new MaintenanceService(createRepository());
    await assert.rejects(
      service.createEquipment({
        assetTag: 'EQ-01',
        name: 'Nouvelle presse',
        category: 'Production',
      }, 'entity-1'),
      (error: unknown) => error instanceof Error && 'status' in error && error.status === 409,
    );
  });

  it('updates scoped vehicle data, assigns employees, and prevents odometer rollback', async () => {
    const service = new MaintenanceService(createRepository(true));
    const updated = await service.updateVehicleData('equipment-1', {
      vehicleOdometerKm: 12500,
      employeeId: 'employee-1',
    }, 'entity-1');
    assert.equal(updated.vehicleOdometerKm, 12500);
    assert.equal(updated.vehicleAssignment?.employee.id, 'employee-1');

    await assert.rejects(
      service.updateVehicleData('equipment-1', { vehicleOdometerKm: 12499 }, 'entity-1'),
      (error: unknown) => error instanceof Error && 'status' in error && error.status === 409,
    );
    await assert.rejects(
      service.updateVehicleData('equipment-1', { employeeId: 'employee-from-another-entity' }, 'entity-1'),
      (error: unknown) => error instanceof Error && 'status' in error && error.status === 404,
    );
  });

  it('enforces work-order transitions and stamps completion', async () => {
    const service = new MaintenanceService(createRepository());
    const order = await service.createWorkOrder({
      equipmentId: 'equipment-1',
      type: 'PREVENTIVE',
      description: 'Inspection trimestrielle',
      scheduledAt: '2026-12-01T08:30:00.000Z',
    }, 'entity-1');
    const started = await service.updateWorkOrderStatus(order.id, 'IN_PROGRESS', 'entity-1');
    assert.equal(started.status, 'IN_PROGRESS');
    const completed = await service.updateWorkOrderStatus(order.id, 'COMPLETED', 'entity-1');
    assert.equal(completed.status, 'COMPLETED');
    assert.ok(completed.completedAt instanceof Date);
    await assert.rejects(
      service.updateWorkOrderStatus(order.id, 'PLANNED', 'entity-1'),
      /Transition de statut refusée/,
    );
  });

  it('records vehicle maintenance cost and monotonic completion odometer in functional currency', async () => {
    const service = new MaintenanceService(createRepository(true));
    const order = await service.createWorkOrder({
      equipmentId: 'equipment-1',
      type: 'CORRECTIVE',
      description: 'Révision',
      scheduledAt: '2026-12-01T08:30:00.000Z',
    }, 'entity-1');
    await service.updateWorkOrderStatus(order.id, 'IN_PROGRESS', 'entity-1');

    await assert.rejects(
      service.updateWorkOrderStatus(order.id, 'COMPLETED', 'entity-1', {
        actualCost: 500,
        completionOdometerKm: 11999,
      }),
      /kilométrage de clôture ne peut pas diminuer/,
    );
    const completed = await service.updateWorkOrderStatus(order.id, 'COMPLETED', 'entity-1', {
      actualCost: 500.125,
      completionOdometerKm: 12500,
    });
    assert.equal(completed.actualCost, 500.125);
    assert.equal(completed.actualCostCurrencyCode, 'TND');
    assert.equal(completed.completionOdometerKm, 12500);
  });

  it('rejects vehicle maintenance details on non-vehicle equipment', async () => {
    const service = new MaintenanceService(createRepository());
    const order = await service.createWorkOrder({
      equipmentId: 'equipment-1',
      type: 'PREVENTIVE',
      description: 'Entretien',
      scheduledAt: '2026-12-01T08:30:00.000Z',
    }, 'entity-1');
    await service.updateWorkOrderStatus(order.id, 'IN_PROGRESS', 'entity-1');
    await assert.rejects(
      service.updateWorkOrderStatus(order.id, 'COMPLETED', 'entity-1', {
        actualCost: 20,
        completionOdometerKm: 100,
      }),
      /réservés aux véhicules/,
    );
  });
});
