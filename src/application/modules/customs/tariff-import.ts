import {
  assertOfficialCustomsSource,
  validateCustomsTariffInput,
  type CustomsTariffInput,
} from './tariff';

const MAX_CSV_BYTES = 500_000;
const MAX_CSV_ROWS = 5_000;

const REQUIRED_COLUMNS = [
  'tariffCode',
  'description',
  'customsDutyRate',
  'consumptionDutyRate',
  'fodecRate',
  'importVatRate',
  'customsServiceFeeRate',
  'effectiveFrom',
] as const;
const OPTIONAL_COLUMNS = [
  'effectiveTo',
  'originCountryCode',
  'preferentialAgreementCode',
  'preferentialCustomsDutyRate',
] as const;
const BASE_FIELDS = [
  'customsDutyBaseComponents',
  'consumptionDutyBaseComponents',
  'fodecBaseComponents',
  'importVatBaseComponents',
  'customsServiceFeeBaseComponents',
] as const;

export type CustomsTariffCsvColumn = (typeof REQUIRED_COLUMNS)[number] | (typeof OPTIONAL_COLUMNS)[number];
export type CustomsTariffCsvDelimiter = ',' | ';' | '\t';

export const CUSTOMS_TARIFF_CSV_TEMPLATE_COLUMNS: Record<CustomsTariffCsvColumn, string> = {
  tariffCode: 'Code NGP (10 chiffres)',
  description: 'Désignation officielle',
  customsDutyRate: 'DD (%)',
  consumptionDutyRate: 'DC (%)',
  fodecRate: 'FODEC (%)',
  importVatRate: 'TVA import (%)',
  customsServiceFeeRate: 'RPD (%)',
  effectiveFrom: 'Date début (AAAA-MM-JJ)',
  effectiveTo: 'Date fin (facultative, AAAA-MM-JJ)',
  originCountryCode: 'Code pays d’origine (facultatif)',
  preferentialAgreementCode: 'Accord préférentiel (facultatif)',
  preferentialCustomsDutyRate: 'DD préférentiel (%)',
};

export function createCustomsTariffCsvTemplate(): string {
  const headers = Object.values(CUSTOMS_TARIFF_CSV_TEMPLATE_COLUMNS)
    .map((header) => `"${header.replace(/"/g, '""')}"`);
  return `\uFEFF${headers.join(';')}\r\n`;
}

export interface CustomsTariffCsvImportSettings {
  sourceName: string;
  sourceUrl: string;
  sourceReference: string;
  delimiter: CustomsTariffCsvDelimiter;
  decimalSeparator: '.' | ',';
  dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY';
  columns: Partial<Record<CustomsTariffCsvColumn, string>>;
  bases: Record<(typeof BASE_FIELDS)[number], string[]>;
}

