export type CountryTaxRateInput = {
  sequence: number;
  code: string | null;
  name: string;
  rateType: string;
  rateValue: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  lowerBoundInclusive: boolean;
  upperBoundInclusive: boolean;
  unit: string;
  currencyCode: string | null;
  conditionsJson: string | null;
};

export type CountryTaxThresholdInput = {
  code: string;
  name: string;
  comparator: string;
  amount: number;
  upperAmount: number | null;
  unit: string;
  currencyCode: string | null;
  period: string | null;
  conditionsJson: string | null;
};

export type CountryTaxRuleInput = {
  jurisdiction: {
    kind: string;
    code: string;
    name: string;
    parentCode: string | null;
  };
  code: string;
  name: string;
  taxType: string;
  calculationMethod: string;
  taxBase: string;
  currencyCode: string | null;
  filingPeriod: string | null;
  roundingScale: number;
  roundingMethod: string;
  applicationOrder: number;
  isCumulative: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  appliesToJson: string | null;
  conditionsJson: string | null;
  formula: string | null;
  sourceName: string;
  sourceUrl: string;
  sourceReference: string | null;
  sourceRetrievedAt: Date;
  notes: string | null;
  rates: CountryTaxRateInput[];
  thresholds: CountryTaxThresholdInput[];
};

export class CountryTaxRuleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CountryTaxRuleValidationError';
  }
}

const TAX_TYPES = new Set([
  'CORPORATE_INCOME_TAX',
  'PERSONAL_INCOME_TAX',
  'VALUE_ADDED_TAX',
  'SALES_TAX',
  'PAYROLL_TAX',
  'SOCIAL_SECURITY',
  'WITHHOLDING_TAX',
  'STAMP_DUTY',
  'CUSTOMS_DUTY',
  'EXCISE',
  'PROPERTY_TAX',
  'OTHER',
]);

const CALCULATION_METHODS = new Set([
  'FLAT',
  'PROGRESSIVE',
  'THRESHOLD',
  'PER_UNIT',
  'COMPOUND',
  'MANUAL',
]);

const RATE_TYPES = new Set([
  'PERCENT',
  'FIXED_AMOUNT',
  'PER_UNIT',
  'ZERO',
  'EXEMPT',
  'FORMULA',
]);

const JURISDICTION_KINDS = new Set([
  'COUNTRY',
  'FEDERAL',
  'STATE',
  'PROVINCE',
  'REGION',
  'COUNTY',
  'CITY',
  'EMIRATE',
  'FREE_ZONE',
  'TERRITORY',
  'LOCAL',
]);

const COMPARATORS = new Set(['GT', 'GTE', 'LT', 'LTE', 'EQ', 'BETWEEN']);

type JsonRecord = Record<string, unknown>;

function getObject(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CountryTaxRuleValidationError(`${label} doit être un objet.`);
  }
  return value as JsonRecord;
}

function rejectUnknownFields(value: JsonRecord, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new CountryTaxRuleValidationError(`${label} contient des champs inconnus : ${unknown.join(', ')}.`);
  }
}

function requiredString(value: unknown, label: string, maxLength = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new CountryTaxRuleValidationError(`${label} est obligatoire et limité à ${maxLength} caractères.`);
  }
  return value.trim();
}

function optionalString(value: unknown, label: string, maxLength = 500): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new CountryTaxRuleValidationError(`${label} doit être un texte limité à ${maxLength} caractères.`);
  }
  return value.trim() || null;
}

function codeString(value: unknown, label: string): string {
  const code = requiredString(value, label, 80);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(code)) {
    throw new CountryTaxRuleValidationError(`${label} contient des caractères non autorisés.`);
  }
  return code.toUpperCase();
}

function requiredNumber(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new CountryTaxRuleValidationError(`${label} doit être un nombre fini supérieur ou égal à ${minimum}.`);
  }
  return value;
}

function optionalNumber(value: unknown, label: string): number | null {
  return value === undefined || value === null ? null : requiredNumber(value, label);
}

function parseDate(value: unknown, label: string, optional = false): Date | null {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    throw new CountryTaxRuleValidationError(`${label} doit être une date ISO valide.`);
  }
  const date = new Date(value);
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isFinite(date.getTime())
    || calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() !== month - 1
    || calendarDate.getUTCDate() !== day) {
    throw new CountryTaxRuleValidationError(`${label} doit être une date ISO valide.`);
  }
  return date;
}

export function parseCountryTaxDate(value: unknown, label: string): Date {
  return parseDate(value, label)!;
}

