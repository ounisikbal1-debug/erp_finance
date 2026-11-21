import { PurchaseRequestError } from './errors';
import { validateStockQuantity } from '../materials/quantity';

export interface PurchaseInvoiceInput {
  invoiceNumber: string;
  vendorId: string;
  issueDate: string;
  dueDate: string;
  subTotal: number;
  taxRateId: string;
  lines?: Array<{
    description: string;
    materialId: string | null;
    purchaseOrderLineId?: string | null;
    quantity: number;
    unitPrice: number;
  }>;
  documentCurrencyCode?: unknown;
  exchangeRate?: unknown;
  exchangeRateDate?: unknown;
  exchangeRateSource?: unknown;
  exchangeRateImportedAt?: unknown;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function toMillimes(amount: number): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  const millimes = Math.round(amount * 1000);
  if (!Number.isSafeInteger(millimes) || Math.abs(amount * 1000 - millimes) > 1e-7) return null;
  return millimes;
}

export function validatePurchaseInvoiceInput(input: unknown): PurchaseInvoiceInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PurchaseRequestError('Les données de la facture fournisseur sont invalides.', 400);
  }
  const data = input as Record<string, unknown>;
  const invoiceNumber = typeof data.invoiceNumber === 'string' ? data.invoiceNumber.trim() : '';
  const vendorId = typeof data.vendorId === 'string' ? data.vendorId.trim() : '';
  const taxRateId = typeof data.taxRateId === 'string' ? data.taxRateId.trim() : '';
  if (!invoiceNumber || invoiceNumber.length > 80 || !vendorId || !taxRateId) {
    throw new PurchaseRequestError('Le numéro de facture, le fournisseur et le taux pays doivent être renseignés.', 400);
  }
  if (!isCalendarDate(data.issueDate) || !isCalendarDate(data.dueDate)) {
    throw new PurchaseRequestError('Les dates de facture et d’échéance doivent être valides au format AAAA-MM-JJ.', 400);
  }
  if (data.dueDate < data.issueDate) {
    throw new PurchaseRequestError('La date d’échéance ne peut pas précéder la date de facture.', 400);
  }
  if (typeof data.subTotal !== 'number' || toMillimes(data.subTotal) === null || data.subTotal <= 0) {
    throw new PurchaseRequestError('Le montant HT doit être positif et exprimable au millime.', 400);
  }
  let lines: PurchaseInvoiceInput['lines'];
  if (data.lines !== undefined) {
    if (!Array.isArray(data.lines) || data.lines.length === 0 || data.lines.length > 200) {
      throw new PurchaseRequestError('Le détail doit contenir de 1 à 200 lignes.', 400);
    }
    let totalMillimes = 0;
    lines = data.lines.map((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new PurchaseRequestError(`La ligne ${index + 1} est invalide.`, 400);
      }
      const line = value as Record<string, unknown>;
      const description = typeof line.description === 'string' ? line.description.trim() : '';
      if (!description || description.length > 200) {
        throw new PurchaseRequestError(`La désignation de la ligne ${index + 1} est obligatoire (200 caractères maximum).`, 400);
      }
      const materialId = line.materialId === undefined || line.materialId === null || line.materialId === ''
        ? null
        : typeof line.materialId === 'string' && line.materialId.trim()
          ? line.materialId.trim()
          : null;
      if (line.materialId !== undefined && line.materialId !== null && line.materialId !== '' && !materialId) {
        throw new PurchaseRequestError(`L’article lié à la ligne ${index + 1} est invalide.`, 400);
      }
      const purchaseOrderLineId = line.purchaseOrderLineId === undefined
        || line.purchaseOrderLineId === null || line.purchaseOrderLineId === ''
        ? null
        : typeof line.purchaseOrderLineId === 'string' && line.purchaseOrderLineId.trim()
          ? line.purchaseOrderLineId.trim()
          : null;
      if (line.purchaseOrderLineId !== undefined
        && line.purchaseOrderLineId !== null
        && line.purchaseOrderLineId !== ''
        && !purchaseOrderLineId) {
        throw new PurchaseRequestError(`La ligne de commande liée à la ligne ${index + 1} est invalide.`, 400);
      }
      let quantity: number;
      try {
        quantity = validateStockQuantity(line.quantity, `La quantité de la ligne ${index + 1}`);
      } catch {
        throw new PurchaseRequestError(`La quantité de la ligne ${index + 1} doit être positive et limitée à trois décimales.`, 400);
      }
      if (typeof line.unitPrice !== 'number' || toMillimes(line.unitPrice) === null || line.unitPrice <= 0) {
        throw new PurchaseRequestError(`Le prix unitaire de la ligne ${index + 1} doit être positif et exprimable au millime.`, 400);
      }
      const unitPriceMillimes = toMillimes(line.unitPrice);
      const lineTotalMillimes = unitPriceMillimes === null ? null : Math.round(unitPriceMillimes * quantity);
      if (unitPriceMillimes === null || lineTotalMillimes === null || !Number.isSafeInteger(lineTotalMillimes)) {
        throw new PurchaseRequestError(`Le montant de la ligne ${index + 1} dépasse la précision prise en charge.`, 400);
      }
      totalMillimes += lineTotalMillimes;
      if (!Number.isSafeInteger(totalMillimes)) {
        throw new PurchaseRequestError('Le total des lignes dépasse la précision prise en charge.', 400);
      }
      return {
        description,
        materialId,
        ...(purchaseOrderLineId ? { purchaseOrderLineId } : {}),
        quantity,
        unitPrice: line.unitPrice,
      };
    });
    if (totalMillimes !== toMillimes(data.subTotal)) {
      throw new PurchaseRequestError('Le total HT doit être égal à la somme exacte des lignes.', 422);
    }
  }
  return {
    invoiceNumber,
    vendorId,
    issueDate: data.issueDate,
    dueDate: data.dueDate,
    subTotal: data.subTotal,
    taxRateId,
    lines,
    documentCurrencyCode: data.documentCurrencyCode,
    exchangeRate: data.exchangeRate,
    exchangeRateDate: data.exchangeRateDate,
    exchangeRateSource: data.exchangeRateSource,
    exchangeRateImportedAt: data.exchangeRateImportedAt,
  };
}

export function calculatePurchaseInvoiceAmounts(subTotal: number, rate: number) {
  const subTotalMillimes = toMillimes(subTotal);
  if (
    subTotalMillimes === null
    || !Number.isFinite(rate)
    || rate < 0
    || rate > 100
  ) {
    throw new PurchaseRequestError('Le montant HT ou le taux pays configuré est invalide.', 422);
  }
  const taxMillimes = Math.round(subTotalMillimes * rate / 100);
  const totalMillimes = subTotalMillimes + taxMillimes;
  if (!Number.isSafeInteger(taxMillimes) || !Number.isSafeInteger(totalMillimes)) {
    throw new PurchaseRequestError('Le montant de la facture dépasse la précision prise en charge.', 422);
  }
  return {
    subTotal: subTotalMillimes / 1000,
    taxAmount: taxMillimes / 1000,
    totalAmount: totalMillimes / 1000,
  };
}
