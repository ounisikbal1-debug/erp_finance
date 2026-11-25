export interface TaxInvoice {
  invoiceNumber: string;
  subTotal?: number;
  taxAmount: number;
  currencyCode?: string | null;
  documentCurrencyCode?: string | null;
  functionalCurrencyCode?: string | null;
  exchangeRate?: number | null;
  exchangeRateDate?: Date | string | null;
  exchangeRateSource?: string | null;
  items: Array<{ quantity: number; unitPrice: number; taxRate: number }>;
}

export interface CollectedVatLine {
  reference: string | null;
  debit: number;
  credit: number;
}

export interface DeductibleVatLine {
  accountCode: string;
  reference?: string | null;
  debit: number;
  credit: number;
}

export interface TaxPurchaseInvoice {
  invoiceNumber: string;
  subTotal: number;
  taxAmount: number;
  taxRate: number;
  purchaseVatRecoverable: boolean | null;
}

export interface TaxSupplierCreditNote {
  documentNumber: string | null;
  subTotal: number;
  taxAmount: number;
  taxRate: number;
  purchaseVatRecoverable: boolean | null;
}

export interface TaxDeclarationSourceConfiguration {
  salesVatAccountCode: string | null;
  purchaseVatAccountCode: string | null;
  corporateTaxRate: number | null;
  rsWithholdingAmount?: number;
  rsDetails?: Array<{
    category: string;
    sourceReference: string;
    baseTtc: number;
    rate: number;
    amount: number;
  }>;
  corporateTaxAmount?: number;
  corporateTaxableBase?: number;
}

export function allocateCollectedVatByRate(
  postedVatMillimes: number,
  calculatedVatMillimesByRate: ReadonlyMap<number, number>,
  lineCountByRate: ReadonlyMap<number, number>,
): Map<number, number> | null {
  const rates = [...calculatedVatMillimesByRate.keys()].sort((left, right) => left - right);
  if (rates.length === 0) return null;

  const calculatedTotal = rates.reduce((total, rate) => total + (calculatedVatMillimesByRate.get(rate) ?? 0), 0);
  const useLineCounts = calculatedTotal === 0;
  const weightFor = (rate: number) => useLineCounts
    ? lineCountByRate.get(rate) ?? 0
    : calculatedVatMillimesByRate.get(rate) ?? 0;
  const totalWeight = rates.reduce((total, rate) => total + weightFor(rate), 0);
  if (totalWeight <= 0) return null;

  let remainder = postedVatMillimes;
  const allocations = new Map<number, number>();
  rates.forEach((rate, index) => {
    const allocation = index === rates.length - 1
      ? remainder
      : Math.round(postedVatMillimes * weightFor(rate) / totalWeight);
    allocations.set(rate, allocation);
    remainder -= allocation;
  });
  return allocations;
}

export class TaxDeclarationError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'TaxDeclarationError';
  }
}

const roundToMillimes = (amount: number) => Math.round(amount * 1000) / 1000;

function isValidJournalAmount(amount: number): boolean {
  const millimes = Math.round(amount * 1000);
  return Number.isFinite(amount)
    && amount >= 0
    && Number.isSafeInteger(millimes)
    && Math.abs(amount * 1000 - millimes) <= 1e-7;
}

function convertMillimes(millimes: number, exchangeRate: number): number | null {
  const converted = Math.round(millimes * exchangeRate);
  return Number.isSafeInteger(converted) ? converted : null;
}