function jsonObject(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object') {
    throw new CountryTaxRuleValidationError(`${label} doit être un objet ou un tableau JSON.`);
  }
  try {
    return JSON.stringify(value);
  } catch {
    throw new CountryTaxRuleValidationError(`${label} n’est pas sérialisable en JSON.`);
  }
}

function optionalCurrencyCode(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^[A-Za-z]{3}$/.test(value.trim())) {
    throw new CountryTaxRuleValidationError(`${label} doit contenir trois lettres.`);
  }
  return value.trim().toUpperCase();
}

function validateRate(value: unknown, index: number): CountryTaxRateInput {
  const input = getObject(value, `Le taux ${index + 1}`);
  rejectUnknownFields(input, [
    'sequence',
    'code',
    'name',
    'rateType',
    'rateValue',
    'lowerBound',
    'upperBound',
    'lowerBoundInclusive',
    'upperBoundInclusive',
    'unit',
    'currencyCode',
    'conditions',
  ], `Le taux ${index + 1}`);
  const sequence = requiredNumber(input.sequence, `L’ordre du taux ${index + 1}`, 1);
  if (!Number.isInteger(sequence)) throw new CountryTaxRuleValidationError('L’ordre de chaque taux doit être un entier.');
  const rateType = requiredString(input.rateType, `Le type du taux ${index + 1}`).toUpperCase();
  if (!RATE_TYPES.has(rateType)) throw new CountryTaxRuleValidationError(`Le type ${rateType} du taux ${index + 1} est inconnu.`);
  const rateValue = optionalNumber(input.rateValue, `La valeur du taux ${index + 1}`);
  if (rateType === 'PERCENT' && (rateValue === null || rateValue > 100)) {
    throw new CountryTaxRuleValidationError(`Le taux en pourcentage ${index + 1} doit être compris entre 0 et 100.`);
  }
  if (['FIXED_AMOUNT', 'PER_UNIT'].includes(rateType) && rateValue === null) {
    throw new CountryTaxRuleValidationError(`Le taux ${index + 1} doit avoir une valeur.`);
  }
  if (['ZERO', 'EXEMPT'].includes(rateType) && rateValue !== null && rateValue !== 0) {
    throw new CountryTaxRuleValidationError(`Le taux ${index + 1} de type ${rateType} doit avoir une valeur nulle.`);
  }
  const lowerBound = optionalNumber(input.lowerBound, `Le seuil inférieur du taux ${index + 1}`);
  const upperBound = optionalNumber(input.upperBound, `Le seuil supérieur du taux ${index + 1}`);
  if ((input.lowerBoundInclusive !== undefined && typeof input.lowerBoundInclusive !== 'boolean')
    || (input.upperBoundInclusive !== undefined && typeof input.upperBoundInclusive !== 'boolean')) {
    throw new CountryTaxRuleValidationError(`Les inclusions des bornes du taux ${index + 1} doivent être booléennes.`);
  }
  if (lowerBound !== null && upperBound !== null && upperBound <= lowerBound) {
    throw new CountryTaxRuleValidationError(`Le seuil supérieur du taux ${index + 1} doit dépasser le seuil inférieur.`);
  }
  return {
    sequence,
    code: optionalString(input.code, `Le code du taux ${index + 1}`, 80)?.toUpperCase() ?? null,
    name: requiredString(input.name, `Le libellé du taux ${index + 1}`),
    rateType,
    rateValue,
    lowerBound,
    upperBound,
    lowerBoundInclusive: input.lowerBoundInclusive === undefined ? true : input.lowerBoundInclusive === true,
    upperBoundInclusive: input.upperBoundInclusive === true,
    unit: requiredString(input.unit, `L’unité du taux ${index + 1}`, 60).toUpperCase(),
    currencyCode: optionalCurrencyCode(input.currencyCode, `La devise du taux ${index + 1}`),
    conditionsJson: jsonObject(input.conditions, `Les conditions du taux ${index + 1}`),
  };
}

