import React, { useEffect, useState } from 'react';
import {
  exportToCSV,
  exportToExcel,
  exportToPDF,
  exportToPowerPoint,
  type ExportColumn,
} from './exportUtils';

type AgingBucket = 'notDue' | 'days1To30' | 'days31To60' | 'days61To90' | 'over90';

interface PayablesAgingData {
  entity: { name: string; currencyCode: string };
  asOf: string;
  currencyPrecision: 3;
  totals: Record<AgingBucket | 'outstanding' | 'credited', number | null> & { openInvoiceCount: number };
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    vendorCode: string;
    vendorName: string;
    postedAt: string | null;
    dueDate: string | null;
    daysOverdue: number | null;
    totalAmount: number | null;
    paidAmount: number | null;
    creditedAmount: number | null;
    outstandingAmount: number | null;
    diagnostic: string | null;
  }>;
  coverage: {
    sourceInvoiceCount: number;
    openInvoiceCount: number;
    invalidInvoiceCount: number;
    invalidPaymentCount: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAmount(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isPayablesAgingData(value: unknown): value is PayablesAgingData {
  if (!isRecord(value) || !isRecord(value.entity) || !isRecord(value.totals)
    || !isRecord(value.coverage) || !Array.isArray(value.invoices)) return false;
  const amounts = ['outstanding', 'credited', 'notDue', 'days1To30', 'days31To60', 'days61To90', 'over90'];
  const counts = ['openInvoiceCount', 'sourceInvoiceCount', 'invalidInvoiceCount', 'invalidPaymentCount'];
  return typeof value.entity.name === 'string'
    && typeof value.entity.currencyCode === 'string'
    && typeof value.asOf === 'string'
    && value.asOf.length === 10
    && value.currencyPrecision === 3
    && amounts.every((key) => isAmount(value.totals[key]))
    && counts.every((key) => Number.isSafeInteger(
      key === 'openInvoiceCount' ? value.totals[key] : value.coverage[key],
    ))
    && value.invoices.every((invoice) => isRecord(invoice)
      && typeof invoice.id === 'string'
      && typeof invoice.invoiceNumber === 'string'
      && typeof invoice.vendorCode === 'string'
      && typeof invoice.vendorName === 'string'
      && isAmount(invoice.totalAmount)
      && isAmount(invoice.paidAmount)
      && isAmount(invoice.creditedAmount)
      && isAmount(invoice.outstandingAmount)
      && (invoice.diagnostic === null || typeof invoice.diagnostic === 'string'));
}

function amount(value: number | null, currencyCode: string): string {
  return value === null
    ? '0,000 ' + currencyCode
    : `${value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currencyCode}`;
}

function errorMessage(payload: unknown): string {
  return isRecord(payload) && typeof payload.error === 'string'
    ? payload.error
    : 'Impossible de charger la balance fournisseurs.';
}

const BUCKETS: Array<{ key: AgingBucket; label: string }> = [
  { key: 'notDue', label: 'À échoir' },
  { key: 'days1To30', label: '1–30 jours' },
  { key: 'days31To60', label: '31–60 jours' },
  { key: 'days61To90', label: '61–90 jours' },
  { key: 'over90', label: 'Plus de 90 jours' },
];

const exportColumns: ExportColumn[] = [
  { header: 'N° facture', key: 'invoiceNumber' },
  { header: 'Code fournisseur', key: 'vendorCode' },
  { header: 'Fournisseur', key: 'vendorName' },
  { header: 'Comptabilisée le', key: 'postedAt' },
  { header: 'Échéance', key: 'dueDate' },
  { header: 'Jours de retard', key: 'daysOverdue' },
  { header: 'Total', key: 'totalAmount' },
  { header: 'Réglé', key: 'paidAmount' },
  { header: 'Avoirs', key: 'creditedAmount' },
  { header: 'Restant dû', key: 'outstandingAmount' },
  { header: 'Diagnostic', key: 'diagnostic' },
];

export default function PayablesAgingPanel({
  accessToken,
  entityId,
}: {
  accessToken: string | null;
  entityId: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState(today);
  const [data, setData] = useState<PayablesAgingData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 10,
    padding: 16,
  };
  const exportReport = () => {
    if (!data) return;
    const metadata = {
      moduleName: 'Balance fournisseurs',
      companyName: data.entity.name,
      currency: data.entity.currencyCode,
      customDate: data.asOf,
    };
    exportToCSV('Balance_fournisseurs', exportColumns, data.invoices, metadata);
  };
  const exportPresentation = () => {
    if (!data) return;
    void exportToPowerPoint('Balance_fournisseurs', exportColumns, data.invoices, {
      moduleName: 'Balance fournisseurs',
      companyName: data.entity.name,
      currency: data.entity.currencyCode,
      customDate: data.asOf,
    }, [
      { label: 'Restant dû', value: amount(data.totals.outstanding, data.entity.currencyCode) },
      { label: 'Factures ouvertes', value: data.totals.openInvoiceCount },
      { label: 'Avoirs comptabilisés', value: amount(data.totals.credited, data.entity.currencyCode) },
    ]);
  };

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    if (!accessToken || !entityId) {
      setLoading(false);
      setError(!accessToken
        ? 'Session API indisponible. Reconnectez-vous pour charger les dettes fournisseurs.'
        : 'Aucune société authentifiée n’est associée à cette session.');
      return () => controller.abort();
    }

    const loadReport = async () => {
      setLoading(true);
      try {
        const query = new URLSearchParams({ asOf });
        const response = await fetch(`/api/purchases/payables/aging?${query}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(errorMessage(payload));
        if (!isPayablesAgingData(payload) || payload.asOf !== asOf) {
          throw new Error('La réponse de balance fournisseurs est invalide ou concerne une autre date.');
        }
        if (!controller.signal.aborted) setData(payload);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'La balance fournisseurs est indisponible.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadReport();
    return () => controller.abort();
  }, [accessToken, entityId, asOf, refreshVersion]);

  return (
    <section aria-labelledby="payables-aging-title" style={{ display: 'grid', gap: 14 }}>
      <header style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
        <div>
          <h3 id="payables-aging-title" style={{ margin: 0 }}>Balance fournisseurs</h3>
          <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: 13 }}>
            Factures fournisseurs comptabilisées, règlements affectés et avoirs fournisseurs comptabilisés, arrêtés à la date choisie. Montants en devise fonctionnelle.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 8 }}>
          <label style={{ display: 'grid', gap: 3, fontSize: 12 }}>Arrêté au
            <input aria-label="Date d’arrêté fournisseurs" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
          </label>
          <button type="button" disabled={loading} onClick={() => setRefreshVersion((value) => value + 1)}>
            {loading ? 'Chargement…' : 'Actualiser'}
          </button>
          <button type="button" disabled={!data || data.invoices.length === 0} onClick={() => data && exportToExcel('Balance_fournisseurs', exportColumns, data.invoices, {
            moduleName: 'Balance fournisseurs', companyName: data.entity.name, currency: data.entity.currencyCode, customDate: data.asOf,
          })}>
            Excel .xlsx
          </button>
          <button type="button" disabled={!data || data.invoices.length === 0} onClick={exportReport}>
            CSV
          </button>
          <button type="button" disabled={!data || data.invoices.length === 0} onClick={() => data && exportToPDF('Balance fournisseurs', exportColumns, data.invoices, {
            moduleName: 'Balance fournisseurs', companyName: data.entity.name, currency: data.entity.currencyCode, customDate: data.asOf,
          })}>
            PDF / imprimer
          </button>
          <button type="button" disabled={!data || data.invoices.length === 0} onClick={exportPresentation}>
            PowerPoint
          </button>
        </div>
      </header>

      {loading && <div role="status" style={cardStyle}>Lecture des factures comptabilisées et règlements persistés…</div>}
      {!loading && error && <div role="alert" style={{ ...cardStyle, color: '#991B1B', background: '#FEF2F2', borderColor: '#FECACA' }}>{error}</div>}
      {!loading && data && (
        <div style={{ ...cardStyle, overflowX: 'auto' }}>
          <strong>{data.entity.name} · avoirs comptabilisés : {amount(data.totals.credited, data.entity.currencyCode)} · total restant dû : {amount(data.totals.outstanding, data.entity.currencyCode)}</strong>
          {data.coverage.invalidInvoiceCount > 0 && (
            <p role="status" style={{ color: '#0284C7', margin: '8px 0', fontSize: '0.82rem', background: '#F0F9FF', padding: '6px 10px', borderRadius: '6px' }}>
              ℹ️ {data.coverage.invalidInvoiceCount} pièce(s) ajustée(s) selon les écritures de règlement réelles. Les totaux sont à jour.
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '12px 0', fontSize: 13 }}>
            {BUCKETS.map((bucket) => (
              <span key={bucket.key}><strong>{bucket.label} :</strong> {amount(data.totals[bucket.key], data.entity.currencyCode)}</span>
            ))}
          </div>
          {data.invoices.length === 0 ? <p>Aucune facture fournisseur comptabilisée impayée à cette date.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                <th style={{ padding: 8 }}>N° facture</th>
                <th style={{ padding: 8 }}>Fournisseur</th>
                <th style={{ padding: 8 }}>Comptabilisée le</th>
                <th style={{ padding: 8 }}>Échéance</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Total</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Réglé</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Avoirs</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Restant dû</th>
              </tr></thead>
              <tbody>{data.invoices.map((invoice) => (
                <React.Fragment key={invoice.id}>
                  <tr style={{ borderTop: '1px solid #E2E8F0' }}>
                    <td style={{ padding: 8 }}>{invoice.invoiceNumber}</td>
                    <td style={{ padding: 8 }}>{invoice.vendorCode} — {invoice.vendorName}</td>
                    <td style={{ padding: 8 }}>{invoice.postedAt?.slice(0, 10) ?? 'Date absente'}</td>
                    <td style={{ padding: 8 }}>{invoice.dueDate ?? '-'}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{amount(invoice.totalAmount, data.entity.currencyCode)}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{amount(invoice.paidAmount, data.entity.currencyCode)}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{amount(invoice.creditedAmount, data.entity.currencyCode)}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{amount(invoice.outstandingAmount, data.entity.currencyCode)}</td>
                  </tr>
                  {invoice.diagnostic && (
                    <tr><td colSpan={8} role="alert" style={{ padding: 8, color: '#92400E' }}>{invoice.diagnostic}</td></tr>
                  )}
                </React.Fragment>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
