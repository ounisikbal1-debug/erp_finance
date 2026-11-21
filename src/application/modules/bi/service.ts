import prisma from '../../../data/prisma/client';
import { FinanceRequestError } from '../finance/errors';
import { parseFinancialReportPeriod } from '../finance/financial-report';

function getPeriod(from: unknown, to: unknown) {
  const period = parseFinancialReportPeriod(from, to);
  const maxPeriodMs = 366 * 24 * 60 * 60 * 1000;
  if (period.endExclusive.getTime() - period.startAt.getTime() > maxPeriodMs) {
    throw new FinanceRequestError('Une extraction BI est limitée à 366 jours par demande.', 422);
  }
  return {
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    startAt: period.startAt,
    endExclusive: period.endExclusive,
  };
}

function getExchangeRateConvention(
  rate: number | null,
  documentCurrencyCode: string | null,
  functionalCurrencyCode: string | null,
) {
  if (rate === null || !documentCurrencyCode || !functionalCurrencyCode) return null;
  return `1 ${documentCurrencyCode} = ${rate} ${functionalCurrencyCode}`;
}

async function getEntityMetadata(entityId: string) {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: {
      id: true,
      code: true,
      countryId: true,
      country: { select: { code: true, currencyCode: true } },
    },
  });
  if (!entity) throw new FinanceRequestError('Société introuvable.', 404);
  return {
    entity: {
      code: entity.code,
      countryCode: entity.country.code,
      currencyCode: entity.country.currencyCode,
    },
    countryId: entity.countryId,
  };
}

export class BusinessIntelligenceService {
  static async getManifest() {
    return {
      generatedAt: new Date().toISOString(),
      mode: 'read-only',
      refresh: {
        authentication: 'SAFE Bearer token for network clients; local Desktop Basic is loopback-only',
        tokenLifetimeMinutes: 15,
        scheduledRefresh: 'Not supported with the current interactive token flow',
      },
      maxPeriodDays: 366,
      datasets: [
        { id: 'journal-lines', path: '/api/bi/journal-lines', grain: 'one posted journal line', periodRequired: true },
        { id: 'sales-invoices', path: '/api/bi/sales-invoices', grain: 'one issued or paid sales invoice', periodRequired: true },
        { id: 'purchase-invoices', path: '/api/bi/purchase-invoices', grain: 'one posted supplier invoice', periodRequired: true },
        { id: 'receivables-aging', path: '/api/bi/receivables-aging', grain: 'one issued or paid receivable invoice', asOfRequired: true },
      ],
      exclusions: ['drafts', 'to-review records', 'unapproved records', 'non-posted journal entries'],
    };
  }

  static async getJournalLines(entityId: string, from: unknown, to: unknown) {
    const period = getPeriod(from, to);
    const entity = await getEntityMetadata(entityId);
    const [entries, accounts] = await Promise.all([
      prisma.journalLine.findMany({
        where: {
          journalEntry: {
            entityId,
            status: 'POSTED',
            date: { gte: period.startAt, lt: period.endExclusive },
          },
        },
        select: {
          accountCode: true,
          debit: true,
          credit: true,
          description: true,
          costCenterCode: true,
          journalEntry: {
            select: { entryNumber: true, date: true, reference: true, description: true, status: true },
          },
        },
        orderBy: [{ journalEntry: { date: 'asc' } }, { journalEntry: { entryNumber: 'asc' } }],
      }),
      prisma.chartOfAccount.findMany({
        where: { countryId: entity.countryId },
        select: { code: true, description: true, type: true },
      }),
    ]);
    const accountMap = new Map(accounts.map((account) => [account.code, account]));
    return {
      generatedAt: new Date().toISOString(),
      entity: entity.entity,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      rows: entries.map((line) => ({
        ...line.journalEntry,
        date: line.journalEntry.date.toISOString().slice(0, 10),
        accountCode: line.accountCode,
        accountDescription: accountMap.get(line.accountCode)?.description ?? null,
        accountType: accountMap.get(line.accountCode)?.type ?? null,
        debit: line.debit,
        credit: line.credit,
        lineDescription: line.description,
        costCenterCode: line.costCenterCode,
      })),
    };
  }

