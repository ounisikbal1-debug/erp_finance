export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export interface InvoiceCalculation {
  items: Array<InvoiceItemInput & { totalAmount: number }>;
  subTotal: number;
  taxAmount: number;
  stampDuty: number;
  totalAmount: number;
}

export interface SalesAccountMapping {
  receivableAccountCode: string | null;
  revenueAccountCode: string | null;
  vatAccountCode: string | null;
  stampDutyAccountCode: string | null;
}

export interface ResolvedSalesAccountMapping {
  receivableAccountCode: string;
  revenueAccountCode: string;
  vatAccountCode: string;
  stampDutyAccountCode: string;
}

export function getSalesPostingConfigurationIssues(
  countryCode: string,
  stampDuty: unknown,
  configuredTaxRates: readonly number[],
  configuredAccounts: readonly { code: string; type: string }[],
  mapping: SalesAccountMapping,
): string[] {
  const issues: string[] = [];
  if (!countryCode.trim()) issues.push('code pays');
  if (typeof stampDuty !== 'number' || !Number.isFinite(stampDuty) || stampDuty < 0
    || !Number.isSafeInteger(Math.round(stampDuty * 1000))) {
    issues.push('droit de timbre valide au millime');
  }
  if (configuredTaxRates.length === 0 || configuredTaxRates.some((rate) => (
    !Number.isFinite(rate) || rate < 0 || rate > 100
  ))) {
    issues.push('taux fiscaux finis compris entre 0 et 100');
  }

  const expectedAccountTypes: Array<[string, string, string | null]> = [
    ['compte client', 'Asset', mapping.receivableAccountCode],
    ['compte de ventes', 'Revenue', mapping.revenueAccountCode],
    ['compte TVA collectée', 'Liability', mapping.vatAccountCode],
  ];
  if (typeof stampDuty === 'number' && stampDuty > 0) {
    expectedAccountTypes.push(['compte droit de timbre', 'Liability', mapping.stampDutyAccountCode]);
  }
  const accountTypes = new Map(configuredAccounts.map(({ code, type }) => [code, type]));
  const missingOrInvalidAccounts = expectedAccountTypes
    .filter(([, expectedType, code]) => !code || accountTypes.get(code) !== expectedType)
    .map(([role, expectedType, code]) => `${role}${code ? ` ${code}` : ''} (${expectedType})`);
  if (missingOrInvalidAccounts.length > 0) {
    issues.push(`comptes de vente configurés avec leur type (${missingOrInvalidAccounts.join(', ')})`);
  }
  return issues;
}

export function assertSalesPostingConfiguration(
  countryCode: string,
  stampDuty: unknown,
  configuredTaxRates: readonly number[],
  configuredAccounts: readonly { code: string; type: string }[],
  mapping: SalesAccountMapping,
): ResolvedSalesAccountMapping {
  const issues = getSalesPostingConfigurationIssues(
    countryCode,
    stampDuty,
    configuredTaxRates,
    configuredAccounts,
    mapping,
  );
  if (issues.length > 0) {
    throw new SalesRequestError(
      `Configuration de facturation incomplète pour ${countryCode.trim().toUpperCase() || 'ce pays'} : ${issues.join('; ')}. Complétez et vérifiez le profil fiscal et comptable avant l’émission.`,
      422,
    );
  }
  return {
    receivableAccountCode: mapping.receivableAccountCode ?? '',
    revenueAccountCode: mapping.revenueAccountCode ?? '',
    vatAccountCode: mapping.vatAccountCode ?? '',
    stampDutyAccountCode: mapping.stampDutyAccountCode ?? '',
  };
}

export function assertConfiguredTaxRates(
  invoiceItems: readonly Pick<InvoiceItemInput, 'taxRate'>[],
  configuredRates: readonly number[],
): void {
  const allowedRates = new Set(configuredRates);
  const unsupportedRates = [...new Set(invoiceItems.map((item) => item.taxRate))]
    .filter((rate) => !allowedRates.has(rate));
  if (unsupportedRates.length > 0) {
    throw new SalesRequestError(`Taux de TVA absent de la configuration du pays : ${unsupportedRates.join(', ')}%`, 400);
  }
}

