import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BudgetRequestError } from './errors';
import {
  parseBudgetForecastPeriod,
  parseBudgetPeriod,
  validateBudgetDraftAmount,
  validateBudgetDraftInput,
  validateBudgetRevisionInput,
} from './validation';

describe('budget input validation', () => {
  it('parses valid calendar months as UTC half-open intervals', () => {
    assert.deepEqual(parseBudgetPeriod('2026-02'), {
      period: '2026-02',
      startAt: new Date('2026-02-01T00:00:00.000Z'),
      endExclusive: new Date('2026-03-01T00:00:00.000Z'),
    });
  });

  it('uses a validated reference month to scope the annual forecast', () => {
    assert.deepEqual(parseBudgetForecastPeriod('2026-03'), {
      year: 2026,
      asOfPeriod: '2026-03',
      yearStart: new Date('2026-01-01T00:00:00.000Z'),
      nextYearStart: new Date('2027-01-01T00:00:00.000Z'),
    });
    assert.throws(() => parseBudgetForecastPeriod('2026'), BudgetRequestError);
  });

  it('rejects invalid months and non-millime budget amounts', () => {
    assert.throws(() => parseBudgetPeriod('2026-13'), BudgetRequestError);
    assert.throws(() => parseBudgetPeriod('2026-2'), BudgetRequestError);
    assert.throws(() => validateBudgetDraftInput({ period: '2026-02', accountCode: '601', amount: -1 }), /positif ou nul/);
    assert.throws(() => validateBudgetDraftInput({ period: '2026-02', accountCode: '601', amount: 1.0001 }), /millime/);
  });

  it('normalizes valid budget lines', () => {
    assert.deepEqual(validateBudgetDraftInput({
      period: '2026-02',
      accountCode: ' 601 ',
      amount: 123.456,
      entityId: 'untrusted-entity',
    }), {
      period: '2026-02',
      accountCode: '601',
      amount: 123.456,
    });
  });

  it('validates draft amount changes at millime precision', () => {
    assert.equal(validateBudgetDraftAmount({ amount: 12.345 }), 12.345);
    assert.throws(() => validateBudgetDraftAmount({ amount: 12.3451 }), /millime/);
    assert.throws(() => validateBudgetDraftAmount({ amount: -1 }), /positif ou nul/);
    assert.throws(() => validateBudgetDraftAmount({ amount: '12' }), /positif ou nul/);
  });

  it('requires a meaningful reason for a millime-precise budget revision', () => {
    assert.deepEqual(validateBudgetRevisionInput({ amount: 125.001, reason: 'Actualisation des coûts' }), {
      amount: 125.001,
      reason: 'Actualisation des coûts',
    });
    assert.throws(() => validateBudgetRevisionInput({ amount: 1.0001, reason: 'Justification' }), /millime/);
    assert.throws(() => validateBudgetRevisionInput({ amount: 10, reason: 'non' }), /motif/);
  });
});
