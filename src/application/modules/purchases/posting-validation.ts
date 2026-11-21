import { PurchaseRequestError } from './errors';
import { calculatePurchaseInvoiceAmounts } from './invoice';
import { convertInvoiceComponents, normalizeInvoiceFxSnapshot } from '../fx/conversion';

interface PurchaseInvoiceSnapshot {
  invoiceNumber: string;
  issueDate: Date;
  currencyCode: string;
  functionalCurrencyCode: string | null;
  taxRateId: string;
  taxRateCode: string;
  taxRate: number;
  subTotal: number;
  taxAmount: number;
  totalAmount: number;
  documentCurrencyCode: string | null;
  documentSubTotal: number | null;
  documentTaxAmount: number | null;
  documentTotalAmount: number | null;
  exchangeRate: number | null;
  exchangeRateDate: Date | null;
  exchangeRateSource: string | null;
  exchangeRateImportedAt: Date | null;
}

interface ConfiguredTaxRate {
  id: string;
  code: string;
  rate: number;
  purchaseVatRecoverable: boolean;
}

interface PostingAccount {
  code: string;
  type: string;
  isPostingAllowed: boolean;
}

export interface PurchasePostingConfiguration {
  functionalCurrencyCode: string;
  purchaseExpenseAccountCode: string | null;
  purchaseVatAccountCode: string | null;
  payableAccountCode: string | null;
  taxRates: ConfiguredTaxRate[];
  accounts: PostingAccount[];
}

export interface PurchasePostingLine {
  accountCode: string;
  debit: number;
  credit: number;
  description: string;
}

export interface SupplierCreditNotePostingSnapshot {
  supplierDocumentNumber: string;
  creditDate: Date;
  currencyCode: string;
  functionalCurrencyCode: string;
  taxRateId: string;
  taxRateCode: string;
  taxRate: number;
  documentSubTotal: number;
  documentTaxAmount: number;
  documentTotalAmount: number;
  subTotal: number;
  taxAmount: number;
  totalAmount: number;
  exchangeRate: number;
  exchangeRateDate: Date | null;
  exchangeRateSource: string | null;
  exchangeRateImportedAt: Date | null;
}

function toMillimes(value: number): number | null {
  const millimes = Math.round(value * 1000);
  return Number.isFinite(value)
    && Number.isSafeInteger(millimes)
    && Math.abs(value * 1000 - millimes) <= 1e-7
    ? millimes
    : null;
}

function requireEqualAmount(actual: number, expected: number, label: string): void {
  const actualMillimes = toMillimes(actual);
  const expectedMillimes = toMillimes(expected);
  if (actualMillimes === null || expectedMillimes === null || actualMillimes !== expectedMillimes) {
    throw new PurchaseRequestError(`Le contrôle de cohérence du montant ${label} a échoué.`, 422);
  }
}

function requirePostingAccount(
  accounts: Map<string, PostingAccount>,
  code: string | null,
  expectedType: string,
  label: string,
): PostingAccount {
  const account = code ? accounts.get(code) : undefined;
  if (!account) throw new PurchaseRequestError(`Le compte ${label} n’est pas configuré dans le profil ou le mapping de la société.`, 422);
  if (account.type !== expectedType || !account.isPostingAllowed) {
    throw new PurchaseRequestError(`Le compte ${label} doit être de type ${expectedType} et autorisé à la comptabilisation.`, 422);
  }
  return account;
}

