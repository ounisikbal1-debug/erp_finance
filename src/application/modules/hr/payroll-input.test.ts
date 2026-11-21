import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validatePayrollCalculationInput } from './payroll-input';

describe('validatePayrollCalculationInput', () => {
  it('accepts valid simulation inputs and strips client-controlled unknown fields', () => {
    assert.deepEqual(validatePayrollCalculationInput({
      countryCode: ' tn ',
      period: '2026-01',
      baseSalary: 2500,
      presenceBonus: 15.589,
      childrenCount: 2,
      isHeadOfFamily: true,
      rubriques: [{ code: 'BONUS', category: 'PRIME', amount: 100 }],
      entityId: 'attacker-entity',
      role: 'ADMIN',
    }), {
      countryCode: 'TN',
      period: '2026-01',
      fiscalBenefitType: 'COMPLEMENTARY_RETIREMENT',
      baseSalary: 2500,
      presenceBonus: 15.589,
      isHeadOfFamily: true,
      childrenCount: 2,
      rubriques: [{ code: 'BONUS', category: 'PRIME', amount: 100 }],
    });
  });

  it('rejects invalid monetary, count, and percentage values', () => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, '100']) {
      assert.throws(() => validatePayrollCalculationInput({ countryCode: 'TN', baseSalary: value }));
    }
    assert.throws(() => validatePayrollCalculationInput({ countryCode: 'TN', childrenCount: 1.5 }));
    assert.throws(() => validatePayrollCalculationInput({ countryCode: 'TN', childrenCount: -1 }));
    assert.throws(() => validatePayrollCalculationInput({ countryCode: 'TN', complementaryRetirementRate: 101 }));
    assert.throws(() => validatePayrollCalculationInput({ countryCode: 'TN', isHeadOfFamily: 'true' }));
    assert.throws(() => validatePayrollCalculationInput({ countryCode: 'TN', baseSalary: 1000, period: '2026-13' }));
  });

  it('rejects conflicting salary aliases and malformed simulation bodies', () => {
    assert.throws(() => validatePayrollCalculationInput({ countryCode: 'TN', baseSalary: 2000, grossSalary: 2500 }), /différents/);
    assert.throws(() => validatePayrollCalculationInput({ countryCode: 'TN' }), /salaire de base est obligatoire/);
    assert.throws(() => validatePayrollCalculationInput([]), /invalides/);
    assert.throws(() => validatePayrollCalculationInput({}), /pays de calcul/);
  });

  it('uses the trusted entity country instead of a client-supplied country', () => {
    assert.equal(
      validatePayrollCalculationInput({ countryCode: 'FR', baseSalary: 1000 }, 'TN').countryCode,
      'TN',
    );
    assert.throws(() => validatePayrollCalculationInput(null, 'TN'), /invalides/);
  });
});
