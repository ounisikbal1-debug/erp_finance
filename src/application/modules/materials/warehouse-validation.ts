import { validateStockAdjustmentReason } from './validation';
import { validateStockQuantity } from './quantity';

export interface WarehouseInput {
  code: string;
  name: string;
}

export interface StockTransferInput {
  materialId: string;
  sourceWarehouseId: string | null;
  destinationWarehouseId: string | null;
  quantity: number;
  reason: string;
  idempotencyKey: string;
}

export interface StockReceiptInput {
  materialId: string;
  purchaseOrderLineId: string | null;
  purchaseInvoiceId: string | null;
  purchaseInvoiceLineId: string | null;
  warehouseId: string;
  quantity: number;
  unitCost: number;
  reason: string;
  idempotencyKey: string;
}

export interface StockSupplierReturnInput {
  sourceReceiptId: string;
  quantity: number;
  reason: string;
  idempotencyKey: string;
}

export interface StockPickLineInput {
  materialId: string;
  warehouseId: string;
  quantity: number;
}

export interface StockPickInput {
  reference: string;
  reason: string;
  idempotencyKey: string;
  lines: StockPickLineInput[];
}

export interface StockDispatchInput {
  idempotencyKey: string;
}

function requiredText(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximumLength) {
    throw new Error(`${label} est obligatoire et limité à ${maximumLength} caractères`);
  }
  return value.trim();
}

export function validateWarehouseInput(value: unknown): WarehouseInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Données de dépôt invalides');
  }
  const input = value as Record<string, unknown>;
  return {
    code: requiredText(input.code, 'Le code du dépôt', 32),
    name: requiredText(input.name, 'Le nom du dépôt', 100),
  };
}

export function validateStockTransferInput(value: unknown): StockTransferInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Données de transfert invalides');
  }
  const input = value as Record<string, unknown>;
  const materialId = requiredText(input.materialId, 'L’article', 128);
  const destinationWarehouseId = input.destinationWarehouseId === undefined || input.destinationWarehouseId === null
    ? null
    : requiredText(input.destinationWarehouseId, 'Le dépôt de destination', 128);
  const sourceWarehouseId = input.sourceWarehouseId === undefined || input.sourceWarehouseId === null
    ? null
    : requiredText(input.sourceWarehouseId, 'Le dépôt source', 128);
  if (!sourceWarehouseId && !destinationWarehouseId) {
    throw new Error('Un dépôt source ou destination doit être sélectionné');
  }
  if (sourceWarehouseId && sourceWarehouseId === destinationWarehouseId) {
    throw new Error('Les dépôts source et destination doivent être différents');
  }
  const quantity = validateStockQuantity(input.quantity, 'La quantité transférée');
  return {
    materialId,
    sourceWarehouseId,
    destinationWarehouseId,
    quantity,
    reason: validateStockAdjustmentReason(input.reason),
    idempotencyKey: requiredText(input.idempotencyKey, 'La clé de transfert', 128),
  };
}

export function validateStockReceiptInput(value: unknown): StockReceiptInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Données de réception de stock invalides');
  }
  const input = value as Record<string, unknown>;
  const quantity = validateStockQuantity(input.quantity, 'La quantité reçue');
  if (typeof input.unitCost !== 'number' || !Number.isFinite(input.unitCost) || input.unitCost < 0) {
    throw new Error('Le coût unitaire reçu doit être un montant positif ou nul');
  }
  const purchaseOrderLineId = input.purchaseOrderLineId === undefined
    || input.purchaseOrderLineId === null || input.purchaseOrderLineId === ''
    ? null
    : requiredText(input.purchaseOrderLineId, 'La ligne de commande fournisseur', 128);
  const purchaseInvoiceId = input.purchaseInvoiceId === undefined
    || input.purchaseInvoiceId === null || input.purchaseInvoiceId === ''
    ? null
    : requiredText(input.purchaseInvoiceId, 'La facture fournisseur approuvée', 128);
  const purchaseInvoiceLineId = input.purchaseInvoiceLineId === undefined
    || input.purchaseInvoiceLineId === null || input.purchaseInvoiceLineId === ''
    ? null
    : requiredText(input.purchaseInvoiceLineId, 'La ligne de facture fournisseur', 128);
  if (!purchaseOrderLineId && !purchaseInvoiceId) {
    throw new Error('Une réception doit être rattachée à une commande ou une facture fournisseur');
  }
  if (!purchaseInvoiceId && purchaseInvoiceLineId) {
    throw new Error('Une ligne de facture ne peut pas être sélectionnée sans facture fournisseur');
  }
  return {
    materialId: requiredText(input.materialId, 'L’article', 128),
    purchaseOrderLineId,
    purchaseInvoiceId,
    purchaseInvoiceLineId,
    warehouseId: requiredText(input.warehouseId, 'Le dépôt de destination', 128),
    quantity,
    unitCost: input.unitCost,
    reason: validateStockAdjustmentReason(input.reason),
    idempotencyKey: requiredText(input.idempotencyKey, 'La clé de réception', 128),
  };
}

