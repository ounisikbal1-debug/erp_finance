import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateMaterialImportRow } from './material-import-validation';

describe('validateMaterialImportRow', () => {
  it('accepts a master-data row without any initial stock movement', () => {
    assert.equal(validateMaterialImportRow({
      sku: 'MAT-1',
      name: 'Article',
      unitCode: 'kg',
      unitPrice: '12.500',
      costPrice: '8.250',
      minimumStock: '0',
    }, 0, [], []), null);
  });

  it('accepts fractional thresholds only for measurement units', () => {
    const measured = {
      sku: 'MAT-KG',
      name: 'Farine',
      unitCode: 'KG',
      unitPrice: '1',
      costPrice: '1',
      minimumStock: '1.250',
    };
    assert.equal(validateMaterialImportRow(measured, 0, [], []), null);
    assert.match(String(validateMaterialImportRow({ ...measured, unitCode: 'EA' }, 0, [], [])), /compatible avec unitCode/);
  });

  it('rejects invalid units, amounts, barcodes, thresholds, and repeated references', () => {
    const rows = [{ sku: 'MAT-1', name: 'Article', unitCode: 'EA', unitPrice: '1', costPrice: '1' }];
    assert.match(String(validateMaterialImportRow({ ...rows[0], unitCode: 'UNKNOWN' }, 0, rows, [])), /unitCode/);
    assert.match(String(validateMaterialImportRow({ ...rows[0], unitPrice: '-1', costPrice: '0' }, 0, rows, [])), /unitPrice/);
    assert.match(String(validateMaterialImportRow({ ...rows[0], costPrice: '' }, 0, rows, [])), /explicitement renseignés/);
    assert.match(String(validateMaterialImportRow({ ...rows[0], barcode: 'x'.repeat(129) }, 0, rows, [])), /barcode/);
    assert.match(String(validateMaterialImportRow({ ...rows[0], minimumStock: '1.5' }, 0, rows, [])), /minimumStock/);
    assert.match(String(validateMaterialImportRow(rows[0], 1, rows.concat(rows[0]), [])), /existe déjà/);
    assert.match(String(validateMaterialImportRow(rows[0], 0, rows, ['mat-1'])), /existe déjà/);
  });

  it('requires both a reference and designation', () => {
    assert.match(String(validateMaterialImportRow({ sku: '', name: 'Article', unitPrice: '0' }, 0, [], [])), /obligatoires/);
  });
});
