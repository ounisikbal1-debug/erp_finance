export const BCT_INTERBANK_RATES_URL = 'https://www.bct.gov.tn/bct/siteprod/cours.jsp';
export const BCT_INTERBANK_SOURCE_NAME = 'BCT - cours moyens du marché interbancaire';

export interface ParsedBctInterbankRate {
  baseCurrency: string;
  quoteCurrency: 'TND';
  rate: number;
  sourceUnit: number;
  sourceValue: number;
}

export interface ParsedBctInterbankRates {
  effectiveDate: string;
  rates: ParsedBctInterbankRate[];
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&eacute;|&#233;/gi, 'é')
    .replace(/&egrave;|&#232;/gi, 'è')
    .replace(/&ecirc;|&#234;/gi, 'ê')
    .replace(/&ocirc;|&#244;/gi, 'ô')
    .replace(/&ccedil;|&#231;/gi, 'ç')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBctNumber(value: string): number | null {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseEffectiveDate(section: string): string | null {
  const match = stripTags(section).match(/Journ[eé]e\s+du\s+(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!match) return null;
  const [, day, month, year] = match;
  const isoDate = `${year}-${month}-${day}`;
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === isoDate ? isoDate : null;
}

export function parseBctInterbankRates(html: string): ParsedBctInterbankRates {
  const normalizedHtml = html.replace(/&nbsp;|&#160;/gi, ' ');
  const titleMatch = /Cours\s+Moyens\s+des\s+Devises\s+Cot[eé]es\s+en\s+dinar\s+tunisien/i.exec(normalizedHtml);
  if (!titleMatch || titleMatch.index === undefined) {
    throw new Error('La page BCT ne contient pas la section des cours interbancaires attendue.');
  }
  const sectionStart = titleMatch.index;
  const manualTitleMatch = /Cours\s+Moyens\s+en\s+dinar\s+tunisien\s+pour\s+le\s+Change\s+Manuel/i.exec(normalizedHtml.slice(sectionStart));
  const sectionEnd = manualTitleMatch?.index === undefined
    ? normalizedHtml.length
    : sectionStart + manualTitleMatch.index;
  const section = normalizedHtml.slice(sectionStart, sectionEnd);
  const effectiveDate = parseEffectiveDate(section);
  if (!effectiveDate) throw new Error('La date effective des cours BCT est absente ou invalide.');

  const tables = section.match(/<table\b[\s\S]*?<\/table>/gi) ?? [];
  for (const table of tables) {
    const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(([, row]) => (
      [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(([, cell]) => stripTags(cell))
    ));
    const headerIndex = rows.findIndex((cells) => (
      cells.some((cell) => /^sigle$/i.test(cell))
      && cells.some((cell) => /^unit[eé]$/i.test(cell))
      && cells.some((cell) => /^valeur$/i.test(cell))
    ));
    if (headerIndex < 0) continue;

    const sigleIndex = rows[headerIndex].findIndex((cell) => /^sigle$/i.test(cell));
    const unitIndex = rows[headerIndex].findIndex((cell) => /^unit[eé]$/i.test(cell));
    const valueIndex = rows[headerIndex].findIndex((cell) => /^valeur$/i.test(cell));
    const rates: ParsedBctInterbankRate[] = [];
    for (const cells of rows.slice(headerIndex + 1)) {
      const baseCurrency = cells[sigleIndex]?.toUpperCase();
      const sourceUnit = parseBctNumber(cells[unitIndex] ?? '');
      const sourceValue = parseBctNumber(cells[valueIndex] ?? '');
      if (!baseCurrency || !/^[A-Z]{3}$/.test(baseCurrency)
        || sourceUnit === null || sourceUnit <= 0
        || sourceValue === null || sourceValue <= 0) continue;
      rates.push({
        baseCurrency,
        quoteCurrency: 'TND',
        rate: sourceValue / sourceUnit,
        sourceUnit,
        sourceValue,
      });
    }
    if (rates.length === 0) throw new Error('La table BCT interbancaire ne contient aucun cours exploitable.');
    if (new Set(rates.map(({ baseCurrency }) => baseCurrency)).size !== rates.length) {
      throw new Error('La table BCT interbancaire contient des devises en double.');
    }
    return { effectiveDate, rates };
  }
  throw new Error('La table BCT interbancaire attendue est absente ou son format a changé.');
}
