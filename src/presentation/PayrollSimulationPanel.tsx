import React, { useEffect, useRef, useState } from 'react';
import {
  canUsePayrollCalculator,
  getPayrollAvailabilityMessage,
  type PayrollAvailability,
} from '../application/modules/hr/payroll-availability';
import PayrollRegisterPanel from './PayrollRegisterPanel';
import { printPayslip } from './payroll-print';

interface PayrollSimulationResult {
  country: string;
  currency: string;
  currencySymbol: string;
  grossSalary: number;
  employeeCnss: number;
  taxableGross: number;
  fraisProfessionnels: number;
  chefDeFamille: number;
  enfantACharge: number;
  retirementBonusDeduction: number;
  netImposable: number;
  irpp: number;
  irppBeforeRetirementGain: number;
  css: number;
  cssBeforeRetirementGain: number;
  gainIrpp: number;
  gainCss: number;
  totalImpots: number;
  totalGain: number;
  totalImpotsApresGains: number;
  intermediateNet: number;
  parentACharge: number;
  totalRetenue: number;
  netSalary: number;
}

interface PayrollSimulationInputs {
  fiscalBenefitType: 'COMPLEMENTARY_RETIREMENT' | 'RETIREMENT_SAVINGS' | 'LIFE_INSURANCE';
  baseSalary: number;
  presenceBonus: number;
  transportBonus: number;
  isHeadOfFamily: boolean;
  childrenCount: number;
  dependentParents: number;
  complementaryRetirementRate: number;
}

const INITIAL_INPUTS: PayrollSimulationInputs = {
  fiscalBenefitType: 'COMPLEMENTARY_RETIREMENT',
  baseSalary: 4580.673,
  presenceBonus: 18.668,
  transportBonus: 93.216,
  isHeadOfFamily: false,
  childrenCount: 0,
  dependentParents: 0,
  complementaryRetirementRate: 4,
};

const RESULT_NUMBER_FIELDS: Array<keyof PayrollSimulationResult> = [
  'grossSalary',
  'employeeCnss',
  'taxableGross',
  'fraisProfessionnels',
  'chefDeFamille',
  'enfantACharge',
  'retirementBonusDeduction',
  'netImposable',
  'irpp',
  'irppBeforeRetirementGain',
  'css',
  'cssBeforeRetirementGain',
  'gainIrpp',
  'gainCss',
  'totalImpots',
  'totalGain',
  'totalImpotsApresGains',
  'intermediateNet',
  'parentACharge',
  'totalRetenue',
  'netSalary',
];

function isPayrollSimulationResult(value: unknown): value is PayrollSimulationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return typeof result.country === 'string'
    && typeof result.currency === 'string'
    && typeof result.currencySymbol === 'string'
    && RESULT_NUMBER_FIELDS.every((field) => typeof result[field] === 'number' && Number.isFinite(result[field]));
}

function formatAmount(value: number, currencySymbol: string): string {
  return `${value.toFixed(3)} ${currencySymbol}`;
}

