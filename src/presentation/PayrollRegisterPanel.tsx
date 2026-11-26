import React, { useEffect, useRef, useState } from 'react';
import { exportToCSV, type ExportColumn } from './exportUtils';
import { printPayslip } from './payroll-print';

interface PayrollRegisterRow {
  id: string;
  employeeNumber: string | null;
  employeeName: string;
  cnssNumber: string | null;
  currencyCode: string;
  grossSalary: number;
  employeeCnss: number;
  employerCnss: number;
  foprolos: number;
  taxableGross: number;
  irpp: number;
  css: number;
  netSalary: number;
  calculationSnapshotAvailable: boolean;
}

interface PayrollRegister {
  period: string;
  currencyCode: string | null;
  status: 'PREPARATION_ONLY';
  filingSupported: false;
  completeness: 'INCOMPLETE' | 'REVIEW_REQUIRED';
  expectedEmployeeCount: number;
  payslipCount: number;
  missingEmployees: Array<{ id: string; empId: string | null; firstName: string; lastName: string }>;
  missingSnapshotCount: number;
  invalidSnapshotCount: number;
  totals: Omit<PayrollRegisterRow, 'id' | 'employeeNumber' | 'employeeName' | 'cnssNumber' | 'currencyCode' | 'calculationSnapshotAvailable'>;
  rows: PayrollRegisterRow[];
  warnings: string[];
}

const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Matricule', key: 'employeeNumber' },
  { header: 'Salarié', key: 'employeeName' },
  { header: 'N° CNSS', key: 'cnssNumber' },
  { header: 'Devise', key: 'currencyCode' },
  { header: 'Brut', key: 'grossSalary' },
  { header: 'CNSS salarié', key: 'employeeCnss' },
  { header: 'CNSS patronale et accidents', key: 'employerCnss' },
  { header: 'FOPROLOS', key: 'foprolos' },
  { header: 'Brut imposable', key: 'taxableGross' },
  { header: 'IRPP retenu', key: 'irpp' },
  { header: 'CSS retenue', key: 'css' },
  { header: 'Net à payer', key: 'netSalary' },
  { header: 'Calcul versionné disponible', key: 'calculationSnapshotAvailable' },
];

