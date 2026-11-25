import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getStockPostingConfigurationIssues, stockValueMillimes } from './stock-accounting';

describe('stock accounting configuration', () => {
  const mapping = {
    stockAssetAccountCode: '31',
    stockAdjustmentAccountCode: '681',
    productionWipAccountCode: '33',
  };
  const accounts = [
    { code: '31', type: 'Asset', isPostingAllowed: true },
    { code: '681', type: 'Expense', isPostingAllowed: true },
    { code: '33', type: 'Asset', isPostingAllowed: true },
    { code: 'LAB', type: 'Expense', isPostingAllowed: true },
    { code: 'OH', type: 'Expense', isPostingAllowed: true },
  ];

  it('validates country-scoped accounts for adjustments and production', () => {
    assert.deepEqual(getStockPostingConfigurationIssues('TN', mapping, accounts, 'adjustment'), []);
    assert.deepEqual(getStockPostingConfigurationIssues('TN', mapping, accounts, 'production'), []);
    assert.ok(getStockPostingConfigurationIssues('TN', mapping, accounts.slice(0, 1), 'adjustment').length > 0);
    assert.ok(getStockPostingConfigurationIssues('TN', { ...mapping, productionWipAccountCode: '31' }, accounts, 'production').length > 0);
    assert.ok(getStockPostingConfigurationIssues(
      'TN',
      { ...mapping, stockAssetAccountCode: 'GROUP' },
      [...accounts, { code: 'GROUP', type: 'Asset', isPostingAllowed: false }],
      'production',
    ).length > 0);
  });

  it('requires configured and distinct expense accounts only for declared production costs', () => {
    const costMapping = {
      ...mapping,
      productionLaborAccountCode: 'LAB',
      productionOverheadAccountCode: 'OH',
    };
    assert.deepEqual(
      getStockPostingConfigurationIssues('TN', costMapping, accounts, 'production', { labor: true, overhead: true }),
      [],
    );
    assert.ok(getStockPostingConfigurationIssues(
      'TN',
      mapping,
      accounts,
      'production',
      { labor: true, overhead: false },
    ).some((issue) => issue.includes('main-d’Å“uvre')));
    assert.ok(getStockPostingConfigurationIssues(
      'TN',
      { ...costMapping, productionOverheadAccountCode: 'LAB' },
      accounts,
      'production',
      { labor: true, overhead: true },
    ).some((issue) => issue.includes('distincts')));
  });

  it('calculates only positive millime-precise stock values', () => {
    assert.equal(stockValueMillimes(3, 1.25), 3750);
    assert.equal(stockValueMillimes(1.125, 1.25), 1406);
    assert.throws(() => stockValueMillimes(1, 0), /coût de revient positif/);
    assert.throws(() => stockValueMillimes(1, 0.0001), /précision comptable au millime/);
  });
});
