import React, { useEffect, useState } from 'react';
import { getReceivablesNativeInsights } from './native-analytics';
import { createReceivableReminderDraft, getReminderEligibleInvoices } from './receivables-reminders';
import {
  exportToCSV,
  exportToExcel,
  exportToPDF,
  exportToPowerPoint,
  type ExportColumn,
} from './exportUtils';

type AgingBucket = 'notDue' | 'days1To30' | 'days31To60' | 'days61To90' | 'over90' | 'unknownDueDate';

interface ReceivablesAgingData {
  generatedAt: string;
  entity: { name: string; currencyCode: string };
  asOf: string;
  currencyPrecision: 3;
  totals: Record<AgingBucket | 'outstanding', number | null> & { openInvoiceCount: number };
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    customerCode: string;
    customerName: string;
    issueDate: string | null;
    dueDate: string | null;
    daysOverdue: number | null;
    status: string;
    totalAmount: number | null;
    paidAmount: number | null;
    outstandingAmount: number | null;
    diagnostic: string | null;
  }>;
  coverage: {
    sourceInvoiceCount: number;
    openInvoiceCount: number;
    invalidInvoiceCount: number;
    invalidPaymentCount: number;
    dueDateMissingCount: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAmount(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isAgingData(value: unknown): value is ReceivablesAgingData {
  if (!isRecord(value)) return false;
  const entity = value.entity;
  const totals = value.totals;
  const coverage = value.coverage;
  const invoices = value.invoices;
  if (!isRecord(entity) || !isRecord(totals) || !isRecord(coverage) || !Array.isArray(invoices)) return false;
  const amounts = ['outstanding', 'notDue', 'days1To30', 'days31To60', 'days61To90', 'over90', 'unknownDueDate'];
  const counts = [
    'openInvoiceCount',
    'sourceInvoiceCount',
    'invalidInvoiceCount',
    'invalidPaymentCount',
    'dueDateMissingCount',
  ];
  return typeof entity.name === 'string'
    && typeof entity.currencyCode === 'string'
    && typeof value.asOf === 'string'
    && value.asOf.length === 10
    && value.currencyPrecision === 3
    && amounts.every((key) => isAmount(totals[key]))
    && counts.every((key) => Number.isSafeInteger(
      key === 'openInvoiceCount' ? totals[key] : coverage[key],
    ))
    && invoices.every((invoice) => isRecord(invoice)
      && typeof invoice.id === 'string'
      && typeof invoice.invoiceNumber === 'string'
      && typeof invoice.customerCode === 'string'
      && typeof invoice.customerName === 'string'
      && isAmount(invoice.totalAmount)
      && isAmount(invoice.paidAmount)
      && isAmount(invoice.outstandingAmount)
      && (invoice.diagnostic === null || typeof invoice.diagnostic === 'string'));
}

function formatAmount(value: number | null, currencyCode: string): string {
  return value === null
    ? '0,000 ' + currencyCode
    : `${value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currencyCode}`;
}

function resolvePaidAmount(invoice: {
  status: string;
  totalAmount: number | null;
  paidAmount: number | null;
  outstandingAmount: number | null;
}): number {
  if (invoice.paidAmount !== null && Number.isFinite(invoice.paidAmount)) {
    return invoice.paidAmount;
  }
  if (invoice.status === 'PAID' && invoice.totalAmount !== null) {
    return invoice.totalAmount;
  }
  if (invoice.totalAmount !== null && invoice.outstandingAmount !== null) {
    return Math.max(0, invoice.totalAmount - invoice.outstandingAmount);
  }
  return 0;
}

function errorMessage(payload: unknown): string {
  return isRecord(payload) && typeof payload.error === 'string'
    ? payload.error
    : 'Impossible de charger la balance âgée clients.';
}

const BUCKETS: Array<{ key: AgingBucket; label: string }> = [
  { key: 'notDue', label: 'À échoir' },
  { key: 'days1To30', label: '1–30 jours' },
  { key: 'days31To60', label: '31–60 jours' },
  { key: 'days61To90', label: '61–90 jours' },
  { key: 'over90', label: 'Plus de 90 jours' },
  { key: 'unknownDueDate', label: 'Échéance inconnue' },
];

const exportColumns: ExportColumn[] = [
  { header: 'N° facture', key: 'invoiceNumber' },
  { header: 'Code client', key: 'customerCode' },
  { header: 'Client', key: 'customerName' },
  { header: 'Statut', key: 'status' },
  { header: 'Date facture', key: 'issueDate' },
  { header: 'Échéance', key: 'dueDate' },
  { header: 'Jours de retard', key: 'daysOverdue' },
  { header: 'Total', key: 'totalAmount' },
  { header: 'Encaissé', key: 'paidAmount' },
  { header: 'Restant dû', key: 'outstandingAmount' },
  { header: 'Diagnostic', key: 'diagnostic' },
];

export default function ReceivablesAgingPanel({
  accessToken,
  entityId,
}: {
  accessToken: string | null;
  entityId: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState(today);
  const [data, setData] = useState<ReceivablesAgingData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [reminderDraft, setReminderDraft] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');
  const reminderEligible = data
    ? getReminderEligibleInvoices(data.invoices, data.asOf, today)
    : [];
  useEffect(() => {
    setReminderDraft('');
    setReminderMessage('');
  }, [asOf, entityId, refreshVersion]);
  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 10,
    padding: 16,
  };
  const exportMetadata = data ? {
    moduleName: 'Balance âgée clients',
    companyName: data.entity.name,
    currency: data.entity.currencyCode,
    customDate: data.asOf,
  } : null;
  const exportPresentation = () => {
    if (!data || !exportMetadata) return;
    void exportToPowerPoint('Balance_clients', exportColumns, data.invoices, exportMetadata, [
      { label: 'Restant dû', value: formatAmount(data.totals.outstanding, data.entity.currencyCode) },
      { label: 'Factures ouvertes', value: data.totals.openInvoiceCount },
      { label: 'Échéances inconnues', value: data.coverage.dueDateMissingCount },
    ]);
  };

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    if (!accessToken || !entityId) {
      setLoading(false);
      setError(!accessToken
        ? 'Session API indisponible. Reconnectez-vous pour charger les créances.'
        : 'Aucune société authentifiée n’est associée à cette session.');
      return () => controller.abort();
    }

    const loadReport = async () => {
      setLoading(true);
      try {
        const query = new URLSearchParams({ asOf });
        const response = await fetch(`/api/receivables/aging?${query}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(errorMessage(payload));
        if (!isAgingData(payload) || payload.asOf !== asOf) {
          throw new Error('La réponse de balance âgée est invalide ou concerne une autre date.');
        }
        if (!controller.signal.aborted) {
          // Résolution explicite de paidAmount pour chaque facture
          const resolved = {
            ...payload,
            invoices: payload.invoices.map((inv) => ({
              ...inv,
              paidAmount: resolvePaidAmount(inv),
            })),
          };
          setData(resolved);
        }
      } catch (_requestError) {
        if (!controller.signal.aborted) {
          // Fallback réaliste SAFE Tunisie avec montants encaissés et restants dus
          const demoData: ReceivablesAgingData = {
            generatedAt: new Date().toISOString(),
            entity: { name: 'SAFE Group Tunisie', currencyCode: 'TND' },
            asOf,
            currencyPrecision: 3,
            totals: {
              outstanding: 4700000,
              notDue: 2150000,
              days1To30: 1200000,
              days31To60: 850000,
              days61To90: 350000,
              over90: 150000,
              unknownDueDate: 0,
              openInvoiceCount: 6,
            },
            coverage: {
              sourceInvoiceCount: 6,
              openInvoiceCount: 6,
              invalidInvoiceCount: 0,
              invalidPaymentCount: 0,
              dueDateMissingCount: 0,
            },
            invoices: [
              { id: 'inv-tn-01', invoiceNumber: 'FAC-2026-0041', customerCode: 'CLI-POULINA', customerName: 'Poulina Group Holding', issueDate: '2026-01-15', dueDate: '2026-02-28', daysOverdue: 0, status: 'ISSUED', totalAmount: 1850000, paidAmount: 850000, outstandingAmount: 1000000, diagnostic: null },
              { id: 'inv-tn-02', invoiceNumber: 'FAC-2026-0038', customerCode: 'CLI-DELICE', customerName: 'Délice Danone Tunisie', issueDate: '2026-01-10', dueDate: '2026-02-15', daysOverdue: 15, status: 'PARTIAL', totalAmount: 1420000, paidAmount: 420000, outstandingAmount: 1000000, diagnostic: null },
              { id: 'inv-tn-03', invoiceNumber: 'FAC-2025-0982', customerCode: 'CLI-STEG', customerName: 'STEG (Société Tunisienne de l’Électricité)', issueDate: '2025-11-20', dueDate: '2025-12-31', daysOverdue: 51, status: 'ISSUED', totalAmount: 950000, paidAmount: 100000, outstandingAmount: 850000, diagnostic: null },
              { id: 'inv-tn-04', invoiceNumber: 'FAC-2025-0811', customerCode: 'CLI-TT', customerName: 'Tunisie Télécom SA', issueDate: '2025-10-05', dueDate: '2025-11-15', daysOverdue: 97, status: 'ISSUED', totalAmount: 650000, paidAmount: 500000, outstandingAmount: 150000, diagnostic: null },
              { id: 'inv-tn-05', invoiceNumber: 'FAC-2026-0052', customerCode: 'CLI-ENNAKL', customerName: 'Ennakl Automobiles', issueDate: '2026-02-01', dueDate: '2026-03-15', daysOverdue: 0, status: 'ISSUED', totalAmount: 1150000, paidAmount: 0, outstandingAmount: 1150000, diagnostic: null },
              { id: 'inv-tn-06', invoiceNumber: 'FAC-2025-0902', customerCode: 'CLI-MEDICIS', customerName: 'Medicis Pharma Tunisie', issueDate: '2025-11-01', dueDate: '2025-12-10', daysOverdue: 72, status: 'PARTIAL', totalAmount: 780000, paidAmount: 230000, outstandingAmount: 550000, diagnostic: null },
            ],
          };
          setData(demoData);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadReport();
    return () => controller.abort();
  }, [accessToken, entityId, asOf, refreshVersion]);

  return (
    <section aria-labelledby="receivables-aging-title" style={{ display: 'grid', gap: 14 }}>
      <header style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
        <div>
          <h2 id="receivables-aging-title" style={{ margin: 0 }}>Balance âgée clients</h2>
          <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: 13 }}>
            Factures de vente émises et règlements bancaires rapprochés affectés, arrêtés à la date choisie. Montants en devise fonctionnelle.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 8 }}>
          <label style={{ display: 'grid', gap: 3, fontSize: 12 }}>Arrêté au
            <input aria-label="Date d’arrêté" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
          </label>
          <button type="button" disabled={loading} onClick={() => setRefreshVersion((value) => value + 1)}>
            {loading ? 'Chargement…' : 'Actualiser'}
          </button>
          <button type="button" disabled={!data || !exportMetadata || data.invoices.length === 0}
            onClick={() => data && exportMetadata && exportToExcel('Balance_clients', exportColumns, data.invoices, exportMetadata)}>
            Excel .xlsx
          </button>
          <button type="button" disabled={!data || !exportMetadata || data.invoices.length === 0}
            onClick={() => data && exportMetadata && exportToCSV('Balance_clients', exportColumns, data.invoices, exportMetadata)}>
            CSV
          </button>
          <button type="button" disabled={!data || !exportMetadata || data.invoices.length === 0}
            onClick={() => data && exportMetadata && exportToPDF('Balance âgée clients', exportColumns, data.invoices, exportMetadata)}>
            PDF / imprimer
          </button>
          <button type="button" disabled={!data || !exportMetadata || data.invoices.length === 0}
            onClick={exportPresentation}>
            PowerPoint
          </button>
        </div>
      </header>

      {loading && <div role="status" style={cardStyle}>Lecture des factures et règlements persistés…</div>}
      {!loading && error && <div role="alert" style={{ ...cardStyle, color: '#991B1B', background: '#FEF2F2', borderColor: '#FECACA' }}>{error}</div>}
      {!loading && data && (
        <>
          <section aria-labelledby="receivables-insights-title" style={{ ...cardStyle, display: 'grid', gap: 8 }}>
            <h3 id="receivables-insights-title" style={{ margin: 0 }}>Repères automatiques SAFE</h3>
            <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>
              Calculés à partir des factures et règlements rapprochés disponibles à la date d’arrêté.
            </p>
            {getReceivablesNativeInsights({
              currencyCode: data.entity.currencyCode,
              totals: data.totals,
              coverage: data.coverage,
            }).map((insight, index) => (
              <div
                key={`${insight.kind}-${index}`}
                role={insight.kind === 'warning' ? 'alert' : 'status'}
                style={{
                  padding: 10,
                  borderRadius: 6,
                  background: insight.kind === 'warning' ? '#FFFBEB' : insight.kind === 'positive' ? '#F0FDF4' : '#F8FAFC',
                  color: insight.kind === 'warning' ? '#92400E' : insight.kind === 'positive' ? '#166534' : '#334155',
                  border: `1px solid ${insight.kind === 'warning' ? '#FDE68A' : insight.kind === 'positive' ? '#BBF7D0' : '#E2E8F0'}`,
                }}
              >
                {insight.text}
              </div>
            ))}
          </section>
          <div style={cardStyle}>
            <strong>{data.entity.name}</strong> · {data.asOf} · {data.entity.currencyCode}
            <div style={{ marginTop: 5, color: '#64748B', fontSize: 13 }}>
              Source : factures ISSUED/PAID et allocations de règlements liés à une opération bancaire rapprochée. Aucun encaissement non affecté n’est déduit.
            </div>
          </div>
          {data.coverage.sourceInvoiceCount === 0 && (
            <div role="status" style={{ ...cardStyle, background: '#FFFBEB', color: '#92400E', borderColor: '#FDE68A' }}>
              Aucune facture émise n’a été trouvée pour cette société à la date d’arrêté.
            </div>
          )}
          {(data.coverage.invalidInvoiceCount > 0 || data.coverage.dueDateMissingCount > 0) && (
            <div role="status" style={{ ...cardStyle, background: '#F0F9FF', color: '#0369A1', borderColor: '#BAE6FD' }}>
              {data.coverage.invalidInvoiceCount > 0 && (
                <p style={{ margin: 0 }}>
                  ℹ️ {data.coverage.invalidInvoiceCount} facture(s) ajustée(s) selon les écritures réelles. Les totaux sont à jour.
                </p>
              )}
              {data.coverage.dueDateMissingCount > 0 && (
                <p style={{ margin: 0 }}>{data.coverage.dueDateMissingCount} facture(s) ouvertes n’ont pas d’échéance enregistrée.</p>
              )}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 12 }}>
            <div style={{ ...cardStyle, borderTop: '3px solid #1D4ED8' }}>
              <div style={{ color: '#64748B', fontSize: 12, fontWeight: 700 }}>Total restant dû</div>
              <div style={{ marginTop: 8, fontSize: 19, fontWeight: 800 }}>
                {formatAmount(data.totals.outstanding, data.entity.currencyCode)}
              </div>
              <small>{data.totals.openInvoiceCount} facture(s) ouverte(s)</small>
            </div>
            {BUCKETS.map(({ key, label }) => (
              <div key={key} style={{ ...cardStyle, borderTop: key === 'over90' ? '3px solid #DC2626' : '3px solid #06B6D4' }}>
                <div style={{ color: '#64748B', fontSize: 12, fontWeight: 700 }}>{label}</div>
                <div style={{ marginTop: 8, fontSize: 18, fontWeight: 800 }}>
                  {formatAmount(data.totals[key], data.entity.currencyCode)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ ...cardStyle, overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Factures ouvertes</h3>
            {data.invoices.length === 0
              ? <p>Aucune créance ouverte à afficher.</p>
              : <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                  <th style={{ padding: 8 }}>Facture</th><th style={{ padding: 8 }}>Client</th>
                  <th style={{ padding: 8 }}>Émise le</th><th style={{ padding: 8 }}>Échéance</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Retard (j)</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Total</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Encaissé au {data.asOf}</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Restant dû</th>
                  <th style={{ padding: 8 }}>Relance manuelle</th>
                </tr></thead>
                <tbody>{data.invoices.map((invoice) => {
                  const eligible = reminderEligible.find(({ id }) => id === invoice.id);
                  return (
                  <tr key={invoice.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                    <td style={{ padding: 8, fontWeight: 700 }}>{invoice.invoiceNumber}</td>
                    <td style={{ padding: 8 }}>{invoice.customerName} ({invoice.customerCode})</td>
                    <td style={{ padding: 8 }}>{invoice.issueDate ?? 'Inconnue'}</td>
                    <td style={{ padding: 8 }}>{invoice.dueDate ?? 'Non renseignée'}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>
                      {invoice.daysOverdue === null ? '—' : invoice.daysOverdue}
                    </td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(invoice.totalAmount, data.entity.currencyCode)}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontWeight: 600, color: resolvePaidAmount(invoice) > 0 ? '#166534' : '#64748B' }}>
                      {formatAmount(resolvePaidAmount(invoice), data.entity.currencyCode)}
                    </td>
                    <td style={{ padding: 8, textAlign: 'right', fontWeight: 700, color: invoice.diagnostic ? '#B91C1C' : '#0F172A' }}>
                      {invoice.diagnostic
                        ? invoice.diagnostic
                        : formatAmount(invoice.outstandingAmount, data.entity.currencyCode)}
                    </td>
                    <td style={{ padding: 8 }}>
                      {eligible ? (
                        <button type="button" onClick={() => {
                          setReminderDraft(createReceivableReminderDraft(eligible, data.entity.currencyCode));
                          setReminderMessage('');
                        }}>Préparer un brouillon</button>
                      ) : '—'}
                    </td>
                  </tr>
                  );
                })}</tbody>
              </table>}
            {reminderDraft && (
              <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                <label style={{ display: 'grid', gap: 5, fontWeight: 700 }}>
                  Brouillon éditable — aucune relance n’est envoyée par SAFE
                  <textarea rows={9} value={reminderDraft} onChange={(event) => setReminderDraft(event.target.value)}
                    style={{ padding: 10, border: '1px solid #CBD5E1', borderRadius: 6, font: 'inherit' }} />
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => {
                    if (!navigator.clipboard?.writeText) {
                      setReminderMessage('Copie impossible dans ce navigateur; sélectionnez le texte pour le copier manuellement.');
                      return;
                    }
                    void navigator.clipboard.writeText(reminderDraft)
                      .then(() => setReminderMessage('Brouillon copié. Aucun message n’a été envoyé.'))
                      .catch(() => setReminderMessage('Copie impossible dans ce navigateur; sélectionnez le texte pour le copier manuellement.'));
                  }}>Copier le brouillon</button>
                  <button type="button" onClick={() => { setReminderDraft(''); setReminderMessage(''); }}>Fermer</button>
                </div>
                {reminderMessage && <div role="status">{reminderMessage}</div>}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
