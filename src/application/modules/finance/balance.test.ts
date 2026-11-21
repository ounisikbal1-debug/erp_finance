import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateBalance, buildBalanceLineFilter } from './balance';
import { FinanceRequestError } from './errors';

describe('balance générale', () => {
  it('ne retient que les écritures postées, avec le périmètre société éventuel', () => {
    assert.deepEqual(buildBalanceLineFilter('entity-1'), {
      journalEntry: { status: 'POSTED', entityId: 'entity-1' },
    });
    assert.deepEqual(buildBalanceLineFilter(), {
      journalEntry: { status: 'POSTED' },
    });
  });

  it('cumule les montants au millime sans dérive flottante', () => {
    assert.deepEqual(aggregateBalance([
      { accountCode: '411', debit: 0.1, credit: 0 },
      { accountCode: '411', debit: 0.2, credit: 0 },
      { accountCode: '411', debit: 0, credit: 0.1 },
      { accountCode: '707', debit: 0, credit: 0.2 },
    ]), [
      { accountCode: '411', totalDebit: 0.3, totalCredit: 0.1, balance: 0.2 },
      { accountCode: '707', totalDebit: 0, totalCredit: 0.2, balance: -0.2 },
    ]);
  });

  it('refuse les montants invalides du grand livre plutôt que de fausser le total', () => {
    assert.throws(() => aggregateBalance([
      { accountCode: '411', debit: 0.0004, credit: 0 },
    ]), /montant invalide/);
    assert.throws(() => aggregateBalance([
      { accountCode: '411', debit: Number.NaN, credit: 0 },
    ]), /montant invalide/);
  });

  it('refuses posted lines with both sides positive or both sides empty', () => {
    for (const invalidLine of [
      { accountCode: '411', debit: 1, credit: 1 },
      { accountCode: '411', debit: 0, credit: 0 },
    ]) {
      assert.throws(
        () => aggregateBalance([invalidLine]),
        (error: unknown) => error instanceof FinanceRequestError
          && error.statusCode === 422
          && error.message.includes('doit porter un montant au débit ou au crédit'),
      );
    }
  });
});
