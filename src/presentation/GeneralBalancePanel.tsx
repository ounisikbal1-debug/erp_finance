import React, { useEffect, useMemo, useState } from 'react';
import { exportToCSV, exportToExcel, exportToPDF, exportToPowerPoint, type ExportColumn } from './exportUtils';
import { getHtmlLanguage, translateBusinessText, useInterfaceLanguage } from './localization';

const exportColumns: ExportColumn[] = [
  { header: 'Compte', key: 'accountCode' },
  { header: 'Intitulé', key: 'accountName' },
  { header: 'Total débit', key: 'totalDebit' },
  { header: 'Total crédit', key: 'totalCredit' },
  { header: 'Solde net', key: 'balance' },
];

interface AccountBalance {
  accountCode: string;
  accountName?: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

interface GeneralBalancePanelProps {
  accessToken: string | null;
  entityId: string | null;
}

function isAccountBalanceList(value: unknown): value is AccountBalance[] {
  return Array.isArray(value) && value.every((line) => (
    line !== null
    && typeof line === 'object'
    && 'accountCode' in line && typeof line.accountCode === 'string'
    && 'totalDebit' in line && typeof line.totalDebit === 'number' && Number.isFinite(line.totalDebit)
    && 'totalCredit' in line && typeof line.totalCredit === 'number' && Number.isFinite(line.totalCredit)
    && 'balance' in line && typeof line.balance === 'number' && Number.isFinite(line.balance)
  ));
}

function formatAmount(amount: number, locale: string): string {
  return amount.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export default function GeneralBalancePanel({ accessToken, entityId }: GeneralBalancePanelProps) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const locale = getHtmlLanguage(language);
  const [accounts, setAccounts] = useState<AccountBalance[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const totals = useMemo(() => {
    if (!accounts) return null;
    let debitMillimes = 0;
    let creditMillimes = 0;
    for (const account of accounts) {
      debitMillimes += Math.round(account.totalDebit * 1000);
      creditMillimes += Math.round(account.totalCredit * 1000);
      if (!Number.isSafeInteger(debitMillimes) || !Number.isSafeInteger(creditMillimes)) return null;
    }
    return { debitMillimes, creditMillimes };
  }, [accounts]);
  const isBalanced = totals !== null && totals.debitMillimes === totals.creditMillimes;

  useEffect(() => {
    const controller = new AbortController();
    setAccounts(null);
    setError('');
    if (!accessToken || !entityId) {
      setLoading(false);
      setError(!accessToken
        ? 'Session API invalide. Déconnectez-vous puis reconnectez-vous.'
        : 'Aucune société réelle n’est associée au compte connecté.');
      return () => controller.abort();
    }

    const loadBalance = async () => {
      setLoading(true);
      try {
        const [response, accountsResponse] = await Promise.all([
          fetch('/api/finance/balance', {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: controller.signal,
          }),
          fetch('/api/finance/accounts', {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: controller.signal,
          }),
        ]);
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && 'error' in payload
            && typeof payload.error === 'string'
            ? payload.error
            : 'Impossible de charger la balance comptable.';
          throw new Error(message);
        }
        if (!isAccountBalanceList(payload)) throw new Error('La réponse de balance comptable est invalide.');
        const accountNameMap = new Map<string, string>();
        if (accountsResponse.ok) {
          const accountsPayload: unknown = await accountsResponse.json();
          if (Array.isArray(accountsPayload)) {
            for (const item of accountsPayload) {
              if (item && typeof item === 'object' && 'code' in item && typeof item.code === 'string') {
                const desc = 'description' in item && typeof item.description === 'string'
                  ? item.description
                  : 'name' in item && typeof item.name === 'string'
                    ? item.name
                    : '';
                if (desc) accountNameMap.set(item.code, desc);
              }
            }
          }
        }
        setAccounts(payload.map((line) => ({
          ...line,
          accountName: accountNameMap.get(line.accountCode) ?? '—',
        })));
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Impossible de charger la balance comptable.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadBalance();
    return () => controller.abort();
  }, [accessToken, entityId, refreshVersion]);

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: '10px',
    padding: '16px',
  };

  return (
    <section aria-labelledby="general-balance-title" style={{ display: 'grid', gap: '14px' }}>
      <header style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '14px' }}>
        <div>
          <h2 id="general-balance-title" style={{ margin: 0, color: '#0F172A', fontSize: '1.2rem' }}>
            {text('Balance générale — écritures postées')}
          </h2>
          <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: '0.85rem' }}>
            {text('Cumuls par compte issus du grand livre de la société liée au compte. Les soldes d’ouverture et de clôture ne sont pas disponibles dans cette vue.')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshVersion((version) => version + 1)}
          disabled={loading}
          style={{
            border: 'none',
            borderRadius: '7px',
            background: loading ? '#94A3B8' : '#2563EB',
            color: '#FFFFFF',
            padding: '9px 13px',
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? text('Chargement…') : text('Actualiser')}
        </button>
      </header>

      {loading && <div role="status" style={cardStyle}>{text('Lecture des écritures postées…')}</div>}
      {!loading && error && (
        <div role="alert" style={{ ...cardStyle, borderColor: '#FECACA', color: '#991B1B', background: '#FEF2F2' }}>
          {text(error)}
        </div>
      )}

      {!loading && accounts && (
        <>
          <div role="status" style={{
            ...cardStyle,
            borderColor: isBalanced ? '#BBF7D0' : '#FED7AA',
            background: isBalanced ? '#F0FDF4' : '#FFF7ED',
            color: isBalanced ? '#166534' : '#9A3412',
            fontWeight: 700,
          }}>
            {totals === null
              ? text('Le cumul général dépasse la précision sûre; les totaux globaux sont indisponibles.')
              : isBalanced
                ? text('Les cumuls débit/crédit des lignes postées sont équilibrés.')
                : text('Écart détecté entre les cumuls débit/crédit; vérifiez les écritures postées.')}
              {' '}{text('Cette vérification ne certifie pas les soldes d’ouverture, de clôture ou la conformité comptable.')}
          </div>

          <div style={{ ...cardStyle, overflowX: 'auto' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <button type="button" disabled={!accounts.length} onClick={() => exportToExcel('Balance_generale', exportColumns.map((column) => ({ ...column, header: text(column.header) })), accounts, { moduleName: text('Balance générale'), companyName: entityId ?? undefined })}>{text('Excel .xlsx')}</button>
                <button type="button" disabled={!accounts.length} onClick={() => exportToCSV('Balance_generale', exportColumns.map((column) => ({ ...column, header: text(column.header) })), accounts, { moduleName: text('Balance générale'), companyName: entityId ?? undefined })}>{text('CSV')}</button>
                <button type="button" disabled={!accounts.length} onClick={() => exportToPDF(text('Balance générale'), exportColumns.map((column) => ({ ...column, header: text(column.header) })), accounts, { moduleName: text('Balance générale'), companyName: entityId ?? undefined })}>{text('PDF / imprimer')}</button>
                <button type="button" disabled={!accounts.length} onClick={() => void exportToPowerPoint('Balance_generale', exportColumns.map((column) => ({ ...column, header: text(column.header) })), accounts, { moduleName: text('Balance générale'), companyName: entityId ?? undefined }, [
                  { label: text('Total débit'), value: totals ? formatAmount(totals.debitMillimes / 1000, locale) : text('Indisponible') },
                  { label: text('Total crédit'), value: totals ? formatAmount(totals.creditMillimes / 1000, locale) : text('Indisponible') },
                  { label: text('Équilibre'), value: isBalanced ? text('Oui') : text('À vérifier') },
                ])}>{text('PowerPoint')}</button>
            </div>
            {accounts.length === 0 ? (
                <p style={{ margin: 0, color: '#64748B' }}>{text('Aucune écriture postée pour cette société.')}</p>
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: language === 'AR' ? 'right' : 'left', fontSize: '0.84rem' }}>
                <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                    <th style={{ padding: '9px' }}>{text('Compte')}</th>
                    <th style={{ padding: '9px' }}>{text('Intitulé')}</th>
                    <th style={{ padding: '9px', textAlign: 'right' }}>{text('Total débit')}</th>
                    <th style={{ padding: '9px', textAlign: 'right' }}>{text('Total crédit')}</th>
                    <th style={{ padding: '9px', textAlign: 'right' }}>{text('Solde net')}</th>
                </tr></thead>
                <tbody>{accounts.map((account) => (
                  <tr key={account.accountCode} style={{ borderTop: '1px solid #E2E8F0' }}>
                      <td dir="ltr" style={{ padding: '9px', color: '#1D4ED8', fontWeight: 700 }}>{account.accountCode}</td>
                      <td style={{ padding: '9px', color: '#0F172A' }}>{account.accountName || '—'}</td>
                      <td dir="ltr" style={{ padding: '9px', textAlign: 'right' }}>{formatAmount(account.totalDebit, locale)}</td>
                      <td dir="ltr" style={{ padding: '9px', textAlign: 'right' }}>{formatAmount(account.totalCredit, locale)}</td>
                      <td dir="ltr" style={{ padding: '9px', textAlign: 'right', fontWeight: 700 }}>{formatAmount(account.balance, locale)}</td>
                  </tr>
                ))}</tbody>
                {totals && (
                  <tfoot><tr style={{ borderTop: '2px solid #CBD5E1', fontWeight: 800 }}>
                    <td colSpan={2} style={{ padding: '9px' }}>{text('Totaux')}</td>
                    <td dir="ltr" style={{ padding: '9px', textAlign: 'right' }}>{formatAmount(totals.debitMillimes / 1000, locale)}</td>
                    <td dir="ltr" style={{ padding: '9px', textAlign: 'right' }}>{formatAmount(totals.creditMillimes / 1000, locale)}</td>
                    <td dir="ltr" style={{ padding: '9px', textAlign: 'right' }}>{formatAmount((totals.debitMillimes - totals.creditMillimes) / 1000, locale)}</td>
                  </tr></tfoot>
                )}
              </table>
            )}
          </div>
        </>
      )}
    </section>
  );
}
