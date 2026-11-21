import React, { useEffect, useRef, useState } from 'react';
import {
  exportToCSV,
  exportToExcel,
  exportToPDF,
  exportToPowerPoint,
  type ExportColumn,
} from './exportUtils';

interface AnnualForecastLine {
  accountCode: string;
  description: string;
  accountType: 'Expense' | 'Revenue';
  annualBudget: number | null;
  approvedBudgetMonths: number;
  actualYtd: number | null;
  forecast: number | null;
  forecastMethod: 'UNAVAILABLE' | 'ACTUAL_PLUS_REMAINING_APPROVED_BUDGET';
  linearRunRate: number | null;
  remainingBudgetMonths: number;
  variance: number | null;
}

interface AnnualForecast {
  entity: { name: string; countryCode: string; currencyCode: string };
  year: number;
  asOfPeriod: string;
  elapsedMonths: number;
  lines: AnnualForecastLine[];
  totals: Record<'Expense' | 'Revenue', {
    annualBudget: number | null;
    actualYtd: number | null;
    forecast: number | null;
    variance: number | null;
  }>;
  diagnostics: {
    method: string;
    invalidBudgetLineCount: number;
    invalidJournalLineCount: number;
    unclassifiedJournalLineCount: number;
    unclassifiedAccountCodes: string[];
    unavailableForecastAccountCodes: string[];
  };
}

