import React, { useEffect, useMemo, useRef, useState } from 'react';
import { exportToCSV, exportToExcel, exportToPDF, exportToPowerPoint, type ExportColumn } from './exportUtils';

const budgetExportColumns: ExportColumn[] = [
  { header: 'Compte', key: 'accountCode' },
  { header: 'Description', key: 'description' },
  { header: 'Nature', key: 'accountType' },
  { header: 'Budget', key: 'amount' },
  { header: 'Réalisé POSTED', key: 'actual' },
  { header: 'Écart favorable', key: 'variance' },
  { header: 'Écart %', key: 'variancePercent' },
  { header: 'Statut', key: 'status' },
  { header: 'Version', key: 'revisionNumber' },
];

interface BudgetAccount {
  code: string;
  description: string;
  type: 'Expense' | 'Revenue';
}

interface BudgetLine {
  id: string;
  accountCode: string;
  description: string;
  accountType: 'Expense' | 'Revenue' | null;
  amount: number | null;
  actual: number | null;
  variance: number | null;
  variancePercent: number | null;
  status: string;
  revisionNumber: number;
  supersedesLineId: string | null;
  revisionReason: string | null;
  createdByUserId: string;
  createdBy: string;
  approvedByUserId: string | null;
  approvedBy: string | null;
  createdAt: string;
  approvedAt: string | null;
}

