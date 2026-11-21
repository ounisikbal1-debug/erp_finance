export type EquipmentStatus = 'ACTIVE' | 'OUT_OF_SERVICE' | 'RETIRED';
export type MaintenanceType = 'PREVENTIVE' | 'CORRECTIVE';
export type WorkOrderStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export function isWorkOrderOverdue(
  scheduledAt: Date,
  status: WorkOrderStatus,
  asOf = new Date(),
): boolean {
  return (status === 'PLANNED' || status === 'IN_PROGRESS')
    && !Number.isNaN(scheduledAt.getTime())
    && scheduledAt.getTime() < asOf.getTime();
}

export interface EquipmentInput {
  assetTag: string;
  name: string;
  category: string;
  location?: string;
  isVehicle?: boolean;
  vehicleRegistrationNumber?: string | null;
  vehicleOdometerKm?: number | null;
  vehicleFuelType?: string | null;
  vehicleInsuranceExpiry?: Date | null;
  vehicleNextServiceAt?: Date | null;
  vehicleNextServiceOdometerKm?: number | null;
}

export interface VehicleEquipmentUpdateInput {
  vehicleRegistrationNumber?: string | null;
  vehicleOdometerKm?: number | null;
  vehicleFuelType?: string | null;
  vehicleInsuranceExpiry?: Date | null;
  vehicleNextServiceAt?: Date | null;
  vehicleNextServiceOdometerKm?: number | null;
  employeeId?: string | null;
}

export interface WorkOrderInput {
  equipmentId: string;
  type: MaintenanceType;
  description: string;
  scheduledAt: Date;
}

export interface WorkOrderCompletionDetails {
  actualCost: number | null;
  completionOdometerKm: number | null;
}

export class MaintenanceRequestError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'MaintenanceRequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(input: Record<string, unknown>, field: string, label: string): string {
  const value = input[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new MaintenanceRequestError(`${label} est obligatoire.`);
  }
  return value.trim();
}

function optionalText(input: Record<string, unknown>, field: string): string | undefined {
  const value = input[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new MaintenanceRequestError(`Le champ ${field} doit être une chaîne.`);
  return value.trim() || undefined;
}

function nullableText(input: Record<string, unknown>, field: string, label: string, maxLength: number): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(input, field)) return undefined;
  const value = input[field];
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new MaintenanceRequestError(`${label} doit contenir au maximum ${maxLength} caractères.`);
  }
  return value.trim() || null;
}

function nullableKilometers(input: Record<string, unknown>, field: string, label: string): number | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(input, field)) return undefined;
  const value = input[field];
  if (value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new MaintenanceRequestError(`${label} doit être un nombre entier positif ou nul.`);
  }
  return value;
}

function nullableDate(input: Record<string, unknown>, field: string, label: string): Date | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(input, field)) return undefined;
  const value = input[field];
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new MaintenanceRequestError(`${label} doit être au format AAAA-MM-JJ.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new MaintenanceRequestError(`${label} est invalide.`);
  }
  return date;
}

function parseIsoDate(value: unknown): Date {
  if (typeof value !== 'string') {
    throw new MaintenanceRequestError('La date prévue doit être une date ISO en UTC.');
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  if (!match) throw new MaintenanceRequestError('La date prévue doit être une date ISO en UTC.');
  const date = new Date(value);
  const expected = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${(match[7] ?? '').padEnd(3, '0')}Z`;
  if (Number.isNaN(date.getTime()) || date.toISOString() !== expected) {
    throw new MaintenanceRequestError('La date prévue est invalide.');
  }
  return date;
}

export function validateEquipmentInput(data: unknown): EquipmentInput {
  if (!isRecord(data)) throw new MaintenanceRequestError('Données équipement invalides.');
  const location = optionalText(data, 'location');
  if (data.isVehicle !== undefined && typeof data.isVehicle !== 'boolean') {
    throw new MaintenanceRequestError('Le statut véhicule doit être booléen.');
  }
  const vehicleFields = {
    vehicleRegistrationNumber: nullableText(data, 'vehicleRegistrationNumber', 'L’immatriculation', 40),
    vehicleOdometerKm: nullableKilometers(data, 'vehicleOdometerKm', 'Le kilométrage'),
    vehicleFuelType: nullableText(data, 'vehicleFuelType', 'Le carburant', 40),
    vehicleInsuranceExpiry: nullableDate(data, 'vehicleInsuranceExpiry', 'La date d’expiration de l’assurance'),
    vehicleNextServiceAt: nullableDate(data, 'vehicleNextServiceAt', 'La date de prochaine maintenance'),
    vehicleNextServiceOdometerKm: nullableKilometers(data, 'vehicleNextServiceOdometerKm', 'Le kilométrage de prochaine maintenance'),
  };
  if (data.isVehicle !== true && Object.values(vehicleFields).some((value) => value !== undefined)) {
    throw new MaintenanceRequestError('Les informations de flotte ne peuvent être fournies que pour un véhicule.');
  }
  return {
    assetTag: requiredText(data, 'assetTag', 'Le code équipement'),
    name: requiredText(data, 'name', 'Le nom de l’équipement'),
    category: requiredText(data, 'category', 'La catégorie'),
    ...(location ? { location } : {}),
    ...(data.isVehicle === true ? { isVehicle: true, ...vehicleFields } : {}),
  };
}

