import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { describe, it } from 'node:test';
import { calculateDashboardSummary } from '../application/modules/advanced-finance/dashboard';
import { createFinancialDashboardWorkbook } from './financial-dashboard-workbook';

function makeSnapshot(name = 'SAFE TN') {
  return calculateDashboardSummary({
    entity: { name, countryCode: 'TN', currencyCode: 'TND' },
    asOf: new Date('2026-11-15T12:00:00.000Z'),
    materials: [],
    invoices: [{ status: 'ISSUED', totalAmount: 120, currencyCode: 'TND' }],
    accounts: [{ code: '70', type: 'Revenue' }, { code: '60', type: 'Expense' }],
    journalLines: [
      { accountCode: '70', date: new Date('2026-11-04T00:00:00.000Z'), debit: 0, credit: 125 },
      { accountCode: '60', date: new Date('2026-11-05T00:00:00.000Z'), debit: 30, credit: 0 },
    ],
  });
}

describe('financial dashboard Excel workbook', () => {
  it('contains SAFE metrics, filterable monthly source data and explicit unavailable ratios', async () => {
    const exported = createFinancialDashboardWorkbook([makeSnapshot()], new Date('2026-11-15T12:00:00.000Z'), 3);
    const exportPath = path.join(tmpdir(), `safe-dashboard-${randomUUID()}.xlsx`);
    try {
      await exported.xlsx.writeFile(exportPath);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(exportPath);

      assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), [
        'Synthèse', 'Données mensuelles', 'Ratios indisponibles',
      ]);
      const summary = workbook.getWorksheet('Synthèse');
      assert.ok(summary);
      assert.deepEqual(
        [1, 2, 3, 4, 5, 6].map((column) => summary.getCell(2, column).value),
        ['SAFE TN', 'TN', 'TND', '2025-12-01', '2026-11-15', 'Revenus comptabilisés'],
      );
      assert.equal(summary.getCell(2, 7).value, 125);
      assert.equal(summary.autoFilter, 'A1:I7');

      const monthly = workbook.getWorksheet('Données mensuelles');
      assert.equal(monthly?.rowCount, 4);
      assert.equal(monthly?.getCell(4, 5).value, 125);
      assert.equal(monthly?.getCell(4, 6).value, 30);
      assert.equal(monthly?.autoFilter, 'A1:F4');

      const ratios = workbook.getWorksheet('Ratios indisponibles');
      assert.ok(ratios);
      assert.ok(ratios.getRows(2, ratios.rowCount - 1)?.some((row) => row.getCell(1).value === 'ROE, ROA, marges et ROCE'));
      assert.ok(ratios.getRows(2, ratios.rowCount - 1)?.some((row) => row.getCell(2).value === 'Non calculé'));
    } finally {
      await unlink(exportPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  });

  it('keeps unavailable metrics explicit and rejects invalid periods or empty data', async () => {
    const unavailable = calculateDashboardSummary({
      entity: { name: 'SAFE FR', countryCode: 'FR', currencyCode: 'EUR' },
      asOf: new Date('2026-11-15T12:00:00.000Z'),
      materials: [],
      invoices: [],
      accounts: [],
      journalLines: [],
    });
    const workbook = createFinancialDashboardWorkbook([unavailable]);
    assert.equal(workbook.getWorksheet('Synthèse')?.getCell(2, 7).value, 'Indisponible');
    assert.throws(() => createFinancialDashboardWorkbook([], new Date(), 12), /Aucune entité SAFE/);
    assert.throws(() => createFinancialDashboardWorkbook([makeSnapshot()], new Date(), 0), /1 à 12 mois/);
  });

  it('labels synthetic demonstration data in workbook metadata and notes', () => {
    const workbook = createFinancialDashboardWorkbook(
      [makeSnapshot()],
      new Date('2026-11-09T00:00:00.000Z'),
      12,
      'EXEMPLE — DONNÉES SYNTHÉTIQUES',
    );
    assert.match(String(workbook.subject), /DONNÉES SYNTHÉTIQUES/);
    assert.match(String(workbook.title), /DONNÉES SYNTHÉTIQUES/);
    assert.equal(workbook.getWorksheet('Ratios indisponibles')?.getCell('A15').value, 'Type de données');
  });
});