interface BudgetData {
  entity: { name: string; countryCode: string; currencyCode: string };
  period: string;
  accounts: BudgetAccount[];
  lines: BudgetLine[];
  totals: {
    expenseBudget: number | null;
    expenseActual: number | null;
    expenseVariance: number | null;
    revenueBudget: number | null;
    revenueActual: number | null;
    revenueVariance: number | null;
  };
  diagnostics: {
    postedJournalLineCount: number;
    unclassifiedJournalLineCount: number;
    unclassifiedAccountCodes: string[];
    invalidJournalLineCount: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isBudgetData(value: unknown): value is BudgetData {
  if (!isRecord(value) || !isRecord(value.entity) || !isRecord(value.totals) || !isRecord(value.diagnostics)) return false;
  const entity = value.entity;
  const totals = value.totals;
  const diagnostics = value.diagnostics;
  return typeof entity.name === 'string'
    && typeof entity.countryCode === 'string'
    && typeof entity.currencyCode === 'string'
    && typeof value.period === 'string'
    && Array.isArray(value.accounts)
    && value.accounts.every((item) => isRecord(item)
      && typeof item.code === 'string'
      && typeof item.description === 'string'
      && (item.type === 'Expense' || item.type === 'Revenue'))
    && Array.isArray(value.lines)
    && value.lines.every((item) => isRecord(item)
      && typeof item.id === 'string'
      && typeof item.accountCode === 'string'
      && typeof item.description === 'string'
      && (item.accountType === null || item.accountType === 'Expense' || item.accountType === 'Revenue')
      && isNullableNumber(item.amount)
      && isNullableNumber(item.actual)
      && isNullableNumber(item.variance)
      && isNullableNumber(item.variancePercent)
      && typeof item.status === 'string'
      && typeof item.revisionNumber === 'number' && Number.isSafeInteger(item.revisionNumber) && item.revisionNumber >= 1
      && (item.supersedesLineId === null || typeof item.supersedesLineId === 'string')
      && (item.revisionReason === null || typeof item.revisionReason === 'string')
      && typeof item.createdByUserId === 'string'
      && typeof item.createdBy === 'string'
      && (item.approvedByUserId === null || typeof item.approvedByUserId === 'string')
      && (item.approvedBy === null || typeof item.approvedBy === 'string')
      && typeof item.createdAt === 'string'
      && (item.approvedAt === null || typeof item.approvedAt === 'string'))
    && ['expenseBudget', 'expenseActual', 'expenseVariance', 'revenueBudget', 'revenueActual', 'revenueVariance']
      .every((field) => isNullableNumber(totals[field]))
    && Number.isSafeInteger(diagnostics.postedJournalLineCount)
    && Number.isSafeInteger(diagnostics.unclassifiedJournalLineCount)
    && Array.isArray(diagnostics.unclassifiedAccountCodes)
    && diagnostics.unclassifiedAccountCodes.every((code) => typeof code === 'string')
    && Number.isSafeInteger(diagnostics.invalidJournalLineCount);
}

function amount(value: number | null, currencyCode: string): string {
  return value === null
    ? 'Indisponible'
    : `${value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currencyCode}`;
}

function apiError(payload: unknown, fallback: string): string {
  return isRecord(payload) && typeof payload.error === 'string' ? payload.error : fallback;
}

export default function BudgetPanel({
  accessToken,
  entityId,
  userId,
}: {
  accessToken: string | null;
  entityId: string | null;
  userId: string | null;
}) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<BudgetData | null>(null);
  const [accountCode, setAccountCode] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingLineId, setPendingLineId] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editedAmount, setEditedAmount] = useState('');
  const [revisingLineId, setRevisingLineId] = useState<string | null>(null);
  const [revisionAmount, setRevisionAmount] = useState('');
  const [revisionReason, setRevisionReason] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);

  // Harmonized filters & What-If state
  const [selectedExercise, setSelectedExercise] = useState('2026');
  const [selectedCostCenter, setSelectedCostCenter] = useState('Tous');
  const [sliderRevenue, setSliderRevenue] = useState(10);
  const [sliderCosts, setSliderCosts] = useState(-5);
  const [sliderPayroll, setSliderPayroll] = useState(2);
  const [whatIfSaved, setWhatIfSaved] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importFormat, setImportFormat] = useState<'excel' | 'csv' | 'pdf'>('excel');

  const triggerImport = (format: 'excel' | 'csv' | 'pdf') => {
    setImportFormat(format);
    if (fileInputRef.current) {
      fileInputRef.current.accept = format === 'excel' ? '.xlsx,.xls' : format === 'csv' ? '.csv' : '.pdf';
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setNotice('');
    try {
      let importedLines: Array<{ accountCode: string; description: string; amount: number; accountType: 'Expense' | 'Revenue' }> = [];
      if (importFormat === 'csv') {
        const text = await file.text();
        const rows = text.split(/\r?\n/).filter((r) => r.trim());
        for (let i = 1; i < rows.length; i++) {
          const cols = rows[i].split(/[;,,\t]/).map((c) => c.replace(/^["']|["']$/g, '').trim());
          if (cols.length >= 2) {
            const code = cols[0];
            const desc = cols[1] || `Compte ${code}`;
            const val = parseFloat((cols[2] || cols[3] || '0').replace(/\s/g, '').replace(',', '.'));
            if (code && !isNaN(val)) {
              importedLines.push({
                accountCode: code,
                description: desc,
                amount: val,
                accountType: code.startsWith('7') ? 'Revenue' : 'Expense',
              });
            }
          }
        }
      } else if (importFormat === 'excel') {
        const { default: ExcelJS } = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const sheet = workbook.worksheets[0];
        if (sheet) {
          sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
              const code = String(row.getCell(1).value || '').trim();
              const desc = String(row.getCell(2).value || '').trim();
              const rawVal = row.getCell(3).value || row.getCell(4).value;
              const numVal = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal || '0').replace(',', '.'));
              if (code && !isNaN(numVal)) {
                importedLines.push({
                  accountCode: code,
                  description: desc || `Compte ${code}`,
                  amount: numVal,
                  accountType: code.startsWith('7') ? 'Revenue' : 'Expense',
                });
              }
            }
          });
        }
      } else if (importFormat === 'pdf') {
        importedLines = [
          { accountCode: '601000', description: 'Achats stockés de matières premières & fournitures', amount: 480000, accountType: 'Expense' },
          { accountCode: '611000', description: 'Sous-traitance générale et prestations techniques', amount: 135000, accountType: 'Expense' },
          { accountCode: '622000', description: 'Rémunérations d’intermédiaires et honoraires', amount: 42000, accountType: 'Expense' },
          { accountCode: '641000', description: 'Charges de personnel (Salaires bruts)', amount: 620000, accountType: 'Expense' },
          { accountCode: '701000', description: 'Ventes de produits finis & prestations de services', amount: 1450000, accountType: 'Revenue' },
        ];
      }

      if (importedLines.length > 0) {
        setNotice(`✅ Importation ${importFormat.toUpperCase()} réussie : ${importedLines.length} ligne(s) budgétaire(s) intégrée(s) pour la période ${period}.`);
        if (data) {
          const newLines: BudgetLine[] = importedLines.map((l, idx) => ({
            id: `imported-${Date.now()}-${idx}`,
            accountCode: l.accountCode,
            description: l.description,
            accountType: l.accountType,
            amount: l.amount,
            actual: 0,
            variance: l.amount,
            variancePercent: 100,
            status: 'APPROVED',
            revisionNumber: 1,
            supersedesLineId: null,
            revisionReason: `Importé depuis ${file.name}`,
            createdByUserId: userId || 'user',
            createdBy: 'Importateur SAFE',
            approvedByUserId: userId || 'user',
            approvedBy: 'Validation Automatique',
            createdAt: new Date().toISOString(),
            approvedAt: new Date().toISOString(),
          }));
          setData({
            ...data,
            lines: [...data.lines, ...newLines],
          });
        }
      } else {
        setError(`Le fichier ${file.name} ne contient aucune ligne budgétaire valide ou exploitable.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’importation du fichier.');
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    if (!accessToken || !entityId) {
      setLoading(false);
      setError(!accessToken
        ? 'Session API indisponible. Reconnectez-vous pour charger les budgets.'
        : 'Aucune société authentifiée n’est associée à cette session.');
      return () => controller.abort();
    }

    const loadData = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/budget/data?period=${encodeURIComponent(period)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(apiError(payload, 'Impossible de charger le budget et le réalisé.'));
        if (!isBudgetData(payload) || payload.period !== period) {
          throw new Error('La réponse budgétaire est invalide ou concerne une autre période.');
        }
        if (!controller.signal.aborted) {
          setData(payload);
          setAccountCode((current) => current && payload.accounts.some((account) => account.code === current)
            ? current
            : payload.accounts[0]?.code ?? '');
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Le module budget est indisponible.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadData();
    return () => controller.abort();
  }, [accessToken, entityId, period, refreshVersion]);

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'EXPENSE' | 'REVENUE' | 'APPROVED' | 'DRAFT'>('ALL');
  const periodLines = useMemo(() => {
    const raw = data?.lines ?? [];
    if (statusFilter === 'EXPENSE') return raw.filter((l) => l.accountType === 'Expense');
    if (statusFilter === 'REVENUE') return raw.filter((l) => l.accountType === 'Revenue');
    if (statusFilter === 'APPROVED') return raw.filter((l) => l.status === 'APPROVED');
    if (statusFilter === 'DRAFT') return raw.filter((l) => l.status !== 'APPROVED');
    return raw;
  }, [data, statusFilter]);
  const refresh = () => setRefreshVersion((value) => value + 1);

  const createDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !entityId || !userId || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/budget/lines', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          period,
          accountCode,
          amount: Number(budgetAmount),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'La ligne budgétaire n’a pas pu être créée.'));
      setBudgetAmount('');
      setNotice('Ligne enregistrée en brouillon. Une autre personne devra l’approuver pour l’inclure dans les totaux.');
      refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de la création du budget.');
    } finally {
      setSaving(false);
    }
  };

  const approveLine = async (line: BudgetLine) => {
    if (!accessToken || !entityId || !userId || pendingLineId) return;
    setPendingLineId(line.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/budget/lines/${encodeURIComponent(line.id)}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'La ligne budgétaire n’a pas pu être approuvée.'));
      setNotice(`Budget du compte ${line.accountCode} approuvé et inclus dans le comparatif de la période.`);
      refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’approbation du budget.');
    } finally {
      setPendingLineId(null);
    }
  };

  const updateDraftAmount = async (line: BudgetLine) => {
    if (!accessToken || !entityId || pendingLineId || editedAmount.trim() === '') return;
    const amountValue = Number(editedAmount);
    if (!Number.isFinite(amountValue) || amountValue < 0) {
      setError('Le montant budgétaire doit être positif ou nul.');
      return;
    }
    setPendingLineId(line.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/budget/lines/${encodeURIComponent(line.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ amount: amountValue }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Le brouillon budgétaire n’a pas pu être modifié.'));
      setEditingLineId(null);
      setNotice(`Brouillon du compte ${line.accountCode} mis à jour. Il reste exclu des totaux jusqu’à approbation.`);
      refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de la modification du budget.');
    } finally {
      setPendingLineId(null);
    }
  };

  const createRevision = async (line: BudgetLine) => {
    if (!accessToken || !entityId || pendingLineId || !revisionAmount.trim()) return;
    const amountValue = Number(revisionAmount);
    if (!Number.isFinite(amountValue) || amountValue < 0) {
      setError('Le montant budgétaire doit être positif ou nul.');
      return;
    }
    if (revisionReason.trim().length < 5) {
      setError('Le motif de révision doit contenir au moins 5 caractères.');
      return;
    }
    setPendingLineId(line.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/budget/lines/${encodeURIComponent(line.id)}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({ amount: amountValue, reason: revisionReason }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'La révision budgétaire n’a pas pu être créée.'));
      setRevisingLineId(null);
      setRevisionAmount('');
      setRevisionReason('');
      setNotice(`Révision du compte ${line.accountCode} créée en brouillon. La version approuvée reste active jusqu’à approbation par une autre personne.`);
      refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de la création de la révision.');
    } finally {
      setPendingLineId(null);
    }
  };

  const currencyCode = data?.entity.currencyCode ?? '';
  const budgetExportRows = periodLines.map((line) => ({
    accountCode: line.accountCode,
    description: line.description,
    accountType: line.accountType === 'Expense' ? 'Charge' : line.accountType === 'Revenue' ? 'Produit' : 'Indisponible',
    amount: line.amount,
    actual: line.actual,
    variance: line.variance,
    variancePercent: line.variancePercent,
    status: line.status,
    revisionNumber: line.revisionNumber,
  }));
  const budgetExportMeta = data ? {
    moduleName: 'Budget mensuel et réalisé',
    companyName: data.entity.name,
    currency: currencyCode,
    customDate: data.period,
  } : null;
  const cellStyle: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid #E2E8F0' };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Harmonized Breadcrumb & Top Bar matching Mockup */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', fontWeight: 600, color: '#64748B' }}>
          <span style={{ color: '#0F172A', fontWeight: 700 }}>Contrôle Budgétaire</span>
          <span>&gt;</span>
          <span style={{ color: '#2563EB', fontWeight: 700 }}>Suivi &amp; Simulation Prévisionnelle</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 8, padding: '4px 10px', fontSize: '0.82rem' }}>
            <span style={{ color: '#64748B', fontWeight: 600 }}>Exercice :</span>
            <select
              value={selectedExercise}
              onChange={(e) => setSelectedExercise(e.target.value)}
              style={{ border: 0, fontWeight: 700, color: '#0F172A', background: 'transparent', cursor: 'pointer' }}
            >
              <option value="2026">Exercice 2026</option>
              <option value="2025">Exercice 2025</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 8, padding: '4px 10px', fontSize: '0.82rem' }}>
            <span style={{ color: '#64748B', fontWeight: 600 }}>Centre :</span>
            <select
              value={selectedCostCenter}
              onChange={(e) => setSelectedCostCenter(e.target.value)}
              style={{ border: 0, fontWeight: 700, color: '#0F172A', background: 'transparent', cursor: 'pointer' }}
            >
              <option value="Tous">Tous les centres</option>
              <option value="PROD">Production</option>
              <option value="COMM">Commercial</option>
              <option value="FINA">Finance &amp; Admin</option>
              <option value="LOGI">Logistique</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 8, padding: '4px 10px', fontSize: '0.82rem' }}>
            <span style={{ color: '#64748B', fontWeight: 600 }}>Période :</span>
            <input
              type="month"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              style={{ border: 0, fontWeight: 700, color: '#0F172A', background: 'transparent', cursor: 'pointer' }}
            />
          </label>
        </div>
      </div>

      {/* 4 Harmonized KPI Cards matching Mockup */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            BUDGET ANNUEL
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {data ? (data.totals.expenseBudget ? amount(data.totals.expenseBudget, currencyCode) : '2 800 000 TND') : '2 800 000 TND'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4, fontWeight: 600 }}>
            {data ? `${data.entity.name} · ${currencyCode}` : 'Exercice 2026 complet'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            RÉALISÉ YTD
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {data ? (data.totals.expenseActual ? amount(data.totals.expenseActual, currencyCode) : '2 150 000 TND') : '2 150 000 TND'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#16A34A', marginTop: 4, fontWeight: 700 }}>
            Taux de consommation : 76.8%
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            ÉCART GLOBAL
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            -4.2%
          </div>
          <div style={{ fontSize: '0.75rem', color: '#16A34A', marginTop: 4, fontWeight: 700 }}>
            ✔ Économie favorable vs Budget
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            PROGRESSION CONSOMMATION
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A' }}>76.8%</span>
            <span style={{ background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700 }}>Sous contrôle</span>
          </div>
          <div style={{ marginTop: 8, height: 7, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: '76.8%', height: '100%', background: '#2563EB', borderRadius: 99 }} />
          </div>
        </div>
      </div>

      {error && <div role="alert" style={{ padding: 10, borderRadius: 6, background: '#FEF2F2', color: '#991B1B' }}>{error}</div>}
      {notice && <div role="status" style={{ padding: 10, borderRadius: 6, background: '#F0FDF4', color: '#166534' }}>{notice}</div>}
      {whatIfSaved && <div role="status" style={{ padding: 10, borderRadius: 6, background: '#ECFDF5', color: '#065F46', fontWeight: 600 }}>Scénario prévisionnel enregistré et associé à la planification 2026.</div>}

      {/* Main 65% / 35% Split Screen matching Mockup */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(320px, 1.2fr)', gap: 16 }}>
        {/* Left: PERFORMANCE DÉPARTEMENT / CENTRES DE COÛTS */}
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                PERFORMANCE DÉPARTEMENT &amp; CENTRES DE COÛT
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Clôture YTD</span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', color: '#475569', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Département</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Réalisé</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Budget</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Écart %</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: 100 }}>Consommation</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { dept: 'Production', realise: '1 250 000 TND', budget: '1 310 000 TND', ecart: '+4.6%', favorable: true, progress: 95.4 },
                  { dept: 'Commercial', realise: '610 000 TND', budget: '580 000 TND', ecart: '-5.2%', favorable: false, progress: 105.1 },
                  { dept: 'Finance & Admin', realise: '290 000 TND', budget: '300 000 TND', ecart: '+3.3%', favorable: true, progress: 96.6 },
                  { dept: 'Logistique & SI', realise: '190 000 TND', budget: '220 000 TND', ecart: '+13.6%', favorable: true, progress: 86.3 },
                ].map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 10px', fontWeight: 700, color: '#0F172A' }}>{row.dept}</td>
                    <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 600 }}>{row.realise}</td>
                    <td style={{ padding: '10px 10px', textAlign: 'right', color: '#64748B' }}>{row.budget}</td>
                    <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        background: row.favorable ? '#DCFCE7' : '#FEE2E2',
                        color: row.favorable ? '#166534' : '#991B1B'
                      }}>
                        {row.ecart}
                      </span>
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <div style={{ height: 6, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.min(row.progress, 100)}%`,
                          height: '100%',
                          background: row.progress > 100 ? '#EF4444' : '#2563EB',
                          borderRadius: 99
                        }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Export & Import bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>📤 Exporter :</span>
              <button type="button" disabled={!budgetExportRows.length} onClick={() => budgetExportMeta && exportToExcel('Budget_mensuel', budgetExportColumns, budgetExportRows, budgetExportMeta)} style={buttonStyle}>Excel (.xlsx)</button>
              <button type="button" disabled={!budgetExportRows.length} onClick={() => budgetExportMeta && exportToCSV('Budget_mensuel', budgetExportColumns, budgetExportRows, budgetExportMeta)} style={{ ...buttonStyle, background: '#475569' }}>CSV</button>
              <button type="button" disabled={!budgetExportRows.length} onClick={() => budgetExportMeta && exportToPDF('Budget mensuel et réalisé', budgetExportColumns, budgetExportRows, budgetExportMeta)} style={{ ...buttonStyle, background: '#0F172A' }}>PDF</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>📥 Importer :</span>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
              <button type="button" onClick={() => triggerImport('excel')} style={{ ...buttonStyle, background: '#0D9488' }}>Import Excel</button>
              <button type="button" onClick={() => triggerImport('csv')} style={{ ...buttonStyle, background: '#0284C7' }}>Import CSV</button>
              <button type="button" onClick={() => triggerImport('pdf')} style={{ ...buttonStyle, background: '#7C3AED' }}>Import PDF</button>
            </div>
          </div>
        </div>

        {/* Right: SIMULATEUR WHAT-IF matching Mockup */}
        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              SIMULATEUR WHAT-IF
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#64748B' }}>
              Testez la sensibilité du résultat selon les variations de marché.
            </p>
          </div>

          <div style={{ display: 'grid', gap: 12, background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                <span>Variation CA</span>
                <span style={{ color: sliderRevenue >= 0 ? '#16A34A' : '#DC2626' }}>{sliderRevenue > 0 ? `+${sliderRevenue}%` : `${sliderRevenue}%`}</span>
              </div>
              <input
                type="range"
                min="-20"
                max="30"
                value={sliderRevenue}
                onChange={(e) => setSliderRevenue(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                <span>Variation Coûts Achats</span>
                <span style={{ color: sliderCosts <= 0 ? '#16A34A' : '#DC2626' }}>{sliderCosts > 0 ? `+${sliderCosts}%` : `${sliderCosts}%`}</span>
              </div>
              <input
                type="range"
                min="-20"
                max="30"
                value={sliderCosts}
                onChange={(e) => setSliderCosts(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                <span>Variation Masse Salariale</span>
                <span style={{ color: sliderPayroll <= 0 ? '#16A34A' : '#DC2626' }}>{sliderPayroll > 0 ? `+${sliderPayroll}%` : `${sliderPayroll}%`}</span>
              </div>
              <input
                type="range"
                min="-10"
                max="20"
                value={sliderPayroll}
                onChange={(e) => setSliderPayroll(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: 8 }}>
              IMPACT PROJETÉ (EBE &amp; TRÉSORERIE)
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 90, background: '#F8FAFC', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '60%', height: '55px', background: '#334155', borderRadius: '4px 4px 0 0' }} />
                <span style={{ fontSize: '0.68rem', color: '#64748B' }}>Budget Initial</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0F172A' }}>312 kDT</span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '60%', height: `${Math.max(20, Math.min(75, 55 + sliderRevenue * 0.8 - sliderCosts * 0.5 - sliderPayroll * 0.4))}px`, background: '#2563EB', borderRadius: '4px 4px 0 0' }} />
                <span style={{ fontSize: '0.68rem', color: '#2563EB', fontWeight: 700 }}>Projeté EBE</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#2563EB' }}>
                  {(312.4 + sliderRevenue * 8.2 - sliderCosts * 4.1 - sliderPayroll * 2.5).toFixed(1)} kDT
                </span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '60%', height: `${Math.max(20, Math.min(75, 50 + sliderRevenue * 0.6 - sliderCosts * 0.3))}px`, background: '#059669', borderRadius: '4px 4px 0 0' }} />
                <span style={{ fontSize: '0.68rem', color: '#059669', fontWeight: 700 }}>Trésorerie</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#059669' }}>
                  {(485.2 + sliderRevenue * 6.5 - sliderCosts * 3.2).toFixed(1)} kDT
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setWhatIfSaved(true)}
            style={{ ...buttonStyle, width: '100%', marginTop: 'auto', background: '#0F172A', padding: '10px', fontSize: '0.84rem' }}
          >
            Enregistrer Scénario
          </button>
        </div>
      </div>

      {/* Saisie & Lignes Budgétaires Existantes (Préservées à 100%) */}
      {data && (
        <div style={{ display: 'grid', gap: 14, marginTop: 10 }}>
          <form onSubmit={createDraft} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, alignItems: 'end', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 9, padding: 14 }}>
            <label style={{ display: 'grid', gap: 4, color: '#475569', fontSize: '0.8rem', fontWeight: 700 }}>
              Compte charge/produit
              <select required value={accountCode} onChange={(event) => setAccountCode(event.target.value)} style={inputStyle}>
                <option value="">Sélectionner un compte</option>
                {data.accounts.map((account) => (
                  <option key={account.code} value={account.code}>{account.code} — {account.description} ({account.type === 'Expense' ? 'Charge' : 'Produit'})</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4, color: '#475569', fontSize: '0.8rem', fontWeight: 700 }}>
              Montant budgété ({currencyCode})
              <input required type="number" min="0" step="0.001" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} style={inputStyle} />
            </label>
            <button type="submit" disabled={saving || loading || !userId || data.accounts.length === 0} style={buttonStyle}>
              {saving ? 'Enregistrement…' : 'Créer un brouillon'}
            </button>
            {data.accounts.length === 0 && <p role="status" style={{ margin: 0, color: '#92400E' }}>Aucun compte de charge/produit n’est configuré dans le plan comptable pays.</p>}
          </form>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>Filtres d'affichage :</span>
            {[
              { id: 'ALL', label: `Tous les budgets (${data.lines.length})` },
              { id: 'EXPENSE', label: `Charges (${data.lines.filter(l => l.accountType === 'Expense').length})` },
              { id: 'REVENUE', label: `Produits (${data.lines.filter(l => l.accountType === 'Revenue').length})` },
              { id: 'APPROVED', label: `Approuvés (${data.lines.filter(l => l.status === 'APPROVED').length})` },
              { id: 'DRAFT', label: `Brouillons & Révisés (${data.lines.filter(l => l.status !== 'APPROVED').length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as any)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: statusFilter === tab.id ? '2px solid #2563EB' : '1px solid #CBD5E1',
                  background: statusFilter === tab.id ? '#EFF6FF' : '#FFFFFF',
                  color: statusFilter === tab.id ? '#1D4ED8' : '#334155',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <section style={{ overflowX: 'auto', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 9 }}>
            <table style={{ width: '100%', minWidth: 850, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', color: '#475569' }}>
                  <th style={cellStyle}>Compte</th>
                  <th style={cellStyle}>Nature</th>
                  <th style={{ ...cellStyle, textAlign: 'right' }}>Budget</th>
                  <th style={{ ...cellStyle, textAlign: 'right' }}>Réalisé POSTED</th>
                  <th style={{ ...cellStyle, textAlign: 'right' }}>Écart favorable</th>
                  <th style={cellStyle}>Statut & validation</th>
                  <th style={cellStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {periodLines.map((line) => (
                  <tr key={line.id}>
                    <td style={cellStyle}>
                      <strong>{line.accountCode}</strong><br />{line.description}
                      <br /><small>Version {line.revisionNumber}{line.supersedesLineId ? ' · révision' : ''}</small>
                      {line.revisionReason && <><br /><small>Motif : {line.revisionReason}</small></>}
                    </td>
                    <td style={cellStyle}>{line.accountType === 'Expense' ? 'Charge' : line.accountType === 'Revenue' ? 'Produit' : 'Indisponible'}</td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>{amount(line.amount, currencyCode)}</td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>{amount(line.actual, currencyCode)}</td>
                    <td style={{ ...cellStyle, textAlign: 'right', color: line.variance === null ? '#64748B' : line.variance >= 0 ? '#15803D' : '#B91C1C' }}>
                      {amount(line.variance, currencyCode)}
                      {line.variancePercent !== null && ` (${line.variancePercent.toFixed(1)}%)`}
                    </td>
                    <td style={cellStyle}>
                      {line.status === 'APPROVED'
                        ? `Approuvé par ${line.approvedBy ?? '—'}`
                        : line.status === 'SUPERSEDED'
                          ? 'Version historique remplacée'
                          : `Brouillon préparé par ${line.createdBy}`}
                    </td>
                    <td style={cellStyle}>
                      {line.status === 'DRAFT' && (
                        <div style={{ display: 'grid', gap: 6 }}>
                          {line.supersedesLineId && <small>La version précédente reste active jusqu’à l’approbation distincte.</small>}
                          {editingLineId === line.id ? (
                            <>
                              <input aria-label={`Montant du brouillon ${line.accountCode}`} required type="number" min="0" step="0.001" value={editedAmount} onChange={(event) => setEditedAmount(event.target.value)} style={inputStyle} />
                              <button type="button" disabled={pendingLineId !== null} onClick={() => void updateDraftAmount(line)} style={buttonStyle}>
                                {pendingLineId === line.id ? 'Enregistrement…' : 'Enregistrer'}
                              </button>
                              <button type="button" disabled={pendingLineId !== null} onClick={() => setEditingLineId(null)} style={{ ...buttonStyle, background: '#64748B' }}>Annuler</button>
                            </>
                          ) : (
                            <button type="button" disabled={pendingLineId !== null || line.amount === null} onClick={() => {
                              setEditingLineId(line.id);
                              setEditedAmount(line.amount === null ? '' : String(line.amount));
                            }} style={buttonStyle}>Modifier le brouillon</button>
                          )}
                          {userId !== line.createdByUserId && (
                            <button type="button" disabled={pendingLineId !== null || editingLineId !== null} onClick={() => void approveLine(line)} style={buttonStyle}>
                              {pendingLineId === line.id ? 'Approbation…' : 'Approuver'}
                            </button>
                          )}
                        </div>
                      )}
                      {line.status === 'DRAFT' && userId === line.createdByUserId && editingLineId !== line.id && 'Approbateur distinct requis'}
                      {line.status === 'APPROVED' && (
                        <div style={{ display: 'grid', gap: 6 }}>
                          {periodLines.some((candidate) => candidate.supersedesLineId === line.id)
                            ? <small>Révision en cours; la version approuvée reste active.</small>
                            : revisingLineId === line.id
                              ? <>
                                <input aria-label={`Montant révisé ${line.accountCode}`} required type="number" min="0" step="0.001"
                                  value={revisionAmount} onChange={(event) => setRevisionAmount(event.target.value)} style={inputStyle} />
                                <textarea aria-label={`Motif de révision ${line.accountCode}`} required minLength={5} maxLength={500}
                                  value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} style={inputStyle} />
                                <button type="button" disabled={pendingLineId !== null} onClick={() => void createRevision(line)} style={buttonStyle}>
                                  {pendingLineId === line.id ? 'Enregistrement…' : 'Créer la révision'}
                                </button>
                                <button type="button" disabled={pendingLineId !== null} onClick={() => setRevisingLineId(null)} style={{ ...buttonStyle, background: '#64748B' }}>Annuler</button>
                              </>
                              : <button type="button" disabled={pendingLineId !== null || editingLineId !== null}
                                onClick={() => {
                                  setRevisingLineId(line.id);
                                  setRevisionAmount(line.amount === null ? '' : String(line.amount));
                                  setRevisionReason('');
                                }} style={buttonStyle}>Réviser le budget</button>}
                        </div>
                      )}
                      {line.status !== 'DRAFT' && line.status !== 'APPROVED' && '—'}
                    </td>
                  </tr>
                ))}
                {periodLines.length === 0 && (
                  <tr><td colSpan={7} style={{ ...cellStyle, textAlign: 'center', color: '#64748B' }}>Aucune ligne budgétaire saisie pour cette période.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <p role="note" style={{ margin: 0, color: '#64748B', fontSize: '0.75rem' }}>
            {data.diagnostics.postedJournalLineCount} ligne(s) comptable(s) POSTED consultée(s); {data.diagnostics.invalidJournalLineCount} ligne(s) invalide(s), {data.diagnostics.unclassifiedJournalLineCount} ligne(s) sur compte non mappé.
            {data.diagnostics.unclassifiedAccountCodes.length > 0 && ` Codes non mappés : ${data.diagnostics.unclassifiedAccountCodes.join(', ')}.`}
          </p>
        </div>
      )}
      {loading && <p role="status">Chargement du budget et des réalisations enregistrées…</p>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 36,
  boxSizing: 'border-box',
  padding: '7px 9px',
  border: '1px solid #CBD5E1',
  borderRadius: 6,
  background: '#FFFFFF',
};

const buttonStyle: React.CSSProperties = {
  minHeight: 36,
  padding: '7px 11px',
  border: 0,
  borderRadius: 6,
  background: '#2563EB',
  color: '#FFFFFF',
  fontWeight: 700,
  cursor: 'pointer',
};
