import React, { useEffect, useState } from 'react';
import { buildCashFlowLines, buildDetailedBalanceLines, buildEquityChangesLines, buildFinancialPositionLines, isFinancialPositionSummary, type FinancialPositionSummary } from './financial-position';

type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

interface FinancialPeriodSummary {
  generatedAt: string;
  entity: { name: string; countryCode: string; currencyCode: string };
  periodStart: string;
  periodEnd: string;
  currencyPrecision: number;
  totals: Array<{ type: AccountType; accountCount: number; movement: number | null }>;
  accounts: Array<{ code: string; description: string; type: AccountType; movement: number | null }>;
  coverage: {
    postedJournalLineCount: number;
    unclassifiedJournalLineCount: number;
    unclassifiedAccountCodes: string[];
    invalidJournalLineCount: number;
  };
}

function isAmount(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isFinancialPeriodSummary(value: unknown): value is FinancialPeriodSummary {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  if (
    typeof data.generatedAt !== 'string'
    || typeof data.periodStart !== 'string'
    || typeof data.periodEnd !== 'string'
    || data.currencyPrecision !== 3
    || !data.entity || typeof data.entity !== 'object'
    || !data.coverage || typeof data.coverage !== 'object'
    || !Array.isArray(data.totals)
    || !Array.isArray(data.accounts)
  ) return false;
  const entity = data.entity as Record<string, unknown>;
  const coverage = data.coverage as Record<string, unknown>;
  const accountTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
  return typeof entity.name === 'string'
    && typeof entity.countryCode === 'string'
    && typeof entity.currencyCode === 'string'
    && ['postedJournalLineCount', 'unclassifiedJournalLineCount', 'invalidJournalLineCount']
      .every((field) => typeof coverage[field] === 'number' && Number.isSafeInteger(coverage[field]))
    && Array.isArray(coverage.unclassifiedAccountCodes)
    && coverage.unclassifiedAccountCodes.every((code) => typeof code === 'string')
    && data.totals.every((item) => item && typeof item === 'object'
      && accountTypes.includes(item.type)
      && typeof item.accountCount === 'number'
      && Number.isSafeInteger(item.accountCount)
      && isAmount(item.movement))
    && data.accounts.every((item) => item && typeof item === 'object'
      && typeof item.code === 'string'
      && typeof item.description === 'string'
      && accountTypes.includes(item.type)
      && isAmount(item.movement));
}

function formatAmount(amount: number | null, currency: string): string {
  if (amount === null) return 'Indisponible';
  return `${amount.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currency}`;
}

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  Asset: 'Actif',
  Liability: 'Passif',
  Equity: 'Capitaux propres',
  Revenue: 'Produits',
  Expense: 'Charges',
};

