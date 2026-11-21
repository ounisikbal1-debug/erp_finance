export interface DashboardInvoice {
  status: string;
  totalAmount: number;
}

export function calculateInvoiceDashboardMetrics(invoices: readonly DashboardInvoice[]) {
  const recognizedStatuses = new Set(['ISSUED', 'PAID']);
  return {
    totalCA: invoices.reduce(
      (total, invoice) => total + (recognizedStatuses.has(invoice.status) ? invoice.totalAmount : 0),
      0,
    ),
    anomalousInvoices: invoices.filter((invoice) => invoice.totalAmount < 0).length,
  };
}
