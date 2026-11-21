import { FinanceRequestError } from '../finance/errors';

export interface ReceivablePayment {
  amount: number;
  carryingAmount?: number | null;
  currencyCode: string;
  direction: string;
  paidAt: Date;
}

export interface ReceivableInvoice {
  id: string;
  invoiceNumber: string;
  createdAt: Date;
  dueDate: Date | null;
  status: string;
  totalAmount: number;
  currencyCode: string | null;
  functionalCurrencyCode: string | null;
  customer: { code: string; name: string };
  cashflowPayments: ReceivablePayment[];
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseReceivablesAsOf(value: unknown) {
  if (!isCalendarDate(value)) {
    throw new FinanceRequestError('La date d’arrêté doit être une date calendaire valide au format AAAA-MM-JJ.', 400);
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

function dateOnly(value: Date): string | null {
  return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
}

function overdueBucket(days: number): 'notDue' | 'days1To30' | 'days31To60' | 'days61To90' | 'over90' {
  if (days <= 0) return 'notDue';
  if (days <= 30) return 'days1To30';
  if (days <= 60) return 'days31To60';
  if (days <= 90) return 'days61To90';
  return 'over90';
}

const BUCKETS = ['notDue', 'days1To30', 'days31To60', 'days61To90', 'over90', 'unknownDueDate'] as const;
type Bucket = (typeof BUCKETS)[number];

export function calculateReceivablesAging(input: {
  entity: { name: string; currencyCode: string };
  invoices: readonly ReceivableInvoice[];
  asOf: string;
}) {
  const { endExclusive } = parseReceivablesAsOf(input.asOf);
  const bucketTotals: Record<Bucket, number> = {
    notDue: 0,
    days1To30: 0,
    days31To60: 0,
    days61To90: 0,
    over90: 0,
    unknownDueDate: 0,
  };
  let outstandingMillimes = 0;
  let invalidInvoiceCount = 0;
  let invalidPaymentCount = 0;
  let dueDateMissingCount = 0;
  const invoices: Array<{
    id: string;
    invoiceNumber: string;
    customerCode: string;
    customerName: string;
    issueDate: string | null;
    dueDate: string | null;
    daysOverdue: number | null;
    status: string;
    totalAmount: number | null;
    paidAmount: number | null;
    outstandingAmount: number | null;
    diagnostic: string | null;
  }> = [];

  for (const invoice of input.invoices) {
    const issueDate = dateOnly(invoice.createdAt);
    if (!issueDate || issueDate > input.asOf) continue;

    const currencyCode = invoice.functionalCurrencyCode ?? invoice.currencyCode;
    const totalMillimes = toMillimes(invoice.totalAmount, false);
    const dueDateText = invoice.dueDate ? dateOnly(invoice.dueDate) : null;
    let diagnostic: string | null = null;
    let paidMillimes = 0;
    let invalidPayments = false;

    if (currencyCode !== input.entity.currencyCode) {
      diagnostic = 'Devise fonctionnelle différente de celle de la société.';
    } else if (totalMillimes === null) {
      diagnostic = 'Total de facture invalide ou non précis au millime.';
    }
    if (invoice.dueDate && !dueDateText) {
      diagnostic ??= 'Date d’échéance invalide.';
    }

    for (const payment of invoice.cashflowPayments) {
      if (payment.paidAt >= endExclusive) continue;
      const amountMillimes = toMillimes(payment.carryingAmount ?? payment.amount, false);
      if (payment.direction !== 'CUSTOMER_RECEIPT'
        || payment.currencyCode !== currencyCode
        || amountMillimes === null
        || !Number.isFinite(payment.paidAt.getTime())) {
        invalidPayments = true;
        continue;
      }
      paidMillimes += amountMillimes;
      if (!Number.isSafeInteger(paidMillimes)) invalidPayments = true;
    }

    if (invalidPayments) {
      invalidPaymentCount += 1;
      diagnostic ??= 'Une allocation de règlement est invalide.';
    }
    if (diagnostic || totalMillimes === null || invalidPayments || paidMillimes > totalMillimes) {
      invalidInvoiceCount += 1;
      diagnostic ??= 'Les règlements cumulés dépassent le total de la facture.';
      invoices.push({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerCode: invoice.customer.code,
        customerName: invoice.customer.name,
        issueDate,
        dueDate: dueDateText,
        daysOverdue: null,
        status: invoice.status,
        totalAmount: currencyCode === input.entity.currencyCode && totalMillimes !== null
          ? totalMillimes / 1000
          : null,
        paidAmount: invalidPayments ? null : paidMillimes / 1000,
        outstandingAmount: null,
        diagnostic,
      });
      continue;
    }

    const remainingMillimes = totalMillimes - paidMillimes;
    if (remainingMillimes === 0) continue;

    outstandingMillimes += remainingMillimes;
    if (!Number.isSafeInteger(outstandingMillimes)) {
      invalidInvoiceCount += 1;
      diagnostic = 'Le cumul des créances dépasse la précision sûre.';
    }

    let bucket: Bucket = 'unknownDueDate';
    let daysOverdue: number | null = null;
    const dueDate = dueDateText;
    if (dueDate) {
      const days = Math.floor((Date.parse(`${input.asOf}T00:00:00.000Z`) - Date.parse(`${dueDate}T00:00:00.000Z`)) / 86_400_000);
      daysOverdue = Math.max(0, days);
      bucket = overdueBucket(days);
    } else {
      dueDateMissingCount += 1;
    }
    bucketTotals[bucket] += remainingMillimes;
    if (!Number.isSafeInteger(bucketTotals[bucket])) {
      invalidInvoiceCount += 1;
      diagnostic = 'Le cumul de cette tranche dépasse la précision sûre.';
    }
    invoices.push({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerCode: invoice.customer.code,
      customerName: invoice.customer.name,
      issueDate,
      dueDate,
      daysOverdue,
      status: invoice.status,
      totalAmount: totalMillimes / 1000,
      paidAmount: paidMillimes / 1000,
      outstandingAmount: remainingMillimes / 1000,
      diagnostic,
    });
  }

  const totalsAvailable = invalidInvoiceCount === 0;
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
      dueDateMissingCount,
    },
  };
}
