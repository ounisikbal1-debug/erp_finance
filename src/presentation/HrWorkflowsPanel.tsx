import React, { useEffect, useState } from 'react';
import {
  filterEmployeeDocuments,
  formatEmployeeDocumentDate,
  getLocalCalendarDate,
  getEmployeeDocumentValidity,
  type EmployeeDocumentValidity,
  type EmployeeDocumentValidityFilter,
} from './hr-document-validity';
import {
  HR_DOCUMENT_MIME_TYPES,
  MAX_HR_DOCUMENT_BYTES,
} from '../application/modules/hr/employee-document-file-rules';

type Tab = 'documents' | 'recruitment' | 'expenses';
type Employee = { id: string; empId: string | null; firstName: string; lastName: string };
type EventRecord = { id: string; action: string; createdAt: string };
type EmployeeDocument = {
  id: string; category: string; title: string; status: string; validFrom: string | null; validUntil: string | null;
  employee: Employee; events: EventRecord[];
  file: { mimeType: string; sizeBytes: number; uploadedAt: string; uploadedByUsername: string } | null;
};
type Candidate = {
  id: string; firstName: string | null; lastName: string | null; email: string | null; status: string;
  anonymizedAt: string | null; events: EventRecord[];
};
type Position = { id: string; title: string; status: string; applications: Candidate[] };
type Interview = {
  id: string; scheduledAt: string; status: string; application: { firstName: string | null; lastName: string | null; position: { title: string } };
};
type ExpenseClaim = {
  id: string; category: string; expenseDate: string; amount: number; currency: string; status: string;
  submittedByUserId: string; employee: Employee;
};

const documentValidityLabels: Record<EmployeeDocumentValidity, string> = {
  EXPIRED: 'Expiré',
  RENEW_SOON: 'À renouveler sous 30 jours',
  VALID: 'Valide',
  NO_EXPIRY: 'Sans échéance',
  ARCHIVED: 'Archivé',
};