  static async getSalesInvoices(entityId: string, from: unknown, to: unknown) {
    const period = getPeriod(from, to);
    const entity = await getEntityMetadata(entityId);
    const invoices = await prisma.invoice.findMany({
      where: {
        entityId,
        status: { in: ['ISSUED', 'PAID'] },
        issuedAt: { gte: period.startAt, lt: period.endExclusive },
      },
      select: {
        invoiceNumber: true,
        createdAt: true,
        issuedAt: true,
        dueDate: true,
        status: true,
        currencyCode: true,
        documentCurrencyCode: true,
        functionalCurrencyCode: true,
        exchangeRate: true,
        exchangeRateDate: true,
        exchangeRateSource: true,
        exchangeRateImportedAt: true,
        subTotal: true,
        taxAmount: true,
        stampDuty: true,
        totalAmount: true,
        documentSubTotal: true,
        documentTaxAmount: true,
        documentStampDuty: true,
        documentTotalAmount: true,
        customer: { select: { code: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return {
      generatedAt: new Date().toISOString(),
      entity: entity.entity,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      rows: invoices.map((invoice) => ({
        ...invoice,
        customerCode: invoice.customer.code,
        customer: undefined,
        issueDate: invoice.issuedAt?.toISOString().slice(0, 10) ?? null,
        createdAt: invoice.createdAt.toISOString(),
        issuedAt: invoice.issuedAt?.toISOString() ?? null,
        dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
        exchangeRateDate: invoice.exchangeRateDate?.toISOString().slice(0, 10) ?? null,
        exchangeRateImportedAt: invoice.exchangeRateImportedAt?.toISOString() ?? null,
        exchangeRateConvention: getExchangeRateConvention(
          invoice.exchangeRate,
          invoice.documentCurrencyCode,
          invoice.functionalCurrencyCode,
        ),
      })),
    };
  }

  static async getPurchaseInvoices(entityId: string, from: unknown, to: unknown) {
    const period = getPeriod(from, to);
    const entity = await getEntityMetadata(entityId);
    const invoices = await prisma.purchaseInvoice.findMany({
      where: {
        entityId,
        status: 'POSTED',
        issueDate: { gte: period.startAt, lt: period.endExclusive },
      },
      select: {
        invoiceNumber: true,
        issueDate: true,
        dueDate: true,
        status: true,
        currencyCode: true,
        documentCurrencyCode: true,
        functionalCurrencyCode: true,
        exchangeRate: true,
        exchangeRateDate: true,
        exchangeRateSource: true,
        exchangeRateImportedAt: true,
        subTotal: true,
        taxRateCode: true,
        taxRate: true,
        taxAmount: true,
        totalAmount: true,
        documentSubTotal: true,
        documentTaxAmount: true,
        documentTotalAmount: true,
        vendor: { select: { code: true } },
      },
      orderBy: { issueDate: 'asc' },
    });
    return {
      generatedAt: new Date().toISOString(),
      entity: entity.entity,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      rows: invoices.map((invoice) => ({
        ...invoice,
        vendorCode: invoice.vendor.code,
        vendor: undefined,
        issueDate: invoice.issueDate.toISOString().slice(0, 10),
        dueDate: invoice.dueDate.toISOString().slice(0, 10),
        exchangeRateDate: invoice.exchangeRateDate?.toISOString().slice(0, 10) ?? null,
        exchangeRateImportedAt: invoice.exchangeRateImportedAt?.toISOString() ?? null,
        exchangeRateConvention: getExchangeRateConvention(
          invoice.exchangeRate,
          invoice.documentCurrencyCode,
          invoice.functionalCurrencyCode,
        ),
      })),
    };
  }
}

export default BusinessIntelligenceService;
