import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  validateEmployeeInput,
  validateEmployeeTerminationInput,
  validatePayslipPeriod,
  validatePayslipRubriques,
  assertEmployeeCanBeDeleted,
} from './employee-validation';

describe('assertEmployeeCanBeDeleted', () => {
  it('allows deletion only when no payslip history exists', () => {
    assert.doesNotThrow(() => assertEmployeeCanBeDeleted(0));
    assert.throws(() => assertEmployeeCanBeDeleted(1), /fiches de paie à conserver/);
    assert.throws(() => assertEmployeeCanBeDeleted(0, 1), /demandes de congé à conserver/);
  });
});

describe('validateEmployeeInput', () => {
  it('uses the scoped entity and accepts typed employee fields', () => {
    const employee = validateEmployeeInput({
      entityId: 'other-entity',
      firstName: ' Ada ',
      lastName: ' Lovelace ',
      email: ' ada@example.test ',
      baseSalary: 2500,
      childrenCount: 1,
      hiredAt: '2026-01-15',
      role: 'ADMIN',
    }, 'entity-1');
    assert.equal(employee.entityId, 'entity-1');
    assert.equal(employee.firstName, 'Ada');
    assert.equal(employee.email, 'ada@example.test');
    assert.equal(employee.hiredAt?.toISOString(), '2026-01-15T00:00:00.000Z');
    assert.equal('role' in employee, false);
  });

  describe('validatePayslipPeriod', () => {
    it('accepts valid year-month periods and rejects invalid months', () => {
      assert.equal(validatePayslipPeriod('2026-01'), '2026-01');
      assert.throws(() => validatePayslipPeriod('2026-13'), /AAAA-MM/);
      assert.throws(() => validatePayslipPeriod('10/2026'), /AAAA-MM/);
    });
  });

  describe('validatePayslipRubriques', () => {
    it('accepts validated non-negative configured inputs', () => {
      assert.deepEqual(validatePayslipRubriques([
        { code: 'BONUS', category: 'PRIME', amount: 100, label: 'Ignored client label' },
      ]), [{ code: 'BONUS', category: 'PRIME', amount: 100 }]);
    });

    it('rejects duplicate, invalid and negative rubriques', () => {
      assert.throws(() => validatePayslipRubriques([
        { code: 'BONUS', category: 'PRIME', amount: 1 },
        { code: 'BONUS', category: 'PRIME', amount: 1 },
      ]), /plusieurs fois/);
      assert.throws(() => validatePayslipRubriques([
        { code: 'BONUS', category: 'UNKNOWN', amount: 1 },
      ]), /catégorie/);
      assert.throws(() => validatePayslipRubriques([
        { code: 'BONUS', category: 'PRIME', amount: -1 },
      ]), /positif ou nul/);
    });

    it('rejects amounts outside the safe payroll calculation range', () => {
      assert.throws(() => validatePayslipRubriques([
        { code: 'BONUS', category: 'PRIME', amount: Number.MAX_VALUE },
      ]), /positif ou nul/);
      assert.throws(() => validatePayslipRubriques([
        { code: 'BONUS_A', category: 'PRIME', amount: 400_000_000_000 },
        { code: 'BONUS_B', category: 'PRIME', amount: 400_000_000_000 },
      ]), /total des rubriques dépasse/);
    });
  });

  it('rejects invalid required, salary, family and date values', () => {
    assert.throws(() => validateEmployeeInput({ firstName: 'A', lastName: 'B' }, 'entity-1'), /obligatoires/);
    assert.throws(() => validateEmployeeInput({
      firstName: 'A', lastName: 'B', email: 'a@b.test', baseSalary: -1,
    }, 'entity-1'), /salaire de base/);
    assert.throws(() => validateEmployeeInput({
      firstName: 'A', lastName: 'B', email: 'a@b.test', baseSalary: Number.MAX_VALUE,
    }, 'entity-1'), /salaire de base/);
    assert.throws(() => validateEmployeeInput({
      firstName: 'A', lastName: 'B', email: 'a@b.test', childrenCount: 1.5,
    }, 'entity-1'), /entier positif/);
    assert.throws(() => validateEmployeeInput({
      firstName: 'A', lastName: 'B', email: 'a@b.test', hiredAt: '2026-02-30',
    }, 'entity-1'), /date d’embauche est invalide/);
  });

  it('validates an explicit termination date, note, and reactivation request', () => {
    assert.deepEqual(validateEmployeeTerminationInput({
      terminatedAt: '2026-10-31',
      note: 'Fin du contrat',
    }), {
      terminatedAt: new Date('2026-10-31T00:00:00.000Z'),
      note: 'Fin du contrat',
    });
    assert.deepEqual(validateEmployeeTerminationInput({
      terminatedAt: null,
      note: 'Réactivation validée',
    }), {
      terminatedAt: null,
      note: 'Réactivation validée',
    });
    assert.throws(() => validateEmployeeTerminationInput({
      terminatedAt: '2026-02-30',
      note: 'Fin du contrat',
    }), /date de sortie est invalide/);
    assert.throws(() => validateEmployeeTerminationInput({
      terminatedAt: null,
      note: ' ',
    }), /motif non vide/);
    assert.throws(() => validateEmployeeTerminationInput({
      terminatedAt: null,
      note: 'Réactivation',
      employeeId: 'other-employee',
    }), /Champs de fin d’emploi inconnus/);
  });
});
