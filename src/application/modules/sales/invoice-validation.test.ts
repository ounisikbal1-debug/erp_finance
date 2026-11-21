import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SalesRequestError } from './errors';
import {
  assertConfiguredTaxRates,
  assertSalesPostingConfiguration,
  calculateInvoice,
  calculateQuote,
  getSalesPostingConfigurationIssues,
} from './invoice-validation';

describe('calculateInvoice', () => {
  const mappedAccounts = {
    receivableAccountCode: '411',
    revenueAccountCode: '707',
    vatAccountCode: '4367',
    stampDutyAccountCode: '432',
  };
  const configuredChart = [
    { code: '411', type: 'Asset' },
    { code: '707', type: 'Revenue' },
    { code: '4367', type: 'Liability' },
    { code: '432', type: 'Liability' },
  ];

  it('allows posting for any country with configured tax rates and required sales accounts', () => {
    const configuredRates = [19, 7, 0];
    assert.doesNotThrow(() => assertSalesPostingConfiguration('TN', 1, configuredRates, configuredChart, mappedAccounts));
    assert.doesNotThrow(() => assertSalesPostingConfiguration('FR', 1, configuredRates, configuredChart, mappedAccounts));
  });

  it('reports the precise missing fiscal and accounting settings for incomplete profiles', () => {
    assert.deepEqual(
      getSalesPostingConfigurationIssues('FR', 1, [], [{ code: '411', type: 'Asset' }], {
        ...mappedAccounts,
        revenueAccountCode: null,
        vatAccountCode: null,
        stampDutyAccountCode: null,
      }),
      [
        'taux fiscaux finis compris entre 0 et 100',
        'comptes de vente configurés avec leur type (compte de ventes (Revenue), compte TVA collectée (Liability), compte droit de timbre (Liability))',
      ],
    );
    assert.throws(
      () => assertSalesPostingConfiguration('FR', 1, [], [{ code: '411', type: 'Asset' }], {
        ...mappedAccounts,
        revenueAccountCode: null,
        vatAccountCode: null,
        stampDutyAccountCode: null,
      }),
      (error: unknown) => error instanceof SalesRequestError
        && error.statusCode === 422
        && /taux fiscaux finis compris entre 0 et 100/.test(error.message)
        && /compte de ventes \(Revenue\), compte TVA collectée \(Liability\), compte droit de timbre \(Liability\)/.test(error.message),
    );
  });

  it('rejects account codes whose configured accounting type does not match the posting role', () => {
    assert.throws(
      () => assertSalesPostingConfiguration('FR', 0, [20], [
        { code: 'CUSTOMER', type: 'Liability' },
        { code: '707', type: 'Revenue' },
        { code: '4367', type: 'Liability' },
      ], { ...mappedAccounts, receivableAccountCode: 'CUSTOMER' }),
      (error: unknown) => error instanceof SalesRequestError
        && error.statusCode === 422
        && /compte client CUSTOMER \(Asset\)/.test(error.message),
    );
  });

  it('calculates and rounds invoice totals to millimes', () => {
    const invoice = calculateInvoice([
      { description: 'Article', quantity: 2, unitPrice: 10.001, taxRate: 19 },
    ], 1);
    assert.deepEqual(invoice, {
      items: [{ description: 'Article', quantity: 2, unitPrice: 10.001, taxRate: 19, totalAmount: 23.802 }],
      subTotal: 20.002,
      taxAmount: 3.8,
      stampDuty: 1,
      totalAmount: 24.802,
    });

    it('calculates fractional invoice quantities at millime precision', () => {
      const invoice = calculateInvoice([
        { description: 'Huile', quantity: 1.275, unitPrice: 10, taxRate: 0 },
      ], 0);
      assert.equal(invoice.subTotal, 12.75);
      assert.equal(invoice.items[0].quantity, 1.275);
    });
  });

  it('rejects empty invoices and invalid quantities, prices, and tax rates', () => {
    assert.throws(() => calculateInvoice([], 1), /au moins une ligne/);
    assert.throws(() => calculateInvoice([{ description: 'A', quantity: 0, unitPrice: 1, taxRate: 19 }], 1), /quantité/);
    assert.throws(() => calculateInvoice([{ description: 'A', quantity: 1, unitPrice: -1, taxRate: 19 }], 1), /prix unitaire/);
    assert.throws(() => calculateInvoice([{ description: 'A', quantity: 1, unitPrice: 1, taxRate: 101 }], 1), /taux de TVA/);
  });

  it('rejects negative stamp duty and non-finite amounts', () => {
    assert.throws(() => calculateInvoice([{ description: 'A', quantity: 1, unitPrice: 1, taxRate: 0 }], -1), /droit de timbre/);
    assert.throws(() => calculateInvoice([{ description: 'A', quantity: 1, unitPrice: Number.POSITIVE_INFINITY, taxRate: 0 }], 1), /prix unitaire/);
  });

  it('rejects amounts that cannot be represented safely at millime precision', () => {
    assert.throws(
      () => calculateInvoice([{ description: 'A', quantity: 1, unitPrice: 9_007_199_254_741, taxRate: 0 }], 0),
      (error: unknown) => error instanceof SalesRequestError
        && error.statusCode === 400
        && /précision maximale au millime/.test(error.message),
    );
  });

  it('rounds configured stamp duty to millimes before returning and totaling it', () => {
    const invoice = calculateInvoice([
      { description: 'Service', quantity: 1, unitPrice: 100, taxRate: 0 },
    ], 0.0006);

    assert.equal(invoice.stampDuty, 0.001);
    assert.equal(invoice.totalAmount, 100.001);
  });

  it('allows only VAT rates configured for the entity country', () => {
    assert.doesNotThrow(() => assertConfiguredTaxRates(
      [{ taxRate: 19 }, { taxRate: 7 }, { taxRate: 0 }],
      [19, 13, 7, 0],
    ));
    assert.throws(() => assertConfiguredTaxRates([{ taxRate: 18 }], [19, 13, 7, 0]), /configuration du pays/);
    assert.throws(() => assertConfiguredTaxRates([{ taxRate: 0 }], []), /configuration du pays/);
  });

  it('calculates quotes without stamp duty and permits a zero-valued draft', () => {
    assert.deepEqual(calculateQuote([
      { description: 'Conseil', quantity: 1, unitPrice: 100, taxRate: 19 },
    ]), {
      items: [{ description: 'Conseil', quantity: 1, unitPrice: 100, taxRate: 19, totalAmount: 119 }],
      subTotal: 100,
      taxAmount: 19,
      stampDuty: 0,
      totalAmount: 119,
    });
    assert.equal(calculateQuote([
      { description: 'Offert', quantity: 1, unitPrice: 0, taxRate: 0 },
    ]).totalAmount, 0);
    assert.throws(() => calculateInvoice([
      { description: 'Offert', quantity: 1, unitPrice: 0, taxRate: 0 },
    ], 0), /strictement positif/);
  });
});
