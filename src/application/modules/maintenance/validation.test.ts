import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isWorkOrderOverdue,
  isVehicleMaintenanceDue,
  validateEquipmentInput,
  validateVehicleEquipmentUpdate,
  validateWorkOrderCompletionDetails,
  validateWorkOrderInput,
  validateWorkOrderStatus,
} from './validation';

describe('maintenance input validation', () => {
  it('trims equipment fields and accepts optional location', () => {
    assert.deepEqual(validateEquipmentInput({
      assetTag: ' EQ-01 ',
      name: ' Presse ',
      category: ' Production ',
      location: ' Atelier A ',
    }), {
      assetTag: 'EQ-01',
      name: 'Presse',
      category: 'Production',
      location: 'Atelier A',
    });
  });

  it('rejects missing equipment fields and non-object input', () => {
    assert.throws(() => validateEquipmentInput(null), /Données équipement invalides/);
    assert.throws(() => validateEquipmentInput({ assetTag: 'EQ-01' }), /nom de l’équipement/);
  });

  it('validates vehicle fields and rejects vehicle data on non-vehicle equipment', () => {
    assert.deepEqual(validateEquipmentInput({
      assetTag: 'CAR-01',
      name: 'Fourgon',
      category: 'Transport',
      isVehicle: true,
      vehicleRegistrationNumber: 'TN-123',
      vehicleOdometerKm: 12000,
    }), {
      assetTag: 'CAR-01',
      name: 'Fourgon',
      category: 'Transport',
      isVehicle: true,
      vehicleRegistrationNumber: 'TN-123',
      vehicleOdometerKm: 12000,
      vehicleFuelType: undefined,
      vehicleInsuranceExpiry: undefined,
      vehicleNextServiceAt: undefined,
      vehicleNextServiceOdometerKm: undefined,
    });
    assert.throws(() => validateEquipmentInput({
      assetTag: 'EQ-01',
      name: 'Presse',
      category: 'Production',
      vehicleOdometerKm: 1,
    }), /que pour un véhicule/);
    assert.throws(() => validateVehicleEquipmentUpdate({ vehicleOdometerKm: -1 }), /nombre entier positif/);
    assert.throws(() => validateVehicleEquipmentUpdate({ vehicleInsuranceExpiry: '2026-02-30' }), /date d’expiration.*invalide/);
    assert.throws(() => validateVehicleEquipmentUpdate({}), /Aucune donnée véhicule/);
  });

  it('accepts a valid synthetic maintenance work order', () => {
    const result = validateWorkOrderInput({
      equipmentId: 'equipment-1',
      type: 'PREVENTIVE',
      description: 'Inspection trimestrielle',
      scheduledAt: '2026-12-01T08:30:00.000Z',
    });
    assert.equal(result.scheduledAt.toISOString(), '2026-12-01T08:30:00.000Z');
    assert.equal(result.type, 'PREVENTIVE');
  });

  it('rejects invalid work-order types, dates, and statuses', () => {
    assert.throws(() => validateWorkOrderInput({
      equipmentId: 'equipment-1',
      type: 'INSPECTION',
      description: 'Inspection',
      scheduledAt: '2026-12-01T08:30:00.000Z',
    }), /type d’intervention est invalide/);
    assert.throws(() => validateWorkOrderInput({
      equipmentId: 'equipment-1',
      type: 'CORRECTIVE',
      description: 'Réparation',
      scheduledAt: '2026-12-01',
    }), /date ISO en UTC/);
    assert.throws(() => validateWorkOrderInput({
      equipmentId: 'equipment-1',
      type: 'CORRECTIVE',
      description: 'Réparation',
      scheduledAt: '2026-02-30T08:30:00Z',
    }), /date prévue est invalide/);
    assert.throws(() => validateWorkOrderStatus('DONE'), /statut d’intervention est invalide/);
  });

  it('validates paired maintenance cost and odometer details', () => {
    assert.deepEqual(validateWorkOrderCompletionDetails({
      actualCost: 125.5,
      completionOdometerKm: 30000,
    }), {
      actualCost: 125.5,
      completionOdometerKm: 30000,
    });
    assert.deepEqual(validateWorkOrderCompletionDetails({}), {
      actualCost: null,
      completionOdometerKm: null,
    });
    assert.throws(() => validateWorkOrderCompletionDetails({
      actualCost: 125,
    }), /doivent être renseignés ensemble/);
    assert.throws(() => validateWorkOrderCompletionDetails({
      actualCost: -1,
      completionOdometerKm: 30000,
    }), /coût saisi doit être positif ou nul/);
    assert.throws(() => validateWorkOrderCompletionDetails({
      actualCost: 1.2345,
      completionOdometerKm: 30000,
    }), /au plus trois décimales/);
    assert.throws(() => validateWorkOrderCompletionDetails({
      actualCost: 125,
      completionOdometerKm: 30000.5,
    }), /kilométrage à la clôture doit être un nombre entier/);
  });

  it('marks only active work orders past their scheduled time as overdue', () => {
    const asOf = new Date('2026-12-01T10:00:00.000Z');
    const overdueAt = new Date('2026-12-01T09:59:59.999Z');
    const dueNow = new Date('2026-12-01T10:00:00.000Z');

    assert.equal(isWorkOrderOverdue(overdueAt, 'PLANNED', asOf), true);
    assert.equal(isWorkOrderOverdue(overdueAt, 'IN_PROGRESS', asOf), true);
    assert.equal(isWorkOrderOverdue(dueNow, 'PLANNED', asOf), false);
    assert.equal(isWorkOrderOverdue(overdueAt, 'COMPLETED', asOf), false);
    assert.equal(isWorkOrderOverdue(overdueAt, 'CANCELLED', asOf), false);
  });

  it('flags vehicle service due by date or odometer, not by unrelated equipment', () => {
    const asOf = new Date('2026-12-01T10:00:00.000Z');
    assert.equal(isVehicleMaintenanceDue({
      isVehicle: true,
      vehicleOdometerKm: 15000,
      vehicleNextServiceAt: null,
      vehicleNextServiceOdometerKm: 15000,
    }, asOf), true);
    assert.equal(isVehicleMaintenanceDue({
      isVehicle: true,
      vehicleOdometerKm: null,
      vehicleNextServiceAt: new Date('2026-12-01T00:00:00.000Z'),
      vehicleNextServiceOdometerKm: null,
    }, asOf), true);
    assert.equal(isVehicleMaintenanceDue({
      isVehicle: false,
      vehicleOdometerKm: 15000,
      vehicleNextServiceAt: new Date('2026-01-01T00:00:00.000Z'),
      vehicleNextServiceOdometerKm: 15000,
    }, asOf), false);
  });
});