async function request<T>(token: string, path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/hr${path}`, {
    ...options,
    headers: {
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : 'La demande RH a échoué.';
    throw new Error(message);
  }
  return payload as T;
}

function dateLabel(value: string | null) {
  return formatEmployeeDocumentDate(value);
}

export default function HrWorkflowsPanel({ accessToken }: { accessToken: string | null }) {
  const [tab, setTab] = useState<Tab>('documents');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [documentValidityFilter, setDocumentValidityFilter] = useState<EmployeeDocumentValidityFilter>('ALL');
  const [documentSearch, setDocumentSearch] = useState('');
  const [positions, setPositions] = useState<Position[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [documentEmployeeId, setDocumentEmployeeId] = useState('');
  const [documentCategory, setDocumentCategory] = useState('CONTRACT');
  const [documentTitle, setDocumentTitle] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [editingDocumentId, setEditingDocumentId] = useState('');
  const [documentChangeReason, setDocumentChangeReason] = useState('');
  const [positionTitle, setPositionTitle] = useState('');
  const [candidate, setCandidate] = useState({ positionId: '', firstName: '', lastName: '', email: '' });
  const [claimInput, setClaimInput] = useState({
    employeeId: '', category: 'TRAVEL', expenseDate: '', amount: '', currency: 'TND',
  });

  const load = async () => {
    if (!accessToken) {
      setError('Session API indisponible. Reconnectez-vous pour charger les dossiers RH.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [employeeList, documentList, positionList, interviewList, claimList] = await Promise.all([
        request<Employee[]>(accessToken, '/employees'),
        request<EmployeeDocument[]>(accessToken, '/documents'),
        request<Position[]>(accessToken, '/recruitment/positions'),
        request<Interview[]>(accessToken, '/recruitment/interviews'),
        request<ExpenseClaim[]>(accessToken, '/expense-claims'),
      ]);
      setEmployees(employeeList);
      setDocuments(documentList);
      setPositions(positionList);
      setInterviews(interviewList);
      setClaims(claimList);
      setCandidate((current) => ({ ...current, positionId: current.positionId || positionList.find((item) => item.status === 'OPEN')?.id || '' }));
      setDocumentEmployeeId((current) => current || employeeList[0]?.id || '');
      setClaimInput((current) => ({ ...current, employeeId: current.employeeId || employeeList[0]?.id || '' }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Le module RH est indisponible.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [accessToken]);

  const mutate = async (operation: () => Promise<unknown>, message: string): Promise<boolean> => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
      await load();
      setNotice(message);
      return true;
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : 'La demande RH a échoué.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken) return;
    const updated = editingDocumentId
      ? await mutate(() => request(accessToken, `/documents/${encodeURIComponent(editingDocumentId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          category: documentCategory,
          title: documentTitle,
          ...(validFrom ? { validFrom } : { validFrom: null }),
          ...(validUntil ? { validUntil } : { validUntil: null }),
          reason: documentChangeReason,
        }),
      }), 'Les métadonnées ont été corrigées et le changement audité.')
      : await mutate(() => request(accessToken, '/documents', {
        method: 'POST',
        body: JSON.stringify({
        employeeId: documentEmployeeId,
        category: documentCategory,
        title: documentTitle,
        ...(validFrom ? { validFrom } : {}),
        ...(validUntil ? { validUntil } : {}),
      }),
      }), 'Les métadonnées du document ont été enregistrées. Aucun fichier n’a été chargé.');
    if (updated) {
      setDocumentTitle('');
      setValidFrom('');
      setValidUntil('');
      setDocumentChangeReason('');
      setEditingDocumentId('');
    }
  };

  const createPosition = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken) return;
    const title = positionTitle.trim();
    if (!title) return;
    const saved = await mutate(() => request(accessToken, '/recruitment/positions', {
      method: 'POST', body: JSON.stringify({ title }),
    }), 'Le poste a été créé.');
    if (saved) setPositionTitle('');
  };

  const createCandidate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !candidate.positionId) return;
    const saved = await mutate(() => request(accessToken, `/recruitment/positions/${encodeURIComponent(candidate.positionId)}/applications`, {
      method: 'POST',
      body: JSON.stringify({ firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email }),
    }), 'La candidature a été enregistrée.');
    if (saved) setCandidate((current) => ({ ...current, firstName: '', lastName: '', email: '' }));
  };

  const createClaim = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken) return;
    const saved = await mutate(() => request(accessToken, '/expense-claims', {
      method: 'POST',
      body: JSON.stringify({
        ...claimInput,
        amount: Number(claimInput.amount),
      }),
    }), 'La note de frais est soumise à examen. Aucune écriture comptable ni aucun paiement n’a été généré.');
    if (saved) setClaimInput((current) => ({ ...current, amount: '' }));
  };

  const uploadEmployeeDocumentFile = async (documentId: string, file: File) => {
    if (!accessToken) return false;
    if (file.size > MAX_HR_DOCUMENT_BYTES) {
      setError('Le fichier RH dépasse la limite de 8 Mio.');
      return false;
    }
    return mutate(() => request(accessToken, `/documents/${encodeURIComponent(documentId)}/file`, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-HR-Document-Mime-Type': file.type,
      },
    }), 'Le fichier a été stocké dans l’espace privé RH.');
  };

  const downloadEmployeeDocumentFile = async (document: EmployeeDocument) => {
    if (!accessToken || !document.file || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/hr/documents/${encodeURIComponent(document.id)}/file`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const payload: unknown = await response.json();
        const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'Le téléchargement du document RH a échoué.';
        throw new Error(message);
      }
      const extension = document.file.mimeType === 'application/pdf'
        ? 'pdf'
        : document.file.mimeType === 'image/jpeg' ? 'jpg' : 'png';
      const url = URL.createObjectURL(await response.blob());
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = `document-rh.${extension}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Téléchargement sécurisé du document RH démarré.');
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Le téléchargement du document RH a échoué.');
    } finally {
      setBusy(false);
    }
  };

  const card: React.CSSProperties = {
    background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16,
  };
  const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 6,
  };
  const employeeLabel = (employee: Employee) => `${employee.empId ?? employee.id} — ${employee.firstName} ${employee.lastName}`;
  const today = getLocalCalendarDate();
  const documentCounts = documents.reduce<Record<EmployeeDocumentValidity, number>>((counts, document) => {
    const validity = getEmployeeDocumentValidity(document, today);
    counts[validity] += 1;
    return counts;
  }, { EXPIRED: 0, RENEW_SOON: 0, VALID: 0, NO_EXPIRY: 0, ARCHIVED: 0 });
  const filteredDocuments = filterEmployeeDocuments(documents, documentValidityFilter, documentSearch, today);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <header>
        <h2 style={{ margin: '0 0 6px', color: '#0F172A' }}>Documents, recrutement et notes de frais</h2>
        <p style={{ margin: 0, color: '#475569' }}>
          Données limitées à l’entité de votre session. Les pièces RH sont stockées hors du répertoire web; les CV et justificatifs de frais ne sont pas conservés.
        </p>
      </header>
      {error && <div role="alert" style={{ color: '#991B1B', background: '#FEF2F2', padding: 10, borderRadius: 6 }}>{error}</div>}
      {notice && <div role="status" style={{ color: '#166534', background: '#F0FDF4', padding: 10, borderRadius: 6 }}>{notice}</div>}
      <nav aria-label="Fonctions RH" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {([
          ['documents', 'Documents du personnel'],
          ['recruitment', 'Recrutement & entretiens'],
          ['expenses', 'Notes de frais'],
        ] as Array<[Tab, string]>).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      {loading && <p role="status">Chargement des dossiers RH…</p>}

      {tab === 'documents' && (
        <>
          <form onSubmit={(event) => void createDocument(event)} style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, alignItems: 'end' }}>
            <label>Salarié<select required value={documentEmployeeId} onChange={(event) => setDocumentEmployeeId(event.target.value)} style={input}>
              <option value="">Sélectionner un salarié</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeLabel(employee)}</option>)}
            </select></label>
            <label>Catégorie<select value={documentCategory} onChange={(event) => setDocumentCategory(event.target.value)} style={input}>
              <option value="CONTRACT">Contrat</option><option value="CERTIFICATE">Attestation</option><option value="OTHER">Autre</option>
            </select></label>
            <label>Titre / référence<input required maxLength={120} value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} style={input} /></label>
            <label>Valide à partir du<input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} style={input} /></label>
            <label>Valide jusqu’au<input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} style={input} /></label>
            {editingDocumentId && <label>Motif de correction<input required minLength={5} maxLength={500} value={documentChangeReason} onChange={(event) => setDocumentChangeReason(event.target.value)} style={input} /></label>}
            <button type="submit" disabled={busy || !documentEmployeeId}>
              {editingDocumentId ? 'Enregistrer la correction' : 'Enregistrer les métadonnées'}
            </button>
            {editingDocumentId && <button type="button" disabled={busy} onClick={() => {
              setEditingDocumentId('');
              setDocumentTitle('');
              setValidFrom('');
              setValidUntil('');
              setDocumentChangeReason('');
            }}>Annuler la correction</button>}
          </form>
          <section style={{ ...card, overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Dossier documentaire ({documents.length})</h3>
            <div aria-label="Synthèse des échéances documentaires" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {(['EXPIRED', 'RENEW_SOON', 'VALID', 'NO_EXPIRY', 'ARCHIVED'] as const).map((validity) => (
                <span key={validity} style={{ border: '1px solid #CBD5E1', borderRadius: 999, padding: '4px 9px' }}>
                  {documentValidityLabels[validity]} : {documentCounts[validity]}
                </span>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 12 }}>
              <label>Rechercher un salarié ou document<input value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} style={input} /></label>
              <label>Filtrer les échéances<select value={documentValidityFilter} onChange={(event) => setDocumentValidityFilter(event.target.value as EmployeeDocumentValidityFilter)} style={input}>
                <option value="ALL">Tous les documents</option>
                <option value="EXPIRED">Expirés</option>
                <option value="RENEW_SOON">À renouveler sous 30 jours</option>
                <option value="VALID">Valides</option>
                <option value="NO_EXPIRY">Sans échéance</option>
                <option value="ARCHIVED">Archivés</option>
              </select></label>
            </div>
            <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead><tr><th>Salarié</th><th>Type</th><th>Titre</th><th>Validité</th><th>Échéance</th><th>Statut</th><th>Correction / archivage</th><th>Fichier</th></tr></thead>
              <tbody>{filteredDocuments.map((document) => (
                <tr key={document.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                  <td>{employeeLabel(document.employee)}</td><td>{document.category}</td><td>{document.title}</td>
                  <td>{dateLabel(document.validFrom)} — {dateLabel(document.validUntil)}</td>
                  <td>{documentValidityLabels[getEmployeeDocumentValidity(document, today)]}</td>
                  <td>{document.status}{document.file && <><br />Fichier privé · {Math.ceil(document.file.sizeBytes / 1024)} Ko</>}</td>
                  <td>{document.status === 'ACTIVE' && accessToken && <>
                    <button type="button" disabled={busy} onClick={() => {
                      setEditingDocumentId(document.id);
                      setDocumentEmployeeId(document.employee.id);
                      setDocumentCategory(document.category);
                      setDocumentTitle(document.title);
                      setValidFrom(document.validFrom?.slice(0, 10) ?? '');
                      setValidUntil(document.validUntil?.slice(0, 10) ?? '');
                      setDocumentChangeReason('');
                    }}>Corriger</button>
                    <button type="button" disabled={busy} onClick={() => {
                      const note = window.prompt('Motif d’archivage (5 à 500 caractères)');
                      if (note?.trim()) void mutate(() => request(accessToken, `/documents/${encodeURIComponent(document.id)}/archive`, {
                        method: 'POST', body: JSON.stringify({ note }),
                      }), 'Le document a été archivé.');
                    }}>Archiver</button>
                  </>}</td>
                  <td>{document.file && accessToken
                    ? <button type="button" disabled={busy} onClick={() => void downloadEmployeeDocumentFile(document)}>Télécharger</button>
                    : document.status === 'ACTIVE' && accessToken && <label style={{ display: 'inline-block' }}>
                      Joindre un fichier
                      <input
                        type="file"
                        accept={HR_DOCUMENT_MIME_TYPES.join(',')}
                        aria-label={`Joindre un fichier au document ${document.title}`}
                        disabled={busy}
                        style={{ display: 'block', maxWidth: 180, fontSize: '0.8rem' }}
                        onChange={(event) => {
                          const input = event.currentTarget;
                          const file = input.files?.[0];
                          if (file) void uploadEmployeeDocumentFile(document.id, file).then((saved) => {
                            if (saved) input.value = '';
                          });
                        }}
                      />
                    </label>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
            {documents.length === 0
              ? <p>Aucune métadonnée de document n’est enregistrée.</p>
              : filteredDocuments.length === 0 && <p>Aucun document ne correspond à ces filtres.</p>}
          </section>
        </>
      )}

      {tab === 'recruitment' && (
        <>
          <form onSubmit={createPosition} style={{ ...card, display: 'flex', gap: 10 }}>
            <label style={{ flex: 1 }}>Nouveau poste<input required maxLength={120} value={positionTitle} onChange={(event) => setPositionTitle(event.target.value)} style={input} /></label>
            <button type="submit" disabled={busy}>Créer le poste</button>
          </form>
          <form onSubmit={createCandidate} style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, alignItems: 'end' }}>
            <label>Poste ouvert<select required value={candidate.positionId} onChange={(event) => setCandidate({ ...candidate, positionId: event.target.value })} style={input}>
              {positions.filter((position) => position.status === 'OPEN').map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}
            </select></label>
            <label>Prénom<input required maxLength={80} value={candidate.firstName} onChange={(event) => setCandidate({ ...candidate, firstName: event.target.value })} style={input} /></label>
            <label>Nom<input required maxLength={80} value={candidate.lastName} onChange={(event) => setCandidate({ ...candidate, lastName: event.target.value })} style={input} /></label>
            <label>E-mail<input required type="email" maxLength={254} value={candidate.email} onChange={(event) => setCandidate({ ...candidate, email: event.target.value })} style={input} /></label>
            <button type="submit" disabled={busy || positions.every((position) => position.status !== 'OPEN')}>Ajouter la candidature</button>
          </form>
          {positions.map((position) => (
            <section key={position.id} style={{ ...card, overflowX: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <h3 style={{ marginTop: 0 }}>{position.title} · {position.status}</h3>
                {position.status === 'OPEN' && accessToken && <button type="button" disabled={busy} onClick={() => void mutate(
                  () => request(accessToken, `/recruitment/positions/${encodeURIComponent(position.id)}/close`, { method: 'POST' }),
                  'Le poste a été clôturé.',
                )}>Clôturer</button>}
              </div>
              <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead><tr><th>Candidat</th><th>E-mail</th><th>Statut</th><th>Actions</th></tr></thead>
                <tbody>{position.applications.map((application) => (
                  <tr key={application.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                    <td>{application.anonymizedAt ? 'Candidature anonymisée' : `${application.firstName} ${application.lastName}`}</td>
                    <td>{application.email ?? '—'}</td>
                    <td>{application.status}</td>
                    <td style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {!application.anonymizedAt && accessToken && <>
                        <select aria-label="Statut candidature" value={application.status} disabled={busy} onChange={(event) => void mutate(
                          () => request(accessToken, `/recruitment/applications/${encodeURIComponent(application.id)}/status`, {
                            method: 'PATCH', body: JSON.stringify({ status: event.target.value }),
                          }), 'Le statut de candidature a été mis à jour.',
                        )}>
                          <option value="RECEIVED">Reçue</option><option value="IN_REVIEW">En examen</option><option value="INTERVIEW">Entretien</option><option value="CLOSED">Clôturée</option>
                        </select>
                        <button type="button" disabled={busy} onClick={() => {
                          const scheduledAt = window.prompt('Date/heure d’entretien avec fuseau (ex. 2026-11-06T09:00:00+01:00)');
                          if (scheduledAt) void mutate(() => request(accessToken, `/recruitment/applications/${encodeURIComponent(application.id)}/interviews`, {
                            method: 'POST', body: JSON.stringify({ scheduledAt }),
                          }), 'L’entretien a été planifié.');
                        }}>Planifier entretien</button>
                        <button type="button" disabled={busy} onClick={() => {
                          if (window.confirm('Anonymiser les données personnelles de cette candidature ?')) void mutate(
                            () => request(accessToken, `/recruitment/applications/${encodeURIComponent(application.id)}/anonymize`, { method: 'POST' }),
                            'La candidature a été anonymisée.',
                          );
                        }}>Anonymiser</button>
                      </>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
              {position.applications.length === 0 && <p>Aucune candidature.</p>}
            </section>
          ))}
          <section style={{ ...card, overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Entretiens planifiés</h3>
            <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead><tr><th>Candidat</th><th>Poste</th><th>Date et heure</th><th>Statut / action</th></tr></thead>
              <tbody>{interviews.map((interview) => (
                <tr key={interview.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                  <td>{interview.application.firstName} {interview.application.lastName}</td>
                  <td>{interview.application.position.title}</td>
                  <td>{new Date(interview.scheduledAt).toLocaleString('fr-FR')}</td>
                  <td>{interview.status}{interview.status === 'SCHEDULED' && accessToken && <>
                    {' '}<button type="button" disabled={busy} onClick={() => void mutate(() => request(accessToken, `/recruitment/interviews/${encodeURIComponent(interview.id)}/status`, {
                      method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED' }),
                    }), 'L’entretien a été marqué comme terminé.')}>Terminer</button>
                    {' '}<button type="button" disabled={busy} onClick={() => void mutate(() => request(accessToken, `/recruitment/interviews/${encodeURIComponent(interview.id)}/status`, {
                      method: 'PATCH', body: JSON.stringify({ status: 'CANCELLED' }),
                    }), 'L’entretien a été annulé.')}>Annuler</button>
                  </>}</td>
                </tr>
              ))}</tbody>
            </table>
            {interviews.length === 0 && <p>Aucun entretien planifié.</p>}
          </section>
        </>
      )}

      {tab === 'expenses' && (
        <>
          <form onSubmit={createClaim} style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, alignItems: 'end' }}>
            <label>Salarié<select required value={claimInput.employeeId} onChange={(event) => setClaimInput({ ...claimInput, employeeId: event.target.value })} style={input}>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeLabel(employee)}</option>)}
            </select></label>
            <label>Catégorie<select value={claimInput.category} onChange={(event) => setClaimInput({ ...claimInput, category: event.target.value })} style={input}>
              <option value="TRAVEL">Déplacement</option><option value="MEALS">Repas</option><option value="TRANSPORT">Transport</option><option value="SUPPLIES">Fournitures</option><option value="OTHER">Autre</option>
            </select></label>
            <label>Date de dépense<input required type="date" value={claimInput.expenseDate} onChange={(event) => setClaimInput({ ...claimInput, expenseDate: event.target.value })} style={input} /></label>
            <label>Montant<input required type="number" min="0.001" max="1000000000" step="0.001" value={claimInput.amount} onChange={(event) => setClaimInput({ ...claimInput, amount: event.target.value })} style={input} /></label>
            <label>Devise<input required maxLength={3} value={claimInput.currency} onChange={(event) => setClaimInput({ ...claimInput, currency: event.target.value.toUpperCase() })} style={input} /></label>
            <button type="submit" disabled={busy || employees.length === 0}>Soumettre à examen</button>
          </form>
          <section style={{ ...card, overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Notes de frais ({claims.length})</h3>
            <p>Une approbation n’effectue ni paiement ni comptabilisation.</p>
            <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead><tr><th>Salarié</th><th>Date</th><th>Catégorie</th><th>Montant</th><th>Statut</th><th>Décision</th></tr></thead>
              <tbody>{claims.map((claim) => (
                <tr key={claim.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                  <td>{employeeLabel(claim.employee)}</td><td>{dateLabel(claim.expenseDate)}</td><td>{claim.category}</td>
                  <td>{claim.amount.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} {claim.currency}</td><td>{claim.status}</td>
                  <td>{claim.status === 'TO_REVIEW' && accessToken && <>
                    <button type="button" disabled={busy} onClick={() => void mutate(() => request(accessToken, `/expense-claims/${encodeURIComponent(claim.id)}/approve`, { method: 'POST' }), 'La note de frais a été approuvée (sans paiement).')}>Approuver</button>{' '}
                    <button type="button" disabled={busy} onClick={() => void mutate(() => request(accessToken, `/expense-claims/${encodeURIComponent(claim.id)}/reject`, { method: 'POST' }), 'La note de frais a été rejetée.')}>Rejeter</button>
                  </>}</td>
                </tr>
              ))}</tbody>
            </table>
            {claims.length === 0 && <p>Aucune note de frais.</p>}
          </section>
        </>
      )}
    </div>
  );
}