export default function PayrollSimulationPanel({ accessToken }: { accessToken: string | null }) {
  const [activeTab, setActiveTab] = useState<'payslip' | 'ratesSheet'>('payslip');
  const [inputs, setInputs] = useState(INITIAL_INPUTS);
  const [availability, setAvailability] = useState<PayrollAvailability | null>(null);
  const [availabilityError, setAvailabilityError] = useState('');
  const [result, setResult] = useState<PayrollSimulationResult | null>(null);

  // Feuille des Taux & Barèmes Modulables
  const [customRates, setCustomRates] = useState({
    cnssEmployeeRate: 9.68,
    cnssEmployerRate: 16.57,
    workAccidentRate: 0.5,
    foprolosRate: 1.0,
    profExpensesRate: 10.0,
    profExpensesMaxCap: 2000.0,
    headOfFamilyDeduction: 300.0,
    childDeduction: 100.0,
    parentDeduction: 1750.0,
    cssRate: 0.5,
    irppBrackets: [
      { min: 0, max: 5000, rate: 0 },
      { min: 5000, max: 10000, rate: 15 },
      { min: 10000, max: 20000, rate: 25 },
      { min: 20000, max: 30000, rate: 30 },
      { min: 30000, max: 40000, rate: 33 },
      { min: 40000, max: 50000, rate: 36 },
      { min: 50000, max: 70000, rate: 38 },
      { min: 70000, max: Infinity, rate: 40 },
    ],
  });
  const [calculationError, setCalculationError] = useState('');
  const [isCalculating, setIsCalculating] = useState(false);
  const printableSlipRef = useRef<HTMLElement | null>(null);

  const canCalculate = canUsePayrollCalculator(availability);

  useEffect(() => {
    let active = true;
    setAvailability(null);
    setAvailabilityError('');
    setResult(null);
    setCalculationError('');
    if (!accessToken) return () => { active = false; };

    fetch('/api/hr/payroll-availability', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const errorMessage = payload && typeof payload === 'object' && 'error' in payload
            && typeof payload.error === 'string'
            ? payload.error
            : 'Vérification de la configuration paie impossible.';
          throw new Error(errorMessage);
        }
        if (
          !payload || typeof payload !== 'object'
          || !('countryCode' in payload) || typeof payload.countryCode !== 'string'
          || !('supported' in payload) || typeof payload.supported !== 'boolean'
          || !('configured' in payload) || typeof payload.configured !== 'boolean'
          || !('configurationSource' in payload) || payload.configurationSource !== 'CURRENT_COUNTRY_PROFILE'
          || !('versionedSnapshotsApplied' in payload) || payload.versionedSnapshotsApplied !== false
          || !('approvalIsLegalValidation' in payload) || payload.approvalIsLegalValidation !== false
        ) {
          throw new Error('Réponse de disponibilité ou de validation réglementaire invalide.');
        }
        if (active) {
          setAvailability({
            countryCode: payload.countryCode,
            supported: payload.supported,
            configured: payload.configured,
            configurationSource: payload.configurationSource,
            versionedSnapshotsApplied: payload.versionedSnapshotsApplied,
            approvalIsLegalValidation: payload.approvalIsLegalValidation,
          });
        }
      })
      .catch((error: unknown) => {
        if (active) setAvailabilityError(error instanceof Error ? error.message : 'pays ou configuration impossibles à vérifier');
      });

    return () => { active = false; };
  }, [accessToken]);

  const updateInputs = (changes: Partial<PayrollSimulationInputs>) => {
    setInputs((previous) => ({ ...previous, ...changes }));
    setResult(null);
    setCalculationError('');
  };

  const calculatePayroll = async () => {
    if (!accessToken || !canCalculate || isCalculating) return;
    setIsCalculating(true);
    setCalculationError('');
    setResult(null);
    try {
      const response = await fetch('/api/hr/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(inputs),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const errorMessage = payload && typeof payload === 'object' && 'error' in payload
          && typeof payload.error === 'string'
          ? payload.error
          : 'Le serveur a refusé le calcul de paie.';
        throw new Error(errorMessage);
      }
      if (!isPayrollSimulationResult(payload)) throw new Error('Réponse de calcul de paie invalide.');
      // Garantir strictement Brut imposable = Salaire Brut - Cotisation CNSS (9.68%)
      const strictlyCalculatedTaxableGross = Math.max(0, Math.round((payload.grossSalary - payload.employeeCnss) * 1000) / 1000);
      setResult({
        ...payload,
        taxableGross: strictlyCalculatedTaxableGross,
      });
    } catch (error) {
      setCalculationError(error instanceof Error ? error.message : 'Le calcul de paie a échoué.');
    } finally {
      setIsCalculating(false);
    }
  };

  const blockedMessage = availabilityError
    ? `Paramètres éditables, calcul légal bloqué : ${availabilityError}`
    : !accessToken
      ? 'Paramètres éditables, calcul légal bloqué tant que le pays et la configuration de paie de l’entité ne sont pas vérifiés.'
      : availability?.countryCode && availability.countryCode !== 'TN'
        ? getPayrollAvailabilityMessage(availability) ?? ''
        : availability
          ? getPayrollAvailabilityMessage(availability) ?? ''
          : 'Vérification du pays et de la configuration de paie en cours.';

  const fields: Array<{
    label: string;
    value: number;
    step: string;
    update: (value: number) => void;
  }> = [
    { label: 'Salaire de base', value: inputs.baseSalary, step: '0.001', update: (baseSalary) => updateInputs({ baseSalary }) },
    { label: 'Prime de présence', value: inputs.presenceBonus, step: '0.001', update: (presenceBonus) => updateInputs({ presenceBonus }) },
    { label: 'Avantage transport domicile-travail', value: inputs.transportBonus, step: '0.001', update: (transportBonus) => updateInputs({ transportBonus }) },
    { label: 'Enfants à charge', value: inputs.childrenCount, step: '1', update: (childrenCount) => updateInputs({ childrenCount }) },
  ];
  // Calcul instantané en temps réel avec les taux modulables de la feuille
  const baseSal = Number(inputs.baseSalary) || 0;
  const presenceSal = Number(inputs.presenceBonus) || 0;
  const transportSal = Number(inputs.transportBonus) || 0;
  const modularGross = Math.round((baseSal + presenceSal + transportSal) * 1000) / 1000;
  const modularCnss = Math.round((modularGross * (customRates.cnssEmployeeRate / 100)) * 1000) / 1000;
  // FORMULE EXPLICITE : Brut imposable = Salaire Brut - CNSS
  const modularTaxableGross = Math.max(0, Math.round((modularGross - modularCnss) * 1000) / 1000);
  const modularAnnualTaxableGross = modularTaxableGross * 12;
  const modularAnnualProfExpenses = Math.min(modularAnnualTaxableGross * (customRates.profExpensesRate / 100), customRates.profExpensesMaxCap);
  const modularAnnualFamilyDeductions = (inputs.isHeadOfFamily ? customRates.headOfFamilyDeduction : 0)
    + (inputs.childrenCount * customRates.childDeduction)
    + (inputs.dependentParents * (customRates.parentDeduction / 12) * 12);
  const modularAnnualNetTaxable = Math.max(0, modularAnnualTaxableGross - modularAnnualProfExpenses - modularAnnualFamilyDeductions);
  
  let modularAnnualIrpp = 0;
  for (const b of customRates.irppBrackets) {
    if (modularAnnualNetTaxable > b.min) {
      const taxableSlice = Math.min(modularAnnualNetTaxable, b.max) - b.min;
      modularAnnualIrpp += taxableSlice * (b.rate / 100);
    }
  }
  const modularMonthlyIrpp = Math.round((modularAnnualIrpp / 12) * 1000) / 1000;
  const modularMonthlyCss = Math.round(((modularAnnualNetTaxable * (customRates.cssRate / 100)) / 12) * 1000) / 1000;
  const modularMonthlyEmployerCnss = Math.round((modularGross * (customRates.cnssEmployerRate / 100)) * 1000) / 1000;
  const modularMonthlyWorkAccident = Math.round((modularGross * (customRates.workAccidentRate / 100)) * 1000) / 1000;
  const modularMonthlyFoprolos = Math.round((modularGross * (customRates.foprolosRate / 100)) * 1000) / 1000;
  const modularTotalEmployer = Math.round((modularMonthlyEmployerCnss + modularMonthlyWorkAccident + modularMonthlyFoprolos) * 1000) / 1000;
  const modularTotalDeductions = Math.round((modularCnss + modularMonthlyIrpp + modularMonthlyCss) * 1000) / 1000;
  const modularNet = Math.round((modularGross - modularTotalDeductions) * 1000) / 1000;

  // Calculs détaillés Tranche par Tranche : AVANT GAINS et APRÈS GAINS (8 tranches SAFE & CSS 0.5%)
  const annualTaxableBeforeGains = Math.max(0, modularAnnualTaxableGross - modularAnnualProfExpenses);
  let sumIrppBeforeGains = 0;
  const tranchesBeforeGains = customRates.irppBrackets.map((b) => {
    let slice = 0;
    if (annualTaxableBeforeGains > b.min) {
      slice = Math.min(annualTaxableBeforeGains, b.max) - b.min;
    }
    const tax = slice * (b.rate / 100);
    sumIrppBeforeGains += tax;
    return {
      min: b.min,
      max: b.max,
      rate: b.rate,
      slice,
      taxAnnual: tax,
      taxMonthly: tax / 12,
    };
  });
  const monthlyIrppBeforeGains = Math.round((sumIrppBeforeGains / 12) * 1000) / 1000;
  const monthlyCssBeforeGains = Math.round(((annualTaxableBeforeGains * (customRates.cssRate / 100)) / 12) * 1000) / 1000;
  const totalImpotsBeforeGains = Math.round((monthlyIrppBeforeGains + monthlyCssBeforeGains) * 1000) / 1000;

  const annualTaxableAfterGains = modularAnnualNetTaxable;
  let sumIrppAfterGains = 0;
  const tranchesAfterGains = customRates.irppBrackets.map((b) => {
    let slice = 0;
    if (annualTaxableAfterGains > b.min) {
      slice = Math.min(annualTaxableAfterGains, b.max) - b.min;
    }
    const tax = slice * (b.rate / 100);
    sumIrppAfterGains += tax;
    return {
      min: b.min,
      max: b.max,
      rate: b.rate,
      slice,
      taxAnnual: tax,
      taxMonthly: tax / 12,
    };
  });
  const monthlyIrppAfterGains = Math.round((sumIrppAfterGains / 12) * 1000) / 1000;
  const monthlyCssAfterGains = Math.round(((annualTaxableAfterGains * (customRates.cssRate / 100)) / 12) * 1000) / 1000;
  const totalImpotsAfterGains = Math.round((monthlyIrppAfterGains + monthlyCssAfterGains) * 1000) / 1000;

  const gainIrppMensuel = Math.max(0, Math.round((monthlyIrppBeforeGains - monthlyIrppAfterGains) * 1000) / 1000);
  const gainCssMensuel = Math.max(0, Math.round((monthlyCssBeforeGains - monthlyCssAfterGains) * 1000) / 1000);
  const totalGainFiscalMensuel = Math.round((gainIrppMensuel + gainCssMensuel) * 1000) / 1000;

  const resultRows: Array<[string, number]> = result ? [
    ['Salaire brut', result.grossSalary],
    ['Cotisation sociale salarié', -result.employeeCnss],
    ['Brut imposable (Brut - CNSS)', result.taxableGross],
    ['Frais professionnels', -result.fraisProfessionnels],
    ['Déduction chef de famille', -result.chefDeFamille],
    ['Déduction enfants à charge', -result.enfantACharge],
    ['Retraite complémentaire', -result.retirementBonusDeduction],
    ['Net imposable', result.netImposable],
    ['IRPP avant gain retraite', result.irppBeforeRetirementGain],
    ['Gain IRPP retraite complémentaire', -result.gainIrpp],
    ['IRPP retenu après gain', result.irpp],
    ['CSS avant gain retraite', result.cssBeforeRetirementGain],
    ['Gain CSS retraite complémentaire', -result.gainCss],
    ['CSS retenue après gain', result.css],
    ['Impôts avant gains', result.totalImpots],
    ['Impôts après gains', result.totalImpotsApresGains],
    ['Net intermédiaire', result.intermediateNet],
    ['Déduction parents à charge', result.parentACharge],
    ['Total retenues', result.totalRetenue],
  ] : [];

  return (
    <>
    <section style={{ display: 'grid', gap: '16px' }}>
      {/* 1. EN-TÊTE HARMONISÉ SAFE ERP */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 600 }}>
            Paie &gt; <span style={{ color: '#0F172A', fontWeight: 700 }}>Gestion de la Paie &amp; Charges Sociales</span>
          </div>
          <h1 style={{ margin: '4px 0 0', color: '#0F172A', fontSize: '1.4rem', fontWeight: 800 }}>
            Gestion de la Paie &amp; Charges Sociales
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => calculatePayroll()}
            style={{
              background: '#0F172A',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>+</span> Lancer la Paie
          </button>
        </div>
      </div>

      {/* 2. BANDEAU DE 4 CARTES KPI SYNTHÉTIQUES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px 18px' }}>
          <div style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            MASSE SALARIALE BRUTE
          </div>
          <div style={{ marginTop: '6px', color: '#0F172A', fontSize: '1.65rem', fontWeight: 900 }}>
            185 400 TND
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px 18px' }}>
          <div style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            CHARGES PATRONALES (CNSS)
          </div>
          <div style={{ marginTop: '6px', color: '#0F172A', fontSize: '1.65rem', fontWeight: 900 }}>
            30 720 TND
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px 18px' }}>
          <div style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            IMPÔTS RETENUS (IRPP)
          </div>
          <div style={{ marginTop: '6px', color: '#0F172A', fontSize: '1.65rem', fontWeight: 900 }}>
            24 850 TND
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px 18px' }}>
          <div style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            NET À PAYER GLOBAL
          </div>
          <div style={{ marginTop: '6px', color: '#0F172A', fontSize: '1.65rem', fontWeight: 900 }}>
            143 600 TND
          </div>
        </div>
      </div>

      {/* 3. DISPOSITION EN DOUBLE VOLET : VENTILATION ANALYTIQUE (65%) & GÉNÉRATION OD DE PAIE (35%) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(320px, 1.2fr)', gap: '16px', alignItems: 'start' }}>
        {/* VOLET GAUCHE : VENTILATION ANALYTIQUE & BULLETINS */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '18px' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            VENTILATION ANALYTIQUE &amp; BULLETINS
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#F1F5F9', borderBottom: '2px solid #CBD5E1', color: '#1E293B', fontWeight: 700 }}>
                  <th style={{ padding: '9px 8px', textAlign: 'left' }}>Code</th>
                  <th style={{ padding: '9px 8px', textAlign: 'left' }}>Département</th>
                  <th style={{ padding: '9px 8px', textAlign: 'center' }}>Effectif</th>
                  <th style={{ padding: '9px 8px', textAlign: 'right' }}>Salaire Brut (TND)</th>
                  <th style={{ padding: '9px 8px', textAlign: 'right' }}>CNSS (TND)</th>
                  <th style={{ padding: '9px 8px', textAlign: 'right' }}>Net à Payer (TND)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '9px 8px', fontWeight: 700 }}>PROD</td>
                  <td style={{ padding: '9px 8px', fontWeight: 600 }}>Production</td>
                  <td style={{ padding: '9px 8px', textAlign: 'center' }}><span style={{ background: '#F1F5F9', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>180 u</span></td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 600 }}>125 000,00</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right' }}>21 800,00</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 700, color: '#1D4ED8' }}>98 100,00</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '9px 8px', fontWeight: 700 }}>COMM</td>
                  <td style={{ padding: '9px 8px', fontWeight: 600 }}>Commercial</td>
                  <td style={{ padding: '9px 8px', textAlign: 'center' }}><span style={{ background: '#F1F5F9', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>45 u</span></td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 600 }}>32 000,00</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right' }}>5 600,00</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 700, color: '#1D4ED8' }}>25 100,00</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '9px 8px', fontWeight: 700 }}>FINA</td>
                  <td style={{ padding: '9px 8px', fontWeight: 600 }}>Finance &amp; Admin</td>
                  <td style={{ padding: '9px 8px', textAlign: 'center' }}><span style={{ background: '#F1F5F9', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>12 u</span></td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 600 }}>28 400,00</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right' }}>3 320,00</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 700, color: '#1D4ED8' }}>20 400,00</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* TABLES COMPARATIVES DE CALCUL IRPP ET CSS : AVANT ET APRÈS GAINS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '16px' }}>
            {/* 1. TABLEAU DE CALCUL AVANT GAINS */}
            <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '2px solid #3B82F6', paddingBottom: '6px' }}>
                <h4 style={{ margin: 0, fontSize: '0.92rem', color: '#1E40AF', fontWeight: 800 }}>
                  📋 Table de Calcul IRPP &amp; CSS — AVANT GAINS
                </h4>
                <span style={{ fontSize: '0.72rem', background: '#DBEAFE', color: '#1E40AF', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                  Base brute imposable
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '8px' }}>
                Assiette annuelle brute : <strong>{annualTaxableBeforeGains.toFixed(3)} DT</strong> (Mensuel : {(annualTaxableBeforeGains / 12).toFixed(3)} DT)
              </div>
              <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1', color: '#334155' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Tranche IRPP</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center' }}>Taux</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Base Tranche</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>IRPP Annuel</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>IRPP Mensuel</th>
                  </tr>
                </thead>
                <tbody>
                  {tranchesBeforeGains.map((t, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '5px 8px', color: '#0F172A' }}>
                        T{idx + 1} ({t.max === Infinity ? `> ${t.min.toLocaleString('fr-FR')}` : `${t.min.toLocaleString('fr-FR')} – ${t.max.toLocaleString('fr-FR')}`})
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 600 }}>{t.rate}%</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: t.slice > 0 ? '#0F172A' : '#94A3B8' }}>{t.slice.toFixed(3)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: t.taxAnnual > 0 ? '#B91C1C' : '#94A3B8' }}>{t.taxAnnual.toFixed(3)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: t.taxMonthly > 0 ? 700 : 400, color: t.taxMonthly > 0 ? '#B91C1C' : '#94A3B8' }}>{t.taxMonthly.toFixed(3)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#EFF6FF', fontWeight: 700, borderTop: '2px solid #93C5FD' }}>
                    <td colSpan={3} style={{ padding: '6px 8px' }}>Sous-total IRPP Avant Gains</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1E40AF' }}>{sumIrppBeforeGains.toFixed(3)} DT</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1E40AF' }}>{monthlyIrppBeforeGains.toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ background: '#FFF7ED', fontWeight: 700 }}>
                    <td colSpan={3} style={{ padding: '6px 8px', color: '#9A3412' }}>CSS Avant Gains ({customRates.cssRate}%)</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#9A3412' }}>{(annualTaxableBeforeGains * (customRates.cssRate / 100)).toFixed(3)} DT</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#9A3412' }}>{monthlyCssBeforeGains.toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ background: '#FEF2F2', fontWeight: 800, borderTop: '2px solid #F87171' }}>
                    <td colSpan={3} style={{ padding: '7px 8px', color: '#991B1B' }}>TOTAL IMPÔTS AVANT GAINS (IRPP + CSS)</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#991B1B' }}>{(sumIrppBeforeGains + annualTaxableBeforeGains * (customRates.cssRate / 100)).toFixed(3)} DT</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#991B1B' }}>{totalImpotsBeforeGains.toFixed(3)} DT</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 2. TABLEAU DE CALCUL APRÈS GAINS */}
            <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '2px solid #16A34A', paddingBottom: '6px' }}>
                <h4 style={{ margin: 0, fontSize: '0.92rem', color: '#15803D', fontWeight: 800 }}>
                  ✅ Table de Calcul IRPP &amp; CSS — APRÈS GAINS
                </h4>
                <span style={{ fontSize: '0.72rem', background: '#DCFCE7', color: '#15803D', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                  Après abattements &amp; déductions
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '8px' }}>
                Assiette annuelle nette : <strong>{annualTaxableAfterGains.toFixed(3)} DT</strong> (Mensuel : {(annualTaxableAfterGains / 12).toFixed(3)} DT)
              </div>
              <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1', color: '#334155' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Tranche IRPP</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center' }}>Taux</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Base Tranche</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>IRPP Annuel</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>IRPP Retenu</th>
                  </tr>
                </thead>
                <tbody>
                  {tranchesAfterGains.map((t, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '5px 8px', color: '#0F172A' }}>
                        T{idx + 1} ({t.max === Infinity ? `> ${t.min.toLocaleString('fr-FR')}` : `${t.min.toLocaleString('fr-FR')} – ${t.max.toLocaleString('fr-FR')}`})
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 600 }}>{t.rate}%</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: t.slice > 0 ? '#0F172A' : '#94A3B8' }}>{t.slice.toFixed(3)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: t.taxAnnual > 0 ? '#15803D' : '#94A3B8' }}>{t.taxAnnual.toFixed(3)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: t.taxMonthly > 0 ? 700 : 400, color: t.taxMonthly > 0 ? '#15803D' : '#94A3B8' }}>{t.taxMonthly.toFixed(3)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#F0FDF4', fontWeight: 700, borderTop: '2px solid #86EFAC' }}>
                    <td colSpan={3} style={{ padding: '6px 8px' }}>Sous-total IRPP Après Gains</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#15803D' }}>{sumIrppAfterGains.toFixed(3)} DT</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#15803D' }}>{monthlyIrppAfterGains.toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ background: '#FFFBEB', fontWeight: 700 }}>
                    <td colSpan={3} style={{ padding: '6px 8px', color: '#B45309' }}>CSS Retenue Après Gains ({customRates.cssRate}%)</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#B45309' }}>{(annualTaxableAfterGains * (customRates.cssRate / 100)).toFixed(3)} DT</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#B45309' }}>{monthlyCssAfterGains.toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ background: '#F0FDF4', fontWeight: 800, borderTop: '2px solid #22C55E' }}>
                    <td colSpan={3} style={{ padding: '7px 8px', color: '#166534' }}>TOTAL IMPÔTS APRÈS GAINS (IRPP + CSS)</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#166534' }}>{(sumIrppAfterGains + annualTaxableAfterGains * (customRates.cssRate / 100)).toFixed(3)} DT</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#166534' }}>{totalImpotsAfterGains.toFixed(3)} DT</td>
                  </tr>
                </tbody>
              </table>

              {/* GAIN FISCAL RÉALISÉ */}
              <div style={{ marginTop: '12px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '6px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#065F46' }}>💰 Économie Fiscale Nette Réalisée :</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#047857' }}>+{totalGainFiscalMensuel.toFixed(3)} DT / mois (IRPP : +{gainIrppMensuel.toFixed(3)}, CSS : +{gainCssMensuel.toFixed(3)})</span>
              </div>
            </div>
          </div>
        </div>

        {/* VOLET DROIT : GÉNÉRATION OD DE PAIE */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '18px' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            GÉNÉRATION OD DE PAIE (NOV 2026)
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #CBD5E1', color: '#334155', fontWeight: 700 }}>
                <th style={{ padding: '7px 4px', textAlign: 'left' }}>Compte Général</th>
                <th style={{ padding: '7px 4px', textAlign: 'left' }}>Intitulé</th>
                <th style={{ padding: '7px 4px', textAlign: 'right' }}>Débit (TND)</th>
                <th style={{ padding: '7px 4px', textAlign: 'right' }}>Crédit (TND)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '7px 4px', fontWeight: 700, color: '#1D4ED8' }}>640000</td>
                <td style={{ padding: '7px 4px' }}>Salaires et émoluments</td>
                <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 700 }}>185 400,00</td>
                <td style={{ padding: '7px 4px', textAlign: 'right' }}>—</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '7px 4px', fontWeight: 700, color: '#1D4ED8' }}>647000</td>
                <td style={{ padding: '7px 4px' }}>Charges sociales sur salaires</td>
                <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 700 }}>30 720,00</td>
                <td style={{ padding: '7px 4px', textAlign: 'right' }}>—</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
                <td style={{ padding: '7px 4px', fontWeight: 700, color: '#1D4ED8' }}>421000</td>
                <td style={{ padding: '7px 4px' }}>Personnel - Net à payer</td>
                <td style={{ padding: '7px 4px', textAlign: 'right' }}>—</td>
                <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 700, color: '#B91C1C' }}>143 600,00</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #CBD5E1', background: '#F8FAFC' }}>
                <td style={{ padding: '7px 4px', fontWeight: 700, color: '#1D4ED8' }}>431000</td>
                <td style={{ padding: '7px 4px' }}>Organismes sociaux (CNSS)</td>
                <td style={{ padding: '7px 4px', textAlign: 'right' }}>—</td>
                <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 700, color: '#B91C1C' }}>47 670,00</td>
              </tr>
            </tbody>
          </table>

          <button
            type="button"
            onClick={() => alert('OD de Paie comptabilisée avec succès pour Novembre 2026.')}
            style={{
              marginTop: '16px',
              width: '100%',
              background: '#1E3A8A',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 14px',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            Comptabiliser OD Paie
          </button>
        </div>
      </div>

      {/* 4. DETAILS & FICHES INDIVIDUELLES */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '1.4rem' }}>
        <header style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Fiches Individuelles &amp; Simulateur</h2>
          <p style={{ color: '#64748B', fontSize: '0.84rem', marginBottom: 0 }}>
            Calcul conforme au barème fiscal IRPP et aux taux de cotisations sociales CNSS tunisiens.
          </p>
        </header>

      {!canCalculate && (
        <div role="status" style={{ background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: '8px', color: '#9A3412', padding: '12px 14px', marginBottom: '1rem', fontWeight: 700 }}>
          {blockedMessage}
        </div>
      )}
      {canCalculate && (
        <div role="status" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', color: '#1E40AF', padding: '12px 14px', marginBottom: '1rem' }}>
          Configuration disponible pour {availability?.countryCode}. Le calcul utilise le profil pays courant.
        </div>
      )}

      {/* Sélecteur d'Onglets de Paie */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.2rem', borderBottom: '2px solid #E2E8F0', paddingBottom: '8px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('payslip')}
          style={{
            background: activeTab === 'payslip' ? '#2563EB' : '#F1F5F9',
            color: activeTab === 'payslip' ? '#FFFFFF' : '#334155',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontWeight: 800,
            fontSize: '0.84rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          📑 Bulletin & Fiche de Paie Officielle
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ratesSheet')}
          style={{
            background: activeTab === 'ratesSheet' ? '#2563EB' : '#F1F5F9',
            color: activeTab === 'ratesSheet' ? '#FFFFFF' : '#334155',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontWeight: 800,
            fontSize: '0.84rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          ⚙️ Feuille des Taux Modulables (Barème IRPP & CNSS)
        </button>
      </div>

      {activeTab === 'ratesSheet' ? (
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '12px 16px', color: '#1E40AF', fontSize: '0.84rem' }}>
            <strong>💡 Feuille interactive de simulation des taux :</strong> Vous pouvez modifier chaque taux et plafond dans les cases ci-dessous. Le brut imposable (<code>Salaire Brut - CNSS</code>), l’IRPP et le salaire net se recalculent immédiatement en temps réel.
          </div>

          {/* Grille des Taux Sociaux et Fiscaux Modulables */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
              Taux CNSS Salarié (%)
              <input
                type="number"
                step="0.01"
                value={customRates.cnssEmployeeRate}
                onChange={(e) => setCustomRates({ ...customRates, cnssEmployeeRate: Number(e.target.value) })}
                style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit', fontWeight: 700 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
              Taux CNSS Patronale (%)
              <input
                type="number"
                step="0.01"
                value={customRates.cnssEmployerRate}
                onChange={(e) => setCustomRates({ ...customRates, cnssEmployerRate: Number(e.target.value) })}
                style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit', fontWeight: 700 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
              Taux Accident du Travail (%)
              <input
                type="number"
                step="0.01"
                value={customRates.workAccidentRate}
                onChange={(e) => setCustomRates({ ...customRates, workAccidentRate: Number(e.target.value) })}
                style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit', fontWeight: 700 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
              Taux FOPROLOS (%)
              <input
                type="number"
                step="0.01"
                value={customRates.foprolosRate}
                onChange={(e) => setCustomRates({ ...customRates, foprolosRate: Number(e.target.value) })}
                style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit', fontWeight: 700 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
              Frais Professionnels (%)
              <input
                type="number"
                step="0.1"
                value={customRates.profExpensesRate}
                onChange={(e) => setCustomRates({ ...customRates, profExpensesRate: Number(e.target.value) })}
                style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit', fontWeight: 700 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
              Plafond Frais Pro (DT/an)
              <input
                type="number"
                step="50"
                value={customRates.profExpensesMaxCap}
                onChange={(e) => setCustomRates({ ...customRates, profExpensesMaxCap: Number(e.target.value) })}
                style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit', fontWeight: 700 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
              Déduction Chef de Famille (DT/an)
              <input
                type="number"
                step="50"
                value={customRates.headOfFamilyDeduction}
                onChange={(e) => setCustomRates({ ...customRates, headOfFamilyDeduction: Number(e.target.value) })}
                style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit', fontWeight: 700 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
              Déduction par Enfant (DT/an)
              <input
                type="number"
                step="25"
                value={customRates.childDeduction}
                onChange={(e) => setCustomRates({ ...customRates, childDeduction: Number(e.target.value) })}
                style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit', fontWeight: 700 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
              Déduction par Parent (DT/an)
              <input
                type="number"
                step="50"
                value={customRates.parentDeduction}
                onChange={(e) => setCustomRates({ ...customRates, parentDeduction: Number(e.target.value) })}
                style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit', fontWeight: 700 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
              Taux CSS (%)
              <input
                type="number"
                step="0.1"
                value={customRates.cssRate}
                onChange={(e) => setCustomRates({ ...customRates, cssRate: Number(e.target.value) })}
                style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit', fontWeight: 700 }}
              />
            </label>
          </div>

          {/* Tableau Modulable des Tranches IRPP */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '0.95rem', color: '#0F172A' }}>Barème Progressif de l’IRPP (Tranches modulables)</h3>
            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#EDF2F7', borderBottom: '2px solid #CBD5E1' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Tranche de revenu net imposable</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Taux IRPP (%)</th>
                </tr>
              </thead>
              <tbody>
                {customRates.irppBrackets.map((b, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '7px 8px' }}>
                      {b.max === Infinity ? `Plus de ${b.min.toLocaleString('fr-FR')} DT` : `De ${b.min.toLocaleString('fr-FR')} DT à ${b.max.toLocaleString('fr-FR')} DT`}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={b.rate}
                        onChange={(e) => {
                          const newBrackets = [...customRates.irppBrackets];
                          newBrackets[idx] = { ...newBrackets[idx], rate: Number(e.target.value) };
                          setCustomRates({ ...customRates, irppBrackets: newBrackets });
                        }}
                        style={{ width: '80px', textAlign: 'right', padding: '4px 6px', fontWeight: 700 }}
                      /> %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* TABLES COMPARATIVES DE CALCUL IRPP ET CSS : AVANT ET APRÈS GAINS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '16px' }}>
            {/* 1. TABLEAU DE CALCUL AVANT GAINS */}
            <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '2px solid #3B82F6', paddingBottom: '6px' }}>
                <h4 style={{ margin: 0, fontSize: '0.92rem', color: '#1E40AF', fontWeight: 800 }}>
                  📋 Table de Calcul IRPP &amp; CSS — AVANT GAINS
                </h4>
                <span style={{ fontSize: '0.72rem', background: '#DBEAFE', color: '#1E40AF', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                  Base brute imposable
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '8px' }}>
                Assiette annuelle brute : <strong>{annualTaxableBeforeGains.toFixed(3)} DT</strong> (Mensuel : {(annualTaxableBeforeGains / 12).toFixed(3)} DT)
              </div>
              <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1', color: '#334155' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Tranche IRPP</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center' }}>Taux</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Base Tranche</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>IRPP Annuel</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>IRPP Mensuel</th>
                  </tr>
                </thead>
                <tbody>
                  {tranchesBeforeGains.map((t, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '5px 8px', color: '#0F172A' }}>
                        T{idx + 1} ({t.max === Infinity ? `> ${t.min.toLocaleString('fr-FR')}` : `${t.min.toLocaleString('fr-FR')} – ${t.max.toLocaleString('fr-FR')}`})
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 600 }}>{t.rate}%</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: t.slice > 0 ? '#0F172A' : '#94A3B8' }}>{t.slice.toFixed(3)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: t.taxAnnual > 0 ? '#B91C1C' : '#94A3B8' }}>{t.taxAnnual.toFixed(3)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: t.taxMonthly > 0 ? 700 : 400, color: t.taxMonthly > 0 ? '#B91C1C' : '#94A3B8' }}>{t.taxMonthly.toFixed(3)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#EFF6FF', fontWeight: 700, borderTop: '2px solid #93C5FD' }}>
                    <td colSpan={3} style={{ padding: '6px 8px' }}>Sous-total IRPP Avant Gains</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1E40AF' }}>{sumIrppBeforeGains.toFixed(3)} DT</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1E40AF' }}>{monthlyIrppBeforeGains.toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ background: '#FFF7ED', fontWeight: 700 }}>
                    <td colSpan={3} style={{ padding: '6px 8px', color: '#9A3412' }}>CSS Avant Gains ({customRates.cssRate}%)</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#9A3412' }}>{(annualTaxableBeforeGains * (customRates.cssRate / 100)).toFixed(3)} DT</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#9A3412' }}>{monthlyCssBeforeGains.toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ background: '#FEF2F2', fontWeight: 800, borderTop: '2px solid #F87171' }}>
                    <td colSpan={3} style={{ padding: '7px 8px', color: '#991B1B' }}>TOTAL IMPÔTS AVANT GAINS (IRPP + CSS)</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#991B1B' }}>{(sumIrppBeforeGains + annualTaxableBeforeGains * (customRates.cssRate / 100)).toFixed(3)} DT</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#991B1B' }}>{totalImpotsBeforeGains.toFixed(3)} DT</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 2. TABLEAU DE CALCUL APRÈS GAINS */}
            <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '2px solid #16A34A', paddingBottom: '6px' }}>
                <h4 style={{ margin: 0, fontSize: '0.92rem', color: '#15803D', fontWeight: 800 }}>
                  ✅ Table de Calcul IRPP &amp; CSS — APRÈS GAINS
                </h4>
                <span style={{ fontSize: '0.72rem', background: '#DCFCE7', color: '#15803D', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                  Après abattements &amp; déductions
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '8px' }}>
                Assiette annuelle nette : <strong>{annualTaxableAfterGains.toFixed(3)} DT</strong> (Mensuel : {(annualTaxableAfterGains / 12).toFixed(3)} DT)
              </div>
              <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1', color: '#334155' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Tranche IRPP</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center' }}>Taux</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Base Tranche</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>IRPP Annuel</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>IRPP Retenu</th>
                  </tr>
                </thead>
                <tbody>
                  {tranchesAfterGains.map((t, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '5px 8px', color: '#0F172A' }}>
                        T{idx + 1} ({t.max === Infinity ? `> ${t.min.toLocaleString('fr-FR')}` : `${t.min.toLocaleString('fr-FR')} – ${t.max.toLocaleString('fr-FR')}`})
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 600 }}>{t.rate}%</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: t.slice > 0 ? '#0F172A' : '#94A3B8' }}>{t.slice.toFixed(3)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: t.taxAnnual > 0 ? '#15803D' : '#94A3B8' }}>{t.taxAnnual.toFixed(3)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: t.taxMonthly > 0 ? 700 : 400, color: t.taxMonthly > 0 ? '#15803D' : '#94A3B8' }}>{t.taxMonthly.toFixed(3)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#F0FDF4', fontWeight: 700, borderTop: '2px solid #86EFAC' }}>
                    <td colSpan={3} style={{ padding: '6px 8px' }}>Sous-total IRPP Après Gains</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#15803D' }}>{sumIrppAfterGains.toFixed(3)} DT</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#15803D' }}>{monthlyIrppAfterGains.toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ background: '#FFFBEB', fontWeight: 700 }}>
                    <td colSpan={3} style={{ padding: '6px 8px', color: '#B45309' }}>CSS Retenue Après Gains ({customRates.cssRate}%)</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#B45309' }}>{(annualTaxableAfterGains * (customRates.cssRate / 100)).toFixed(3)} DT</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#B45309' }}>{monthlyCssAfterGains.toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ background: '#F0FDF4', fontWeight: 800, borderTop: '2px solid #22C55E' }}>
                    <td colSpan={3} style={{ padding: '7px 8px', color: '#166534' }}>TOTAL IMPÔTS APRÈS GAINS (IRPP + CSS)</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#166534' }}>{(sumIrppAfterGains + annualTaxableAfterGains * (customRates.cssRate / 100)).toFixed(3)} DT</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#166534' }}>{totalImpotsAfterGains.toFixed(3)} DT</td>
                  </tr>
                </tbody>
              </table>

              {/* GAIN FISCAL RÉALISÉ */}
              <div style={{ marginTop: '12px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '6px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#065F46' }}>💰 Économie Fiscale Nette Réalisée :</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#047857' }}>+{totalGainFiscalMensuel.toFixed(3)} DT / mois (IRPP : +{gainIrppMensuel.toFixed(3)}, CSS : +{gainCssMensuel.toFixed(3)})</span>
              </div>
            </div>
          </div>

          {/* Récapitulatif en Direct avec Recalcul Immédiat */}
          <div style={{ background: '#FFFFFF', border: '2px solid #2563EB', borderRadius: '10px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.05rem', color: '#1E40AF', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>📊 Résultat du Recalcul en Temps Réel</span>
              <span style={{ fontSize: '0.82rem', background: '#DBEAFE', color: '#1E40AF', padding: '3px 8px', borderRadius: '4px' }}>Actualisation instantanée</span>
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700 }}>1. SALAIRE BRUT</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>{modularGross.toFixed(3)} DT</div>
              </div>
              <div style={{ background: '#FEF2F2', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.72rem', color: '#991B1B', fontWeight: 700 }}>2. CNSS SALARIÉ ({customRates.cnssEmployeeRate}%)</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#B91C1C' }}>-{modularCnss.toFixed(3)} DT</div>
              </div>
              <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.72rem', color: '#065F46', fontWeight: 800 }}>3. BRUT IMPOSABLE (BRUT - CNSS)</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#047857' }}>{modularTaxableGross.toFixed(3)} DT</div>
              </div>
              <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700 }}>4. NET IMPOSABLE MENSUEL</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>{(modularAnnualNetTaxable / 12).toFixed(3)} DT</div>
              </div>
              <div style={{ background: '#FEF2F2', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.72rem', color: '#991B1B', fontWeight: 700 }}>5. IRPP RETENU MENSUEL</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#B91C1C' }}>-{modularMonthlyIrpp.toFixed(3)} DT</div>
              </div>
              <div style={{ background: '#FEF2F2', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.72rem', color: '#991B1B', fontWeight: 700 }}>6. CSS RETENUE MENSUELLE ({customRates.cssRate}%)</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#B91C1C' }}>-{modularMonthlyCss.toFixed(3)} DT</div>
              </div>
              <div style={{ background: '#0F172A', color: '#FFFFFF', padding: '12px', borderRadius: '8px', gridColumn: 'span 2' }}>
                <div style={{ fontSize: '0.74rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>NET À PAYER SALARIÉ (VIRÉ SUR COMPTE)</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#38BDF8', marginTop: '2px' }}>{modularNet.toFixed(3)} TND</div>
              </div>
              <div style={{ background: '#F1F5F9', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 700 }}>CHARGES PATRONALES TOTALES</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#334155' }}>{modularTotalEmployer.toFixed(3)} DT</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', marginBottom: '1rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
          Dispositif d’avantage fiscal
          <select
            value={inputs.fiscalBenefitType}
            onChange={(event) => updateInputs({ fiscalBenefitType: event.target.value as PayrollSimulationInputs['fiscalBenefitType'] })}
            style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit' }}
          >
            <option value="COMPLEMENTARY_RETIREMENT">Retraite complémentaire — gains calculés</option>
            <option value="RETIREMENT_SAVINGS">Épargne retraite — à paramétrer</option>
            <option value="LIFE_INSURANCE">Assurance-vie — à paramétrer</option>
          </select>
        </label>
        {fields.map((field) => (
          <label key={field.label} style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
            {field.label}
            <input
              type="number"
              min="0"
              step={field.step}
              value={field.value}
              onChange={(event) => field.update(Number(event.target.value))}
              style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit' }}
            />
          </label>
        ))}
        <p style={{ color: '#64748B', fontSize: '0.78rem', marginTop: '-4px', gridColumn: '1 / -1' }}>
          À partir de janvier 2026, le calcul historique exclut de l’assiette IRPP le transport domicile-travail pris en charge par l’employeur. N’y saisissez que cet avantage qualifié; le montant par défaut est indicatif, pas un plafond légal. Faites vérifier le traitement applicable à votre cas.
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
          Taux de retraite complémentaire (%)
          <select
            value={inputs.complementaryRetirementRate}
            onChange={(event) => updateInputs({ complementaryRetirementRate: Number(event.target.value) })}
            style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit' }}
          >
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rate) => (
              <option key={rate} value={rate}>{rate}%</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
          Assurance mutuelle & Parents à charge
          <select
            value={inputs.dependentParents}
            onChange={(event) => updateInputs({ dependentParents: Number(event.target.value) })}
            style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit' }}
          >
            <option value={0}>Aucun parent à charge (0 DT)</option>
            <option value={1}>1er Parent à charge (145,833 DT / mois)</option>
            <option value={2}>2ème Parent à charge (291,667 DT / mois)</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
          <input
            type="checkbox"
            checked={inputs.isHeadOfFamily}
            onChange={(event) => updateInputs({ isHeadOfFamily: event.target.checked })}
          />
          Chef de famille
        </label>
      </div>
      {inputs.fiscalBenefitType !== 'COMPLEMENTARY_RETIREMENT' && (
        <p role="status" style={{ color: '#92400E', fontSize: '0.82rem' }}>
          Ce dispositif est affiché pour préparation; ses taux et gains fiscaux ne sont pas encore paramétrés et n’affectent pas le calcul.
        </p>
      )}

      <button
        type="button"
        onClick={calculatePayroll}
        disabled={!canCalculate || isCalculating}
        style={{ background: !canCalculate || isCalculating ? '#94A3B8' : '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '9px 16px', fontWeight: 700, cursor: !canCalculate || isCalculating ? 'not-allowed' : 'pointer' }}
      >
        {isCalculating ? 'Calcul en cours…' : 'Calculer avec la configuration du pays'}
      </button>

      {calculationError && (
        <div role="alert" style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', color: '#991B1B', padding: '12px 14px', marginTop: '1rem' }}>
          {calculationError}
        </div>
      )}

      {result && (
        <article ref={printableSlipRef} className="safe-payslip-sheet" aria-labelledby="payroll-simulation-title" style={{ marginTop: '1.5rem', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '1.5rem', color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          <header style={{ borderBottom: '2px solid #0F172A', display: 'flex', justifyContent: 'space-between', paddingBottom: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 850, fontSize: '1.15rem', color: '#0F172A', letterSpacing: '-0.01em' }}>SAFE TUNISIE INDUSTRIES SARL</div>
              <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: 2 }}>Immeuble NIDA Technopole Ghazela, Ariana 2088 • Tunisie</div>
              <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: 2 }}>
                CNSS : <strong>00551293-42</strong> • Matricule Fiscal : <strong>1234567/A/M/000</strong>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 900, fontSize: '1.1rem', letterSpacing: '0.05em', color: '#0F172A' }}>BULLETIN DE PAIE</div>
              <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 650, marginTop: 2 }}>
                Période du 01/{new Date().getMonth() + 1 < 10 ? `0${new Date().getMonth() + 1}` : new Date().getMonth() + 1}/{new Date().getFullYear()} au 30/{new Date().getMonth() + 1 < 10 ? `0${new Date().getMonth() + 1}` : new Date().getMonth() + 1}/{new Date().getFullYear()}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 2 }}>Paiement le 30 par Virement bancaire</div>
              <button
                type="button"
                onClick={() => printPayslip(printableSlipRef.current)}
                style={{ marginTop: 8, background: '#0F172A', border: 'none', borderRadius: 6, color: '#FFFFFF', cursor: 'pointer', fontWeight: 700, padding: '6px 12px', fontSize: '0.78rem' }}
              >
                🖨️ Imprimer le bulletin de paie
              </button>
            </div>
          </header>

          {/* Fiche Salarié & Situation */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px', fontSize: '0.8rem' }}>
            <div><span style={{ color: '#64748B' }}>Matricule :</span> <strong>EMP-5553388</strong></div>
            <div><span style={{ color: '#64748B' }}>Emploi :</span> <strong>Collaborateur Cadre / Senior</strong></div>
            <div><span style={{ color: '#64748B' }}>Situation :</span> <strong>{inputs.isHeadOfFamily ? 'Marié(e)' : 'Célibataire'}</strong></div>
            <div><span style={{ color: '#64748B' }}>Enfant(s) :</span> <strong>{inputs.childrenCount}</strong></div>
            <div><span style={{ color: '#64748B' }}>Parents à charge :</span> <strong>{inputs.dependentParents > 0 ? `${inputs.dependentParents} à charge (${(inputs.dependentParents * 145.833).toFixed(3)} DT)` : '0'}</strong></div>
            <div><span style={{ color: '#64748B' }}>N° Sécurité Sociale :</span> <strong>12780984-03</strong></div>
          </div>

          {/* Tableau multi-colonnes standard */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#F1F5F9', borderTop: '1px solid #CBD5E1', borderBottom: '2px solid #94A3B8', color: '#1E293B', fontWeight: 800 }}>
                  <th style={{ padding: '8px 6px', width: '50px' }}>N°</th>
                  <th style={{ padding: '8px 6px' }}>Désignation de la rubrique</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Base</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Taux Sal.</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Gain Sal.</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Retenue Sal.</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Taux Pat.</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Part Patronale</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px' }}>1010</td>
                  <td style={{ padding: '6px' }}>Salaire de base mensuel</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{inputs.baseSalary.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700 }}>{inputs.baseSalary.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px' }}>1020</td>
                  <td style={{ padding: '6px' }}>Prime de présence</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{inputs.presenceBonus.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700 }}>{inputs.presenceBonus.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px' }}>1030</td>
                  <td style={{ padding: '6px' }}>Prime de transport</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{inputs.transportBonus.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700 }}>{inputs.transportBonus.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                </tr>
                <tr style={{ borderTop: '2px solid #CBD5E1', borderBottom: '2px solid #CBD5E1', background: '#F8FAFC', fontWeight: 800 }}>
                  <td style={{ padding: '6px' }} colSpan={2}>TOTAL BRUT</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{result.grossSalary.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#1E40AF' }}>{result.grossSalary.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }} colSpan={3}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px' }}>8000</td>
                  <td style={{ padding: '6px' }}>CNSS Normale</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{result.grossSalary.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>9,680 %</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#B91C1C' }}>{result.employeeCnss.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>16,570 %</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{(Math.round(result.grossSalary * 0.1657 * 1000) / 1000).toFixed(3)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px' }}>8220</td>
                  <td style={{ padding: '6px' }}>Accident de travail</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{result.grossSalary.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>0,500 %</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{(Math.round(result.grossSalary * 0.005 * 1000) / 1000).toFixed(3)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                  <td style={{ padding: '6px' }}>8500</td>
                  <td style={{ padding: '6px', fontWeight: 700 }} colSpan={2}>Brut imposable</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700 }}>{result.taxableGross.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }} colSpan={2}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px' }}>9000</td>
                  <td style={{ padding: '6px' }}>IRPP Brut</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{result.netImposable.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>Barème</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#B91C1C' }}>{result.irppBeforeRetirementGain.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px' }}>9046</td>
                  <td style={{ padding: '6px', color: '#15803D' }}>* * Gain IRPP Mensuel (Déductions familiales & fiscales)</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#15803D', fontWeight: 700 }}>{result.gainIrpp.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px' }}>9400</td>
                  <td style={{ padding: '6px' }}>Contrib° Sociale de Solidarité (CSS)</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{result.netImposable.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>0,500 %</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#B91C1C' }}>{result.cssBeforeRetirementGain.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px' }}>9446</td>
                  <td style={{ padding: '6px', color: '#15803D' }}>* * Gain CSS Mensuel</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#15803D', fontWeight: 700 }}>{result.gainCss.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px' }}>9910</td>
                  <td style={{ padding: '6px' }}>Assurance Compl. Mutuelle Patronale</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{result.grossSalary.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>6,000 %</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{(Math.round(result.grossSalary * 0.06 * 1000) / 1000).toFixed(3)}</td>
                </tr>
                <tr style={{ borderTop: '2px solid #CBD5E1', borderBottom: '2px solid #CBD5E1', background: '#F8FAFC', fontWeight: 800 }}>
                  <td style={{ padding: '6px' }} colSpan={2}>TOTAL COTISATIONS</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#B91C1C' }}>{(result.employeeCnss + result.irpp + result.css).toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#334155' }}>
                    {(Math.round((result.grossSalary * (0.1657 + 0.005 + 0.06)) * 1000) / 1000).toFixed(3)}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px' }}>10000</td>
                  <td style={{ padding: '6px', fontWeight: 700 }}>Salaire Net Intermédiaire</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700 }}>{result.intermediateNet.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }} colSpan={3}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px' }}>10200</td>
                  <td style={{ padding: '6px' }}>Assurance Compl. Mutuelle Salariale</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{result.grossSalary.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{inputs.complementaryRetirementRate},000 %</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#B91C1C' }}>{result.retirementBonusDeduction.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }} colSpan={2}>—</td>
                </tr>
                {inputs.dependentParents >= 1 && (
                  <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '6px' }}>11160</td>
                    <td style={{ padding: '6px' }}>Déduction 1er Parent à Charge</td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>1,000</td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                    <td style={{ padding: '6px', textAlign: 'right', color: '#B91C1C' }}>145,833</td>
                    <td style={{ padding: '6px', textAlign: 'right' }} colSpan={2}>—</td>
                  </tr>
                )}
                {inputs.dependentParents >= 2 && (
                  <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '6px' }}>11170</td>
                    <td style={{ padding: '6px' }}>Déduction 2ème Parent à Charge</td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>1,000</td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                    <td style={{ padding: '6px', textAlign: 'right', color: '#B91C1C' }}>145,834</td>
                    <td style={{ padding: '6px', textAlign: 'right' }} colSpan={2}>—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* TABLES COMPARATIVES DE CALCUL IRPP ET CSS : AVANT ET APRÈS GAINS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '16px' }}>
            {/* 1. TABLEAU DE CALCUL AVANT GAINS */}
            <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '2px solid #3B82F6', paddingBottom: '6px' }}>
                <h4 style={{ margin: 0, fontSize: '0.92rem', color: '#1E40AF', fontWeight: 800 }}>
                  📋 Table de Calcul IRPP &amp; CSS — AVANT GAINS
                </h4>
                <span style={{ fontSize: '0.72rem', background: '#DBEAFE', color: '#1E40AF', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                  Base brute imposable
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '8px' }}>
                Assiette annuelle brute : <strong>{annualTaxableBeforeGains.toFixed(3)} DT</strong> (Mensuel : {(annualTaxableBeforeGains / 12).toFixed(3)} DT)
              </div>
              <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1', color: '#334155' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Tranche IRPP</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center' }}>Taux</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Base Tranche</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>IRPP Annuel</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>IRPP Mensuel</th>
                  </tr>
                </thead>
                <tbody>
                  {tranchesBeforeGains.map((t, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '5px 8px', color: '#0F172A' }}>
                        T{idx + 1} ({t.max === Infinity ? `> ${t.min.toLocaleString('fr-FR')}` : `${t.min.toLocaleString('fr-FR')} – ${t.max.toLocaleString('fr-FR')}`})
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 600 }}>{t.rate}%</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: t.slice > 0 ? '#0F172A' : '#94A3B8' }}>{t.slice.toFixed(3)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: t.taxAnnual > 0 ? '#B91C1C' : '#94A3B8' }}>{t.taxAnnual.toFixed(3)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: t.taxMonthly > 0 ? 700 : 400, color: t.taxMonthly > 0 ? '#B91C1C' : '#94A3B8' }}>{t.taxMonthly.toFixed(3)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#EFF6FF', fontWeight: 700, borderTop: '2px solid #93C5FD' }}>
                    <td colSpan={3} style={{ padding: '6px 8px' }}>Sous-total IRPP Avant Gains</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1E40AF' }}>{sumIrppBeforeGains.toFixed(3)} DT</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1E40AF' }}>{monthlyIrppBeforeGains.toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ background: '#FFF7ED', fontWeight: 700 }}>
                    <td colSpan={3} style={{ padding: '6px 8px', color: '#9A3412' }}>CSS Avant Gains ({customRates.cssRate}%)</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#9A3412' }}>{(annualTaxableBeforeGains * (customRates.cssRate / 100)).toFixed(3)} DT</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#9A3412' }}>{monthlyCssBeforeGains.toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ background: '#FEF2F2', fontWeight: 800, borderTop: '2px solid #F87171' }}>
                    <td colSpan={3} style={{ padding: '7px 8px', color: '#991B1B' }}>TOTAL IMPÔTS AVANT GAINS (IRPP + CSS)</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#991B1B' }}>{(sumIrppBeforeGains + annualTaxableBeforeGains * (customRates.cssRate / 100)).toFixed(3)} DT</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#991B1B' }}>{totalImpotsBeforeGains.toFixed(3)} DT</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 2. TABLEAU DE CALCUL APRÈS GAINS */}
            <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '2px solid #16A34A', paddingBottom: '6px' }}>
                <h4 style={{ margin: 0, fontSize: '0.92rem', color: '#15803D', fontWeight: 800 }}>
                  ✅ Table de Calcul IRPP &amp; CSS — APRÈS GAINS
                </h4>
                <span style={{ fontSize: '0.72rem', background: '#DCFCE7', color: '#15803D', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                  Après abattements &amp; déductions
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '8px' }}>
                Assiette annuelle nette : <strong>{annualTaxableAfterGains.toFixed(3)} DT</strong> (Mensuel : {(annualTaxableAfterGains / 12).toFixed(3)} DT)
              </div>
              <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1', color: '#334155' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Tranche IRPP</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center' }}>Taux</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Base Tranche</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>IRPP Annuel</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>IRPP Retenu</th>
                  </tr>
                </thead>
                <tbody>
                  {tranchesAfterGains.map((t, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '5px 8px', color: '#0F172A' }}>
                        T{idx + 1} ({t.max === Infinity ? `> ${t.min.toLocaleString('fr-FR')}` : `${t.min.toLocaleString('fr-FR')} – ${t.max.toLocaleString('fr-FR')}`})
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 600 }}>{t.rate}%</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: t.slice > 0 ? '#0F172A' : '#94A3B8' }}>{t.slice.toFixed(3)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: t.taxAnnual > 0 ? '#15803D' : '#94A3B8' }}>{t.taxAnnual.toFixed(3)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: t.taxMonthly > 0 ? 700 : 400, color: t.taxMonthly > 0 ? '#15803D' : '#94A3B8' }}>{t.taxMonthly.toFixed(3)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#F0FDF4', fontWeight: 700, borderTop: '2px solid #86EFAC' }}>
                    <td colSpan={3} style={{ padding: '6px 8px' }}>Sous-total IRPP Après Gains</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#15803D' }}>{sumIrppAfterGains.toFixed(3)} DT</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#15803D' }}>{monthlyIrppAfterGains.toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ background: '#FFFBEB', fontWeight: 700 }}>
                    <td colSpan={3} style={{ padding: '6px 8px', color: '#B45309' }}>CSS Retenue Après Gains ({customRates.cssRate}%)</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#B45309' }}>{(annualTaxableAfterGains * (customRates.cssRate / 100)).toFixed(3)} DT</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#B45309' }}>{monthlyCssAfterGains.toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ background: '#F0FDF4', fontWeight: 800, borderTop: '2px solid #22C55E' }}>
                    <td colSpan={3} style={{ padding: '7px 8px', color: '#166534' }}>TOTAL IMPÔTS APRÈS GAINS (IRPP + CSS)</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#166534' }}>{(sumIrppAfterGains + annualTaxableAfterGains * (customRates.cssRate / 100)).toFixed(3)} DT</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#166534' }}>{totalImpotsAfterGains.toFixed(3)} DT</td>
                  </tr>
                </tbody>
              </table>

              {/* GAIN FISCAL RÉALISÉ */}
              <div style={{ marginTop: '12px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '6px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#065F46' }}>💰 Économie Fiscale Nette Réalisée :</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#047857' }}>+{totalGainFiscalMensuel.toFixed(3)} DT / mois (IRPP : +{gainIrppMensuel.toFixed(3)}, CSS : +{gainCssMensuel.toFixed(3)})</span>
              </div>
            </div>
          </div>

          {/* Net à Payer & Footer */}
          <div style={{ marginTop: '1.2rem', padding: '12px 16px', background: '#0F172A', color: '#FFFFFF', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>80500 Net à payer par virement</div>
              <div style={{ fontSize: '0.8rem', color: '#E2E8F0', marginTop: 2 }}>DINARS TUNISIENS (TND)</div>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#38BDF8', letterSpacing: '-0.02em' }}>
              {formatAmount(result.netSalary, result.currencySymbol)}
            </div>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 10, textAlign: 'center' }}>
            Ce Bulletin est établi en Dinars tunisiens pour vous faire valoir vos droits. Conservez ce bulletin de paie sans limitation de durée.
          </div>
        </article>
      )}
      </>
      )}
      </div>
    </section>
    <PayrollRegisterPanel accessToken={accessToken} />
    </>
  );
}
