export class FxRevaluationError extends Error {
  constructor(message: string, readonly statusCode: 400 | 404 | 409 | 422) {
    super(message);
    this.name = 'FxRevaluationError';
  }
}

export interface RevaluationPayment {
  amount: number;
  carryingAmount: number | null;
  settledDocumentAmount: number | null;
  documentCurrencyCode: string | null;
  currencyCode: string;
  direction: string;
  paidAt: Date;
}

export interface RevaluationCredit {
  documentAmount: number;
  carryingAmount: number;
  currencyCode: string;
  postedAt: Date | null;
}

export interface RevaluationBalance {
  sourceId: string;
  direction: 'CUSTOMER_RECEIPT' | 'SUPPLIER_PAYMENT';
  documentCurrencyCode: string;
  functionalCurrencyCode: string;
  documentTotalAmount: number;
  functionalTotalAmount: number;
  payments: readonly RevaluationPayment[];
  credits?: readonly RevaluationCredit[];
}

export interface RevaluationRate {
  rate: number;
  effectiveDate: string;
  source: string;
  sourceUrl?: string | null;
  importedAt?: string | null;
}

export interface FxRevaluationItem {
  sourceId: string;
  direction: RevaluationBalance['direction'];
  documentCurrencyCode: string;
  openDocumentAmount: number;
  oldCarryingAmount: number;
  revaluedCarryingAmount: number;
  adjustmentAmount: number;
  exchangeRate: number;
  exchangeRateEffectiveDate: string;
  exchangeRateSource: string;
  exchangeRateSourceUrl: string | null;
  exchangeRateImportedAt: string | null;
}

