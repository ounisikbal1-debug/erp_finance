import React, { useEffect, useState } from 'react';
import { summarizeTenderOutcomes } from '../application/modules/tenders/outcomes';
import { getHtmlLanguage, translateBusinessText, useInterfaceLanguage } from './localization';

type Tender = {
  id: string;
  tenderReference: string;
  title: string;
  contractingAuthority: string;
  portalReference: string | null;
  submissionDeadline: string | null;
  status: string;
  documents: Array<{
    id: string;
    title: string;
    isRequired: boolean;
    status: string;
    reference: string | null;
    validUntil: string | null;
  }>;
  cautions: Array<{
    id: string;
    kind: string;
    amount: number;
    currencyCode: string;
    status: string;
    reference: string | null;
    issuedAt: string | null;
    releasedAt: string | null;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readResponse(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(isRecord(body) && typeof body.error === 'string' ? body.error : 'La demande marchés publics a échoué.');
  }
  return body;
}

export default function PublicTendersPanel({
  accessToken,
  currency,
}: {
  accessToken: string | null;
  currency: string;
}) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [reference, setReference] = useState('');
  const [title, setTitle] = useState('');
  const [authority, setAuthority] = useState('');
  const [portalReference, setPortalReference] = useState('');
  const [deadline, setDeadline] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [cautionKind, setCautionKind] = useState<'PROVISIONAL' | 'DEFINITIVE'>('PROVISIONAL');
  const [cautionAmount, setCautionAmount] = useState('');
  const [cautionReference, setCautionReference] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const selected = tenders.find((item) => item.id === selectedId) ?? null;

  const load = async (signal?: AbortSignal) => {
    if (!accessToken) throw new Error('Session API indisponible. Reconnectez-vous pour charger les marchés publics.');
    const response = await fetch('/api/tenders', { headers: { Authorization: `Bearer ${accessToken}` }, signal });
    const result = await readResponse(response);
    if (!Array.isArray(result) || !result.every((item) => isRecord(item)
      && typeof item.id === 'string' && Array.isArray(item.documents) && Array.isArray(item.cautions))) {
      throw new Error('La réponse marchés publics est invalide.');
    }
    setTenders(result as Tender[]);
    setSelectedId((current) => result.some((item) => isRecord(item) && item.id === current)
      ? current
      : (isRecord(result[0]) && typeof result[0].id === 'string' ? result[0].id : ''));
  };

  useEffect(() => {
    const controller = new AbortController();
    setTenders([]);
    setSelectedId('');
    load(controller.signal).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Chargement impossible.');
    });
    return () => controller.abort();
  }, [accessToken]);

  const request = async (path: string, method: 'POST' | 'PATCH', body: unknown, success: string) => {
    if (!accessToken) {
      setError('Session API indisponible. Reconnectez-vous.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      await readResponse(response);
      await load();
      setNotice(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  const createTender = (event: React.FormEvent) => {
    event.preventDefault();
    void request('/api/tenders', 'POST', {
      tenderReference: reference,
      title,
      contractingAuthority: authority,
      portalReference: portalReference || null,
      submissionDeadline: deadline || null,
    }, 'Appel d’offres ajouté.');
    setReference('');
    setTitle('');
    setAuthority('');
    setPortalReference('');
    setDeadline('');
  };

  return (
    <section className="panel" aria-labelledby="public-tenders-title">
      <h2 id="public-tenders-title">{text('Suivi des marchés publics')}</h2>
      <p>{text('Suivi interne des échéances, pièces configurées par votre équipe et cautions saisies manuellement. Aucun calcul réglementaire ni connexion TUNEPS.')}</p>
      {error && <p role="alert">{text(error)}</p>}
      {notice && <p role="status">{text(notice)}</p>}
      {summarizeTenderOutcomes(tenders).length > 0 && (
        <div aria-label={text('Historique des résultats par donneur d’ordre')}>
          <h3>{text('Résultats par donneur d’ordre')}</h3>
          <ul>{summarizeTenderOutcomes(tenders).map((outcome) => (
            <li key={outcome.contractingAuthority}>
              {outcome.contractingAuthority} — {outcome.won} {text('attribué(s)')}, {outcome.lost} {text('non retenu(s)')}
            </li>
          ))}</ul>
        </div>
      )}
      <form onSubmit={createTender}>
        <h3>{text('Ajouter un appel d’offres')}</h3>
        <label>{text('Référence')} <input required maxLength={100} value={reference} onChange={(event) => setReference(event.target.value)} /></label>
        <label>{text('Objet')} <input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>{text('Donneur d’ordre')} <input required maxLength={200} value={authority} onChange={(event) => setAuthority(event.target.value)} /></label>
        <label>{text('Référence portail (facultatif)')} <input maxLength={200} value={portalReference} onChange={(event) => setPortalReference(event.target.value)} /></label>
        <label>{text('Date limite')} <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
        <button type="submit" disabled={saving}>{text('Ajouter')}</button>
      </form>

      <label>{text('Appels suivis')}
        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">{text('Sélectionner')}</option>
          {tenders.map((item) => <option key={item.id} value={item.id}>{item.tenderReference} — {item.title}</option>)}
        </select>
      </label>

      {selected && (
        <div>
          <h3>{selected.title}</h3>
          <p>{selected.contractingAuthority} · {text('Réf.')} {selected.tenderReference}
            {selected.submissionDeadline && ` · ${text('Date limite')} : ${selected.submissionDeadline.slice(0, 10)}`}
          </p>
          <label>{text('Statut')}
            <select value={selected.status} disabled={saving} onChange={(event) => {
              void request(`/api/tenders/${selected.id}/status`, 'PATCH', { status: event.target.value }, 'Statut mis à jour.');
            }}>
              <option value="TRACKING">{text('À suivre')}</option>
              <option value="SUBMITTED">{text('Déposé')}</option>
              <option value="WON">{text('Attribué')}</option>
              <option value="LOST">{text('Non retenu')}</option>
              <option value="WITHDRAWN">{text('Retiré')}</option>
            </select>
          </label>
          <h4>{text('Checklist personnalisée')}</h4>
          <ul>{selected.documents.map((document) => (
            <li key={document.id}>
              <form onSubmit={(event) => {
                event.preventDefault();
                const values = new FormData(event.currentTarget);
                void request(`/api/tenders/${selected.id}/documents/${document.id}`, 'PATCH', {
                  status: values.get('status'),
                  reference: values.get('reference') || null,
                  validUntil: values.get('validUntil') || null,
                }, 'Suivi de la pièce mis à jour.');
              }}>
                {document.title}{document.isRequired ? ` (${text('obligatoire selon votre configuration')})` : ''}
                <label>{text('État')}
                  <select name="status" defaultValue={document.status} disabled={saving}>
                    <option value="MISSING">{text('Manquante')}</option>
                    <option value="READY">{text('Prête')}</option>
                    <option value="SUBMITTED">{text('Transmise')}</option>
                  </select>
                </label>
                <label>{text('Référence')} <input name="reference" maxLength={200} defaultValue={document.reference ?? ''} /></label>
                <label>{text('Valide jusqu’au')} <input name="validUntil" type="date" defaultValue={document.validUntil?.slice(0, 10) ?? ''} /></label>
                <button type="submit" disabled={saving}>{text('Mettre à jour')}</button>
              </form>
            </li>
          ))}</ul>
          <form onSubmit={(event) => {
            event.preventDefault();
            if (!documentTitle.trim()) return;
            void request(`/api/tenders/${selected.id}/documents`, 'POST', { title: documentTitle }, 'Pièce ajoutée.');
            setDocumentTitle('');
          }}>
            <label>{text('Ajouter une pièce à la checklist')} <input required maxLength={160} value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} /></label>
            <button type="submit" disabled={saving}>{text('Ajouter la pièce')}</button>
          </form>
          <h4>{text('Cautions saisies')}</h4>
          <ul>{selected.cautions.map((caution) => (
            <li key={caution.id}>
              <form onSubmit={(event) => {
                event.preventDefault();
                const values = new FormData(event.currentTarget);
                void request(`/api/tenders/${selected.id}/cautions/${caution.id}`, 'PATCH', {
                  status: values.get('status'),
                  issuedAt: values.get('issuedAt') || null,
                  releasedAt: values.get('releasedAt') || null,
                  reference: values.get('reference') || null,
                }, 'Suivi de la caution mis à jour.');
              }}>
                {text(caution.kind === 'PROVISIONAL' ? 'Provisoire' : 'Définitive')} — {caution.amount.toLocaleString(getHtmlLanguage(language))} {caution.currencyCode}
                <label>{text('Référence')} <input name="reference" maxLength={200} defaultValue={caution.reference ?? ''} /></label>
                <label>{text('État')}
                  <select name="status" defaultValue={caution.status} disabled={saving}>
                    <option value="PLANNED">{text('Prévue')}</option>
                    <option value="ISSUED">{text('Émise')}</option>
                    <option value="RELEASED">{text('Mainlevée enregistrée')}</option>
                  </select>
                </label>
                <label>{text('Date d’émission')}
                  <input name="issuedAt" type="date" defaultValue={caution.issuedAt?.slice(0, 10) ?? ''} />
                </label>
                <label>{text('Date de mainlevée')}
                  <input name="releasedAt" type="date" defaultValue={caution.releasedAt?.slice(0, 10) ?? ''} />
                </label>
                <button type="submit" disabled={saving}>{text('Mettre à jour')}</button>
              </form>
            </li>
          ))}</ul>
          <form onSubmit={(event) => {
            event.preventDefault();
            void request(`/api/tenders/${selected.id}/cautions`, 'POST', {
              kind: cautionKind,
              amount: Number(cautionAmount),
              currencyCode: currency,
              reference: cautionReference || null,
            }, 'Caution enregistrée.');
            setCautionAmount('');
            setCautionReference('');
          }}>
            <label>{text('Type')} <select value={cautionKind} onChange={(event) => setCautionKind(event.target.value as typeof cautionKind)}>
              <option value="PROVISIONAL">{text('Provisoire')}</option><option value="DEFINITIVE">{text('Définitive')}</option>
            </select></label>
            <label>{text('Montant')} <input required type="number" min="0.001" step="0.001" value={cautionAmount} onChange={(event) => setCautionAmount(event.target.value)} /></label>
            <label>{text('Référence')} <input maxLength={200} value={cautionReference} onChange={(event) => setCautionReference(event.target.value)} /></label>
            <button type="submit" disabled={saving}>{text('Enregistrer la caution')}</button>
          </form>
        </div>
      )}
    </section>
  );
}
