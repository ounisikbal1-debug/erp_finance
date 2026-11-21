export const MAX_CUSTOMS_TARIFF_RATE_PERCENT = 1_000;

export const CUSTOMS_TAX_BASE_COMPONENTS = [
  'CIF',
  'CUSTOMS_DUTY',
  'CONSUMPTION_DUTY',
  'FODEC',
  'IMPORT_VAT',
] as const;

export type CustomsTaxBaseComponent = (typeof CUSTOMS_TAX_BASE_COMPONENTS)[number];
export type CustomsTariffTax = 'customsDuty' | 'consumptionDuty' | 'fodec' | 'importVat' | 'customsServiceFee';

const AVAILABLE_BASE_COMPONENTS: Record<CustomsTariffTax, readonly CustomsTaxBaseComponent[]> = {
  customsDuty: ['CIF'],
  consumptionDuty: ['CIF', 'CUSTOMS_DUTY'],
  fodec: ['CIF', 'CUSTOMS_DUTY', 'CONSUMPTION_DUTY'],
  importVat: ['CIF', 'CUSTOMS_DUTY', 'CONSUMPTION_DUTY', 'FODEC'],
  customsServiceFee: ['CIF', 'CUSTOMS_DUTY', 'CONSUMPTION_DUTY', 'FODEC', 'IMPORT_VAT'],
};

export interface CustomsTariffInput {
  tariffCode: string;
  description: string;
  customsDutyRate: number;
  consumptionDutyRate: number;
  fodecRate: number;
  importVatRate: number;
  customsServiceFeeRate: number;
  customsDutyBaseComponents: CustomsTaxBaseComponent[];
  consumptionDutyBaseComponents: CustomsTaxBaseComponent[];
  fodecBaseComponents: CustomsTaxBaseComponent[];
  importVatBaseComponents: CustomsTaxBaseComponent[];
  customsServiceFeeBaseComponents: CustomsTaxBaseComponent[];
  effectiveFrom: string;
  effectiveTo: string | null;
  originCountryCode: string | null;
  preferentialAgreementCode: string | null;
  preferentialCustomsDutyRate: number | null;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceReference: string | null;
}

export class CustomsTariffError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'CustomsTariffError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, description: string): Record<string, unknown> {
  if (!isRecord(value)) throw new CustomsTariffError(`${description} doit être un objet.`);
  return value;
}

function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new CustomsTariffError(`${field} doit contenir entre 1 et ${maxLength} caractères.`);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  return requireString(value, field, maxLength);
}

