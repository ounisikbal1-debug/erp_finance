import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import { getModuleRoles } from '../../../application/auth';
import {
  MaintenanceService,
  type EquipmentRecord,
  type MaintenanceRepository,
  type MaintenanceWorkOrder,
} from '../../../application/modules/maintenance/service';
import { isWorkOrderOverdue } from '../../../application/modules/maintenance/validation';
import { createMaintenanceRouter } from './index';

function createRepository(): MaintenanceRepository {
  const equipment: EquipmentRecord[] = [];
  const workOrders: MaintenanceWorkOrder[] = [];
  return {
    async listEquipment(entityId) {
      return equipment.filter((item) => item.entityId === entityId);
    },
    async findEquipment(entityId, id) {
      return equipment.find((item) => item.entityId === entityId && item.id === id) ?? null;
    },
    async findEquipmentByAssetTag(entityId, assetTag) {
      return equipment.find((item) => item.entityId === entityId && item.assetTag === assetTag) ?? null;
    },
    async createEquipment(entityId, input) {
      const item: EquipmentRecord = {
        id: `equipment-${equipment.length + 1}`,
        entityId,
        currencyCode: 'TND',
        ...input,
        location: input.location ?? null,
        status: 'ACTIVE',
        isVehicle: input.isVehicle ?? false,
        vehicleRegistrationNumber: input.vehicleRegistrationNumber ?? null,
        vehicleOdometerKm: input.vehicleOdometerKm ?? null,
        vehicleFuelType: input.vehicleFuelType ?? null,
        vehicleInsuranceExpiry: input.vehicleInsuranceExpiry ?? null,
        vehicleNextServiceAt: input.vehicleNextServiceAt ?? null,
        vehicleNextServiceOdometerKm: input.vehicleNextServiceOdometerKm ?? null,
        vehicleAssignment: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      equipment.push(item);
      return item;
    },
    async listEmployees(entityId) {
      return entityId === 'entity-a'
        ? [{ id: 'employee-a', empId: 'EMP-A', firstName: 'Sami', lastName: 'Test' }]
        : [];
    },
    async findEmployee(entityId, employeeId) {
      return entityId === 'entity-a' && employeeId === 'employee-a'
        ? { id: 'employee-a', empId: 'EMP-A', firstName: 'Sami', lastName: 'Test' }
        : null;
    },
    async updateVehicleData(entityId, equipmentId, input) {
      const item = equipment.find((candidate) => candidate.entityId === entityId && candidate.id === equipmentId);
      if (!item || !item.isVehicle) return null;
      const { employeeId, ...vehicleFields } = input;
      Object.assign(item, vehicleFields);
      if (employeeId !== undefined) {
        item.vehicleAssignment = employeeId === null
          ? null
          : {
            employeeId,
            assignedAt: new Date('2026-01-02T00:00:00.000Z'),
            employee: { id: 'employee-a', empId: 'EMP-A', firstName: 'Sami', lastName: 'Test' },
          };
      }
      return item;
    },
    async listWorkOrders(entityId) {
      return workOrders.filter((item) => item.entityId === entityId);
    },
    async findWorkOrder(entityId, id) {
      return workOrders.find((item) => item.entityId === entityId && item.id === id) ?? null;
    },
    async createWorkOrder(entityId, input) {
      const order: MaintenanceWorkOrder = {
        id: `order-${workOrders.length + 1}`,
        entityId,
        ...input,
        status: 'PLANNED',
        completedAt: null,
        actualCost: null,
        actualCostCurrencyCode: null,
        completionOdometerKm: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      workOrders.push(order);
      return order;
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
      const order = workOrders.find((item) => item.entityId === entityId && item.id === id);
      if (!order || order.status !== expectedStatus) return null;
      if (completionDetails.completionOdometerKm !== null) {
        const item = equipment.find((candidate) => candidate.entityId === entityId && candidate.id === order.equipmentId);
        if (!item || item.vehicleOdometerKm !== expectedOdometerKm) return null;
        item.vehicleOdometerKm = completionDetails.completionOdometerKm;
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

describe('maintenance API', () => {
  it('protects role policy and serves entity-scoped equipment and work-order workflows', async () => {
    assert.deepEqual(getModuleRoles('maintenance'), ['ADMIN', 'LOGISTICS_MGR']);
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-a',
        username: 'logistics',
        role: 'LOGISTICS_MGR',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(createMaintenanceRouter(new MaintenanceService(createRepository())));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;

      assert.deepEqual(await (await fetch(`${base}/equipment`)).json(), []);
      assert.equal((await fetch(`${base}/equipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetTag: 'EQ-1',
          name: 'Véhicule de test',
          category: 'Transport',
          isVehicle: true,
          vehicleRegistrationNumber: 'TEST-123',
        }),
      })).status, 201);
      assert.deepEqual(await (await fetch(`${base}/employees`)).json(), [
        { id: 'employee-a', empId: 'EMP-A', firstName: 'Sami', lastName: 'Test' },
      ]);
      const vehicleUpdate = await fetch(`${base}/equipment/equipment-1/vehicle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleOdometerKm: 10000,
          vehicleNextServiceOdometerKm: 15000,
          employeeId: 'employee-a',
        }),
      });
      assert.equal(vehicleUpdate.status, 200);
      const vehicle = await vehicleUpdate.json() as EquipmentRecord;
      assert.equal(vehicle.vehicleOdometerKm, 10000);
      assert.equal(vehicle.vehicleAssignment?.employee.id, 'employee-a');
      const outOfScopeEmployee = await fetch(`${base}/equipment/equipment-1/vehicle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: 'employee-from-other-entity' }),
      });
      assert.equal(outOfScopeEmployee.status, 404);
      assert.equal((await fetch(`${base}/equipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetTag: 'EQ-1', name: '', category: 'Production' }),
      })).status, 400);
      const missingEquipmentOrder = await fetch(`${base}/work-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipmentId: 'missing-equipment',
          type: 'PREVENTIVE',
          description: 'Inspection',
          scheduledAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      });
      assert.equal(missingEquipmentOrder.status, 404);
      assert.deepEqual(await missingEquipmentOrder.json(), {
        error: 'Équipement introuvable pour cette entité.',
      });
      const invalidStatus = await fetch(`${base}/work-orders/not-found/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DONE' }),
      });
      assert.equal(invalidStatus.status, 400);
      assert.deepEqual(await invalidStatus.json(), {
        error: 'Le statut d’intervention est invalide.',
      });
      const orderResponse = await fetch(`${base}/work-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipmentId: 'equipment-1',
          type: 'PREVENTIVE',
          description: 'Inspection trimestrielle',
          scheduledAt: new Date(Date.now() - 60_000).toISOString(),
          entityId: 'entity-other',
        }),
      });
      assert.equal(orderResponse.status, 201);
      const order = await orderResponse.json() as {
        id: string;
        entityId: string;
        scheduledAt: string;
        status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
        completedAt: string | null;
        actualCost: number | null;
        actualCostCurrencyCode: string | null;
        completionOdometerKm: number | null;
      };
      assert.equal(order.entityId, 'entity-a');
      assert.equal(order.status, 'PLANNED');
      assert.equal(isWorkOrderOverdue(new Date(order.scheduledAt), order.status), true);
      assert.equal((await fetch(`${base}/work-orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      })).status, 200);
      assert.equal((await fetch(`${base}/work-orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PLANNED' }),
      })).status, 409);
      const completionResponse = await fetch(`${base}/work-orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'COMPLETED',
          actualCost: 75.5,
          completionOdometerKm: 11000,
        }),
      });
      assert.equal(completionResponse.status, 200);
      const completedOrder = await completionResponse.json() as typeof order;
      assert.equal(completedOrder.status, 'COMPLETED');
      assert.ok(completedOrder.completedAt);
      assert.equal(completedOrder.actualCost, 75.5);
      assert.equal(completedOrder.actualCostCurrencyCode, 'TND');
      assert.equal(completedOrder.completionOdometerKm, 11000);
      assert.equal(isWorkOrderOverdue(new Date(completedOrder.scheduledAt), completedOrder.status), false);
      const cancellationOrderResponse = await fetch(`${base}/work-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipmentId: 'equipment-1',
          type: 'CORRECTIVE',
          description: 'Intervention annulée de test',
          scheduledAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      });
      const cancellationOrder = await cancellationOrderResponse.json() as typeof order;
      assert.equal(cancellationOrderResponse.status, 201);
      const cancellationResponse = await fetch(`${base}/work-orders/${cancellationOrder.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      assert.equal(cancellationResponse.status, 200);
      const cancelledOrder = await cancellationResponse.json() as typeof order;
      assert.equal(cancelledOrder.status, 'CANCELLED');
      assert.equal(cancelledOrder.completedAt, null);
      assert.equal(isWorkOrderOverdue(new Date(cancelledOrder.scheduledAt), cancelledOrder.status), false);
      assert.equal((await fetch(`${base}/work-orders/${cancellationOrder.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      })).status, 409);

      const missingEntityApp = express();
      missingEntityApp.use(express.json());
      missingEntityApp.use(createMaintenanceRouter(new MaintenanceService(createRepository())));
      const missingEntityServer = createServer(missingEntityApp);
      await new Promise<void>((resolve) => missingEntityServer.listen(0, '127.0.0.1', resolve));
      try {
        const missingAddress = missingEntityServer.address();
        assert.ok(missingAddress && typeof missingAddress !== 'string');
        assert.equal((await fetch(`http://127.0.0.1:${missingAddress.port}/equipment`)).status, 403);
      } finally {
        await new Promise<void>((resolve, reject) => missingEntityServer.close((error) => error ? reject(error) : resolve()));
      }
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
