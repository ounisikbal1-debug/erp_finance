import prisma from '../../../data/prisma/client';
import { detectAnomalies } from './detection';
import { buildAnomalyFilters } from './filters';

const REVIEW_MONTHS = 12;
const MAX_SOURCE_ROWS = 10_000;

export class AnomalyService {
  static async getReport(entityId: string, now = new Date()) {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - REVIEW_MONTHS + 1, 1));
    const payrollPeriodFrom = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}`;
    const payrollPeriodTo = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const filters = buildAnomalyFilters(entityId, from, now, payrollPeriodFrom, payrollPeriodTo);
    const [journalEntries, invoices, payslips] = await Promise.all([
      prisma.journalEntry.findMany({
        where: filters.journalEntries,
        take: MAX_SOURCE_ROWS + 1,
        orderBy: [{ date: 'desc' }, { entryNumber: 'asc' }],
        select: {
          entryNumber: true,
          reference: true,
          date: true,
          lines: { select: { accountCode: true, debit: true, credit: true } },
        },
      }),
      prisma.invoice.findMany({
        where: filters.invoices,
        take: MAX_SOURCE_ROWS + 1,
        orderBy: [{ createdAt: 'desc' }, { invoiceNumber: 'asc' }],
        select: {
          invoiceNumber: true,
          createdAt: true,
          vatAccountCode: true,
          taxAmount: true,
          items: { select: { quantity: true, unitPrice: true, taxRate: true } },
        },
      }),
      prisma.payslip.findMany({
        where: filters.payslips,
        take: MAX_SOURCE_ROWS + 1,
        orderBy: [{ employeeId: 'asc' }, { period: 'asc' }, { createdAt: 'desc' }],
        select: {
          employeeId: true,
          period: true,
          createdAt: true,
          employee: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    return detectAnomalies({
      entityId,
      periodFrom: from.toISOString(),
      periodTo: now.toISOString(),
      generatedAt: now,
      journalEntries: journalEntries.slice(0, MAX_SOURCE_ROWS),
      invoices: invoices.slice(0, MAX_SOURCE_ROWS),
      payslips: payslips.slice(0, MAX_SOURCE_ROWS),
      limitedSources: [
        ...(journalEntries.length > MAX_SOURCE_ROWS ? ['Écritures postées'] : []),
        ...(invoices.length > MAX_SOURCE_ROWS ? ['Factures'] : []),
        ...(payslips.length > MAX_SOURCE_ROWS ? ['Fiches de paie'] : []),
      ],
    });
  }
}

export default AnomalyService;
