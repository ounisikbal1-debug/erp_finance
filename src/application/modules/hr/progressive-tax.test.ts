import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateProgressiveTax } from './progressive-tax';
import HrService from './service';
import prisma from '../../../data/prisma/client';

const tunisianBrackets = [
  { order: 1, minAmount: 0, maxAmount: 5000, rate: 0 },
  { order: 2, minAmount: 5000.001, maxAmount: 10000, rate: 15 },
  { order: 3, minAmount: 10000.001, maxAmount: 20000, rate: 25 },
  { order: 4, minAmount: 20000.001, maxAmount: 30000, rate: 30 },
  { order: 5, minAmount: 30000.001, maxAmount: 40000, rate: 33 },
  { order: 6, minAmount: 40000.001, maxAmount: 50000, rate: 36 },
  { order: 7, minAmount: 50000.001, maxAmount: 70000, rate: 38 },
  { order: 8, minAmount: 70000.001, maxAmount: null, rate: 40 },
];

describe('progressive payroll tax calculation', () => {
  it('excludes qualifying commute transport from IRPP only starting in January 2026', async () => {
    const originalCountryLookup = Object.getOwnPropertyDescriptor(prisma.countryProfile, 'findUnique');
    Object.defineProperty(prisma.countryProfile, 'findUnique', {
      configurable: true,
      value: async () => ({
        code: 'TN',
        name: 'Tunisie',
        currencyCode: 'TND',
        currencySymbol: 'DT',
        payrollConfig: {
          employeeCnssRate: 9.68,
          employerCnssRate: 16.57,
          employerWorkAccidentRate: 0.5,
          foprolosRate: 1,
          cssRate: 0.5,
          profExpensesRate: 10,
          profExpensesMaxCap: 2000,
          headOfFamilyDeduction: 300,
          childDeduction: 100,
          parentDeduction: 450,
        },
        taxBrackets: tunisianBrackets,
      }),
    });

    try {
      const currentResult = await HrService.calculatePayroll({
        countryCode: 'TN',
        period: '2026-01',
        baseSalary: 2500,
        presenceBonus: 0,
        transportBonus: 100,
      });
      assert.equal(currentResult.grossSalary, 2600);
      assert.equal(currentResult.employeeCnss, 251.68);
      assert.equal(currentResult.taxableGross, 2248.32);

      const historicalResult = await HrService.calculatePayroll({
        countryCode: 'TN',
        period: '2025-12',
        baseSalary: 2500,
        presenceBonus: 0,
        transportBonus: 100,
      });
      assert.equal(historicalResult.taxableGross, 2348.32);
      assert.equal(currentResult.css, historicalResult.css);
    } finally {
      if (originalCountryLookup) Object.defineProperty(prisma.countryProfile, 'findUnique', originalCountryLookup);
      else Reflect.deleteProperty(prisma.countryProfile, 'findUnique');
    }
  });

  it('does not apply a tranche before its configured threshold', () => {
    const result = calculateProgressiveTax(5000.0005, tunisianBrackets);
    assert.equal(result.details[1].taxableInBracket, 0);
  });

  it('taxes the first millime in each legacy Tunisian bracket exactly once', () => {
    const atFirstGap = calculateProgressiveTax(5000.001, tunisianBrackets);
    assert.equal(atFirstGap.details[0].taxableInBracket, 5000);
    assert.ok(Math.abs(atFirstGap.details[1].taxableInBracket - 0.001) < 1e-9);

    const atSecondGap = calculateProgressiveTax(10000.001, tunisianBrackets);
    assert.equal(atSecondGap.details[1].taxableInBracket, 5000);
    assert.ok(Math.abs(atSecondGap.details[2].taxableInBracket - 0.001) < 1e-9);
  });

  it('covers every legacy Tunisian threshold without losing or duplicating taxable millimes', () => {
    for (let index = 1; index < tunisianBrackets.length; index += 1) {
      const threshold = tunisianBrackets[index].minAmount;
      const result = calculateProgressiveTax(threshold, tunisianBrackets);
      const taxableTotal = result.details.reduce((total, detail) => total + detail.taxableInBracket, 0);

      assert.ok(Math.abs(taxableTotal - threshold) < 1e-8, `Mismatch at threshold ${threshold}`);
      assert.equal(result.details[index - 1].taxableInBracket, tunisianBrackets[index - 1].maxAmount
        - (index > 1 ? tunisianBrackets[index - 2].maxAmount ?? 0 : 0));
      assert.ok(Math.abs(result.details[index].taxableInBracket - 0.001) < 1e-9);
      assert.equal(result.details.slice(index + 1).every((detail) => detail.taxableInBracket === 0), true);
    }
  });

  it('does not add an extra millime to brackets with shared boundaries', () => {
    const result = calculateProgressiveTax(100.001, [
      { order: 1, minAmount: 0, maxAmount: 100, rate: 0 },
      { order: 2, minAmount: 100, maxAmount: null, rate: 10 },
    ]);
    assert.ok(Math.abs(result.details[1].taxableInBracket - 0.001) < 1e-9);
  });
});
