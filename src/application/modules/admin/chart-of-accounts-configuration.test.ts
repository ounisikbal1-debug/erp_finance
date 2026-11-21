import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  validateCountryAccountHierarchy,
  validateCountryAccounts,
} from './chart-of-accounts-configuration';
import { CountryConfigurationValidationError } from './country-configuration';

describe('country-specific chart of accounts configuration', () => {
  it('accepts editable, country-neutral accounts without imposing a national plan', () => {
    assert.deepEqual(validateCountryAccounts([
      { code: 'A-01', description: 'Custom account', classNumber: 8, type: 'Expense' },
      { code: 'REV.01', description: 'Special revenue', classNumber: 9, type: 'Revenue' },
    ]), [
      { code: 'A-01', description: 'Custom account', classNumber: 8, type: 'Expense' },
      { code: 'REV.01', description: 'Special revenue', classNumber: 9, type: 'Revenue' },
    ]);
  });

  it('rejects malformed, empty, unsupported and case-insensitive duplicate accounts', () => {
    assert.throws(
      () => validateCountryAccounts([]),
      CountryConfigurationValidationError,
    );
    assert.throws(() => validateCountryAccounts([{ code: '', description: 'X', classNumber: 1, type: 'Asset' }]));
    assert.throws(() => validateCountryAccounts([{ code: '1', description: ' ', classNumber: 1, type: 'Asset' }]));
    assert.throws(() => validateCountryAccounts([{ code: '1', description: 'Cash', classNumber: 1.5, type: 'Asset' }]));
    assert.throws(() => validateCountryAccounts([{ code: '1', description: 'Cash', classNumber: 1, type: 'Unknown' }]));
    assert.throws(() => validateCountryAccounts([
      { code: '1', description: 'Cash', classNumber: 1, type: 'Asset', countryId: 'other' },
    ]), /inconnus/);
    assert.throws(() => validateCountryAccounts([
      { code: 'acct', description: 'First', classNumber: 1, type: 'Asset' },
      { code: 'ACCT', description: 'Second', classNumber: 2, type: 'Liability' },
    ]), /uniques/);
  });

  it('accepts explicit financial classifications only when they match account type', () => {
    assert.deepEqual(validateCountryAccounts([{
      code: 'CASH',
      description: 'Cash and cash equivalents',
      classNumber: 1,
      type: 'Asset',
      financialCategory: 'CASH_EQUIVALENT',
    }])[0].financialCategory, 'CASH_EQUIVALENT');
    assert.deepEqual(validateCountryAccounts([{
      code: 'UNMAPPED',
      description: 'Unmapped account',
      classNumber: 1,
      type: 'Asset',
      financialCategory: null,
    }])[0].financialCategory, null);
    assert.throws(() => validateCountryAccounts([{
      code: 'BAD-CATEGORY',
      description: 'Invalid category',
      classNumber: 1,
      type: 'Asset',
      financialCategory: 'CASH',
    }]), /catégorie financière .* invalide/);
    assert.throws(() => validateCountryAccounts([{
      code: 'BAD-TYPE',
      description: 'Mismatched category',
      classNumber: 1,
      type: 'Expense',
      financialCategory: 'CASH_EQUIVALENT',
    }]), /ne correspond pas à son type comptable/);
  });

  it('accepts development stock groups while keeping asset and expense hierarchies separate', () => {
    const accounts = validateCountryAccounts([
      { code: 'STOCK-TEST', description: 'Stock group', classNumber: 3, type: 'Asset', isPostingAllowed: false },
      { code: '311', description: 'Raw materials', classNumber: 3, type: 'Asset', parentCode: 'STOCK-TEST' },
      { code: '33', description: 'Work in progress', classNumber: 3, type: 'Asset', parentCode: 'STOCK-TEST' },
      { code: 'CHARGES-TEST', description: 'Stock charges group', classNumber: 6, type: 'Expense', isPostingAllowed: false },
      { code: '603', description: 'Stock variation', classNumber: 6, type: 'Expense', parentCode: 'CHARGES-TEST' },
    ]);
    assert.doesNotThrow(() => validateCountryAccountHierarchy(accounts));
  });

  it('rejects missing, postable, mismatched and circular account parents', () => {
    const group = { code: 'GROUP', description: 'Group', classNumber: 3, type: 'Asset' as const, isPostingAllowed: false };
    assert.throws(() => validateCountryAccountHierarchy([
      { ...group, isPostingAllowed: true },
      { code: '311', description: 'Stock', classNumber: 3, type: 'Asset', parentCode: 'GROUP' },
    ]), /non comptabilisable/);
    assert.throws(() => validateCountryAccountHierarchy([
      { ...group },
      { code: '603', description: 'Charge', classNumber: 6, type: 'Expense', parentCode: 'GROUP' },
    ]), /même classe et au même type/);
    assert.throws(() => validateCountryAccountHierarchy([
      { code: 'A', description: 'A', classNumber: 3, type: 'Asset', isPostingAllowed: false, parentCode: 'B' },
      { code: 'B', description: 'B', classNumber: 3, type: 'Asset', isPostingAllowed: false, parentCode: 'A' },
    ]), /boucle/);
    assert.throws(() => validateCountryAccountHierarchy([
      { code: '311', description: 'Stock', classNumber: 3, type: 'Asset', parentCode: 'UNKNOWN' },
    ]), /introuvable/);
  });
});
