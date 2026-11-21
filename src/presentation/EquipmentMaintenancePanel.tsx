import React, { useEffect, useState } from 'react';
import {
  isVehicleMaintenanceDue,
  isWorkOrderOverdue,
} from '../application/modules/maintenance/validation';
import { summarizeVehicleMaintenanceCost } from '../application/modules/maintenance/cost-summary';
import { getHtmlLanguage, translateBusinessText, useInterfaceLanguage } from './localization';

type EquipmentStatus = 'ACTIVE' | 'OUT_OF_SERVICE' | 'RETIRED';
type MaintenanceType = 'PREVENTIVE' | 'CORRECTIVE';
type WorkOrderStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

interface EquipmentRecord {
  id: string;
  currencyCode: string;
  assetTag: string;
  name: string;
  category: string;
  location?: string | null;
  status: EquipmentStatus;
  isVehicle: boolean;
  vehicleRegistrationNumber: string | null;
  vehicleOdometerKm: number | null;
  vehicleFuelType: string | null;
  vehicleInsuranceExpiry: string | null;
  vehicleNextServiceAt: string | null;
  vehicleNextServiceOdometerKm: number | null;
  vehicleAssignment: {
    employeeId: string;
    assignedAt: string;
    employee: EmployeeOption;
  } | null;
}

interface EmployeeOption {
  id: string;
  empId: string | null;
  firstName: string;
  lastName: string;
}

interface WorkOrderRecord {
  id: string;
  equipmentId: string;
  type: MaintenanceType;
  description: string;
  scheduledAt: string;
  status: WorkOrderStatus;
  completedAt: string | null;
  actualCost: number | null;
  actualCostCurrencyCode: string | null;
  completionOdometerKm: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isEquipment(value: unknown): value is EquipmentRecord {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.currencyCode === 'string'
    && typeof value.assetTag === 'string'
    && typeof value.name === 'string'
    && typeof value.category === 'string'
    && (value.location === undefined || typeof value.location === 'string')
    && (value.status === 'ACTIVE' || value.status === 'OUT_OF_SERVICE' || value.status === 'RETIRED')
    && typeof value.isVehicle === 'boolean'
    && (value.vehicleRegistrationNumber === null || typeof value.vehicleRegistrationNumber === 'string')
    && (value.vehicleOdometerKm === null || Number.isSafeInteger(value.vehicleOdometerKm))
    && (value.vehicleFuelType === null || typeof value.vehicleFuelType === 'string')
    && (value.vehicleInsuranceExpiry === null || typeof value.vehicleInsuranceExpiry === 'string')
    && (value.vehicleNextServiceAt === null || typeof value.vehicleNextServiceAt === 'string')
    && (value.vehicleNextServiceOdometerKm === null || Number.isSafeInteger(value.vehicleNextServiceOdometerKm))
    && (value.vehicleAssignment === null || (isRecord(value.vehicleAssignment)
      && typeof value.vehicleAssignment.employeeId === 'string'
      && typeof value.vehicleAssignment.assignedAt === 'string'
      && isEmployeeOption(value.vehicleAssignment.employee)));
}

function isEmployeeOption(value: unknown): value is EmployeeOption {
  return isRecord(value)
    && typeof value.id === 'string'
    && (value.empId === null || typeof value.empId === 'string')
    && typeof value.firstName === 'string'
    && typeof value.lastName === 'string';
}

function isWorkOrder(value: unknown): value is WorkOrderRecord {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.equipmentId === 'string'
    && (value.type === 'PREVENTIVE' || value.type === 'CORRECTIVE')
    && typeof value.description === 'string'
    && typeof value.scheduledAt === 'string'
    && (value.status === 'PLANNED' || value.status === 'IN_PROGRESS'
      || value.status === 'COMPLETED' || value.status === 'CANCELLED')
    && (value.completedAt === null || typeof value.completedAt === 'string')
    && (value.actualCost === null || (typeof value.actualCost === 'number' && Number.isFinite(value.actualCost)))
    && (value.actualCostCurrencyCode === null || typeof value.actualCostCurrencyCode === 'string')
    && (value.completionOdometerKm === null || Number.isSafeInteger(value.completionOdometerKm));
}

async function readPayload(response: Response, fallback: string): Promise<unknown> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === 'string' ? payload.error : fallback);
  }
  return payload;
}

