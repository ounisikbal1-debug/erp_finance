import {
  MaintenanceRequestError,
  validateEquipmentInput,
  validateWorkOrderInput,
  validateWorkOrderCompletionDetails,
  validateWorkOrderStatus,
  validateVehicleEquipmentUpdate,
  type EquipmentInput,
  type EquipmentStatus,
  type MaintenanceType,
  type VehicleEquipmentUpdateInput,
  type WorkOrderStatus,
  type WorkOrderCompletionDetails,
} from './validation';

export interface EquipmentRecord {
  id: string;
  entityId: string;
  currencyCode: string;
  assetTag: string;
  name: string;
  category: string;
  location: string | null;
  status: EquipmentStatus;
  isVehicle: boolean;
  vehicleRegistrationNumber: string | null;
  vehicleOdometerKm: number | null;
  vehicleFuelType: string | null;
  vehicleInsuranceExpiry: Date | null;
  vehicleNextServiceAt: Date | null;
  vehicleNextServiceOdometerKm: number | null;
  vehicleAssignment: {
    employeeId: string;
    assignedAt: Date;
    employee: { id: string; empId: string | null; firstName: string; lastName: string };
  } | null;
  createdAt: Date;
}

export interface EmployeeOption {
  id: string;
  empId: string | null;
  firstName: string;
  lastName: string;
}

export interface MaintenanceWorkOrder {
  id: string;
  entityId: string;
  equipmentId: string;
  type: MaintenanceType;
  description: string;
  scheduledAt: Date;
  status: WorkOrderStatus;
  completedAt: Date | null;
  actualCost: number | null;
  actualCostCurrencyCode: string | null;
  completionOdometerKm: number | null;
  createdAt: Date;
}

export interface MaintenanceRepository {
  listEquipment(entityId: string): Promise<EquipmentRecord[]>;
  findEquipment(entityId: string, equipmentId: string): Promise<EquipmentRecord | null>;
  findEquipmentByAssetTag(entityId: string, assetTag: string): Promise<EquipmentRecord | null>;
  createEquipment(entityId: string, input: EquipmentInput): Promise<EquipmentRecord>;
  listEmployees(entityId: string): Promise<EmployeeOption[]>;
  findEmployee(entityId: string, employeeId: string): Promise<EmployeeOption | null>;
  updateVehicleData(
    entityId: string,
    equipmentId: string,
    input: VehicleEquipmentUpdateInput,
  ): Promise<EquipmentRecord | null>;
  listWorkOrders(entityId: string): Promise<MaintenanceWorkOrder[]>;
  createWorkOrder(
    entityId: string,
    input: ReturnType<typeof validateWorkOrderInput>,
  ): Promise<MaintenanceWorkOrder>;
  updateWorkOrderStatus(
    entityId: string,
    workOrderId: string,
    expectedStatus: WorkOrderStatus,
    status: WorkOrderStatus,
    completedAt: Date | null,
    completionDetails: WorkOrderCompletionDetails,
    costCurrencyCode: string | null,
    expectedOdometerKm: number | null,
  ): Promise<MaintenanceWorkOrder | null>;
  findWorkOrder(entityId: string, workOrderId: string): Promise<MaintenanceWorkOrder | null>;
}

