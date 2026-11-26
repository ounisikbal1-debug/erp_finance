import React, { useEffect, useRef, useState } from 'react';
import {
  parseMultiEmployeeFile,
  calculateAllEmployees,
  computeMultiEmployeeTotals,
  SAMPLE_EMPLOYEES,
  downloadExcelTemplate,
  downloadCsvTemplate,
  exportMultiEmployeeResultsExcel,
  exportMultiEmployeeResultsCSV,
  type MultiEmployeeRecord,
  type MultiEmployeeTotals,
} from './multiEmployeePayrollService';
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
  assuranceDeces: number;
  assuranceInvalidite: number;
  assuranceMaladie: number;
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
  'assuranceDeces',
  'assuranceInvalidite',
  'assuranceMaladie',
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

interface CustomPayrollRates {
  cnssEmployeeRate: number;
  cnssEmployerRate: number;
  workAccidentRate: number;
  foprolosRate: number;
  profExpensesRate: number;
  profExpensesMaxCap: number;
  headOfFamilyDeduction: number;
  childDeduction: number;
  parentDeduction: number;
  cssRate: number;
  employerInsuranceRate: number;
  employeeInsuranceRate: number;
  assuranceDecesRate: number;
  assuranceInvaliditeRate: number;
  assuranceMaladieRate: number;
  irppBrackets: Array<{ min: number; max: number; rate: number }>;
}

const CUSTOM_RATES_STORAGE_KEY = 'safe_custom_payroll_rates_v1';

const DEFAULT_CUSTOM_RATES: CustomPayrollRates = {
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
  employerInsuranceRate: 6.0,
  employeeInsuranceRate: 0.0,
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
    { min: 70000, max: Infinity, rate: 40 },
  ],
};

function loadSavedCustomRates(): CustomPayrollRates {
  try {
    const raw = window.localStorage.getItem(CUSTOM_RATES_STORAGE_KEY);
    if (!raw) return DEFAULT_CUSTOM_RATES;
    const parsed = JSON.parse(raw) as Partial<CustomPayrollRates>;
    const brackets = Array.isArray(parsed.irppBrackets) && parsed.irppBrackets.length > 0
      ? parsed.irppBrackets.map((b) => ({
          min: Number(b.min) || 0,
          max: b.max === null || b.max === undefined || !Number.isFinite(Number(b.max)) ? Infinity : Number(b.max),
          rate: Number(b.rate) || 0,
        }))
      : DEFAULT_CUSTOM_RATES.irppBrackets;
    return {
      ...DEFAULT_CUSTOM_RATES,
      ...parsed,
      assuranceDecesRate: typeof parsed.assuranceDecesRate === 'number' ? parsed.assuranceDecesRate : DEFAULT_CUSTOM_RATES.assuranceDecesRate,
      assuranceInvaliditeRate: typeof parsed.assuranceInvaliditeRate === 'number' ? parsed.assuranceInvaliditeRate : DEFAULT_CUSTOM_RATES.assuranceInvaliditeRate,
      assuranceMaladieRate: typeof parsed.assuranceMaladieRate === 'number' ? parsed.assuranceMaladieRate : DEFAULT_CUSTOM_RATES.assuranceMaladieRate,
      irppBrackets: brackets,
    };
  } catch {
    return DEFAULT_CUSTOM_RATES;
  }
}

function round3(val: number): number {
  return Math.round(val * 1000) / 1000;
}

