import React, { useCallback, useEffect, useState } from 'react';

interface FxRevaluationRun {
  id: string;
  effectiveDate: string;
  reversalDate: string;
  functionalCurrencyCode: string;
  status: string;
  reversalProcessedAt: string | null;
  items: Array<{
    id: string;
    direction: string;
    documentCurrencyCode: string;
    openDocumentAmount: number;
    oldCarryingAmount: number;
    revaluedCarryingAmount: number;
    adjustmentAmount: number;
    exchangeRate: number;
    exchangeRateEffectiveDate: string;
    exchangeRateSource: string;
  }>;
  revaluationJournalEntry: { id: string; entryNumber: string; status: string };
  reversalJournalEntry: { id: string; entryNumber: string; status: string; date: string } | null;
}

function priorMonthEnd(): string {
  const date = new Date();
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function formatAmount(value: number, currencyCode: string): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
    .format(value) + ` ${currencyCode}`;
}

async function responseJson(response: Response): Promise<unknown> {
  const result: unknown = await response.json();
  if (!response.ok) {
    const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
      ? result.error
      : `La requête a échoué (${response.status}).`;
    throw new Error(message);
  }
  return result;
}

export default function FxRevaluationPanel({
  accessToken,
  entityId,
}: {
  accessToken: string | null;
  entityId: string | null;
}) {
  const [effectiveDate, setEffectiveDate] = useState(priorMonthEnd);
  const [rateOverridesText, setRateOverridesText] = useState('[]');
  const [note, setNote] = useState('');
  const [runs, setRuns] = useState<FxRevaluationRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const headers = useCallback(() => ({
    Authorization: `Bearer ${accessToken ?? ''}`,
    'Content-Type': 'application/json',
  }), [accessToken]);

  const loadRuns = useCallback(async () => {
    if (!accessToken || !entityId) {
      setRuns([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ entityId });
      const payload = await responseJson(await fetch(`/api/fx-rates/revaluations?${query}`, { headers: headers() }));
      if (!Array.isArray(payload)) throw new Error('La liste des réévaluations reçue est invalide.');
      setRuns(payload as FxRevaluationRun[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les réévaluations.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, entityId, headers]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const createRun = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      let rateOverrides: unknown;
      try {
        rateOverrides = JSON.parse(rateOverridesText);
      } catch {
        throw new Error('Le JSON des taux manuels est invalide.');
      }
      if (!Array.isArray(rateOverrides)) throw new Error('Les taux manuels doivent être une liste JSON.');
      const payload = await responseJson(await fetch('/api/fx-rates/revaluations', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ entityId, effectiveDate, rateOverrides, note }),
      }));
      if (!payload || typeof payload !== 'object' || !('id' in payload)) {
        throw new Error('La réévaluation créée ne contient pas son identifiant.');
      }
      setNotice('Le dossier a été créé et son écriture attend le contrôle et le posting dans le workflow comptable.');
      setNote('');
      await loadRuns();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible de créer la réévaluation.');
    } finally {
      setSaving(false);
    }
  };

  const card: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 10,
    padding: 18,
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    padding: 9,
    color: '#0F172A',
    font: 'inherit',
  };

  return (
    <section style={{ display: 'grid', gap: 16, color: '#0F172A' }}>
      <header style={card}>
        <h2 style={{ margin: 0 }}>Réévaluation des soldes en devises</h2>
        <p style={{ marginBottom: 0, color: '#475569', fontSize: 13 }}>
          Les taux BCT communs les plus récents au plus tard à la clôture sont utilisés automatiquement. Les taux manuels
          doivent être datés, sourcés et fournis par un expert. L’écriture est contrôlée et comptabilisée via Finance;
          sa contrepassation exacte est automatiquement comptabilisée le premier jour du mois suivant.
        </p>
      </header>

      {error && <div role="alert" style={{ ...card, borderColor: '#FCA5A5', background: '#FEF2F2', color: '#991B1B' }}>{error}</div>}
      {notice && <div role="status" style={{ ...card, borderColor: '#86EFAC', background: '#F0FDF4', color: '#166534' }}>{notice}</div>}

      <form onSubmit={createRun} style={{ ...card, display: 'grid', gap: 12 }}>
        <h3 style={{ margin: 0 }}>Créer un dossier de clôture</h3>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 700 }}>
          Date de clôture (fin de mois)
          <input required type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 700 }}>
          Taux de clôture manuels (JSON facultatif)
          <textarea
            value={rateOverridesText}
            onChange={(event) => setRateOverridesText(event.target.value)}
            rows={4}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            aria-describedby="fx-rate-help"
          />
        </label>
        <small id="fx-rate-help" style={{ color: '#64748B' }}>
          Exemple : [{`{"currencyCode":"USD","rate":3.1,"effectiveDate":"2026-03-31","source":"Attestation expert","sourceUrl":"https://..."}`}].
          N’ajoutez un taux manuel que si aucun cours BCT utilisable n’est stocké.
        </small>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 700 }}>
          Motif / référence de contrôle
          <input required maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} style={inputStyle} />
        </label>
        <button type="submit" disabled={saving || loading || !entityId} style={{ justifySelf: 'start', padding: '9px 14px' }}>
          {saving ? 'Création…' : 'Calculer et soumettre pour contrôle'}
        </button>
      </form>

      <section style={{ ...card, overflowX: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Historique des réévaluations</h3>
        {loading && <div role="status">Chargement…</div>}
        {!loading && runs.length === 0 && <p style={{ color: '#64748B' }}>Aucun dossier de réévaluation pour cette société.</p>}
        {runs.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 8 }}>Clôture</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Écriture / état</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Soldes évalués</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Contrepassation</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} style={{ borderTop: '1px solid #E2E8F0', verticalAlign: 'top' }}>
                  <td style={{ padding: 8 }}>{new Date(run.effectiveDate).toLocaleDateString('fr-FR')}</td>
                  <td style={{ padding: 8 }}>
                    <strong>{run.revaluationJournalEntry.entryNumber}</strong><br />
                    {run.revaluationJournalEntry.status}
                  </td>
                  <td style={{ padding: 8 }}>
                    {run.items.map((item) => (
                      <div key={item.id} style={{ marginBottom: 6 }}>
                        {item.direction === 'CUSTOMER_RECEIPT' ? 'Client' : 'Fournisseur'} · {item.documentCurrencyCode} {formatAmount(item.openDocumentAmount, item.documentCurrencyCode)}
                        {' → '}{formatAmount(item.revaluedCarryingAmount, run.functionalCurrencyCode)}
                        {' · '}{item.exchangeRate} ({item.exchangeRateSource}, {item.exchangeRateEffectiveDate})
                      </div>
                    ))}
                  </td>
                  <td style={{ padding: 8 }}>
                    {run.reversalJournalEntry
                      ? `${run.reversalJournalEntry.entryNumber} · ${run.reversalJournalEntry.status}`
                      : `Prévue le ${new Date(run.reversalDate).toLocaleDateString('fr-FR')}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
