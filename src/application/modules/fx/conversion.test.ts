import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  convertAmountToFunctionalCurrency,
  convertInvoiceComponents,
  FxConversionError,
  normalizeInvoiceFxSnapshot,
} from './conversion';

const SYNTHETIC_TND_TEST_RATES = [
  { currency: 'EUR', tndPerUnit: 3.4 },
  { currency: 'USD', tndPerUnit: 3.1 },
  { currency: 'AED', tndPerUnit: 0.8 },
] as const;

describe('invoice FX conversion', () => {
  it('converts several synthetic test currencies to and from TND', () => {
    for (const { currency, tndPerUnit } of SYNTHETIC_TND_TEST_RATES) {
      assert.equal(convertAmountToFunctionalCurrency(1, tndPerUnit), tndPerUnit);
      assert.equal(
        convertAmountToFunctionalCurrency(tndPerUnit, 1 / tndPerUnit),
        1,
        `${currency} inverse conversion`,
      );
    }
  });

  it('rounds converted amounts to millimes and preserves balanced component totals', () => {
    assert.equal(convertAmountToFunctionalCurrency(0.002, 3.4), 0.007);
    assert.deepEqual(convertInvoiceComponents({
      subTotal: 100,
      taxAmount: 19,
      otherAmount: 1,
    }, 3.4), {
      subTotal: 340,
      taxAmount: 64.6,
      otherAmount: 3.4,
      totalAmount: 408,
    });
  });

  it('uses an identity snapshot for invoices in the functional currency', () => {
    assert.deepEqual(normalizeInvoiceFxSnapshot({
      documentCurrencyCode: 'TND',
    }, 'TND', '2026-10-29'), {
      documentCurrencyCode: 'TND',
      functionalCurrencyCode: 'TND',
      exchangeRate: 1,
      exchangeRateDate: '2026-10-29',
      exchangeRateSource: 'Même devise fonctionnelle; aucune conversion.',
      exchangeRateImportedAt: null,
    });
  });

  it('requires a valid dated source for foreign currency and rejects future or invalid rates', () => {
    const invalidInputs = [
      { exchangeRate: undefined, exchangeRateDate: '2026-10-29', exchangeRateSource: 'BCT' },
      { exchangeRate: 0, exchangeRateDate: '2026-10-29', exchangeRateSource: 'BCT' },
      { exchangeRate: Number.NaN, exchangeRateDate: '2026-10-29', exchangeRateSource: 'BCT' },
      { exchangeRate: 3.3, exchangeRateDate: '2026-02-30', exchangeRateSource: 'BCT' },
      { exchangeRate: 3.3, exchangeRateDate: '2026-10-30', exchangeRateSource: 'BCT' },
      { exchangeRate: 3.3, exchangeRateDate: '2026-10-29', exchangeRateSource: '' },
    ];
    for (const input of invalidInputs) {
      assert.throws(
        () => normalizeInvoiceFxSnapshot({
          documentCurrencyCode: 'EUR',
          ...input,
        }, 'TND', '2026-10-29'),
        FxConversionError,
      );
    }
  });

  it('rejects unsafe conversion totals instead of storing an imprecise result', () => {
    assert.throws(
      () => convertAmountToFunctionalCurrency(Number.MAX_SAFE_INTEGER / 1000, 10),
      FxConversionError,
    );
  });
});
