import type { ExportColumn } from './exportUtils';

export interface SalesInvoiceExportSource {
  invoiceNumber: string;
  createdAt: string;
  dueDate: string | null;
  customer: { name: string };
  status: string;
  documentCurrencyCode: string | null;
  documentSubTotal: number | null;
  documentTaxAmount: number | null;
  documentStampDuty: number | null;
  documentTotalAmount: number | null;
  functionalCurrencyCode: string | null;
  currencyCode: string | null;
  subTotal: number;
  taxAmount: number;
  totalAmount: number;
  exchangeRate: number | null;
  exchangeRateDate: string | null;
  exchangeRateSource: string | null;
  createdByUsername: string | null;
  approvedByUsername: string | null;
  issuedByUsername: string | null;
  postingJournalEntryId: string | null;
}

export interface SalesInvoiceExportRow {
  [key: string]: string | number | null;
}

export interface SalesInvoicePage<T> {
  items: T[];
  pagination: { totalPages: number };
}

export async function collectSalesInvoicePages<T>(
  loadPage: (page: number, pageSize: number) => Promise<SalesInvoicePage<T>>,
  pageSize: number,
): Promise<T[]> {
  const invoices: T[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await loadPage(page, pageSize);
    invoices.push(...result.items);
    totalPages = result.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);
  return invoices;
}

export const salesInvoiceExportColumns: ExportColumn[] = [
  { header: 'Numéro', key: 'invoiceNumber' },
  { header: 'Date', key: 'issueDate' },
  { header: 'Échéance', key: 'dueDate' },
  { header: 'Client', key: 'customer' },
  { header: 'Statut', key: 'status' },
  { header: 'Devise document', key: 'documentCurrency' },
  { header: 'HT document', key: 'documentSubTotal' },
  { header: 'TVA document', key: 'documentTaxAmount' },
  { header: 'Timbre document', key: 'documentStampDuty' },
  { header: 'TTC document', key: 'documentTotalAmount' },
  { header: 'Devise fonctionnelle', key: 'functionalCurrency' },
  { header: 'HT fonctionnel', key: 'subTotal' },
  { header: 'TVA fonctionnelle', key: 'taxAmount' },
  { header: 'TTC fonctionnel', key: 'totalAmount' },
  { header: 'Taux de conversion', key: 'exchangeRate' },
  { header: 'Date du taux', key: 'exchangeRateDate' },
  { header: 'Source du taux', key: 'exchangeRateSource' },
  { header: 'Créée par', key: 'createdBy' },
  { header: 'Approuvée par', key: 'approvedBy' },
  { header: 'Émise par', key: 'issuedBy' },
  { header: 'Journal lié', key: 'journalEntry' },
];

export function mapSalesInvoicesToExportRows(invoices: SalesInvoiceExportSource[]): SalesInvoiceExportRow[] {
  return invoices.map((invoice) => ({
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.createdAt.slice(0, 10),
    dueDate: invoice.dueDate?.slice(0, 10) ?? '',
    customer: invoice.customer.name,
    status: invoice.status,
    documentCurrency: invoice.documentCurrencyCode ?? 'Historique inconnu',
    documentSubTotal: invoice.documentSubTotal,
    documentTaxAmount: invoice.documentTaxAmount,
    documentStampDuty: invoice.documentStampDuty,
    documentTotalAmount: invoice.documentTotalAmount,
    functionalCurrency: invoice.functionalCurrencyCode ?? invoice.currencyCode ?? 'Historique inconnu',
    subTotal: invoice.subTotal,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    exchangeRate: invoice.exchangeRate,
    exchangeRateDate: invoice.exchangeRateDate?.slice(0, 10) ?? '',
    exchangeRateSource: invoice.exchangeRateSource ?? '',
    createdBy: invoice.createdByUsername ?? '',
    approvedBy: invoice.approvedByUsername ?? '',
    issuedBy: invoice.issuedByUsername ?? '',
    journalEntry: invoice.postingJournalEntryId ?? '',
  }));
}

function escapeCsvValue(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const safeText = typeof value === 'string' && /^[\s\uFEFF]*[=+\-@]/u.test(text)
    ? `'${text}`
    : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export function serializeSalesInvoiceCsv(
  rows: SalesInvoiceExportRow[],
  columns: ExportColumn[] = salesInvoiceExportColumns,
): string {
  const header = columns.map((column) => escapeCsvValue(column.header)).join(';');
  const records = rows.map((row) =>
    columns.map((column) => escapeCsvValue(row[column.key])).join(';')
  );
  return `\uFEFF${[header, ...records].join('\r\n')}\r\n`;
}
