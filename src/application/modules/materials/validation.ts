export interface MaterialInput {
  sku: string;
  name: string;
  quantity?: number;
  unitPrice: number;
  costPrice?: number;
  barcode?: string | null;
  unitCode?: MaterialUnitCode;
  minimumStock?: number | null;
  initialStockReason?: string;
  entityId: string;
}

import { MAX_STOCK_QUANTITY, validateStockQuantity } from './quantity';
export { MAX_STOCK_QUANTITY };

const MAX_BARCODE_LENGTH = 128;
export const MATERIAL_UNIT_OPTIONS = [
  { code: 'EA', label: 'Unité' },
  { code: 'KG', label: 'Kilogramme (kg)' },
  { code: 'G', label: 'Gramme (g)' },
  { code: 'L', label: 'Litre (L)' },
  { code: 'ML', label: 'Millilitre (mL)' },
  { code: 'M', label: 'Mètre (m)' },
  { code: 'M2', label: 'Mètre carré (m²)' },
  { code: 'M3', label: 'Mètre cube (m³)' },
  { code: 'BOX', label: 'Boîte' },
  { code: 'PACK', label: 'Paquet' },
] as const;

export type MaterialUnitCode = typeof MATERIAL_UNIT_OPTIONS[number]['code'];

function requireNonNegativeFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} doit être un nombre positif ou nul`);
  }
  return value;
}

function requireStockQuantity(value: unknown, unitCode: MaterialUnitCode): number {
  return validateStockQuantity(value, 'Le stock initial', { allowZero: true, unitCode });
}

export function validateMaterialUnitCode(value: unknown): MaterialUnitCode {
  if (typeof value !== 'string') throw new Error('L’unité de mesure est invalide');
  const normalized = value.trim().toUpperCase();
  const option = MATERIAL_UNIT_OPTIONS.find(({ code }) => code === normalized);
  if (!option) throw new Error('Choisissez une unité de mesure proposée');
  return option.code;
}

export function validateBarcode(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.trim().length > MAX_BARCODE_LENGTH) {
    throw new Error('Le code-barres doit contenir au maximum 128 caractères');
  }
  return value.trim() || null;
}

export function validateMinimumStock(value: unknown, unitCode = 'EA'): number | null {
  if (value === null) return null;
  return validateStockQuantity(value, 'Le seuil de réapprovisionnement', { allowZero: true, unitCode });
}

export function validateStockAdjustmentReason(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 5 || value.trim().length > 500) {
    throw new Error('Le motif de l’ajustement doit contenir entre 5 et 500 caractères');
  }
  return value.trim();
}

export function validateMaterialInput(data: unknown, entityId: string): MaterialInput {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Données article invalides');
  }
  const input = data as Record<string, unknown>;
  if (typeof input.sku !== 'string' || !input.sku.trim() || typeof input.name !== 'string' || !input.name.trim()) {
    throw new Error('Le code article et le nom sont obligatoires');
  }
  const unitPrice = requireNonNegativeFiniteNumber(input.unitPrice, 'Le prix de vente');
  const costPrice = input.costPrice === undefined
    ? undefined
    : requireNonNegativeFiniteNumber(input.costPrice, 'Le prix de revient');
  const unitCode = input.unitCode === undefined ? 'EA' : validateMaterialUnitCode(input.unitCode);
  const quantity = input.quantity === undefined ? undefined : requireStockQuantity(input.quantity, unitCode);
  const barcode = input.barcode === undefined ? undefined : validateBarcode(input.barcode);
  const minimumStock = input.minimumStock === undefined ? undefined : validateMinimumStock(input.minimumStock, unitCode);
  const initialStockReason = quantity && quantity > 0
    ? validateStockAdjustmentReason(input.initialStockReason)
    : undefined;

  const material: MaterialInput = {
    sku: input.sku.trim(),
    name: input.name.trim(),
    unitPrice,
    unitCode,
    entityId,
  };
  if (quantity !== undefined) material.quantity = quantity;
  if (costPrice !== undefined) material.costPrice = costPrice;
  if (barcode !== undefined) material.barcode = barcode;
  if (minimumStock !== undefined) material.minimumStock = minimumStock;
  if (initialStockReason !== undefined) material.initialStockReason = initialStockReason;
  return material;
}

export function validateStockDelta(delta: unknown, unitCode?: string): number {
  if (typeof delta !== 'number' || delta === 0) {
    throw new Error('La variation de stock doit être un nombre non nul valide');
  }
  const quantity = validateStockQuantity(Math.abs(delta), 'La variation de stock', { unitCode });
  return Math.sign(delta) * quantity;
}

export function buildStockAdjustmentWhere(id: string, entityId: string, deltaQuantity: number) {
  return {
    id,
    entityId,
    quantity: deltaQuantity < 0
      ? { gte: Math.abs(deltaQuantity) }
      : { lte: MAX_STOCK_QUANTITY - deltaQuantity },
  };
}