const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  PLANNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export class MaintenanceService {
  constructor(private readonly repository: MaintenanceRepository) {}

  listEquipment(entityId: string) {
    return this.repository.listEquipment(entityId);
  }

  async createEquipment(data: unknown, entityId: string) {
    const input = validateEquipmentInput(data);
    if (await this.repository.findEquipmentByAssetTag(entityId, input.assetTag)) {
      throw new MaintenanceRequestError('Ce code équipement existe déjà dans cette entité.', 409);
    }
    return this.repository.createEquipment(entityId, input);
  }

  listEmployees(entityId: string) {
    return this.repository.listEmployees(entityId);
  }

  async updateVehicleData(equipmentId: string, data: unknown, entityId: string) {
    const input = validateVehicleEquipmentUpdate(data);
    const equipment = await this.repository.findEquipment(entityId, equipmentId);
    if (!equipment) throw new MaintenanceRequestError('Équipement introuvable pour cette entité.', 404);
    if (!equipment.isVehicle) throw new MaintenanceRequestError('Le suivi de flotte est réservé aux véhicules.', 409);

    if (input.vehicleOdometerKm !== undefined) {
      if (equipment.vehicleOdometerKm !== null
        && (input.vehicleOdometerKm === null || input.vehicleOdometerKm < equipment.vehicleOdometerKm)) {
        throw new MaintenanceRequestError('Le kilométrage ne peut pas diminuer.', 409);
      }
    }
    if (input.employeeId) {
      const employee = await this.repository.findEmployee(entityId, input.employeeId);
      if (!employee) throw new MaintenanceRequestError('Le salarié affecté doit appartenir à cette entité.', 404);
    }

    const updated = await this.repository.updateVehicleData(entityId, equipmentId, input);
    if (!updated) throw new MaintenanceRequestError('Le véhicule a changé; rechargez puis réessayez.', 409);
    return updated;
  }

  listWorkOrders(entityId: string) {
    return this.repository.listWorkOrders(entityId);
  }

  async createWorkOrder(data: unknown, entityId: string) {
    const input = validateWorkOrderInput(data);
    const equipment = await this.repository.findEquipment(entityId, input.equipmentId);
    if (!equipment) throw new MaintenanceRequestError('Équipement introuvable pour cette entité.', 404);
    if (equipment.status !== 'ACTIVE') {
      throw new MaintenanceRequestError('Une intervention ne peut être planifiée que sur un équipement actif.', 409);
    }
    return this.repository.createWorkOrder(entityId, input);
  }

  async updateWorkOrderStatus(
    workOrderId: string,
    requestedStatus: unknown,
    entityId: string,
    requestedCompletionDetails?: unknown,
  ) {
    const status = validateWorkOrderStatus(requestedStatus);
    const completionDetails = validateWorkOrderCompletionDetails(requestedCompletionDetails ?? {});
    const current = await this.repository.findWorkOrder(entityId, workOrderId);
    if (!current) throw new MaintenanceRequestError('Intervention introuvable pour cette entité.', 404);
    if (!ALLOWED_TRANSITIONS[current.status].includes(status)) {
      throw new MaintenanceRequestError(
        `Transition de statut refusée : ${current.status} vers ${status}.`,
        409,
      );
    }
    if (status !== 'COMPLETED'
      && (completionDetails.actualCost !== null || completionDetails.completionOdometerKm !== null)) {
      throw new MaintenanceRequestError('Les coûts et kilométrages se renseignent uniquement à la clôture.', 409);
    }

    let costCurrencyCode: string | null = null;
    let expectedOdometerKm: number | null = null;
    if (status === 'COMPLETED') {
      const equipment = await this.repository.findEquipment(entityId, current.equipmentId);
      if (!equipment) throw new MaintenanceRequestError('Équipement introuvable pour cette entité.', 404);
      if (equipment.isVehicle) {
        if (completionDetails.completionOdometerKm !== null
          && equipment.vehicleOdometerKm !== null
          && completionDetails.completionOdometerKm < equipment.vehicleOdometerKm) {
          throw new MaintenanceRequestError('Le kilométrage de clôture ne peut pas diminuer.', 409);
        }
        costCurrencyCode = completionDetails.actualCost === null ? null : equipment.currencyCode;
        expectedOdometerKm = equipment.vehicleOdometerKm;
      } else if (completionDetails.actualCost !== null || completionDetails.completionOdometerKm !== null) {
        throw new MaintenanceRequestError('Les coûts et kilométrages de clôture sont réservés aux véhicules.', 409);
      }
    }

    const completedAt = status === 'COMPLETED' ? new Date() : null;
    const updated = await this.repository.updateWorkOrderStatus(
      entityId,
      workOrderId,
      current.status,
      status,
      completedAt,
      completionDetails,
      costCurrencyCode,
      expectedOdometerKm,
    );
    if (!updated) throw new MaintenanceRequestError('L’intervention a changé; rechargez puis réessayez.', 409);
    return updated;
  }
}
