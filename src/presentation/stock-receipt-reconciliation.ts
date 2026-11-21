export interface ReceiptReconciliationInvoice {
  id: string;
  subTotal: number;
}

export interface ReceiptReconciliationRecord {
  quantity: number;
  unitCost: number;
  purchaseInvoice: { id: string } | null;
}

export interface ReceiptInvoiceBalance {
  matchedAmount: number;
  remainingAmount: number;
  overMatched: boolean;
}

function toMillimes(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const millimes = Math.round(value * 1000);
  return Number.isSafeInteger(millimes) && Math.abs(value * 1000 - millimes) <= 1e-7
    ? millimes
    : null;
}

export function calculateReceiptInvoiceBalances(
  invoices: readonly ReceiptReconciliationInvoice[],
  receipts: readonly ReceiptReconciliationRecord[],
): Map<string, ReceiptInvoiceBalance | null> {
  const totals = new Map<string, { subtotalMillimes: number; receivedMillimes: number } | null>();
  for (const invoice of invoices) {
    const subtotalMillimes = toMillimes(invoice.subTotal);
    totals.set(invoice.id, subtotalMillimes === null
      ? null
      : { subtotalMillimes, receivedMillimes: 0 });
  }

  for (const receipt of receipts) {
    const invoiceId = receipt.purchaseInvoice?.id;
    if (!invoiceId || !totals.has(invoiceId)) continue;
    const total = totals.get(invoiceId);
    if (!total) continue;

    const receiptQuantityMilliUnits = toStockQuantityMilliUnits(receipt.quantity);
    const receiptValue = Math.round(receipt.quantity * receipt.unitCost * 1000);
    if (receiptQuantityMilliUnits === null || receiptQuantityMilliUnits <= 0
      || !Number.isSafeInteger(receiptValue)
      || !Number.isSafeInteger(total.receivedMillimes + receiptValue)) {
      totals.set(invoiceId, null);
      continue;
    }
    total.receivedMillimes += receiptValue;
  }

  return new Map([...totals].map(([invoiceId, total]) => {
    if (!total) return [invoiceId, null];
    const remainingMillimes = total.subtotalMillimes - total.receivedMillimes;
    return [invoiceId, {
      matchedAmount: total.receivedMillimes / 1000,
      remainingAmount: remainingMillimes / 1000,
      overMatched: remainingMillimes < 0,
    }];
  }));
}
import { toStockQuantityMilliUnits } from '../application/modules/materials/quantity';