export default function FinancialStatementPanel({
  accessToken,
  entityId,
}: {
  accessToken: string | null;
  entityId: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [summary, setSummary] = useState<FinancialPeriodSummary | null>(null);
  const [position, setPosition] = useState<FinancialPositionSummary | null>(null);
  const [positionError, setPositionError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setSummary(null);
    setPosition(null);
    setPositionError('');
    setError('');
    if (!accessToken || !entityId) {
      setLoading(false);
      setError(!accessToken
        ? 'Session API indisponible. Reconnectez-vous pour charger les données comptables.'
        : 'Aucune société authentifiée n’est associée à cette session.');
      return () => controller.abort();
    }

    const loadReport = async () => {
      setLoading(true);
      try {
        const query = new URLSearchParams({ from, to });
        const response = await fetch(`/api/finance/financial-report?${query}`, {
          headers: { Authorization: 'Bearer ' + accessToken },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && 'error' in payload
            && typeof payload.error === 'string'
            ? payload.error
            : 'Impossible de charger la synthèse comptable.';
          throw new Error(message);
        }
        if (!isFinancialPeriodSummary(payload)) throw new Error('La réponse de synthèse comptable est invalide.');
        if (!controller.signal.aborted) setSummary(payload);
        try {
          const positionResponse = await fetch(`/api/advanced-finance/analysis?asOf=${encodeURIComponent(to)}`, {
            headers: { Authorization: 'Bearer ' + accessToken },
            signal: controller.signal,
          });
          const positionPayload: unknown = await positionResponse.json();
          if (!positionResponse.ok || !isFinancialPositionSummary(positionPayload)) {
            const message = positionPayload && typeof positionPayload === 'object' && 'error' in positionPayload
              && typeof positionPayload.error === 'string'
              ? positionPayload.error
              : 'La réponse du bilan est indisponible ou invalide.';
            throw new Error(message);
          }
          if (positionPayload.dateImputation !== to
            || positionPayload.countryCode !== payload.entity.countryCode
            || positionPayload.currency !== payload.entity.currencyCode) {
            throw new Error('Le bilan ne correspond pas au pays ou à la devise de la société.');
          }
          if (!controller.signal.aborted) setPosition(positionPayload);
        } catch (positionRequestError) {
          if (!controller.signal.aborted) setPositionError(positionRequestError instanceof Error
            ? positionRequestError.message
            : 'Le bilan est indisponible.');
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'La synthèse comptable est indisponible.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadReport();
    return () => controller.abort();
  }, [accessToken, entityId, from, to, refreshVersion]);

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: '10px',
    padding: '16px',
  };

  return (
    <section aria-labelledby="financial-report-title" style={{ display: 'grid', gap: '14px' }}>
      <header style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '14px' }}>
        <div>
          <h2 id="financial-report-title" style={{ margin: 0, color: '#0F172A' }}>Synthèse comptable de période</h2>
          <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: '0.85rem' }}>
            Mouvements nets par compte du plan pays, issus uniquement des écritures POSTED. Ce rapport n’est pas un bilan de clôture ni un état réglementaire.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: '8px' }}>
          <label style={{ display: 'grid', gap: '3px', fontSize: '0.76rem', color: '#475569' }}>
            Du
            <input aria-label="Début de période" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: '3px', fontSize: '0.76rem', color: '#475569' }}>
            Au
            <input aria-label="Fin de période" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
          </label>
          <button type="button" disabled={loading} onClick={() => setRefreshVersion((version) => version + 1)}
            style={{ border: '1px solid #CBD5E1', borderRadius: '7px', background: '#FFFFFF', color: '#334155', padding: '8px 12px', fontWeight: 700 }}>
            {loading ? 'Chargement…' : 'Actualiser'}
          </button>
        </div>
      </header>

      {loading && <div role="status" style={cardStyle}>Lecture des écritures comptabilisées…</div>}
      {!loading && error && <div role="alert" style={{ ...cardStyle, color: '#991B1B', background: '#FEF2F2', borderColor: '#FECACA' }}>{error}</div>}
      {!loading && summary && (
        <>
          <div style={{ ...cardStyle, color: '#334155' }}>
            <strong>{summary.entity.name}</strong> · {summary.entity.countryCode} · {summary.periodStart} au {summary.periodEnd} · devise {summary.entity.currencyCode}
            <div style={{ marginTop: '5px', color: '#64748B', fontSize: '0.82rem' }}>
              {summary.coverage.postedJournalLineCount} ligne(s) POSTED lues. Les montants expriment le mouvement net selon le sens normal du type de compte, à trois décimales.
            </div>
          </div>
          {summary.coverage.postedJournalLineCount === 0 && (
            <div role="status" style={{ ...cardStyle, background: '#FFFBEB', color: '#92400E', borderColor: '#FDE68A' }}>
              Aucune écriture POSTED trouvée pour cette entité et cette période.
            </div>
          )}
          {(summary.coverage.unclassifiedJournalLineCount > 0 || summary.coverage.invalidJournalLineCount > 0) && (
            <div role="status" style={{ ...cardStyle, background: '#FFFBEB', color: '#92400E', borderColor: '#FDE68A' }}>
              {summary.coverage.unclassifiedJournalLineCount > 0 && (
                <p style={{ margin: 0 }}>
                  {summary.coverage.unclassifiedJournalLineCount} ligne(s) ignorée(s), comptes absents ou non classés dans le plan comptable {summary.entity.countryCode}: {summary.coverage.unclassifiedAccountCodes.join(', ')}.
                </p>
              )}
              {summary.coverage.invalidJournalLineCount > 0 && (
                <p style={{ margin: 0 }}> {summary.coverage.invalidJournalLineCount} ligne(s) invalide(s) exclue(s); le total de leur type de compte n’est pas publié.</p>
              )}
            </div>
          )}
          <div style={{ ...cardStyle, overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Mouvements nets par type de compte</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                <th style={{ padding: '9px' }}>Type</th>
                <th style={{ padding: '9px', textAlign: 'right' }}>Comptes configurés</th>
                <th style={{ padding: '9px', textAlign: 'right' }}>Mouvement net</th>
              </tr></thead>
              <tbody>{summary.totals.map((total) => (
                <tr key={total.type} style={{ borderTop: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '9px', fontWeight: 700 }}>{ACCOUNT_TYPE_LABELS[total.type]}</td>
                  <td style={{ padding: '9px', textAlign: 'right' }}>{total.accountCount}</td>
                  <td style={{ padding: '9px', textAlign: 'right', fontWeight: 700 }}>{formatAmount(total.movement, summary.entity.currencyCode)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{ ...cardStyle, overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Détail des comptes configurés</h3>
            {summary.accounts.length === 0 ? <p>Aucun compte n’est configuré pour le pays de cette entité.</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                  <th style={{ padding: '8px' }}>Compte</th>
                  <th style={{ padding: '8px' }}>Intitulé</th>
                  <th style={{ padding: '8px' }}>Type</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Mouvement net</th>
                </tr></thead>
                <tbody>{summary.accounts.map((account) => (
                  <tr key={account.code} style={{ borderTop: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{account.code}</td>
                    <td style={{ padding: '8px' }}>{account.description}</td>
                    <td style={{ padding: '8px' }}>{ACCOUNT_TYPE_LABELS[account.type]}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatAmount(account.movement, summary.entity.currencyCode)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <div style={{ ...cardStyle, overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Bilan comptable à la date d’arrêté</h3>
            <p style={{ color: '#64748B', fontSize: '0.82rem' }}>
              Soldes cumulés des écritures POSTED jusqu’au {position?.dateImputation ?? to}. Une balance arithmétique ne certifie pas les soldes d’ouverture ni la clôture.
            </p>
            {positionError && <p role="status">{positionError}</p>}
            {position && !position.balanceSheet.available && (
              <p role="status" style={{ color: '#92400E' }}>
                Couverture du bilan incomplète. Vérifiez le classement explicite des comptes comptabilisables et les écritures; les montants non fiables sont affichés « Indisponible ».
              </p>
            )}
            {position && position.balanceSheet.available && (
              <p role="status" style={{ color: position.balanceSheet.isBalanced ? '#166534' : '#92400E' }}>
                {position.balanceSheet.isBalanced ? 'Bilan arithmétiquement équilibré.' : 'Écart bilan à rapprocher.'}
              </p>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                <th style={{ padding: 8 }}>État / poste</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Montant ({summary.entity.currencyCode})</th>
                <th style={{ padding: 8 }}>Note</th>
              </tr></thead>
              <tbody>{buildFinancialPositionLines(position).map((line) => (
                <tr key={line.label} style={{ borderTop: '1px solid #E2E8F0' }}>
                  <td style={{ padding: 8 }}>{line.section} — {line.label}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(line.amount, summary.entity.currencyCode)}</td>
                  <td style={{ padding: 8 }}>{line.notes}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{ ...cardStyle, overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Bilan détaillé par compte</h3>
            <p style={{ color: '#64748B', fontSize: '0.82rem' }}>
              Soldes naturels des comptes comptabilisables classés, issus des écritures POSTED jusqu’au {position?.dateImputation ?? to}. Le résultat de période est présenté séparément et inclus dans les capitaux propres; ce détail ne remplace pas la confirmation des soldes d’ouverture.
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                <th style={{ padding: 8 }}>Section</th>
                <th style={{ padding: 8 }}>Compte / poste</th>
                <th style={{ padding: 8 }}>Classement</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Solde ({summary.entity.currencyCode})</th>
                <th style={{ padding: 8 }}>Note</th>
              </tr></thead>
              <tbody>{buildDetailedBalanceLines(position).map((line) => (
                <tr key={`${line.section}-${line.accountCode}-${line.label}`} style={{ borderTop: '1px solid #E2E8F0' }}>
                  <td style={{ padding: 8 }}>{line.section}</td>
                  <td style={{ padding: 8 }}>{line.accountCode ? `${line.accountCode} — ${line.label}` : line.label}</td>
                  <td style={{ padding: 8 }}>{line.category}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(line.amount, summary.entity.currencyCode)}</td>
                  <td style={{ padding: 8 }}>{line.notes}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{ ...cardStyle, overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>État des variations des capitaux propres</h3>
            <p style={{ color: '#64748B', fontSize: '0.82rem' }}>
              Période {position?.equityStatement?.periodStart ?? 'Indisponible'} au {position?.equityStatement?.periodEnd ?? 'Indisponible'}. Les mouvements au débit/crédit ne sont pas assimilés à des apports ou distributions.
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                <th style={{ padding: 8 }}>État / poste</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Montant ({summary.entity.currencyCode})</th>
                <th style={{ padding: 8 }}>Note</th>
              </tr></thead>
              <tbody>{buildEquityChangesLines(position).map((line) => (
                <tr key={line.label} style={{ borderTop: '1px solid #E2E8F0' }}>
                  <td style={{ padding: 8 }}>{line.section} — {line.label}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(line.amount, summary.entity.currencyCode)}</td>
                  <td style={{ padding: 8 }}>{line.notes}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{ ...cardStyle, overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>État des flux de trésorerie</h3>
            <p style={{ color: '#64748B', fontSize: '0.82rem' }}>
              Période {position?.cashFlowStatement.periodStart ?? 'Indisponible'} au {position?.cashFlowStatement.periodEnd ?? 'Indisponible'}.
              La ventilation par activité reste indisponible faute de classement explicite des contreparties.
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                <th style={{ padding: 8 }}>État / poste</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Montant ({summary.entity.currencyCode})</th>
                <th style={{ padding: 8 }}>Note</th>
              </tr></thead>
              <tbody>{buildCashFlowLines(position).map((line) => (
                <tr key={line.label} style={{ borderTop: '1px solid #E2E8F0' }}>
                  <td style={{ padding: 8 }}>{line.section} — {line.label}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(line.amount, summary.entity.currencyCode)}</td>
                  <td style={{ padding: 8 }}>{line.notes}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
