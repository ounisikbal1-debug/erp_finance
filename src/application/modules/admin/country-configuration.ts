export interface PayrollTaxBracketInput {
  order: number;
  minAmount: number;
  maxAmount: number | null;
  rate: number;
}

export interface TaxRateInput {
  code: string;
  name: string;
  rate: number;
  isDefault: boolean;
  purchaseVatRecoverable?: boolean;
}

export interface PayrollConfigInput {
  employeeCnssRate?: number;
  employerCnssRate?: number;
  employerWorkAccidentRate?: number;
  foprolosRate?: number;
  cssRate?: number;
  profExpensesRate?: number;
  profExpensesMaxCap?: number;
  headOfFamilyDeduction?: number;
  childDeduction?: number;
  parentDeduction?: number;
}

export interface CountryCreationInput {
  code: string;
  name: string;
  currencyCode: string;
  currencySymbol: string;
  stampDuty: number | null;
  corporateTax: number | null;
  payrollConfig?: PayrollConfigInput;
  taxRates?: TaxRateInput[];
  taxBrackets?: PayrollTaxBracketInput[];
}

export class CountryConfigurationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CountryConfigurationValidationError';
  }
}

const PAYROLL_CONFIG_RATE_FIELDS = [
  'employeeCnssRate',
  'employerCnssRate',
  'employerWorkAccidentRate',
  'foprolosRate',
  'cssRate',
  'profExpensesRate',
] as const;

const PAYROLL_CONFIG_AMOUNT_FIELDS = [
  'profExpensesMaxCap',
  'headOfFamilyDeduction',
  'childDeduction',
  'parentDeduction',
] as const;
const PAYROLL_CONFIG_FIELDS = [...PAYROLL_CONFIG_RATE_FIELDS, ...PAYROLL_CONFIG_AMOUNT_FIELDS] as const;

const COUNTRY_PROFILE_FIELDS = [
  'name',
  'currencyCode',
  'currencySymbol',
  'stampDuty',
  'corporateTax',
  'salesReceivableAccountCode',
  'salesRevenueAccountCode',
  'salesVatAccountCode',
  'salesStampDutyAccountCode',
  'stockAssetAccountCode',
  'stockAdjustmentAccountCode',
  'productionWipAccountCode',
  'productionLaborAccountCode',
  'productionOverheadAccountCode',
  'purchaseExpenseAccountCode',
  'purchaseVatAccountCode',
  'realizedFxGainAccountCode',
  'realizedFxLossAccountCode',
  'unrealizedFxGainAccountCode',
  'unrealizedFxLossAccountCode',
  'isDefault',
] as const;

