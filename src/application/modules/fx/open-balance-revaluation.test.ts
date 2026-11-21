import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateOpenFxRevaluationItems,
  firstDayOfNextMonth,
  type RevaluationBalance,
  type RevaluationRate,
} from './open-balance-revaluation';

const balances: RevaluationBalance[] = [{
  sourceId: 'AR-1',
  direction: 'CUSTOMER_RECEIPT',
  documentCurrencyCode: 'USD',
  functionalCurrencyCode: 'TND',
  documentTotalAmount: 100,
  functionalTotalAmount: 285,
  payments: [{
    amount: 140,
    settledDocumentAmount: 50,
    carryingAmount: 142.5,
    documentCurrencyCode: 'USD',
    currencyCode: 'TND',
    direction: 'CUSTOMER_RECEIPT',
    paidAt: new Date('2026-03-07T00:00:00.000Z'),
  }],
}];

const rates = new Map<string, RevaluationRate>([['USD', {
  rate: 3,
  effectiveDate: '2026-03-31',
  source: 'Test source',
}]]);

describe('open foreign-currency balance revaluation', () => {
  it('revalues only the remaining document balance against its remaining carrying amount', () => {
    const [item] = calculateOpenFxRevaluationItems(balances, rates, '2026-03-31');
    assert.deepEqual(item, {
      sourceId: 'AR-1',
      direction: 'CUSTOMER_RECEIPT',
      documentCurrencyCode: 'USD',
      openDocumentAmount: 50,
      oldCarryingAmount: 142.5,
      revaluedCarryingAmount: 150,
      adjustmentAmount: 7.5,
      exchangeRate: 3,
      exchangeRateEffectiveDate: '2026-03-31',
      exchangeRateSource: 'Test source',
      exchangeRateSourceUrl: null,
      exchangeRateImportedAt: null,
    });
  });

  it('skips settled invoices and invoices denominated in their functional currency', () => {
    const settled = {
      ...balances[0],
      payments: [{
        ...balances[0].payments[0],
        amount: 285,
        settledDocumentAmount: 100,
        carryingAmount: 285,
      }],
    };
    const local = { ...balances[0], sourceId: 'AR-2', documentCurrencyCode: 'TND' };
    assert.deepEqual(calculateOpenFxRevaluationItems([settled, local], rates, '2026-03-31'), []);
  });

  it('blocks when a foreign allocation has no reliable document or carrying amount', () => {
    const invalid = {
      ...balances[0],
      payments: [{ ...balances[0].payments[0], settledDocumentAmount: null, carryingAmount: null }],
    };
    assert.throws(
      () => calculateOpenFxRevaluationItems([invalid], rates, '2026-03-31'),
      /montant apuré en devise document.*manquant/,
    );
  });

  it('subtracts posted supplier credits using their frozen carrying amount at the reporting cutoff', () => {
    const [item] = calculateOpenFxRevaluationItems([{
      ...balances[0],
      credits: [{
        documentAmount: 10,
        carryingAmount: 28.5,
        currencyCode: 'USD',
        postedAt: new Date('2026-03-10T00:00:00.000Z'),
      }],
    }], rates, '2026-03-31');
    assert.equal(item.openDocumentAmount, 40);
    assert.equal(item.oldCarryingAmount, 114);
    assert.equal(item.revaluedCarryingAmount, 120);
    assert.equal(item.adjustmentAmount, 6);
  });

  it('ignores supplier credits posted after the month-end cutoff', () => {
    const [item] = calculateOpenFxRevaluationItems([{
      ...balances[0],
      credits: [{
        documentAmount: 10,
        carryingAmount: 28.5,
        currencyCode: 'USD',
        postedAt: new Date('2026-04-01T00:00:00.000Z'),
      }],
    }], rates, '2026-03-31');
    assert.equal(item.openDocumentAmount, 50);
    assert.equal(item.oldCarryingAmount, 142.5);
  });

  it('requires a valid closing rate no later than the revaluation date', () => {
    assert.throws(
      () => calculateOpenFxRevaluationItems(balances, new Map(), '2026-03-31'),
      /Aucun taux de clôture/,
    );
    assert.throws(
      () => calculateOpenFxRevaluationItems(balances, new Map([['USD', {
        rate: 3,
        effectiveDate: '2026-04-01',
        source: 'Future',
      }]]), '2026-03-31'),
      /taux de clôture .* invalide/,
    );
  });

  it('accepts only month-end revaluation dates', () => {
    assert.throws(
      () => calculateOpenFxRevaluationItems(balances, rates, '2026-03-30'),
      /date de fin de mois/,
    );
  });

  it('sets the automatic reversal date to the first of the following month', () => {
    assert.equal(firstDayOfNextMonth('2026-03-31'), '2026-04-01');
    assert.equal(firstDayOfNextMonth('2026-12-31'), '2027-01-01');
  });
});