const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  PLANNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  PLANNED: 'Planifiée',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
};

const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  ACTIVE: 'Actif',
  OUT_OF_SERVICE: 'Hors service',
  RETIRED: 'Retiré',
};

export default function EquipmentMaintenancePanel({ accessToken }: { accessToken: string | null }) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const [equipment, setEquipment] = useState<EquipmentRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderRecord[]>([]);
  const [assetTag, setAssetTag] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [isVehicle, setIsVehicle] = useState(false);
  const [vehicleRegistrationNumber, setVehicleRegistrationNumber] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [vehicleOdometerKm, setVehicleOdometerKm] = useState('');
  const [vehicleFuelType, setVehicleFuelType] = useState('');
  const [vehicleInsuranceExpiry, setVehicleInsuranceExpiry] = useState('');
  const [vehicleNextServiceAt, setVehicleNextServiceAt] = useState('');
  const [vehicleNextServiceOdometerKm, setVehicleNextServiceOdometerKm] = useState('');
  const [vehicleEmployeeId, setVehicleEmployeeId] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [type, setType] = useState<MaintenanceType>('PREVENTIVE');
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [completionCosts, setCompletionCosts] = useState<Record<string, string>>({});
  const [completionOdometers, setCompletionOdometers] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [asOf, setAsOf] = useState(() => new Date());
  const selectedVehicle = equipment.find((item) => item.id === vehicleId && item.isVehicle);

  useEffect(() => {
    const interval = window.setInterval(() => setAsOf(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setEquipment([]);
    setEmployees([]);
    setWorkOrders([]);
    setError('');
    if (!accessToken) {
      setLoading(false);
      setError('Session API indisponible. Reconnectez-vous pour charger les équipements.');
      return () => controller.abort();
    }

    const loadData = async () => {
      setLoading(true);
      try {
        const headers = { Authorization: `Bearer ${accessToken}` };
        const [equipmentResponse, workOrdersResponse, employeesResponse] = await Promise.all([
          fetch('/api/maintenance/equipment', { headers, signal: controller.signal }),
          fetch('/api/maintenance/work-orders', { headers, signal: controller.signal }),
          fetch('/api/maintenance/employees', { headers, signal: controller.signal }),
        ]);
        const [equipmentPayload, workOrdersPayload, employeesPayload] = await Promise.all([
          readPayload(equipmentResponse, 'Impossible de charger les équipements.'),
          readPayload(workOrdersResponse, 'Impossible de charger les interventions.'),
          readPayload(employeesResponse, 'Impossible de charger les salariés.'),
        ]);
        if (!Array.isArray(equipmentPayload) || !equipmentPayload.every(isEquipment)) {
          throw new Error('La réponse des équipements est invalide.');
        }
        if (!Array.isArray(workOrdersPayload) || !workOrdersPayload.every(isWorkOrder)) {
          throw new Error('La réponse des interventions est invalide.');
        }
        if (!Array.isArray(employeesPayload) || !employeesPayload.every(isEmployeeOption)) {
          throw new Error('La réponse des salariés est invalide.');
        }
        if (!controller.signal.aborted) {
          setEquipment(equipmentPayload);
          setEmployees(employeesPayload);
          setWorkOrders(workOrdersPayload);
          setEquipmentId((current) => current || equipmentPayload[0]?.id || '');
          setVehicleId((current) => current || equipmentPayload.find((item) => item.isVehicle)?.id || '');
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Le module maintenance est indisponible.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadData();
    return () => controller.abort();
  }, [accessToken]);

  useEffect(() => {
    if (!selectedVehicle) return;
    setVehicleRegistrationNumber(selectedVehicle.vehicleRegistrationNumber ?? '');
    setVehicleOdometerKm(selectedVehicle.vehicleOdometerKm?.toString() ?? '');
    setVehicleFuelType(selectedVehicle.vehicleFuelType ?? '');
    setVehicleInsuranceExpiry(selectedVehicle.vehicleInsuranceExpiry?.slice(0, 10) ?? '');
    setVehicleNextServiceAt(selectedVehicle.vehicleNextServiceAt?.slice(0, 10) ?? '');
    setVehicleNextServiceOdometerKm(selectedVehicle.vehicleNextServiceOdometerKm?.toString() ?? '');
    setVehicleEmployeeId(selectedVehicle.vehicleAssignment?.employeeId ?? '');
  }, [vehicleId, equipment]);

  const saveEquipment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/maintenance/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          assetTag,
          name,
          category,
          location,
          isVehicle,
          ...(isVehicle ? {
            vehicleRegistrationNumber: vehicleRegistrationNumber || null,
          } : {}),
        }),
      });
      const payload = await readPayload(response, 'L’équipement n’a pas pu être enregistré.');
      if (!isEquipment(payload)) throw new Error('La réponse de création de l’équipement est invalide.');
      setEquipment((current) => [payload, ...current]);
      setEquipmentId(payload.id);
      if (payload.isVehicle) setVehicleId(payload.id);
      setAssetTag('');
      setName('');
      setCategory('');
      setLocation('');
      setIsVehicle(false);
      setVehicleRegistrationNumber('');
      setNotice(`${text('Équipement')} ${payload.assetTag} ${text('enregistré.')}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  const saveVehicleData = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || saving || !selectedVehicle) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const parseKilometers = (value: string) => value.trim() ? Number(value) : null;
      const response = await fetch(`/api/maintenance/equipment/${encodeURIComponent(selectedVehicle.id)}/vehicle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          vehicleRegistrationNumber: vehicleRegistrationNumber || null,
          vehicleOdometerKm: parseKilometers(vehicleOdometerKm),
          vehicleFuelType: vehicleFuelType || null,
          vehicleInsuranceExpiry: vehicleInsuranceExpiry || null,
          vehicleNextServiceAt: vehicleNextServiceAt || null,
          vehicleNextServiceOdometerKm: parseKilometers(vehicleNextServiceOdometerKm),
          employeeId: vehicleEmployeeId || null,
        }),
      });
      const payload = await readPayload(response, 'Les données du véhicule n’ont pas pu être enregistrées.');
      if (!isEquipment(payload)) throw new Error('La réponse de mise à jour du véhicule est invalide.');
      setEquipment((current) => current.map((item) => item.id === payload.id ? payload : item));
      setNotice(`${text('Suivi de flotte')} ${payload.assetTag} ${text('mis à jour.')}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de la mise à jour du véhicule.');
    } finally {
      setSaving(false);
    }
  };

  const saveWorkOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/maintenance/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          equipmentId,
          type,
          description,
          scheduledAt: new Date(scheduledAt).toISOString(),
        }),
      });
      const payload = await readPayload(response, 'L’intervention n’a pas pu être planifiée.');
      if (!isWorkOrder(payload)) throw new Error('La réponse de création de l’intervention est invalide.');
      setWorkOrders((current) => [payload, ...current]);
      setDescription('');
      setScheduledAt('');
      setNotice('Intervention planifiée.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de la planification.');
    } finally {
      setSaving(false);
    }
  };

  const updateWorkOrderStatus = async (workOrder: WorkOrderRecord, status: WorkOrderStatus) => {
    if (!accessToken || !WORK_ORDER_TRANSITIONS[workOrder.status].includes(status) || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/maintenance/work-orders/${encodeURIComponent(workOrder.id)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          status,
          ...(status === 'COMPLETED'
            && (completionCosts[workOrder.id]?.trim() || completionOdometers[workOrder.id]?.trim())
            ? {
              actualCost: completionCosts[workOrder.id]?.trim()
                ? Number(completionCosts[workOrder.id])
                : null,
              completionOdometerKm: completionOdometers[workOrder.id]?.trim()
                ? Number(completionOdometers[workOrder.id])
                : null,
            }
            : {}),
        }),
      });
      const payload = await readPayload(response, 'Le statut de l’intervention n’a pas pu être modifié.');
      if (!isWorkOrder(payload)) throw new Error('La réponse de mise à jour de l’intervention est invalide.');
      setWorkOrders((current) => current.map((item) => item.id === payload.id ? payload : item));
      setCompletionCosts((current) => ({ ...current, [workOrder.id]: '' }));
      setCompletionOdometers((current) => ({ ...current, [workOrder.id]: '' }));
      setNotice('Statut de l’intervention mis à jour.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de la mise à jour.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <header>
        <h2 style={{ margin: '0 0 6px', color: '#0F172A' }}>{text('Maintenance des équipements')}</h2>
        <p style={{ margin: 0, color: '#475569' }}>
          {text('Registre par entité, planification préventive et historique des interventions.')}
        </p>
      </header>
      {error && <div role="alert" style={{ color: '#991B1B', background: '#FEF2F2', padding: 10, borderRadius: 6 }}>{text(error)}</div>}
      {notice && <div role="status" style={{ color: '#166534', background: '#F0FDF4', padding: 10, borderRadius: 6 }}>{text(notice)}</div>}
      <form onSubmit={saveEquipment} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, alignItems: 'end', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
        <label>{text('Code équipement')}<input required value={assetTag} onChange={(event) => setAssetTag(event.target.value)} style={inputStyle} /></label>
        <label>{text('Nom')}<input required value={name} onChange={(event) => setName(event.target.value)} style={inputStyle} /></label>
        <label>{text('Catégorie')}<input required value={category} onChange={(event) => setCategory(event.target.value)} style={inputStyle} /></label>
        <label>{text('Emplacement')}<input value={location} onChange={(event) => setLocation(event.target.value)} style={inputStyle} /></label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={isVehicle} onChange={(event) => setIsVehicle(event.target.checked)} />
          {text('Véhicule de flotte')}
        </label>
        {isVehicle && (
          <label>{text('Immatriculation')}<input value={vehicleRegistrationNumber} onChange={(event) => setVehicleRegistrationNumber(event.target.value)} style={inputStyle} /></label>
        )}
        <button type="submit" disabled={saving}>{saving ? text('Enregistrement…') : text('Ajouter l’équipement')}</button>
      </form>
      {equipment.some((item) => item.isVehicle) && selectedVehicle && (
        <section style={{ display: 'grid', gap: 10, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
          <h3 style={{ margin: 0 }}>{text('Suivi de flotte')}</h3>
          <form onSubmit={saveVehicleData} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, alignItems: 'end' }}>
            <label>{text('Véhicule')}<select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} style={inputStyle}>
              {equipment.filter((item) => item.isVehicle).map((item) => (
                <option key={item.id} value={item.id}>{item.vehicleRegistrationNumber || item.assetTag} — {item.name}</option>
              ))}
            </select></label>
            <label>{text('Immatriculation')}<input value={vehicleRegistrationNumber} onChange={(event) => setVehicleRegistrationNumber(event.target.value)} style={inputStyle} /></label>
            <label>{text('Compteur (km)')}<input type="number" min="0" step="1" value={vehicleOdometerKm} onChange={(event) => setVehicleOdometerKm(event.target.value)} style={inputStyle} /></label>
            <label>{text('Carburant')}<input value={vehicleFuelType} onChange={(event) => setVehicleFuelType(event.target.value)} style={inputStyle} /></label>
            <label>{text('Assurance valable jusqu’au')}<input type="date" value={vehicleInsuranceExpiry} onChange={(event) => setVehicleInsuranceExpiry(event.target.value)} style={inputStyle} /></label>
            <label>{text('Prochaine maintenance')}<input type="date" value={vehicleNextServiceAt} onChange={(event) => setVehicleNextServiceAt(event.target.value)} style={inputStyle} /></label>
            <label>{text('Maintenance à (km)')}<input type="number" min="0" step="1" value={vehicleNextServiceOdometerKm} onChange={(event) => setVehicleNextServiceOdometerKm(event.target.value)} style={inputStyle} /></label>
            <label>{text('Salarié affecté')}<select value={vehicleEmployeeId} onChange={(event) => setVehicleEmployeeId(event.target.value)} style={inputStyle}>
              <option value="">{text('Aucun salarié')}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName}{employee.empId ? ` (${employee.empId})` : ''}
                </option>
              ))}
            </select></label>
            <button type="submit" disabled={saving}>{saving ? text('Enregistrement…') : text('Enregistrer le suivi')}</button>
          </form>
        </section>
      )}
      <form onSubmit={saveWorkOrder} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, alignItems: 'end', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
        <label>{text('Équipement')}<select required value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)} style={inputStyle}>
          <option value="">{text('Choisir un équipement')}</option>
          {equipment.filter((item) => item.status === 'ACTIVE').map((item) => (
            <option key={item.id} value={item.id}>{item.assetTag} — {item.name}</option>
          ))}
        </select></label>
        <label>{text('Type')}<select value={type} onChange={(event) => setType(event.target.value as MaintenanceType)} style={inputStyle}>
          <option value="PREVENTIVE">{text('Préventive')}</option><option value="CORRECTIVE">{text('Corrective')}</option>
        </select></label>
        <label>{text('Échéance')}<input required type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} style={inputStyle} /></label>
        <label>{text('Description')}<input required value={description} onChange={(event) => setDescription(event.target.value)} style={inputStyle} /></label>
        <button type="submit" disabled={saving || !equipment.some((item) => item.id === equipmentId && item.status === 'ACTIVE')}>
          {text('Planifier l’intervention')}
        </button>
      </form>
      <section style={{ overflowX: 'auto', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>{text('Parc d’équipements')} ({equipment.length})</h3>
        {loading && <p role="status">{text('Chargement des équipements et interventions…')}</p>}
        {!loading && equipment.length === 0 && <p>{text('Aucun équipement n’est enregistré pour cette entité.')}</p>}
        {equipment.length > 0 && (
          <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', textAlign: language === 'AR' ? 'right' : 'left', fontSize: '0.84rem' }}>
            <thead><tr style={{ background: '#F8FAFC' }}>
              <th style={{ padding: 9 }}>{text('Code')}</th><th style={{ padding: 9 }}>{text('Équipement')}</th>
              <th style={{ padding: 9 }}>{text('Catégorie')}</th><th style={{ padding: 9 }}>{text('Emplacement')}</th><th style={{ padding: 9 }}>{text('État')}</th><th style={{ padding: 9 }}>{text('Flotte / alertes')}</th>
            </tr></thead>
            <tbody>{equipment.map((item) => (
              <tr key={item.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                <td style={{ padding: 9 }}>{item.assetTag}</td><td style={{ padding: 9 }}>{item.name}</td>
                <td style={{ padding: 9 }}>{item.category}</td><td style={{ padding: 9 }}>{item.location || '—'}</td>
                <td style={{ padding: 9 }}>{text(EQUIPMENT_STATUS_LABELS[item.status])}</td>
                <td style={{ padding: 9 }}>
                  {!item.isVehicle ? '—' : (
                    <>
                      <div>{item.vehicleRegistrationNumber || text('Immatriculation non renseignée')}</div>
                      <div>{item.vehicleOdometerKm === null ? text('Kilométrage non renseigné') : `${item.vehicleOdometerKm.toLocaleString(getHtmlLanguage(language))} km`}</div>
                      {item.vehicleAssignment && <div>{text('Conducteur')} : {item.vehicleAssignment.employee.firstName} {item.vehicleAssignment.employee.lastName}</div>}
                      {(() => {
                        const summary = summarizeVehicleMaintenanceCost(
                          workOrders.filter((order) => order.equipmentId === item.id),
                        );
                        const displayRate = summary.ratePerKm === null
                          ? null
                          : `${summary.ratePerKm.toLocaleString(getHtmlLanguage(language), { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${summary.currencyCode ?? item.currencyCode}/km`;
                        const unavailableReason = summary.completedOrderCount === 0
                          ? text('données insuffisantes')
                          : summary.recordedOrderCount < summary.completedOrderCount
                            ? `${summary.recordedOrderCount}/${summary.completedOrderCount} ${text('intervention(s) avec coût et km consignés')}`
                            : summary.recordedOrderCount < 2
                              ? text('deux relevés avec coût sont nécessaires')
                              : summary.currencyCode === null
                                ? text('devises non homogènes')
                                : text('distance entre relevés nulle ou invalide');
                        return (
                          <div>
                            <strong>{text('Coût d’entretien saisi/km :')}</strong>{' '}
                            {displayRate ?? unavailableReason}
                            {summary.distanceKm !== null && <span> {text('sur')} {summary.distanceKm.toLocaleString(getHtmlLanguage(language))} km</span>}
                          </div>
                        );
                      })()}
                      {isVehicleMaintenanceDue({
                        isVehicle: item.isVehicle,
                        vehicleOdometerKm: item.vehicleOdometerKm,
                        vehicleNextServiceAt: item.vehicleNextServiceAt ? new Date(item.vehicleNextServiceAt) : null,
                        vehicleNextServiceOdometerKm: item.vehicleNextServiceOdometerKm,
                      }, asOf) && <strong style={{ display: 'block', color: '#B91C1C' }}>{text('Maintenance à prévoir')}</strong>}
                      {item.vehicleInsuranceExpiry
                        && new Date(`${item.vehicleInsuranceExpiry.slice(0, 10)}T23:59:59.999Z`) < asOf
                        && <strong style={{ display: 'block', color: '#B91C1C' }}>{text('Assurance expirée')}</strong>}
                    </>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
      <section style={{ overflowX: 'auto', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>{text('Interventions')} ({workOrders.length})</h3>
        {workOrders.some((order) => isWorkOrderOverdue(new Date(order.scheduledAt), order.status, asOf)) && (
          <p role="status" style={{ color: '#991B1B', background: '#FEF2F2', padding: 10, borderRadius: 6 }}>
            {workOrders.filter((order) => isWorkOrderOverdue(new Date(order.scheduledAt), order.status, asOf)).length}
            {' '}{text('intervention(s) planifiée(s) ou en cours ont dépassé leur échéance.')}
          </p>
        )}
        {workOrders.length === 0 && !loading && <p>{text('Aucune intervention n’est planifiée pour cette entité.')}</p>}
        {workOrders.length > 0 && (
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', textAlign: language === 'AR' ? 'right' : 'left', fontSize: '0.84rem' }}>
            <thead><tr style={{ background: '#F8FAFC' }}>
              <th style={{ padding: 9 }}>{text('Équipement')}</th><th style={{ padding: 9 }}>{text('Type')}</th>
              <th style={{ padding: 9 }}>{text('Échéance')}</th><th style={{ padding: 9 }}>{text('Description')}</th>
              <th style={{ padding: 9 }}>{text('Statut')}</th><th style={{ padding: 9 }}>{text('Action')}</th>
            </tr></thead>
            <tbody>{workOrders.map((order) => {
              const asset = equipment.find((item) => item.id === order.equipmentId);
              return (
                <tr key={order.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                  <td style={{ padding: 9 }}>{asset?.assetTag ?? '—'}</td>
                  <td style={{ padding: 9 }}>{text(order.type === 'PREVENTIVE' ? 'Préventive' : 'Corrective')}</td>
                  <td style={{ padding: 9 }}>
                    {new Date(order.scheduledAt).toLocaleString(getHtmlLanguage(language))}
                    {isWorkOrderOverdue(new Date(order.scheduledAt), order.status, asOf)
                      && <strong style={{ display: 'block', color: '#B91C1C' }}>{text('Échéance dépassée')}</strong>}
                  </td>
                  <td style={{ padding: 9 }}>{order.description}</td>
                  <td style={{ padding: 9 }}>
                    {text(WORK_ORDER_STATUS_LABELS[order.status])}
                    {order.completedAt && <div>{text('Terminée le')} {new Date(order.completedAt).toLocaleString(getHtmlLanguage(language))}</div>}
                    {order.actualCost !== null && (
                      <div>
                        {text('Coût saisi :')} {order.actualCost.toLocaleString(getHtmlLanguage(language))} {order.actualCostCurrencyCode}
                        {order.completionOdometerKm !== null && ` — ${order.completionOdometerKm.toLocaleString(getHtmlLanguage(language))} km`}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: 9 }}>
                    {asset?.isVehicle && order.status === 'IN_PROGRESS' && (
                      <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
                        <label>
                          {text('Coût saisi') } ({asset.currencyCode}), {text('optionnel')}
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={completionCosts[order.id] ?? ''}
                            onChange={(event) => setCompletionCosts((current) => ({
                              ...current,
                              [order.id]: event.target.value,
                            }))}
                            style={inputStyle}
                          />
                        </label>
                        <label>
                          {text('Kilométrage à la clôture (optionnel)')}
                          <input
                            type="number"
                            min={asset.vehicleOdometerKm ?? 0}
                            step="1"
                            value={completionOdometers[order.id] ?? ''}
                            onChange={(event) => setCompletionOdometers((current) => ({
                              ...current,
                              [order.id]: event.target.value,
                            }))}
                            style={inputStyle}
                          />
                        </label>
                        <small>{text('Renseignez les deux valeurs pour inclure cette intervention au coût/km. Ce suivi exclut carburant et dépenses non saisies.')}</small>
                      </div>
                    )}
                    {WORK_ORDER_TRANSITIONS[order.status].map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={saving}
                        onClick={() => void updateWorkOrderStatus(order, status)}
                      >
                        {text(status === 'IN_PROGRESS' ? 'Démarrer' : status === 'COMPLETED' ? 'Terminer' : 'Annuler')}
                      </button>
                    ))}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </section>
    </div>
  );
}
