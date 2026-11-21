import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import { MaintenanceService } from './service';
import { PrismaMaintenanceRepository } from './repository';

const databaseTest = process.env.NODE_ENV === 'test' && Boolean(process.env.SAFE_ERP_TEST_DATABASE_URL)
  ? describe
  : describe.skip;

after(async () => {
  await prisma.$disconnect();
});

databaseTest('PrismaMaintenanceRepository (isolated test database)', () => {
  it('persists scoped equipment, work orders, and status history', async () => {
    const suffix = randomUUID();
    const country = await prisma.countryProfile.create({
      data: { code: `MNT${suffix.slice(0, 6)}`, name: `Maintenance ${suffix}` },
    });
    const firstEntity = await prisma.entity.create({
      data: { code: `MNT-A-${suffix}`, name: `Maintenance A ${suffix}`, countryId: country.id },
    });
    const secondEntity = await prisma.entity.create({
      data: { code: `MNT-B-${suffix}`, name: `Maintenance B ${suffix}`, countryId: country.id },
    });
    const employee = await prisma.employee.create({
      data: {
        empId: `EMP-${suffix}`,
        firstName: 'Salarié',
        lastName: 'Synthétique',
        email: `maintenance-${suffix}@example.test`,
        entityId: firstEntity.id,
      },
    });
    const service = new MaintenanceService(new PrismaMaintenanceRepository());

    try {
      const equipment = await service.createEquipment({
        assetTag: 'EQ-TEST-01',
        name: 'Équipement fictif',
        category: 'Test',
        location: 'Atelier de test',
      }, firstEntity.id);
      assert.equal((await service.listEquipment(firstEntity.id)).length, 1);
      assert.equal((await service.listEquipment(secondEntity.id)).length, 0);
      await assert.rejects(service.createEquipment({
        assetTag: 'EQ-TEST-01',
        name: 'Doublon fictif',
        category: 'Test',
      }, firstEntity.id), /existe déjà/);
      const vehicle = await service.createEquipment({
        assetTag: 'VEH-TEST-01',
        name: 'Véhicule fictif',
        category: 'Transport',
        isVehicle: true,
        vehicleRegistrationNumber: `TN-${suffix.slice(0, 8)}`,
      }, firstEntity.id);
      assert.equal((await service.listEmployees(firstEntity.id))[0]?.id, employee.id);
      assert.deepEqual(await service.listEmployees(secondEntity.id), []);
      const trackedVehicle = await service.updateVehicleData(vehicle.id, {
        vehicleOdometerKm: 12500,
        vehicleNextServiceOdometerKm: 15000,
        employeeId: employee.id,
      }, firstEntity.id);
      assert.equal(trackedVehicle.vehicleOdometerKm, 12500);
      assert.equal(trackedVehicle.vehicleAssignment?.employee.id, employee.id);
      await assert.rejects(service.updateVehicleData(vehicle.id, {
        vehicleOdometerKm: 12000,
      }, firstEntity.id), /kilométrage ne peut pas diminuer/);
      await assert.rejects(service.updateVehicleData(vehicle.id, {
        employeeId: employee.id,
      }, secondEntity.id), /introuvable pour cette entité/);
      await assert.rejects(service.createWorkOrder({
        equipmentId: equipment.id,
        type: 'PREVENTIVE',
        description: 'Intervention hors périmètre',
        scheduledAt: '2026-12-01T08:30:00.000Z',
      }, secondEntity.id), /introuvable pour cette entité/);

      const order = await service.createWorkOrder({
        equipmentId: equipment.id,
        type: 'PREVENTIVE',
        description: 'Inspection de test',
        scheduledAt: '2026-12-01T08:30:00.000Z',
      }, firstEntity.id);
      assert.equal((await service.listWorkOrders(firstEntity.id)).length, 1);
      const started = await service.updateWorkOrderStatus(order.id, 'IN_PROGRESS', firstEntity.id);
      const completed = await service.updateWorkOrderStatus(order.id, 'COMPLETED', firstEntity.id);
      assert.equal(started.status, 'IN_PROGRESS');
      assert.equal(completed.status, 'COMPLETED');
      assert.ok(completed.completedAt instanceof Date);

      const vehicleOrder = await service.createWorkOrder({
        equipmentId: vehicle.id,
        type: 'PREVENTIVE',
        description: 'Entretien véhicule synthétique',
        scheduledAt: '2026-12-02T08:30:00.000Z',
      }, firstEntity.id);
      await service.updateWorkOrderStatus(vehicleOrder.id, 'IN_PROGRESS', firstEntity.id);
      const completedVehicleOrder = await service.updateWorkOrderStatus(
        vehicleOrder.id,
        'COMPLETED',
        firstEntity.id,
        { actualCost: 245.75, completionOdometerKm: 12525 },
      );
      assert.equal(completedVehicleOrder.actualCost, 245.75);
      assert.equal(completedVehicleOrder.actualCostCurrencyCode, 'TND');
      assert.equal(completedVehicleOrder.completionOdometerKm, 12525);
      assert.equal(
        (await service.listEquipment(firstEntity.id)).find((item) => item.id === vehicle.id)?.vehicleOdometerKm,
        12525,
      );
      assert.equal((await service.listWorkOrders(secondEntity.id)).length, 0);
    } finally {
      await prisma.entity.deleteMany({ where: { id: { in: [firstEntity.id, secondEntity.id] } } });
      await prisma.countryProfile.delete({ where: { id: country.id } });
    }
  });
});
