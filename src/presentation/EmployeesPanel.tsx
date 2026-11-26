import React, { useEffect, useState } from 'react';
import LeaveRequestsPanel from './LeaveRequestsPanel';
import { getHtmlLanguage, translateBusinessText, useInterfaceLanguage } from './localization';

interface EmployeeRecord {
  id: string;
  empId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  position: string | null;
  baseSalary: number;
  maritalStatus: string;
  hiredAt: string;
  terminatedAt: string | null;
  payslips: Array<{ id: string }>;
}

interface EmployeeTerminationUpdate {
  id: string;
  terminatedAt: string | null;
  eventRecorded: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isEmployee(value: unknown): value is EmployeeRecord {
  return isRecord(value)
    && typeof value.id === 'string'
    && (value.empId === null || typeof value.empId === 'string')
    && typeof value.firstName === 'string'
    && typeof value.lastName === 'string'
    && typeof value.email === 'string'
    && (value.position === null || typeof value.position === 'string')
    && typeof value.baseSalary === 'number'
    && typeof value.maritalStatus === 'string'
    && typeof value.hiredAt === 'string'
    && (value.terminatedAt === null || typeof value.terminatedAt === 'string')
    && Array.isArray(value.payslips)
    && value.payslips.every((payslip) => isRecord(payslip) && typeof payslip.id === 'string');
}

function isEmployeeTerminationUpdate(value: unknown, employeeId: string): value is EmployeeTerminationUpdate {
  return isRecord(value)
    && value.id === employeeId
    && (value.terminatedAt === null || typeof value.terminatedAt === 'string')
    && typeof value.eventRecorded === 'boolean';
}

function responseError(payload: unknown, fallback: string): string {
  return isRecord(payload) && typeof payload.error === 'string' ? payload.error : fallback;
}

export default function EmployeesPanel({ accessToken }: { accessToken: string | null }) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const locale = getHtmlLanguage(language);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [baseSalary, setBaseSalary] = useState('');
  const [hiredAt, setHiredAt] = useState('');
  const [terminationDateDrafts, setTerminationDateDrafts] = useState<Record<string, string>>({});
  const [terminationNotes, setTerminationNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingTerminationId, setPendingTerminationId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setEmployees([]);
    setError('');
    if (!accessToken) {
      setLoading(false);
      setError('Session API indisponible. Reconnectez-vous pour charger les salariés.');
      setTerminationDateDrafts({});
      return () => controller.abort();
    }

    const loadEmployees = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/hr/employees', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(responseError(payload, 'Impossible de charger les salariés.'));
        if (!Array.isArray(payload) || !payload.every(isEmployee)) {
          throw new Error('La réponse des salariés est invalide.');
        }
        if (!controller.signal.aborted) {
          setEmployees(payload);
          setTerminationDateDrafts(Object.fromEntries(payload.map((employee) => [
            employee.id,
            employee.terminatedAt?.slice(0, 10) ?? '',
          ])));
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Le module RH est indisponible.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadEmployees();
    return () => controller.abort();
  }, [accessToken]);