function toMillimes(value: number, label: string): number {
  const millimes = Math.round(value * 1000);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(millimes)
    || Math.abs(value * 1000 - millimes) > 1e-7) {
    throw new FxRevaluationError(`${label} est invalide ou non précis au millime.`, 422);
  }
  return millimes;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function calculateOpenFxRevaluationItems(
  balances: readonly RevaluationBalance[],
  rates: ReadonlyMap<string, RevaluationRate>,
  effectiveDate: string,
): FxRevaluationItem[] {
  if (!validDate(effectiveDate)) {
    throw new FxRevaluationError('La date de réévaluation doit être une date calendaire valide.', 400);
  }
  const date = new Date(`${effectiveDate}T00:00:00.000Z`);
  const endExclusive = new Date(date);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const monthEnd = new Date(date);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  if (monthEnd.toISOString().slice(0, 10) !== effectiveDate) {
    throw new FxRevaluationError('La réévaluation doit porter sur une date de fin de mois.', 400);
  }
  const items: FxRevaluationItem[] = [];
  for (const balance of balances) {
    if (balance.documentCurrencyCode === balance.functionalCurrencyCode) continue;

    const documentTotal = toMillimes(balance.documentTotalAmount, `Le total document de ${balance.sourceId}`);
    const functionalTotal = toMillimes(balance.functionalTotalAmount, `Le total fonctionnel de ${balance.sourceId}`);
    let paidDocument = 0;
    let paidCarrying = 0;
    let creditedDocument = 0;
    let creditedCarrying = 0;
    for (const payment of balance.payments) {
      if (!Number.isFinite(payment.paidAt.getTime())) {
        throw new FxRevaluationError(`La date d’allocation de ${balance.sourceId} est invalide.`, 422);
      }
      if (payment.direction !== balance.direction) {
        throw new FxRevaluationError(`Le sens d’une allocation de ${balance.sourceId} est incohérent.`, 409);
      }
      const documentCurrency = payment.documentCurrencyCode ?? balance.documentCurrencyCode;
      if (documentCurrency !== balance.documentCurrencyCode) {
        throw new FxRevaluationError(`La devise d’une allocation de ${balance.sourceId} est incohérente.`, 409);
      }
      if (payment.currencyCode !== balance.functionalCurrencyCode) {
        throw new FxRevaluationError(`La devise fonctionnelle d’une allocation de ${balance.sourceId} est incohérente.`, 409);
      }
      const documentAmount = payment.settledDocumentAmount
        ?? (balance.documentCurrencyCode === balance.functionalCurrencyCode ? payment.amount : null);
      if (documentAmount === null) {
        throw new FxRevaluationError(`Le montant apuré en devise document de ${balance.sourceId} est manquant.`, 409);
      }
      const carryingAmount = payment.carryingAmount
        ?? (balance.documentCurrencyCode === balance.functionalCurrencyCode ? payment.amount : null);
      if (carryingAmount === null) {
        throw new FxRevaluationError(`La valeur comptable apurée de ${balance.sourceId} est manquante.`, 409);
      }
      paidDocument += toMillimes(documentAmount, `L’allocation document de ${balance.sourceId}`);
      paidCarrying += toMillimes(carryingAmount, `L’allocation comptable de ${balance.sourceId}`);
      if (!Number.isSafeInteger(paidDocument) || !Number.isSafeInteger(paidCarrying)) {
        throw new FxRevaluationError(`Les allocations cumulées de ${balance.sourceId} dépassent la précision prise en charge.`, 422);
      }
    }

    for (const credit of balance.credits ?? []) {
      if (!credit.postedAt || !Number.isFinite(credit.postedAt.getTime())) {
        throw new FxRevaluationError(`La date d’un avoir fournisseur de ${balance.sourceId} est invalide.`, 422);
      }
      if (credit.postedAt >= endExclusive) continue;
      if (credit.currencyCode !== balance.documentCurrencyCode) {
        throw new FxRevaluationError(`La devise d’un avoir fournisseur de ${balance.sourceId} est incohérente.`, 409);
      }
      creditedDocument += toMillimes(credit.documentAmount, `L’avoir document de ${balance.sourceId}`);
      creditedCarrying += toMillimes(credit.carryingAmount, `L’avoir comptable de ${balance.sourceId}`);
      if (!Number.isSafeInteger(creditedDocument) || !Number.isSafeInteger(creditedCarrying)) {
        throw new FxRevaluationError(`Les avoirs cumulés de ${balance.sourceId} dépassent la précision prise en charge.`, 422);
      }
    }

    if (paidDocument + creditedDocument > documentTotal
      || paidCarrying + creditedCarrying > functionalTotal) {
      throw new FxRevaluationError(`Les allocations et avoirs cumulés de ${balance.sourceId} dépassent la facture.`, 409);
    }
    const openDocument = documentTotal - paidDocument - creditedDocument;
    if (openDocument === 0) continue;
    const oldCarrying = functionalTotal - paidCarrying - creditedCarrying;
    const rate = rates.get(balance.documentCurrencyCode);
    if (!rate) {
      throw new FxRevaluationError(`Aucun taux de clôture sourcé n’est disponible pour ${balance.documentCurrencyCode}.`, 409);
    }
    if (!Number.isFinite(rate.rate) || rate.rate <= 0 || rate.rate > 1_000_000_000
      || !validDate(rate.effectiveDate) || rate.effectiveDate > effectiveDate
      || typeof rate.source !== 'string' || !rate.source.trim()) {
      throw new FxRevaluationError(`Le taux de clôture de ${balance.documentCurrencyCode} est invalide.`, 422);
    }
    const revaluedCarrying = Math.round(openDocument * rate.rate);
    if (!Number.isSafeInteger(revaluedCarrying)) {
      throw new FxRevaluationError(`La valeur réévaluée de ${balance.sourceId} dépasse la précision prise en charge.`, 422);
    }
    const adjustment = revaluedCarrying - oldCarrying;
    if (adjustment === 0) continue;
    items.push({
      sourceId: balance.sourceId,
      direction: balance.direction,
      documentCurrencyCode: balance.documentCurrencyCode,
      openDocumentAmount: openDocument / 1000,
      oldCarryingAmount: oldCarrying / 1000,
      revaluedCarryingAmount: revaluedCarrying / 1000,
      adjustmentAmount: adjustment / 1000,
      exchangeRate: rate.rate,
      exchangeRateEffectiveDate: rate.effectiveDate,
      exchangeRateSource: rate.source.trim(),
      exchangeRateSourceUrl: rate.sourceUrl?.trim() || null,
      exchangeRateImportedAt: rate.importedAt ?? null,
    });
  }
  return items;
}

export function firstDayOfNextMonth(date: string): string {
  if (!validDate(date)) throw new FxRevaluationError('La date de clôture est invalide.', 400);
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCMonth(next.getUTCMonth() + 1, 1);
  return next.toISOString().slice(0, 10);
}