export function buildPurchasePostingLines(
  invoice: PurchaseInvoiceSnapshot,
  configuration: PurchasePostingConfiguration,
): PurchasePostingLine[] {
  const issueDate = invoice.issueDate.toISOString().slice(0, 10);
  const documentCurrencyCode = invoice.documentCurrencyCode ?? invoice.currencyCode;
  const functionalCurrencyCode = invoice.functionalCurrencyCode ?? invoice.currencyCode;
  if (invoice.currencyCode !== configuration.functionalCurrencyCode
    || functionalCurrencyCode !== configuration.functionalCurrencyCode) {
    throw new PurchaseRequestError('La devise fonctionnelle de la facture ne correspond plus au profil pays.', 422);
  }

  const taxRate = configuration.taxRates.find((rate) => rate.id === invoice.taxRateId);
  if (!taxRate || taxRate.code !== invoice.taxRateCode || taxRate.rate !== invoice.taxRate) {
    throw new PurchaseRequestError('Le taux de facture n’est plus présent ou ne correspond plus à la configuration pays.', 422);
  }

  const snapshot = normalizeInvoiceFxSnapshot({
    documentCurrencyCode,
    exchangeRate: invoice.exchangeRate ?? undefined,
    exchangeRateDate: invoice.exchangeRateDate?.toISOString().slice(0, 10),
    exchangeRateSource: invoice.exchangeRateSource ?? undefined,
    exchangeRateImportedAt: invoice.exchangeRateImportedAt?.toISOString(),
  }, configuration.functionalCurrencyCode, issueDate);
  if (documentCurrencyCode !== snapshot.functionalCurrencyCode
    && (!invoice.exchangeRate || !invoice.exchangeRateDate || !invoice.exchangeRateSource)) {
    throw new PurchaseRequestError('La source, la date et le taux de conversion de la facture sont incomplets.', 422);
  }

  const documentSubTotal = invoice.documentSubTotal ?? invoice.subTotal;
  const documentAmounts = calculatePurchaseInvoiceAmounts(documentSubTotal, taxRate.rate);
  requireEqualAmount(invoice.documentTaxAmount ?? invoice.taxAmount, documentAmounts.taxAmount, 'TVA document');
  requireEqualAmount(invoice.documentTotalAmount ?? invoice.totalAmount, documentAmounts.totalAmount, 'TTC document');
  const functionalAmounts = convertInvoiceComponents({
    subTotal: documentAmounts.subTotal,
    taxAmount: documentAmounts.taxAmount,
  }, snapshot.exchangeRate);
  requireEqualAmount(invoice.subTotal, functionalAmounts.subTotal, 'HT fonctionnel');
  requireEqualAmount(invoice.taxAmount, functionalAmounts.taxAmount, 'TVA fonctionnelle');
  requireEqualAmount(invoice.totalAmount, functionalAmounts.totalAmount, 'TTC fonctionnel');

  const accounts = new Map(configuration.accounts.map((account) => [account.code, account]));
  const expense = requirePostingAccount(
    accounts,
    configuration.purchaseExpenseAccountCode,
    'Expense',
    'de charges achats',
  );
  const payable = requirePostingAccount(
    accounts,
    configuration.payableAccountCode,
    'Liability',
    'fournisseurs',
  );
  const lines: PurchasePostingLine[] = [
    {
      accountCode: expense.code,
      debit: functionalAmounts.subTotal,
      credit: 0,
      description: `Achats HT — ${invoice.invoiceNumber}`,
    },
  ];
  if (functionalAmounts.taxAmount > 0) {
    if (!taxRate.purchaseVatRecoverable) {
      throw new PurchaseRequestError('La récupérabilité de la TVA à l’achat n’est pas confirmée pour ce taux pays.', 422);
    }
    const vat = requirePostingAccount(
      accounts,
      configuration.purchaseVatAccountCode,
      'Asset',
      'de TVA déductible achats',
    );
    lines.push({
      accountCode: vat.code,
      debit: functionalAmounts.taxAmount,
      credit: 0,
      description: `TVA achats — ${invoice.invoiceNumber}`,
    });
  }
  lines.push({
    accountCode: payable.code,
    debit: 0,
    credit: functionalAmounts.totalAmount,
    description: `Fournisseur — ${invoice.invoiceNumber}`,
  });

  const debitMillimes = lines.reduce((total, line) => total + (toMillimes(line.debit) ?? 0), 0);
  const creditMillimes = lines.reduce((total, line) => total + (toMillimes(line.credit) ?? 0), 0);
  if (debitMillimes <= 0 || debitMillimes !== creditMillimes || !Number.isSafeInteger(debitMillimes)) {
    throw new PurchaseRequestError('La pré-validation de l’écriture comptable équilibrée a échoué.', 422);
  }
  return lines;
}

export function buildSupplierCreditNotePostingLines(
  creditNote: SupplierCreditNotePostingSnapshot,
  configuration: PurchasePostingConfiguration,
): PurchasePostingLine[] {
  const invoiceLines = buildPurchasePostingLines({
    invoiceNumber: creditNote.supplierDocumentNumber,
    issueDate: creditNote.creditDate,
    currencyCode: creditNote.functionalCurrencyCode,
    functionalCurrencyCode: creditNote.functionalCurrencyCode,
    taxRateId: creditNote.taxRateId,
    taxRateCode: creditNote.taxRateCode,
    taxRate: creditNote.taxRate,
    subTotal: creditNote.subTotal,
    taxAmount: creditNote.taxAmount,
    totalAmount: creditNote.totalAmount,
    documentCurrencyCode: creditNote.currencyCode,
    documentSubTotal: creditNote.documentSubTotal,
    documentTaxAmount: creditNote.documentTaxAmount,
    documentTotalAmount: creditNote.documentTotalAmount,
    exchangeRate: creditNote.exchangeRate,
    exchangeRateDate: creditNote.exchangeRateDate,
    exchangeRateSource: creditNote.exchangeRateSource,
    exchangeRateImportedAt: creditNote.exchangeRateImportedAt,
  }, configuration);
  return invoiceLines.map((line) => ({
    accountCode: line.accountCode,
    debit: line.credit,
    credit: line.debit,
    description: `Avoir fournisseur ${creditNote.supplierDocumentNumber}`,
  }));
}