  const createEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    const salary = Number(baseSalary);
    if (!accessToken || saving) return;
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !Number.isFinite(salary) || salary < 0) {
      setError('Renseignez le prénom, le nom, un e-mail valide et un salaire de base positif ou nul.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/hr/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          position: position.trim() || undefined,
          baseSalary: salary,
          ...(hiredAt ? { hiredAt } : {}),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(responseError(payload, 'Le salarié n’a pas pu être enregistré.'));
      if (!isRecord(payload)) {
        throw new Error('La réponse de création du salarié est invalide.');
      }
      const created = { ...payload, payslips: [] };
      if (!isEmployee(created)) {
        throw new Error('La réponse de création du salarié est invalide.');
      }
      setEmployees((current) => [created, ...current]);
      window.dispatchEvent(new CustomEvent('safe:hr-employee-created', { detail: created }));
      setFirstName('');
      setLastName('');
      setEmail('');
      setPosition('');
      setBaseSalary('');
      setHiredAt('');
      setTerminationDateDrafts((current) => ({ ...current, [created.id]: '' }));
      setNotice(`${text('Salarié')} ${created.firstName} ${created.lastName} ${text('enregistré dans l’entité associée à votre session.')}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’enregistrement du salarié.');
    } finally {
      setSaving(false);
    }
  };

  const saveTerminationDate = async (employee: EmployeeRecord) => {
    if (!accessToken || pendingTerminationId) return;
    const reason = terminationNotes[employee.id]?.trim();
    if (!reason) {
      setError(text('Un motif est obligatoire pour modifier la date de sortie.'));
      return;
    }

    setPendingTerminationId(employee.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/hr/employees/${encodeURIComponent(employee.id)}/termination`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          terminatedAt: terminationDateDrafts[employee.id] || null,
          note: reason,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(responseError(payload, 'La date de sortie n’a pas pu être enregistrée.'));
      if (!isEmployeeTerminationUpdate(payload, employee.id)) {
        throw new Error('La réponse de mise à jour de la date de sortie est invalide.');
      }
      const { terminatedAt, eventRecorded } = payload;
      setEmployees((current) => current.map((item) => item.id === employee.id ? { ...item, terminatedAt } : item));
      setTerminationDateDrafts((current) => ({ ...current, [employee.id]: terminatedAt?.slice(0, 10) ?? '' }));
      setTerminationNotes((current) => ({ ...current, [employee.id]: '' }));
      setNotice(text(eventRecorded
        ? 'Date de sortie enregistrée avec sa trace d’audit.'
        : 'Aucune modification de la date de sortie.'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’enregistrement de la date de sortie.');
    } finally {
      setPendingTerminationId(null);
    }
  };

  const deleteEmployee = async (employee: EmployeeRecord) => {
    if (!accessToken || pendingDeleteId || employee.payslips.length > 0) return;
    if (!window.confirm(`${text('Supprimer le salarié')} ${employee.firstName} ${employee.lastName} ?`)) return;
    setPendingDeleteId(employee.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/hr/employees/${encodeURIComponent(employee.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(responseError(payload, 'Le salarié n’a pas pu être supprimé.'));
      setEmployees((current) => current.filter((item) => item.id !== employee.id));
      setNotice(`${text('Salarié')} ${employee.firstName} ${employee.lastName} ${text('supprimé.')}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de la suppression du salarié.');
    } finally {
      setPendingDeleteId(null);
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
        <h2 style={{ margin: '0 0 6px', color: '#0F172A' }}>{text('Salariés de l’entité authentifiée')}</h2>
        <p style={{ margin: 0, color: '#475569' }}>{text('Les enregistrements et suppressions sont persistés par l’API RH; l’historique de paie est conservé.')}</p>
      </header>
      {error && <div role="alert" style={{ color: '#991B1B', background: '#FEF2F2', padding: 10, borderRadius: 6 }}>{text(error)}</div>}
      {notice && <div role="status" style={{ color: '#166534', background: '#F0FDF4', padding: 10, borderRadius: 6 }}>{text(notice)}</div>}
      <form onSubmit={createEmployee} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, alignItems: 'end', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
        <label>{text('Prénom')}<input required value={firstName} onChange={(event) => setFirstName(event.target.value)} style={inputStyle} /></label>
        <label>{text('Nom')}<input required value={lastName} onChange={(event) => setLastName(event.target.value)} style={inputStyle} /></label>
        <label>{text('E-mail')}<input dir="ltr" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} style={inputStyle} /></label>
        <label>{text('Poste')}<input value={position} onChange={(event) => setPosition(event.target.value)} style={inputStyle} /></label>
        <label>{text('Salaire de base')}<input dir="ltr" required type="number" min="0" step="0.001" value={baseSalary} onChange={(event) => setBaseSalary(event.target.value)} style={inputStyle} /></label>
        <label>{text('Date d’embauche')}<input type="date" value={hiredAt} onChange={(event) => setHiredAt(event.target.value)} style={inputStyle} /></label>
        <button type="submit" disabled={saving} style={{ minHeight: 38 }}>{saving ? text('Enregistrement…') : text('Enregistrer le salarié')}</button>
      </form>
      <section style={{ overflowX: 'auto', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>{text('Dossier du personnel')} ({employees.length})</h3>
        {loading && <p role="status">{text('Chargement des salariés persistés…')}</p>}
        {!loading && employees.length === 0 && <p>{text('Aucun salarié n’est enregistré pour cette entité.')}</p>}
        {employees.length > 0 && (
          <table style={{ width: '100%', minWidth: 1020, borderCollapse: 'collapse', textAlign: language === 'AR' ? 'right' : 'left', fontSize: '0.84rem' }}>
            <thead><tr style={{ background: '#F8FAFC' }}>
              <th style={{ padding: 9 }}>{text('Matricule')}</th><th style={{ padding: 9 }}>{text('Salarié')}</th>
              <th style={{ padding: 9 }}>{text('Poste')}</th><th style={{ padding: 9 }}>{text('E-mail')}</th>
              <th style={{ padding: 9, textAlign: 'right' }}>{text('Salaire de base')}</th>
              <th style={{ padding: 9 }}>{text('Fiches de paie')}</th>
              <th style={{ padding: 9 }}>{text('Date de sortie')}</th><th style={{ padding: 9 }}>{text('Action')}</th>
            </tr></thead>
            <tbody>{employees.map((employee) => (
              <tr key={employee.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                <td dir="ltr" style={{ padding: 9 }}>{employee.empId ?? '—'}</td>
                <td style={{ padding: 9 }}>{employee.firstName} {employee.lastName}</td>
                <td style={{ padding: 9 }}>{employee.position ?? '—'}</td>
                <td dir="ltr" style={{ padding: 9 }}>{employee.email}</td>
                <td dir="ltr" style={{ padding: 9, textAlign: 'right' }}>{employee.baseSalary.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                <td style={{ padding: 9 }}>{employee.payslips.length > 0 ? `${text('Historique conservé')} (${employee.payslips.length} ${text('récente(s)')})` : text('Aucune fiche')}</td>
                <td style={{ padding: 9, minWidth: 220 }}>
                  <input
                    aria-label={`${text('Date de sortie')} — ${employee.firstName} ${employee.lastName}`}
                    type="date"
                    value={terminationDateDrafts[employee.id] ?? employee.terminatedAt?.slice(0, 10) ?? ''}
                    onChange={(event) => setTerminationDateDrafts((current) => ({ ...current, [employee.id]: event.target.value }))}
                    style={inputStyle}
                  />
                  <input
                    aria-label={`${text('Motif')} — ${employee.firstName} ${employee.lastName}`}
                    maxLength={500}
                    placeholder={text('Motif obligatoire')}
                    value={terminationNotes[employee.id] ?? ''}
                    onChange={(event) => setTerminationNotes((current) => ({ ...current, [employee.id]: event.target.value }))}
                    style={{ ...inputStyle, marginTop: 6 }}
                  />
                  <button
                    type="button"
                    disabled={pendingTerminationId !== null || !(terminationNotes[employee.id] ?? '').trim()}
                    onClick={() => void saveTerminationDate(employee)}
                    style={{ marginTop: 6 }}
                  >
                    {text(pendingTerminationId === employee.id ? 'Enregistrement…' : 'Enregistrer la date')}
                  </button>
                </td>
                <td style={{ padding: 9 }}>
                  <button type="button" disabled={pendingDeleteId !== null || employee.payslips.length > 0} onClick={() => void deleteEmployee(employee)}>
                    {text(pendingDeleteId === employee.id ? 'Suppression…' : employee.payslips.length > 0 ? 'Fiche(s) conservée(s)' : 'Supprimer')}
                  </button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
      <LeaveRequestsPanel accessToken={accessToken} employees={employees.map(({ id, firstName, lastName, empId }) => ({ id, firstName, lastName, empId }))} />
    </div>
  );
}
