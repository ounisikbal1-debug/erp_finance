export class FxConversionError extends Error {
  constructor(message: string, readonly statusCode: 400 | 404 | 422) {
    super(message);
    this.name = 'FxConversionError';
  }
}

export interface InvoiceFxInput {
  documentCurrencyCode?: unknown;
  exchangeRate?: unknown;
  exchangeRateDate?: unknown;
  exchangeRateSource?: unknown;
  exchangeRateImportedAt?: unknown;
}

export interface InvoiceFxSnapshot {
  documentCurrencyCode: string;
  functionalCurrencyCode: string;
  exchangeRate: number;
  exchangeRateDate: string;
  exchangeRateSource: string;
  exchangeRateImportedAt: string | null;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateCurrencyCode(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z]{3}$/.test(value.trim())) {
    throw new FxConversionError(`Le code de ${label} doit contenir trois lettres.`, 400);
  }
  return value.trim().toUpperCase();
}

export function normalizeInvoiceFxSnapshot(
  input: InvoiceFxInput,
  functionalCurrency: unknown,
  issueDate: string,
): InvoiceFxSnapshot {
  const functionalCurrencyCode = validateCurrencyCode(functionalCurrency, 'devise fonctionnelle');
  const documentCurrencyCode = input.documentCurrencyCode === undefined || input.documentCurrencyCode === ''
    ? functionalCurrencyCode
    : validateCurrencyCode(input.documentCurrencyCode, 'devise de facture');
  if (!isCalendarDate(issueDate)) {
    throw new FxConversionError('La date d’émission doit être une date calendaire valide.', 400);
  }
  if (documentCurrencyCode === functionalCurrencyCode) {
    return {
      documentCurrencyCode,
      functionalCurrencyCode,
      exchangeRate: 1,
      exchangeRateDate: issueDate,
      exchangeRateSource: 'Même devise fonctionnelle; aucune conversion.',
      exchangeRateImportedAt: null,
    };
  }

  if (typeof input.exchangeRate !== 'number'
    || !Number.isFinite(input.exchangeRate)
    || input.exchangeRate <= 0
    || input.exchangeRate > 1_000_000_000) {
    throw new FxConversionError('Un taux positif et fini est obligatoire pour une devise étrangère.', 400);
  }
  if (!isCalendarDate(input.exchangeRateDate)) {
    throw new FxConversionError('La date du taux de change doit être une date calendaire valide.', 400);
  }
  if (input.exchangeRateDate > issueDate) {
    throw new FxConversionError('La date du taux de change ne peut pas suivre la date d’émission.', 400);
  }
  const exchangeRateSource = typeof input.exchangeRateSource === 'string'
    ? input.exchangeRateSource.trim()
    : '';
  if (!exchangeRateSource || exchangeRateSource.length > 500) {
    throw new FxConversionError('La source du taux de change est obligatoire (500 caractères maximum).', 400);
  }
  const exchangeRateImportedAt = input.exchangeRateImportedAt === undefined || input.exchangeRateImportedAt === null
    ? null
    : typeof input.exchangeRateImportedAt === 'string' && Number.isFinite(Date.parse(input.exchangeRateImportedAt))
      ? new Date(input.exchangeRateImportedAt).toISOString()
      : null;
  if (input.exchangeRateImportedAt !== undefined && input.exchangeRateImportedAt !== null && !exchangeRateImportedAt) {
    throw new FxConversionError('La date d’import du taux de change est invalide.', 400);
  }
  return {
    documentCurrencyCode,
    functionalCurrencyCode,
    exchangeRate: input.exchangeRate,
    exchangeRateDate: input.exchangeRateDate,
    exchangeRateSource,
    exchangeRateImportedAt,
  };
}

export function convertAmountToFunctionalCurrency(amount: number, exchangeRate: number): number {
  const amountMillimes = Math.round(amount * 1000);
  if (!Number.isFinite(amount)
    || amount < 0
    || !Number.isSafeInteger(amountMillimes)
    || Math.abs(amount * 1000 - amountMillimes) > 1e-7
    || !Number.isFinite(exchangeRate)
    || exchangeRate <= 0) {
    throw new FxConversionError('Le montant ou le taux de conversion est invalide.', 422);
  }
  const convertedMillimes = Math.round(amountMillimes * exchangeRate);
  if (!Number.isSafeInteger(convertedMillimes)) {
    throw new FxConversionError('Le montant converti dépasse la précision prise en charge.', 422);
  }
  return convertedMillimes / 1000;
}

export function convertInvoiceComponents(
  components: { subTotal: number; taxAmount: number; otherAmount?: number },
  exchangeRate: number,
) {
  const subTotal = convertAmountToFunctionalCurrency(components.subTotal, exchangeRate);
  const taxAmount = convertAmountToFunctionalCurrency(components.taxAmount, exchangeRate);
  const otherAmount = convertAmountToFunctionalCurrency(components.otherAmount ?? 0, exchangeRate);
  const totalMillimes = Math.round(subTotal * 1000)
    + Math.round(taxAmount * 1000)
    + Math.round(otherAmount * 1000);
  if (!Number.isSafeInteger(totalMillimes)) {
    throw new FxConversionError('Le total converti dépasse la précision prise en charge.', 422);
  }
  return { subTotal, taxAmount, otherAmount, totalAmount: totalMillimes / 1000 };
}