export interface CustomsTariffCsvPreview {
  canImport: boolean;
  rowCount: number;
  validCount: number;
  errors: string[];
  records: CustomsTariffInput[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseCsvRows(csv: string, delimiter: CustomsTariffCsvDelimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = csv.charCodeAt(0) === 0xfeff ? 1 : 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else if (character === '"') {
      throw new Error('Le CSV contient un guillemet non échappé.');
    } else {
      cell += character;
    }
    if (rows.length > MAX_CSV_ROWS + 1) throw new Error(`Le CSV dépasse ${MAX_CSV_ROWS} lignes.`);
  }
  if (quoted) throw new Error('Le CSV contient un champ entre guillemets non terminé.');
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}

function parseDate(value: string, format: CustomsTariffCsvImportSettings['dateFormat']): string {
  const normalized = value.trim();
  const match = format === 'YYYY-MM-DD'
    ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized)
    : /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(normalized);
  if (!match) throw new Error(`date invalide; format attendu ${format}.`);
  const iso = format === 'YYYY-MM-DD'
    ? `${match[1]}-${match[2]}-${match[3]}`
    : `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    throw new Error('date calendaire invalide.');
  }
  return iso;
}

function parseNumber(value: string, decimalSeparator: CustomsTariffCsvImportSettings['decimalSeparator'], label: string): number {
  let normalized = value.trim();
  if (decimalSeparator === ',') {
    if (normalized.includes('.')) throw new Error(`${label}: séparateur décimal inattendu.`);
    normalized = normalized.replace(',', '.');
  } else if (normalized.includes(',')) {
    throw new Error(`${label}: séparateur décimal inattendu.`);
  }
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error(`${label}: nombre invalide.`);
  const result = Number(normalized);
  if (!Number.isFinite(result)) throw new Error(`${label}: nombre non fini.`);
  return result;
}

function validateSettings(value: unknown): CustomsTariffCsvImportSettings {
  if (!isRecord(value)
    || typeof value.sourceName !== 'string'
    || typeof value.sourceUrl !== 'string'
    || typeof value.sourceReference !== 'string'
    || (value.delimiter !== ',' && value.delimiter !== ';' && value.delimiter !== '\t')
    || (value.decimalSeparator !== '.' && value.decimalSeparator !== ',')
    || (value.dateFormat !== 'YYYY-MM-DD' && value.dateFormat !== 'DD/MM/YYYY')
    || !isRecord(value.columns)
    || !isRecord(value.bases)) {
    throw new Error('Les paramètres d’import du barème sont invalides.');
  }
  const sourceName = value.sourceName.trim();
  const sourceUrl = value.sourceUrl.trim();
  const sourceReference = value.sourceReference.trim();
  if (!sourceName || !sourceReference) throw new Error('La source et sa référence/version sont obligatoires.');
  assertOfficialCustomsSource(sourceUrl);
  const columns = value.columns as Partial<Record<CustomsTariffCsvColumn, string>>;
  for (const key of REQUIRED_COLUMNS) {
    if (typeof columns[key] !== 'string' || !columns[key]!.trim()) {
      throw new Error(`Associez une colonne source à « ${key} ».`);
    }
  }
  if (Object.entries(columns).some(([key, header]) => (
    ![...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].includes(key as CustomsTariffCsvColumn)
    || typeof header !== 'string'
    || header.trim().length > 120
  ))) {
    throw new Error('La correspondance des colonnes contient une entrée invalide.');
  }
  const bases = value.bases as CustomsTariffCsvImportSettings['bases'];
  if (Object.keys(bases).length !== BASE_FIELDS.length
    || BASE_FIELDS.some((key) => !Array.isArray(bases[key]) || bases[key].length === 0)) {
    throw new Error('Définissez explicitement chaque assiette fiscale selon les règles validées de l’entité.');
  }
  return {
    sourceName,
    sourceUrl,
    sourceReference,
    delimiter: value.delimiter,
    decimalSeparator: value.decimalSeparator,
    dateFormat: value.dateFormat,
    columns,
    bases,
  };
}

export function previewCustomsTariffCsv(value: unknown, settingsValue: unknown): CustomsTariffCsvPreview {
  if (typeof value !== 'string' || new TextEncoder().encode(value).byteLength > MAX_CSV_BYTES) {
    throw new Error(`Le CSV doit être du texte UTF-8 de ${MAX_CSV_BYTES / 1000} Ko maximum.`);
  }
  const settings = validateSettings(settingsValue);
  const rows = parseCsvRows(value, settings.delimiter);
  if (rows.length < 2) throw new Error('Le CSV doit contenir une ligne d’en-tête et au moins un barème.');
  if (rows.length - 1 > MAX_CSV_ROWS) throw new Error(`Le CSV dépasse ${MAX_CSV_ROWS} barèmes.`);
  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new Error('Les en-têtes CSV doivent être renseignés et uniques.');
  }
  const headerIndexes = new Map(headers.map((header, index) => [header, index]));
  for (const key of REQUIRED_COLUMNS) {
    if (!headerIndexes.has(settings.columns[key]!)) {
      throw new Error(`La colonne « ${settings.columns[key]} » associée à « ${key} » est absente du CSV.`);
    }
  }
  for (const [key, header] of Object.entries(settings.columns)) {
    if (header && !headerIndexes.has(header)) {
      throw new Error(`La colonne « ${header} » associée à « ${key} » est absente du CSV.`);
    }
  }

  const errors: string[] = [];
  const records: CustomsTariffInput[] = [];
  const seen = new Set<string>();
  const field = (row: string[], key: CustomsTariffCsvColumn): string => {
    const header = settings.columns[key];
    return header ? (row[headerIndexes.get(header)!] ?? '').trim() : '';
  };
  for (const [index, row] of rows.slice(1).entries()) {
    const line = index + 2;
    if (row.length !== headers.length) {
      errors.push(`Ligne ${line}: nombre de cellules différent du nombre d’en-têtes.`);
      continue;
    }
    try {
      const base = {
        customsDutyBaseComponents: settings.bases.customsDutyBaseComponents,
        consumptionDutyBaseComponents: settings.bases.consumptionDutyBaseComponents,
        fodecBaseComponents: settings.bases.fodecBaseComponents,
        importVatBaseComponents: settings.bases.importVatBaseComponents,
        customsServiceFeeBaseComponents: settings.bases.customsServiceFeeBaseComponents,
      };
      const optionalNumber = (key: 'preferentialCustomsDutyRate') => {
        const raw = field(row, key);
        return raw ? parseNumber(raw, settings.decimalSeparator, key) : null;
      };
      const record = validateCustomsTariffInput({
        ...base,
        tariffCode: field(row, 'tariffCode'),
        description: field(row, 'description'),
        customsDutyRate: parseNumber(field(row, 'customsDutyRate'), settings.decimalSeparator, 'customsDutyRate'),
        consumptionDutyRate: parseNumber(field(row, 'consumptionDutyRate'), settings.decimalSeparator, 'consumptionDutyRate'),
        fodecRate: parseNumber(field(row, 'fodecRate'), settings.decimalSeparator, 'fodecRate'),
        importVatRate: parseNumber(field(row, 'importVatRate'), settings.decimalSeparator, 'importVatRate'),
        customsServiceFeeRate: parseNumber(field(row, 'customsServiceFeeRate'), settings.decimalSeparator, 'customsServiceFeeRate'),
        effectiveFrom: parseDate(field(row, 'effectiveFrom'), settings.dateFormat),
        effectiveTo: field(row, 'effectiveTo') ? parseDate(field(row, 'effectiveTo'), settings.dateFormat) : null,
        originCountryCode: field(row, 'originCountryCode') || null,
        preferentialAgreementCode: field(row, 'preferentialAgreementCode') || null,
        preferentialCustomsDutyRate: optionalNumber('preferentialCustomsDutyRate'),
        sourceName: settings.sourceName,
        sourceUrl: settings.sourceUrl,
        sourceReference: settings.sourceReference,
      });
      const uniquenessKey = [
        record.tariffCode,
        record.effectiveFrom,
        record.effectiveTo ?? '',
        record.originCountryCode ?? '',
        record.preferentialAgreementCode ?? '',
      ].join('|');
      if (seen.has(uniquenessKey)) throw new Error('barème dupliqué dans le fichier.');
      seen.add(uniquenessKey);
      records.push(record);
    } catch (error) {
      errors.push(`Ligne ${line}: ${error instanceof Error ? error.message : 'donnée invalide.'}`);
      if (errors.length >= 100) {
        errors.push('Autres erreurs ignorées; corrigez les premières lignes puis relancez l’aperçu.');
        break;
      }
    }
  }
  return {
    canImport: records.length > 0 && errors.length === 0,
    rowCount: rows.length - 1,
    validCount: records.length,
    errors,
    records: errors.length === 0 ? records : [],
  };
}
