import React, { useEffect, useMemo, useState } from 'react';
import {
  ACTION_STATUSES,
  ACTION_TRANSITIONS,
  FINDING_TRANSITIONS,
  QUALITY_STATUSES,
  hasVerifiedQualityActions,
  isQualityActionOverdue,
  isQualityFindingOverdue,
  type QualityActionStatus as ActionStatus,
  type QualityStatus as FindingStatus,
} from '../application/modules/quality/validation';

interface QualityAction {
  id: string;
  type: 'CORRECTIVE' | 'PREVENTIVE' | 'CONTAINMENT';
  description: string;
  owner: string;
  dueAt: string;
  status: ActionStatus;
  verificationNotes: string | null;
}

interface EquipmentOption {
  id: string;
  assetTag: string;
  name: string;
  category: string;
  location: string | null;
  status: string;
}

interface QualityFinding {
  id: string;
  title: string;
  description: string;
  source: string;
  severity: string;
  status: FindingStatus;
  detectedAt: string;
  dueAt: string | null;
  owner: string;
  rootCause: string | null;
  containmentAction: string | null;
  closureNotes: string | null;
  equipment: Pick<EquipmentOption, 'id' | 'assetTag' | 'name' | 'category' | 'location'> | null;
  actions: QualityAction[];
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Ouverte',
  INVESTIGATING: 'En analyse',
  ACTION_REQUIRED: 'Actions requises',
  VERIFYING: 'Vérification',
  CLOSED: 'Clôturée',
  CANCELLED: 'Annulée',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminée',
  CORRECTIVE: 'Corrective',
  PREVENTIVE: 'Préventive',
  CONTAINMENT: 'Sécurisation',
  INTERNAL_AUDIT: 'Audit interne',
  CUSTOMER: 'Client',
  SUPPLIER: 'Fournisseur',
  PRODUCTION: 'Production',
  EQUIPMENT: 'Équipement',
  OTHER: 'Autre',
  LOW: 'Faible',
  MEDIUM: 'Moyenne',
  HIGH: 'Élevée',
  CRITICAL: 'Critique',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAction(value: unknown): value is QualityAction {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.type === 'string'
    && typeof value.description === 'string'
    && typeof value.owner === 'string'
    && typeof value.dueAt === 'string'
    && typeof value.status === 'string'
    && ACTION_STATUSES.some((status) => status === value.status)
    && (value.verificationNotes === null || typeof value.verificationNotes === 'string');
}

function isFinding(value: unknown): value is QualityFinding {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.description === 'string'
    && typeof value.source === 'string'
    && typeof value.severity === 'string'
    && typeof value.status === 'string'
    && QUALITY_STATUSES.some((status) => status === value.status)
    && typeof value.detectedAt === 'string'
    && (value.dueAt === null || typeof value.dueAt === 'string')
    && typeof value.owner === 'string'
    && (value.rootCause === null || typeof value.rootCause === 'string')
    && (value.containmentAction === null || typeof value.containmentAction === 'string')
    && (value.closureNotes === null || typeof value.closureNotes === 'string')
    && (value.equipment === null || (
      isRecord(value.equipment)
      && typeof value.equipment.id === 'string'
      && typeof value.equipment.assetTag === 'string'
      && typeof value.equipment.name === 'string'
      && typeof value.equipment.category === 'string'
      && (value.equipment.location === null || typeof value.equipment.location === 'string')
    ))
    && Array.isArray(value.actions)
    && value.actions.every(isAction);
}

function isEquipment(value: unknown): value is EquipmentOption {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.assetTag === 'string'
    && typeof value.name === 'string'
    && typeof value.category === 'string'
    && (value.location === null || typeof value.location === 'string')
    && typeof value.status === 'string';
}

function errorMessage(payload: unknown, fallback: string): string {
  return isRecord(payload) && typeof payload.error === 'string' ? payload.error : fallback;
}

function dateLabel(value: string | null): string {
  return value ? new Date(value).toLocaleString('fr-FR') : '—';
}

function localDateTime(daysFromNow = 0): string {
  const date = new Date(Date.now() + daysFromNow * 86400000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function QualityPanel({ accessToken }: { accessToken: string | null }) {
  const [findings, setFindings] = useState<QualityFinding[]>([]);
  const [equipment, setEquipment] = useState<EquipmentOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState('INTERNAL_AUDIT');
  const [equipmentId, setEquipmentId] = useState('');
  const [severity, setSeverity] = useState('MEDIUM');
  const [detectedAt, setDetectedAt] = useState(() => localDateTime());
  const [dueAt, setDueAt] = useState(() => localDateTime(7));
  const [owner, setOwner] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [containmentAction, setContainmentAction] = useState('');
  const [closureNotes, setClosureNotes] = useState('');
  const [actionType, setActionType] = useState('CORRECTIVE');
  const [actionDescription, setActionDescription] = useState('');
  const [actionOwner, setActionOwner] = useState('');
  const [actionDueAt, setActionDueAt] = useState(() => localDateTime(7));
  const [verificationByAction, setVerificationByAction] = useState<Record<string, string>>({});
  const [asOf, setAsOf] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setAsOf(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const selected = useMemo(
    () => findings.find((finding) => finding.id === selectedId) ?? null,
    [findings, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setRootCause(selected.rootCause ?? '');
    setContainmentAction(selected.containmentAction ?? '');
    setClosureNotes(selected.closureNotes ?? '');
  }, [selected]);

  const request = async (path: string, init?: RequestInit): Promise<unknown> => {
    if (!accessToken) throw new Error('Session API indisponible. Reconnectez-vous pour accéder au registre Qualité.');
    const response = await fetch(`/api/quality${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${accessToken}`,
        ...init?.headers,
      },
    });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(errorMessage(payload, 'La demande Qualité a échoué.'));
    return payload;
  };

  const refresh = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [payload, equipmentPayload] = await Promise.all([
        request('/findings', { signal }),
        request('/equipment', { signal }),
      ]);
      if (!Array.isArray(payload) || !payload.every(isFinding)) {
        throw new Error('La réponse du registre des non-conformités est invalide.');
      }
      if (!Array.isArray(equipmentPayload) || !equipmentPayload.every(isEquipment)) {
        throw new Error('La liste des équipements disponibles est invalide.');
      }
      if (!signal?.aborted) {
        setFindings(payload);
        setEquipment(equipmentPayload.filter((item) => item.status === 'ACTIVE'));
        setSelectedId((current) => payload.some((finding) => finding.id === current) ? current : payload[0]?.id ?? '');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setFindings([]);
    setEquipment([]);
    setError('');
    void refresh(controller.signal).catch((requestError) => {
      if (!controller.signal.aborted) {
        setError(requestError instanceof Error ? requestError.message : 'Le registre Qualité est indisponible.');
      }
    });
    return () => controller.abort();
  }, [accessToken]);

  const runMutation = async (operation: () => Promise<unknown>, message: string, reset?: () => void) => {
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await operation();
      await refresh();
      reset?.();
      setNotice(message);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'La demande Qualité a échoué.');
    } finally {
      setSaving(false);
    }
  };

  const createFinding = (event: React.FormEvent) => {
    event.preventDefault();
    void runMutation(
      () => request('/findings', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          source,
          severity,
          ...(source === 'EQUIPMENT' ? { equipmentId } : {}),
          detectedAt: new Date(detectedAt).toISOString(),
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          owner,
          rootCause: rootCause || undefined,
          containmentAction: containmentAction || undefined,
        }),
      }),
      'Non-conformité enregistrée.',
      () => {
        setTitle('');
        setDescription('');
        setRootCause('');
        setContainmentAction('');
        setEquipmentId('');
      },
    );
  };

  const updateFinding = (finding: QualityFinding, update: Record<string, unknown>, message: string) => {
    void runMutation(
      () => request(`/findings/${encodeURIComponent(finding.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(update),
      }),
      message,
    );
  };

  const createAction = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    void runMutation(
      () => request(`/findings/${encodeURIComponent(selected.id)}/actions`, {
        method: 'POST',
        body: JSON.stringify({
          type: actionType,
          description: actionDescription,
          owner: actionOwner,
          dueAt: new Date(actionDueAt).toISOString(),
        }),
      }),
      'Action CAPA ajoutée.',
      () => setActionDescription(''),
    );
  };

  const updateAction = (action: QualityAction, status: ActionStatus) => {
    const verificationNotes = verificationByAction[action.id]?.trim();
    if (status === 'COMPLETED' && !verificationNotes) {
      setError('Saisissez les preuves de vérification avant de terminer cette action.');
      return;
    }
    if (!selected) return;
    void runMutation(
      () => request(`/actions/${encodeURIComponent(action.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          ...(status === 'COMPLETED' ? { verificationNotes } : {}),
        }),
      }),
      'Statut de l’action mis à jour.',
    );
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
  };
  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 10,
    padding: 16,
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <header>
        <h2 style={{ margin: '0 0 6px', color: '#0F172A' }}>Non-conformités et actions CAPA</h2>
        <p style={{ margin: 0, color: '#475569' }}>
          Registre limité à l’entité de votre session. Documentez les faits, la cause racine, les actions et leur vérification avant clôture.
        </p>
      </header>
      {error && <div role="alert" style={{ color: '#991B1B', background: '#FEF2F2', padding: 10, borderRadius: 6 }}>{error}</div>}
      {notice && <div role="status" style={{ color: '#166534', background: '#F0FDF4', padding: 10, borderRadius: 6 }}>{notice}</div>}

      <form onSubmit={createFinding} style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, alignItems: 'end' }}>
        <h3 style={{ gridColumn: '1 / -1', margin: 0 }}>Déclarer une non-conformité</h3>
        <label>Titre<input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} style={inputStyle} /></label>
        <label>Origine<select value={source} onChange={(event) => setSource(event.target.value)} style={inputStyle}>
          <option value="INTERNAL_AUDIT">Audit interne</option><option value="CUSTOMER">Client</option>
          <option value="SUPPLIER">Fournisseur</option><option value="PRODUCTION">Production</option>
          <option value="EQUIPMENT">Équipement</option><option value="OTHER">Autre</option>
        </select></label>
        {source === 'EQUIPMENT' && (
          <label>Équipement concerné<select
            required
            value={equipmentId}
            onChange={(event) => setEquipmentId(event.target.value)}
            style={inputStyle}
          >
            <option value="">Sélectionner un équipement</option>
            {equipment.map((item) => (
              <option key={item.id} value={item.id}>{item.assetTag} — {item.name}</option>
            ))}
          </select></label>
        )}
        <label>Gravité<select value={severity} onChange={(event) => setSeverity(event.target.value)} style={inputStyle}>
          <option value="LOW">Faible</option><option value="MEDIUM">Moyenne</option>
          <option value="HIGH">Élevée</option><option value="CRITICAL">Critique</option>
        </select></label>
        <label>Détectée le<input required type="datetime-local" value={detectedAt} onChange={(event) => setDetectedAt(event.target.value)} style={inputStyle} /></label>
        <label>Échéance cible<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} style={inputStyle} /></label>
        <label>Responsable<input required maxLength={160} value={owner} onChange={(event) => setOwner(event.target.value)} style={inputStyle} /></label>
        <label style={{ gridColumn: '1 / -1' }}>Description factuelle<textarea required maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} style={inputStyle} /></label>
        <label>Action immédiate de sécurisation<textarea maxLength={4000} value={containmentAction} onChange={(event) => setContainmentAction(event.target.value)} rows={2} style={inputStyle} /></label>
        <label>Cause racine connue<textarea maxLength={4000} value={rootCause} onChange={(event) => setRootCause(event.target.value)} rows={2} style={inputStyle} /></label>
        <button type="submit" disabled={saving} style={{ minHeight: 38 }}>{saving ? 'Enregistrement…' : 'Créer le dossier'}</button>
      </form>

      <section style={{ ...cardStyle, overflowX: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Registre ({findings.length})</h3>
        {(findings.some((finding) => isQualityFindingOverdue(finding, asOf))
          || findings.some((finding) => finding.actions.some((action) => isQualityActionOverdue(action, asOf)))) && (
          <p role="status" style={{ color: '#991B1B', background: '#FEF2F2', padding: 10, borderRadius: 6 }}>
            Dossiers en retard : {findings.filter((finding) => isQualityFindingOverdue(finding, asOf)).length} · Actions CAPA en retard :{' '}
            {findings.reduce((count, finding) => count + finding.actions.filter((action) => isQualityActionOverdue(action, asOf)).length, 0)}
          </p>
        )}
        {loading && <p role="status">Chargement du registre…</p>}
        {!loading && findings.length === 0 && <p>Aucune non-conformité n’est enregistrée pour cette entité.</p>}
        {findings.length > 0 && (
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
            <thead><tr style={{ background: '#F8FAFC' }}>
              <th style={{ padding: 9 }}>Dossier</th><th style={{ padding: 9 }}>Origine / gravité</th>
              <th style={{ padding: 9 }}>Responsable</th><th style={{ padding: 9 }}>Échéance</th>
              <th style={{ padding: 9 }}>Statut</th><th style={{ padding: 9 }}>CAPA</th>
            </tr></thead>
            <tbody>{findings.map((finding) => (
              <tr key={finding.id} style={{ borderTop: '1px solid #E2E8F0', background: finding.id === selectedId ? '#EFF6FF' : undefined }}>
                <td style={{ padding: 9 }}><button type="button" onClick={() => setSelectedId(finding.id)}>{finding.title}</button><div>{dateLabel(finding.detectedAt)}</div></td>
                <td style={{ padding: 9 }}>
                  {STATUS_LABELS[finding.source] ?? finding.source} / {STATUS_LABELS[finding.severity] ?? finding.severity}
                  {finding.equipment && <div>{finding.equipment.assetTag} — {finding.equipment.name}</div>}
                </td>
                <td style={{ padding: 9 }}>{finding.owner}</td><td style={{ padding: 9 }}>
                  {dateLabel(finding.dueAt)}
                  {isQualityFindingOverdue(finding, asOf) && <strong style={{ display: 'block', color: '#B91C1C' }}>Échéance dépassée</strong>}
                </td>
                <td style={{ padding: 9 }}>{STATUS_LABELS[finding.status] ?? finding.status}</td>
                <td style={{ padding: 9 }}>{finding.actions.length} action(s)</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      {selected && (
        <section style={{ ...cardStyle, display: 'grid', gap: 12 }}>
          <h3 style={{ margin: 0 }}>{selected.title} — dossier détaillé</h3>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{selected.description}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <strong>Avancement: {STATUS_LABELS[selected.status] ?? selected.status}</strong>
            {FINDING_TRANSITIONS[selected.status].map((status) => (
              <button
                key={status}
                type="button"
                disabled={
                  saving
                  || (status === 'VERIFYING' && !hasVerifiedQualityActions(selected.actions))
                  || (status === 'CLOSED' && (!rootCause.trim() || !closureNotes.trim()))
                }
                onClick={() => updateFinding(selected, {
                  status,
                  ...(status === 'CLOSED' ? { rootCause, closureNotes } : {}),
                }, 'Statut du dossier mis à jour.')}
              >
                {status === 'CLOSED' ? 'Clôturer après vérification' : `Passer à « ${STATUS_LABELS[status]} »`}
              </button>
            ))}
          </div>
          {selected.status === 'VERIFYING' && (
            <p style={{ margin: 0, color: '#475569' }}>
              Pour démarrer la vérification, toutes les actions CAPA doivent être terminées avec une preuve enregistrée.
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <label>Cause racine<textarea maxLength={4000} value={rootCause} onChange={(event) => setRootCause(event.target.value)} rows={3} style={inputStyle} /></label>
            <label>Mesures de sécurisation<textarea maxLength={4000} value={containmentAction} onChange={(event) => setContainmentAction(event.target.value)} rows={3} style={inputStyle} /></label>
            <label>Conclusion de clôture<textarea maxLength={4000} value={closureNotes} onChange={(event) => setClosureNotes(event.target.value)} rows={3} style={inputStyle} /></label>
            <button type="button" disabled={saving} onClick={() => updateFinding(selected, {
              rootCause: rootCause || null,
              containmentAction: containmentAction || null,
              closureNotes: closureNotes || null,
            }, 'Analyse et mesures enregistrées.')}>Enregistrer l’analyse</button>
          </div>
          <form onSubmit={createAction} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end', borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
            <h4 style={{ gridColumn: '1 / -1', margin: 0 }}>Ajouter une action CAPA</h4>
            <label>Type<select value={actionType} onChange={(event) => setActionType(event.target.value)} style={inputStyle}>
              <option value="CORRECTIVE">Corrective</option><option value="PREVENTIVE">Préventive</option><option value="CONTAINMENT">Sécurisation</option>
            </select></label>
            <label>Responsable<input required maxLength={160} value={actionOwner} onChange={(event) => setActionOwner(event.target.value)} style={inputStyle} /></label>
            <label>Échéance<input required type="datetime-local" value={actionDueAt} onChange={(event) => setActionDueAt(event.target.value)} style={inputStyle} /></label>
            <label>Description<textarea required maxLength={2000} value={actionDescription} onChange={(event) => setActionDescription(event.target.value)} rows={2} style={inputStyle} /></label>
            <button
              type="submit"
              disabled={saving || selected.status === 'CLOSED' || selected.status === 'CANCELLED' || selected.status === 'VERIFYING'}
            >Ajouter l’action</button>
          </form>
          {selected.status === 'VERIFYING' && (
            <p style={{ margin: 0, color: '#475569' }}>
              Pour ajouter une action, repassez le dossier en « Actions requises ».
            </p>
          )}
          <div style={{ display: 'grid', gap: 10 }}>
            <h4 style={{ margin: 0 }}>Actions et vérification</h4>
            {selected.actions.length === 0 && <p>Aucune action enregistrée. La clôture est bloquée tant qu’une action CAPA vérifiée n’est pas présente.</p>}
            {selected.actions.map((action) => (
              <article key={action.id} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
                <strong>{STATUS_LABELS[action.type] ?? action.type} — {action.description}</strong>
                <span>Responsable: {action.owner} · échéance: {dateLabel(action.dueAt)} · statut: {STATUS_LABELS[action.status] ?? action.status}</span>
                {isQualityActionOverdue(action, asOf) && <strong style={{ color: '#B91C1C' }}>Échéance CAPA dépassée</strong>}
                {action.verificationNotes && <span>Vérification: {action.verificationNotes}</span>}
                {action.status === 'IN_PROGRESS' && (
                  <label>Preuves de vérification<textarea
                    maxLength={4000}
                    value={verificationByAction[action.id] ?? ''}
                    onChange={(event) => setVerificationByAction((current) => ({ ...current, [action.id]: event.target.value }))}
                    rows={2}
                    style={inputStyle}
                  /></label>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  {ACTION_TRANSITIONS[action.status].map((status) => (
                    <button key={status} type="button" disabled={saving} onClick={() => updateAction(action, status)}>
                      {status === 'COMPLETED' ? 'Terminer après vérification' : status === 'IN_PROGRESS' ? 'Démarrer' : 'Annuler'}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
