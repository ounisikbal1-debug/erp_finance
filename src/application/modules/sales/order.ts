import { SalesRequestError } from './errors';
import { validateStockQuantity } from '../materials/quantity';

export interface SalesOrderInput {
  customerId: string;
  idempotencyKey?: string;
  lines: Array<{
    materialId: string;
    quantity: number;
    unitPrice: number;
  }>;
}

function toMillimes(value: number): number | null {
  const millimes = Math.round(value * 1000);
  return Number.isFinite(value) && value >= 0
    && Number.isSafeInteger(millimes)
    && Math.abs(value * 1000 - millimes) <= 1e-7
    ? millimes
    : null;
}

export function validateSalesOrderInput(value: unknown): SalesOrderInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SalesRequestError('Les données de la commande client sont invalides.', 400);
  }
  const input = value as Record<string, unknown>;
  const customerId = typeof input.customerId === 'string' ? input.customerId.trim() : '';
  if (!customerId) throw new SalesRequestError('Le client est obligatoire pour la commande.', 400);
  const idempotencyKey = input.idempotencyKey;
  if (idempotencyKey !== undefined
    && (typeof idempotencyKey !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))) {
    throw new SalesRequestError('La clé d’idempotence de la commande est invalide.', 400);
  }
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100) {
    throw new SalesRequestError('Une commande client doit contenir de 1 à 100 lignes article.', 400);
  }

  let totalMillimes = 0;
  const lines = input.lines.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new SalesRequestError(`La ligne ${index + 1} de commande est invalide.`, 400);
    }
    const line = value as Record<string, unknown>;
    const materialId = typeof line.materialId === 'string' ? line.materialId.trim() : '';
    if (!materialId) throw new SalesRequestError(`L’article de la ligne ${index + 1} est obligatoire.`, 400);
    let quantity: number;
    try {
      quantity = validateStockQuantity(line.quantity, `La quantité de la ligne ${index + 1}`);
    } catch (error) {
      throw new SalesRequestError(error instanceof Error
        ? error.message
        : `La quantité de la ligne ${index + 1} est invalide.`, 400);
    }
    const unitPrice = typeof line.unitPrice === 'number' ? line.unitPrice : Number.NaN;
    const unitPriceMillimes = toMillimes(unitPrice);
    const lineTotalMillimes = unitPriceMillimes === null ? null : Math.round(unitPriceMillimes * quantity);
    if (lineTotalMillimes === null || !Number.isSafeInteger(lineTotalMillimes)) {
      throw new SalesRequestError(`Le prix unitaire de la ligne ${index + 1} doit être positif ou nul et exprimable au millime.`, 400);
    }
    totalMillimes += lineTotalMillimes;
    if (!Number.isSafeInteger(totalMillimes)) {
      throw new SalesRequestError('Le total de la commande dépasse la précision prise en charge.', 400);
    }
    return { materialId, quantity, unitPrice, totalAmount: lineTotalMillimes / 1000 };
  });

  return {
    customerId,
    ...(typeof idempotencyKey === 'string' ? { idempotencyKey } : {}),
    lines,
  };
}

export interface SalesOrderPickInput {
  lines: Array<{ salesOrderLineId: string; warehouseId: string }>;
}

export interface SalesOrderInvoiceInput {
  lines: Array<{ salesOrderLineId: string; taxRate: number }>;
}

export function validateSalesOrderInvoiceInput(value: unknown): SalesOrderInvoiceInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SalesRequestError('Les taux de TVA de la facture sont invalides.', 400);
  }
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100) {
    throw new SalesRequestError('Choisissez un taux de TVA pour chaque ligne de commande.', 400);
  }
  const lines = input.lines.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new SalesRequestError(`Le taux de TVA de la ligne ${index + 1} est invalide.`, 400);
    }
    const line = value as Record<string, unknown>;
    const salesOrderLineId = typeof line.salesOrderLineId === 'string' ? line.salesOrderLineId.trim() : '';
    const taxRate = typeof line.taxRate === 'number' ? line.taxRate : Number.NaN;
    if (!salesOrderLineId || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      throw new SalesRequestError(`Choisissez un taux de TVA configuré pour la ligne ${index + 1}.`, 400);
    }
    return { salesOrderLineId, taxRate };
  });
  if (new Set(lines.map(({ salesOrderLineId }) => salesOrderLineId)).size !== lines.length) {
    throw new SalesRequestError('Chaque ligne de commande doit apparaître une seule fois dans la facture.', 400);
  }
  return { lines };
}

export function validateSalesOrderPickInput(value: unknown): SalesOrderPickInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SalesRequestError('Les dépôts de préparation sont invalides.', 400);
  }
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100) {
    throw new SalesRequestError('Sélectionnez un dépôt pour chaque ligne article.', 400);
  }
  const lines = input.lines.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new SalesRequestError(`Le dépôt de la ligne ${index + 1} est invalide.`, 400);
    }
    const line = value as Record<string, unknown>;
    const salesOrderLineId = typeof line.salesOrderLineId === 'string' ? line.salesOrderLineId.trim() : '';
    const warehouseId = typeof line.warehouseId === 'string' ? line.warehouseId.trim() : '';
    if (!salesOrderLineId || !warehouseId) {
      throw new SalesRequestError(`Choisissez un dépôt pour la ligne ${index + 1}.`, 400);
    }
    return { salesOrderLineId, warehouseId };
  });
  if (new Set(lines.map(({ salesOrderLineId }) => salesOrderLineId)).size !== lines.length) {
    throw new SalesRequestError('Chaque ligne de commande doit apparaître une seule fois dans la préparation.', 400);
  }
  return { lines };
}
