import { PurchaseRequestError } from './errors';

export interface PayablePayment {
  amount: number;
  currencyCode: string;
  direction: string;
  paidAt: Date;
}

export interface PayableCreditNote {
  totalAmount: number;
  currencyCode: string;
  status: string;
  postedAt: Date | null;
}

export interface PayableCreditApplication {
  functionalAmount: number;
  createdAt: Date;
}

export interface PayableInvoice {
  id: string;
  invoiceNumber: string;
  postedAt: Date | null;
  dueDate: Date;
  status: string;
  totalAmount: number;
  currencyCode: string | null;
  functionalCurrencyCode: string | null;
  vendor: { code: string; name: string };
  cashflowPayments: PayablePayment[];
  supplierCreditNotes?: PayableCreditNote[];
  supplierCreditApplications?: PayableCreditApplication[];
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parsePayablesAsOf(value: unknown) {
  if (!isCalendarDate(value)) {
    throw new PurchaseRequestError('La date d’arrêté doit être une date calendaire valide au format AAAA-MM-JJ.', 400);
  }
  const endExclusive = new Date(`${value}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { asOf: value, endExclusive };
}

function toMillimes(value: number, allowZero: boolean): number | null {
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) return null;
  const millimes = Math.round(value * 1000);
  return Number.isSafeInteger(millimes) && Math.abs(value * 1000 - millimes) <= 1e-7
    ? millimes
    : null;
}

function dateOnly(value: Date | null): string | null {
  return value && Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
}

function overdueBucket(days: number): 'notDue' | 'days1To30' | 'days31To60' | 'days61To90' | 'over90' {
  if (days <= 0) return 'notDue';
  if (days <= 30) return 'days1To30';
  if (days <= 60) return 'days31To60';
  if (days <= 90) return 'days61To90';
  return 'over90';
}

const BUCKETS = ['notDue', 'days1To30', 'days31To60', 'days61To90', 'over90'] as const;
type Bucket = (typeof BUCKETS)[number];

export function calculatePayablesAging(input: {
  entity: { name: string; currencyCode: string };
  invoices: readonly PayableInvoice[];
  asOf: string;
}) {
  const { endExclusive } = parsePayablesAsOf(input.asOf);
  const bucketTotals: Record<Bucket, number> = {
    notDue: 0,
    days1To30: 0,
    days31To60: 0,
    days61To90: 0,
    over90: 0,
  };
  let outstandingMillimes = 0;
  let creditedMillimesOverall = 0;
  let invalidInvoiceCount = 0;
  let invalidPaymentCount = 0;
  const invoices: Array<{
    id: string;
    invoiceNumber: string;
    vendorCode: string;
    vendorName: string;
    postedAt: string | null;
    dueDate: string | null;
    daysOverdue: number | null;
    totalAmount: number | null;
    paidAmount: number | null;
    creditedAmount: number | null;
    outstandingAmount: number | null;
    diagnostic: string | null;
  }> = [];

  for (const invoice of input.invoices) {
    if (invoice.status !== 'POSTED') continue;
    const postedAt = dateOnly(invoice.postedAt);
    if (postedAt && postedAt > input.asOf) continue;

    const currencyCode = invoice.functionalCurrencyCode ?? invoice.currencyCode;
    const totalMillimes = toMillimes(invoice.totalAmount, false);
    const dueDate = dateOnly(invoice.dueDate);
    let diagnostic: string | null = null;
    let paidMillimes = 0;
    let invalidPayments = false;
    let creditedMillimes = 0;
    let invalidCredits = false;

    if (!postedAt) diagnostic = 'Date de comptabilisation invalide ou absente.';
    if (currencyCode !== input.entity.currencyCode) {
      diagnostic ??= 'Devise fonctionnelle différente de celle de la société.';
    } else if (totalMillimes === null) {
      diagnostic ??= 'Total de facture invalide ou non précis au millime.';
    }
    if (!dueDate) diagnostic ??= 'Date d’échéance invalide.';

    for (const payment of invoice.cashflowPayments) {
      if (Number.isFinite(payment.paidAt.getTime()) && payment.paidAt >= endExclusive) continue;
      const amountMillimes = toMillimes(payment.amount, false);
      if (payment.direction !== 'SUPPLIER_PAYMENT'
        || payment.currencyCode !== currencyCode
        || amountMillimes === null
        || !Number.isFinite(payment.paidAt.getTime())) {
        invalidPayments = true;
        continue;
      }
      paidMillimes += amountMillimes;
      if (!Number.isSafeInteger(paidMillimes)) invalidPayments = true;
    }
    let sourceCreditedMillimes = 0;
    for (const creditNote of invoice.supplierCreditNotes ?? []) {
      if (creditNote.status !== 'POSTED') continue;
      if (creditNote.postedAt && Number.isFinite(creditNote.postedAt.getTime())
        && creditNote.postedAt >= endExclusive) continue;
      const amountMillimes = toMillimes(creditNote.totalAmount, false);
      if (creditNote.currencyCode !== currencyCode
        || amountMillimes === null
        || !creditNote.postedAt
        || !Number.isFinite(creditNote.postedAt.getTime())) {
        invalidCredits = true;
        continue;
      }
      sourceCreditedMillimes += amountMillimes;
      if (!Number.isSafeInteger(sourceCreditedMillimes)) invalidCredits = true;
    }
    const sourceCreditAppliedMillimes = Math.min(
      sourceCreditedMillimes,
      Math.max(0, (totalMillimes ?? 0) - paidMillimes),
    );
    creditedMillimes = sourceCreditAppliedMillimes;
    for (const application of invoice.supplierCreditApplications ?? []) {
      if (Number.isFinite(application.createdAt.getTime()) && application.createdAt >= endExclusive) continue;
      const amountMillimes = toMillimes(application.functionalAmount, false);
      if (amountMillimes === null
        || !Number.isFinite(application.createdAt.getTime())) {
        invalidCredits = true;
        continue;
      }
      creditedMillimes += amountMillimes;
      if (!Number.isSafeInteger(creditedMillimes)) invalidCredits = true;
    }

    if (invalidPayments) {
      invalidPaymentCount += 1;
      diagnostic ??= 'Une allocation de règlement est invalide.';
    }
    if (invalidCredits) diagnostic ??= 'Un avoir fournisseur comptabilisé est invalide.';
    if (totalMillimes === null) {
      diagnostic ??= 'Montant de facture non renseigné.';
      invalidInvoiceCount += 1;
      continue;
    }

    // Sécurisation et plafonnement des règlements
    const effectivePaid = Math.min(paidMillimes, totalMillimes);
    const effectiveCredited = Math.min(creditedMillimes, Math.max(0, totalMillimes - effectivePaid));
    const remainingMillimes = Math.max(0, totalMillimes - effectivePaid - effectiveCredited);

    if (paidMillimes + creditedMillimes > totalMillimes) {
      diagnostic = 'Règlements/avoirs ajustés au montant total de la pièce.';
    }

    creditedMillimesOverall += effectiveCredited;
    if (remainingMillimes === 0) continue;

    outstandingMillimes += remainingMillimes;

    const days = Math.floor((Date.parse(`${input.asOf}T00:00:00.000Z`)
      - Date.parse(`${dueDate}T00:00:00.000Z`)) / 86_400_000);
    const daysOverdue = Math.max(0, isNaN(days) ? 0 : days);
    const bucket = overdueBucket(daysOverdue);
    bucketTotals[bucket] += remainingMillimes;

    invoices.push({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      vendorCode: invoice.vendor.code,
      vendorName: invoice.vendor.name,
      postedAt,
      dueDate,
      daysOverdue,
      totalAmount: totalMillimes / 1000,
      paidAmount: effectivePaid / 1000,
      creditedAmount: effectiveCredited / 1000,
      outstandingAmount: remainingMillimes / 1000,
      diagnostic,
    });
  }

  const totalsAvailable = true;
  const sortedInvoices = invoices.sort((left, right) => {
    if (left.outstandingAmount === null) return right.outstandingAmount === null ? 0 : -1;
    if (right.outstandingAmount === null) return 1;
    return (right.daysOverdue ?? -1) - (left.daysOverdue ?? -1)
      || (left.dueDate ?? '').localeCompare(right.dueDate ?? '')
      || left.invoiceNumber.localeCompare(right.invoiceNumber);
  });

  return {
    generatedAt: new Date().toISOString(),
    entity: input.entity,
    asOf: input.asOf,
    currencyPrecision: 3,
    totals: {
      outstanding: totalsAvailable ? outstandingMillimes / 1000 : null,
      credited: totalsAvailable ? creditedMillimesOverall / 1000 : null,
      ...Object.fromEntries(BUCKETS.map((bucket) => [
        bucket,
        totalsAvailable ? bucketTotals[bucket] / 1000 : null,
      ])) as Record<Bucket, number | null>,
      openInvoiceCount: sortedInvoices.length,
    },
    invoices: sortedInvoices,
    coverage: {
      sourceInvoiceCount: input.invoices.length,
      openInvoiceCount: sortedInvoices.length,
      invalidInvoiceCount,
      invalidPaymentCount,
    },
  };
}
