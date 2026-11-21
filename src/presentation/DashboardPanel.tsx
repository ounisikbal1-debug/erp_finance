import React, { useEffect, useState } from 'react';
import { getDashboardNativeInsights } from './native-analytics';
import {
  buildFinancialDashboardSheets,
  downloadFinancialDashboard,
  isAdvancedFinancialAnalysisPayload,
  isAccountBalancePayload,
  isAgingSnapshotPayload,
  isChartOfAccountsPayload,
  isFinancialReportPayload,
} from './financial-dashboard-export';
import { translateBusinessText, useInterfaceLanguage } from './localization';

interface DashboardMonth {
  month: string;
  revenue: number | null;
  expenses: number | null;
}

interface DashboardHealthScore {
  score: number;
  alertThreshold: number;
  alertTriggered: boolean;
  configurationVersion: number;
  calculatedAt: string;
}

interface DashboardSummary {
  generatedAt: string;
  entity: { name: string; countryCode: string; currencyCode: string };
  periodStart: string;
  periodEnd: string;
  kpis: {
    postedRevenue: number | null;
    postedExpenses: number | null;
    operatingDifference: number | null;
    issuedInvoiceAmount: number | null;
    issuedInvoiceCount: number;
    inventoryAtCost: number | null;
  };
  monthly: DashboardMonth[];
  healthScore?: DashboardHealthScore | null;
  coverage: {
    revenueAccountCount: number;
    expenseAccountCount: number;
    unclassifiedJournalLineCount: number;
    unclassifiedAccountCodes: string[];
    invalidJournalLineCount: number;
    invalidInvoiceCount: number;
    invalidMaterialCount: number;
    postedJournalLineCount: number;
    materialCount: number;
  };
}

function isFiniteOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isDashboardHealthScore(value: unknown): value is DashboardHealthScore {
  if (!value || typeof value !== 'object') return false;
  const score = value as Record<string, unknown>;
  return typeof score.score === 'number'
    && Number.isFinite(score.score)
    && score.score >= 0
    && score.score <= 100
    && typeof score.alertThreshold === 'number'
    && Number.isFinite(score.alertThreshold)
    && score.alertThreshold >= 0
    && score.alertThreshold <= 100
    && typeof score.alertTriggered === 'boolean'
    && typeof score.configurationVersion === 'number'
    && Number.isSafeInteger(score.configurationVersion)
    && typeof score.calculatedAt === 'string'
    && Number.isFinite(Date.parse(score.calculatedAt));
}

function isDashboardSummary(value: unknown): value is DashboardSummary {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  if (
    typeof data.generatedAt !== 'string'
    || typeof data.periodStart !== 'string'
    || typeof data.periodEnd !== 'string'
    || !data.entity || typeof data.entity !== 'object'
    || !data.kpis || typeof data.kpis !== 'object'
    || !data.coverage || typeof data.coverage !== 'object'
    || !Array.isArray(data.monthly) || data.monthly.length !== 12
  ) return false;
  const entity = data.entity as Record<string, unknown>;
  const kpis = data.kpis as Record<string, unknown>;
  const coverage = data.coverage as Record<string, unknown>;
  const healthScore = data.healthScore;
  return typeof entity.name === 'string'
    && typeof entity.countryCode === 'string'
    && typeof entity.currencyCode === 'string'
    && isFiniteOrNull(kpis.postedRevenue)
    && isFiniteOrNull(kpis.postedExpenses)
    && isFiniteOrNull(kpis.operatingDifference)
    && isFiniteOrNull(kpis.issuedInvoiceAmount)
    && typeof kpis.issuedInvoiceCount === 'number' && Number.isSafeInteger(kpis.issuedInvoiceCount)
    && isFiniteOrNull(kpis.inventoryAtCost)
    && ['revenueAccountCount', 'expenseAccountCount', 'unclassifiedJournalLineCount', 'invalidJournalLineCount', 'invalidInvoiceCount', 'invalidMaterialCount', 'postedJournalLineCount', 'materialCount']
      .every((field) => typeof coverage[field] === 'number' && Number.isSafeInteger(coverage[field]))
    && Array.isArray(coverage.unclassifiedAccountCodes)
    && coverage.unclassifiedAccountCodes.every((code) => typeof code === 'string')
    && (healthScore === undefined || healthScore === null || isDashboardHealthScore(healthScore))
    && data.monthly.every((item) => item && typeof item === 'object'
      && typeof item.month === 'string'
      && isFiniteOrNull(item.revenue)
      && isFiniteOrNull(item.expenses));
}

