import React, { useEffect, useState } from 'react';
import { getHtmlLanguage, translateBusinessText, useInterfaceLanguage } from './localization';

interface CloseEvent {
  id: string;
  checkKey: string;
  checked: boolean;
  note: string;
  actorUserId: string;
  actorUsername: string;
  createdAt: string;
}

interface CloseCheck {
  key: string;
  title: string;
  source: string;
  checked: boolean;
  automaticCount: number | null;
  latestEvent: Omit<CloseEvent, 'id' | 'checkKey'> | null;
}

interface CloseLock {
  lockedAt: string;
  note: string;
  actorUserId: string;
  actorUsername: string;
}

interface MonthlyCloseData {
  entity: { id: string; name: string; currencyCode: string };
  period: string;
  periodType: 'monthly' | 'annual';
  signalCoverage: {
    journalEntriesAwaitingApproval: number;
    bankStatementLines: number;
    unreconciledBankStatementLines: number;
  };
  checks: CloseCheck[];
  history: CloseEvent[];
  historyTruncated: boolean;
  lock: CloseLock | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isMonthlyCloseData(value: unknown): value is MonthlyCloseData {
  if (!isRecord(value)
    || !isRecord(value.entity)
    || !isRecord(value.signalCoverage)
    || !Array.isArray(value.checks)
    || !Array.isArray(value.history)
    || !('lock' in value)) return false;
  return typeof value.entity.id === 'string'
    && typeof value.entity.name === 'string'
    && typeof value.period === 'string'
    && Number.isSafeInteger(value.signalCoverage.journalEntriesAwaitingApproval)
    && Number.isSafeInteger(value.signalCoverage.bankStatementLines)
    && Number.isSafeInteger(value.signalCoverage.unreconciledBankStatementLines)
    && value.checks.every((item) => isRecord(item)
      && typeof item.key === 'string'
      && typeof item.title === 'string'
      && typeof item.source === 'string'
      && typeof item.checked === 'boolean'
      && (item.automaticCount === null || Number.isSafeInteger(item.automaticCount)))
    && value.history.every((item) => isRecord(item)
      && typeof item.id === 'string'
      && typeof item.checkKey === 'string'
      && typeof item.checked === 'boolean'
      && typeof item.note === 'string'
      && typeof item.actorUsername === 'string'
      && typeof item.createdAt === 'string')
    && typeof value.historyTruncated === 'boolean'
    && (value.lock === null || (isRecord(value.lock)
      && typeof value.lock.lockedAt === 'string'
      && typeof value.lock.note === 'string'
      && typeof value.lock.actorUserId === 'string'
      && typeof value.lock.actorUsername === 'string'));
}

function responseError(payload: unknown): string {
  return isRecord(payload) && typeof payload.error === 'string'
    ? payload.error
    : 'Impossible de charger la checklist de clôture.';
}

function defaultPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

function defaultYear(): string {
  return new Date().toISOString().slice(0, 4);
}

export default function MonthlyClosePanel({
  accessToken,
  entityId,
}: {
  accessToken: string | null;
  entityId: string | null;
}) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const locale = getHtmlLanguage(language);
  const [period, setPeriod] = useState(defaultPeriod);
  const [periodType, setPeriodType] = useState<'monthly' | 'annual'>('monthly');
  const [data, setData] = useState<MonthlyCloseData | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [lockNote, setLockNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyCheckKey, setBusyCheckKey] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 10,
    padding: 16,
  };

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    setMessage('');
    if (!accessToken || !entityId) {
      setLoading(false);
      setError(!accessToken
        ? 'Session API indisponible. Reconnectez-vous pour charger la clôture.'
        : 'Aucune société authentifiée n’est associée à cette session.');
      return () => controller.abort();
    }

    const loadChecklist = async () => {
      setLoading(true);
      try {
        const query = new URLSearchParams({ period });
        const response = await fetch(`/api/monthly-close/checklist?${query}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(responseError(payload));
        if (!isMonthlyCloseData(payload) || payload.period !== period
          || payload.periodType !== periodType) {
          throw new Error('La checklist reçue est invalide ou concerne une autre période.');
        }
        if (!controller.signal.aborted) setData(payload);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'La checklist est indisponible.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadChecklist();
    return () => controller.abort();
  }, [accessToken, entityId, period, periodType, refreshVersion]);

  const recordValidation = async (check: CloseCheck) => {
    if (!accessToken || !data || data.lock || busyCheckKey) return;
    const note = (notes[check.key] ?? '').trim();
    if (note.length < 5 || note.length > 500) {
      setError('Ajoutez une note de validation de 5 à 500 caractères pour conserver une piste d’audit utile.');
      return;
    }
    setBusyCheckKey(check.key);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/monthly-close/checklist/${encodeURIComponent(period)}/${encodeURIComponent(check.key)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ checked: !check.checked, note }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(responseError(payload));
      if (!isMonthlyCloseData(payload) || payload.period !== period
        || payload.periodType !== periodType) {
        throw new Error('La confirmation reçue est invalide.');
      }
      setData(payload);
      setNotes((current) => ({ ...current, [check.key]: '' }));
      setMessage(check.checked
        ? 'Contrôle rouvert avec une entrée d’historique.'
        : 'Contrôle confirmé avec une entrée d’historique.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Impossible d’enregistrer la validation.');
    } finally {
      setBusyCheckKey('');
    }
  };

  const lockPeriod = async () => {
    if (!accessToken || !data || data.lock || busyCheckKey) return;
    const note = lockNote.trim();
    if (note.length < 5 || note.length > 500) {
      setError('Ajoutez une note de clôture de 5 à 500 caractères.');
      return;
    }
    setBusyCheckKey('period-lock');
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/monthly-close/periods/${encodeURIComponent(period)}/lock`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ note }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(responseError(payload));
      if (!isMonthlyCloseData(payload) || payload.period !== period
        || payload.periodType !== periodType || !payload.lock) {
        throw new Error('La confirmation de clôture reçue est invalide.');
      }
      setData(payload);
      setLockNote('');
      setMessage(periodType === 'annual'
        ? 'Clôture annuelle verrouillée après validation.'
        : 'Période mensuelle verrouillée après validation.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Impossible de verrouiller la période.');
    } finally {
      setBusyCheckKey('');
    }
  };

  return (
    <section aria-labelledby="close-title" style={{ display: 'grid', gap: 14 }}>
      <header style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
        <div>
          <h2 id="close-title" style={{ margin: 0 }}>
            {text(periodType === 'annual' ? 'Clôture annuelle' : 'Clôture mensuelle')}
          </h2>
          <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: 13 }}>
            {text('Checklists périodiques isolées par société. Les signaux SAFE aident la revue, mais ne valident ni ne clôturent automatiquement aucun contrôle.')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'end', gap: 8 }}>
          <label style={{ display: 'grid', gap: 3, fontSize: 12 }}>
            {text('Type de clôture')}
            <select
              aria-label={text('Type de clôture')}
              value={periodType}
              onChange={(event) => {
                const nextType = event.target.value === 'annual' ? 'annual' : 'monthly';
                setPeriodType(nextType);
                setPeriod(nextType === 'annual' ? defaultYear() : defaultPeriod());
              }}
            >
              <option value="monthly">{text('Mensuelle')}</option>
              <option value="annual">{text('Annuelle')}</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 3, fontSize: 12 }}>
            {text(periodType === 'annual' ? 'Exercice' : 'Mois')}
            <input
              aria-label={text(periodType === 'annual' ? 'Exercice de clôture' : 'Mois de clôture')}
              type={periodType === 'annual' ? 'number' : 'month'}
              min={periodType === 'annual' ? '2000' : undefined}
              max={periodType === 'annual' ? '2100' : undefined}
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            />
          </label>
          <button type="button" disabled={loading} onClick={() => setRefreshVersion((version) => version + 1)}>
            {loading ? text('Chargement…') : text('Actualiser')}
          </button>
        </div>
      </header>

      {loading && <div role="status" style={cardStyle}>{text('Chargement des signaux et de l’historique…')}</div>}
      {error && <div role="alert" style={{ ...cardStyle, color: '#991B1B', background: '#FEF2F2', borderColor: '#FECACA' }}>{text(error)}</div>}
      {message && <div role="status" style={cardStyle}>{text(message)}</div>}
      {data && (
        <>
          <div style={cardStyle}>
            <strong>{data.entity.name}</strong> · {periodType === 'annual' ? `${text('Exercice')} ${data.period}` : data.period}
            <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: 13 }}>
              {text('Les indicateurs automatiques sont des signaux de revue, pas une preuve d’exhaustivité ou de clôture.')}
            </p>
            {data.lock && <p role="status" style={{ marginBottom: 0, color: '#166534' }}>
              {text('Période verrouillée par')} <span dir="ltr">{data.lock.actorUsername}</span> {text('le')} {new Date(data.lock.lockedAt).toLocaleString(locale)} · {text(data.lock.note)}
            </p>}
          </div>
          <section aria-label={text('Signaux issus des données SAFE')} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
            <div style={{ ...cardStyle, borderLeft: '4px solid #F59E0B' }}>
              <strong>{text('Écritures en attente')}</strong>
              <div>{data.signalCoverage.journalEntriesAwaitingApproval} {text('écriture(s) TO_REVIEW ou APPROVED dans la période.')}</div>
              <small>{text('Ce compteur ne coche pas le contrôle correspondant.')}</small>
            </div>
            <div style={{ ...cardStyle, borderLeft: '4px solid #06B6D4' }}>
              <strong>{text('Rapprochement bancaire')}</strong>
              <div>{data.signalCoverage.unreconciledBankStatementLines} {text('ligne(s) non rapprochée(s) sur')} {data.signalCoverage.bankStatementLines} {text('ligne(s) de relevé SAFE chargée(s).')}</div>
              <small>{text('Un mois sans relevé importé n’est pas considéré comme rapproché.')}</small>
            </div>
          </section>
          <section aria-labelledby="monthly-close-checks-title" style={{ ...cardStyle, display: 'grid', gap: 12 }}>
            <h3 id="monthly-close-checks-title" style={{ margin: 0 }}>
              {text(periodType === 'annual' ? 'Contrôles annuels' : 'Contrôles mensuels')}
            </h3>
            {data.checks.map((check) => (
              <article key={check.key} style={{ borderTop: '1px solid #E2E8F0', paddingTop: 10, display: 'grid', gap: 6 }}>
                <strong>{check.checked ? '✓' : '○'} {text(check.title)}</strong>
                <small style={{ color: '#64748B' }}>{text(check.source)}</small>
                {check.latestEvent && (
                  <small>
                    {text('Dernière action :')} {text(check.latestEvent.checked ? 'confirmé' : 'rouvert')} {text('par')} <span dir="ltr">{check.latestEvent.actorUsername}</span>
                    {' · '}{new Date(check.latestEvent.createdAt).toLocaleString(locale)}
                    {' · '}{text(check.latestEvent.note)}
                  </small>
                )}
                <label style={{ display: 'grid', gap: 4 }}>
                  {text('Note obligatoire pour la piste d’audit')}
                  <textarea
                    value={notes[check.key] ?? ''}
                    maxLength={500}
                    rows={2}
                    onChange={(event) => setNotes((current) => ({ ...current, [check.key]: event.target.value }))}
                    placeholder={text(check.checked ? 'Motif de réouverture' : 'Éléments vérifiés ou référence de pièce')}
                  />
                </label>
                <button
                  type="button"
                  disabled={Boolean(busyCheckKey) || Boolean(data.lock)}
                  onClick={() => void recordValidation(check)}
                  style={{ justifySelf: 'start' }}
                >
                  {text(data.lock ? 'Période verrouillée' : busyCheckKey === check.key ? 'Enregistrement…' : check.checked ? 'Rouvrir le contrôle' : 'Confirmer le contrôle')}
                </button>
              </article>
            ))}
          </section>
          {!data.lock && (
            <section aria-label={text('Verrouillage de période')} style={{ ...cardStyle, display: 'grid', gap: 8 }}>
              <strong>{text('Verrouillage persistant')}</strong>
              <p style={{ margin: 0, color: '#64748B' }}>
                {text('Le verrouillage est irréversible dans SAFE et disponible seulement lorsque tous les contrôles requis sont confirmés. Il bloque aussi les écritures de journaux de la période; toute correction comptable ultérieure doit suivre le workflow de contrepassation autorisé dans la période suivante.')}
              </p>
              <label style={{ display: 'grid', gap: 4 }}>
                {text('Note de clôture')}
                <textarea value={lockNote} maxLength={500} rows={2} onChange={(event) => setLockNote(event.target.value)} />
              </label>
              <button
                type="button"
                disabled={Boolean(busyCheckKey) || data.checks.some((check) => !check.checked)}
                onClick={() => void lockPeriod()}
                style={{ justifySelf: 'start' }}
              >
                {text(busyCheckKey === 'period-lock' ? 'Verrouillage…' : periodType === 'annual' ? 'Verrouiller l’exercice' : 'Verrouiller le mois')}
              </button>
            </section>
          )}
          <section aria-labelledby="monthly-close-history-title" style={{ ...cardStyle, display: 'grid', gap: 8 }}>
            <h3 id="monthly-close-history-title" style={{ margin: 0 }}>{text('Historique des actions')}</h3>
            {data.history.length === 0
              ? <p style={{ margin: 0 }}>{text('Aucune validation enregistrée pour cette période.')}</p>
              : <ol style={{ margin: 0, paddingLeft: 22 }}>
                {data.history.map((event) => (
                  <li key={event.id} style={{ marginBottom: 8 }}>
                    <strong>{data.checks.find((check) => check.key === event.checkKey)?.title ?? event.checkKey}</strong>
                    {' — '}{text(event.checked ? 'confirmé' : 'rouvert')} {text('par')} <span dir="ltr">{event.actorUsername}</span>
                    {' · '}{new Date(event.createdAt).toLocaleString(locale)}
                    <div>{text(event.note)}</div>
                  </li>
                ))}
              </ol>}
            {data.historyTruncated && <small>{text('Historique limité aux 500 actions les plus récentes pour cette période.')}</small>}
          </section>
        </>
      )}
    </section>
  );
}
