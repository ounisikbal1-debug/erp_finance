import { HrRequestError } from './errors';
import { validatePayslipPeriod, validatePayslipRubriques } from './employee-validation';
import { MAX_PAYROLL_AMOUNT } from './payroll-amount';

export interface PayrollCalculationInput {
  countryCode: string;
  period?: string;
  fiscalBenefitType?: 'COMPLEMENTARY_RETIREMENT' | 'RETIREMENT_SAVINGS' | 'LIFE_INSURANCE';
  baseSalary?: number;
  grossSalary?: number;
  presenceBonus?: number;
  transportBonus?: number;
  complementaryRetirementRate?: number;
  maritalStatus?: 'SINGLE' | 'MARRIED';
  isHeadOfFamily?: boolean;
  childrenCount?: number;
  dependentParents?: number;
  rubriques?: Array<{
    code: string;
    category: 'PRIME' | 'PRIME_NON_COTISABLE' | 'AVANTAGE_FISCAL' | 'RETENUE';
    amount: number;
  }>;
}

function optionalAmount(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < 0
    || value > MAX_PAYROLL_AMOUNT
    || !Number.isSafeInteger(Math.round(value * 1000))
  ) {
    throw new HrRequestError(`${key} doit être un montant positif ou nul exprimable au millime.`, 400);
  }
  return value;
}

function optionalCount(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new HrRequestError(`${key} doit être un entier positif ou nul.`, 400);
  }
  return value;
}

export function validatePayrollCalculationInput(data: unknown, countryCodeOverride?: string): PayrollCalculationInput {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HrRequestError('Données de calcul de paie invalides.', 400);
  }
  const input = data as Record<string, unknown>;
  const countryCode = countryCodeOverride ?? input.countryCode;
  if (typeof countryCode !== 'string' || !countryCode.trim()) {
    throw new HrRequestError('Le pays de calcul de paie est obligatoire.', 400);
  }
  const period = input.period === undefined ? undefined : validatePayslipPeriod(input.period);
  const benefitTypes = ['COMPLEMENTARY_RETIREMENT', 'RETIREMENT_SAVINGS', 'LIFE_INSURANCE'] as const;
  const requestedBenefitType = input.fiscalBenefitType;
  if (requestedBenefitType !== undefined
    && (typeof requestedBenefitType !== 'string' || !benefitTypes.includes(requestedBenefitType as typeof benefitTypes[number]))) {
    throw new HrRequestError('Le dispositif d’avantage fiscal sélectionné est invalide.', 400);
  }
  const fiscalBenefitType = requestedBenefitType as typeof benefitTypes[number] | undefined;

  const baseSalary = optionalAmount(input, 'baseSalary');
  const grossSalary = optionalAmount(input, 'grossSalary');
  if (baseSalary === undefined && grossSalary === undefined) {
    throw new HrRequestError('Le salaire de base est obligatoire pour calculer la paie.', 400);
  }
  if (baseSalary !== undefined && grossSalary !== undefined && baseSalary !== grossSalary) {
    throw new HrRequestError('baseSalary et grossSalary ne peuvent pas contenir deux montants différents.', 400);
  }

  const requestedRetirementRate = input.complementaryRetirementRate;
  if (
    requestedRetirementRate !== undefined
    && (typeof requestedRetirementRate !== 'number'
      || !Number.isFinite(requestedRetirementRate)
      || requestedRetirementRate < 0
      || requestedRetirementRate > 100)
  ) {
    throw new HrRequestError('Le taux de retraite complémentaire doit être compris entre 0 et 100%.', 400);
  }
  const complementaryRetirementRate = typeof requestedRetirementRate === 'number'
    ? requestedRetirementRate
    : undefined;

  const requestedHeadOfFamily = input.isHeadOfFamily;
  if (requestedHeadOfFamily !== undefined && typeof requestedHeadOfFamily !== 'boolean') {
    throw new HrRequestError('Le statut chef de famille doit être booléen.', 400);
  }
  const isHeadOfFamily = typeof requestedHeadOfFamily === 'boolean' ? requestedHeadOfFamily : undefined;

  const requestedMaritalStatus = input.maritalStatus;
  if (requestedMaritalStatus !== undefined && requestedMaritalStatus !== 'SINGLE' && requestedMaritalStatus !== 'MARRIED') {
    throw new HrRequestError('La situation familiale est invalide.', 400);
  }
  const maritalStatus = requestedMaritalStatus === 'SINGLE' || requestedMaritalStatus === 'MARRIED'
    ? requestedMaritalStatus
    : undefined;
  const presenceBonus = optionalAmount(input, 'presenceBonus');
  const transportBonus = optionalAmount(input, 'transportBonus');
  const childrenCount = optionalCount(input, 'childrenCount');
  const dependentParents = optionalCount(input, 'dependentParents');
  return {
    countryCode: countryCode.trim().toUpperCase(),
    ...(period === undefined ? {} : { period }),
    fiscalBenefitType: fiscalBenefitType ?? 'COMPLEMENTARY_RETIREMENT',
    ...(baseSalary === undefined ? {} : { baseSalary }),
    ...(grossSalary === undefined ? {} : { grossSalary }),
    ...(presenceBonus === undefined ? {} : { presenceBonus }),
    ...(transportBonus === undefined ? {} : { transportBonus }),
    ...(complementaryRetirementRate === undefined ? {} : { complementaryRetirementRate }),
    ...(maritalStatus === undefined ? {} : { maritalStatus }),
    ...(isHeadOfFamily === undefined ? {} : { isHeadOfFamily }),
    ...(childrenCount === undefined ? {} : { childrenCount }),
    ...(dependentParents === undefined ? {} : { dependentParents }),
    rubriques: validatePayslipRubriques(input.rubriques),
  };
}