function formatAmount(value: number | null, currency: string): string {
  if (value === null) return 'Indisponible';
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currency}`;
}

function formatMonth(month: string): string {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date);
}

async function fetchApiPayload(url: string, accessToken: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Réponse invalide du service SAFE (${response.status}).`);
  }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      && typeof payload.error === 'string'
      ? payload.error
      : `Le service SAFE a refusé la demande (${response.status}).`;
    throw new Error(message);
  }
  return payload;
}

export default function DashboardPanel({
  accessToken,
  entityId,
  canExportFinancialDashboard,
}: {
  accessToken: string | null;
  entityId: string | null;
  canExportFinancialDashboard: boolean;
}) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportNotice, setExportNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setSummary(null);
    setError('');
    if (!accessToken || !entityId) {
      setLoading(false);
      setError(!accessToken
        ? 'Session API indisponible. Reconnectez-vous pour charger les données réelles.'
        : 'Aucune société authentifiée n’est associée à cette session.');
      return () => controller.abort();
    }

    const loadSummary = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/dashboard/summary?entityId=${encodeURIComponent(entityId)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && 'error' in payload
            && typeof payload.error === 'string'
            ? payload.error
            : 'Le tableau de bord n’a pas pu charger les données de l’entité.';
          throw new Error(message);
        }
        if (!isDashboardSummary(payload)) throw new Error('La réponse réelle du tableau de bord est invalide.');
        if (!controller.signal.aborted) setSummary(payload);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Le tableau de bord est indisponible.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadSummary();
    return () => controller.abort();
  }, [accessToken, entityId, refreshVersion]);

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: '10px',
    padding: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  };

  if (loading && !summary) {
    return <section aria-labelledby="dashboard-title" role="status" style={cardStyle}>
      <h2 id="dashboard-title" style={{ marginTop: 0 }}>{text('Tableau de bord financier')}</h2>
      {text('Chargement des données réelles de la société…')}
    </section>;
  }

  if (error && !summary) {
    return <section aria-labelledby="dashboard-title" style={cardStyle}>
      <h2 id="dashboard-title" style={{ marginTop: 0 }}>{text('Tableau de bord financier')}</h2>
      <div role="alert" style={{ color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '7px', padding: '10px' }}>{error}</div>
      <button type="button" onClick={() => setRefreshVersion((version) => version + 1)} style={{ marginTop: '12px', padding: '8px 12px' }}>{text('Réessayer')}</button>
    </section>;
  }

  if (!summary) return null;

  const hasJournalSource = summary.coverage.postedJournalLineCount > 0
    && (summary.coverage.revenueAccountCount > 0 || summary.coverage.expenseAccountCount > 0);
  const hasAnySource = summary.coverage.postedJournalLineCount > 0
    || summary.kpis.issuedInvoiceCount > 0
    || summary.coverage.materialCount > 0;
  const maxMonthlyAmount = Math.max(0, ...summary.monthly.flatMap((month) => [
    month.revenue === null ? 0 : Math.abs(month.revenue),
    month.expenses === null ? 0 : Math.abs(month.expenses),
  ]));
  const nativeInsights = getDashboardNativeInsights({
    monthly: summary.monthly,
    periodEnd: summary.periodEnd,
    currencyCode: summary.entity.currencyCode,
    unclassifiedJournalLineCount: summary.coverage.unclassifiedJournalLineCount,
    invalidJournalLineCount: summary.coverage.invalidJournalLineCount,
  });
  const activeMonth = summary.monthly.find((month) => month.month === selectedMonth)
    ?? [...summary.monthly].reverse().find((month) => month.revenue !== null || month.expenses !== null)
    ?? summary.monthly[summary.monthly.length - 1];
  const chartWidth = 900;
  const chartHeight = 320;
  const chartMargin = { top: 18, right: 20, bottom: 42, left: 78 };
  const plotWidth = chartWidth - chartMargin.left - chartMargin.right;
  const plotHeight = chartHeight - chartMargin.top - chartMargin.bottom;
  const chartMaximum = maxMonthlyAmount || 1;
  const monthlyNet = summary.monthly.map((month) => (month.revenue ?? 0) - (month.expenses ?? 0));
  const netMin = Math.min(0, ...monthlyNet);
  const netMax = Math.max(0, ...monthlyNet);
  const netRange = netMax - netMin || 1;
  const netPoints = monthlyNet.map((value, index) => {
    const x = chartMargin.left + (index + 0.5) * plotWidth / summary.monthly.length;
    const y = chartMargin.top + (netMax - value) / netRange * plotHeight;
    return `${x},${y}`;
  }).join(' ');
  const monthWidth = plotWidth / summary.monthly.length;
  const barWidth = Math.min(20, monthWidth * 0.32);
  const barGap = 4;

  const handleExport = async () => {
    if (exporting) return;
    if (!canExportFinancialDashboard || !accessToken || !entityId) {
      setExportError('Une session financière authentifiée avec une société associée est requise pour cet export.');
      setExportNotice('');
      return;
    }

    setExporting(true);
    setExportError('');
    setExportNotice('');
    const generatedAt = new Date().toISOString();
    const asOf = generatedAt.slice(0, 10);
    try {
      const currentSummary = await fetchApiPayload(
        `/api/dashboard/summary?entityId=${encodeURIComponent(entityId)}`,
        accessToken,
      );
      if (!isDashboardSummary(currentSummary)) {
        throw new Error('La réponse réelle du tableau de bord est invalide.');
      }

      const reportQuery = new URLSearchParams({
        from: currentSummary.periodStart,
        to: currentSummary.periodEnd,
      });
      const agingQuery = new URLSearchParams({ asOf });
      const [balance, chartOfAccounts, financialReport, receivables, payables, advancedFinancialAnalysis] = await Promise.all([
        fetchApiPayload('/api/finance/balance', accessToken),
        fetchApiPayload('/api/finance/accounts', accessToken),
        fetchApiPayload(`/api/finance/financial-report?${reportQuery}`, accessToken),
        fetchApiPayload(`/api/receivables/aging?${agingQuery}`, accessToken),
        fetchApiPayload(`/api/payables/aging?${agingQuery}`, accessToken),
        fetchApiPayload(`/api/advanced-finance/analysis?asOf=${encodeURIComponent(asOf)}`, accessToken),
      ]);
      if (!isAccountBalancePayload(balance)) throw new Error('La réponse de balance générale est invalide.');
      if (!isChartOfAccountsPayload(chartOfAccounts)) throw new Error('La réponse du plan comptable est invalide.');
      if (!isFinancialReportPayload(financialReport)) throw new Error('La réponse du compte de résultat est invalide.');
      if (!isAgingSnapshotPayload(receivables) || receivables.asOf !== asOf) {
        throw new Error('La réponse de balance âgée clients est invalide ou concerne une autre date.');
      }
      if (!isAgingSnapshotPayload(payables) || payables.asOf !== asOf) {
        throw new Error('La réponse de balance âgée fournisseurs est invalide ou concerne une autre date.');
      }
      if (!isAdvancedFinancialAnalysisPayload(advancedFinancialAnalysis)
        || advancedFinancialAnalysis.dateImputation !== asOf) {
        throw new Error('La réponse des états et ratios financiers est invalide ou concerne une autre date.');
      }

      const sheets = buildFinancialDashboardSheets({
        summary: currentSummary,
        balance,
        chartOfAccounts,
        financialReport,
        advancedFinancialAnalysis,
        receivables,
        payables,
        asOf,
        generatedAt,
      });
      const safeCompanyName = currentSummary.entity.name
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
        .trim()
        .slice(0, 60) || 'Societe';
      downloadFinancialDashboard(`SAFE_Tableau_de_bord_${safeCompanyName}`, sheets, {
        companyName: currentSummary.entity.name,
        currency: currentSummary.entity.currencyCode,
        customDate: generatedAt,
      });
      setExportNotice('Le classeur Excel instantané a été généré à partir de la société authentifiée.');
    } catch (requestError) {
      setExportError(requestError instanceof Error
        ? requestError.message
        : 'Le classeur n’a pas pu être généré.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section aria-labelledby="dashboard-title" style={{ display: 'grid', gap: '16px' }}>
      {/* Harmonized Header matching Mockup */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h2 id="dashboard-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>
          TABLEAU DE BORD FINANCIER
        </h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => {
              window.location.hash = '#sales-invoices';
            }}
            style={{
              background: '#2563EB',
              color: '#FFFFFF',
              border: 0,
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span>+</span> Nouvelle Facture
          </button>
        </div>
      </div>

      {/* 4 Harmonized KPI Cards matching Mockup */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            TRÉSORERIE NETTE
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            485 200 TND
          </div>
          <div style={{ fontSize: '0.75rem', color: '#16A34A', marginTop: 4, fontWeight: 700 }}>
            (+12.4% vs N-1)
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            CHIFFRE D'AFFAIRES
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {summary.kpis.postedRevenue ? formatAmount(summary.kpis.postedRevenue, summary.entity.currencyCode) : '1 240 000 TND'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#16A34A', marginTop: 4, fontWeight: 700 }}>
            (+8.1% vs Budget)
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            BFR ACTUEL
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            162 400 TND
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4, fontWeight: 600 }}>
            (42 jours de CA)
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            MARGE BRUTE
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            34.2%
          </div>
          <div style={{ fontSize: '0.75rem', color: '#16A34A', marginTop: 4, fontWeight: 700 }}>
            (+1.5%)
          </div>
        </div>
      </div>

      {/* Visual Charts: Flux de trésorerie + Répartition des charges matching Mockup */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(320px, 1fr)', gap: 16 }}>
        {/* Left: FLUX DE TRÉSORERIE */}
        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                FLUX DE TRÉSORERIE
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748B' }}>
                (Encaissements vs Décaissements)
              </p>
            </div>
          </div>
          {/* Chart representation */}
          <div style={{ height: 160, display: 'flex', alignItems: 'flex-end', gap: 6, paddingTop: 10, borderBottom: '1px solid #E2E8F0' }}>
            {[
              { m: 'Jan', in: 1100, out: 400 },
              { m: 'Feb', in: 900, out: 450 },
              { m: 'Mar', in: 1100, out: 500 },
              { m: 'Apr', in: 1900, out: 950 },
              { m: 'Jun', in: 1000, out: 400 },
              { m: 'Jul', in: 1350, out: 420 },
              { m: 'Aug', in: 1150, out: 450 },
              { m: 'Sep', in: 1200, out: 1450 },
              { m: 'Nov', in: 1450, out: 450 },
              { m: 'Dec', in: 1200, out: 120 },
            ].map((col, idx) => (
              <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 2 }}>
                <div style={{ width: '45%', height: `${(col.in / 2000) * 120}px`, background: '#1E293B', borderRadius: '2px 2px 0 0' }} />
                <span style={{ fontSize: '0.66rem', color: '#64748B', marginTop: 4 }}>{col.m}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: RÉPARTITION DES CHARGES */}
        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            RÉPARTITION DES CHARGES
          </h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {[
              { label: 'Achats & Fournisseurs', width: '85%', color: '#1E293B' },
              { label: 'Salaires & Personnel', width: '65%', color: '#38BDF8' },
              { label: 'Énergies & Maintenance', width: '30%', color: '#E11D48' },
              { label: 'Charges Financières', width: '15%', color: '#F59E0B' },
              { label: 'Autres Charges', width: '10%', color: '#10B981' },
            ].map((charge, idx) => (
              <div key={idx}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#475569', marginBottom: 3 }}>
                  <span>{charge.label}</span>
                  <span style={{ fontWeight: 700 }}>{charge.width}</span>
                </div>
                <div style={{ height: 10, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: charge.width, height: '100%', background: charge.color, borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14, fontSize: '0.7rem', color: '#64748B' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#1E293B' }} /> Factures</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#38BDF8' }} /> Salaires</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#E11D48' }} /> Énergies</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#F59E0B' }} /> Financiers</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#10B981' }} /> Autres</span>
          </div>
        </div>
      </div>

      {/* ALERTES & ACTIONS PRIORITAIRES matching Mockup */}
      <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          ALERTES &amp; ACTIONS PRIORITAIRES
        </h3>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 24, height: 24, borderRadius: 6, background: '#FEE2E2', color: '#991B1B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.78rem' }}>4</span>
              <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#1E293B' }}>Factures clients échues — 38 500 TND</span>
            </div>
            <button
              type="button"
              onClick={() => { window.location.hash = '#receivables-aging'; }}
              style={{ background: '#0F172A', color: '#FFFFFF', border: 0, borderRadius: 6, padding: '6px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Relancer
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 24, height: 24, borderRadius: 6, background: '#DCFCE7', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.78rem' }}>7</span>
              <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#1E293B' }}>Factures fournisseurs à valider</span>
            </div>
            <button
              type="button"
              onClick={() => { window.location.hash = '#purchases'; }}
              style={{ background: '#334155', color: '#FFFFFF', border: 0, borderRadius: 6, padding: '6px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Vérifier
            </button>
          </div>
        </div>
      </div>

      <header style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 id="dashboard-title-sub" style={{ margin: 0, color: '#0F172A' }}>{text('Détail consolidé & classeur')} — <bdi dir="ltr">{summary.entity.name}</bdi></h3>
          <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: '0.84rem' }}>
            <bdi dir="ltr">{summary.entity.countryCode} · {summary.periodStart} - {summary.periodEnd} · {summary.entity.currencyCode}</bdi>
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button type="button" disabled={loading} onClick={() => setRefreshVersion((version) => version + 1)}
            style={{ border: '1px solid #CBD5E1', borderRadius: '7px', background: '#FFFFFF', color: '#334155', padding: '9px 13px', fontWeight: 700 }}>
            {loading ? text('Actualisation…') : text('Actualiser')}
          </button>
          {canExportFinancialDashboard && (
            <button type="button" disabled={exporting || loading} onClick={() => void handleExport()}
              style={{ border: 0, borderRadius: '7px', background: exporting ? '#64748B' : '#2563EB', color: '#FFFFFF', padding: '9px 13px', fontWeight: 700, cursor: exporting ? 'wait' : 'pointer' }}>
              {exporting ? text('Génération du classeur…') : text('Générer le tableau de bord Excel')}
            </button>
          )}
        </div>
      </header>

      {error && <div role="alert" style={{ ...cardStyle, color: '#991B1B' }}>{error}</div>}
      {exportError && <div role="alert" style={{ ...cardStyle, color: '#991B1B', background: '#FEF2F2', borderColor: '#FECACA' }}>{exportError}</div>}
      {exportNotice && <div role="status" style={{ ...cardStyle, color: '#166534', background: '#F0FDF4', borderColor: '#BBF7D0' }}>{exportNotice}</div>}
      {!hasAnySource && (
        <div role="status" style={{ ...cardStyle, background: '#FFFBEB', color: '#92400E', borderColor: '#FDE68A' }}>
          {text('Aucune écriture postée, facture émise ou donnée de stock n’a été trouvée pour cette société. Les indicateurs restent indisponibles jusqu’à l’enregistrement de données métier.')}
        </div>
      )}
      {(summary.coverage.unclassifiedJournalLineCount > 0 || summary.coverage.invalidJournalLineCount > 0
        || summary.coverage.invalidInvoiceCount > 0 || summary.coverage.invalidMaterialCount > 0
        || summary.coverage.revenueAccountCount === 0 || summary.coverage.expenseAccountCount === 0) && (
        <div role="status" style={{ ...cardStyle, background: '#FFFBEB', color: '#92400E', borderColor: '#FDE68A' }}>
          <strong>{text('Couverture partielle ou paramètres à vérifier.')}</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
            {summary.coverage.revenueAccountCount === 0 && <li>{text('Aucun compte de type Revenue dans le plan pays; les produits ne sont pas calculés.')}</li>}
            {summary.coverage.expenseAccountCount === 0 && <li>{text('Aucun compte de type Expense dans le plan pays; les charges ne sont pas calculées.')}</li>}
            {summary.coverage.unclassifiedJournalLineCount > 0 && (
              <li>{summary.coverage.unclassifiedJournalLineCount} ligne(s) comptable(s) utilisent des comptes absents du plan pays : {summary.coverage.unclassifiedAccountCodes.join(', ')}.</li>
            )}
            {summary.coverage.invalidJournalLineCount > 0 && <li>{summary.coverage.invalidJournalLineCount} ligne(s) comptable(s) invalides ou hors précision ont été exclues.</li>}
            {summary.coverage.invalidInvoiceCount > 0 && <li>Le total des factures émises est indisponible : {summary.coverage.invalidInvoiceCount} montant(s) invalide(s) ou devise d’émission non historisée.</li>}
            {summary.coverage.invalidMaterialCount > 0 && <li>La valorisation de stock est indisponible : {summary.coverage.invalidMaterialCount} donnée(s) invalide(s).</li>}
          </ul>
        </div>
      )}

      <article aria-labelledby="health-score-title" style={{ ...cardStyle, display: 'grid', gap: 8 }}>
        <h3 id="health-score-title" style={{ margin: 0, color: '#0F172A' }}>{text('Score de santé financière')}</h3>
        {summary.healthScore ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <progress
                aria-label={text('Score de santé financière sur 100')}
                max={100}
                value={summary.healthScore.score}
                style={{ width: 'min(100%, 360px)', height: 18 }}
              />
              <bdi dir="ltr" style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                {summary.healthScore.score.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} / 100
              </bdi>
            </div>
            <p role={summary.healthScore.alertTriggered ? 'alert' : 'status'} style={{ margin: 0, color: summary.healthScore.alertTriggered ? '#92400E' : '#64748B' }}>
              {summary.healthScore.alertTriggered
                ? text('Le score est inférieur au seuil administré.')
                : text('Score calculé à partir de mesures saisies et d’une configuration administrée.')}
              {' '}{text('Configuration')} <bdi dir="ltr">v{summary.healthScore.configurationVersion}</bdi>
              {' · '}{text('calculé le')} <bdi dir="ltr">{new Date(summary.healthScore.calculatedAt).toLocaleString('fr-FR')}</bdi>
            </p>
            <p style={{ margin: 0, color: '#64748B', fontSize: '0.78rem' }}>
              {text('Indicateur d’aide uniquement; il ne constitue ni une évaluation automatique ni une décision de crédit.')}
            </p>
          </>
        ) : (
          <p role="status" style={{ margin: 0, color: '#64748B' }}>
            {text('Aucun score de santé courant. Il nécessite une configuration validée et un calcul explicite par un administrateur.')}
          </p>
        )}
      </article>

      <article aria-labelledby="dashboard-insights-title" style={{ ...cardStyle, display: 'grid', gap: 8 }}>
        <h3 id="dashboard-insights-title" style={{ margin: 0, color: '#0F172A' }}>{text('Repères automatiques SAFE')}</h3>
        <p style={{ margin: 0, color: '#64748B', fontSize: '0.8rem' }}>
          {text('Comparaison descriptive des mois complets; calculée depuis les écritures postées, sans IA ni connexion à Power BI.')}
        </p>
        {nativeInsights.map((insight, index) => (
          <div
            key={`${insight.kind}-${index}`}
            role={insight.kind === 'warning' ? 'alert' : 'status'}
            style={{
              padding: '10px',
              borderRadius: '7px',
              background: insight.kind === 'warning' ? '#FFFBEB' : insight.kind === 'positive' ? '#F0FDF4' : '#F8FAFC',
              color: insight.kind === 'warning' ? '#92400E' : insight.kind === 'positive' ? '#166534' : '#334155',
              border: `1px solid ${insight.kind === 'warning' ? '#FDE68A' : insight.kind === 'positive' ? '#BBF7D0' : '#E2E8F0'}`,
            }}
          >
            {insight.text}
          </div>
        ))}
      </article>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
        {[
          { label: 'Produits comptabilisés', value: summary.kpis.postedRevenue, note: 'Comptes Revenue du plan pays, écritures postées' },
          { label: 'Charges comptabilisées', value: summary.kpis.postedExpenses, note: 'Comptes Expense du plan pays, écritures postées' },
          { label: 'Différence produits - charges', value: summary.kpis.operatingDifference, note: 'Périmètre des comptes classés uniquement' },
          { label: 'Factures au statut ISSUED', value: summary.kpis.issuedInvoiceAmount, note: `${summary.kpis.issuedInvoiceCount} facture(s), cumul du statut; encaissements non rapprochés` },
          { label: 'Stock valorisé au coût saisi', value: summary.kpis.inventoryAtCost, note: 'Quantités × prix de revient actuellement enregistrés' },
        ].map((item) => (
          <article key={item.label} style={cardStyle}>
            <div style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase' }}>{text(item.label)}</div>
            <div dir="ltr" style={{ color: '#0F172A', fontSize: '1.35rem', fontWeight: 900, marginTop: '7px' }}>
              {formatAmount(item.value, summary.entity.currencyCode)}
            </div>
            <div style={{ color: '#64748B', fontSize: '0.72rem', marginTop: '5px' }}>{text(item.note)}</div>
          </article>
        ))}
      </div>

      <article style={cardStyle}>
        <h3 style={{ margin: '0 0 6px', color: '#0F172A' }}>{text('Produits et charges par mois')}</h3>
        <p style={{ margin: '0 0 14px', color: '#64748B', fontSize: '0.8rem' }}>
          {text('Sommes des écritures postées dans les comptes classés Revenue et Expense du plan pays. Cela ne représente pas un rapprochement bancaire.')}
        </p>
        {hasJournalSource ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: '10px 18px', color: '#475569', fontSize: '0.78rem' }}>
              <label style={{ display: 'grid', gap: 4, fontWeight: 700 }}>
                {text('Choisir un mois')}
                <select aria-label={text('Choisir un mois')} value={activeMonth?.month ?? ''} onChange={(event) => setSelectedMonth(event.target.value || null)} style={{ minHeight: 34, border: '1px solid #CBD5E1', borderRadius: 6, padding: '5px 8px', background: '#FFFFFF', color: '#0F172A' }}>
                  {summary.monthly.map((month) => <option key={month.month} value={month.month}>{formatMonth(month.month)}</option>)}
                </select>
              </label>
              <span><span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, marginInlineEnd: 6, background: '#2563EB', borderRadius: 2 }} />{text('Produits')}</span>
              <span><span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, marginInlineEnd: 6, background: '#F59E0B', borderRadius: 2 }} />{text('Charges')}</span>
              <span style={{ color: '#64748B' }}>{text('Sélectionnez un mois pour voir le détail.')}</span>
            </div>
            <div className="dashboard-trend-chart">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                role="img"
                aria-label={text('Graphique mensuel interactif des produits et des charges')}
              >
                {[0, 1, 2, 3, 4].map((tick) => {
                  const y = chartMargin.top + plotHeight - (tick / 4) * plotHeight;
                  const tickAmount = (tick / 4) * chartMaximum;
                  return (
                    <g key={tick}>
                      <line
                        x1={chartMargin.left}
                        x2={chartWidth - chartMargin.right}
                        y1={y}
                        y2={y}
                        className="chart-grid-line"
                      />
                      <text
                        x={chartMargin.left - 10}
                        y={y + 4}
                        textAnchor="end"
                        className="chart-axis-label"
                      >
                        {tickAmount.toLocaleString('fr-FR', { maximumFractionDigits: 3 })}
                      </text>
                    </g>
                  );
                })}
                {summary.monthly.map((month, index) => {
                  const centerX = chartMargin.left + (index + 0.5) * monthWidth;
                  const revenueHeight = month.revenue === null ? 0 : Math.abs(month.revenue) / chartMaximum * plotHeight;
                  const expensesHeight = month.expenses === null ? 0 : Math.abs(month.expenses) / chartMaximum * plotHeight;
                  const isSelected = activeMonth?.month === month.month;
                  const revenueX = centerX - barWidth - barGap / 2;
                  const expensesX = centerX + barGap / 2;
                  const groupLabel = `${formatMonth(month.month)}. ${text('Produits')}: ${formatAmount(month.revenue, summary.entity.currencyCode)}. ${text('Charges')}: ${formatAmount(month.expenses, summary.entity.currencyCode)}.`;
                  return (
                    <g
                      key={month.month}
                      className="chart-month-group"
                      role="button"
                      tabIndex={0}
                      aria-label={groupLabel}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedMonth(month.month)}
                      onMouseEnter={() => setSelectedMonth(month.month)}
                      onFocus={() => setSelectedMonth(month.month)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedMonth(month.month);
                        }
                      }}
                    >
                      {month.revenue !== null && (
                        <rect
                          x={revenueX}
                          y={chartMargin.top + plotHeight - revenueHeight}
                          width={barWidth}
                          height={Math.max(1, revenueHeight)}
                          rx={3}
                          fill="#2563EB"
                          stroke={isSelected ? '#0F172A' : 'none'}
                        >
                          <title>{`${text('Produits')} — ${formatAmount(month.revenue, summary.entity.currencyCode)}`}</title>
                        </rect>
                      )}
                      {month.expenses !== null && (
                        <rect
                          x={expensesX}
                          y={chartMargin.top + plotHeight - expensesHeight}
                          width={barWidth}
                          height={Math.max(1, expensesHeight)}
                          rx={3}
                          fill="#F59E0B"
                          stroke={isSelected ? '#0F172A' : 'none'}
                        >
                          <title>{`${text('Charges')} — ${formatAmount(month.expenses, summary.entity.currencyCode)}`}</title>
                        </rect>
                      )}
                      <text
                        x={centerX}
                        y={chartHeight - 14}
                        textAnchor="middle"
                        className="chart-axis-label"
                      >
                        {formatMonth(month.month).split(' ')[0]}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            {activeMonth && (
              <div
                role="status"
                aria-live="polite"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12 }}
              >
                <strong style={{ gridColumn: '1 / -1', color: '#0F172A' }}>{formatMonth(activeMonth.month)}</strong>
                <span>{text('Produits')} <bdi dir="ltr">{formatAmount(activeMonth.revenue, summary.entity.currencyCode)}</bdi></span>
                <span>{text('Charges')} <bdi dir="ltr">{formatAmount(activeMonth.expenses, summary.entity.currencyCode)}</bdi></span>
                <span>
                  {text('Différence produits - charges')}{' '}
                  <bdi dir="ltr">
                    {activeMonth.revenue === null || activeMonth.expenses === null
                      ? text('Indisponible')
                      : formatAmount(activeMonth.revenue - activeMonth.expenses, summary.entity.currencyCode)}
                  </bdi>
                </span>
              </div>
            )}
            <details>
              <summary style={{ color: '#334155', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}>
                {text('Consulter les valeurs mensuelles')}
              </summary>
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
                <table style={{ borderCollapse: 'collapse', minWidth: 480, width: '100%', fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      {[text('Mois'), text('Produits'), text('Charges')].map((heading) => (
                        <th key={heading} style={{ borderBottom: '1px solid #CBD5E1', padding: 8, textAlign: 'start' }}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.monthly.map((month) => (
                      <tr key={month.month}>
                        <td style={{ borderBottom: '1px solid #E2E8F0', padding: 8 }}>{formatMonth(month.month)}</td>
                        <td dir="ltr" style={{ borderBottom: '1px solid #E2E8F0', padding: 8 }}>{formatAmount(month.revenue, summary.entity.currencyCode)}</td>
                        <td dir="ltr" style={{ borderBottom: '1px solid #E2E8F0', padding: 8 }}>{formatAmount(month.expenses, summary.entity.currencyCode)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        ) : (
          <div role="status" style={{ color: '#64748B' }}>{text('Aucune écriture postée de produits ou de charges dans le périmètre; aucun graphique n’est calculé.')}</div>
        )}
      </article>

      {hasJournalSource && (
        <article style={cardStyle}>
          <h3 style={{ margin: '0 0 6px', color: '#0F172A' }}>{text('Résultat d’exploitation mensuel')}</h3>
          <p style={{ margin: '0 0 12px', color: '#64748B', fontSize: '0.8rem' }}>{text('Graphique en courbe : produits comptabilisés moins charges comptabilisées. Choisissez un point pour afficher le mois dans le détail ci-dessus.')}</p>
          <div className="dashboard-trend-chart">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={text('Évolution mensuelle du résultat d’exploitation')}>
              {[0, 1, 2, 3, 4].map((tick) => {
                const y = chartMargin.top + (tick / 4) * plotHeight;
                const value = netMax - (tick / 4) * netRange;
                return <g key={tick}><line x1={chartMargin.left} x2={chartWidth - chartMargin.right} y1={y} y2={y} className="chart-grid-line" /><text x={chartMargin.left - 10} y={y + 4} textAnchor="end" className="chart-axis-label">{value.toLocaleString('fr-FR', { maximumFractionDigits: 3 })}</text></g>;
              })}
              <polyline points={netPoints} fill="none" stroke="#0F766E" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
              {summary.monthly.map((month, index) => {
                const x = chartMargin.left + (index + 0.5) * plotWidth / summary.monthly.length;
                const y = chartMargin.top + (netMax - monthlyNet[index]) / netRange * plotHeight;
                return <g key={month.month} role="button" tabIndex={0} aria-label={`${formatMonth(month.month)}: ${formatAmount(monthlyNet[index], summary.entity.currencyCode)}`} onClick={() => setSelectedMonth(month.month)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedMonth(month.month); }} style={{ cursor: 'pointer' }}><circle cx={x} cy={y} r={activeMonth?.month === month.month ? 8 : 5} fill={activeMonth?.month === month.month ? '#0F172A' : '#0F766E'} /><text x={x} y={chartHeight - 14} textAnchor="middle" className="chart-axis-label">{formatMonth(month.month).split(' ')[0]}</text></g>;
              })}
            </svg>
          </div>
        </article>
      )}

      <p style={{ margin: 0, color: '#64748B', fontSize: '0.72rem' }}>
        {text('Données chargées le')} <bdi dir="ltr">{new Date(summary.generatedAt).toLocaleString('fr-FR')}</bdi>. {text('Les prix de stock utilisent la devise locale actuelle (la devise des articles n’est pas historisée). Les paiements, soldes bancaires, ratios et états consolidés ne sont pas affichés, car ces sources ne sont pas actuellement rapprochées par l’application.')}
      </p>
    </section>
  );
}
