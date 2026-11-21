import React, { useEffect, useState } from 'react';
import { getHtmlLanguage, translateBusinessText, useInterfaceLanguage } from './localization';

interface Workpaper {
  id: string;
  section: 'G50' | 'RS' | 'IS';
  period: string;
  version: number;
  amount: number;
  taxableBase: number | null;
  taxRateSnapshot: number | null;
  certificateCount: number | null;
  sourceReference: string;
  reviewNote: string;
  approvedByUsername: string;
  approvedAt: string;
  sourceCurrent: boolean;
}

interface TaxDeclarationWorkpaperPanelProps {
  accessToken: string | null;
  entityId: string | null;
  period: string;
  refreshVersion: number;
  onUpdated: () => void;
}

function isWorkpaper(value: unknown): value is Workpaper {
  if (!value || typeof value !== 'object') return false;
  const workpaper = value as Partial<Workpaper>;
  return typeof workpaper.id === 'string'
    && (workpaper.section === 'G50' || workpaper.section === 'RS' || workpaper.section === 'IS')
    && typeof workpaper.period === 'string'
    && typeof workpaper.version === 'number'
    && typeof workpaper.amount === 'number'
    && (workpaper.taxableBase === null || typeof workpaper.taxableBase === 'number')
    && (workpaper.taxRateSnapshot === null || typeof workpaper.taxRateSnapshot === 'number')
    && (workpaper.certificateCount === null || typeof workpaper.certificateCount === 'number')
    && typeof workpaper.sourceReference === 'string'
    && typeof workpaper.reviewNote === 'string'
    && typeof workpaper.approvedByUsername === 'string'
    && typeof workpaper.approvedAt === 'string'
    && typeof workpaper.sourceCurrent === 'boolean';
}

function getErrorMessage(value: unknown): string {
  return value && typeof value === 'object' && 'error' in value && typeof value.error === 'string'
    ? value.error
    : 'Impossible de traiter le dossier fiscal.';
}

