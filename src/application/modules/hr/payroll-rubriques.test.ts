import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HrRequestError } from './errors';
import { assertCanManagePayrollRubriques, validatePayrollRubriqueInput, validatePayrollRubriqueList } from './payroll-rubriques';

describe('payroll rubric administration', () => {
  it('normalizes valid rubric values and drops unsupported client fields', () => {
    assert.deepEqual(validatePayrollRubriqueInput({
      code: ' prime_except ',
      label: ' Prime exceptionnelle ',
      category: 'PRIME',
      defaultAmount: 500,
      entityId: 'other-entity',
    }), {
      code: 'PRIME_EXCEPT',
      label: 'Prime exceptionnelle',
      category: 'PRIME',
      defaultAmount: 500,
    });
  });

  it('rejects invalid codes, categories, labels and default amounts', () => {
    assert.throws(() => validatePayrollRubriqueInput({ code: 'bad code', label: 'Prime', category: 'PRIME', defaultAmount: 1 }));
    assert.throws(() => validatePayrollRubriqueInput({ code: 'BONUS', label: ' ', category: 'PRIME', defaultAmount: 1 }));
    assert.throws(() => validatePayrollRubriqueInput({ code: 'BONUS', label: 'Prime', category: 'UNKNOWN', defaultAmount: 1 }));
    assert.throws(() => validatePayrollRubriqueInput({ code: 'BONUS', label: 'Prime', category: 'PRIME', defaultAmount: -1 }));
    assert.throws(() => validatePayrollRubriqueInput({ code: 'BONUS', label: 'Prime', category: 'PRIME', defaultAmount: Number.NaN }));
    assert.throws(() => validatePayrollRubriqueInput({ code: 'BONUS', label: 'Prime', category: 'PRIME', defaultAmount: Number.MAX_VALUE }));
  });

  it('validates country rubric batches before persistence and rejects duplicates', () => {
    assert.deepEqual(validatePayrollRubriqueList([
      { code: 'BONUS', label: 'Bonus', category: 'PRIME', defaultAmount: 10 },
    ]), [
      { code: 'BONUS', label: 'Bonus', category: 'PRIME', defaultAmount: 10 },
    ]);
    assert.throws(() => validatePayrollRubriqueList([]), /ne sont pas supprimées/);
    assert.throws(() => validatePayrollRubriqueList([
      { code: 'BONUS', label: 'Bonus', category: 'PRIME', defaultAmount: 10 },
      { code: 'bonus', label: 'Second bonus', category: 'PRIME', defaultAmount: 5 },
    ]), /uniques/);
  });

  it('allows only administrators to mutate rubriques shared by every entity', () => {
    assert.doesNotThrow(() => assertCanManagePayrollRubriques('ADMIN'));
    assert.throws(
      () => assertCanManagePayrollRubriques('HR_MANAGER'),
      (error: unknown) => error instanceof HrRequestError && error.statusCode === 403,
    );
  });
});
