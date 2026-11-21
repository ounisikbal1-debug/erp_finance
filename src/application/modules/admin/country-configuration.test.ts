import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CountryConfigurationValidationError,
  validateCountryProfileUpdate,
  validateCountryCreation,
  validatePayrollConfig,
  validateCompletePayrollConfig,
  validatePayrollTaxBrackets,
  validateTaxRates,
} from './country-configuration';

describe('country regulatory configuration validation', () => {
  it('keeps editable country settings country-neutral and rejects unsafe values', () => {
    assert.deepEqual(validateCountryProfileUpdate({
      currencyCode: 'eur',
      stampDuty: 0,
      corporateTax: 0,
      salesReceivableAccountCode: '  A411 ',
      salesRevenueAccountCode: 'R707',
      salesVatAccountCode: 'VAT.OUT',
      salesStampDutyAccountCode: null,
      stockAssetAccountCode: '  S31 ',
      stockAdjustmentAccountCode: 'S68',
      productionWipAccountCode: null,
      productionLaborAccountCode: '  LAB.1 ',
      productionOverheadAccountCode: 'OH/1',
      purchaseExpenseAccountCode: '  P601 ',
      purchaseVatAccountCode: 'P436',
      realizedFxGainAccountCode: '  FX.GAIN ',
      realizedFxLossAccountCode: 'FX.LOSS',
      unrealizedFxGainAccountCode: '  FX.UGAIN ',
      unrealizedFxLossAccountCode: 'FX.ULOSS',
    }), {
      currencyCode: 'EUR',
      stampDuty: 0,
      corporateTax: 0,
      salesReceivableAccountCode: 'A411',
      salesRevenueAccountCode: 'R707',
      salesVatAccountCode: 'VAT.OUT',
      salesStampDutyAccountCode: null,
      stockAssetAccountCode: 'S31',
      stockAdjustmentAccountCode: 'S68',
      productionWipAccountCode: null,
      productionLaborAccountCode: 'LAB.1',
      productionOverheadAccountCode: 'OH/1',
      purchaseExpenseAccountCode: 'P601',
      purchaseVatAccountCode: 'P436',
      realizedFxGainAccountCode: 'FX.GAIN',
      realizedFxLossAccountCode: 'FX.LOSS',
      unrealizedFxGainAccountCode: 'FX.UGAIN',
      unrealizedFxLossAccountCode: 'FX.ULOSS',
    });
    assert.throws(
      () => validateCountryProfileUpdate({ corporateTax: 101 }),
      CountryConfigurationValidationError,
    );
    assert.throws(() => validateCountryProfileUpdate({ salesVatAccountCode: ' ' }));
    assert.throws(() => validateCountryProfileUpdate({ stockAssetAccountCode: ' ' }));
    assert.throws(() => validateCountryProfileUpdate({ productionLaborAccountCode: ' ' }));
    assert.throws(() => validateCountryProfileUpdate({ realizedFxGainAccountCode: ' ' }));
    assert.throws(() => validateCountryProfileUpdate({ countryId: 'foreign-country' }));
  });

  it('requires explicit country tax values and never supplies defaults for legal parameters', () => {
    assert.deepEqual(validateCountryCreation({
      code: 'fr',
      name: 'France',
      currencyCode: 'eur',
      currencySymbol: '€',
      stampDuty: 0,
      corporateTax: 25,
    }), {
      code: 'FR',
      name: 'France',
      currencyCode: 'EUR',
      currencySymbol: '€',
      stampDuty: 0,
      corporateTax: 25,
    });
    assert.deepEqual(validateCountryCreation({
      code: 'FR',
      name: 'France',
      currencyCode: 'EUR',
      currencySymbol: '€',
    }), {
      code: 'FR',
      name: 'France',
      currencyCode: 'EUR',
      currencySymbol: '€',
      stampDuty: null,
      corporateTax: null,
    });
    assert.deepEqual(validateCountryProfileUpdate({ stampDuty: null, corporateTax: null }), {
      stampDuty: null,
      corporateTax: null,
    });
  });

  it('validates payroll rates without supplying or hardcoding legal rates', () => {
    assert.deepEqual(validatePayrollConfig({
      employeeCnssRate: 9.5,
      headOfFamilyDeduction: 300,
    }), {
      employeeCnssRate: 9.5,
      headOfFamilyDeduction: 300,
    });
    assert.throws(() => validatePayrollConfig({ employeeCnssRate: Number.NaN }));
    assert.throws(() => validatePayrollConfig({ employeeCnssRate: 101 }));
    assert.throws(() => validatePayrollConfig({ countryId: 'other-country' }));
  });

  it('requires explicit values for every payroll field when initializing a country', () => {
    const complete = {
      employeeCnssRate: 1,
      employerCnssRate: 2,
      employerWorkAccidentRate: 3,
      foprolosRate: 4,
      cssRate: 5,
      profExpensesRate: 6,
      profExpensesMaxCap: 7,
      headOfFamilyDeduction: 8,
      childDeduction: 9,
      parentDeduction: 10,
    };
    assert.deepEqual(validateCompletePayrollConfig(complete), complete);
    assert.throws(() => validateCompletePayrollConfig({ employeeCnssRate: 1 }), /tous les paramètres/);
    assert.throws(() => validateCountryCreation({
      code: 'XY',
      name: 'Example',
      currencyCode: 'XXX',
      currencySymbol: 'X',
      stampDuty: 0,
      corporateTax: 0,
      payrollConfig: { employeeCnssRate: 1 },
    }), /tous les paramètres/);
  });

  it('accepts structurally valid editable brackets and rejects gaps in ordering or overlaps', () => {
    assert.deepEqual(validatePayrollTaxBrackets([
      { order: 2, minAmount: 100, maxAmount: null, rate: 10 },
      { order: 1, minAmount: 0, maxAmount: 100, rate: 0 },
    ]), [
      { order: 1, minAmount: 0, maxAmount: 100, rate: 0 },
      { order: 2, minAmount: 100, maxAmount: null, rate: 10 },
    ]);
    assert.throws(() => validatePayrollTaxBrackets([
      { order: 1, minAmount: 0, maxAmount: 100, rate: 0 },
      { order: 3, minAmount: 100, maxAmount: null, rate: 10 },
    ]));
    assert.throws(() => validatePayrollTaxBrackets([
      { order: 1, minAmount: 0, maxAmount: 100, rate: 0 },
      { order: 2, minAmount: 90, maxAmount: null, rate: 10 },
    ]));
    assert.throws(() => validatePayrollTaxBrackets([
      { order: 1, minAmount: 0, maxAmount: 100, rate: 0 },
      { order: 2, minAmount: 101, maxAmount: null, rate: 10 },
    ]));
  });

  it('preserves the existing Tunisian millime boundaries while rejecting larger or fractional gaps', () => {
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
    assert.deepEqual(validatePayrollTaxBrackets(tunisianBrackets), tunisianBrackets);
    assert.throws(() => validatePayrollTaxBrackets([
      { order: 1, minAmount: 0, maxAmount: 100, rate: 0 },
      { order: 2, minAmount: 100.002, maxAmount: null, rate: 10 },
    ]), /au millime/);
    assert.throws(() => validatePayrollTaxBrackets([
      { order: 1, minAmount: 0, maxAmount: 100, rate: 0 },
      { order: 2, minAmount: 100.0011, maxAmount: null, rate: 10 },
    ]), /au millime/);
    assert.throws(() => validatePayrollTaxBrackets([
      { order: 1, minAmount: 0, maxAmount: 100.0001, rate: 0 },
      { order: 2, minAmount: 100.001, maxAmount: null, rate: 10 },
    ]), /au millime/);
  });

  it('keeps tax rates editable while requiring unique codes and at most one default', () => {
    assert.deepEqual(validateTaxRates([
      { code: 'vat_10', name: 'TVA proposition', rate: 10, isDefault: true },
      { code: 'exempt', name: 'Exonéré', rate: 0 },
    ]), [
      { code: 'VAT_10', name: 'TVA proposition', rate: 10, isDefault: true, purchaseVatRecoverable: false },
      { code: 'EXEMPT', name: 'Exonéré', rate: 0, isDefault: false, purchaseVatRecoverable: false },
    ]);
    assert.deepEqual(validateTaxRates([
      { code: 'vat', name: 'TVA', rate: 20, purchaseVatRecoverable: true },
    ]), [
      { code: 'VAT', name: 'TVA', rate: 20, isDefault: false, purchaseVatRecoverable: true },
    ]);
    assert.throws(() => validateTaxRates([
      { code: 'vat', name: 'TVA', rate: 20, purchaseVatRecoverable: 'yes' },
    ]));
    assert.throws(() => validateTaxRates([
      { code: 'vat', name: 'TVA', rate: 10 },
      { code: 'VAT', name: 'TVA bis', rate: 20 },
    ]));
    assert.throws(() => validateTaxRates([
      { code: 'vat', name: 'TVA', rate: 10, isDefault: true },
      { code: 'exempt', name: 'Exonéré', rate: 0, isDefault: true },
    ]));
  });
});
