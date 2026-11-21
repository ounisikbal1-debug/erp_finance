import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateMasterDataImportRow } from './master-data-import-validation';

describe('validateMasterDataImportRow', () => {
  it('accepts a customer or vendor master-data row without creating transactions', () => {
    const row = { code: 'P-001', name: 'Partenaire', email: 'contact@example.test' };
    assert.equal(validateMasterDataImportRow('customer', row, 0, [row], []), null);
    assert.equal(validateMasterDataImportRow('vendor', row, 0, [row], []), null);
  });

  it('rejects missing fields, duplicate codes and oversized contact fields', () => {
    const row = { code: 'P-001', name: 'Partenaire' };
    assert.match(String(validateMasterDataImportRow('customer', { ...row, name: '' }, 0, [], [])), /obligatoires/);
    assert.match(String(validateMasterDataImportRow('vendor', row, 1, [row, row], [])), /déjà ou apparaît plusieurs fois/);
    assert.match(String(validateMasterDataImportRow('vendor', row, 0, [row], ['p-001'])), /déjà ou apparaît plusieurs fois/);
    assert.match(String(validateMasterDataImportRow('customer', { ...row, address: 'x'.repeat(501) }, 0, [], [])), /address dépasse/);
  });
});
