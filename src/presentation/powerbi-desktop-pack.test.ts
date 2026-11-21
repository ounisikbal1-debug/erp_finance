import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { join } from 'node:path';

const starterDirectory = join(process.cwd(), 'integrations', 'powerbi', 'desktop-starter');
const datasets = [
  ['SAFE_JournalLines.m', 'api/bi/journal-lines'],
  ['SAFE_SalesInvoices.m', 'api/bi/sales-invoices'],
  ['SAFE_PurchaseInvoices.m', 'api/bi/purchase-invoices'],
] as const;

describe('Power BI Desktop starter pack', () => {
  for (const [fileName, endpoint] of datasets) {
    it(`${fileName} reads the expected SAFE endpoint with period and provenance`, () => {
      const query = readFileSync(join(starterDirectory, fileName), 'utf8');

      assert.ok(query.includes(`RelativePath = "${endpoint}"`));
      assert.ok(query.includes('Date.AddDays(PeriodEnd, -364)'));
      assert.ok(query.includes('SAFE_Entity'));
      assert.ok(query.includes('SAFE_PeriodStart'));
      assert.ok(query.includes('SAFE_PeriodEnd'));
      assert.ok(query.includes('SAFE_DataGeneratedAt'));
      assert.ok(!query.includes('entityId'));
      assert.ok(!query.includes('Authorization'));
      assert.ok(!query.includes('Content ='));
    });
  }

  it('SAFE_ReceivablesAging.m reads the aging endpoint and carries cutoff, currency, and diagnostics', () => {
    const query = readFileSync(join(starterDirectory, 'SAFE_ReceivablesAging.m'), 'utf8');

    assert.ok(query.includes('RelativePath = "api/bi/receivables-aging"'));
    assert.ok(query.includes('asOf = Date.ToText(AsOf'));
    assert.ok(query.includes('Table.FromRecords(Response[invoices]'));
    assert.ok(query.includes('Response[totals][outstanding]'));
    assert.ok(query.includes('SAFE_Currency'));
    assert.ok(query.includes('SAFE_AsOf'));
    assert.ok(query.includes('SAFE_DataGeneratedAt'));
    assert.ok(query.includes('SAFE_TotalOutstanding'));
    assert.ok(!query.includes('entityId'));
    assert.ok(!query.includes('Authorization'));
    assert.ok(!query.includes('Content ='));
  });

  it('documents that this is a starter pack and not a prebuilt PBIX', () => {
    const guide = readFileSync(join(starterDirectory, 'README.txt'), 'utf8');
    const incomeStatement = readFileSync(join(process.cwd(), 'src', 'presentation', 'IncomeStatementPanel.tsx'), 'utf8');
    const downloadPackage = readFileSync(join(process.cwd(), 'public', 'powerbi', 'SAFE_Desktop_Starter.zip'));

    assert.match(guide, /Ce n’est pas un rapport PBIX\/PBIT/i);
    assert.match(guide, /pages et visuels doivent être créés/i);
    assert.match(guide, /même PC/i);
    assert.match(guide, /Aucune donnée Power BI n’est importée dans SAFE/i);
    assert.match(guide, /SAFE_ReceivablesAging\.m/);
    assert.match(incomeStatement, /href="\/powerbi\/SAFE_Desktop_Starter\.zip"/);
    assert.match(incomeStatement, /Télécharger le pack SAFE/);
    assert.equal(downloadPackage.subarray(0, 2).toString('ascii'), 'PK');
    for (const assetName of [
      'README.txt',
      'SAFE_JournalLines.m',
      'SAFE_SalesInvoices.m',
      'SAFE_PurchaseInvoices.m',
      'SAFE_ReceivablesAging.m',
    ]) {
      assert.ok(downloadPackage.includes(Buffer.from(assetName)), `Download ZIP is missing ${assetName}.`);
    }
  });
});
