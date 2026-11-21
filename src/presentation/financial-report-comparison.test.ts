import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareFinancialPeriods, getFullMonthsInPeriod, getPriorYearPeriod } from './financial-report-comparison';

describe('financial report comparison', () => {
  it('uses the same dates in the previous calendar year', () => {
    assert.deepEqual(getPriorYearPeriod('2026-01-01', '2026-03-31'), {
      from: '2025-01-01',
      to: '2025-03-31',
    });
  });

  it('clamps a leap-day comparison to the last valid day of February', () => {
    assert.deepEqual(getPriorYearPeriod('2024-02-29', '2024-03-31'), {
      from: '2023-02-28',
      to: '2023-03-31',
    });
  });

  it('rejects invalid dates and dates without a prior calendar year', () => {
    assert.equal(getPriorYearPeriod('2026-02-29', '2026-03-01'), null);
    assert.equal(getPriorYearPeriod('0001-01-01', '0001-12-31'), null);
  });

  it('returns only complete calendar months for budget comparisons', () => {
    assert.deepEqual(getFullMonthsInPeriod('2026-01-15', '2026-04-02'), ['2026-02', '2026-03']);
    assert.deepEqual(getFullMonthsInPeriod('2026-01-01', '2026-02-28'), ['2026-01', '2026-02']);
    assert.deepEqual(getFullMonthsInPeriod('2026-02-29', '2026-03-01'), []);
    assert.deepEqual(getFullMonthsInPeriod('2026-04-01', '2026-03-31'), []);
  });

  it('compares revenue, expenses and net result without judging whether a change is favorable', () => {
    assert.deepEqual(compareFinancialPeriods(
      [{ type: 'Revenue', movement: 150 }, { type: 'Expense', movement: 90 }],
      [{ type: 'Revenue', movement: 100 }, { type: 'Expense', movement: 70 }],
    ), [
      { label: 'Produits', current: 150, priorYear: 100, difference: 50, percentChange: 50 },
      { label: 'Charges', current: 90, priorYear: 70, difference: 20, percentChange: 28.57142857142857 },
      { label: 'Résultat de période', current: 60, priorYear: 30, difference: 30, percentChange: 100 },
    ]);
  });

  it('leaves unavailable values and zero-base percentages uncalculated', () => {
    const comparisons = compareFinancialPeriods(
      [{ type: 'Revenue', movement: 50 }, { type: 'Expense', movement: null }],
      [{ type: 'Revenue', movement: 0 }, { type: 'Expense', movement: 20 }],
    );
    assert.equal(comparisons[0].difference, 50);
    assert.equal(comparisons[0].percentChange, null);
    assert.equal(comparisons[2].current, null);
    assert.equal(comparisons[2].difference, null);
  });
});
