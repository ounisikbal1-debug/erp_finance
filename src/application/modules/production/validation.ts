import { validateStockQuantity } from '../materials/quantity';

export interface ProductionOrderInput {
  orderNumber: string;
  description?: string;
  outputMaterialId: string;
  warehouseId: string;
  outputQuantity: number;
  laborCost: number;
  overheadCost: number;
  scrapQuantity: number;
  scrapReason?: string;
  consumptions: Array<{ materialId: string; quantity: number; warehouseId?: string }>;
}

function requireQuantity(value: unknown, label: string): number {
  return validateStockQuantity(value, label);
}

function requireCost(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0
    || !Number.isSafeInteger(Math.round(value * 1000))
    || Math.abs(value * 1000 - Math.round(value * 1000)) > 1e-7) {
    throw new Error(`${label} doit être un montant positif ou nul, au millime près`);
  }
  return value;
}

export function validateProductionOrderInput(value: unknown): ProductionOrderInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Données d’ordre de fabrication invalides');
  }

  const input = value as Record<string, unknown>;
  if (typeof input.orderNumber !== 'string' || !input.orderNumber.trim() || input.orderNumber.trim().length > 50) {
    throw new Error('Le numéro d’ordre de fabrication est obligatoire (50 caractères maximum)');
  }
  if (typeof input.outputMaterialId !== 'string' || !input.outputMaterialId.trim()) {
    throw new Error('L’article produit est obligatoire');
  }
  if (typeof input.warehouseId !== 'string' || !input.warehouseId.trim()) {
    throw new Error('Le dépôt de production est obligatoire');
  }
  if (!Array.isArray(input.consumptions) || input.consumptions.length === 0) {
    throw new Error('Au moins une matière consommée est obligatoire');
  }
  const seenMaterialIds = new Set<string>();
  const consumptions = input.consumptions.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Ligne de consommation invalide');
    }
    const line = item as Record<string, unknown>;
    if (typeof line.materialId !== 'string' || !line.materialId.trim()) {
      throw new Error('La matière consommée est obligatoire');
    }
    if (line.materialId === input.outputMaterialId) {
      throw new Error('L’article produit ne peut pas être consommé dans le même ordre');
    }
    const warehouseId = line.warehouseId === undefined
      ? undefined
      : typeof line.warehouseId === 'string' && line.warehouseId.trim()
        ? line.warehouseId.trim()
        : (() => { throw new Error('Le dépôt de consommation est invalide'); })();
    if (seenMaterialIds.has(line.materialId)) {
      throw new Error('Une matière ne peut apparaître qu’une seule fois dans un ordre');
    }
    seenMaterialIds.add(line.materialId);
    return {
      materialId: line.materialId,
      quantity: requireQuantity(line.quantity, 'La quantité consommée'),
      ...(warehouseId ? { warehouseId } : {}),
    };
  });

  if (input.description !== undefined && (typeof input.description !== 'string' || input.description.length > 500)) {
    throw new Error('La description doit contenir au plus 500 caractères');
  }

  const result: ProductionOrderInput = {
    orderNumber: input.orderNumber.trim(),
    outputMaterialId: input.outputMaterialId,
    warehouseId: input.warehouseId,
    outputQuantity: requireQuantity(input.outputQuantity, 'La quantité produite'),
    laborCost: input.laborCost === undefined ? 0 : requireCost(input.laborCost, 'Le coût de main-d’Å“uvre'),
    overheadCost: input.overheadCost === undefined ? 0 : requireCost(input.overheadCost, 'Les frais indirects'),
    scrapQuantity: input.scrapQuantity === undefined
      ? 0
      : validateStockQuantity(input.scrapQuantity, 'La quantité rebutée', { allowZero: true }),
    consumptions,
  };
  if (input.scrapReason !== undefined) {
    if (typeof input.scrapReason !== 'string' || input.scrapReason.trim().length > 500) {
      throw new Error('Le motif du rebut doit contenir au plus 500 caractères.');
    }
    if (result.scrapQuantity > 0 && input.scrapReason.trim().length < 5) {
      throw new Error('Un motif significatif est obligatoire pour la quantité rebutée.');
    }
    if (input.scrapReason.trim()) result.scrapReason = input.scrapReason.trim();
  } else if (result.scrapQuantity > 0) {
    throw new Error('Un motif significatif est obligatoire pour la quantité rebutée.');
  }
  if (typeof input.description === 'string' && input.description.trim()) {
    result.description = input.description.trim();
  }
  return result;
}

export { MAX_STOCK_QUANTITY as MAX_PRODUCTION_STOCK_QUANTITY } from '../materials/quantity';
