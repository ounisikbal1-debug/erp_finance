import { PurchaseRequestError } from './errors';
import { validateStockQuantity } from '../materials/quantity';

export interface PurchaseOrderInput {
  orderNumber: string;
  vendorId: string;
  currencyCode: string;
  expectedAt: string | null;
  description: string | null;
  lines: Array<{
    description: string;
    materialId: string | null;
    quantity: number;
    unitPrice: number;
  }>;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function toMillimes(value: number): number | null {
  const millimes = Math.round(value * 1000);
  return Number.isFinite(value) && value > 0
    && Number.isSafeInteger(millimes)
    && Math.abs(value * 1000 - millimes) <= 1e-7
    ? millimes
    : null;
}

export function validatePurchaseOrderInput(value: unknown): PurchaseOrderInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PurchaseRequestError('Les données de la commande fournisseur sont invalides.', 400);
  }
  const input = value as Record<string, unknown>;
  const orderNumber = typeof input.orderNumber === 'string' ? input.orderNumber.trim() : '';
  const vendorId = typeof input.vendorId === 'string' ? input.vendorId.trim() : '';
  const currencyCode = typeof input.currencyCode === 'string' ? input.currencyCode.trim().toUpperCase() : '';
  const expectedAt = input.expectedAt === undefined || input.expectedAt === null || input.expectedAt === ''
    ? null
    : input.expectedAt;
  const description = input.description === undefined || input.description === null || input.description === ''
    ? null
    : input.description;
  if (!orderNumber || orderNumber.length > 80 || !vendorId || !/^[A-Z]{3}$/.test(currencyCode)) {
    throw new PurchaseRequestError('Le numéro, le fournisseur et la devise ISO à trois lettres sont obligatoires.', 400);
  }
  if (expectedAt !== null && !isCalendarDate(expectedAt)) {
    throw new PurchaseRequestError('La date prévue doit être valide au format AAAA-MM-JJ.', 400);
  }
  if (description !== null && (typeof description !== 'string' || description.trim().length > 500)) {
    throw new PurchaseRequestError('La description doit contenir au plus 500 caractères.', 400);
  }
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 200) {
    throw new PurchaseRequestError('Une commande doit contenir de 1 à 200 lignes.', 400);
  }
  let totalMillimes = 0;
  const lines = input.lines.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new PurchaseRequestError(`La ligne ${index + 1} de commande est invalide.`, 400);
    }
    const line = value as Record<string, unknown>;
    const lineDescription = typeof line.description === 'string' ? line.description.trim() : '';
    const materialId = line.materialId === undefined || line.materialId === null || line.materialId === ''
      ? null
      : typeof line.materialId === 'string' && line.materialId.trim()
        ? line.materialId.trim()
        : null;
    if (!lineDescription || lineDescription.length > 200) {
      throw new PurchaseRequestError(`La désignation de la ligne ${index + 1} est obligatoire (200 caractères maximum).`, 400);
    }
    if (line.materialId !== undefined && line.materialId !== null && line.materialId !== '' && !materialId) {
      throw new PurchaseRequestError(`L’article lié à la ligne ${index + 1} est invalide.`, 400);
    }
    let quantity: number;
    try {
      quantity = validateStockQuantity(line.quantity, `La quantité de la ligne ${index + 1}`);
    } catch {
      throw new PurchaseRequestError(`La quantité de la ligne ${index + 1} doit être positive et limitée à trois décimales.`, 400);
    }
    const unitPriceMillimes = typeof line.unitPrice === 'number' ? toMillimes(line.unitPrice) : null;
    const lineTotalMillimes = unitPriceMillimes === null ? null : Math.round(unitPriceMillimes * quantity);
    if (unitPriceMillimes === null || lineTotalMillimes === null || !Number.isSafeInteger(lineTotalMillimes)) {
      throw new PurchaseRequestError(`Le prix unitaire de la ligne ${index + 1} doit être positif et exprimable au millime.`, 400);
    }
    totalMillimes += lineTotalMillimes;
    if (!Number.isSafeInteger(totalMillimes)) {
      throw new PurchaseRequestError('Le total de la commande dépasse la précision prise en charge.', 400);
    }
    return { description: lineDescription, materialId, quantity, unitPrice: line.unitPrice as number };
  });
  return {
    orderNumber,
    vendorId,
    currencyCode,
    expectedAt: expectedAt as string | null,
    description: typeof description === 'string' ? description.trim() || null : null,
    lines,
  };
}

export function validatePurchaseOrderNote(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 5 || value.trim().length > 500) {
    throw new PurchaseRequestError('Une note de contrôle de 5 à 500 caractères est obligatoire.', 400);
  }
  return value.trim();
}