export function validateStockSupplierReturnInput(value: unknown): StockSupplierReturnInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Données de retour fournisseur invalides');
  }
  const input = value as Record<string, unknown>;
  const quantity = validateStockQuantity(input.quantity, 'La quantité retournée');
  return {
    sourceReceiptId: requiredText(input.sourceReceiptId, 'La réception d’origine', 128),
    quantity,
    reason: validateStockAdjustmentReason(input.reason),
    idempotencyKey: requiredText(input.idempotencyKey, 'La clé de retour', 128),
  };
}

export function matchesStockSupplierReturn(
  existing: StockSupplierReturnInput,
  requested: StockSupplierReturnInput,
): boolean {
  return existing.sourceReceiptId === requested.sourceReceiptId
    && existing.quantity === requested.quantity
    && existing.reason === requested.reason
    && existing.idempotencyKey === requested.idempotencyKey;
}

export function validateStockPickInput(value: unknown): StockPickInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Données de préparation d’expédition invalides');
  }
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 100) {
    throw new Error('Une préparation doit contenir de 1 à 100 lignes');
  }
  const lines = input.lines.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Une ligne de préparation est invalide');
    }
    const line = value as Record<string, unknown>;
    return {
      materialId: requiredText(line.materialId, 'L’article à préparer', 128),
      warehouseId: requiredText(line.warehouseId, 'Le dépôt de préparation', 128),
      quantity: validateStockQuantity(line.quantity, 'La quantité préparée'),
    };
  });
  const keys = lines.map((line) => `${line.materialId}\0${line.warehouseId}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error('Un même article et dépôt ne peuvent apparaître qu’une fois dans une préparation');
  }
  return {
    reference: requiredText(input.reference, 'La référence d’expédition', 100),
    reason: validateStockAdjustmentReason(input.reason),
    idempotencyKey: requiredText(input.idempotencyKey, 'La clé de préparation', 128),
    lines,
  };
}

export function validateStockDispatchInput(value: unknown): StockDispatchInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Données de confirmation d’expédition invalides');
  }
  const input = value as Record<string, unknown>;
  return { idempotencyKey: requiredText(input.idempotencyKey, 'La clé d’expédition', 128) };
}

export function matchesStockPick(
  existing: { reference: string; reason: string; idempotencyKey: string; lines: StockPickLineInput[] },
  requested: StockPickInput,
): boolean {
  return existing.reference === requested.reference
    && existing.reason === requested.reason
    && existing.idempotencyKey === requested.idempotencyKey
    && existing.lines.length === requested.lines.length
    && existing.lines.every((line, index) => line.materialId === requested.lines[index].materialId
      && line.warehouseId === requested.lines[index].warehouseId
      && line.quantity === requested.lines[index].quantity);
}

export function matchesStockReceipt(
  existing: Omit<StockReceiptInput, 'purchaseInvoiceId'> & { purchaseInvoiceId: string | null },
  requested: StockReceiptInput,
): boolean {
  const invoiceWasLinkedAfterReceipt = requested.purchaseInvoiceId === null
    && requested.purchaseInvoiceLineId === null
    && requested.purchaseOrderLineId !== null
    && existing.purchaseInvoiceId !== null
    && existing.purchaseInvoiceLineId !== null;
  return existing.materialId === requested.materialId
    && (existing.purchaseOrderLineId ?? null) === requested.purchaseOrderLineId
    && ((existing.purchaseInvoiceId ?? null) === requested.purchaseInvoiceId
      || invoiceWasLinkedAfterReceipt)
    && ((existing.purchaseInvoiceLineId ?? null) === requested.purchaseInvoiceLineId
      || invoiceWasLinkedAfterReceipt)
    && existing.warehouseId === requested.warehouseId
    && existing.quantity === requested.quantity
    && existing.unitCost === requested.unitCost
    && existing.reason === requested.reason
    && existing.idempotencyKey === requested.idempotencyKey;
}

export function matchesStockTransfer(
  existing: StockTransferInput,
  requested: StockTransferInput,
): boolean {
  return existing.materialId === requested.materialId
    && existing.sourceWarehouseId === requested.sourceWarehouseId
    && existing.destinationWarehouseId === requested.destinationWarehouseId
    && existing.quantity === requested.quantity
    && existing.reason === requested.reason
    && existing.idempotencyKey === requested.idempotencyKey;
}
