import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PurchaseRequestError } from './errors';
import { buildPurchasePostingLines, buildSupplierCreditNotePostingLines } from './posting-validation';

const invoice = {
  invoiceNumber: 'TEST-SUP-001',
  issueDate: new Date('2026-10-29T00:00:00.000Z'),
  currencyCode: 'TND',
  functionalCurrencyCode: 'TND',
  taxRateId: 'test-rate',
  taxRateCode: 'TEST-VAT',
  taxRate: 19,
  subTotal: 100,
  taxAmount: 19,
  totalAmount: 119,
  documentCurrencyCode: 'TND',
  documentSubTotal: 100,
  documentTaxAmount: 19,
  documentTotalAmount: 119,
  exchangeRate: 1,
  exchangeRateDate: new Date('2026-10-29T00:00:00.000Z'),
  exchangeRateSource: 'Même devise fonctionnelle; aucune conversion.',
  exchangeRateImportedAt: null,
};

const configuration = {
  functionalCurrencyCode: 'TND',
  purchaseExpenseAccountCode: 'TEST-EXPENSE',
  purchaseVatAccountCode: 'TEST-VAT-ASSET',
  payableAccountCode: 'TEST-PAYABLE',
  taxRates: [{
    id: 'test-rate',
    code: 'TEST-VAT',
    rate: 19,
    purchaseVatRecoverable: true,
  }],
  accounts: [
    { code: 'TEST-EXPENSE', type: 'Expense', isPostingAllowed: true },
    { code: 'TEST-VAT-ASSET', type: 'Asset', isPostingAllowed: true },
    { code: 'TEST-PAYABLE', type: 'Liability', isPostingAllowed: true },
  ],
};

describe('supplier invoice posting pre-validation', () => {
  it('builds a balanced test journal only from explicitly configured, posting-enabled accounts', () => {
    const lines = buildPurchasePostingLines(invoice, configuration);
    assert.deepEqual(lines.map(({ accountCode, debit, credit }) => ({ accountCode, debit, credit })), [
      { accountCode: 'TEST-EXPENSE', debit: 100, credit: 0 },
      { accountCode: 'TEST-VAT-ASSET', debit: 19, credit: 0 },
      { accountCode: 'TEST-PAYABLE', debit: 0, credit: 119 },
    ]);
  });

  it('creates a balanced supplier credit journal that reverses expense, recoverable VAT, and payable', () => {
    const lines = buildSupplierCreditNotePostingLines({
      supplierDocumentNumber: 'AV-TEST-001',
      creditDate: new Date('2026-10-30T00:00:00.000Z'),
      currencyCode: 'TND',
      functionalCurrencyCode: 'TND',
      taxRateId: 'test-rate',
      taxRateCode: 'TEST-VAT',
      taxRate: 19,
      documentSubTotal: 100,
      documentTaxAmount: 19,
      documentTotalAmount: 119,
      subTotal: 100,
      taxAmount: 19,
      totalAmount: 119,
      exchangeRate: 1,
      exchangeRateDate: invoice.exchangeRateDate,
      exchangeRateSource: invoice.exchangeRateSource,
      exchangeRateImportedAt: null,
    }, configuration);
    assert.deepEqual(lines.map(({ accountCode, debit, credit }) => ({ accountCode, debit, credit })), [
      { accountCode: 'TEST-EXPENSE', debit: 0, credit: 100 },
      { accountCode: 'TEST-VAT-ASSET', debit: 0, credit: 19 },
      { accountCode: 'TEST-PAYABLE', debit: 119, credit: 0 },
    ]);
  });

  it('blocks VAT posting unless the country tax-rate configuration explicitly marks it recoverable', () => {
    assert.throws(() => buildPurchasePostingLines(invoice, {
      ...configuration,
      taxRates: [{ ...configuration.taxRates[0], purchaseVatRecoverable: false }],
    }), (error: unknown) => error instanceof PurchaseRequestError
      && error.statusCode === 422
      && /récupérabilité/.test(error.message));
  });

  it('blocks missing, wrong-type, or non-posting accounts rather than guessing a mapping', () => {
    assert.throws(() => buildPurchasePostingLines(invoice, {
      ...configuration,
      purchaseExpenseAccountCode: null,
    }), (error: unknown) => error instanceof PurchaseRequestError && error.statusCode === 422);
    assert.throws(() => buildPurchasePostingLines(invoice, {
      ...configuration,
      accounts: configuration.accounts.map((account) => account.code === 'TEST-PAYABLE'
        ? { ...account, type: 'Asset' }
        : account),
    }), (error: unknown) => error instanceof PurchaseRequestError && error.statusCode === 422);
    assert.throws(() => buildPurchasePostingLines(invoice, {
      ...configuration,
      accounts: configuration.accounts.map((account) => account.code === 'TEST-EXPENSE'
        ? { ...account, isPostingAllowed: false }
        : account),
    }), (error: unknown) => error instanceof PurchaseRequestError && error.statusCode === 422);
  });

  it('rechecks the frozen foreign exchange snapshot and converted amounts', () => {
    const foreignInvoice = {
      ...invoice,
      currencyCode: 'TND',
      documentCurrencyCode: 'EUR',
      documentSubTotal: 100,
      documentTaxAmount: 19,
      documentTotalAmount: 119,
      exchangeRate: 3.4,
      exchangeRateDate: new Date('2026-10-29T00:00:00.000Z'),
      exchangeRateSource: 'TEST: taux synthétique fixe',
      exchangeRateImportedAt: new Date('2026-10-29T06:00:00.000Z'),
      subTotal: 340,
      taxAmount: 64.6,
      totalAmount: 404.6,
    };
    const lines = buildPurchasePostingLines(foreignInvoice, configuration);
    assert.equal(lines[0].debit, 340);
    assert.equal(lines[1].debit, 64.6);
    assert.equal(lines[2].credit, 404.6);
    assert.throws(() => buildPurchasePostingLines({
      ...foreignInvoice,
      exchangeRateSource: null,
    }, configuration), /source du taux de change est obligatoire/);
  });
});
