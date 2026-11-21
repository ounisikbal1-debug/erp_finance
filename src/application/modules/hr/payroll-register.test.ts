import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HrRequestError } from './errors';
import { buildPayrollRegister, type PayrollRegisterEmployee, type PayrollRegisterPayslip } from './payroll-register';

const employee: PayrollRegisterEmployee = {
  id: 'employee-1',
  empId: 'EMP-001',
  firstName: 'Amina',
  lastName: 'Test',
  cnssNumber: 'CNSS-001',
  hiredAt: new Date('2026-01-01T00:00:00.000Z'),
  terminatedAt: null,
};

function payslip(overrides: Partial<PayrollRegisterPayslip> = {}): PayrollRegisterPayslip {
  return {
    id: 'payslip-1',
    employeeId: employee.id,
    period: '2026-10',
    currencyCode: 'TND',
    grossSalary: 1500,
    employeeCnss: 145.2,
    employerCnss: 256.05,
    foprolos: 15,
    taxableGross: 1354.8,
    irpp: 100,
    css: 7,
    netSalary: 1247.8,
    calculationSnapshot: JSON.stringify({
      version: 'SAFE_PAYROLL_CALCULATION_V1',
      period: '2026-10',
      countryCode: 'TN',
      currencyCode: 'TND',
      configuration: { employeeCnssRate: 9.68 },
      taxBrackets: [{ order: 1 }],
      inputs: {},
      results: {
        grossSalary: 1500,
        employeeCnss: 145.2,
        taxableGross: 1354.8,
        irpp: 100,
        css: 7,
        netSalary: 1247.8,
      },
    }),
    employee,
    ...overrides,
  };
}

describe('payroll declaration preparation register', () => {
  it('sums only persisted payslips and keeps the result explicitly non-fileable', () => {
    const report = buildPayrollRegister('2026-10', [employee], [payslip()]);

    assert.equal(report.status, 'PREPARATION_ONLY');
    assert.equal(report.filingSupported, false);
    assert.equal(report.completeness, 'REVIEW_REQUIRED');
    assert.deepEqual(report.totals, {
      grossSalary: 1500,
      employeeCnss: 145.2,
      employerCnss: 256.05,
      foprolos: 15,
      taxableGross: 1354.8,
      irpp: 100,
      css: 7,
      netSalary: 1247.8,
    });
    assert.equal(report.rows[0].calculationSnapshotAvailable, true);
  });

  it('reports absent and legacy payslips without marking the month complete', () => {
    const hiredLater = { ...employee, id: 'employee-future', hiredAt: new Date('2026-11-01T00:00:00.000Z') };
    const missing = buildPayrollRegister('2026-10', [employee, hiredLater], []);
    assert.equal(missing.completeness, 'INCOMPLETE');
    assert.equal(missing.missingEmployees.length, 1);
    assert.equal(missing.expectedEmployeeCount, 1);
    assert.equal(missing.filingSupported, false);

    const legacy = buildPayrollRegister('2026-10', [employee], [payslip({ calculationSnapshot: null })]);
    assert.equal(legacy.completeness, 'INCOMPLETE');
    assert.equal(legacy.missingSnapshotCount, 1);
    assert.equal(legacy.invalidSnapshotCount, 1);
  });

  it('expects only employees whose employment overlaps the payroll month', () => {
    const employees = [
      employee,
      { ...employee, id: 'employee-future', hiredAt: new Date('2026-11-01T00:00:00.000Z') },
      { ...employee, id: 'employee-left', terminatedAt: new Date('2026-09-30T00:00:00.000Z') },
      { ...employee, id: 'employee-leaving', terminatedAt: new Date('2026-10-15T00:00:00.000Z') },
      { ...employee, id: 'employee-hired-mid-month', hiredAt: new Date('2026-10-15T00:00:00.000Z') },
    ];
    const report = buildPayrollRegister('2026-10', employees, []);
    assert.equal(report.expectedEmployeeCount, 3);
    assert.deepEqual(report.missingEmployees.map(({ id }) => id), [
      'employee-1',
      'employee-leaving',
      'employee-hired-mid-month',
    ]);
  });

  it('rejects payslips outside an employee’s employment period', () => {
    const terminatedBeforePeriod = {
      ...employee,
      terminatedAt: new Date('2026-09-30T00:00:00.000Z'),
    };
    assert.throws(
      () => buildPayrollRegister('2026-10', [terminatedBeforePeriod], [payslip()]),
      (error: unknown) => error instanceof HrRequestError && /hors période d’emploi/.test(error.message),
    );
  });

  it('marks a snapshot inconsistent when its stored totals do not match the payslip', () => {
    const invalidSnapshot = JSON.stringify({
      version: 'SAFE_PAYROLL_CALCULATION_V1',
      period: '2026-10',
      countryCode: 'TN',
      currencyCode: 'TND',
      configuration: { employeeCnssRate: 9.68 },
      taxBrackets: [{ order: 1 }],
      inputs: {},
      results: { grossSalary: 1500, employeeCnss: 145.2, taxableGross: 1354.8, irpp: 99, css: 7, netSalary: 1247.8 },
    });
    const report = buildPayrollRegister('2026-10', [employee], [payslip({ calculationSnapshot: invalidSnapshot })]);
    assert.equal(report.completeness, 'INCOMPLETE');
    assert.equal(report.invalidSnapshotCount, 1);
    assert.equal(report.rows[0].calculationSnapshotAvailable, false);
  });

  it('rejects mixed currencies and amounts that cannot be summed at millime precision', () => {
    assert.throws(
      () => buildPayrollRegister('2026-10', [employee, { ...employee, id: 'employee-2' }], [
        payslip(),
        payslip({
          id: 'payslip-2',
          employeeId: 'employee-2',
          employee: { ...employee, id: 'employee-2' },
          currencyCode: 'EUR',
        }),
      ]),
      (error: unknown) => error instanceof HrRequestError && /plusieurs devises/.test(error.message),
    );
    assert.throws(
      () => buildPayrollRegister('2026-10', [employee], [payslip({ irpp: Number.NaN })]),
      (error: unknown) => error instanceof HrRequestError && /Montant invalide/.test(error.message),
    );
  });
});
