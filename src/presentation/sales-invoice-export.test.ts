import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectSalesInvoicePages,
  mapSalesInvoicesToExportRows,
  salesInvoiceExportColumns,
  serializeSalesInvoiceCsv,
} from './sales-invoice-export';

describe('sales invoice export', () => {
  it('collects every page for full exports using the API page size', async () => {
    const pages = new Map([
      [1, { items: Array.from({ length: 100 }, (_, index) => ({ invoiceNumber: `INV-${index + 1}` })), pagination: { totalPages: 3 } }],
      [2, { items: Array.from({ length: 100 }, (_, index) => ({ invoiceNumber: `INV-${index + 101}` })), pagination: { totalPages: 3 } }],
      [3, { items: Array.from({ length: 5 }, (_, index) => ({ invoiceNumber: `INV-${index + 201}` })), pagination: { totalPages: 3 } }],
    ]);
    const requests: Array<[number, number]> = [];

    const invoices = await collectSalesInvoicePages(async (page, pageSize) => {
      requests.push([page, pageSize]);
      const result = pages.get(page);
      assert.ok(result);
      return result;
    }, 100);

    assert.deepEqual(requests, [[1, 100], [2, 100], [3, 100]]);
    assert.equal(invoices.length, 205);
    assert.equal(invoices[0].invoiceNumber, 'INV-1');
    assert.equal(invoices[204].invoiceNumber, 'INV-205');
  });

  it('preserves page-fetch errors so the export can surface them', async () => {
    await assert.rejects(
      collectSalesInvoicePages(async () => { throw new Error('synthetic API failure'); }, 100),
      /synthetic API failure/,
    );
  });

  it('maps invoice data and exports the expected header and row values', () => {
    const [row] = mapSalesInvoicesToExportRows([{
      invoiceNumber: 'INV-TEST-1',
      createdAt: '2026-11-03T10:00:00.000Z',
      dueDate: null,
      customer: { name: 'Client test' },
      status: 'ISSUED',
      documentCurrencyCode: null,
      documentSubTotal: null,
      documentTaxAmount: null,
      documentStampDuty: null,
      documentTotalAmount: null,
      functionalCurrencyCode: null,
      currencyCode: null,
      subTotal: 100,
      taxAmount: 19,
      totalAmount: 119,
      exchangeRate: null,
      exchangeRateDate: null,
      exchangeRateSource: null,
      createdByUsername: 'seller',
      approvedByUsername: null,
      issuedByUsername: 'issuer',
      postingJournalEntryId: 'journal-1',
    }]);

    assert.equal(row.invoiceNumber, 'INV-TEST-1');
    assert.equal(row.issueDate, '2026-11-03');
    assert.equal(row.dueDate, '');
    assert.equal(row.documentCurrency, 'Historique inconnu');
    assert.equal(row.documentTotalAmount, null);
    assert.equal(row.functionalCurrency, 'Historique inconnu');
    assert.equal(row.totalAmount, 119);
    assert.equal(row.journalEntry, 'journal-1');

    const lines = serializeSalesInvoiceCsv([row]).replace(/^\uFEFF/, '').trimEnd().split('\r\n');
    assert.equal(lines.length, 2);
    assert.equal(lines[0], salesInvoiceExportColumns.map((column) => `"${column.header}"`).join(';'));
    assert.equal(lines[1].split(';')[0], '"INV-TEST-1"');
    assert.equal(lines[1].split(';')[11], '"100"');
  });

  it('quotes separators, quotes, line breaks, and Unicode text', () => {
    const csv = serializeSalesInvoiceCsv([{
      invoiceNumber: 'INV-1',
      customer: 'Société "Été"; Nord\r\nRue 2',
    }], [
      { header: 'Numéro', key: 'invoiceNumber' },
      { header: 'Client', key: 'customer' },
    ]);

    assert.equal(
      csv,
      '\uFEFF"Numéro";"Client"\r\n"INV-1";"Société ""Été""; Nord\r\nRue 2"\r\n',
    );
  });

  it('prefixes formula-leading strings, including those preceded by whitespace', () => {
    const csv = serializeSalesInvoiceCsv([{
      invoiceNumber: '=1+1',
      customer: '  @SUM(A1:A2)',
      status: '-cmd',
      exchangeRateSource: '+HYPERLINK("https://example.invalid","open")',
    }], [
      { header: 'Numéro', key: 'invoiceNumber' },
      { header: 'Client', key: 'customer' },
      { header: 'Statut', key: 'status' },
      { header: 'Source', key: 'exchangeRateSource' },
    ]);

    assert.equal(
      csv,
      '\uFEFF"Numéro";"Client";"Statut";"Source"\r\n"\'=1+1";"\'  @SUM(A1:A2)";"\'-cmd";"\'+HYPERLINK(""https://example.invalid"",""open"")"\r\n',
    );
  });

  it('exports the header even when there are no invoices', () => {
    const csv = serializeSalesInvoiceCsv([]);
    assert.equal(
      csv,
      `\uFEFF${salesInvoiceExportColumns.map((column) => `"${column.header}"`).join(';')}\r\n`,
    );
  });
});
