export function buildAnomalyFilters(
  entityId: string,
  from: Date,
  to: Date,
  payrollPeriodFrom: string,
  payrollPeriodTo: string,
) {
  return {
    journalEntries: {
      entityId,
      status: 'POSTED',
      date: { gte: from, lte: to },
    },
    invoices: {
      entityId,
      status: { in: ['ISSUED', 'PAID'] },
      createdAt: { gte: from, lte: to },
    },
    payslips: {
      employee: { entityId },
      period: { gte: payrollPeriodFrom, lte: payrollPeriodTo },
    },
  };
}
