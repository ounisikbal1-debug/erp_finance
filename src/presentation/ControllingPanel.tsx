import React, { useEffect, useState } from 'react';

interface CostCenterResult {
  code: string;
  name: string;
  department: string;
  totalExpenses: number;
  totalRevenues: number;
  netBalance: number;
  unmappedAccountCodes: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCostCenterResult(value: unknown): value is CostCenterResult {
  return isRecord(value)
    && typeof value.code === 'string'
    && typeof value.name === 'string'
    && typeof value.department === 'string'
    && typeof value.totalExpenses === 'number'
    && Number.isFinite(value.totalExpenses)
    && typeof value.totalRevenues === 'number'
    && Number.isFinite(value.totalRevenues)
    && typeof value.netBalance === 'number'
    && Number.isFinite(value.netBalance)
    && Array.isArray(value.unmappedAccountCodes)
    && value.unmappedAccountCodes.every((code) => typeof code === 'string');
}

function formatAmount(value: number): string {
  return value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export default function ControllingPanel({
  accessToken,
  entityId,
}: {
  accessToken: string | null;
  entityId: string | null;
}) {
  const [results, setResults] = useState<CostCenterResult[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [periodType, setPeriodType] = useState<'all' | 'month' | 'quarter' | 'year'>('all');
  const [monthPeriod, setMonthPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [periodYear, setPeriodYear] = useState(() => String(new Date().getFullYear()));
  const [quarter, setQuarter] = useState('1');
  const [draftCenter, setDraftCenter] = useState({ code: '', name: '', department: '' });
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editingCenter, setEditingCenter] = useState({ name: '', department: '' });
  const [savingCenter, setSavingCenter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const period = periodType === 'month'
    ? monthPeriod
    : periodType === 'quarter'
      ? `${periodYear}-Q${quarter}`
      : periodType === 'year' ? periodYear : '';
  const periodLabel = periodType === 'quarter'
    ? `T${quarter} ${periodYear}`
    : periodType === 'year' ? `l’année ${periodYear}` : period;

  useEffect(() => {
    const controller = new AbortController();
    setResults(null);
    setError('');

    if (!accessToken || !entityId) {
      setLoading(false);
      setError(!accessToken
        ? 'Session API indisponible. Reconnectez-vous pour charger le contrôle de gestion.'
        : 'Aucune société authentifiée n’est associée à cette session.');
      return () => controller.abort();
    }
    if (periodType !== 'all' && !period) {
      setLoading(false);
      setError('Sélectionnez une période valide.');
      return () => controller.abort();
    }

    const loadResults = async () => {
      setLoading(true);
      try {
        const periodQuery = period ? `?period=${encodeURIComponent(period)}` : '';
        const response = await fetch(`/api/controlling/analytics${periodQuery}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error(isRecord(payload) && typeof payload.error === 'string'
            ? payload.error
            : 'Impossible de charger les analyses par centre de coûts.');
        }
        if (!Array.isArray(payload) || !payload.every(isCostCenterResult)) {
          throw new Error('La réponse du contrôle de gestion est invalide.');
        }
        if (!controller.signal.aborted) setResults(payload);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error
            ? requestError.message
            : 'Le contrôle de gestion est indisponible.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    const fieldStyle: React.CSSProperties = {
      display: 'grid',
      gap: 4,
      color: '#475569',
      fontSize: '0.75rem',
      fontWeight: 700,
    };

    const inputStyle: React.CSSProperties = {
      width: '100%',
      minHeight: 34,
      boxSizing: 'border-box',
      padding: '6px 8px',
      border: '1px solid #CBD5E1',
      borderRadius: 6,
      background: '#FFFFFF',
    };

    const actionButtonStyle: React.CSSProperties = {
      border: 0,
      borderRadius: 6,
      padding: '7px 10px',
      background: '#2563EB',
      color: '#FFFFFF',
      fontWeight: 700,
      cursor: 'pointer',
    };

    void loadResults();
    return () => controller.abort();
  }, [accessToken, entityId, period, periodType, refreshVersion]);

  const refresh = () => setRefreshVersion((value) => value + 1);
  const totals = (results ?? []).reduce((value, row) => ({
    expenses: value.expenses + row.totalExpenses,
    revenues: value.revenues + row.totalRevenues,
    balance: value.balance + row.netBalance,
  }), { expenses: 0, revenues: 0, balance: 0 });
  const unmappedAccounts = [...new Set((results ?? []).flatMap((row) => row.unmappedAccountCodes))];

  const saveNewCenter = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !entityId || savingCenter) return;
    setSavingCenter(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/controlling/cost-centers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(draftCenter),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(isRecord(payload) && typeof payload.error === 'string'
          ? payload.error
          : 'Le centre de coûts n’a pas pu être créé.');
      }
      setDraftCenter({ code: '', name: '', department: '' });
      setNotice('Centre de coûts créé.');
      refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de la création du centre.');
    } finally {
      setSavingCenter(false);
    }
  };

  const saveCenterChanges = async (code: string) => {
    if (!accessToken || !entityId || savingCenter) return;
    setSavingCenter(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/controlling/cost-centers/${encodeURIComponent(code)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(editingCenter),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(isRecord(payload) && typeof payload.error === 'string'
          ? payload.error
          : 'Le centre de coûts n’a pas pu être modifié.');
      }
      setEditingCode(null);
      setNotice(`Centre ${code} mis à jour.`);
      refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de la modification du centre.');
    } finally {
      setSavingCenter(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: '10px',
    padding: '1rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  };

  return (
    <section aria-label="Contrôle de gestion par centre de coûts">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0F172A', fontSize: '1.2rem' }}>Contrôle de gestion</h2>
          <p style={{ margin: '0.35rem 0 0', color: '#64748B', fontSize: '0.82rem' }}>
            Charges et produits comptabilisés par centre de coûts, gérés par société.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'end', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 4, color: '#475569', fontSize: '0.75rem', fontWeight: 700 }}>
            Période
            <select value={periodType} onChange={(event) => setPeriodType(event.target.value as typeof periodType)}>
              <option value="all">Toutes périodes</option>
              <option value="month">Mois</option>
              <option value="quarter">Trimestre</option>
              <option value="year">Année</option>
            </select>
          </label>
          {periodType === 'month' && (
            <label style={{ display: 'grid', gap: 4, color: '#475569', fontSize: '0.75rem', fontWeight: 700 }}>
              Mois
              <input aria-label="Mois" type="month" value={monthPeriod} onChange={(event) => setMonthPeriod(event.target.value)} />
            </label>
          )}
          {(periodType === 'quarter' || periodType === 'year') && (
            <label style={{ display: 'grid', gap: 4, color: '#475569', fontSize: '0.75rem', fontWeight: 700 }}>
              Année
              <input aria-label="Année" type="number" min={1900} max={9999} step={1} value={periodYear} onChange={(event) => setPeriodYear(event.target.value)} />
            </label>
          )}
          {periodType === 'quarter' && (
            <label style={{ display: 'grid', gap: 4, color: '#475569', fontSize: '0.75rem', fontWeight: 700 }}>
              Trimestre
              <select aria-label="Trimestre" value={quarter} onChange={(event) => setQuarter(event.target.value)}>
                <option value="1">T1</option>
                <option value="2">T2</option>
                <option value="3">T3</option>
                <option value="4">T4</option>
              </select>
            </label>
          )}
          <button type="button" onClick={() => setPeriodType('all')} disabled={!period || loading} style={{ border: '1px solid #CBD5E1', borderRadius: '7px', padding: '0.5rem 0.8rem', background: '#FFFFFF', color: '#334155', fontWeight: 700 }}>Toutes périodes</button>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            style={{ border: '1px solid #CBD5E1', borderRadius: '7px', padding: '0.5rem 0.8rem', background: '#FFFFFF', color: '#334155', fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}
          >
            Actualiser
          </button>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: '1rem', color: '#475569', fontSize: '0.8rem' }}>
        Les montants couvrent les écritures <strong>POSTED</strong> affectées à un centre de coûts{period ? ` pour ${periodLabel}` : ' sur toutes les périodes'}. Les écritures non affectées, les brouillons et les comptes absents du plan comptable ne sont pas inclus; les comptes non mappés sont signalés ci-dessous.
      </div>

      {notice && <div role="status" style={{ ...cardStyle, marginBottom: '1rem', borderColor: '#86EFAC', color: '#166534' }}>{notice}</div>}
      {error && (
        <div role="alert" style={{ ...cardStyle, marginBottom: '1rem', borderColor: '#FCA5A5', color: '#B91C1C' }}>
          {error}
        </div>
      )}
      {loading && <p role="status" style={{ color: '#64748B' }}>Chargement des analyses…</p>}

      {results && !loading && (
        <>
          <form onSubmit={saveNewCenter} style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', alignItems: 'end', gap: 10, marginBottom: '1rem' }}>
            <label style={fieldStyle}>Code<input required maxLength={50} pattern="[A-Za-z0-9][A-Za-z0-9._-]*" value={draftCenter.code} onChange={(event) => setDraftCenter({ ...draftCenter, code: event.target.value })} style={inputStyle} /></label>
            <label style={fieldStyle}>Nom<input required maxLength={120} value={draftCenter.name} onChange={(event) => setDraftCenter({ ...draftCenter, name: event.target.value })} style={inputStyle} /></label>
            <label style={fieldStyle}>Département<input required maxLength={120} value={draftCenter.department} onChange={(event) => setDraftCenter({ ...draftCenter, department: event.target.value })} style={inputStyle} /></label>
            <button type="submit" disabled={savingCenter} style={actionButtonStyle}>{savingCenter ? 'Enregistrement…' : 'Créer un centre'}</button>
          </form>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.8rem', marginBottom: '1rem' }}>
            {[
              { label: 'Charges comptabilisées', value: totals.expenses },
              { label: 'Produits comptabilisés', value: totals.revenues },
              { label: 'Solde net', value: totals.balance },
            ].map((item) => (
              <div key={item.label} style={cardStyle}>
                <div style={{ color: '#64748B', fontSize: '0.75rem', fontWeight: 700 }}>{item.label}</div>
                <div style={{ color: '#0F172A', fontSize: '1.2rem', fontWeight: 800, marginTop: '0.35rem' }}>{formatAmount(item.value)}</div>
                <div style={{ color: '#94A3B8', fontSize: '0.68rem', marginTop: '0.2rem' }}>Devise fonctionnelle de l’entité</div>
              </div>
            ))}
          </div>

          {unmappedAccounts.length > 0 && (
            <div role="status" style={{ ...cardStyle, marginBottom: '1rem', borderColor: '#FCD34D', color: '#92400E' }}>
              Comptes exclus des totaux car absents du plan comptable du pays : {unmappedAccounts.join(', ')}.
            </div>
          )}

          {results.length === 0 ? (
            <div style={cardStyle} role="status">
              Aucun centre de coûts n’est configuré pour cette société.
            </div>
          ) : (
            <div style={{ ...cardStyle, overflowX: 'auto', padding: 0 }}>
              <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569' }}>
                    <th scope="col" style={{ padding: '0.75rem' }}>Centre</th>
                    <th scope="col" style={{ padding: '0.75rem' }}>Département</th>
                    <th scope="col" style={{ padding: '0.75rem', textAlign: 'right' }}>Charges</th>
                    <th scope="col" style={{ padding: '0.75rem', textAlign: 'right' }}>Produits</th>
                    <th scope="col" style={{ padding: '0.75rem', textAlign: 'right' }}>Solde net</th>
                    <th scope="col" style={{ padding: '0.75rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr key={row.code} style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <th scope="row" style={{ padding: '0.75rem', color: '#0F172A', fontWeight: 700, textAlign: 'left' }}>
                        {editingCode === row.code ? (
                          <div style={{ display: 'grid', gap: 5 }}>
                            <input aria-label={`Nom du centre ${row.code}`} required maxLength={120} value={editingCenter.name} onChange={(event) => setEditingCenter({ ...editingCenter, name: event.target.value })} style={inputStyle} />
                            <div style={{ color: '#64748B', fontWeight: 500 }}>{row.code}</div>
                          </div>
                        ) : <>{row.name}<div style={{ color: '#64748B', fontWeight: 500 }}>{row.code}</div></>}
                      </th>
                      <td style={{ padding: '0.75rem', color: '#475569' }}>
                        {editingCode === row.code
                          ? <input aria-label={`Département du centre ${row.code}`} required maxLength={120} value={editingCenter.department} onChange={(event) => setEditingCenter({ ...editingCenter, department: event.target.value })} style={inputStyle} />
                          : row.department}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatAmount(row.totalExpenses)}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatAmount(row.totalRevenues)}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatAmount(row.netBalance)}</td>
                      <td style={{ padding: '0.75rem' }}>
                        {editingCode === row.code ? (
                          <div style={{ display: 'flex', gap: 5 }}>
                            <button type="button" disabled={savingCenter} onClick={() => void saveCenterChanges(row.code)} style={actionButtonStyle}>Enregistrer</button>
                            <button type="button" disabled={savingCenter} onClick={() => setEditingCode(null)} style={{ ...actionButtonStyle, background: '#64748B' }}>Annuler</button>
                          </div>
                        ) : (
                          <button type="button" disabled={savingCenter} onClick={() => {
                            setEditingCode(row.code);
                            setEditingCenter({ name: row.name, department: row.department });
                          }} style={actionButtonStyle}>Modifier</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

const fieldStyle: React.CSSProperties = {
  display: 'grid',
  gap: 4,
  color: '#475569',
  fontSize: '0.75rem',
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 34,
  boxSizing: 'border-box',
  padding: '6px 8px',
  border: '1px solid #CBD5E1',
  borderRadius: 6,
  background: '#FFFFFF',
};

const actionButtonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 6,
  padding: '7px 10px',
  background: '#2563EB',
  color: '#FFFFFF',
  fontWeight: 700,
  cursor: 'pointer',
};