function validateThreshold(value: unknown, index: number): CountryTaxThresholdInput {
  const input = getObject(value, `Le seuil ${index + 1}`);
  rejectUnknownFields(input, [
    'code',
    'name',
    'comparator',
    'amount',
    'upperAmount',
    'unit',
    'currencyCode',
    'period',
    'conditions',
  ], `Le seuil ${index + 1}`);
  const comparator = requiredString(input.comparator, `L’opérateur du seuil ${index + 1}`).toUpperCase();
  if (!COMPARATORS.has(comparator)) throw new CountryTaxRuleValidationError(`L’opérateur ${comparator} du seuil ${index + 1} est inconnu.`);
  const amount = requiredNumber(input.amount, `La valeur du seuil ${index + 1}`);
  const upperAmount = optionalNumber(input.upperAmount, `La borne haute du seuil ${index + 1}`);
  if (comparator === 'BETWEEN' && (upperAmount === null || upperAmount <= amount)) {
    throw new CountryTaxRuleValidationError(`Le seuil ${index + 1} BETWEEN doit avoir une borne haute supérieure.`);
  }
  return {
    code: codeString(input.code, `Le code du seuil ${index + 1}`),
    name: requiredString(input.name, `Le libellé du seuil ${index + 1}`),
    comparator,
    amount,
    upperAmount,
    unit: requiredString(input.unit, `L’unité du seuil ${index + 1}`, 60).toUpperCase(),
    currencyCode: optionalCurrencyCode(input.currencyCode, `La devise du seuil ${index + 1}`),
    period: optionalString(input.period, `La période du seuil ${index + 1}`, 60),
    conditionsJson: jsonObject(input.conditions, `Les conditions du seuil ${index + 1}`),
  };
}

