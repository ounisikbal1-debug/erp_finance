import { HrRequestError } from './errors';

export interface PayrollAvailability {
  countryCode: string;
  supported: boolean;
  configured: boolean;
  configurationSource: 'CURRENT_COUNTRY_PROFILE';
  versionedSnapshotsApplied: false;
  approvalIsLegalValidation: false;
}

export interface PayrollTaxBracket {
  order: number;
  minAmount: number;
  maxAmount: number | null;
  rate: number;
}

export interface PayrollConfigValues {
  employeeCnssRate: number;
  employerCnssRate: number;
  employerWorkAccidentRate: number;
  foprolosRate: number;
  cssRate: number;
  profExpensesRate: number;
  profExpensesMaxCap: number;
  headOfFamilyDeduction: number;
  childDeduction: number;
  parentDeduction: number;
}

const PAYROLL_RATES: Array<keyof PayrollConfigValues> = [
  'employeeCnssRate',
  'employerCnssRate',
  'employerWorkAccidentRate',
  'foprolosRate',
  'cssRate',
  'profExpensesRate',
];

const PAYROLL_AMOUNTS: Array<keyof PayrollConfigValues> = [
  'profExpensesMaxCap',
  'headOfFamilyDeduction',
  'childDeduction',
  'parentDeduction',
];

export function hasUsablePayrollConfig(config: PayrollConfigValues): boolean {
  return PAYROLL_RATES.every((key) => Number.isFinite(config[key]) && config[key] >= 0 && config[key] <= 100)
    && PAYROLL_AMOUNTS.every((key) => Number.isFinite(config[key]) && config[key] >= 0);
}

function toMillimes(amount: number): number | null {
  const millimes = Math.round(amount * 1000);
  return Number.isSafeInteger(millimes) && Math.abs(amount * 1000 - millimes) < 1e-7
    ? millimes
    : null;
}

export function hasUsablePayrollTaxBrackets(brackets: readonly PayrollTaxBracket[]): boolean {
  if (brackets.length === 0) return false;
  const ordered = [...brackets].sort((left, right) => left.order - right.order);
  if (ordered[0].minAmount !== 0) return false;
  for (let index = 0; index < ordered.length; index += 1) {
    const bracket = ordered[index];
    if (
      bracket.order !== index + 1
      || !Number.isFinite(bracket.minAmount)
      || bracket.minAmount < 0
      || toMillimes(bracket.minAmount) === null
      || !Number.isFinite(bracket.rate)
      || bracket.rate < 0
      || bracket.rate > 100
    ) return false;
    if (bracket.maxAmount !== null && (
      !Number.isFinite(bracket.maxAmount)
      || bracket.maxAmount <= bracket.minAmount
      || toMillimes(bracket.maxAmount) === null
    )) return false;
    if (index < ordered.length - 1) {
      if (bracket.maxAmount === null) return false;
      const currentMaximum = toMillimes(bracket.maxAmount);
      const nextMinimum = toMillimes(ordered[index + 1].minAmount);
      if (currentMaximum === null || nextMinimum === null) return false;
      const boundaryGap = nextMinimum - currentMaximum;
      const isContiguous = boundaryGap === 0 || boundaryGap === 1;
      if (!isContiguous) return false;
    } else if (bracket.maxAmount !== null) {
      return false;
    }
  }
  return true;
}

export function canUsePayrollCalculator(availability: PayrollAvailability | null): boolean {
  return availability?.supported === true && availability.configured === true;
}

export function getPayrollAvailabilityMessage(availability: PayrollAvailability): string | null {
  if (!availability.supported) {
    return `Paramètres de paie éditables pour ${availability.countryCode}, mais le moteur applique actuellement des règles tunisiennes codées dans le calcul (cotisations et déductions). La configuration seule ne rend pas la simulation de ce pays disponible; faites adapter et vérifier ses règles par un spécialiste avant toute utilisation.`;
  }
  if (!availability.configured) {
    return 'Paramètres de paie absents ou barème IRPP incomplet/incohérent. Ajustez le profil pays puis relancez la vérification.';
  }
  return null;
}

export function getPayrollAvailability(
  countryCode: string,
  hasPayrollConfig: boolean,
  taxBrackets: readonly PayrollTaxBracket[],
  payrollConfig?: PayrollConfigValues | null,
): PayrollAvailability {
  const normalizedCountryCode = countryCode.trim().toUpperCase();
  const supported = normalizedCountryCode === 'TN';
  const configUsable = payrollConfig === undefined || payrollConfig === null
    ? true
    : hasUsablePayrollConfig(payrollConfig);
  return {
    countryCode: normalizedCountryCode,
    supported,
    configured: supported && hasPayrollConfig && configUsable && hasUsablePayrollTaxBrackets(taxBrackets),
    configurationSource: 'CURRENT_COUNTRY_PROFILE',
    versionedSnapshotsApplied: false,
    approvalIsLegalValidation: false,
  };
}

export function assertPayrollConfigurationAvailable(
  countryCode: string,
  hasPayrollConfig: boolean,
  taxBrackets: readonly PayrollTaxBracket[],
  payrollConfig?: PayrollConfigValues | null,
): void {
  const availability = getPayrollAvailability(countryCode, hasPayrollConfig, taxBrackets, payrollConfig);
  if (!availability.supported) {
    throw new HrRequestError(
      `Le calcul de paie n’est pas encore pris en charge pour le pays ${availability.countryCode}.`,
      422,
    );
  }
  if (!availability.configured) {
    throw new HrRequestError(
      'Le calcul de paie est indisponible : les paramètres tunisiens doivent être valides et le barème IRPP complet et cohérent doit être défini.',
      422,
    );
  }
}
