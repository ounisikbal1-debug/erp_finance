import React, { useEffect, useState } from 'react';
import { getHtmlLanguage, translateBusinessText, useInterfaceLanguage } from './localization';

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  empId: string | null;
}

interface LeaveRequestRecord {
  id: string;
  employee: EmployeeOption;
  leaveType: 'ANNUAL' | 'SICK' | 'UNPAID' | 'OTHER';
  startAt: string;
  endAt: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy: { username: string };
  reviewedBy: { username: string } | null;
  reviewNote: string | null;
}

interface LeaveEntitlementRecord {
  id: string;
  year: number;
  entitlementDays: number;
  policySource: string | null;
  effectiveFrom: string | null;
  usedDays: number;
  pendingDays: number;
  availableDays: number;
  employee: EmployeeOption;
}

const leaveTypeLabels: Record<LeaveRequestRecord['leaveType'], string> = {
  ANNUAL: 'Congé annuel',
  SICK: 'Congé maladie',
  UNPAID: 'Congé sans solde',
  OTHER: 'Autre',
};

const statusLabels: Record<LeaveRequestRecord['status'], string> = {
  PENDING: 'En attente',
  APPROVED: 'Approuvée',
  REJECTED: 'Refusée',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isLeaveRequest(value: unknown): value is LeaveRequestRecord {
  return isRecord(value)
    && typeof value.id === 'string'
    && isRecord(value.employee)
    && typeof value.employee.id === 'string'
    && typeof value.employee.firstName === 'string'
    && typeof value.employee.lastName === 'string'
    && (value.employee.empId === null || typeof value.employee.empId === 'string')
    && typeof value.leaveType === 'string'
    && value.leaveType in leaveTypeLabels
    && typeof value.startAt === 'string'
    && typeof value.endAt === 'string'
    && typeof value.reason === 'string'
    && typeof value.status === 'string'
    && value.status in statusLabels
    && isRecord(value.requestedBy)
    && typeof value.requestedBy.username === 'string'
    && (value.reviewedBy === null || (isRecord(value.reviewedBy) && typeof value.reviewedBy.username === 'string'))
    && (value.reviewNote === null || typeof value.reviewNote === 'string');
}

function isLeaveEntitlement(value: unknown): value is LeaveEntitlementRecord {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.year === 'number'
    && typeof value.entitlementDays === 'number'
    && (value.policySource === null || typeof value.policySource === 'string')
    && (value.effectiveFrom === null || typeof value.effectiveFrom === 'string')
    && typeof value.usedDays === 'number'
    && typeof value.pendingDays === 'number'
    && typeof value.availableDays === 'number'
    && isRecord(value.employee)
    && typeof value.employee.id === 'string'
    && typeof value.employee.firstName === 'string'
    && typeof value.employee.lastName === 'string'
    && (value.employee.empId === null || typeof value.employee.empId === 'string');
}

function responseError(payload: unknown, fallback: string): string {
  return isRecord(payload) && typeof payload.error === 'string' ? payload.error : fallback;
}

export default function LeaveRequestsPanel({
  accessToken,
  employees,
}: {
  accessToken: string | null;
  employees: EmployeeOption[];
}) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const locale = getHtmlLanguage(language);
  const [requests, setRequests] = useState<LeaveRequestRecord[]>([]);
  const [entitlements, setEntitlements] = useState<LeaveEntitlementRecord[]>([]);
  const [entitlementYear, setEntitlementYear] = useState(new Date().getFullYear());
  const [entitlementEmployeeId, setEntitlementEmployeeId] = useState('');
  const [entitlementDays, setEntitlementDays] = useState('30');
  const [entitlementPolicySource, setEntitlementPolicySource] = useState('');
  const [entitlementEffectiveFrom, setEntitlementEffectiveFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [entitlementReason, setEntitlementReason] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveRequestRecord['leaveType']>('ANNUAL');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setRequests([]);
    setEntitlements([]);
    if (!accessToken) {
      setLoading(false);
      setError('Session API indisponible. Reconnectez-vous pour charger les demandes de congé.');
      return () => controller.abort();
    }

    void (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/hr/leave-requests', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(responseError(payload, 'Impossible de charger les demandes de congé.'));
        if (!Array.isArray(payload) || !payload.every(isLeaveRequest)) {
          throw new Error('La réponse des demandes de congé est invalide.');
        }
        if (!controller.signal.aborted) setRequests(payload);
        const entitlementResponse = await fetch(`/api/hr/leave-entitlements?year=${entitlementYear}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const entitlementPayload: unknown = await entitlementResponse.json();
        if (!entitlementResponse.ok) {
          throw new Error(responseError(entitlementPayload, 'Impossible de charger les soldes de congé.'));
        }
        if (!Array.isArray(entitlementPayload) || !entitlementPayload.every(isLeaveEntitlement)) {
          throw new Error('La réponse des soldes de congé est invalide.');
        }
        if (!controller.signal.aborted) setEntitlements(entitlementPayload);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Le module congés est indisponible.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [accessToken, entitlementYear]);

  const refreshEntitlements = async () => {
    if (!accessToken) return;
    const response = await fetch(`/api/hr/leave-entitlements?year=${entitlementYear}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(responseError(payload, 'Impossible de rafraîchir les soldes de congé.'));
    if (!Array.isArray(payload) || !payload.every(isLeaveEntitlement)) {
      throw new Error('La réponse des soldes de congé est invalide.');
    }
    setEntitlements(payload);
  };

  const saveEntitlement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || saving) return;
    const days = Number(entitlementDays);
    if (!entitlementEmployeeId || !Number.isInteger(days) || days < 0
      || !entitlementReason.trim() || !entitlementPolicySource.trim() || !entitlementEffectiveFrom) {
      setError('Sélectionnez un salarié, indiquez les jours, la source de politique, sa date d’effet et justifiez le paramétrage.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/hr/leave-entitlements', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          employeeId: entitlementEmployeeId,
          year: entitlementYear,
          entitlementDays: days,
          policySource: entitlementPolicySource.trim(),
          effectiveFrom: entitlementEffectiveFrom,
          reason: entitlementReason.trim(),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(responseError(payload, 'Le droit annuel n’a pas pu être enregistré.'));
      let refreshWarning = '';
      try {
        await refreshEntitlements();
      } catch (refreshError) {
        refreshWarning = refreshError instanceof Error
          ? ` ${text('Le droit est enregistré, mais les soldes n’ont pas pu être actualisés :')} ${text(refreshError.message)}`
          : ` ${text('Le droit est enregistré, mais les soldes n’ont pas pu être actualisés.')}`;
      }
      setEntitlementReason('');
      setEntitlementPolicySource('');
      setNotice(`${text('Droit annuel enregistré avec sa justification et son historique.')}${refreshWarning}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors du paramétrage du droit annuel.');
    } finally {
      setSaving(false);
    }
  };

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || saving) return;
    if (!employeeId || !startAt || !endAt || !reason.trim()) {
      setError('Sélectionnez un salarié, les dates de congé et renseignez le motif.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/hr/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ employeeId, leaveType, startAt, endAt, reason: reason.trim() }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(responseError(payload, 'La demande de congé n’a pas pu être enregistrée.'));
      if (!isLeaveRequest(payload)) throw new Error('La réponse de création de demande est invalide.');
      setRequests((current) => [...current, payload]);
      let refreshWarning = '';
      if (leaveType === 'ANNUAL') {
        try {
          await refreshEntitlements();
        } catch (refreshError) {
          refreshWarning = refreshError instanceof Error
            ? ` ${text('La demande est enregistrée, mais les soldes n’ont pas pu être actualisés :')} ${text(refreshError.message)}`
            : ` ${text('La demande est enregistrée, mais les soldes n’ont pas pu être actualisés.')}`;
        }
      }
      setStartAt('');
      setEndAt('');
      setReason('');
      setNotice(`${text('Demande de congé enregistrée et transmise pour examen.')}${refreshWarning}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’enregistrement de la demande.');
    } finally {
      setSaving(false);
    }
  };

  const reviewRequest = async (request: LeaveRequestRecord, decision: 'approve' | 'reject') => {
    if (!accessToken || request.status !== 'PENDING') return;
    const note = window.prompt(text(decision === 'reject'
      ? 'Motif obligatoire du refus :'
      : 'Note de revue (facultative) :'));
    if (note === null) return;
    if (decision === 'reject' && !note.trim()) {
      setError('Un motif est obligatoire pour refuser une demande.');
      return;
    }
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/hr/leave-requests/${encodeURIComponent(request.id)}/${decision}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ note }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(responseError(payload, 'La demande n’a pas pu être examinée.'));
      if (!isLeaveRequest(payload)) throw new Error('La réponse de revue est invalide.');
      setRequests((current) => current.map((item) => item.id === payload.id ? payload : item));
      setNotice(text(decision === 'approve' ? 'Demande approuvée.' : 'Demande refusée.'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de la revue de la demande.');
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
    <section style={{ display: 'grid', gap: 12, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
      <header>
        <h3 style={{ margin: '0 0 5px' }}>{text('Demandes de congé')}</h3>
        <p style={{ margin: 0, color: '#475569', fontSize: '0.85rem' }}>
          {text('Dates inclusives; les droits annuels sont configurés par RH et les demandes en attente/approuvées sont réservées.')}
        </p>
      </header>
      {error && <div role="alert" style={{ color: '#991B1B', background: '#FEF2F2', padding: 10, borderRadius: 6 }}>{text(error)}</div>}
      {notice && <div role="status" style={{ color: '#166534', background: '#F0FDF4', padding: 10, borderRadius: 6 }}>{text(notice)}</div>}
      <div style={{ display: 'grid', gap: 10, border: '1px solid #E2E8F0', borderRadius: 8, padding: 12 }}>
        <h4 style={{ margin: 0 }}>{text('Droits annuels configurés par RH')}</h4>
        <form onSubmit={saveEntitlement} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <label>{text('Année')}
            <input type="number" min={1900} max={2200} value={entitlementYear} onChange={(event) => {
              const year = Number(event.target.value);
              setEntitlementYear(year);
              setEntitlementEffectiveFrom(`${year}-01-01`);
            }} style={inputStyle} />
          </label>
          <label>{text('Salarié')}
            <select required value={entitlementEmployeeId} onChange={(event) => setEntitlementEmployeeId(event.target.value)} style={inputStyle}>
              <option value="">{text('Sélectionner…')}</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}
            </select>
          </label>
          <label>{text('Jours calendaires autorisés')}
            <input required type="number" min={0} step={1} value={entitlementDays} onChange={(event) => setEntitlementDays(event.target.value)} style={inputStyle} />
          </label>
          <label>{text('Source / référence de politique')}
            <input required maxLength={300} value={entitlementPolicySource} onChange={(event) => setEntitlementPolicySource(event.target.value)} style={inputStyle} placeholder={text('Politique RH v2, convention…')} />
          </label>
          <label>{text('Date d’effet')}
            <input required type="date" value={entitlementEffectiveFrom} onChange={(event) => setEntitlementEffectiveFrom(event.target.value)} style={inputStyle} />
          </label>
          <label>{text('Justification')}
            <input required maxLength={1000} value={entitlementReason} onChange={(event) => setEntitlementReason(event.target.value)} style={inputStyle} />
          </label>
          <button type="submit" disabled={saving || employees.length === 0}>{saving ? text('Enregistrement…') : text('Enregistrer le droit')}</button>
        </form>
        <p style={{ margin: 0, color: '#475569', fontSize: '0.82rem' }}>
          {text('Paramétrage manuel et traçable, sans règle légale codée en dur. Une demande annuelle exige un droit défini pour chaque année concernée; la source et la date d’effet ne certifient pas sa conformité.')}
        </p>
        {entitlements.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse', textAlign: language === 'AR' ? 'right' : 'left', fontSize: '0.84rem' }}>
              <thead><tr style={{ background: '#F8FAFC' }}>
                <th style={{ padding: 8 }}>{text('Salarié')}</th><th style={{ padding: 8 }}>{text('Droit')}</th>
                <th style={{ padding: 8 }}>{text('Source / effet')}</th>
                <th style={{ padding: 8 }}>{text('Utilisé')}</th><th style={{ padding: 8 }}>{text('En attente')}</th><th style={{ padding: 8 }}>{text('Disponible')}</th>
              </tr></thead>
              <tbody>{entitlements.map((entitlement) => (
                <tr key={entitlement.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                  <td style={{ padding: 8 }}>{entitlement.employee.firstName} {entitlement.employee.lastName}</td>
                  <td style={{ padding: 8 }}>{entitlement.entitlementDays}</td>
                  <td style={{ padding: 8 }}>{text(entitlement.policySource ?? 'Non renseignée')}{entitlement.effectiveFrom ? ` · ${entitlement.effectiveFrom.slice(0, 10)}` : ''}</td>
                  <td style={{ padding: 8 }}>{entitlement.usedDays}</td>
                  <td style={{ padding: 8 }}>{entitlement.pendingDays}</td>
                  <td style={{ padding: 8 }}>{entitlement.availableDays}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      <form onSubmit={submitRequest} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, alignItems: 'end' }}>
        <label>{text('Salarié')}
          <select required value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} style={inputStyle}>
            <option value="">{text('Sélectionner…')}</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>
            ))}
          </select>
        </label>
        <label>{text('Type')}
          <select value={leaveType} onChange={(event) => setLeaveType(event.target.value as LeaveRequestRecord['leaveType'])} style={inputStyle}>
            {Object.entries(leaveTypeLabels).map(([value, label]) => <option key={value} value={value}>{text(label)}</option>)}
          </select>
        </label>
        <label>{text('Du')}<input type="date" required value={startAt} onChange={(event) => setStartAt(event.target.value)} style={inputStyle} /></label>
        <label>{text('Au')}<input type="date" required min={startAt || undefined} value={endAt} onChange={(event) => setEndAt(event.target.value)} style={inputStyle} /></label>
        <label>{text('Motif')}<input required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} style={inputStyle} /></label>
        <button type="submit" disabled={saving || employees.length === 0} style={{ minHeight: 38 }}>
          {saving ? text('Enregistrement…') : text('Créer une demande')}
        </button>
      </form>
      {loading && <p role="status">{text('Chargement des demandes…')}</p>}
      {!loading && requests.length === 0 && <p>{text('Aucune demande de congé pour cette entité.')}</p>}
      {requests.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', textAlign: language === 'AR' ? 'right' : 'left', fontSize: '0.84rem' }}>
            <thead><tr style={{ background: '#F8FAFC' }}>
              <th style={{ padding: 9 }}>{text('Salarié')}</th><th style={{ padding: 9 }}>{text('Type / période')}</th>
              <th style={{ padding: 9 }}>{text('Motif')}</th><th style={{ padding: 9 }}>{text('État / revue')}</th><th style={{ padding: 9 }}>{text('Action')}</th>
            </tr></thead>
            <tbody>{requests.map((request) => (
              <tr key={request.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                <td style={{ padding: 9 }}>{request.employee.firstName} {request.employee.lastName}<br /><span dir="ltr">{request.employee.empId ?? ''}</span></td>
                <td style={{ padding: 9 }}>{text(leaveTypeLabels[request.leaveType])}<br />{new Date(`${request.startAt.slice(0, 10)}T00:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' })} — {new Date(`${request.endAt.slice(0, 10)}T00:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' })}</td>
                <td style={{ padding: 9 }}>{request.reason}</td>
                <td style={{ padding: 9 }}>{text(statusLabels[request.status])}{request.reviewedBy && <><br />{text('Par')} <span dir="ltr">{request.reviewedBy.username}</span></>}{request.reviewNote && <><br />{request.reviewNote}</>}</td>
                <td style={{ padding: 9 }}>
                  {request.status === 'PENDING' ? (
                    <span style={{ display: 'inline-flex', gap: 5 }}>
                      <button type="button" onClick={() => void reviewRequest(request, 'approve')}>{text('Approuver')}</button>
                      <button type="button" onClick={() => void reviewRequest(request, 'reject')}>{text('Refuser')}</button>
                    </span>
                  ) : '—'}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