export function validateCountryTaxRuleCreation(value: unknown): CountryTaxRuleInput {
  const input = getObject(value, 'La règle fiscale');
  rejectUnknownFields(input, [
    'jurisdiction',
    'code',
    'name',
    'taxType',
    'calculationMethod',
    'taxBase',
    'currencyCode',
    'filingPeriod',
    'roundingScale',
    'roundingMethod',
    'applicationOrder',
    'isCumulative',
    'effectiveFrom',
    'effectiveTo',
    'appliesTo',
    'conditions',
    'formula',
    'sourceName',
    'sourceUrl',
    'sourceReference',
    'sourceRetrievedAt',
    'notes',
    'rates',
    'thresholds',
  ], 'La règle fiscale');
  const jurisdictionInput = getObject(input.jurisdiction, 'La juridiction');
  rejectUnknownFields(jurisdictionInput, ['kind', 'code', 'name', 'parentCode'], 'La juridiction');
  const jurisdictionKind = requiredString(jurisdictionInput.kind, 'Le type de juridiction').toUpperCase();
  if (!JURISDICTION_KINDS.has(jurisdictionKind)) {
    throw new CountryTaxRuleValidationError(`Le type de juridiction ${jurisdictionKind} est inconnu.`);
  }
  const effectiveFrom = parseDate(input.effectiveFrom, 'La date de début')!;
  const effectiveTo = parseDate(input.effectiveTo, 'La date de fin', true);
  if (effectiveTo && effectiveTo <= effectiveFrom) {
    throw new CountryTaxRuleValidationError('La date de fin doit être postérieure à la date de début.');
  }
  const taxType = requiredString(input.taxType, 'Le type de taxe').toUpperCase();
  if (!TAX_TYPES.has(taxType)) throw new CountryTaxRuleValidationError(`Le type de taxe ${taxType} est inconnu.`);
  const calculationMethod = requiredString(input.calculationMethod, 'La méthode de calcul').toUpperCase();
  if (!CALCULATION_METHODS.has(calculationMethod)) {
    throw new CountryTaxRuleValidationError(`La méthode de calcul ${calculationMethod} est inconnue.`);
  }
  const rawRates = input.rates === undefined ? [] : input.rates;
  const rawThresholds = input.thresholds === undefined ? [] : input.thresholds;
  if (!Array.isArray(rawRates) || !Array.isArray(rawThresholds)) {
    throw new CountryTaxRuleValidationError('Les taux et seuils doivent être des tableaux.');
  }
  const rates = rawRates.map(validateRate);
  const thresholds = rawThresholds.map(validateThreshold);
  if (!rates.length && !thresholds.length) {
    throw new CountryTaxRuleValidationError('La règle doit contenir au moins un taux ou un seuil.');
  }
  if (new Set(rates.map(({ sequence }) => sequence)).size !== rates.length) {
    throw new CountryTaxRuleValidationError('Les ordres des taux doivent être uniques.');
  }
  if (new Set(thresholds.map(({ code }) => code)).size !== thresholds.length) {
    throw new CountryTaxRuleValidationError('Les codes des seuils doivent être uniques.');
  }
  if (calculationMethod === 'PROGRESSIVE' && rates.length) {
    const progressiveRates = [...rates].sort((a, b) => a.sequence - b.sequence);
    if (progressiveRates.some((rate) => rate.rateType !== 'PERCENT' || rate.lowerBound === null)) {
      throw new CountryTaxRuleValidationError('Un barème progressif exige des taux en pourcentage avec un seuil inférieur pour chaque tranche.');
    }
    if (progressiveRates[0].lowerBound !== 0 || progressiveRates[progressiveRates.length - 1].upperBound !== null) {
      throw new CountryTaxRuleValidationError('Un barème progressif doit commencer à zéro et finir par une tranche sans plafond.');
    }
    for (let index = 1; index < progressiveRates.length; index += 1) {
      if (progressiveRates[index - 1].upperBound !== progressiveRates[index].lowerBound) {
        throw new CountryTaxRuleValidationError('Les tranches progressives doivent être contiguës et sans chevauchement.');
      }
    }
  }
  const sourceName = requiredString(input.sourceName, 'La source officielle', 200);
  const sourceUrl = requiredString(input.sourceUrl, 'L’URL source', 2000);
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    throw new CountryTaxRuleValidationError('L’URL source est invalide.');
  }
  if (parsedUrl.protocol !== 'https:') throw new CountryTaxRuleValidationError('L’URL source doit utiliser HTTPS.');
  const roundingScale = input.roundingScale === undefined ? 2 : requiredNumber(input.roundingScale, 'La précision d’arrondi');
  if (!Number.isInteger(roundingScale) || roundingScale > 6) {
    throw new CountryTaxRuleValidationError('La précision d’arrondi doit être un entier entre 0 et 6.');
  }
  const roundingMethod = input.roundingMethod === undefined
    ? 'HALF_UP'
    : requiredString(input.roundingMethod, 'La méthode d’arrondi').toUpperCase();
  if (roundingMethod !== 'HALF_UP') throw new CountryTaxRuleValidationError('La méthode d’arrondi prise en charge est HALF_UP.');
  const rateCodes = rates.flatMap(({ code }) => code ? [code] : []);
  if (new Set(rateCodes).size !== rateCodes.length) {
    throw new CountryTaxRuleValidationError('Les codes des taux doivent être uniques dans une règle.');
  }
  const formula = optionalString(input.formula, 'La formule', 2000);
  if (rates.some((rate) => rate.rateType === 'FORMULA') && !formula) {
    throw new CountryTaxRuleValidationError('Une formule est obligatoire pour un taux de type FORMULA.');
  }
  return {
    jurisdiction: {
      kind: jurisdictionKind,
      code: codeString(jurisdictionInput.code, 'Le code de juridiction'),
      name: requiredString(jurisdictionInput.name, 'Le nom de juridiction'),
      parentCode: jurisdictionInput.parentCode === undefined || jurisdictionInput.parentCode === null
        ? null
        : codeString(jurisdictionInput.parentCode, 'Le code de la juridiction parente'),
    },
    code: codeString(input.code, 'Le code de règle'),
    name: requiredString(input.name, 'Le nom de règle'),
    taxType,
    calculationMethod,
    taxBase: requiredString(input.taxBase, 'La base fiscale', 100).toUpperCase(),
    currencyCode: optionalCurrencyCode(input.currencyCode, 'La devise de la règle'),
    filingPeriod: optionalString(input.filingPeriod, 'La périodicité déclarative', 100),
    roundingScale,
    roundingMethod,
    applicationOrder: input.applicationOrder === undefined
      ? 0
      : requiredNumber(input.applicationOrder, 'L’ordre d’application'),
    isCumulative: input.isCumulative === true,
    effectiveFrom,
    effectiveTo,
    appliesToJson: jsonObject(input.appliesTo, 'Le champ d’application'),
    conditionsJson: jsonObject(input.conditions, 'Les conditions de la règle'),
    formula,
    sourceName,
    sourceUrl: parsedUrl.toString(),
    sourceReference: optionalString(input.sourceReference, 'La référence source', 500),
    sourceRetrievedAt: parseDate(input.sourceRetrievedAt, 'La date de consultation source')!,
    notes: optionalString(input.notes, 'Les notes', 4000),
    rates,
    thresholds,
  };
}

export type CountryTaxRuleCalculation = {
  status: string;
  calculationMethod: string;
  currencyCode: string | null;
  roundingScale: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  conditionsJson: string | null;
  rates: Array<{
    sequence: number;
    rateType: string;
    rateValue: number | null;
    lowerBound: number | null;
    upperBound: number | null;
    lowerBoundInclusive: boolean;
    upperBoundInclusive: boolean;
    unit: string;
    conditionsJson: string | null;
  }>;
};

export type CountryTaxCalculationResult =
  | { status: 'CALCULATED'; amount: number; currencyCode: string | null; taxableBase: number }
  | { status: 'BLOCKED'; reason: string };