function isPayrollRegister(value: unknown): value is PayrollRegister {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const report = value as Record<string, unknown>;
  return typeof report.period === 'string'
    && (typeof report.currencyCode === 'string' || report.currencyCode === null)
    && report.status === 'PREPARATION_ONLY'
    && report.filingSupported === false
    && (report.completeness === 'INCOMPLETE' || report.completeness === 'REVIEW_REQUIRED')
    && typeof report.expectedEmployeeCount === 'number'
    && typeof report.payslipCount === 'number'
    && Array.isArray(report.missingEmployees)
    && typeof report.missingSnapshotCount === 'number'
    && typeof report.invalidSnapshotCount === 'number'
    && Array.isArray(report.rows)
    && Array.isArray(report.warnings);
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

interface StoredCustomRates {
  cnssEmployeeRate: number;
  cnssEmployerRate: number;
  workAccidentRate: number;
  foprolosRate: number;
  profExpensesRate: number;
  profExpensesMaxCap: number;
  headOfFamilyDeduction: number;
  childDeduction: number;
  cssRate: number;
  assuranceDecesRate?: number;
  assuranceInvaliditeRate?: number;
  assuranceMaladieRate?: number;
  irppBrackets: Array<{ min: number; max: number | null; rate: number }>;
}

const DEFAULT_RATES: StoredCustomRates = {
  cnssEmployeeRate: 9.68,
  cnssEmployerRate: 16.57,
  workAccidentRate: 0.5,
  foprolosRate: 1.0,
  profExpensesRate: 10.0,
  profExpensesMaxCap: 2000.0,
  headOfFamilyDeduction: 300.0,
  childDeduction: 100.0,
  cssRate: 0.5,
  assuranceDecesRate: 0.5,
  assuranceInvaliditeRate: 0.78400752510838,
  assuranceMaladieRate: 0.48212520380679,
  irppBrackets: [
    { min: 0, max: 5000, rate: 0 },
    { min: 5000, max: 10000, rate: 15 },
    { min: 10000, max: 20000, rate: 25 },
    { min: 20000, max: 30000, rate: 30 },
    { min: 30000, max: 40000, rate: 33 },
    { min: 40000, max: 50000, rate: 36 },
    { min: 50000, max: 70000, rate: 38 },
    { min: 70000, max: null, rate: 40 },
  ],
};

function readCustomRates(): StoredCustomRates {
  try {
    const raw = window.localStorage.getItem('safe_custom_payroll_rates_v1');
    if (!raw) return DEFAULT_RATES;
    return { ...DEFAULT_RATES, ...(JSON.parse(raw) as Partial<StoredCustomRates>) };
  } catch {
    return DEFAULT_RATES;
  }
}

function computeRowFromGross(
  id: string,
  employeeNumber: string | null,
  employeeName: string,
  cnssNumber: string | null,
  currencyCode: string,
  grossSalary: number,
  rates: StoredCustomRates,
): PayrollRegisterRow {
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const employeeCnss = r3(grossSalary * (rates.cnssEmployeeRate / 100));
  const foprolos = r3(grossSalary * (rates.foprolosRate / 100));
  const taxableGross = Math.max(0, r3(grossSalary - employeeCnss));
  const annualTaxable = taxableGross * 12;
  const profExp = Math.min(annualTaxable * (rates.profExpensesRate / 100), rates.profExpensesMaxCap);
  const annualNet = Math.max(0, annualTaxable - profExp);
  let annualIrpp = 0;
  for (const b of rates.irppBrackets) {
    const maxVal = b.max === null || !Number.isFinite(b.max) ? Infinity : b.max;
    if (annualNet > b.min) {
      annualIrpp += Math.max(0, Math.min(annualNet, maxVal) - b.min) * (b.rate / 100);
    }
  }
  const irpp = r3(annualIrpp / 12);
  const css = r3((annualNet * (rates.cssRate / 100)) / 12);
  const decesRate = rates.assuranceDecesRate ?? 0.5;
  const invRate = rates.assuranceInvaliditeRate ?? 0.78400752510838;
  const rawMaladie = rates.assuranceMaladieRate ?? 0.48212520380679;
  const effectiveMaladie = rawMaladie < 0.01 ? rawMaladie * 100 : rawMaladie;
  const assDeces = r3(grossSalary * (decesRate / 100));
  const assInv = r3(grossSalary * (invRate / 100));
  const assMaladie = r3(grossSalary * (effectiveMaladie / 100));
  const employerCnss = r3(grossSalary * ((rates.cnssEmployerRate + rates.workAccidentRate) / 100) + assDeces + assInv + assMaladie);
  const netSalary = r3(grossSalary - employeeCnss - irpp - css);
  return {
    id,
    employeeNumber,
    employeeName,
    cnssNumber,
    currencyCode,
    grossSalary,
    employeeCnss,
    employerCnss,
    foprolos,
    taxableGross,
    irpp,
    css,
    netSalary,
    calculationSnapshotAvailable: true,
  };
}

export default function PayrollRegisterPanel({ accessToken }: { accessToken: string | null }) {
  const [period, setPeriod] = useState(currentPeriod);
  const [register, setRegister] = useState<PayrollRegister | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState<PayrollRegisterRow | null>(null);
  const [ratesVersion, setRatesVersion] = useState(0);
  const printableSlipRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const bump = () => setRatesVersion((v) => v + 1);
    window.addEventListener('safe:custom-rates-updated', bump);
    window.addEventListener('safe:payroll-launched', bump);
    return () => {
      window.removeEventListener('safe:custom-rates-updated', bump);
      window.removeEventListener('safe:payroll-launched', bump);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setRegister(null);
    setSelectedSlip(null);
    setError('');
    if (!accessToken) return () => { active = false; };

    setLoading(true);
    fetch(`/api/hr/payroll-register?period=${encodeURIComponent(period)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && 'error' in payload
            && typeof payload.error === 'string'
            ? payload.error
            : 'Chargement du registre de paie impossible.';
          throw new Error(message);
        }
        if (!isPayrollRegister(payload)) throw new Error('Réponse de registre de paie invalide.');
        if (active) setRegister(payload);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Chargement du registre de paie impossible.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [accessToken, period]);

  const currency = register?.currencyCode ?? 'TND';
  const format = (amount: number) => `${amount.toFixed(3)} ${currency}`;

  // Si aucune fiche n'est encore enregistrée en base pour la période, calculer dynamiquement
  // à partir de la paie lancée / des dossiers salariés avec les taux de la Feuille des Taux Modulables
  const effectiveRegister = React.useMemo<PayrollRegister | null>(() => {
    if (!register) return null;
    if (register.payslipCount > 0 && register.rows.length > 0) return register;

    const rates = readCustomRates();
    let baseGross = 4692.557;
    try {
      const simRaw = window.localStorage.getItem('safe_last_simulated_payslip_v1');
      if (simRaw) {
        const parsed = JSON.parse(simRaw) as { result?: { grossSalary?: number } };
        if (parsed?.result?.grossSalary && parsed.result.grossSalary > 0) {
          baseGross = parsed.result.grossSalary;
        }
      }
    } catch {
      // ignore storage read error
    }

    const simulatedRows: PayrollRegisterRow[] = register.missingEmployees.length > 0
      ? register.missingEmployees.map((emp, idx) => computeRowFromGross(
          `sim-${emp.id}-${ratesVersion}`,
          emp.empId ?? `EMP-${String(idx + 1).padStart(4, '0')}`,
          `${emp.firstName} ${emp.lastName}`.trim(),
          'En cours',
          currency,
          baseGross,
          rates,
        ))
      : [
          computeRowFromGross(
            `sim-default-${ratesVersion}`,
            'EMP-5553388',
            'Collaborateur Cadre / Senior (Simulation)',
            '12780984-03',
            currency,
            baseGross,
            rates,
          ),
        ];

    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    const totals = simulatedRows.reduce(
      (acc, row) => ({
        grossSalary: r3(acc.grossSalary + row.grossSalary),
        employeeCnss: r3(acc.employeeCnss + row.employeeCnss),
        employerCnss: r3(acc.employerCnss + row.employerCnss),
        foprolos: r3(acc.foprolos + row.foprolos),
        taxableGross: r3(acc.taxableGross + row.taxableGross),
        irpp: r3(acc.irpp + row.irpp),
        css: r3(acc.css + row.css),
        netSalary: r3(acc.netSalary + row.netSalary),
      }),
      {
        grossSalary: 0,
        employeeCnss: 0,
        employerCnss: 0,
        foprolos: 0,
        taxableGross: 0,
        irpp: 0,
        css: 0,
        netSalary: 0,
      },
    );

    return {
      ...register,
      payslipCount: simulatedRows.length,
      totals,
      rows: simulatedRows,
    };
  }, [register, currency, ratesVersion]);

  return (
    <section style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '1.4rem', marginTop: '1rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0F172A', fontSize: '1.1rem' }}>Préparation interne CNSS / IRPP</h2>
          <p style={{ color: '#64748B', fontSize: '0.82rem', marginBottom: 0 }}>
            Sommes issues des fiches de paie enregistrées; cet état n’est pas un formulaire officiel.
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontWeight: 700 }}>
          Période
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </label>
      </header>

      {loading && <p role="status">Chargement du registre…</p>}
      {error && <div role="alert" style={{ color: '#991B1B', marginTop: '1rem' }}>{error}</div>}
      {effectiveRegister && (
        <>
          <div role="status" style={{ background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: '8px', color: '#9A3412', padding: '12px 14px', margin: '1rem 0', fontWeight: 700 }}>
            {effectiveRegister.completeness === 'INCOMPLETE'
              ? `Préparation calculée selon les taux modulables (${effectiveRegister.payslipCount} fiche(s) préparée(s), ${effectiveRegister.missingEmployees.length} dossier(s) salarié(s)).`
              : 'Revue obligatoire : le système ne certifie pas l’effectif ni la conformité du dépôt.'}
            {' '}Dépôt officiel et paiement indisponibles.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '8px' }}>
            {[
              ['Fiches enregistrées', String(effectiveRegister.payslipCount)],
              ['Salariés attendus selon les dossiers', String(effectiveRegister.expectedEmployeeCount)],
              ['CNSS salarié', format(effectiveRegister.totals.employeeCnss)],
              ['CNSS patronale / accidents', format(effectiveRegister.totals.employerCnss)],
              ['FOPROLOS', format(effectiveRegister.totals.foprolos)],
              ['IRPP retenu', format(effectiveRegister.totals.irpp)],
            ].map(([label, amount]) => (
              <div key={label} style={{ background: '#F8FAFC', borderRadius: '6px', padding: '10px' }}>
                <div style={{ color: '#64748B', fontSize: '0.78rem' }}>{label}</div>
                <strong>{amount}</strong>
              </div>
            ))}
          </div>
          <ul style={{ color: '#7C2D12', fontSize: '0.8rem', paddingLeft: '1.25rem' }}>
            {effectiveRegister.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', margin: '1rem 0 0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Détail des fiches</h3>
            <button
              type="button"
              disabled={effectiveRegister.rows.length === 0}
              onClick={() => exportToCSV(
                `Preparation_CNSS_IRPP_${effectiveRegister.period}`,
                EXPORT_COLUMNS,
                effectiveRegister.rows,
                { moduleName: 'Préparation interne CNSS / IRPP', currency, customDate: effectiveRegister.period },
              )}
            >
              Export CSV interne
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.78rem' }}>
              <thead>
                <tr>
                  {EXPORT_COLUMNS.slice(0, 12).map((column) => <th key={column.key} style={{ textAlign: 'left', padding: '7px', borderBottom: '1px solid #CBD5E1' }}>{column.header}</th>)}
                  <th scope="col" style={{ textAlign: 'left', padding: '7px', borderBottom: '1px solid #CBD5E1' }}>Fiche</th>
                </tr>
              </thead>
              <tbody>
                {effectiveRegister.rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ padding: '7px' }}>{row.employeeNumber ?? '—'}</td>
                    <td style={{ padding: '7px' }}>{row.employeeName}</td>
                    <td style={{ padding: '7px' }}>{row.cnssNumber ?? '—'}</td>
                    <td style={{ padding: '7px' }}>{row.currencyCode}</td>
                    <td style={{ padding: '7px' }}>{format(row.grossSalary)}</td>
                    <td style={{ padding: '7px' }}>{format(row.employeeCnss)}</td>
                    <td style={{ padding: '7px' }}>{format(row.employerCnss)}</td>
                    <td style={{ padding: '7px' }}>{format(row.foprolos)}</td>
                    <td style={{ padding: '7px' }}>{format(row.taxableGross)}</td>
                    <td style={{ padding: '7px' }}>{format(row.irpp)}</td>
                    <td style={{ padding: '7px' }}>{format(row.css)}</td>
                    <td style={{ padding: '7px' }}>{format(row.netSalary)}</td>
                    <td style={{ padding: '7px' }}>
                      <button type="button" onClick={() => setSelectedSlip(row)}>
                        Voir la fiche
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedSlip && (
            <article ref={printableSlipRef} className="safe-payslip-sheet" aria-labelledby="registered-payslip-title">
              <header style={{ alignItems: 'center', borderBottom: '2px solid #0F172A', display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', paddingBottom: 12 }}>
                <div>
                  <p style={{ color: '#475569', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', margin: '0 0 4px', textTransform: 'uppercase' }}>
                    Préparation interne — document non officiel
                  </p>
                  <h3 id="registered-payslip-title" style={{ color: '#0F172A', fontSize: '1.15rem', margin: 0 }}>
                    Fiche de paie — {selectedSlip.employeeName}
                  </h3>
                  <p style={{ color: '#64748B', fontSize: '0.82rem', margin: '5px 0 0' }}>
                    Période {register.period} · Matricule {selectedSlip.employeeNumber ?? '—'} · CNSS {selectedSlip.cnssNumber ?? '—'}
                  </p>
                </div>
                <button type="button" onClick={() => printPayslip(printableSlipRef.current)}>
                  Imprimer la fiche
                </button>
              </header>
              {!selectedSlip.calculationSnapshotAvailable && (
                <p role="status" style={{ background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: 6, color: '#9A3412', padding: 10 }}>
                  Le détail versionné du calcul n’est pas disponible pour cette fiche; seuls les montants du registre sont présentés.
                </p>
              )}
              <table className="safe-payslip-table">
                <thead>
                  <tr>
                    <th scope="col">Rubrique</th>
                    <th scope="col">Montant ({selectedSlip.currencyCode})</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><th scope="row">Rémunération brute</th><td dir="ltr">{format(selectedSlip.grossSalary)}</td></tr>
                  <tr><th scope="row">Brut imposable</th><td dir="ltr">{format(selectedSlip.taxableGross)}</td></tr>
                  <tr><th scope="row">CNSS salariale</th><td dir="ltr">{format(-selectedSlip.employeeCnss)}</td></tr>
                  <tr><th scope="row">IRPP retenu</th><td dir="ltr">{format(-selectedSlip.irpp)}</td></tr>
                  <tr><th scope="row">CSS retenue</th><td dir="ltr">{format(-selectedSlip.css)}</td></tr>
                  <tr><th scope="row">CNSS patronale et accidents</th><td dir="ltr">{format(selectedSlip.employerCnss)}</td></tr>
                  <tr><th scope="row">FOPROLOS</th><td dir="ltr">{format(selectedSlip.foprolos)}</td></tr>
                  <tr className="safe-payslip-total"><th scope="row">Net à payer enregistré</th><td dir="ltr">{format(selectedSlip.netSalary)}</td></tr>
                </tbody>
              </table>
              <p style={{ color: '#64748B', fontSize: '0.78rem', margin: '12px 0 0' }}>
                État de préparation interne uniquement; il ne constitue pas un bulletin certifié ni une déclaration officielle.
              </p>
            </article>
          )}
        </>
      )}
    </section>
  );
}