const roundToMillimes = (amount: number, documentName = 'facture') => {
  const millimes = Math.round(amount * 1000);
  if (!Number.isSafeInteger(millimes)) {
    throw new SalesRequestError(
      `Un montant ${documentName === 'facture' ? 'de la facture' : 'du devis'} dépasse la précision maximale au millime`,
      400,
    );
  }
  return millimes / 1000;
};

function calculateSalesDocument(items: unknown, stampDuty: unknown, isQuote: boolean): InvoiceCalculation {
  const documentName = isQuote ? 'devis' : 'facture';
  const documentSubject = isQuote ? 'Le devis' : 'La facture';
  if (!Array.isArray(items) || items.length === 0) {
    throw new SalesRequestError(`${documentSubject} doit contenir au moins une ligne`, 400);
  }
  if (typeof stampDuty !== 'number' || !Number.isFinite(stampDuty) || stampDuty < 0) {
    throw new SalesRequestError(isQuote
      ? 'Le droit de timbre du devis doit être un montant positif ou nul'
      : 'Le droit de timbre doit être un montant positif ou nul', 400);
  }
  const roundedStampDuty = roundToMillimes(stampDuty, documentName);

  const calculatedItems = items.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new SalesRequestError(`Ligne de ${documentName} invalide (${index + 1})`, 400);
    }
    const { description, quantity, unitPrice, taxRate } = item as InvoiceItemInput;
    if (typeof description !== 'string' || !description.trim()) {
      throw new SalesRequestError(`Le libellé est obligatoire à la ligne ${index + 1}`, 400);
    }
    let normalizedQuantity: number;
    try {
      normalizedQuantity = validateStockQuantity(quantity, `La quantité à la ligne ${index + 1}`);
    } catch {
      throw new SalesRequestError(`La quantité doit être positive et limitée à trois décimales à la ligne ${index + 1}`, 400);
    }
    if (typeof unitPrice !== 'number' || !Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new SalesRequestError(`Le prix unitaire doit être fini et positif ou nul à la ligne ${index + 1}`, 400);
    }
    if (typeof taxRate !== 'number' || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      throw new SalesRequestError(`Le taux de TVA doit être compris entre 0 et 100 à la ligne ${index + 1}`, 400);
    }

    const lineHT = roundToMillimes(normalizedQuantity * unitPrice, documentName);
    const lineTax = roundToMillimes(lineHT * (taxRate / 100), documentName);
    return {
      description: description.trim(),
      quantity: normalizedQuantity,
      unitPrice,
      taxRate,
      totalAmount: roundToMillimes(lineHT + lineTax, documentName),
      lineHT,
      lineTax,
    };
  });

  const subTotal = roundToMillimes(calculatedItems.reduce((total, item) => total + item.lineHT, 0), documentName);
  const taxAmount = roundToMillimes(calculatedItems.reduce((total, item) => total + item.lineTax, 0), documentName);
  const totalAmount = roundToMillimes(subTotal + taxAmount + roundedStampDuty, documentName);
  if (!Number.isFinite(totalAmount) || (!isQuote && totalAmount <= 0)) {
    throw new SalesRequestError(`Le montant total ${isQuote ? 'du devis' : 'de la facture'} doit être strictement positif`, 400);
  }

  return {
    items: calculatedItems.map(({ lineHT: _lineHT, lineTax: _lineTax, ...item }) => item),
    subTotal,
    taxAmount,
    stampDuty: roundedStampDuty,
    totalAmount,
  };
}

export function calculateInvoice(items: unknown, stampDuty: unknown): InvoiceCalculation {
  return calculateSalesDocument(items, stampDuty, false);
}

export function calculateQuote(items: unknown): InvoiceCalculation {
  return calculateSalesDocument(items, 0, true);
}
import { SalesRequestError } from './errors';
import { validateStockQuantity } from '../materials/quantity';
