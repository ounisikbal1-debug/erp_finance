import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateCountryTaxRule,
  parseCountryTaxDate,
  validateCountryTaxRuleCreation,
  CountryTaxRuleValidationError,
  type CountryTaxRuleCalculation,
} from './country-tax-rules';

function ruleInput(overrides: Record<string, unknown> = {}) {
  return {
    jurisdiction: { kind: 'COUNTRY', code: 'FR', name: 'France' },
    code: 'CORPORATE_TAX',
    name: 'Impôt sur les sociétés',
    taxType: 'CORPORATE_INCOME_TAX',
    calculationMethod: 'FLAT',
    taxBase: 'TAXABLE_PROFIT',
    currencyCode: 'EUR',
    effectiveFrom: '2025-01-01',
    sourceName: 'Source officielle',
    sourceUrl: 'https://example.gov/tax',
    sourceRetrievedAt: '2026-01-15',
    rates: [{ sequence: 1, name: 'Taux standard', rateType: 'PERCENT', rateValue: 25, unit: 'PERCENT' }],
    ...overrides,
  };
}

function calculationRule(overrides: Partial<CountryTaxRuleCalculation> = {}): CountryTaxRuleCalculation {
  return {
    status: 'APPROVED_FOR_TESTING',
    calculationMethod: 'FLAT',
    currencyCode: 'EUR',
    roundingScale: 2,
    effectiveFrom: new Date('2025-01-01T00:00:00.000Z'),
    effectiveTo: null,
    conditionsJson: null,
    rates: [{
      sequence: 1,
      rateType: 'PERCENT',
      rateValue: 25,
      lowerBound: null,
      upperBound: null,
      lowerBoundInclusive: true,
      upperBoundInclusive: false,
      unit: 'PERCENT',
      conditionsJson: null,
    }],
    ...overrides,
  };
}

describe('country tax rules', () => {
  it('validates structured source-backed rules and normalizes codes', () => {
    const validated = validateCountryTaxRuleCreation(ruleInput());
    assert.equal(validated.jurisdiction.code, 'FR');
    assert.equal(validated.code, 'CORPORATE_TAX');
    assert.equal(validated.rates[0].rateValue, 25);
  });

  it('rejects invalid source URLs, dates, and non-contiguous progressive brackets', () => {
    assert.throws(
      () => validateCountryTaxRuleCreation(ruleInput({ sourceUrl: 'http://example.gov/tax' })),
      CountryTaxRuleValidationError,
    );
    assert.throws(() => parseCountryTaxDate('2025-02-31', 'date'), CountryTaxRuleValidationError);
    assert.throws(
      () => validateCountryTaxRuleCreation(ruleInput({
        calculationMethod: 'PROGRESSIVE',
        rates: [
          { sequence: 1, name: 'Tranche 1', rateType: 'PERCENT', rateValue: 10, lowerBound: 0, upperBound: 100, unit: 'PERCENT' },
          { sequence: 2, name: 'Tranche 2', rateType: 'PERCENT', rateValue: 20, lowerBound: 101, upperBound: null, unit: 'PERCENT' },
        ],
      })),
      /contiguës/,
    );
  });

  it('calculates only an approved flat rule in its currency and effective period', () => {
    const calculated = calculateCountryTaxRule({
      rule: calculationRule(),
      taxableBase: 1000,
      currencyCode: 'eur',
      effectiveDate: new Date('2026-01-01T00:00:00.000Z'),
    });
    assert.deepEqual(calculated, { status: 'CALCULATED', amount: 250, currencyCode: 'EUR', taxableBase: 1000 });

    const wrongCurrency = calculateCountryTaxRule({
      rule: calculationRule(),
      taxableBase: 1000,
      currencyCode: 'USD',
      effectiveDate: new Date('2026-01-01T00:00:00.000Z'),
    });
    assert.equal(wrongCurrency.status, 'BLOCKED');

    const unapproved = calculateCountryTaxRule({
      rule: calculationRule({ status: 'DRAFT' }),
      taxableBase: 1000,
      currencyCode: 'EUR',
      effectiveDate: new Date('2026-01-01T00:00:00.000Z'),
    });
    assert.equal(unapproved.status, 'BLOCKED');
  });

  it('calculates progressive brackets and blocks unsupported threshold semantics', () => {
    const progressive = calculateCountryTaxRule({
      rule: calculationRule({
        calculationMethod: 'PROGRESSIVE',
        rates: [
          { sequence: 1, rateType: 'PERCENT', rateValue: 10, lowerBound: 0, upperBound: 1000, lowerBoundInclusive: true, upperBoundInclusive: false, unit: 'PERCENT', conditionsJson: null },
          { sequence: 2, rateType: 'PERCENT', rateValue: 20, lowerBound: 1000, upperBound: null, lowerBoundInclusive: true, upperBoundInclusive: false, unit: 'PERCENT', conditionsJson: null },
        ],
      }),
      taxableBase: 1500,
      currencyCode: 'EUR',
      effectiveDate: new Date('2026-01-01T00:00:00.000Z'),
    });
    assert.deepEqual(progressive, { status: 'CALCULATED', amount: 200, currencyCode: 'EUR', taxableBase: 1500 });

    const threshold = calculateCountryTaxRule({
      rule: calculationRule({ calculationMethod: 'THRESHOLD' }),
      taxableBase: 1500,
      currencyCode: 'EUR',
      effectiveDate: new Date('2026-01-01T00:00:00.000Z'),
    });
    assert.equal(threshold.status, 'BLOCKED');
  });

  it('requires explicit eligibility confirmation for conditioned rules', () => {
    const result = calculateCountryTaxRule({
      rule: calculationRule({ conditionsJson: '{"turnoverLimit":true}' }),
      taxableBase: 1000,
      currencyCode: 'EUR',
      effectiveDate: new Date('2026-01-01T00:00:00.000Z'),
    });
    assert.equal(result.status, 'BLOCKED');
  });
});