export default function TaxDeclarationWorkpaperPanel({
  accessToken,
  entityId,
  period,
  refreshVersion,
  onUpdated,
}: TaxDeclarationWorkpaperPanelProps) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const locale = getHtmlLanguage(language);
  const [workpapers, setWorkpapers] = useState<Workpaper[]>([]);
  const [g50SourceReference, setG50SourceReference] = useState('');
  const [g50ReviewNote, setG50ReviewNote] = useState('');
  const [rsSourceReference, setRsSourceReference] = useState('');
  const [rsReviewNote, setRsReviewNote] = useState('');
  const [isSourceReference, setIsSourceReference] = useState('');
  const [isReviewNote, setIsReviewNote] = useState('');
  const [taxableBase, setTaxableBase] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [g50Confirmed, setG50Confirmed] = useState(false);
  const [rsConfirmed, setRsConfirmed] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    if (!accessToken || !entityId) {
      setWorkpapers([]);
      return () => controller.abort();
    }
    setWorkpapers([]);
    void fetch(`/api/taxation/declaration-workpapers?period=${encodeURIComponent(period)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    }).then(async (response) => {
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(payload));
      if (!Array.isArray(payload) || !payload.every(isWorkpaper)) {
        throw new Error('La réponse des dossiers fiscaux est invalide.');
      }
      setWorkpapers(payload);
    }).catch((requestError: unknown) => {
      if (!controller.signal.aborted) {
        setError(requestError instanceof Error ? requestError.message : 'Impossible de lire les dossiers fiscaux.');
      }
    });
    return () => controller.abort();
  }, [accessToken, entityId, period, refreshVersion]);

  const submit = async (section: 'G50' | 'RS' | 'IS', event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!accessToken || !entityId) throw new Error('Session API invalide.');
      const response = await fetch('/api/taxation/declaration-workpapers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          period,
          section,
          sourceReference: section === 'G50' ? g50SourceReference : section === 'RS' ? rsSourceReference : isSourceReference,
          reviewNote: section === 'G50' ? g50ReviewNote : section === 'RS' ? rsReviewNote : isReviewNote,
          confirmed: section === 'G50' ? g50Confirmed : section === 'RS' ? rsConfirmed : isConfirmed,
          ...(section === 'IS' ? { taxableBase: Number(taxableBase), amount: Number(taxAmount) } : {}),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(payload));
      if (!isWorkpaper(payload)) throw new Error('Le dossier fiscal enregistré est invalide.');
      setWorkpapers((current) => [...current.filter((item) => item.section !== payload.section), payload]);
      if (section === 'G50') {
        setG50SourceReference('');
        setG50ReviewNote('');
        setG50Confirmed(false);
      } else if (section === 'RS') {
        setRsSourceReference('');
        setRsReviewNote('');
        setRsConfirmed(false);
      } else {
        setIsSourceReference('');
        setIsReviewNote('');
        setTaxableBase('');
        setTaxAmount('');
        setIsConfirmed(false);
      }
      onUpdated();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Impossible d’enregistrer le dossier fiscal.');
    } finally {
      setLoading(false);
    }
  };

  const fieldStyle: React.CSSProperties = { display: 'grid', gap: 5, color: '#334155', fontSize: '0.82rem', fontWeight: 700 };
  const inputStyle: React.CSSProperties = { border: '1px solid #CBD5E1', borderRadius: 6, padding: 8 };

  return (
    <section style={{ display: 'grid', gap: 12, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
      <div>
        <h3 style={{ margin: 0, color: '#0F172A' }}>{text('Dossiers de justification G50 / RS / IS')}</h3>
        <p style={{ margin: '6px 0', color: '#64748B', fontSize: '0.82rem' }}>
          {text('Le dossier G50 conserve le composant TVA; le rapport peut aussi afficher séparément la RS issue des certificats émis et l’IS documenté, sans les additionner à un total légal. Pour l’IS, SAFE ne calcule pas le montant.')}
        </p>
      </div>

      {error && <div role="alert" style={{ color: '#991B1B' }}>{text(error)}</div>}
      {workpapers.map((workpaper) => (
        <div key={workpaper.id} style={{ border: '1px solid #CBD5E1', borderRadius: 7, padding: 10 }}>
          <strong>{workpaper.section === 'G50'
            ? text(workpaper.sourceCurrent ? 'Composant TVA G50 enregistré' : 'Composant TVA G50 à actualiser')
            : workpaper.section === 'RS'
              ? text(workpaper.sourceCurrent ? 'Rapprochement RS enregistré' : 'Rapprochement RS à actualiser')
              : text(workpaper.sourceCurrent ? 'Dossier IS enregistré' : 'Dossier IS à actualiser')}</strong>
          {' — '}{workpaper.amount.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} TND
          {workpaper.section === 'IS' && workpaper.taxableBase !== null
            ? `; ${text('base imposable')} ${workpaper.taxableBase.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} TND`
            : workpaper.section === 'G50' && workpaper.taxableBase !== null
              ? `; ${text('base HT TVA collectée')} ${workpaper.taxableBase.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} TND`
              : `; ${workpaper.certificateCount ?? 0} ${text('certificats émis')}`}
          <div>{text('Justificatif')}: <span dir="ltr">{workpaper.sourceReference}</span>; {text('version')} {workpaper.version}; {text('approuvé par')} <span dir="ltr">{workpaper.approvedByUsername}</span></div>
          <div>{text('Note')}: {workpaper.reviewNote}</div>
        </div>
      ))}

      <form onSubmit={(event) => void submit('G50', event)} style={{ display: 'grid', gap: 8, borderTop: '1px solid #E2E8F0', paddingTop: 10 }}>
        <strong>{text('Enregistrer le composant TVA G50')}</strong>
        <label style={fieldStyle}>{text('Référence du rapprochement TVA G50')}
          <input style={inputStyle} value={g50SourceReference} onChange={(event) => setG50SourceReference(event.target.value)} maxLength={200} required />
        </label>
        <label style={fieldStyle}>{text('Note de revue')}
          <input style={inputStyle} value={g50ReviewNote} onChange={(event) => setG50ReviewNote(event.target.value)} minLength={10} maxLength={500} required />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'start', color: '#334155', fontSize: '0.82rem' }}>
          <input type="checkbox" checked={g50Confirmed} onChange={(event) => setG50Confirmed(event.target.checked)} required />
          {text('Je confirme uniquement la revue des pièces TVA rapprochées; ce dossier ne valide pas le total légal G50.')}
        </label>
        <button type="submit" disabled={loading || !g50Confirmed} style={{ justifySelf: 'start' }}>{text('Enregistrer le composant TVA G50')}</button>
      </form>

      <form onSubmit={(event) => void submit('RS', event)} style={{ display: 'grid', gap: 8, borderTop: '1px solid #E2E8F0', paddingTop: 10 }}>
        <strong>{text('Rapprocher et approuver la RS')}</strong>
        <label style={fieldStyle}>{text('Référence du rapprochement RS')}
          <input style={inputStyle} value={rsSourceReference} onChange={(event) => setRsSourceReference(event.target.value)} maxLength={200} required />
        </label>
        <label style={fieldStyle}>{text('Note de revue')}
          <input style={inputStyle} value={rsReviewNote} onChange={(event) => setRsReviewNote(event.target.value)} minLength={10} maxLength={500} required />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'start', color: '#334155', fontSize: '0.82rem' }}>
          <input type="checkbox" checked={rsConfirmed} onChange={(event) => setRsConfirmed(event.target.checked)} required />
          {text('Je confirme que les certificats émis et leurs justificatifs couvrent toutes les retenues RS de cette période.')}
        </label>
        <button type="submit" disabled={loading || !rsConfirmed} style={{ justifySelf: 'start' }}>{text('Approuver la revue RS')}</button>
      </form>

      <form onSubmit={(event) => void submit('IS', event)} style={{ display: 'grid', gap: 8, borderTop: '1px solid #E2E8F0', paddingTop: 10 }}>
        <strong>{text('Enregistrer le dossier IS validé')}</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          <label style={fieldStyle}>{text('Base imposable validée (TND)')}
            <input style={inputStyle} type="number" min="0" step="0.001" value={taxableBase} onChange={(event) => setTaxableBase(event.target.value)} required />
          </label>
          <label style={fieldStyle}>{text('Montant IS reporté (TND)')}
            <input style={inputStyle} type="number" min="0" step="0.001" value={taxAmount} onChange={(event) => setTaxAmount(event.target.value)} required />
          </label>
        </div>
        <label style={fieldStyle}>{text('Référence du dossier fiscal')}
          <input style={inputStyle} value={isSourceReference} onChange={(event) => setIsSourceReference(event.target.value)} maxLength={200} required />
        </label>
        <label style={fieldStyle}>{text('Note de revue')}
          <input style={inputStyle} value={isReviewNote} onChange={(event) => setIsReviewNote(event.target.value)} minLength={10} maxLength={500} required />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'start', color: '#334155', fontSize: '0.82rem' }}>
          <input type="checkbox" checked={isConfirmed} onChange={(event) => setIsConfirmed(event.target.checked)} required />
          {text('Je confirme que la base et le montant proviennent d’un dossier fiscal vérifié par un professionnel habilité.')}
        </label>
        <button type="submit" disabled={loading || !isConfirmed} style={{ justifySelf: 'start' }}>{text('Enregistrer le dossier IS')}</button>
      </form>
    </section>
  );
}
