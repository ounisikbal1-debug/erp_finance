import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertOfficialCustomsSource,
  calculateCustomsImport,
  CustomsTariffError,
  validateCustomsTariffInput,
} from './tariff';

function tariffInput(overrides: Record<string, unknown> = {}) {
  return {
    tariffCode: '8471300000',
    description: 'Tarif synthétique de test',
    customsDutyRate: 10,
    consumptionDutyRate: 5,
    fodecRate: 1,
    importVatRate: 19,
    customsServiceFeeRate: 3,
    customsDutyBaseComponents: ['CIF'],
    consumptionDutyBaseComponents: ['CIF', 'CUSTOMS_DUTY'],
    fodecBaseComponents: ['CIF', 'CUSTOMS_DUTY'],
    importVatBaseComponents: ['CIF', 'CUSTOMS_DUTY', 'CONSUMPTION_DUTY', 'FODEC'],
    customsServiceFeeBaseComponents: ['CUSTOMS_DUTY', 'CONSUMPTION_DUTY', 'FODEC', 'IMPORT_VAT'],
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    ...overrides,
  };
}

describe('customs tariff configuration', () => {
  it('requires a 10-digit NGP code, explicit rates, bases, and a valid effective period', () => {
    assert.equal(validateCustomsTariffInput(tariffInput()).tariffCode, '8471300000');
    assert.throws(
      () => validateCustomsTariffInput(tariffInput({ tariffCode: '84713' })),
      /exactement 10 chiffres/,
    );
    assert.throws(
      () => validateCustomsTariffInput(tariffInput({ customsDutyRate: -1 })),
      /taux fini/,
    );
    assert.throws(
      () => validateCustomsTariffInput(tariffInput({ effectiveFrom: '2026-02-30' })),
      /date valide/,
    );
    assert.throws(
      () => validateCustomsTariffInput(tariffInput({ effectiveTo: '2025-12-31' })),
      /ne peut pas précéder/,
    );
  });

  it('rejects tax bases that reference a later tax or repeat a component', () => {
    assert.throws(
      () => validateCustomsTariffInput(tariffInput({
        fodecBaseComponents: ['CIF', 'IMPORT_VAT'],
      })),
      /postérieure/,
    );
    assert.throws(
      () => validateCustomsTariffInput(tariffInput({
        consumptionDutyBaseComponents: ['CIF', 'CIF'],
      })),
      /deux fois/,
    );
  });

  it('requires origin, agreement, and an explicit rate together for preferential schedules', () => {
    assert.throws(
      () => validateCustomsTariffInput(tariffInput({
        originCountryCode: 'TN',
        preferentialCustomsDutyRate: 0,
      })),
      /ensemble le pays d’origine/,
    );
    const preference = validateCustomsTariffInput(tariffInput({
      originCountryCode: 'fr',
      preferentialAgreementCode: 'ue-tn',
      preferentialCustomsDutyRate: 0,
    }));
    assert.equal(preference.originCountryCode, 'FR');
    assert.equal(preference.preferentialAgreementCode, 'UE-TN');
  });

  it('only allows official HTTPS douane.gov.tn sources to verify tariff records', () => {
    assertOfficialCustomsSource('https://www.douane.gov.tn/tarif');
    assert.throws(
      () => assertOfficialCustomsSource('https://example.invalid/tarif'),
      CustomsTariffError,
    );
    assert.throws(
      () => assertOfficialCustomsSource('http://douane.gov.tn/tarif'),
      CustomsTariffError,
    );
  });
});

describe('customs import calculation', () => {
  it('uses the explicitly configured tax bases and rounds currency amounts to millimes', () => {
    const configuration = validateCustomsTariffInput(tariffInput());
    const result = calculateCustomsImport({
      ...configuration,
      customsDutyBaseComponents: JSON.stringify(configuration.customsDutyBaseComponents),
      consumptionDutyBaseComponents: JSON.stringify(configuration.consumptionDutyBaseComponents),
      fodecBaseComponents: JSON.stringify(configuration.fodecBaseComponents),
      importVatBaseComponents: JSON.stringify(configuration.importVatBaseComponents),
      customsServiceFeeBaseComponents: JSON.stringify(configuration.customsServiceFeeBaseComponents),
    }, { cifValue: 100 });

    assert.deepEqual(result, {
      cifValue: 100,
      customsDuty: 10,
      consumptionDuty: 5.5,
      fodec: 1.1,
      importVat: 22.154,
      customsServiceFee: 1.163,
      totalTaxes: 39.917,
      totalLandedCost: 139.917,
      preferentialCustomsDutyApplied: false,
    });
  });

  it('applies a verified matching preference only after explicit eligibility and evidence confirmation', () => {
    const configuration = validateCustomsTariffInput(tariffInput({
      originCountryCode: 'FR',
      preferentialAgreementCode: 'UE-TN',
      preferentialCustomsDutyRate: 0,
    }));
    const tariff = {
      ...configuration,
      customsDutyBaseComponents: JSON.stringify(configuration.customsDutyBaseComponents),
      consumptionDutyBaseComponents: JSON.stringify(configuration.consumptionDutyBaseComponents),
      fodecBaseComponents: JSON.stringify(configuration.fodecBaseComponents),
      importVatBaseComponents: JSON.stringify(configuration.importVatBaseComponents),
      customsServiceFeeBaseComponents: JSON.stringify(configuration.customsServiceFeeBaseComponents),
    };

    const unconfirmed = calculateCustomsImport(tariff, { cifValue: 100 });
    const confirmed = calculateCustomsImport(tariff, {
      cifValue: 100,
      originCountryCode: 'fr',
      preferentialAgreementCode: 'ue-tn',
      preferenceEligibilityConfirmed: true,
      preferenceEvidenceReference: 'JUSTIFICATIF-SYNTHETIQUE',
    });

    assert.equal(unconfirmed.customsDuty, 10);
    assert.equal(unconfirmed.preferentialCustomsDutyApplied, false);
    assert.equal(confirmed.customsDuty, 0);
    assert.equal(confirmed.preferentialCustomsDutyApplied, true);
    assert.throws(
      () => calculateCustomsImport(tariff, {
        cifValue: 100,
        preferenceEligibilityConfirmed: true,
        originCountryCode: 'FR',
        preferentialAgreementCode: 'UE-TN',
      }),
      /référence de justificatif/,
    );
    assert.throws(
      () => calculateCustomsImport(tariff, {
        cifValue: 100,
        preferenceEligibilityConfirmed: true,
        originCountryCode: 'DE',
        preferentialAgreementCode: 'UE-TN',
        preferenceEvidenceReference: 'JUSTIFICATIF-SYNTHETIQUE',
      }),
      /ne correspond pas au barème/,
    );
  });
});
