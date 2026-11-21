import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createCustomsTariffCsvTemplate,
  CUSTOMS_TARIFF_CSV_TEMPLATE_COLUMNS,
  previewCustomsTariffCsv,
  type CustomsTariffCsvImportSettings,
} from './tariff-import';

const settings: CustomsTariffCsvImportSettings = {
  sourceName: 'Tarif officiel de test',
  sourceUrl: 'https://www.douane.gov.tn/tarif-web',
  sourceReference: 'Édition synthétique de test 2026-01',
  delimiter: ';',
  decimalSeparator: '.',
  dateFormat: 'YYYY-MM-DD',
  columns: CUSTOMS_TARIFF_CSV_TEMPLATE_COLUMNS,
  bases: {
    customsDutyBaseComponents: ['CIF'],
    consumptionDutyBaseComponents: ['CIF', 'CUSTOMS_DUTY'],
    fodecBaseComponents: ['CIF', 'CUSTOMS_DUTY'],
    importVatBaseComponents: ['CIF', 'CUSTOMS_DUTY', 'CONSUMPTION_DUTY', 'FODEC'],
    customsServiceFeeBaseComponents: ['IMPORT_VAT'],
  },
};

const template = createCustomsTariffCsvTemplate();
const header = template.replace(/^\uFEFF/, '').trimEnd();
const validRow = '8471300000;"Ordinateur, portable";5.5;0;1;19;3;2026-01-01;;;;';

describe('official customs tariff CSV ingestion', () => {
  it('maps a UTF-8 semicolon export into validated 10-digit NGP draft rates', () => {
    const preview = previewCustomsTariffCsv(`${template}${validRow}\r\n`, settings);

    assert.equal(preview.canImport, true);
    assert.equal(preview.rowCount, 1);
    assert.equal(preview.validCount, 1);
    assert.deepEqual(preview.errors, []);
    assert.equal(preview.records[0].tariffCode, '8471300000');
    assert.equal(preview.records[0].description, 'Ordinateur, portable');
    assert.equal(preview.records[0].customsDutyRate, 5.5);
    assert.equal(preview.records[0].effectiveFrom, '2026-01-01');
    assert.equal(preview.records[0].effectiveTo, null);
    assert.equal(preview.records[0].sourceReference, settings.sourceReference);
  });

  it('rejects the whole batch for malformed dates, duplicates, or missing mappings', () => {
    const duplicated = `${header}\n${validRow}\n${validRow}`;
    const duplicatePreview = previewCustomsTariffCsv(duplicated, settings);
    assert.equal(duplicatePreview.canImport, false);
    assert.equal(duplicatePreview.records.length, 0);
    assert.match(duplicatePreview.errors.join('\n'), /dupliqué/);

    const malformed = previewCustomsTariffCsv(
      `${header}\n${validRow.replace('2026-01-01', '2026-02-31')}`,
      settings,
    );
    assert.equal(malformed.canImport, false);
    assert.match(malformed.errors.join('\n'), /date calendaire invalide/);

    assert.throws(
      () => previewCustomsTariffCsv(`${header}\n${validRow}`, {
        ...settings,
        columns: { ...settings.columns, tariffCode: 'Code absent' },
      }),
      /colonne.*absente/i,
    );
  });

  it('requires an official source, explicit tax bases, and a supported bounded CSV', () => {
    assert.throws(
      () => previewCustomsTariffCsv(`${header}\n${validRow}`, {
        ...settings,
        sourceUrl: 'https://example.test/tariff',
      }),
      /domaine officiel douane.gov.tn/i,
    );
    assert.throws(
      () => previewCustomsTariffCsv(`${header}\n${validRow}`, {
        ...settings,
        bases: { ...settings.bases, fodecBaseComponents: [] },
      }),
      /chaque assiette fiscale/i,
    );
    assert.throws(
      () => previewCustomsTariffCsv(`${header}\n"${'x'.repeat(500_001)}"`, settings),
      /500 Ko maximum/,
    );
    assert.throws(
      () => previewCustomsTariffCsv(`${header}\n"unfinished`, settings),
      /champ entre guillemets non terminé/,
    );
  });
});
