import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HrRequestError } from './errors';
import {
  assertPayrollConfigurationAvailable,
  canUsePayrollCalculator,
  getPayrollAvailabilityMessage,
  getPayrollAvailability,
  hasUsablePayrollConfig,
  hasUsablePayrollTaxBrackets,
} from './payroll-availability';

const validBrackets = [
  { order: 1, minAmount: 0, maxAmount: 10000, rate: 0 },
  { order: 2, minAmount: 10000, maxAmount: null, rate: 10 },
];

const existingTunisianBrackets = [
  { order: 1, minAmount: 0, maxAmount: 5000, rate: 0 },
  { order: 2, minAmount: 5000.001, maxAmount: 10000, rate: 15 },
  { order: 3, minAmount: 10000.001, maxAmount: 20000, rate: 25 },
  { order: 4, minAmount: 20000.001, maxAmount: 30000, rate: 30 },
  { order: 5, minAmount: 30000.001, maxAmount: 40000, rate: 33 },
  { order: 6, minAmount: 40000.001, maxAmount: 50000, rate: 36 },
  { order: 7, minAmount: 50000.001, maxAmount: 70000, rate: 38 },
  { order: 8, minAmount: 70000.001, maxAmount: null, rate: 40 },
];

const validPayrollConfig = {
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
};