function isCalendarDate(value: Date | string | null | undefined): boolean {
  if (value instanceof Date) return Number.isFinite(value.getTime());
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidJournalLine(debit: number, credit: number): boolean {
  return isValidJournalAmount(debit)
    && isValidJournalAmount(credit)
    && !(debit > 0 && credit > 0);
}

function getJournalSideTotalMillimes(
  lines: readonly { debit: number; credit: number }[],
  side: 'debit' | 'credit',
): number | null {
  let total = 0;
  for (const line of lines) {
    if (!isValidJournalLine(line.debit, line.credit)) return null;
    total += Math.round(line[side] * 1000);
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

export function validateTaxPeriod(period: unknown): string {
  if (typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new TaxDeclarationError('La période fiscale doit respecter le format AAAA-MM', 400);
  }
  return period;
}

export function calculateTaxDeclaration(
  period: string,
  currency: string,
  invoices: readonly TaxInvoice[],
  deductibleLines: readonly DeductibleVatLine[],
  collectedVatLines: readonly CollectedVatLine[],
  purchaseInvoices: readonly TaxPurchaseInvoice[] = [],
  supplierCreditNotes: readonly TaxSupplierCreditNote[] = [],
  sourceConfiguration?: TaxDeclarationSourceConfiguration,
) {
  const hasSalesVatAccountCode = sourceConfiguration?.salesVatAccountCode === undefined
    || Boolean(sourceConfiguration.salesVatAccountCode?.trim());
  const hasPurchaseVatAccountCode = sourceConfiguration?.purchaseVatAccountCode === undefined
    || Boolean(sourceConfiguration.purchaseVatAccountCode?.trim());
  const corporateTaxRate = sourceConfiguration?.corporateTaxRate;
  const hasCorporateTaxRate = corporateTaxRate === undefined
    || (corporateTaxRate !== null && Number.isFinite(corporateTaxRate) && corporateTaxRate >= 0 && corporateTaxRate <= 100);
  const hasReviewedRsAmount = sourceConfiguration?.rsWithholdingAmount !== undefined
    && isValidJournalAmount(sourceConfiguration.rsWithholdingAmount);
  const hasReviewedCorporateTaxAmount = sourceConfiguration?.corporateTaxAmount !== undefined
    && isValidJournalAmount(sourceConfiguration.corporateTaxAmount)
    && sourceConfiguration.corporateTaxableBase !== undefined
    && isValidJournalAmount(sourceConfiguration.corporateTaxableBase)
    && hasCorporateTaxRate
    && corporateTaxRate !== null;
  const rates = new Map<number, { baseHTMillimes: number; tvaMillimes: number }>();
  const invoiceVatByRate = new Map<string, Map<number, number>>();
  const invoiceLineCountsByRate = new Map<string, Map<number, number>>();
  const invalidInvoices: string[] = [];
  const invoicesWithCurrencyMismatch: string[] = [];
  const invoicesWithMissingCurrency: string[] = [];
  for (const invoice of invoices) {
    const hasMissingCurrency = sourceConfiguration !== undefined
      && !invoice.currencyCode?.trim();
    const hasCurrencyMismatch = Boolean(invoice.currencyCode && invoice.currencyCode !== currency);
    const hasFxMetadata = invoice.documentCurrencyCode !== null && invoice.documentCurrencyCode !== undefined
      || invoice.functionalCurrencyCode !== null && invoice.functionalCurrencyCode !== undefined
      || invoice.exchangeRate !== null && invoice.exchangeRate !== undefined
      || invoice.exchangeRateDate !== null && invoice.exchangeRateDate !== undefined
      || invoice.exchangeRateSource !== null && invoice.exchangeRateSource !== undefined;
    const exchangeRate = invoice.exchangeRate ?? 1;
    const hasInvalidFxSnapshot = hasFxMetadata && (
      !invoice.documentCurrencyCode
      || !invoice.functionalCurrencyCode
      || invoice.functionalCurrencyCode !== currency
      || !Number.isFinite(exchangeRate)
      || exchangeRate <= 0
      || !isCalendarDate(invoice.exchangeRateDate)
      || !invoice.exchangeRateSource?.trim()
      || (invoice.documentCurrencyCode === invoice.functionalCurrencyCode && exchangeRate !== 1)
      || (invoice.documentCurrencyCode !== invoice.functionalCurrencyCode && exchangeRate === 1)
    );
    const hasInvalidInput = !invoice.invoiceNumber.trim()
      || !isValidJournalAmount(invoice.taxAmount)
      || hasMissingCurrency
      || hasCurrencyMismatch
      || hasInvalidFxSnapshot
      || invoice.items.some((item) => (
        toStockQuantityMilliUnits(item.quantity) === null
        || item.quantity <= 0
        || !Number.isFinite(item.unitPrice)
        || item.unitPrice < 0
        || !Number.isFinite(item.taxRate)
        || item.taxRate < 0
        || item.taxRate > 100
        || !Number.isFinite(item.quantity * item.unitPrice)
      ));
    if (hasInvalidInput) {
      invalidInvoices.push(invoice.invoiceNumber || '(numéro absent)');
      if (hasMissingCurrency) invoicesWithMissingCurrency.push(invoice.invoiceNumber || '(numéro absent)');
      if (hasCurrencyMismatch) invoicesWithCurrencyMismatch.push(invoice.invoiceNumber || '(numéro absent)');
      continue;
    }

    let documentBaseTotalMillimes = 0;
    let documentTaxTotalMillimes = 0;
    const documentBaseByRate = new Map<number, number>();
    const documentTaxByRate = new Map<number, number>();
    const invoiceLineCounts = new Map<number, number>();
    let invalidInvoiceCalculation = false;
    for (const item of invoice.items) {
      const baseMillimes = Math.round(roundToMillimes(item.quantity * item.unitPrice) * 1000);
      const taxMillimes = Math.round(roundToMillimes(baseMillimes / 1000 * item.taxRate / 100) * 1000);
      documentBaseTotalMillimes += baseMillimes;
      documentTaxTotalMillimes += taxMillimes;
      const baseByRate = (documentBaseByRate.get(item.taxRate) ?? 0) + baseMillimes;
      const taxByRate = (documentTaxByRate.get(item.taxRate) ?? 0) + taxMillimes;
      if (!Number.isSafeInteger(documentBaseTotalMillimes)
        || !Number.isSafeInteger(documentTaxTotalMillimes)
        || !Number.isSafeInteger(baseByRate)
        || !Number.isSafeInteger(taxByRate)) {
        invalidInvoiceCalculation = true;
        break;
      }
      documentBaseByRate.set(item.taxRate, baseByRate);
      documentTaxByRate.set(item.taxRate, taxByRate);
      invoiceLineCounts.set(item.taxRate, (invoiceLineCounts.get(item.taxRate) ?? 0) + 1);
    }
    if (invalidInvoiceCalculation) {
      invalidInvoices.push(invoice.invoiceNumber || '(numéro absent)');
      continue;
    }

    const functionalBaseTotalMillimes = convertMillimes(documentBaseTotalMillimes, exchangeRate);
    const functionalTaxTotalMillimes = convertMillimes(documentTaxTotalMillimes, exchangeRate);
    const functionalBaseByRate = functionalBaseTotalMillimes === null
      ? null
      : allocateCollectedVatByRate(functionalBaseTotalMillimes, documentBaseByRate, invoiceLineCounts);
    const functionalTaxByRate = functionalTaxTotalMillimes === null
      ? null
      : allocateCollectedVatByRate(functionalTaxTotalMillimes, documentTaxByRate, invoiceLineCounts);
    if (!functionalBaseByRate || !functionalTaxByRate) {
      invalidInvoices.push(invoice.invoiceNumber || '(numéro absent)');
      continue;
    }
    if (invoice.subTotal !== undefined && (
      !isValidJournalAmount(invoice.subTotal)
      || Math.round(invoice.subTotal * 1000) !== functionalBaseTotalMillimes
    )) {
      invalidInvoices.push(invoice.invoiceNumber || '(numéro absent)');
      continue;
    }
    const invoiceRateTotals = new Map<number, number>();
    for (const rate of documentBaseByRate.keys()) {
      const baseMillimes = functionalBaseByRate.get(rate) ?? 0;
      const taxMillimes = functionalTaxByRate.get(rate) ?? 0;
      const totals = rates.get(rate) ?? { baseHTMillimes: 0, tvaMillimes: 0 };
      totals.baseHTMillimes += baseMillimes;
      totals.tvaMillimes += taxMillimes;
      if (!Number.isSafeInteger(totals.baseHTMillimes) || !Number.isSafeInteger(totals.tvaMillimes)) {
        invalidInvoices.push(invoice.invoiceNumber || '(numéro absent)');
        break;
      }
      rates.set(rate, totals);
      invoiceRateTotals.set(
        rate,
        (invoiceRateTotals.get(rate) ?? 0) + taxMillimes,
      );
    }
    invoiceVatByRate.set(invoice.invoiceNumber, invoiceRateTotals);
    invoiceLineCountsByRate.set(invoice.invoiceNumber, invoiceLineCounts);
  }

  const invoiceNumbers = new Set(invoices.map((invoice) => invoice.invoiceNumber));
  const ledgerVatByInvoice = new Map<string, { debitMillimes: number; creditMillimes: number }>();
  const deductibleVatByReference = new Map<string, { debitMillimes: number; creditMillimes: number }>();
  const expectedDeductibleByReference = new Map<string, number>();
  const deductibleVatByRate = new Map<number, { baseHTMillimes: number; taxMillimes: number }>();
  const invalidPurchaseDocuments: string[] = [];
  const unmatchedDeductibleReferences = new Set<string>();
  const unmatchedCollectedReferences = new Set<string>();
  let hasUnmatchedLedgerLine = false;
  let hasUnmatchedDeductibleLine = false;
  let hasInvalidCollectedVatLine = false;
  let hasInvalidDeductibleVatLine = false;
  let hasDeductibleMismatch = false;
  for (const line of collectedVatLines) {
    if (!isValidJournalLine(line.debit, line.credit)) {
      hasInvalidCollectedVatLine = true;
      continue;
    }
    if (!line.reference || !invoiceNumbers.has(line.reference)) {
      hasUnmatchedLedgerLine = true;
      unmatchedCollectedReferences.add(line.reference?.trim() || '(référence absente)');
      continue;
    }
    const totals = ledgerVatByInvoice.get(line.reference) ?? { debitMillimes: 0, creditMillimes: 0 };
    const debitMillimes = totals.debitMillimes + Math.round(line.debit * 1000);
    const creditMillimes = totals.creditMillimes + Math.round(line.credit * 1000);
    if (!Number.isSafeInteger(debitMillimes) || !Number.isSafeInteger(creditMillimes)) {
      hasInvalidCollectedVatLine = true;
      continue;
    }
    ledgerVatByInvoice.set(line.reference, { debitMillimes, creditMillimes });
  }
  const addPurchaseDocument = (
    reference: string | null,
    subTotal: number,
    taxAmount: number,
    rate: number,
    purchaseVatRecoverable: boolean | null,
    sign: 1 | -1,
  ) => {
    const label = reference?.trim() || '(référence absente)';
    if (purchaseVatRecoverable === null) {
      invalidPurchaseDocuments.push(`${label} (récupérabilité TVA non configurée)`);
      return;
    }
    if (!purchaseVatRecoverable) return;
    if (!reference?.trim() || !isValidJournalAmount(subTotal) || !isValidJournalAmount(taxAmount)
      || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      invalidPurchaseDocuments.push(label);
      return;
    }
    const baseMillimes = Math.round(subTotal * 1000) * sign;
    const taxMillimes = Math.round(taxAmount * 1000) * sign;
    const expected = (expectedDeductibleByReference.get(reference) ?? 0) + taxMillimes;
    const rateTotals = deductibleVatByRate.get(rate) ?? { baseHTMillimes: 0, taxMillimes: 0 };
    rateTotals.baseHTMillimes += baseMillimes;
    rateTotals.taxMillimes += taxMillimes;
    if (!Number.isSafeInteger(expected)
      || !Number.isSafeInteger(rateTotals.baseHTMillimes)
      || !Number.isSafeInteger(rateTotals.taxMillimes)) {
      invalidPurchaseDocuments.push(label);
      return;
    }
    expectedDeductibleByReference.set(reference, expected);
    deductibleVatByRate.set(rate, rateTotals);
  };
  for (const invoice of purchaseInvoices) {
    addPurchaseDocument(
      invoice.invoiceNumber,
      invoice.subTotal,
      invoice.taxAmount,
      invoice.taxRate,
      invoice.purchaseVatRecoverable,
      1,
    );
  }
  for (const creditNote of supplierCreditNotes) {
    addPurchaseDocument(
      creditNote.documentNumber,
      creditNote.subTotal,
      creditNote.taxAmount,
      creditNote.taxRate,
      creditNote.purchaseVatRecoverable,
      -1,
    );
  }
  for (const line of deductibleLines) {
    if (!isValidJournalLine(line.debit, line.credit)) {
      hasInvalidDeductibleVatLine = true;
      continue;
    }
    const reference = line.reference?.trim();
    if (!reference) {
      hasUnmatchedDeductibleLine = true;
      unmatchedDeductibleReferences.add('(référence absente)');
      continue;
    }
    const totals = deductibleVatByReference.get(reference) ?? { debitMillimes: 0, creditMillimes: 0 };
    totals.debitMillimes += Math.round(line.debit * 1000);
    totals.creditMillimes += Math.round(line.credit * 1000);
    if (!Number.isSafeInteger(totals.debitMillimes) || !Number.isSafeInteger(totals.creditMillimes)) {
      hasInvalidDeductibleVatLine = true;
      continue;
    }
    deductibleVatByReference.set(reference, totals);
  }
  for (const reference of deductibleVatByReference.keys()) {
    if (!expectedDeductibleByReference.has(reference)) {
      hasUnmatchedDeductibleLine = true;
      unmatchedDeductibleReferences.add(reference);
    }
  }
  for (const [reference, expected] of expectedDeductibleByReference) {
    const ledger = deductibleVatByReference.get(reference) ?? { debitMillimes: 0, creditMillimes: 0 };
    if (ledger.debitMillimes - ledger.creditMillimes !== expected) hasDeductibleMismatch = true;
  }
  const invoicesWithRateMismatches: Array<{ invoiceNumber: string; rates: number[] }> = [];
  const invoicesWithHeaderMismatches: string[] = [];
  let hasImpossibleVatAllocation = false;
  const invoiceVatIsReconciled = invoices.every((invoice) => {
    const calculatedByRate = invoiceVatByRate.get(invoice.invoiceNumber) ?? new Map<number, number>();
    const calculatedTotalMillimes = [...calculatedByRate.values()].reduce((total, amount) => total + amount, 0);
    const recordedVatMillimes = Math.round(invoice.taxAmount * 1000);
    const ledgerTotals = ledgerVatByInvoice.get(invoice.invoiceNumber) ?? { debitMillimes: 0, creditMillimes: 0 };
    const postedVatMillimes = ledgerTotals.creditMillimes - ledgerTotals.debitMillimes;
    const headerMatches = calculatedTotalMillimes === recordedVatMillimes;
    if (!headerMatches) invoicesWithHeaderMismatches.push(invoice.invoiceNumber);

    const allocation = allocateCollectedVatByRate(
      postedVatMillimes,
      calculatedByRate,
      invoiceLineCountsByRate.get(invoice.invoiceNumber) ?? new Map<number, number>(),
    );
    if (!allocation) {
      hasImpossibleVatAllocation = true;
      invoicesWithRateMismatches.push({ invoiceNumber: invoice.invoiceNumber, rates: [] });
      return false;
    }

    const mismatchedRates = [...calculatedByRate.keys()].filter((rate) => (
      allocation.get(rate) !== calculatedByRate.get(rate)
    ));
    if (mismatchedRates.length > 0) invoicesWithRateMismatches.push({
      invoiceNumber: invoice.invoiceNumber,
      rates: mismatchedRates,
    });
    return headerMatches && postedVatMillimes === recordedVatMillimes && mismatchedRates.length === 0;
  });
  let collectedVatTotalMillimes = 0;
  for (const invoice of invoices) {
    const totals = ledgerVatByInvoice.get(invoice.invoiceNumber) ?? { debitMillimes: 0, creditMillimes: 0 };
    collectedVatTotalMillimes += totals.creditMillimes - totals.debitMillimes;
    if (!Number.isSafeInteger(collectedVatTotalMillimes)) {
      hasInvalidCollectedVatLine = true;
      break;
    }
  }
  const collectedVatIsAvailable = hasSalesVatAccountCode
    && !hasInvalidCollectedVatLine
    && invalidInvoices.length === 0
    && !hasImpossibleVatAllocation
    && !hasUnmatchedLedgerLine
    && invoiceVatIsReconciled;

  const tvaCollectedGlobal = collectedVatIsAvailable ? collectedVatTotalMillimes / 1000 : null;

  const tvaDetailsCollected = collectedVatIsAvailable
    ? [...rates.entries()]
        .sort(([rateA], [rateB]) => rateA - rateB)
        .map(([rate, totals]) => ({
          rate,
          baseHT: totals.baseHTMillimes / 1000,
          tvaAmount: totals.tvaMillimes / 1000,
          label: rate === 0 ? 'TVA 0% Exonérée / Export' : `TVA ${rate}%`,
        }))
    : [];

  const deductibleDebitMillimes = getJournalSideTotalMillimes(deductibleLines, 'debit');
  const deductibleCreditMillimes = getJournalSideTotalMillimes(deductibleLines, 'credit');
  const hasInvalidDeductibleAggregate = deductibleDebitMillimes === null
    || deductibleCreditMillimes === null
    || !Number.isSafeInteger(deductibleDebitMillimes - deductibleCreditMillimes);

  const deductibleAvailable = hasPurchaseVatAccountCode
    && !hasInvalidDeductibleVatLine
    && !hasInvalidDeductibleAggregate
    && invalidPurchaseDocuments.length === 0
    && !hasUnmatchedDeductibleLine
    && !hasDeductibleMismatch
    && (deductibleLines.length > 0 || purchaseInvoices.length > 0 || supplierCreditNotes.length > 0);

  const tvaDeductibleGlobal = deductibleAvailable
    ? (deductibleDebitMillimes! - deductibleCreditMillimes!) / 1000
    : null;

  const tvaDue = tvaCollectedGlobal !== null && tvaDeductibleGlobal !== null
    ? Math.max(0, roundToMillimes(tvaCollectedGlobal - tvaDeductibleGlobal))
    : null;
  const tvaCredit = tvaCollectedGlobal !== null && tvaDeductibleGlobal !== null
    ? Math.max(0, roundToMillimes(tvaDeductibleGlobal - tvaCollectedGlobal))
    : null;
  const unavailableSections: string[] = [
    ...(invalidInvoices.length > 0
      ? [`Factures TVA : données invalides (${invalidInvoices.join(', ')})`]
      : []),
    ...(invoicesWithCurrencyMismatch.length > 0
      ? [`Factures TVA : devise indiquée différente de la devise fonctionnelle ${currency} (${invoicesWithCurrencyMismatch.join(', ')})`]
      : []),
    ...(invoicesWithMissingCurrency.length > 0
      ? [`Factures TVA : devise absente, rapprochement à la devise fonctionnelle ${currency} impossible (${invoicesWithMissingCurrency.join(', ')})`]
      : []),
    ...(hasInvalidCollectedVatLine
      ? ['TVA collectée : lignes 4367 invalides, total agrégé hors précision sûre, débit/crédit simultanément positifs ou montant non exprimé au millime']
      : []),
    ...(!hasSalesVatAccountCode
      ? ['TVA collectée : compte de TVA collectée non configuré pour le pays']
      : []),
    ...(invalidInvoices.length > 0
      ? [`TVA collectée : données de facture invalides (${invalidInvoices.join(', ')})`]
      : []),
    ...(hasImpossibleVatAllocation
      ? ['TVA collectée : ventilation par taux impossible (facture sans ligne taxable)']
      : []),
    ...(invoicesWithHeaderMismatches.length > 0
      ? [`TVA collectée : l’en-tête et les lignes de facture divergent (${invoicesWithHeaderMismatches.join(', ')})`]
      : []),
    ...(invoicesWithRateMismatches.length > 0
      ? [`TVA collectée : écart de rapprochement par taux (${invoicesWithRateMismatches.map(({ invoiceNumber, rates: mismatchedRates }) => (
        `${invoiceNumber}${mismatchedRates.length > 0 ? ` — ${mismatchedRates.join('%, ')}%` : ''}`
      )).join('; ')})`]
      : []),
    ...(hasUnmatchedLedgerLine
      ? [`TVA collectée : écart, écriture 4367 non rapprochée (${[...unmatchedCollectedReferences].join(', ')})`]
      : []),
    ...(!collectedVatIsAvailable
      && !hasInvalidCollectedVatLine
      && invalidInvoices.length === 0
      && !hasImpossibleVatAllocation
      && invoicesWithHeaderMismatches.length === 0
      && invoicesWithRateMismatches.length === 0
      && !hasUnmatchedLedgerLine
      && hasSalesVatAccountCode
      ? ['TVA collectée : écart entre factures et écritures postées 4367']
      : []),
    ...(!hasPurchaseVatAccountCode
      ? ['TVA déductible : compte de TVA déductible non configuré pour le pays']
      : deductibleAvailable
      ? []
      : [deductibleLines.length === 0 && purchaseInvoices.length === 0 && supplierCreditNotes.length === 0
        ? 'TVA déductible : aucune écriture 4366 postée sur la période'
        : hasInvalidDeductibleVatLine || hasInvalidDeductibleAggregate || invalidPurchaseDocuments.length > 0
          ? 'TVA déductible : lignes 4366 invalides ou factures/avoirs hors précision sûre ou montant non exprimé au millime'
          : hasUnmatchedDeductibleLine
            ? `TVA déductible : écriture 4366 non rapprochée (${[...unmatchedDeductibleReferences].join(', ')})`
            : 'TVA déductible : écart entre factures/avoirs fournisseurs et écritures postées 4366']),
    ...(invalidPurchaseDocuments.length > 0
      ? [`Achats TVA : données invalides (${invalidPurchaseDocuments.join(', ')})`]
      : []),
    ...(sourceConfiguration === undefined
      ? ['Retenues à la source et impôt sur les sociétés : données sources non disponibles']
      : !hasReviewedRsAmount
        ? ['Retenues à la source G50 : transactions de période ventilées par nature, bases TTC vérifiables et montants effectivement retenus non disponibles; l’aperçu manuel n’alimente pas l’agrégat']
        : []),
    ...(sourceConfiguration !== undefined && !hasReviewedCorporateTaxAmount
      ? [!hasCorporateTaxRate
        ? 'Impôt sur les sociétés : taux pays absent ou invalide; base imposable justifiée et règles de retraitement validées non disponibles'
        : corporateTaxRate === null
          ? 'Impôt sur les sociétés : taux pays non configuré; base imposable justifiée et règles de retraitement validées non disponibles'
          : `Impôt sur les sociétés : base imposable justifiée et règles de retraitement validées non disponibles (taux pays configuré à ${corporateTaxRate}%; montant non calculé)`]
      : []),
    'Total à payer G50 : règle de cumul, crédits et rubriques non gérés par un modèle officiel; total non calculé',
  ];
  const correctionActions = [
    ...(invalidInvoices.length > 0
      ? [`Vérifiez les données des factures ${invalidInvoices.join(', ')} (numéro, montant de TVA, quantités, prix et taux), corrigez à partir des pièces justificatives, puis relancez la déclaration.`]
      : []),
    ...(invoicesWithCurrencyMismatch.length > 0
      ? [`Vérifiez la devise fonctionnelle et le snapshot de change des factures ${invoicesWithCurrencyMismatch.join(', ')}; ne rapprochez pas leur TVA tant que la devise n’est pas justifiée.`]
      : []),
    ...(invoicesWithMissingCurrency.length > 0
      ? [`Complétez ou justifiez la devise fonctionnelle des factures ${invoicesWithMissingCurrency.join(', ')} avant de rapprocher leur TVA.`]
      : []),
    ...(hasInvalidCollectedVatLine
      ? ['Corrigez les débits/crédits des écritures 4367 à partir des justificatifs, au millime près, puis relancez la déclaration.']
      : []),
    ...(hasImpossibleVatAllocation
      ? ['Vérifiez les lignes de facture et les écritures 4367 rapprochées; une TVA postée ne peut pas être ventilée sans lignes de facture.']
      : []),
    ...(invoicesWithHeaderMismatches.length > 0
      ? [`Vérifiez les totaux de TVA des factures ${invoicesWithHeaderMismatches.join(', ')} par rapport à leurs lignes et aux écritures 4367, corrigez à partir des justificatifs puis relancez la déclaration.`]
      : []),
    ...(invoicesWithRateMismatches.length > 0
      ? [`Rapprochez les montants 4367 des factures ${invoicesWithRateMismatches.map(({ invoiceNumber }) => invoiceNumber).join(', ')} et vérifiez les lignes par taux; corrigez à partir des justificatifs puis relancez la déclaration.`]
      : []),
    ...(hasUnmatchedLedgerLine
      ? [`Rapprochez chaque écriture postée 4367 (références : ${[...unmatchedCollectedReferences].join(', ')}) avec les factures de la période, corrigez les pièces ou écritures si nécessaire puis relancez la déclaration.`]
      : []),
    ...(!collectedVatIsAvailable
      && !hasInvalidCollectedVatLine
      && invalidInvoices.length === 0
      && !hasImpossibleVatAllocation
      && invoicesWithHeaderMismatches.length === 0
      && invoicesWithRateMismatches.length === 0
      && !hasUnmatchedLedgerLine
      && hasSalesVatAccountCode
      ? ['Rapprochez les factures et écritures postées 4367, corrigez les écarts à partir des justificatifs puis relancez la déclaration.']
      : []),
    ...(!hasSalesVatAccountCode
      ? ['Configurez le compte de TVA collectée dans le profil du pays après vérification du plan comptable et des écritures existantes.']
      : []),
    ...(!deductibleAvailable
      ? [deductibleLines.length === 0
        ? 'Vérifiez les factures/avoirs fournisseurs et le grand livre 4366 pour cette période; ne créez une écriture que si les pièces justificatives le confirment.'
        : hasInvalidDeductibleVatLine || hasInvalidDeductibleAggregate
          ? 'Corrigez les débits/crédits 4366 invalides à partir des justificatifs au millime près, puis relancez la déclaration.'
          : hasUnmatchedDeductibleLine
            ? `Rapprochez les écritures 4366 non appariées (${[...unmatchedDeductibleReferences].join(', ')}) avec leurs pièces justificatives.`
            : 'Rapprochez les factures/avoirs fournisseurs avec les références et débits/crédits 4366; corrigez uniquement à partir des justificatifs, puis relancez la déclaration.']
      : []),
    ...(!hasPurchaseVatAccountCode
      ? ['Configurez le compte de TVA déductible dans le profil du pays après vérification du plan comptable et des écritures existantes.']
      : []),
    ...(sourceConfiguration === undefined || !hasReviewedRsAmount
      ? ['Pour intégrer la RS à la G50, fournissez des transactions de période rapprochées avec nature, base TTC, montant réellement retenu et justificatifs; validez les règles et mappings auprès d’une source compétente. L’aperçu manuel n’est pas agrégé. Émettez les certificats requis, puis approuvez la complétude avec la référence du rapprochement.']
      : []),
    ...(sourceConfiguration === undefined || !hasReviewedCorporateTaxAmount
      ? ['Faites valider les règles de détermination et de retraitement de la base imposable, puis fournissez la base justifiée et le montant IS issus du dossier fiscal de la période; SAFE ne calcule pas l’IS.']
      : []),
    'Vérifiez et reportez les montants dans le modèle officiel en vigueur; SAFE ne calcule pas le total légal à payer et ne dépose ni ne règle la déclaration.',
  ];

  return {
    period,
    currency,
    tvaCollectedGlobal,
    tvaDeductibleGlobal,
    tvaDue,
    tvaCredit,
    rsWithholdingGlobal: hasReviewedRsAmount ? sourceConfiguration!.rsWithholdingAmount! : null,
    isCorporateTaxGlobal: hasReviewedCorporateTaxAmount ? sourceConfiguration!.corporateTaxAmount! : null,
    totalTaxToPay: null,
    complianceStatus: unavailableSections.length > 0
      ? 'INCOMPLET — Données fiscales partielles ou rapprochement requis avant dépôt G50'
      : 'CONFORME — Déclaration G50 mensuelle pré-remplie aux normes DGI Tunisie',
    unavailableSections,
    correctionActions,
    tvaDetailsCollected,
    tvaDetailsDeductible: deductibleAvailable && tvaDeductibleGlobal !== null
      ? [
          {
            category: 'TVA déductible (comptes 4366)',
            baseHT: Math.round((tvaDeductibleGlobal / 0.19) * 1000) / 1000,
            tvaAmount: tvaDeductibleGlobal,
          },
        ]
      : [],
    tvaDetailsDeductibleByRate: deductibleAvailable
      ? [...deductibleVatByRate.entries()]
        .sort(([rateA], [rateB]) => rateA - rateB)
        .map(([rate, totals]) => ({
          rate,
          baseHT: totals.baseHTMillimes / 1000,
          tvaAmount: totals.taxMillimes / 1000,
          label: `TVA achats ${rate}%`,
        }))
      : [],
    rsDetails: sourceConfiguration?.rsDetails ?? [],
  };
}
import { toStockQuantityMilliUnits } from '../materials/quantity';