function parseDate(value: unknown, field: string, optional = false): string | null {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new CustomsTariffError(`${field} doit être une date au format AAAA-MM-JJ.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new CustomsTariffError(`${field} n’est pas une date valide.`);
  }
  return value;
}

function parseRate(value: unknown, field: string, optional = false): number | null {
  if (optional && (value === undefined || value === null)) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_CUSTOMS_TARIFF_RATE_PERCENT) {
    throw new CustomsTariffError(`${field} doit être un taux fini compris entre 0 et ${MAX_CUSTOMS_TARIFF_RATE_PERCENT} %.`);
  }
  return value;
}

function parseBaseComponents(value: unknown, field: string, tax: CustomsTariffTax): CustomsTaxBaseComponent[] {
  const available = AVAILABLE_BASE_COMPONENTS[tax];
  if (!Array.isArray(value) || value.length === 0) {
    throw new CustomsTariffError(`${field} doit contenir au moins une composante d’assiette.`);
  }
  const components: CustomsTaxBaseComponent[] = [];
  for (const component of value) {
    if (typeof component !== 'string'
      || !CUSTOMS_TAX_BASE_COMPONENTS.includes(component as CustomsTaxBaseComponent)
      || !available.includes(component as CustomsTaxBaseComponent)) {
      throw new CustomsTariffError(`${field} contient une composante absente ou postérieure à cette taxe.`);
    }
    if (components.includes(component as CustomsTaxBaseComponent)) {
      throw new CustomsTariffError(`${field} ne peut pas contenir deux fois la même composante.`);
    }
    components.push(component as CustomsTaxBaseComponent);
  }
  return components;
}

export function validateCustomsTariffInput(value: unknown): CustomsTariffInput {
  const input = requireRecord(value, 'Le barème douanier');
  const tariffCode = requireString(input.tariffCode, 'Le code NGP', 10);
  if (!/^\d{10}$/.test(tariffCode)) {
    throw new CustomsTariffError('Le code NGP doit contenir exactement 10 chiffres.');
  }

  const originCountryCode = optionalString(input.originCountryCode, 'Le code pays d’origine', 2)?.toUpperCase() ?? null;
  if (originCountryCode && !/^[A-Z]{2}$/.test(originCountryCode)) {
    throw new CustomsTariffError('Le code pays d’origine doit utiliser le format ISO à deux lettres.');
  }
  const preferentialAgreementCode = optionalString(input.preferentialAgreementCode, 'Le code de l’accord préférentiel', 40)
    ?.toUpperCase() ?? null;
  if (preferentialAgreementCode && !/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(preferentialAgreementCode)) {
    throw new CustomsTariffError('Le code de l’accord préférentiel contient des caractères non autorisés.');
  }
  const preferentialCustomsDutyRate = parseRate(
    input.preferentialCustomsDutyRate,
    'Le taux préférentiel de droit de douane',
    true,
  );
  const hasPreference = originCountryCode !== null
    || preferentialAgreementCode !== null
    || preferentialCustomsDutyRate !== null;
  if (hasPreference && !(originCountryCode && preferentialAgreementCode && preferentialCustomsDutyRate !== null)) {
    throw new CustomsTariffError('Une préférence doit préciser ensemble le pays d’origine, l’accord et le taux préférentiel.');
  }

  const effectiveFrom = parseDate(input.effectiveFrom, 'La date de début')!;
  const effectiveTo = parseDate(input.effectiveTo, 'La date de fin', true);
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new CustomsTariffError('La date de fin ne peut pas précéder la date de début.');
  }

  const sourceName = optionalString(input.sourceName, 'Le nom de la source', 160);
  const sourceUrl = optionalString(input.sourceUrl, 'L’URL de la source', 2_000);
  if (sourceUrl) {
    let url: URL;
    try {
      url = new URL(sourceUrl);
    } catch {
      throw new CustomsTariffError('L’URL de la source est invalide.');
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new CustomsTariffError('La source doit utiliser une URL HTTPS sans identifiants.');
    }
  }

  return {
    tariffCode,
    description: requireString(input.description, 'La description', 300),
    customsDutyRate: parseRate(input.customsDutyRate, 'Le taux DD')!,
    consumptionDutyRate: parseRate(input.consumptionDutyRate, 'Le taux DC')!,
    fodecRate: parseRate(input.fodecRate, 'Le taux FODEC')!,
    importVatRate: parseRate(input.importVatRate, 'Le taux de TVA à l’importation')!,
    customsServiceFeeRate: parseRate(input.customsServiceFeeRate, 'Le taux de RPD')!,
    customsDutyBaseComponents: parseBaseComponents(input.customsDutyBaseComponents, 'L’assiette DD', 'customsDuty'),
    consumptionDutyBaseComponents: parseBaseComponents(input.consumptionDutyBaseComponents, 'L’assiette DC', 'consumptionDuty'),
    fodecBaseComponents: parseBaseComponents(input.fodecBaseComponents, 'L’assiette FODEC', 'fodec'),
    importVatBaseComponents: parseBaseComponents(input.importVatBaseComponents, 'L’assiette TVA importation', 'importVat'),
    customsServiceFeeBaseComponents: parseBaseComponents(input.customsServiceFeeBaseComponents, 'L’assiette RPD', 'customsServiceFee'),
    effectiveFrom,
    effectiveTo,
    originCountryCode,
    preferentialAgreementCode,
    preferentialCustomsDutyRate,
    sourceName,
    sourceUrl,
    sourceReference: optionalString(input.sourceReference, 'La référence de la source', 500),
  };
}

export function assertOfficialCustomsSource(sourceUrl: string | null): void {
  if (!sourceUrl) throw new CustomsTariffError('Une source officielle est requise pour vérifier un barème.', 422);
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new CustomsTariffError('L’URL de la source officielle est invalide.', 422);
  }
  const isOfficialDomain = url.hostname === 'douane.gov.tn' || url.hostname.endsWith('.douane.gov.tn');
  if (url.protocol !== 'https:' || !isOfficialDomain) {
    throw new CustomsTariffError('La vérification d’un barème requiert une source HTTPS du domaine officiel douane.gov.tn.', 422);
  }
}

export interface CustomsTariffForCalculation {
  customsDutyRate: number;
  consumptionDutyRate: number;
  fodecRate: number;
  importVatRate: number;
  customsServiceFeeRate: number;
  preferentialCustomsDutyRate: number | null;
  originCountryCode: string | null;
  preferentialAgreementCode: string | null;
  customsDutyBaseComponents: string;
  consumptionDutyBaseComponents: string;
  fodecBaseComponents: string;
  importVatBaseComponents: string;
  customsServiceFeeBaseComponents: string;
}

export interface CustomsImportCalculationInput {
  cifValue: number;
  originCountryCode?: string;
  preferentialAgreementCode?: string;
  preferenceEligibilityConfirmed?: boolean;
  preferenceEvidenceReference?: string;
}

export interface CustomsImportCalculation {
  cifValue: number;
  customsDuty: number;
  consumptionDuty: number;
  fodec: number;
  importVat: number;
  customsServiceFee: number;
  totalTaxes: number;
  totalLandedCost: number;
  preferentialCustomsDutyApplied: boolean;
}

function parseStoredComponents(value: string, field: string, tax: CustomsTariffTax): CustomsTaxBaseComponent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new CustomsTariffError(`${field} du barème est invalide.`, 409);
  }
  return parseBaseComponents(parsed, field, tax);
}

function toMillimes(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new CustomsTariffError(`${field} doit être un montant positif ou nul.`);
  const millimes = Math.round(value * 1_000);
  if (!Number.isSafeInteger(millimes)) throw new CustomsTariffError(`${field} dépasse la précision prise en charge.`);
  return millimes;
}

function calculateTax(base: number, ratePercent: number): number {
  return Math.round((base * ratePercent) / 100);
}

export function calculateCustomsImport(
  tariff: CustomsTariffForCalculation,
  input: CustomsImportCalculationInput,
): CustomsImportCalculation {
  const cifMillimes = toMillimes(input.cifValue, 'La valeur CAF');
  const originCountryCode = input.originCountryCode?.trim().toUpperCase();
  const agreementCode = input.preferentialAgreementCode?.trim().toUpperCase();
  const preferenceConfirmed = input.preferenceEligibilityConfirmed === true;
  const evidenceReference = input.preferenceEvidenceReference?.trim();
  if (preferenceConfirmed && (!originCountryCode || !agreementCode || !evidenceReference)) {
    throw new CustomsTariffError('Une préférence exige un pays d’origine, un accord et une référence de justificatif.');
  }
  const preferenceMatches = preferenceConfirmed
    && originCountryCode === tariff.originCountryCode
    && agreementCode === tariff.preferentialAgreementCode
    && tariff.preferentialCustomsDutyRate !== null;
  if (preferenceConfirmed && !preferenceMatches) {
    throw new CustomsTariffError('Le pays d’origine ou l’accord ne correspond pas au barème préférentiel fourni.', 422);
  }

  const values: Record<CustomsTaxBaseComponent, number> = {
    CIF: cifMillimes,
    CUSTOMS_DUTY: 0,
    CONSUMPTION_DUTY: 0,
    FODEC: 0,
    IMPORT_VAT: 0,
  };
  const amounts: Record<CustomsTariffTax, number> = {
    customsDuty: 0,
    consumptionDuty: 0,
    fodec: 0,
    importVat: 0,
    customsServiceFee: 0,
  };
  const taxDefinitions: Array<{
    output: CustomsTariffTax;
    field: keyof CustomsTariffForCalculation;
    tax: CustomsTariffTax;
    rate: number;
  }> = [
    { output: 'customsDuty', field: 'customsDutyBaseComponents', tax: 'customsDuty', rate: preferenceMatches ? tariff.preferentialCustomsDutyRate! : tariff.customsDutyRate },
    { output: 'consumptionDuty', field: 'consumptionDutyBaseComponents', tax: 'consumptionDuty', rate: tariff.consumptionDutyRate },
    { output: 'fodec', field: 'fodecBaseComponents', tax: 'fodec', rate: tariff.fodecRate },
    { output: 'importVat', field: 'importVatBaseComponents', tax: 'importVat', rate: tariff.importVatRate },
    { output: 'customsServiceFee', field: 'customsServiceFeeBaseComponents', tax: 'customsServiceFee', rate: tariff.customsServiceFeeRate },
  ];

  for (const definition of taxDefinitions) {
    const components = parseStoredComponents(String(tariff[definition.field]), `L’assiette ${definition.tax}`, definition.tax);
    const base = components.reduce((sum, component) => sum + values[component], 0);
    const amount = calculateTax(base, definition.rate);
    amounts[definition.output] = amount;
    if (definition.output === 'customsDuty') values.CUSTOMS_DUTY = amount;
    if (definition.output === 'consumptionDuty') values.CONSUMPTION_DUTY = amount;
    if (definition.output === 'fodec') values.FODEC = amount;
    if (definition.output === 'importVat') values.IMPORT_VAT = amount;
  }
  const totalTaxes = Object.values(amounts).reduce((sum, amount) => sum + amount, 0);
  return {
    cifValue: cifMillimes / 1_000,
    customsDuty: amounts.customsDuty / 1_000,
    consumptionDuty: amounts.consumptionDuty / 1_000,
    fodec: amounts.fodec / 1_000,
    importVat: amounts.importVat / 1_000,
    customsServiceFee: amounts.customsServiceFee / 1_000,
    totalTaxes: totalTaxes / 1_000,
    totalLandedCost: (cifMillimes + totalTaxes) / 1_000,
    preferentialCustomsDutyApplied: preferenceMatches,
  };
}
