import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import HrService from './service';

function replaceMethod(target: object, key: string, value: (...args: any[]) => any) {
  const original = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, value });
  return () => {
    if (original) Object.defineProperty(target, key, original);
    else Reflect.deleteProperty(target, key);
  };
}

function withMethods<T>(replacements: Array<[object, string, (...args: any[]) => any]>, run: () => Promise<T>) {
  const restores = replacements.map(([target, key, value]) => replaceMethod(target, key, value));
  return run().finally(() => restores.reverse().forEach((restore) => restore()));
}

describe('persisted payroll calculations', () => {
  it('stores the calculated IRPP, CSS, net salary and complementary-retirement snapshot', async () => {
    let createArgs: { data: Record<string, unknown> } | undefined;
    await withMethods([
      [prisma.countryProfile, 'findUnique', async () => ({
        id: 'country-tn',
        code: 'TN',
        name: 'Tunisie',
        currencyCode: 'TND',
        currencySymbol: 'DT',
        payrollConfig: {
          employeeCnssRate: 0,
          employerCnssRate: 0,
          employerWorkAccidentRate: 0,
          foprolosRate: 0,
          cssRate: 0.5,
          profExpensesRate: 0,
          profExpensesMaxCap: 0,
          headOfFamilyDeduction: 0,
          childDeduction: 0,
          parentDeduction: 0,
        },
        taxBrackets: [{ order: 1, minAmount: 0, maxAmount: null, rate: 10 }],
      })],
      [prisma.employee, 'findFirst', async () => ({
        id: 'employee-1',
        hiredAt: new Date('2025-01-01T00:00:00.000Z'),
        terminatedAt: null,
        baseSalary: 30000,
        maritalStatus: 'SINGLE',
        isHeadOfFamily: false,
        childrenCount: 0,
        dependentParents: 0,
        entity: { country: { id: 'country-tn', code: 'TN' } },
      })],
      [prisma.payslip, 'findFirst', async () => null],
      [prisma.payslip, 'create', async (args) => {
        createArgs = args;
        return { id: 'payslip-1', ...args.data, employee: { id: 'employee-1' } };
      }],
    ], async () => {
      const saved = await HrService.generatePayslip('employee-1', 'entity-1', '2026-10', []);
      assert.ok(createArgs);
      assert.equal(createArgs.data.taxableGross, 30015.589);
      assert.equal(createArgs.data.irpp, 2918.226);
      assert.equal(createArgs.data.css, 146.355);
      assert.equal(createArgs.data.netSalary, 25835.611);
      assert.equal(createArgs.data.currencyCode, 'TND');
      const calculationSnapshot = JSON.parse(String(createArgs.data.calculationSnapshot)) as {
        version: string;
        period: string;
        countryCode: string;
        configuration: { employeeCnssRate: number };
        taxBrackets: Array<{ rate: number }>;
        results: { irpp: number; netSalary: number };
      };
      assert.equal(calculationSnapshot.version, 'SAFE_PAYROLL_CALCULATION_V1');
      assert.equal(calculationSnapshot.period, '2026-10');
      assert.equal(calculationSnapshot.countryCode, 'TN');
      assert.equal(calculationSnapshot.configuration.employeeCnssRate, 0);
      assert.equal(calculationSnapshot.taxBrackets[0].rate, 10);
      assert.equal(calculationSnapshot.results.irpp, createArgs.data.irpp);
      assert.equal(calculationSnapshot.results.netSalary, createArgs.data.netSalary);
      assert.deepEqual({
        fiscalBenefitType: createArgs.data.fiscalBenefitType,
        complementaryRetirementRate: createArgs.data.complementaryRetirementRate,
        retirementContribution: createArgs.data.retirementContribution,
        annualRetirementContributionDeduction: createArgs.data.annualRetirementContributionDeduction,
        irppBeforeRetirementGain: createArgs.data.irppBeforeRetirementGain,
        cssBeforeRetirementGain: createArgs.data.cssBeforeRetirementGain,
        gainIrpp: createArgs.data.gainIrpp,
        gainCss: createArgs.data.gainCss,
      }, {
        fiscalBenefitType: 'COMPLEMENTARY_RETIREMENT',
        complementaryRetirementRate: 4,
        retirementContribution: 1204.175,
        annualRetirementContributionDeduction: 10000,
        irppBeforeRetirementGain: 3001.559,
        cssBeforeRetirementGain: 150.522,
        gainIrpp: 83.333,
        gainCss: 4.167,
      });
      assert.equal(saved.retirementContribution, createArgs.data.retirementContribution);
      assert.equal(saved.irpp, createArgs.data.irpp);
      assert.equal(saved.css, createArgs.data.css);
    });
  });

  it('builds a period register scoped to the entity from stored payslips only', async () => {
    let employeeQuery: Record<string, unknown> | undefined;
    let payslipQuery: Record<string, unknown> | undefined;
    await withMethods([
      [prisma.employee, 'findMany', async (args) => {
        employeeQuery = args;
        return [{
          id: 'employee-1',
          empId: 'EMP-001',
          firstName: 'Amina',
          lastName: 'Test',
          cnssNumber: 'CNSS-001',
          hiredAt: new Date('2026-01-01T00:00:00.000Z'),
          terminatedAt: null,
        }];
      }],
      [prisma.payslip, 'findMany', async (args) => {
        payslipQuery = args;
        return [{
          id: 'payslip-1',
          employeeId: 'employee-1',
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
          employee: {
            id: 'employee-1',
            empId: 'EMP-001',
            firstName: 'Amina',
            lastName: 'Test',
            cnssNumber: 'CNSS-001',
          },
        }];
      }],
    ], async () => {
      const register = await HrService.getPayrollRegister('entity-1', '2026-10');
      assert.deepEqual(employeeQuery?.where, { entityId: 'entity-1' });
      assert.deepEqual(employeeQuery?.select, {
        id: true,
        empId: true,
        firstName: true,
        lastName: true,
        cnssNumber: true,
        hiredAt: true,
        terminatedAt: true,
      });
      assert.deepEqual(payslipQuery?.where, { period: '2026-10', employee: { entityId: 'entity-1' } });
      assert.equal(register.totals.employeeCnss, 145.2);
      assert.equal(register.totals.irpp, 100);
      assert.equal(register.filingSupported, false);
      assert.equal(register.rows[0].calculationSnapshotAvailable, true);
    });
  });

  it('records termination-date changes with an actor and immutable event history', async () => {
    const original = {
      id: 'employee-1',
      hiredAt: new Date('2025-01-01T00:00:00.000Z'),
      terminatedAt: null,
    };
    let updateArgs: unknown;
    let eventArgs: unknown;
    const transaction = {
      employee: {
        findFirst: async (args: unknown) => {
          assert.deepEqual(args, { where: { id: 'employee-1', entityId: 'entity-1' }, select: { id: true, hiredAt: true, terminatedAt: true } });
          return original;
        },
        updateMany: async (args: unknown) => {
          updateArgs = args;
          return { count: 1 };
        },
      },
      employeeEmploymentEvent: {
        create: async (args: unknown) => {
          eventArgs = args;
          return { id: 'employment-event-1' };
        },
      },
    };

    await withMethods([
      [prisma, '$transaction', async (callback) => callback(transaction)],
    ], async () => {
      const updated = await HrService.updateEmployeeTermination(
        'employee-1',
        'entity-1',
        { terminatedAt: '2026-10-31', note: 'Fin du contrat' },
        { id: 'user-1', username: 'hr.manager' },
      );
      assert.deepEqual(updated, {
        id: 'employee-1',
        terminatedAt: new Date('2026-10-31T00:00:00.000Z'),
        eventRecorded: true,
      });
    });

    assert.deepEqual(updateArgs, {
      where: { id: 'employee-1', entityId: 'entity-1', terminatedAt: null },
      data: { terminatedAt: new Date('2026-10-31T00:00:00.000Z') },
    });
    assert.deepEqual(eventArgs, {
      data: {
        employeeId: 'employee-1',
        action: 'EMPLOYMENT_END_DATE_SET',
        previousTerminatedAt: null,
        newTerminatedAt: new Date('2026-10-31T00:00:00.000Z'),
        actorUserId: 'user-1',
        actorUsername: 'hr.manager',
        note: 'Fin du contrat',
      },
    });
  });

  it('refuses to create a payslip for a period after the employee left', async () => {
    await withMethods([
      [prisma.employee, 'findFirst', async () => ({
        id: 'employee-1',
        hiredAt: new Date('2025-01-01T00:00:00.000Z'),
        terminatedAt: new Date('2026-09-30T00:00:00.000Z'),
      })],
    ], async () => {
      await assert.rejects(
        () => HrService.generatePayslip('employee-1', 'entity-1', '2026-10', []),
        /hors période d’emploi/,
      );
    });
  });

  it('rejects invalid payroll register periods before querying payroll data', async () => {
    await assert.rejects(
      () => HrService.getPayrollRegister('entity-1', '2026-13'),
      /AAAA-MM/,
    );
  });
});