export function validateVehicleEquipmentUpdate(data: unknown): VehicleEquipmentUpdateInput {
  if (!isRecord(data)) throw new MaintenanceRequestError('Données de suivi véhicule invalides.');
  const input: VehicleEquipmentUpdateInput = {};
  const registration = nullableText(data, 'vehicleRegistrationNumber', 'L’immatriculation', 40);
  const odometerKm = nullableKilometers(data, 'vehicleOdometerKm', 'Le kilométrage');
  const fuelType = nullableText(data, 'vehicleFuelType', 'Le carburant', 40);
  const insuranceExpiry = nullableDate(data, 'vehicleInsuranceExpiry', 'La date d’expiration de l’assurance');
  const nextServiceAt = nullableDate(data, 'vehicleNextServiceAt', 'La date de prochaine maintenance');
  const nextServiceOdometerKm = nullableKilometers(data, 'vehicleNextServiceOdometerKm', 'Le kilométrage de prochaine maintenance');
  if (registration !== undefined) input.vehicleRegistrationNumber = registration;
  if (odometerKm !== undefined) input.vehicleOdometerKm = odometerKm;
  if (fuelType !== undefined) input.vehicleFuelType = fuelType;
  if (insuranceExpiry !== undefined) input.vehicleInsuranceExpiry = insuranceExpiry;
  if (nextServiceAt !== undefined) input.vehicleNextServiceAt = nextServiceAt;
  if (nextServiceOdometerKm !== undefined) input.vehicleNextServiceOdometerKm = nextServiceOdometerKm;
  if (Object.prototype.hasOwnProperty.call(data, 'employeeId')) {
    const employeeId = data.employeeId;
    if (employeeId !== null && employeeId !== '' && (typeof employeeId !== 'string' || employeeId.trim().length > 100)) {
      throw new MaintenanceRequestError('Le salarié affecté est invalide.');
    }
    input.employeeId = typeof employeeId === 'string' && employeeId.trim() ? employeeId.trim() : null;
  }
  if (Object.keys(input).length === 0) throw new MaintenanceRequestError('Aucune donnée véhicule à mettre à jour.');
  return input;
}

export interface VehicleMaintenanceSnapshot {
  isVehicle: boolean;
  vehicleOdometerKm: number | null;
  vehicleNextServiceAt: Date | null;
  vehicleNextServiceOdometerKm: number | null;
}

export function isVehicleMaintenanceDue(
  vehicle: VehicleMaintenanceSnapshot,
  asOf = new Date(),
): boolean {
  if (!vehicle.isVehicle || Number.isNaN(asOf.getTime())) return false;
  const dateDue = vehicle.vehicleNextServiceAt !== null
    && !Number.isNaN(vehicle.vehicleNextServiceAt.getTime())
    && vehicle.vehicleNextServiceAt.getTime() <= asOf.getTime();
  const mileageDue = vehicle.vehicleOdometerKm !== null
    && vehicle.vehicleNextServiceOdometerKm !== null
    && vehicle.vehicleOdometerKm >= vehicle.vehicleNextServiceOdometerKm;
  return dateDue || mileageDue;
}

export function validateWorkOrderInput(data: unknown): WorkOrderInput {
  if (!isRecord(data)) throw new MaintenanceRequestError('Données d’intervention invalides.');
  const equipmentId = requiredText(data, 'equipmentId', 'L’équipement');
  const description = requiredText(data, 'description', 'La description');
  if (data.type !== 'PREVENTIVE' && data.type !== 'CORRECTIVE') {
    throw new MaintenanceRequestError('Le type d’intervention est invalide.');
  }
  return {
    equipmentId,
    description,
    type: data.type,
    scheduledAt: parseIsoDate(data.scheduledAt),
  };
}

export function validateWorkOrderStatus(value: unknown): WorkOrderStatus {
  if (value !== 'PLANNED' && value !== 'IN_PROGRESS' && value !== 'COMPLETED' && value !== 'CANCELLED') {
    throw new MaintenanceRequestError('Le statut d’intervention est invalide.');
  }
  return value;
}

export function validateWorkOrderCompletionDetails(data: unknown): WorkOrderCompletionDetails {
  if (!isRecord(data)) throw new MaintenanceRequestError('Données de clôture d’intervention invalides.');
  const costValue = data.actualCost === undefined || data.actualCost === null || data.actualCost === ''
    ? null
    : data.actualCost;
  const odometerValue = data.completionOdometerKm === undefined
    || data.completionOdometerKm === null
    || data.completionOdometerKm === ''
    ? null
    : data.completionOdometerKm;

  if (costValue !== null && (typeof costValue !== 'number'
    || !Number.isFinite(costValue)
    || costValue < 0
    || costValue > Number.MAX_SAFE_INTEGER
    || Math.abs(Math.round(costValue * 1000) - costValue * 1000) > 1e-8)) {
    throw new MaintenanceRequestError('Le coût saisi doit être positif ou nul, avec au plus trois décimales.');
  }
  if (odometerValue !== null
    && (typeof odometerValue !== 'number'
      || !Number.isSafeInteger(odometerValue)
      || odometerValue < 0)) {
    throw new MaintenanceRequestError('Le kilométrage à la clôture doit être un nombre entier positif ou nul.');
  }
  const actualCost = typeof costValue === 'number' ? costValue : null;
  const completionOdometerKm = typeof odometerValue === 'number' ? odometerValue : null;
  if ((actualCost === null) !== (completionOdometerKm === null)) {
    throw new MaintenanceRequestError('Le coût et le kilométrage doivent être renseignés ensemble.');
  }
  return { actualCost, completionOdometerKm };
}