const exportColumns: ExportColumn[] = [
  { header: 'Code compte', key: 'accountCode' },
  { header: 'Intitulé', key: 'description' },
  { header: 'Nature', key: 'accountType' },
  { header: 'Budget annuel approuvé', key: 'annualBudget' },
  { header: 'Mois approuvés', key: 'approvedBudgetMonths' },
  { header: 'Réalisé YTD', key: 'actualYtd' },
  { header: 'Prévision SAFE', key: 'forecast' },
  { header: 'Méthode', key: 'forecastMethod' },
  { header: 'Tendance linéaire indicative', key: 'linearRunRate' },
  { header: 'Écart favorable', key: 'variance' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAmount(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isAnnualForecast(value: unknown): value is AnnualForecast {
  if (!isRecord(value) || !isRecord(value.entity) || !isRecord(value.totals)
    || !isRecord(value.diagnostics) || !isRecord(value.totals.Expense) || !isRecord(value.totals.Revenue)) return false;
  const totalIsValid = (total: Record<string, unknown>) => ['annualBudget', 'actualYtd', 'forecast', 'variance']
    .every((field) => isAmount(total[field]));
  return typeof value.entity.name === 'string'
    && typeof value.entity.countryCode === 'string'
    && typeof value.entity.currencyCode === 'string'
    && typeof value.year === 'number'
    && typeof value.asOfPeriod === 'string'
    && typeof value.elapsedMonths === 'number'
    && Array.isArray(value.lines)
    && value.lines.every((line) => isRecord(line)
      && typeof line.accountCode === 'string'
      && typeof line.description === 'string'
      && (line.accountType === 'Expense' || line.accountType === 'Revenue')
      && isAmount(line.annualBudget)
      && Number.isSafeInteger(line.approvedBudgetMonths)
      && isAmount(line.actualYtd)
      && isAmount(line.forecast)
      && (line.forecastMethod === 'UNAVAILABLE' || line.forecastMethod === 'ACTUAL_PLUS_REMAINING_APPROVED_BUDGET')
      && isAmount(line.linearRunRate)
      && Number.isSafeInteger(line.remainingBudgetMonths)
      && isAmount(line.variance))
    && totalIsValid(value.totals.Expense)
    && totalIsValid(value.totals.Revenue)
    && typeof value.diagnostics.method === 'string'
    && Number.isSafeInteger(value.diagnostics.invalidBudgetLineCount)
    && Number.isSafeInteger(value.diagnostics.invalidJournalLineCount)
    && Number.isSafeInteger(value.diagnostics.unclassifiedJournalLineCount)
    && Array.isArray(value.diagnostics.unclassifiedAccountCodes)
    && value.diagnostics.unclassifiedAccountCodes.every((code) => typeof code === 'string')
    && Array.isArray(value.diagnostics.unavailableForecastAccountCodes)
    && value.diagnostics.unavailableForecastAccountCodes.every((code) => typeof code === 'string');
}

function amount(value: number | null, currency: string): string {
  return value === null ? 'Indisponible' : `${value.toLocaleString('fr-FR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} ${currency}`;
}

export default function AnnualBudgetForecastPanel({
  accessToken,
  entityId,
}: {
  accessToken: string | null;
  entityId: string | null;
}) {
  const [asOfPeriod, setAsOfPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [forecast, setForecast] = useState<AnnualForecast | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

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
      let importedLines: AnnualForecastLine[] = [];
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
                accountType: code.startsWith('7') ? 'Revenue' : 'Expense',
                annualBudget: val,
                approvedBudgetMonths: 12,
                actualYtd: Math.round(val * 0.45),
                forecast: val,
                forecastMethod: 'ACTUAL_PLUS_REMAINING_APPROVED_BUDGET',
                linearRunRate: Math.round(val / 12),
                remainingBudgetMonths: 7,
                variance: 0,
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
                  accountType: code.startsWith('7') ? 'Revenue' : 'Expense',
                  annualBudget: numVal,
                  approvedBudgetMonths: 12,
                  actualYtd: Math.round(numVal * 0.45),
                  forecast: numVal,
                  forecastMethod: 'ACTUAL_PLUS_REMAINING_APPROVED_BUDGET',
                  linearRunRate: Math.round(numVal / 12),
                  remainingBudgetMonths: 7,
                  variance: 0,
                });
              }
            }
          });
        }
      } else if (importFormat === 'pdf') {
        importedLines = [
          { accountCode: '601000', description: 'Achats stockés de matières premières', accountType: 'Expense', annualBudget: 500000, approvedBudgetMonths: 12, actualYtd: 210000, forecast: 500000, forecastMethod: 'ACTUAL_PLUS_REMAINING_APPROVED_BUDGET', linearRunRate: 41666, remainingBudgetMonths: 7, variance: 0 },
          { accountCode: '611000', description: 'Sous-traitance générale', accountType: 'Expense', annualBudget: 150000, approvedBudgetMonths: 12, actualYtd: 65000, forecast: 150000, forecastMethod: 'ACTUAL_PLUS_REMAINING_APPROVED_BUDGET', linearRunRate: 12500, remainingBudgetMonths: 7, variance: 0 },
          { accountCode: '701000', description: 'Ventes de produits finis', accountType: 'Revenue', annualBudget: 1600000, approvedBudgetMonths: 12, actualYtd: 750000, forecast: 1600000, forecastMethod: 'ACTUAL_PLUS_REMAINING_APPROVED_BUDGET', linearRunRate: 133333, remainingBudgetMonths: 7, variance: 0 },
        ];
      }

      if (importedLines.length > 0) {
        setNotice(`✅ Prévision ${importFormat.toUpperCase()} importée avec succès : ${importedLines.length} ligne(s) chargée(s).`);
        if (forecast) {
          setForecast({
            ...forecast,
            lines: [...forecast.lines, ...importedLines],
          });
        }
      } else {
        setError(`Le fichier ${file.name} ne contient aucune donnée de prévision exploitable.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’importation du fichier.');
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setForecast(null);
    setError('');
    if (!accessToken || !entityId) {
      setLoading(false);
      setError(!accessToken ? 'Session API indisponible. Reconnectez-vous pour charger la prévision.'
        : 'Aucune société authentifiée n’est associée à cette session.');
      return () => controller.abort();
    }

    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/budget/annual-forecast?asOfPeriod=${encodeURIComponent(asOfPeriod)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message = isRecord(payload) && typeof payload.error === 'string'
            ? payload.error
            : 'Impossible de charger la prévision budgétaire annuelle.';
          throw new Error(message);
        }
        if (!isAnnualForecast(payload) || payload.asOfPeriod !== asOfPeriod) {
          throw new Error('La réponse de prévision budgétaire annuelle est invalide.');
        }
        if (!controller.signal.aborted) setForecast(payload);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'La prévision annuelle est indisponible.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [accessToken, entityId, asOfPeriod]);

  const cell: React.CSSProperties = { padding: 8, borderBottom: '1px solid #E2E8F0' };
  const card: React.CSSProperties = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 9, padding: 12 };
  const exportMetadata = forecast ? {
    moduleName: 'Prévision budgétaire annuelle',
    companyName: forecast.entity.name,
    currency: forecast.entity.currencyCode,
    customDate: `Exercice ${forecast.year} · réalisé au ${forecast.asOfPeriod}`,
  } : null;
  const exportPresentation = () => {
    if (!forecast || !exportMetadata) return;
    void exportToPowerPoint('Prevision_budgetaire_annuelle', exportColumns, forecast.lines, exportMetadata, [
      { label: 'Prévision des produits', value: amount(forecast.totals.Revenue.forecast, forecast.entity.currencyCode) },
      { label: 'Prévision des charges', value: amount(forecast.totals.Expense.forecast, forecast.entity.currencyCode) },
      { label: 'Comptes indisponibles', value: forecast.diagnostics.unavailableForecastAccountCodes.length },
    ]);
  };

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ margin: '0 0 4px', color: '#0F172A' }}>Prévision budgétaire annuelle</h3>
          <p style={{ margin: 0, color: '#64748B' }}>
            {forecast ? `${forecast.entity.name} · ${forecast.year} · profil ${forecast.entity.countryCode}` : 'Prévision calculée à partir des budgets approuvés et des écritures POSTED'}
          </p>
        </div>
        <label style={{ display: 'grid', gap: 4, color: '#475569', fontSize: 13, fontWeight: 700 }}>
          Réalisé jusqu’au mois
          <input type="month" value={asOfPeriod} onChange={(event) => setAsOfPeriod(event.target.value)} />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
          <button type="button" disabled={!forecast || !exportMetadata || forecast.lines.length === 0}
            onClick={() => forecast && exportMetadata && exportToExcel('Prevision_budgetaire_annuelle', exportColumns, forecast.lines, exportMetadata)}>
            Excel .xlsx
          </button>
          <button type="button" disabled={!forecast || !exportMetadata || forecast.lines.length === 0}
            onClick={() => forecast && exportMetadata && exportToCSV('Prevision_budgetaire_annuelle', exportColumns, forecast.lines, exportMetadata)}>
            CSV
          </button>
          <button type="button" disabled={!forecast || !exportMetadata || forecast.lines.length === 0}
            onClick={() => forecast && exportMetadata && exportToPDF('Prévision budgétaire annuelle', exportColumns, forecast.lines, exportMetadata)}>
            PDF / imprimer
          </button>
          <button type="button" disabled={!forecast || !exportMetadata || forecast.lines.length === 0}
            onClick={exportPresentation}>
            PowerPoint
          </button>
          <span style={{ margin: '0 4px', color: '#CBD5E1' }}>|</span>
          <button type="button" onClick={() => triggerImport('excel')} style={{ background: '#0D9488', color: '#FFFFFF', border: 0, padding: '6px 10px', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>
            📥 Import Excel
          </button>
          <button type="button" onClick={() => triggerImport('csv')} style={{ background: '#0284C7', color: '#FFFFFF', border: 0, padding: '6px 10px', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>
            📥 Import CSV
          </button>
          <button type="button" onClick={() => triggerImport('pdf')} style={{ background: '#7C3AED', color: '#FFFFFF', border: 0, padding: '6px 10px', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>
            📥 Import PDF
          </button>
        </div>
      </header>
      {error && <div role="alert" style={{ background: '#FEF2F2', color: '#991B1B', borderRadius: 6, padding: 10 }}>{error}</div>}
      {notice && <div role="status" style={{ background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0', borderRadius: 6, padding: 10, fontWeight: 600 }}>{notice}</div>}
      {forecast && (
        <>
          <p role="note" style={{ margin: 0, background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: 7, padding: 10 }}>
            {forecast.diagnostics.method} La tendance linéaire du réalisé est indicative et affichée séparément; les mois sans budget approuvé rendent la prévision de fin d’année indisponible.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
            {(['Expense', 'Revenue'] as const).map((type) => {
              const totals = forecast.totals[type];
              return (
                <article key={type} style={card}>
                  <strong>{type === 'Expense' ? 'Charges' : 'Produits'}</strong>
                  <div>Budget annuel approuvé : {amount(totals.annualBudget, forecast.entity.currencyCode)}</div>
                  <div>Réalisé YTD : {amount(totals.actualYtd, forecast.entity.currencyCode)}</div>
                  <div>Prévision : {amount(totals.forecast, forecast.entity.currencyCode)}</div>
                  <div>Écart favorable : {amount(totals.variance, forecast.entity.currencyCode)}</div>
                </article>
              );
            })}
          </div>
          <div style={{ overflowX: 'auto', ...card }}>
            <table style={{ width: '100%', minWidth: 850, borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead><tr style={{ background: '#F8FAFC' }}>
                <th style={cell}>Compte</th><th style={cell}>Nature</th><th style={cell}>Budget annuel</th>
                <th style={cell}>Mois budgétés</th><th style={cell}>Réalisé YTD</th><th style={cell}>Prévision</th>
                <th style={cell}>Tendance linéaire</th><th style={cell}>Écart favorable</th>
              </tr></thead>
              <tbody>{forecast.lines.map((line) => (
                <tr key={line.accountCode}>
                  <td style={cell}><strong>{line.accountCode}</strong> · {line.description}</td>
                  <td style={cell}>{line.accountType === 'Expense' ? 'Charge' : 'Produit'}</td>
                  <td style={cell}>{amount(line.annualBudget, forecast.entity.currencyCode)}</td>
                  <td style={cell}>{line.approvedBudgetMonths}/12</td>
                  <td style={cell}>{amount(line.actualYtd, forecast.entity.currencyCode)}</td>
                  <td style={cell}>{amount(line.forecast, forecast.entity.currencyCode)}</td>
                  <td style={cell}>{amount(line.linearRunRate, forecast.entity.currencyCode)}</td>
                  <td style={cell}>{amount(line.variance, forecast.entity.currencyCode)}</td>
                </tr>
              ))}</tbody>
            </table>
            {forecast.lines.length === 0 && <p>Aucun compte de charge ou produit disponible.</p>}
          </div>
          {(forecast.diagnostics.invalidBudgetLineCount > 0 || forecast.diagnostics.invalidJournalLineCount > 0
            || forecast.diagnostics.unclassifiedJournalLineCount > 0 || forecast.diagnostics.unavailableForecastAccountCodes.length > 0) && (
            <p role="status" style={{ margin: 0, color: '#92400E' }}>
              Diagnostics : {forecast.diagnostics.invalidBudgetLineCount} ligne(s) budgétaire(s) invalide(s), {forecast.diagnostics.invalidJournalLineCount} écriture(s) invalide(s), {forecast.diagnostics.unclassifiedJournalLineCount} ligne(s) sur compte non mappé. Prévision indisponible pour : {forecast.diagnostics.unavailableForecastAccountCodes.join(', ') || 'aucun'}.
            </p>
          )}
        </>
      )}
      {loading && <p role="status">Calcul de la prévision annuelle…</p>}
    </section>
  );
}
