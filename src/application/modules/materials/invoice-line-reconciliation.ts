import { STOCK_QUANTITY_SCALE, toStockQuantityMilliUnits } from './quantity';

export interface InvoiceLineReceiptInput {
  lineQuantity: number;
  lineUnitPrice: number;
  exchangeRate: number;
  receiptQuantity: number;
  receiptUnitCost: number;
  previousReceipts: Array<{ quantity: number; unitCost: number }>;
}

export interface InvoiceLineReceiptResult {
  accepted: boolean;
  receivedQuantity: number;
  receivedValueMillimes: number;
  expectedValueMillimes: number;
  error?: string;
}

function valueMillimes(quantity: number, unitCost: number): number | null {
  const quantityMilliUnits = toStockQuantityMilliUnits(quantity);
  if (quantityMilliUnits === null || quantityMilliUnits <= 0 || !Number.isFinite(unitCost) || unitCost < 0) return null;
  const unitCostMillimes = Math.round(unitCost * 1000);
  if (!Number.isSafeInteger(unitCostMillimes) || Math.abs(unitCost * 1000 - unitCostMillimes) > 1e-7) return null;
  const total = quantityMilliUnits * unitCostMillimes / STOCK_QUANTITY_SCALE;
  const totalMillimes = Math.round(total);
  return Number.isSafeInteger(totalMillimes) ? totalMillimes : null;
}

export function reconcileInvoiceLineReceipt(input: InvoiceLineReceiptInput): InvoiceLineReceiptResult {
  const initialQuantityMilliUnits = toStockQuantityMilliUnits(input.receiptQuantity);
  if (initialQuantityMilliUnits === null || initialQuantityMilliUnits <= 0) {
    return { accepted: false, receivedQuantity: input.receiptQuantity, receivedValueMillimes: 0, expectedValueMillimes: 0, error: 'Quantité reçue invalide.' };
  }
  let receivedQuantity = input.receiptQuantity;
  let receivedQuantityMilliUnits = initialQuantityMilliUnits;
  let receivedValueMillimes = valueMillimes(input.receiptQuantity, input.receiptUnitCost) ?? 0;
  for (const receipt of input.previousReceipts) {
    const value = valueMillimes(receipt.quantity, receipt.unitCost);
    if (value === null) {
      return { accepted: false, receivedQuantity, receivedValueMillimes, expectedValueMillimes: 0, error: 'Valeur de réception existante invalide.' };
    }
    receivedQuantity += receipt.quantity;
    receivedQuantityMilliUnits += toStockQuantityMilliUnits(receipt.quantity) ?? 0;
    receivedValueMillimes += value;
    if (!Number.isSafeInteger(receivedQuantityMilliUnits) || !Number.isSafeInteger(receivedValueMillimes)) {
      return { accepted: false, receivedQuantity, receivedValueMillimes, expectedValueMillimes: 0, error: 'Valeur rapprochée invalide.' };
    }
  }

  const lineQuantityMilliUnits = toStockQuantityMilliUnits(input.lineQuantity);
  const documentUnitPriceMillimes = Math.round(input.lineUnitPrice * 1000);
  const documentLineValueMillimes = lineQuantityMilliUnits === null
    ? Number.NaN
    : Math.round(documentUnitPriceMillimes * lineQuantityMilliUnits / STOCK_QUANTITY_SCALE);
  const expectedValueMillimes = Math.round(documentLineValueMillimes * input.exchangeRate);
  if (!Number.isSafeInteger(documentUnitPriceMillimes) || !Number.isSafeInteger(documentLineValueMillimes)
    || !Number.isSafeInteger(expectedValueMillimes) || lineQuantityMilliUnits === null || lineQuantityMilliUnits <= 0
    || !Number.isFinite(input.exchangeRate) || input.exchangeRate <= 0
    || Math.abs(input.lineUnitPrice * 1000 - documentUnitPriceMillimes) > 1e-7) {
    return { accepted: false, receivedQuantity, receivedValueMillimes, expectedValueMillimes: 0, error: 'Montant de ligne invalide.' };
  }

  receivedQuantity = receivedQuantityMilliUnits / STOCK_QUANTITY_SCALE;
  if (receivedQuantityMilliUnits > lineQuantityMilliUnits) {
    return {
      accepted: false, receivedQuantity, receivedValueMillimes, expectedValueMillimes,
      error: `La quantité reçue dépasserait la quantité facturée (${input.lineQuantity}).`,
    };
  }
  if (receivedValueMillimes > expectedValueMillimes) {
    return {
      accepted: false, receivedQuantity, receivedValueMillimes, expectedValueMillimes,
      error: 'La valeur reçue dépasserait le montant fonctionnel de la ligne facturée.',
    };
  }
  if (receivedQuantityMilliUnits === lineQuantityMilliUnits && receivedValueMillimes !== expectedValueMillimes) {
    return {
      accepted: false, receivedQuantity, receivedValueMillimes, expectedValueMillimes,
      error: `La ligne ne peut être soldée : valeur reçue ${receivedValueMillimes / 1000}, valeur facturée ${expectedValueMillimes / 1000}.`,
    };
  }
  return { accepted: true, receivedQuantity, receivedValueMillimes, expectedValueMillimes };
}