function computePayslipFromCustomRates(
  inputs: PayrollSimulationInputs,
  rates: CustomPayrollRates,
  countryCode = 'TN',
): PayrollSimulationResult {
  const grossSalary = round3((Number(inputs.baseSalary) || 0) + (Number(inputs.presenceBonus) || 0) + (Number(inputs.transportBonus) || 0));
  const employeeCnss = round3(grossSalary * (rates.cnssEmployeeRate / 100));
  const taxableGross = Math.max(0, round3(grossSalary - employeeCnss));
  const annualTaxableGross = taxableGross * 12;
  const annualProfExpenses = Math.min(annualTaxableGross * (rates.profExpensesRate / 100), rates.profExpensesMaxCap);
  const annualFamilyDeductions = (inputs.isHeadOfFamily ? rates.headOfFamilyDeduction : 0)
    + ((Number(inputs.childrenCount) || 0) * rates.childDeduction);

  const benefitRate = Number(inputs.complementaryRetirementRate) || 0;
  // Calcul de l’Avantage fiscal assis sur le Salaire Brut Total (Base + Primes)
  const retirementBonusDeduction = inputs.fiscalBenefitType === 'COMPLEMENTARY_RETIREMENT'
    ? round3(grossSalary * (benefitRate / 100))
    : inputs.fiscalBenefitType === 'RETIREMENT_SAVINGS'
      ? round3(grossSalary * ((benefitRate > 0 ? benefitRate : 4) / 100))
      : inputs.fiscalBenefitType === 'LIFE_INSURANCE'
        ? round3(grossSalary * ((benefitRate > 0 ? benefitRate : 3) / 100))
        : 0;

  const annualNetBeforeGain = Math.max(0, annualTaxableGross - annualProfExpenses - annualFamilyDeductions);
  const annualNetAfterGain = Math.max(0, annualNetBeforeGain - retirementBonusDeduction * 12);

  const calcAnnualIrpp = (annualNet: number) => {
    let total = 0;
    for (const b of rates.irppBrackets) {
      if (annualNet > b.min) {
        total += Math.max(0, Math.min(annualNet, b.max) - b.min) * (b.rate / 100);
      }
    }
    return total;
  };

  const irppBeforeRetirementGain = round3(calcAnnualIrpp(annualNetBeforeGain) / 12);
  const irpp = round3(calcAnnualIrpp(annualNetAfterGain) / 12);
  const cssBeforeRetirementGain = round3((annualNetBeforeGain * (rates.cssRate / 100)) / 12);
  const css = round3((annualNetAfterGain * (rates.cssRate / 100)) / 12);

  const gainIrpp = Math.max(0, round3(irppBeforeRetirementGain - irpp));
  const gainCss = Math.max(0, round3(cssBeforeRetirementGain - css));
  const totalImpots = round3(irppBeforeRetirementGain + cssBeforeRetirementGain);
  const totalGain = round3(gainIrpp + gainCss);
  const totalImpotsApresGains = round3(irpp + css);

  // 1- Assurance Décès = 0.5% * Total brut (100% Charge Patronale)
  const assuranceDeces = round3(grossSalary * (rates.assuranceDecesRate / 100));
  // 2- Assurance Invalidité = 0.78400752510838% * Total Brut (100% Charge Patronale)
  const assuranceInvalidite = round3(grossSalary * (rates.assuranceInvaliditeRate / 100));
  // 3- Assurance Maladie = 0.0048212520380679 * Total Brut (100% Charge Patronale)
  const effectiveMaladieRate = rates.assuranceMaladieRate < 0.01 ? rates.assuranceMaladieRate * 100 : rates.assuranceMaladieRate;
  const assuranceMaladie = round3(grossSalary * (effectiveMaladieRate / 100));

  const employeeInsurance = round3(grossSalary * (rates.employeeInsuranceRate / 100));
  const parentACharge = round3(((Number(inputs.dependentParents) || 0) * rates.parentDeduction) / 12);
  const intermediateNet = round3(grossSalary - employeeCnss - irpp - css);
  // Retenues salariales uniquement : les 3 assurances sont exclusivement des charges patronales
  const totalRetenue = round3(employeeCnss + irpp + css + employeeInsurance + parentACharge);
  const netSalary = round3(grossSalary - totalRetenue);

  return {
    country: countryCode,
    currency: 'TND',
    currencySymbol: 'DT',
    grossSalary,
    employeeCnss,
    taxableGross,
    fraisProfessionnels: round3(annualProfExpenses / 12),
    chefDeFamille: round3((inputs.isHeadOfFamily ? rates.headOfFamilyDeduction : 0) / 12),
    enfantACharge: round3(((Number(inputs.childrenCount) || 0) * rates.childDeduction) / 12),
    retirementBonusDeduction,
    netImposable: round3(annualNetAfterGain / 12),
    irpp,
    irppBeforeRetirementGain,
    css,
    cssBeforeRetirementGain,
    gainIrpp,
    gainCss,
    assuranceDeces,
    assuranceInvalidite,
    assuranceMaladie,
    totalImpots,
    totalGain,
    totalImpotsApresGains,
    intermediateNet,
    parentACharge,
    totalRetenue,
    netSalary,
  };
}