function getInputObject(value: unknown, description: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CountryConfigurationValidationError(`${description} doit être un objet.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownFields(input: Record<string, unknown>, fields: readonly string[], description: string): void {
  const unknownFields = Object.keys(input).filter((field) => !fields.includes(field));
  if (unknownFields.length > 0) {
    throw new CountryConfigurationValidationError(`${description} contient des champs inconnus : ${unknownFields.join(', ')}.`);
  }
}

function validateRate(value: unknown, description: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new CountryConfigurationValidationError(`${description} doit être un taux fini compris entre 0 et 100.`);
  }
  return value;
}

function validateAmount(value: unknown, description: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new CountryConfigurationValidationError(`${description} doit être un montant fini positif ou nul.`);
  }
  return value;
}

function toMillimes(amount: number): number | null {
  const millimes = Math.round(amount * 1000);
  return Number.isSafeInteger(millimes) && Math.abs(amount * 1000 - millimes) < 1e-7
    ? millimes
    : null;
}

export function validateCountryProfileUpdate(value: unknown) {
  const input = getInputObject(value, 'La configuration du pays');
  rejectUnknownFields(input, COUNTRY_PROFILE_FIELDS, 'La configuration du pays');
  if (Object.keys(input).length === 0) throw new CountryConfigurationValidationError('Aucun paramètre de pays à mettre à jour.');

  const result: {
    name?: string;
    currencyCode?: string;
    currencySymbol?: string;
    stampDuty?: number | null;
    corporateTax?: number | null;
    salesReceivableAccountCode?: string | null;
    salesRevenueAccountCode?: string | null;
    salesVatAccountCode?: string | null;
    salesStampDutyAccountCode?: string | null;
    stockAssetAccountCode?: string | null;
    stockAdjustmentAccountCode?: string | null;
    productionWipAccountCode?: string | null;
    productionLaborAccountCode?: string | null;
    productionOverheadAccountCode?: string | null;
    purchaseExpenseAccountCode?: string | null;
    purchaseVatAccountCode?: string | null;
    realizedFxGainAccountCode?: string | null;
    realizedFxLossAccountCode?: string | null;
    unrealizedFxGainAccountCode?: string | null;
    unrealizedFxLossAccountCode?: string | null;
    isDefault?: boolean;
  } = {};
  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || !input.name.trim()) throw new CountryConfigurationValidationError('Le nom du pays est obligatoire.');
    result.name = input.name.trim();
  }
  if (input.currencyCode !== undefined) {
    if (typeof input.currencyCode !== 'string' || !/^[A-Za-z]{3}$/.test(input.currencyCode.trim())) {
      throw new CountryConfigurationValidationError('Le code devise doit contenir trois lettres.');
    }
    result.currencyCode = input.currencyCode.trim().toUpperCase();
  }
  if (input.currencySymbol !== undefined) {
    if (typeof input.currencySymbol !== 'string' || !input.currencySymbol.trim()) {
      throw new CountryConfigurationValidationError('Le symbole monétaire est obligatoire.');
    }
    result.currencySymbol = input.currencySymbol.trim();
  }
  if (input.stampDuty !== undefined) {
    result.stampDuty = input.stampDuty === null ? null : validateAmount(input.stampDuty, 'Le droit de timbre');
  }
  if (input.corporateTax !== undefined) {
    result.corporateTax = input.corporateTax === null ? null : validateRate(input.corporateTax, 'Le taux d’impôt société');
  }
  for (const field of [
    'salesReceivableAccountCode',
    'salesRevenueAccountCode',
    'salesVatAccountCode',
    'salesStampDutyAccountCode',
    'stockAssetAccountCode',
    'stockAdjustmentAccountCode',
    'productionWipAccountCode',
    'productionLaborAccountCode',
    'productionOverheadAccountCode',
    'purchaseExpenseAccountCode',
    'purchaseVatAccountCode',
    'realizedFxGainAccountCode',
    'realizedFxLossAccountCode',
    'unrealizedFxGainAccountCode',
    'unrealizedFxLossAccountCode',
  ] as const) {
    const valueForField = input[field];
    if (valueForField === null) {
      result[field] = null;
    } else if (valueForField !== undefined) {
      if (typeof valueForField !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/.test(valueForField.trim())) {
        throw new CountryConfigurationValidationError(`Le code de compte ${field} est invalide.`);
      }
      result[field] = valueForField.trim();
    }
  }
  if (input.isDefault !== undefined) {
    if (typeof input.isDefault !== 'boolean') throw new CountryConfigurationValidationError('Le paramètre pays par défaut doit être booléen.');
    result.isDefault = input.isDefault;
  }
  return result;
}

export function validatePayrollConfig(value: unknown) {
  const input = getInputObject(value, 'La configuration de paie');
  const validFields = [...PAYROLL_CONFIG_RATE_FIELDS, ...PAYROLL_CONFIG_AMOUNT_FIELDS];
  rejectUnknownFields(input, validFields, 'La configuration de paie');
  if (Object.keys(input).length === 0) throw new CountryConfigurationValidationError('Aucun paramètre de paie à mettre à jour.');

  const result: PayrollConfigInput = {};
  for (const field of PAYROLL_CONFIG_RATE_FIELDS) {
    if (input[field] !== undefined) result[field] = validateRate(input[field], field);
  }
  for (const field of PAYROLL_CONFIG_AMOUNT_FIELDS) {
    if (input[field] !== undefined) result[field] = validateAmount(input[field], field);
  }
  return result;
}

export function validateCompletePayrollConfig(value: unknown): PayrollConfigInput {
  const result = validatePayrollConfig(value);
  const missingFields = PAYROLL_CONFIG_FIELDS.filter((field) => result[field] === undefined);
  if (missingFields.length > 0) {
    throw new CountryConfigurationValidationError(`La configuration initiale de paie doit fournir tous les paramètres : ${missingFields.join(', ')}.`);
  }
  return result;
}

export function validatePayrollTaxBrackets(value: unknown): PayrollTaxBracketInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CountryConfigurationValidationError('Le barème doit contenir au moins une tranche.');
  }
  const brackets = value.map((item, index) => {
    const input = getInputObject(item, `La tranche ${index + 1}`);
    rejectUnknownFields(input, ['order', 'minAmount', 'maxAmount', 'rate'], `La tranche ${index + 1}`);
    if (!Number.isSafeInteger(input.order) || (input.order as number) < 1) {
      throw new CountryConfigurationValidationError(`L’ordre de la tranche ${index + 1} doit être un entier positif.`);
    }
    const minAmount = validateAmount(input.minAmount, `Le seuil minimal de la tranche ${index + 1}`);
    const maxAmount = input.maxAmount === undefined || input.maxAmount === null
      ? null
      : validateAmount(input.maxAmount, `Le seuil maximal de la tranche ${index + 1}`);
    if (toMillimes(minAmount) === null || (maxAmount !== null && toMillimes(maxAmount) === null)) {
      throw new CountryConfigurationValidationError(`Les seuils de la tranche ${index + 1} doivent être exprimés au millime près.`);
    }
    if (maxAmount !== null && maxAmount <= minAmount) {
      throw new CountryConfigurationValidationError(`Le seuil maximal de la tranche ${index + 1} doit dépasser son seuil minimal.`);
    }
    return {
      order: input.order as number,
      minAmount,
      maxAmount,
      rate: validateRate(input.rate, `Le taux de la tranche ${index + 1}`),
    };
  }).sort((left, right) => left.order - right.order);

  brackets.forEach((bracket, index) => {
    if (bracket.order !== index + 1) throw new CountryConfigurationValidationError('Les ordres des tranches doivent se suivre à partir de 1.');
    if (index < brackets.length - 1) {
      const next = brackets[index + 1];
      const currentMaximum = bracket.maxAmount === null ? null : toMillimes(bracket.maxAmount);
      const nextMinimum = toMillimes(next.minAmount);
      const boundaryGap = currentMaximum === null || nextMinimum === null
        ? null
        : nextMinimum - currentMaximum;
      if (boundaryGap !== 0 && boundaryGap !== 1) {
        throw new CountryConfigurationValidationError('Les seuils doivent se suivre au millime, sans chevauchement ni intervalle supérieur à un millime.');
      }
    } else if (bracket.maxAmount !== null) {
      throw new CountryConfigurationValidationError('La dernière tranche doit couvrir les montants sans plafond maximal.');
    }
  });
  if (brackets[0].minAmount !== 0) throw new CountryConfigurationValidationError('Le premier seuil du barème doit commencer à zéro.');
  return brackets;
}

export function validateTaxRates(value: unknown): TaxRateInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CountryConfigurationValidationError('La liste de taux fiscaux doit contenir au moins un taux.');
  }
  const rates = value.map((item, index) => {
    const input = getInputObject(item, `Le taux ${index + 1}`);
    rejectUnknownFields(input, ['code', 'name', 'rate', 'isDefault', 'purchaseVatRecoverable'], `Le taux ${index + 1}`);
    if (typeof input.code !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(input.code.trim())) {
      throw new CountryConfigurationValidationError(`Le code du taux ${index + 1} est invalide.`);
    }
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 120) {
      throw new CountryConfigurationValidationError(`Le nom du taux ${index + 1} est obligatoire et limité à 120 caractères.`);
    }
    if (input.isDefault !== undefined && typeof input.isDefault !== 'boolean') {
      throw new CountryConfigurationValidationError(`Le statut par défaut du taux ${index + 1} doit être booléen.`);
    }
    if (input.purchaseVatRecoverable !== undefined && typeof input.purchaseVatRecoverable !== 'boolean') {
      throw new CountryConfigurationValidationError(`La récupérabilité de la TVA à l’achat du taux ${index + 1} doit être booléenne.`);
    }
    return {
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      rate: validateRate(input.rate, `Le taux ${index + 1}`),
      isDefault: input.isDefault === true,
      purchaseVatRecoverable: input.purchaseVatRecoverable === true,
    };
  });
  const codes = new Set(rates.map((item) => item.code));
  if (codes.size !== rates.length) throw new CountryConfigurationValidationError('Les codes de taux fiscaux doivent être uniques.');
  if (rates.filter((item) => item.isDefault).length > 1) {
    throw new CountryConfigurationValidationError('Un seul taux fiscal peut être défini par défaut.');
  }
  return rates;
}

export function validateCountryCreation(value: unknown): CountryCreationInput {
  const input = getInputObject(value, 'Le nouveau pays');
  rejectUnknownFields(
    input,
    ['code', 'name', 'currencyCode', 'currencySymbol', 'stampDuty', 'corporateTax', 'payrollConfig', 'taxRates', 'taxBrackets'],
    'Le nouveau pays',
  );
  if (typeof input.code !== 'string' || !/^[A-Za-z]{2,3}$/.test(input.code.trim())) {
    throw new CountryConfigurationValidationError('Le code pays doit contenir deux ou trois lettres.');
  }
  if (typeof input.name !== 'string' || !input.name.trim()) throw new CountryConfigurationValidationError('Le nom du pays est obligatoire.');
  if (typeof input.currencyCode !== 'string' || !/^[A-Za-z]{3}$/.test(input.currencyCode.trim())) {
    throw new CountryConfigurationValidationError('Le code devise doit contenir trois lettres.');
  }
  if (typeof input.currencySymbol !== 'string' || !input.currencySymbol.trim()) {
    throw new CountryConfigurationValidationError('Le symbole monétaire est obligatoire.');
  }
  const country: CountryCreationInput = {
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    currencyCode: input.currencyCode.trim().toUpperCase(),
    currencySymbol: input.currencySymbol.trim(),
    stampDuty: input.stampDuty === undefined || input.stampDuty === null
      ? null
      : validateAmount(input.stampDuty, 'Le droit de timbre'),
    corporateTax: input.corporateTax === undefined || input.corporateTax === null
      ? null
      : validateRate(input.corporateTax, 'Le taux d’impôt société'),
  };
  if (input.payrollConfig !== undefined) country.payrollConfig = validateCompletePayrollConfig(input.payrollConfig);
  if (input.taxRates !== undefined) country.taxRates = validateTaxRates(input.taxRates);
  if (input.taxBrackets !== undefined) country.taxBrackets = validatePayrollTaxBrackets(input.taxBrackets);
  return country;
}
