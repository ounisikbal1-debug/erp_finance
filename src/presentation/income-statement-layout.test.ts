import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildIncomeStatementLines } from './income-statement-layout';

describe('model-inspired SAFE income statement', () => {
  it('calculates all rows from classified account movements and preserves SAFE totals', () => {
    const lines = buildIncomeStatementLines({
      accounts: [
        { type: 'Revenue', movement: 1200, financialCategory: 'REVENUE' },
        { type: 'Revenue', movement: 100, financialCategory: 'FINANCIAL_INCOME' },
        { type: 'Expense', movement: 400, financialCategory: 'OPERATING_EXPENSE' },
        { type: 'Expense', movement: 50, financialCategory: 'INTEREST_EXPENSE' },
        { type: 'Revenue', movement: 20, financialCategory: 'EXCEPTIONAL_INCOME' },
        { type: 'Expense', movement: 10, financialCategory: 'EXCEPTIONAL_EXPENSE' },
      ],
      revenue: 1320,
      expenses: 460,
      taxRatePercent: 20,
    });
    const amounts = Object.fromEntries(lines.map(({ label, amount }) => [label, amount]));

    assert.equal(amounts['Total produits d’exploitation'], 1200);
    assert.equal(amounts['Total charges d’exploitation'], 400);
    assert.equal(amounts['Résultat d’exploitation'], 800);
    assert.equal(amounts['Résultat financier'], 50);
    assert.equal(amounts['Résultat courant avant impôts'], 850);
    assert.equal(amounts['Résultat exceptionnel'], 10);
    assert.equal(amounts['Impôt sur le résultat'], 172);
    assert.equal(amounts['Résultat net estimatif'], 688);
    assert.equal(amounts['Résultat comptable de période (produits − charges)'], 860);
    assert.equal(lines.find(({ label }) => label === 'Résultat net estimatif')?.percentageOfRevenue, 688 / 1320 * 100);
  });

  it('shows zero for unconfigured financial and exceptional categories and estimates tax only on profit', () => {
    const lines = buildIncomeStatementLines({
      accounts: [{ type: 'Revenue', movement: 500 }, { type: 'Expense', movement: 700 }],
      revenue: 500,
      expenses: 700,
      taxRatePercent: 20,
    });
    const amount = (label: string) => lines.find((line) => line.label === label)?.amount;

    assert.equal(amount('Produits financiers'), 0);
    assert.equal(amount('Produits exceptionnels'), 0);
    assert.equal(amount('Impôt sur le résultat'), 0);
    assert.equal(amount('Résultat net estimatif'), -200);
  });
});
