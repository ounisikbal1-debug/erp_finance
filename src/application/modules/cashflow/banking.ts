import { createHash } from 'node:crypto';
import { CashflowRequestError } from './errors';

export interface ParsedBankStatementLine {
  rowNumber: number;
  transactionDate: Date;
  description: string;
  amount: number;
  amountMillimes: number;
  balanceAfter: number | null;
  balanceAfterMillimes: number | null;
  externalReference: string | null;
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (closedQuote && character !== ',' && character !== '\r' && character !== '\n' && character !== ' ' && character !== '\t') {
      throw new CashflowRequestError('Le fichier CSV contient un caractère après la fermeture d’un champ cité.', 400);
    }
    if (character === '"') {
      if (field.length !== 0 || closedQuote) {
        throw new CashflowRequestError('Le fichier CSV contient un guillemet non échappé.', 400);
      }
      quoted = true;
    } else if (character === ',') {
      row.push(field.trim());
      field = '';
      closedQuote = false;
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = '';
      closedQuote = false;
    } else if (!closedQuote) {
      field += character;
    }
  }

  if (quoted) throw new CashflowRequestError('Le fichier CSV contient un champ cité non terminé.', 400);
  if (field.length > 0 || row.length > 0 || closedQuote) {
    row.push(field.trim());
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }
  return rows;
}

function parseAmountMillimes(value: string, rowNumber: number, allowZero = false): number {
  const match = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(value.trim());
  const integerPart = match?.[2].replace(/^0+(?=\d)/, '');
  if (!match || !integerPart || integerPart.length > 13) {
    throw new CashflowRequestError(`Montant invalide à la ligne ${rowNumber}; utilisez un nombre signé avec un point décimal et au plus trois décimales.`, 400);
  }
  const magnitude = BigInt(integerPart) * 1000n + BigInt((match[3] ?? '').padEnd(3, '0') || '0');
  const millimes = match[1] === '-' ? -magnitude : magnitude;
  if ((!allowZero && millimes === 0n) || millimes > BigInt(Number.MAX_SAFE_INTEGER) || millimes < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new CashflowRequestError(`Montant nul ou hors limites à la ligne ${rowNumber}.`, 400);
  }
  return Number(millimes);
}

export function toMillimes(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const millimes = Math.round(value * 1000);
  return Number.isSafeInteger(millimes) && Math.abs(value * 1000 - millimes) <= 1e-7
    ? millimes
    : null;
}

export function parseBankStatementCsv(value: unknown): ParsedBankStatementLine[] {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > 5 * 1024 * 1024) {
    throw new CashflowRequestError('Le relevé CSV est vide, invalide ou dépasse 5 Mo.', 400);
  }
  const rows = parseCsvRows(value.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new CashflowRequestError('Le CSV doit contenir un en-tête et au moins une opération.', 400);
  const headers = rows[0].map((header) => header.toLowerCase());
  if (new Set(headers).size !== headers.length || !['date', 'description', 'amount'].every((name) => headers.includes(name))) {
    throw new CashflowRequestError('En-têtes requis : date, description, amount; reference et balance sont facultatifs.', 400);
  }
  if (headers.some((header) => !['date', 'description', 'amount', 'reference', 'balance'].includes(header))) {
    throw new CashflowRequestError('Le CSV contient une colonne non prise en charge.', 400);
  }
  if (rows.length - 1 > 5000) throw new CashflowRequestError('Un relevé ne peut pas dépasser 5 000 opérations.', 400);

  const column = (name: string) => headers.indexOf(name);
  const parsed = rows.slice(1).map((cells, index) => {
    const rowNumber = index + 2;
    if (cells.length !== headers.length) {
      throw new CashflowRequestError(`Nombre de colonnes invalide à la ligne ${rowNumber}.`, 400);
    }
    const dateText = cells[column('date')];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
      throw new CashflowRequestError(`Date invalide à la ligne ${rowNumber}; utilisez AAAA-MM-JJ.`, 400);
    }
    const transactionDate = new Date(`${dateText}T00:00:00.000Z`);
    if (Number.isNaN(transactionDate.getTime()) || transactionDate.toISOString().slice(0, 10) !== dateText) {
      throw new CashflowRequestError(`Date invalide à la ligne ${rowNumber}.`, 400);
    }
    const description = cells[column('description')].trim();
    if (!description || description.length > 300) {
      throw new CashflowRequestError(`Libellé absent ou trop long à la ligne ${rowNumber}.`, 400);
    }
    const amountMillimes = parseAmountMillimes(cells[column('amount')], rowNumber);
    const balanceIndex = column('balance');
    const balanceAfterMillimes = balanceIndex < 0 || !cells[balanceIndex]
      ? null
      : parseAmountMillimes(cells[balanceIndex], rowNumber, true);
    const referenceIndex = column('reference');
    const externalReference = referenceIndex < 0 ? null : cells[referenceIndex].trim() || null;
    if (externalReference && externalReference.length > 120) {
      throw new CashflowRequestError(`Référence trop longue à la ligne ${rowNumber}.`, 400);
    }
    return {
      rowNumber,
      transactionDate,
      description,
      amount: amountMillimes / 1000,
      amountMillimes,
      balanceAfter: balanceAfterMillimes === null ? null : balanceAfterMillimes / 1000,
      balanceAfterMillimes,
      externalReference,
    };
  });
  return parsed;
}

export function buildBankLineDeduplicationKey(input: {
  sourceHash: string;
  rowNumber: number;
  transactionDate: Date;
  amountMillimes: number;
  externalReference: string | null;
}): string {
  const identity = input.externalReference
    ? `${input.transactionDate.toISOString().slice(0, 10)}|${input.amountMillimes}|${input.externalReference}`
    : `${input.sourceHash}|${input.rowNumber}`;
  return createHash('sha256').update(identity, 'utf8').digest('hex');
}