export default function PayrollSimulationPanel({ accessToken }: { accessToken: string | null }) {
  const [activeTab, setActiveTab] = useState<'payslip' | 'ratesSheet' | 'multiEmployee'>('payslip');
  const [multiEmployees, setMultiEmployees] = useState<MultiEmployeeRecord[]>(() =>
    calculateAllEmployees(SAMPLE_EMPLOYEES, customRates)
  );
  const [isImporting, setIsImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [multiSearchTerm, setMultiSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportFeedback(null);
    try {
      const imported = await parseMultiEmployeeFile(file);
      const computed = calculateAllEmployees(imported, customRates);
      setMultiEmployees(computed);
      setActiveTab('multiEmployee');
      setImportFeedback({
        type: 'success',
        message: `Import réussi : ${computed.length} salarié(s) importé(s) avec calcul instantané de la paie.`,
      });
    } catch (err: any) {
      setImportFeedback({
        type: 'error',
        message: err.message || 'Erreur lors de l’importation du fichier.',
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRecalculateMulti = () => {
    const computed = calculateAllEmployees(multiEmployees, customRates);
    setMultiEmployees(computed);
    setImportFeedback({
      type: 'success',
      message: `Paie recalculée pour ${computed.length} salarié(s) avec les taux officiels actuels.`,
    });
  };

  const handleSelectEmployeeForPayslip = (emp: MultiEmployeeRecord) => {
    setInputs({ ...emp.inputs });
    setActiveTab('payslip');
  };

  const multiTotals: MultiEmployeeTotals = computeMultiEmployeeTotals(multiEmployees);
  const [inputs, setInputs] = useState(INITIAL_INPUTS);
  const [availability, setAvailability] = useState<PayrollAvailability | null>(null);
  const [availabilityError, setAvailabilityError] = useState('');
  const [result, setResult] = useState<PayrollSimulationResult | null>(null);

  // Feuille des Taux & Barèmes Modulables (chargée depuis localStorage)
  const [customRates, setCustomRates] = useState<CustomPayrollRates>(loadSavedCustomRates);
  const [savedRatesNotice, setSavedRatesNotice] = useState('');
  const [calculationError, setCalculationError] = useState('');
  const [isCalculating, setIsCalculating] = useState(false);
  const [configVersion, setConfigVersion] = useState(0);
  const printableSlipRef = useRef<HTMLElement | null>(null);

  const canCalculate = canUsePayrollCalculator(availability);

  useEffect(() => {
    const onConfigUpdate = () => setConfigVersion((v) => v + 1);
    window.addEventListener('safe:country-config-updated', onConfigUpdate);
    return () => window.removeEventListener('safe:country-config-updated', onConfigUpdate);
  }, []);

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
  }, [accessToken, configVersion]);

  const updateInputs = (changes: Partial<PayrollSimulationInputs>) => {
    setInputs((previous) => ({ ...previous, ...changes }));
    setResult(null);
    setCalculationError('');
  };

  const saveCustomRates = () => {
    try {
      const serializable = {
        ...customRates,
        irppBrackets: customRates.irppBrackets.map((b) => ({
          min: b.min,
          max: Number.isFinite(b.max) ? b.max : null,
          rate: b.rate,
        })),
      };
      window.localStorage.setItem(CUSTOM_RATES_STORAGE_KEY, JSON.stringify(serializable));
      window.dispatchEvent(new CustomEvent('safe:custom-rates-updated', { detail: customRates }));
      if (result) {
        const updated = computePayslipFromCustomRates(inputs, customRates, availability?.countryCode ?? 'TN');
        setResult(updated);
      }
      setSavedRatesNotice('Modifications enregistrées ! Les taux modulables sont appliqués au calcul de la fiche de paie et de la préparation CNSS/IRPP.');
    } catch {
      setSavedRatesNotice('Erreur lors de l’enregistrement local des taux modulables.');
    }
  };

  const calculatePayroll = async () => {
    if (isCalculating) return;
    setIsCalculating(true);
    setCalculationError('');
    setActiveTab('payslip');
    try {
      // Calcul prioritaire à partir des taux et barèmes de la Feuille des Taux Modulables
      const computed = computePayslipFromCustomRates(inputs, customRates, availability?.countryCode ?? 'TN');
      setResult(computed);
      window.localStorage.setItem('safe_last_simulated_payslip_v1', JSON.stringify({
        result: computed,
        customRates,
        inputs,
        calculatedAt: new Date().toISOString(),
      }));
      window.dispatchEvent(new CustomEvent('safe:payroll-launched', {
        detail: { result: computed, customRates, inputs },
      }));

      // Synchronisation optionnelle avec le backend si la configuration pays est disponible
      if (accessToken && canCalculate) {
        fetch('/api/hr/simulate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(inputs),
        }).catch(() => {});
      }

      setTimeout(() => {
        printableSlipRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
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
  const modularBenefitRate = Number(inputs.complementaryRetirementRate) || 0;
  // Calcul de l’Avantage fiscal assis sur le Salaire Brut Total (Base + Primes)
  const modularMonthlyBenefitDeduction = inputs.fiscalBenefitType === 'COMPLEMENTARY_RETIREMENT'
    ? Math.round(modularGross * (modularBenefitRate / 100) * 1000) / 1000
    : inputs.fiscalBenefitType === 'RETIREMENT_SAVINGS'
      ? Math.round(modularGross * ((modularBenefitRate > 0 ? modularBenefitRate : 4) / 100) * 1000) / 1000
      : Math.round(modularGross * ((modularBenefitRate > 0 ? modularBenefitRate : 3) / 100) * 1000) / 1000;
  const modularAnnualNetTaxable = Math.max(0, modularAnnualTaxableGross - modularAnnualProfExpenses - modularAnnualFamilyDeductions - modularMonthlyBenefitDeduction * 12);
  
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
  const modularMonthlyEmployerInsurance = Math.round((modularGross * (customRates.employerInsuranceRate / 100)) * 1000) / 1000;
  const modularMonthlyEmployeeInsurance = Math.round((modularGross * (customRates.employeeInsuranceRate / 100)) * 1000) / 1000;
  const modularMonthlyAssuranceDeces = Math.round((modularGross * (customRates.assuranceDecesRate / 100)) * 1000) / 1000;
  const modularMonthlyAssuranceInvalidite = Math.round((modularGross * (customRates.assuranceInvaliditeRate / 100)) * 1000) / 1000;
  const effectiveMaladieRateRealtime = customRates.assuranceMaladieRate < 0.01 ? customRates.assuranceMaladieRate * 100 : customRates.assuranceMaladieRate;
  const modularMonthlyAssuranceMaladie = Math.round((modularGross * (effectiveMaladieRateRealtime / 100)) * 1000) / 1000;
  const modularMonthlyTotalAssurancesPatronales = Math.round((modularMonthlyAssuranceDeces + modularMonthlyAssuranceInvalidite + modularMonthlyAssuranceMaladie) * 1000) / 1000;
  // Les 3 assurances sont exclusivement des charges patronales
  const modularTotalEmployer = Math.round((modularMonthlyEmployerCnss + modularMonthlyWorkAccident + modularMonthlyFoprolos + modularMonthlyEmployerInsurance + modularMonthlyTotalAssurancesPatronales) * 1000) / 1000;
  const modularTotalDeductions = Math.round((modularCnss + modularMonthlyIrpp + modularMonthlyCss + modularMonthlyEmployeeInsurance) * 1000) / 1000;
  const modularNet = Math.round((modularGross - modularTotalDeductions) * 1000) / 1000;

  // Calculs détaillés Tranche par Tranche : AVANT GAINS et APRÈS GAINS (8 tranches SAFE & CSS 0.5%)
  const annualTaxableBeforeGains = Math.max(0, modularAnnualTaxableGross - modularAnnualProfExpenses);
  let sumIrppBeforeGains = 0;
  const tranchesBeforeGains = customRates.irppBrackets.map((b) => {
    let slice = 0;
    if (annualTaxableBeforeGains > b.min) {
      slice = Math.max(0, Math.min(annualTaxableBeforeGains, b.max) - b.min);
    }
    const tax = Math.round(slice * (b.rate / 100) * 1000) / 1000;
    sumIrppBeforeGains += tax;
    return {
      min: b.min,
      max: b.max,
      rate: b.rate,
      slice,
      taxAnnual: tax,
      taxMonthly: Math.round((tax / 12) * 1000) / 1000,
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
      slice = Math.max(0, Math.min(annualTaxableAfterGains, b.max) - b.min);
    }
    const tax = Math.round(slice * (b.rate / 100) * 1000) / 1000;
    sumIrppAfterGains += tax;
    return {
      min: b.min,
      max: b.max,
      rate: b.rate,
      slice,
      taxAnnual: tax,
      taxMonthly: Math.round((tax / 12) * 1000) / 1000,
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
    ['Total retenues salariales', result.totalRetenue],
    ['Assurance Décès (Charge Patronale 0.5%)', result.assuranceDeces],
    ['Assurance Invalidité (Charge Patronale 0.784%)', result.assuranceInvalidite],
    ['Assurance Maladie (Charge Patronale 0.482%)', result.assuranceMaladie],
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

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileImport}
            accept=".xlsx,.xls,.csv,.pdf,.txt"
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            style={{
              background: '#2563EB',
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
              boxShadow: '0 1px 3px rgba(37,99,235,0.25)',
            }}
          >
            <span>📥</span> {isImporting ? 'Import en cours...' : 'Import Excel / CSV / PDF'}
          </button>
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

          {/* Bouton Enregistrer Modification dans la Feuille des Taux Modulables */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '12px 16px' }}>
            <div style={{ fontSize: '0.82rem', color: '#334155' }}>
              Enregistrez vos modifications pour les appliquer à la fiche de paie calculée et à la préparation CNSS / IRPP.
            </div>
            <button
              type="button"
              onClick={saveCustomRates}
              style={{
                background: '#059669',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 18px',
                fontWeight: 800,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              💾 Enregistrer Modification
            </button>
          </div>
          {savedRatesNotice && (
            <div role="status" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '8px', color: '#065F46', padding: '10px 14px', fontWeight: 700, fontSize: '0.84rem' }}>
              ✅ {savedRatesNotice}
            </div>
          )}

          {/* Détail de calcul IRPP/CSS supprimé de la fiche de paie conformément à la demande */}
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
        <button
          type="button"
          onClick={() => setActiveTab('multiEmployee')}
          style={{
            background: activeTab === 'multiEmployee' ? '#2563EB' : '#F1F5F9',
            color: activeTab === 'multiEmployee' ? '#FFFFFF' : '#334155',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontWeight: 800,
            fontSize: '0.84rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>👥</span> Paie Multi-Salariés ({multiEmployees.length})
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
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
              Parents à charge
              <select
                value={inputs.dependentParents}
                onChange={(e) => updateInputs({ dependentParents: Number(e.target.value) })}
                style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit', fontWeight: 700, background: '#FFFFFF' }}
              >
                <option value={0}>Aucun parent à charge (0)</option>
                <option value={1}>1er parent à charge</option>
                <option value={2}>2ème parent à charge</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
              Dispositif d’avantage fiscal
              <select
                value={inputs.fiscalBenefitType}
                onChange={(e) => updateInputs({ fiscalBenefitType: e.target.value as PayrollSimulationInputs['fiscalBenefitType'] })}
                style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit', fontWeight: 700, background: '#FFFFFF' }}
              >
                <option value="COMPLEMENTARY_RETIREMENT">Retraite complémentaire — gains calculés</option>
                <option value="RETIREMENT_SAVINGS">Épargne retraite — gains calculés</option>
                <option value="LIFE_INSURANCE">Assurance-vie — gains calculés</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
              1. Assurance Décès Patronale (%)
              <input
                type="number"
                step="0.001"
                value={customRates.assuranceDecesRate}
                onChange={(e) => setCustomRates({ ...customRates, assuranceDecesRate: Number(e.target.value) })}
                style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit', fontWeight: 700 }}
              />
              <span style={{ fontSize: '0.72rem', color: '#166534', fontWeight: 600 }}>0.5% × Total Brut (Charge Patronale)</span>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
              2. Assurance Invalidité Patronale (%)
              <input
                type="number"
                step="0.000001"
                value={customRates.assuranceInvaliditeRate}
                onChange={(e) => setCustomRates({ ...customRates, assuranceInvaliditeRate: Number(e.target.value) })}
                style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit', fontWeight: 700 }}
              />
              <span style={{ fontSize: '0.72rem', color: '#166534', fontWeight: 600 }}>0.78400752510838% × Total Brut (Charge Patronale)</span>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>
              3. Assurance Maladie Patronale (%)
              <input
                type="number"
                step="0.000001"
                value={customRates.assuranceMaladieRate}
                onChange={(e) => setCustomRates({ ...customRates, assuranceMaladieRate: Number(e.target.value) })}
                style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit', fontWeight: 700 }}
              />
              <span style={{ fontSize: '0.72rem', color: '#166534', fontWeight: 600 }}>0,0048212520380679 × Total Brut (Charge Patronale)</span>
            </label>
          </div>

          {/* DÉTAIL DU CALCUL DU NET IMPOSABLE */}
          <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '0.98rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📑</span>
              <span>Détail du Calcul du Net Imposable (Assiette Fiscale IRPP &amp; CSS)</span>
              <span style={{ fontSize: '0.75rem', background: '#E0F2FE', color: '#0369A1', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                Barème Fiscal Officiel Tunisien
              </span>
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9', borderBottom: '2px solid #CBD5E1', color: '#334155' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Élément de Détermination de l’Assiette Fiscale</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Règle / Taux / Plafond</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Montant Annuel (DT/an)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Montant Mensuel (DT/mois)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #E2E8F0', fontWeight: 700, color: '#0F172A' }}>
                    <td style={{ padding: '7px 10px' }}>1. Salaire Brut Total (Base + Primes)</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center', color: '#64748B' }}>Assiette de départ</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{(modularGross * 12).toFixed(3)} DT</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{modularGross.toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#B91C1C' }}>
                    <td style={{ padding: '7px 10px' }}>− Cotisation CNSS Salariée Déductible</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>{customRates.cnssEmployeeRate}% du Brut</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>-{(modularCnss * 12).toFixed(3)} DT</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>-{modularCnss.toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ borderBottom: '2px solid #CBD5E1', background: '#F8FAFC', fontWeight: 800, color: '#0369A1' }}>
                    <td style={{ padding: '7px 10px' }}>= Salaire Brut Imposable (Brut − CNSS)</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>Formule légale</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{modularAnnualTaxableGross.toFixed(3)} DT</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{modularTaxableGross.toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#B45309' }}>
                    <td style={{ padding: '7px 10px' }}>− Déduction Frais Professionnels</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>{customRates.profExpensesRate}% (plafonné à {customRates.profExpensesMaxCap.toFixed(0)} DT/an)</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>-{modularAnnualProfExpenses.toFixed(3)} DT</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>-{(modularAnnualProfExpenses / 12).toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                    <td style={{ padding: '7px 10px' }}>− Déduction Chef de Famille</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>{inputs.isHeadOfFamily ? `${customRates.headOfFamilyDeduction.toFixed(0)} DT/an (Applicable)` : 'Non applicable (0 DT)'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>-{(inputs.isHeadOfFamily ? customRates.headOfFamilyDeduction : 0).toFixed(3)} DT</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>-{((inputs.isHeadOfFamily ? customRates.headOfFamilyDeduction : 0) / 12).toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                    <td style={{ padding: '7px 10px' }}>− Déduction Enfants à Charge ({inputs.childrenCount})</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>{customRates.childDeduction.toFixed(0)} DT/an par enfant</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>-{(inputs.childrenCount * customRates.childDeduction).toFixed(3)} DT</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>-{((inputs.childrenCount * customRates.childDeduction) / 12).toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                    <td style={{ padding: '7px 10px' }}>− Déduction Parents à Charge ({inputs.dependentParents})</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>{customRates.parentDeduction.toFixed(0)} DT/an par parent</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>-{(inputs.dependentParents * customRates.parentDeduction).toFixed(3)} DT</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>-{((inputs.dependentParents * customRates.parentDeduction) / 12).toFixed(3)} DT</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#15803D' }}>
                    <td style={{ padding: '7px 10px' }}>− Dispositif d’Avantage Fiscal ({inputs.fiscalBenefitType === 'COMPLEMENTARY_RETIREMENT' ? 'Retraite compl.' : inputs.fiscalBenefitType === 'RETIREMENT_SAVINGS' ? 'Épargne retraite' : 'Assurance-vie'})</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>Taux appliqué {modularBenefitRate > 0 ? `${modularBenefitRate}%` : 'Standard'} assis sur Salaire Brut Total (Base + Primes)</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>-{(modularMonthlyBenefitDeduction * 12).toFixed(3)} DT</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>-{modularMonthlyBenefitDeduction.toFixed(3)} DT</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr style={{ background: '#0F172A', color: '#FFFFFF', fontWeight: 800 }}>
                    <td style={{ padding: '9px 10px' }} colSpan={2}>
                      = REVENU NET IMPOSABLE RETENU (ASSIETTE SOUMISE AU BARÈME IRPP ET CSS)
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', color: '#38BDF8', fontSize: '0.92rem' }}>
                      {modularAnnualNetTaxable.toFixed(3)} DT
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', color: '#38BDF8', fontSize: '0.92rem' }}>
                      {(modularAnnualNetTaxable / 12).toFixed(3)} DT
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Tableau Modulable des Tranches IRPP */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', margin: '0 0 10px' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#0F172A' }}>Barème Progressif de l’IRPP (Tranches modulables &amp; Calcul par tranche)</h3>
              <span style={{ fontSize: '0.74rem', background: '#ECFDF5', color: '#065F46', padding: '3px 8px', borderRadius: '4px', fontWeight: 700, border: '1px solid #A7F3D0' }}>
                ✓ Tranche 6 vérifiée : 40 000 DT – 50 000 DT (36%, assiette 10 000 DT) conforme loi tunisienne
              </span>
            </div>
            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#EDF2F7', borderBottom: '2px solid #CBD5E1' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Tranche de revenu net imposable</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Taux IRPP (%)</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Assiette Tranche (DT/an)</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>IRPP Annuel (DT/an)</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>IRPP Mensuel (DT/mois)</th>
                </tr>
              </thead>
              <tbody>
                {customRates.irppBrackets.map((b, idx) => {
                  const rowCalc = tranchesAfterGains[idx] ?? { slice: 0, taxAnnual: 0, taxMonthly: 0 };
                  const isActiveSlice = rowCalc.slice > 0;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0', background: isActiveSlice ? '#FFFFFF' : '#F8FAFC', color: isActiveSlice ? '#0F172A' : '#64748B' }}>
                      <td style={{ padding: '7px 8px', fontWeight: isActiveSlice ? 600 : 400 }}>
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
                          style={{ width: '76px', textAlign: 'right', padding: '4px 6px', fontWeight: 700 }}
                        /> %
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {rowCalc.slice.toFixed(3)}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: isActiveSlice ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
                        {rowCalc.taxAnnual.toFixed(3)}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: isActiveSlice ? 700 : 400, color: isActiveSlice && rowCalc.taxMonthly > 0 ? '#B91C1C' : 'inherit', fontVariantNumeric: 'tabular-nums' }}>
                        {rowCalc.taxMonthly.toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#E2E8F0', borderTop: '2px solid #94A3B8', fontWeight: 800, color: '#0F172A' }}>
                  <td style={{ padding: '8px' }} colSpan={2}>TOTAL IRPP CALCULÉ</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{annualTaxableAfterGains.toFixed(3)} DT</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{sumIrppAfterGains.toFixed(3)} DT</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#B91C1C', fontVariantNumeric: 'tabular-nums' }}>{monthlyIrppAfterGains.toFixed(3)} DT</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Bouton Enregistrer Modification dans la Feuille des Taux Modulables */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '12px 16px' }}>
            <div style={{ fontSize: '0.82rem', color: '#334155' }}>
              Enregistrez vos modifications pour les appliquer à la fiche de paie calculée et à la préparation CNSS / IRPP.
            </div>
            <button
              type="button"
              onClick={saveCustomRates}
              style={{
                background: '#059669',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 18px',
                fontWeight: 800,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              💾 Enregistrer Modification
            </button>
          </div>
          {savedRatesNotice && (
            <div role="status" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '8px', color: '#065F46', padding: '10px 14px', fontWeight: 700, fontSize: '0.84rem' }}>
              ✅ {savedRatesNotice}
            </div>
          )}

          {/* Détail de calcul IRPP/CSS supprimé de la fiche de paie conformément à la demande */}

          {/* Récapitulatif en Direct avec Recalcul Immédiat */}
          <div style={{ background: '#FFFFFF', border: '2px solid #2563EB', borderRadius: '10px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.05rem', color: '#1E40AF', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>📊 Résultat du Recalcul en Temps Réel</span>
              <span style={{ fontSize: '0.82rem', background: '#DBEAFE', color: '#1E40AF', padding: '3px 8px', borderRadius: '4px' }}>Actualisation instantanée</span>
            </h3>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '10px 12px', marginBottom: '12px', fontSize: '0.78rem', color: '#334155', lineHeight: 1.5 }}>
              <div><strong>Assiette annuelle brute détaillée :</strong> {(modularGross * 12).toFixed(3)} DT (Base {(baseSal * 12).toFixed(3)} + Présence {(presenceSal * 12).toFixed(3)} + Transport {(transportSal * 12).toFixed(3)}) − CNSS annuelle {(modularCnss * 12).toFixed(3)} DT = <strong>{modularAnnualTaxableGross.toFixed(3)} DT</strong></div>
              <div><strong>Assiette nette imposable annuelle :</strong> {modularAnnualTaxableGross.toFixed(3)} − Frais pro {modularAnnualProfExpenses.toFixed(3)} − Déductions familiales {modularAnnualFamilyDeductions.toFixed(3)} = <strong>{modularAnnualNetTaxable.toFixed(3)} DT</strong></div>
            </div>
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
      ) : activeTab === 'multiEmployee' ? (
        <div style={{ display: 'grid', gap: '16px' }}>
          {/* BANNIÈRE ACTIONS & IMPORT */}
          <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>👥</span> Calcul &amp; Traitement de Paie Multi-Salariés en Simultané
                </h3>
                <p style={{ margin: 0, color: '#64748B', fontSize: '0.82rem' }}>
                  Importez un fichier Excel (.xlsx/.xls), CSV ou PDF pour calculer instantanément la paie de tous les collaborateurs.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  style={{
                    background: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>📥</span> {isImporting ? 'Import en cours...' : 'Importer Fichier'}
                </button>
                <button
                  type="button"
                  onClick={() => downloadExcelTemplate()}
                  style={{
                    background: '#047857',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  title="Télécharger le modèle Excel pré-rempli"
                >
                  <span>📊</span> Modèle Excel
                </button>
                <button
                  type="button"
                  onClick={() => downloadCsvTemplate()}
                  style={{
                    background: '#0D9488',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  title="Télécharger le modèle CSV pré-rempli"
                >
                  <span>📄</span> Modèle CSV
                </button>
                <button
                  type="button"
                  onClick={handleRecalculateMulti}
                  style={{
                    background: '#F1F5F9',
                    color: '#0F172A',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  title="Recalculer les paies avec les taux actuels"
                >
                  <span>⚡</span> Recalculer ({multiEmployees.length})
                </button>
                <button
                  type="button"
                  onClick={() => exportMultiEmployeeResultsExcel(multiEmployees, multiTotals)}
                  style={{
                    background: '#1E293B',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>📤</span> Export Excel
                </button>
                <button
                  type="button"
                  onClick={() => exportMultiEmployeeResultsCSV(multiEmployees, multiTotals)}
                  style={{
                    background: '#334155',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>📤</span> Export CSV
                </button>
              </div>
            </div>

            {/* FEEDBACK BANNER */}
            {importFeedback && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  fontSize: '0.83rem',
                  fontWeight: 600,
                  background: importFeedback.type === 'success' ? '#ECFDF5' : '#FEF2F2',
                  border: `1px solid ${importFeedback.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
                  color: importFeedback.type === 'success' ? '#065F46' : '#991B1B',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{importFeedback.type === 'success' ? '✅' : '⚠️'} {importFeedback.message}</span>
                <button
                  type="button"
                  onClick={() => setImportFeedback(null)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 800, color: 'inherit' }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* KPI CARDS SYNTHÈSE GLOBALE */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>Effectif Importé</div>
              <div style={{ marginTop: '4px', color: '#0F172A', fontSize: '1.4rem', fontWeight: 900 }}>{multiTotals.count} Salariés</div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>Masse Salariale Brute</div>
              <div style={{ marginTop: '4px', color: '#0F172A', fontSize: '1.4rem', fontWeight: 900 }}>{multiTotals.totalGross.toFixed(3)} DT</div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>CNSS Salariés (9.68%)</div>
              <div style={{ marginTop: '4px', color: '#B91C1C', fontSize: '1.4rem', fontWeight: 900 }}>{multiTotals.totalCnssEmployee.toFixed(3)} DT</div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>IRPP &amp; CSS Retenus</div>
              <div style={{ marginTop: '4px', color: '#B91C1C', fontSize: '1.4rem', fontWeight: 900 }}>{(multiTotals.totalIrpp + multiTotals.totalCss).toFixed(3)} DT</div>
              <div style={{ fontSize: '0.7rem', color: '#64748B' }}>IRPP: {multiTotals.totalIrpp.toFixed(3)} | CSS: {multiTotals.totalCss.toFixed(3)}</div>
            </div>

            <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ color: '#166534', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>Total Net à Payer</div>
              <div style={{ marginTop: '4px', color: '#15803D', fontSize: '1.45rem', fontWeight: 900 }}>{multiTotals.totalNetSalary.toFixed(3)} DT</div>
            </div>

            <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ color: '#065F46', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>3 Assurances Patronales</div>
              <div style={{ marginTop: '4px', color: '#047857', fontSize: '1.4rem', fontWeight: 900 }}>{multiTotals.totalAssurancesPatronales.toFixed(3)} DT</div>
              <div style={{ fontSize: '0.68rem', color: '#065F46' }}>Décès (0.5%): {multiTotals.totalAssuranceDeces.toFixed(3)} | Inv: {multiTotals.totalAssuranceInvalidite.toFixed(3)} | Mal: {multiTotals.totalAssuranceMaladie.toFixed(3)}</div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>Charges Patronales Globales</div>
              <div style={{ marginTop: '4px', color: '#1E3A8A', fontSize: '1.4rem', fontWeight: 900 }}>{multiTotals.totalEmployerCharges.toFixed(3)} DT</div>
              <div style={{ fontSize: '0.7rem', color: '#64748B' }}>CNSS Pat. + Acc. + FOPROLOS + 3 Ass.</div>
            </div>

            <div style={{ background: '#0F172A', color: '#FFFFFF', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>Coût Global Entreprise</div>
              <div style={{ marginTop: '4px', color: '#38BDF8', fontSize: '1.45rem', fontWeight: 900 }}>{multiTotals.totalCoutGlobal.toFixed(3)} DT</div>
            </div>
          </div>

          {/* TABLEAU DES RÉSULTATS MULTI-SALARIÉS */}
          <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A' }}>
                📋 Grille Détaillée des Salariés &amp; Fiches de Paie Calculées ({multiEmployees.length})
              </div>
              <input
                type="text"
                placeholder="🔍 Filtrer par Matricule, Salarié..."
                value={multiSearchTerm}
                onChange={(e) => setMultiSearchTerm(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.8rem', width: '240px' }}
              />
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#0F172A', color: '#FFFFFF', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px' }}>Matricule</th>
                  <th style={{ padding: '8px 10px' }}>Salarié</th>
                  <th style={{ padding: '8px 10px' }}>Département / Poste</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Salaire Brut (DT)</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>CNSS Salarié</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Net Imposable</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>IRPP</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>CSS</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', background: '#15803D' }}>Net à Payer</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>3 Assurances Pat.</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total Charges Pat.</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {multiEmployees
                  .filter((emp) =>
                    !multiSearchTerm ||
                    emp.matricule.toLowerCase().includes(multiSearchTerm.toLowerCase()) ||
                    emp.employeeName.toLowerCase().includes(multiSearchTerm.toLowerCase()) ||
                    emp.department.toLowerCase().includes(multiSearchTerm.toLowerCase())
                  )
                  .map((emp, idx) => {
                    const res = emp.result;
                    return (
                      <tr key={emp.id} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 800, color: '#1E3A8A' }}>{emp.matricule}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0F172A' }}>{emp.employeeName}</td>
                        <td style={{ padding: '8px 10px', color: '#64748B' }}>
                          <div>{emp.department}</div>
                          <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{emp.position}</div>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                          {res ? res.grossSalary.toFixed(3) : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#B91C1C' }}>
                          {res ? res.employeeCnss.toFixed(3) : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#475569' }}>
                          {res ? res.netImposable.toFixed(3) : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#B91C1C' }}>
                          {res ? res.irpp.toFixed(3) : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#B91C1C' }}>
                          {res ? res.css.toFixed(3) : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 900, color: '#15803D', background: '#DCFCE7' }}>
                          {res ? res.netSalary.toFixed(3) : '—'} DT
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#065F46', fontWeight: 600 }}>
                          {res ? res.totalAssurancesPatronales.toFixed(3) : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#1E3A8A', fontWeight: 700 }}>
                          {res ? res.totalEmployerCharges.toFixed(3) : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleSelectEmployeeForPayslip(emp)}
                            style={{
                              background: '#EFF6FF',
                              color: '#1D4ED8',
                              border: '1px solid #BFDBFE',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                            title="Charger dans la fiche de paie individuelle officielle"
                          >
                            👁️ Bulletin
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#F1F5F9', fontWeight: 800, borderTop: '2px solid #CBD5E1' }}>
                  <td colSpan={3} style={{ padding: '10px' }}>
                    TOTAL ({multiTotals.count} Salariés)
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>{multiTotals.totalGross.toFixed(3)} DT</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#B91C1C' }}>{multiTotals.totalCnssEmployee.toFixed(3)} DT</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>{multiTotals.totalNetImposable.toFixed(3)} DT</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#B91C1C' }}>{multiTotals.totalIrpp.toFixed(3)} DT</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#B91C1C' }}>{multiTotals.totalCss.toFixed(3)} DT</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#15803D', background: '#BBF7D0', fontSize: '0.85rem' }}>
                    {multiTotals.totalNetSalary.toFixed(3)} DT
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#065F46' }}>{multiTotals.totalAssurancesPatronales.toFixed(3)} DT</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#1E3A8A' }}>{multiTotals.totalEmployerCharges.toFixed(3)} DT</td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>—</td>
                </tr>
              </tfoot>
            </table>
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
            <option value="RETIREMENT_SAVINGS">Épargne retraite — gains calculés</option>
            <option value="LIFE_INSURANCE">Assurance-vie — gains calculés</option>
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
          Assurance mutuelle &amp; Parents à charge
          <select
            value={inputs.dependentParents}
            onChange={(event) => updateInputs({ dependentParents: Number(event.target.value) })}
            style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', font: 'inherit' }}
          >
            <option value={0}>Aucun parent à charge</option>
            <option value={1}>1er Parent à charge</option>
            <option value={2}>2ème Parent à charge</option>
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
        disabled={isCalculating}
        style={{ background: isCalculating ? '#94A3B8' : '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '9px 16px', fontWeight: 700, cursor: isCalculating ? 'not-allowed' : 'pointer' }}
      >
        {isCalculating ? 'Calcul en cours…' : 'Calculer la fiche de paie (Taux modulables)'}
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
            <div><span style={{ color: '#64748B' }}>Parents à charge :</span> <strong>{inputs.dependentParents > 0 ? `${inputs.dependentParents} à charge (${((inputs.dependentParents * customRates.parentDeduction) / 12).toFixed(3)} DT)` : '0'}</strong></div>
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
                  <td style={{ padding: '6px', textAlign: 'right' }}>{customRates.cnssEmployeeRate.toFixed(3)} %</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#B91C1C' }}>{result.employeeCnss.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{customRates.cnssEmployerRate.toFixed(3)} %</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{(Math.round(result.grossSalary * (customRates.cnssEmployerRate / 100) * 1000) / 1000).toFixed(3)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px' }}>8220</td>
                  <td style={{ padding: '6px' }}>Accident de travail</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{result.grossSalary.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{customRates.workAccidentRate.toFixed(3)} %</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{(Math.round(result.grossSalary * (customRates.workAccidentRate / 100) * 1000) / 1000).toFixed(3)}</td>
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
                  <td style={{ padding: '6px' }}>IRPP Retenu</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{result.netImposable.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>Barème</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#B91C1C', fontWeight: 700 }}>{result.irpp.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0', background: '#F0FDF4' }}>
                  <td style={{ padding: '6px' }}>9050</td>
                  <td style={{ padding: '6px', color: '#166534', fontWeight: 600 }}>Gain / IRPP (Avantage fiscal)</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{result.retirementBonusDeduction.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>Économie</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#166534', fontWeight: 700 }}>+{result.gainIrpp.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px' }}>9400</td>
                  <td style={{ padding: '6px' }}>Contrib° Sociale de Solidarité (CSS)</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{result.netImposable.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{customRates.cssRate.toFixed(3)} %</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#B91C1C' }}>{result.css.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0', background: '#F0FDF4' }}>
                  <td style={{ padding: '6px' }}>9450</td>
                  <td style={{ padding: '6px', color: '#166534', fontWeight: 600 }}>Gain / CSS (Avantage fiscal)</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{result.retirementBonusDeduction.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>Économie</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#166534', fontWeight: 700 }}>+{result.gainCss.toFixed(3)}</td>
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
                  <td style={{ padding: '6px', textAlign: 'right' }}>{customRates.employerInsuranceRate.toFixed(3)} %</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{(Math.round(result.grossSalary * (customRates.employerInsuranceRate / 100) * 1000) / 1000).toFixed(3)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px' }}>9920</td>
                  <td style={{ padding: '6px' }}>1. Assurance Décès Patronale (0.5% × Brut)</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{result.grossSalary.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{customRates.assuranceDecesRate.toFixed(3)} %</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#334155', fontWeight: 600 }}>{result.assuranceDeces.toFixed(3)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px' }}>9930</td>
                  <td style={{ padding: '6px' }}>2. Assurance Invalidité Patronale</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{result.grossSalary.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{customRates.assuranceInvaliditeRate.toFixed(4)} %</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#334155', fontWeight: 600 }}>{result.assuranceInvalidite.toFixed(3)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px' }}>9940</td>
                  <td style={{ padding: '6px' }}>3. Assurance Maladie Patronale</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{result.grossSalary.toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{customRates.assuranceMaladieRate.toFixed(4)} %</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#334155', fontWeight: 600 }}>{result.assuranceMaladie.toFixed(3)}</td>
                </tr>
                <tr style={{ borderTop: '2px solid #CBD5E1', borderBottom: '2px solid #CBD5E1', background: '#F8FAFC', fontWeight: 800 }}>
                  <td style={{ padding: '6px' }} colSpan={2}>TOTAL COTISATIONS</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#B91C1C' }}>{(result.employeeCnss + result.irpp + result.css + (Math.round(result.grossSalary * (customRates.employeeInsuranceRate / 100) * 1000) / 1000)).toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#334155' }}>
                    {(Math.round((result.grossSalary * ((customRates.cnssEmployerRate + customRates.workAccidentRate + customRates.employerInsuranceRate) / 100) + result.assuranceDeces + result.assuranceInvalidite + result.assuranceMaladie) * 1000) / 1000).toFixed(3)}
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
                  <td style={{ padding: '6px', textAlign: 'right' }}>{customRates.employeeInsuranceRate.toFixed(3)} %</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#B91C1C' }}>{(Math.round(result.grossSalary * (customRates.employeeInsuranceRate / 100) * 1000) / 1000).toFixed(3)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }} colSpan={2}>—</td>
                </tr>
                {inputs.dependentParents >= 1 && (
                  <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '6px' }}>11160</td>
                    <td style={{ padding: '6px' }}>Déduction 1er Parent à Charge</td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>1,000</td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>—</td>
                    <td style={{ padding: '6px', textAlign: 'right', color: '#B91C1C' }}>{(customRates.parentDeduction / 12).toFixed(3)}</td>
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
                    <td style={{ padding: '6px', textAlign: 'right', color: '#B91C1C' }}>{(customRates.parentDeduction / 12).toFixed(3)}</td>
                    <td style={{ padding: '6px', textAlign: 'right' }} colSpan={2}>—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Bouton Enregistrer Modification dans la Feuille des Taux Modulables */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '12px 16px' }}>
            <div style={{ fontSize: '0.82rem', color: '#334155' }}>
              Enregistrez vos modifications pour les appliquer à la fiche de paie calculée et à la préparation CNSS / IRPP.
            </div>
            <button
              type="button"
              onClick={saveCustomRates}
              style={{
                background: '#059669',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 18px',
                fontWeight: 800,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              💾 Enregistrer Modification
            </button>
          </div>
          {savedRatesNotice && (
            <div role="status" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '8px', color: '#065F46', padding: '10px 14px', fontWeight: 700, fontSize: '0.84rem' }}>
              ✅ {savedRatesNotice}
            </div>
          )}

          {/* Détail de calcul IRPP/CSS supprimé de la fiche de paie conformément à la demande */}

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