export function calculateCountryTaxRule(input: {
  rule: CountryTaxRuleCalculation;
  taxableBase: number;
  currencyCode?: string | null;
  effectiveDate: Date;
  eligibilityConfirmed?: boolean;
  units?: number;
}): CountryTaxCalculationResult {
  const { rule } = input;
  if (!['APPROVED_FOR_TESTING', 'APPROVED'].includes(rule.status)) {
    return { status: 'BLOCKED', reason: 'La règle n’est pas approuvée pour les calculs.' };
  }
  if (!Number.isFinite(input.taxableBase) || input.taxableBase < 0) {
    return { status: 'BLOCKED', reason: 'La base taxable doit être un nombre fini positif ou nul.' };
  }
  if (!(input.effectiveDate instanceof Date) || !Number.isFinite(input.effectiveDate.getTime())
    || input.effectiveDate < rule.effectiveFrom || (rule.effectiveTo && input.effectiveDate > rule.effectiveTo)) {
    return { status: 'BLOCKED', reason: 'La date est hors de la période d’effet de la règle.' };
  }
  if (rule.currencyCode && input.currencyCode?.toUpperCase() !== rule.currencyCode.toUpperCase()) {
    return { status: 'BLOCKED', reason: 'La devise de la base ne correspond pas à celle de la règle.' };
  }
  if ((rule.conditionsJson || rule.rates.some((rate) => rate.conditionsJson)) && input.eligibilityConfirmed !== true) {
    return { status: 'BLOCKED', reason: 'La règle comporte des conditions d’éligibilité à confirmer.' };
  }
  const rates = [...rule.rates].sort((a, b) => a.sequence - b.sequence);
  if (!rates.length) return { status: 'BLOCKED', reason: 'Aucun taux calculable n’est configuré.' };
  let tax = 0;
  if (rule.calculationMethod === 'FLAT') {
    if (rates.length !== 1) return { status: 'BLOCKED', reason: 'Une règle forfaitaire doit avoir un seul taux.' };
    const rate = rates[0];
    if (rate.rateType === 'ZERO' || rate.rateType === 'EXEMPT') {
      tax = 0;
    } else if (rate.rateType === 'PERCENT' && rate.rateValue !== null) {
      if (rate.lowerBound !== null && (input.taxableBase < rate.lowerBound
        || (!rate.lowerBoundInclusive && input.taxableBase === rate.lowerBound))) tax = 0;
      else if (rate.upperBound !== null && (input.taxableBase > rate.upperBound
        || (!rate.upperBoundInclusive && input.taxableBase === rate.upperBound))) tax = 0;
      else tax = input.taxableBase * rate.rateValue / 100;
    } else if (rate.rateType === 'FIXED_AMOUNT' && rate.rateValue !== null) {
      tax = rate.rateValue;
    } else {
      return { status: 'BLOCKED', reason: 'Le type de taux n’est pas calculable par cette méthode.' };
    }
  } else if (rule.calculationMethod === 'PROGRESSIVE') {
    if (rates.some((rate) => rate.rateType !== 'PERCENT' || rate.rateValue === null || rate.lowerBound === null)
      || rates[0].lowerBound !== 0 || rates[rates.length - 1].upperBound !== null) {
      return { status: 'BLOCKED', reason: 'Le barème progressif est incomplet ou invalide.' };
    }
    for (let index = 0; index < rates.length; index += 1) {
      const rate = rates[index];
      const lower = rate.lowerBound!;
      const upper = rate.upperBound ?? input.taxableBase;
      if (index > 0 && rates[index - 1].upperBound !== lower) {
        return { status: 'BLOCKED', reason: 'Les tranches progressives ne sont pas contiguës.' };
      }
      tax += Math.max(0, Math.min(input.taxableBase, upper) - lower) * rate.rateValue! / 100;
    }
  } else if (rule.calculationMethod === 'PER_UNIT') {
    if (!Number.isFinite(input.units) || (input.units ?? -1) < 0 || rates.length !== 1
      || rates[0].rateType !== 'PER_UNIT' || rates[0].rateValue === null) {
      return { status: 'BLOCKED', reason: 'La quantité ou le taux unitaire est invalide.' };
    }
    tax = input.units! * rates[0].rateValue!;
  } else {
    return { status: 'BLOCKED', reason: 'La méthode nécessite une formule métier non disponible.' };
  }
  const scale = 10 ** rule.roundingScale;
  return {
    status: 'CALCULATED',
    amount: Math.round((tax + Number.EPSILON) * scale) / scale,
    currencyCode: rule.currencyCode,
    taxableBase: input.taxableBase,
  };
}