describe('payroll calculation availability', () => {
  it('reports the authenticated country and whether its calculator is configured', () => {
    assert.deepEqual(getPayrollAvailability('tn', true, validBrackets), {
      countryCode: 'TN',
      supported: true,
      configured: true,
      configurationSource: 'CURRENT_COUNTRY_PROFILE',
      versionedSnapshotsApplied: false,
      approvalIsLegalValidation: false,
    });
    assert.deepEqual(getPayrollAvailability('FR', true, validBrackets), {
      countryCode: 'FR',
      supported: false,
      configured: false,
      configurationSource: 'CURRENT_COUNTRY_PROFILE',
      versionedSnapshotsApplied: false,
      approvalIsLegalValidation: false,
    });
    assert.deepEqual(getPayrollAvailability('TN', true, []), {
      countryCode: 'TN',
      supported: true,
      configured: false,
      configurationSource: 'CURRENT_COUNTRY_PROFILE',
      versionedSnapshotsApplied: false,
      approvalIsLegalValidation: false,
    });
  });

  it('enables UI simulation only for a supported and configured country', () => {
    assert.equal(canUsePayrollCalculator(null), false);
    const configuredTN = getPayrollAvailability('TN', true, validBrackets);
    const configuredOther = getPayrollAvailability('FR', true, validBrackets);
    assert.equal(canUsePayrollCalculator(configuredOther), false);
    assert.equal(canUsePayrollCalculator({ ...configuredTN, configured: false }), false);
    assert.equal(canUsePayrollCalculator(configuredTN), true);
    assert.equal(configuredTN.versionedSnapshotsApplied, false);
    assert.equal(configuredTN.approvalIsLegalValidation, false);
  });

  it('explains that editable foreign payroll parameters do not enable the Tunisian formula', () => {
    const configuredOther = getPayrollAvailability('FR', true, validBrackets);
    const incompleteTN = getPayrollAvailability('TN', false, []);
    assert.match(getPayrollAvailabilityMessage(configuredOther) ?? '', /règles tunisiennes codées/);
    assert.match(getPayrollAvailabilityMessage(configuredOther) ?? '', /spécialiste/);
    assert.match(getPayrollAvailabilityMessage(incompleteTN) ?? '', /barème IRPP incomplet\/incohérent/);
    assert.equal(getPayrollAvailabilityMessage(getPayrollAvailability('TN', true, validBrackets)), null);
  });

  it('only enables the Tunisian calculator when country configuration and brackets exist', () => {
    assert.doesNotThrow(() => assertPayrollConfigurationAvailable('TN', true, validBrackets));
    assert.throws(
      () => assertPayrollConfigurationAvailable('FR', true, validBrackets),
      (error: unknown) => error instanceof HrRequestError && error.statusCode === 422,
    );
    assert.throws(
      () => assertPayrollConfigurationAvailable('TN', false, validBrackets),
      (error: unknown) => error instanceof HrRequestError && error.statusCode === 422,
    );
    assert.throws(
      () => assertPayrollConfigurationAvailable('TN', true, []),
      (error: unknown) => error instanceof HrRequestError && error.statusCode === 422,
    );
    assert.throws(
      () => assertPayrollConfigurationAvailable('TN', true, validBrackets, {
        ...validPayrollConfig,
        employeeCnssRate: 101,
      }),
      (error: unknown) => error instanceof HrRequestError && error.statusCode === 422,
    );
  });

  it('refuses negative deductions, non-finite parameters and rates above 100%', () => {
    assert.equal(hasUsablePayrollConfig(validPayrollConfig), true);
    assert.equal(hasUsablePayrollConfig({ ...validPayrollConfig, childDeduction: -0.001 }), false);
    assert.equal(hasUsablePayrollConfig({ ...validPayrollConfig, cssRate: Number.NaN }), false);
    assert.equal(hasUsablePayrollConfig({ ...validPayrollConfig, foprolosRate: 100.001 }), false);
    assert.equal(getPayrollAvailability('TN', true, validBrackets, {
      ...validPayrollConfig,
      profExpensesMaxCap: -1,
    }).configured, false);
  });

  it('rejects gaps, invalid rates, missing first tranche and bounded final tranches', () => {
    assert.equal(hasUsablePayrollTaxBrackets(validBrackets), true);
    assert.equal(hasUsablePayrollTaxBrackets([
      validBrackets[0],
      { ...validBrackets[1], minAmount: 10001 },
    ]), false);
    assert.equal(hasUsablePayrollTaxBrackets([
      existingTunisianBrackets[0],
      { ...existingTunisianBrackets[1], minAmount: 5000.0014 },
      ...existingTunisianBrackets.slice(2),
    ]), false);
    assert.equal(hasUsablePayrollTaxBrackets([
      validBrackets[0],
      { ...validBrackets[1], minAmount: 10000.0001, maxAmount: null },
    ]), false);
    assert.equal(hasUsablePayrollTaxBrackets([
      { ...validBrackets[0], maxAmount: 9999.9999 },
      validBrackets[1],
    ]), false);
    assert.equal(hasUsablePayrollTaxBrackets([
      validBrackets[0],
      { ...validBrackets[1], rate: 101 },
    ]), false);
    assert.equal(hasUsablePayrollTaxBrackets([
      { ...validBrackets[0], minAmount: 1 },
      validBrackets[1],
    ]), false);
    assert.equal(hasUsablePayrollTaxBrackets([
      { ...validBrackets[0], maxAmount: null },
      validBrackets[1],
    ]), false);
  });

  it('preserves and accepts the existing Tunisian eight-bracket schedule unchanged', () => {
    assert.equal(hasUsablePayrollTaxBrackets(existingTunisianBrackets), true);
    assert.deepEqual(existingTunisianBrackets.map(({ minAmount, maxAmount, rate }) => ({
      minAmount, maxAmount, rate,
    })), [
      { minAmount: 0, maxAmount: 5000, rate: 0 },
      { minAmount: 5000.001, maxAmount: 10000, rate: 15 },
      { minAmount: 10000.001, maxAmount: 20000, rate: 25 },
      { minAmount: 20000.001, maxAmount: 30000, rate: 30 },
      { minAmount: 30000.001, maxAmount: 40000, rate: 33 },
      { minAmount: 40000.001, maxAmount: 50000, rate: 36 },
      { minAmount: 50000.001, maxAmount: 70000, rate: 38 },
      { minAmount: 70000.001, maxAmount: null, rate: 40 },
    ]);
  });
});
