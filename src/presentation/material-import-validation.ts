import { toStockQuantityMilliUnits } from '../application/modules/materials/quantity';

const MATERIAL_UNIT_CODES = new Set(['EA', 'KG', 'G', 'L', 'ML', 'M', 'M2', 'M3', 'BOX', 'PACK']);

export function validateMaterialImportRow(
  row: Record<string, unknown>,
  rowIndex: number,
  allRows: Array<Record<string, unknown>>,
  existingSkus: string[],
): string | null {
  const line = rowIndex + 2;
  const sku = String(row.sku ?? '').trim();
  const name = String(row.name ?? '').trim();
  if (!sku || !name) return `Ligne ${line} : la référence et la désignation sont obligatoires.`;

  const normalizedSku = sku.toLocaleUpperCase();
  if (existingSkus.some((existing) => existing.trim().toLocaleUpperCase() === normalizedSku)
    || allRows.slice(0, rowIndex).some((previous) => (
      String(previous.sku ?? '').trim().toLocaleUpperCase() === normalizedSku
    ))) {
    return `Ligne ${line} : la référence ${sku} existe déjà ou apparaît plusieurs fois dans le fichier.`;
  }

  const unitCode = String(row.unitCode ?? 'EA').trim().toUpperCase() || 'EA';
  if (!MATERIAL_UNIT_CODES.has(unitCode)) {
    return `Ligne ${line} : unitCode doit être l’une des unités prises en charge (EA, KG, G, L, ML, M, M2, M3, BOX, PACK).`;
  }

  const unitPriceText = String(row.unitPrice ?? '').trim();
  const costPriceText = String(row.costPrice ?? '').trim();
  const unitPrice = Number(unitPriceText);
  const costPrice = Number(costPriceText);
  if (!unitPriceText || !costPriceText || !Number.isFinite(unitPrice) || unitPrice < 0
    || !Number.isFinite(costPrice) || costPrice < 0) {
    return `Ligne ${line} : unitPrice et costPrice doivent être explicitement renseignés en montants positifs ou nuls.`;
  }

  const barcode = String(row.barcode ?? '').trim();
  if (barcode.length > 128) return `Ligne ${line} : barcode ne peut pas dépasser 128 caractères.`;

  const minimumStockText = String(row.minimumStock ?? '').trim();
  if (minimumStockText) {
    const minimumStock = Number(minimumStockText);
    const milliUnits = toStockQuantityMilliUnits(minimumStock);
    if (milliUnits === null || (['EA', 'BOX', 'PACK'].includes(unitCode) && milliUnits % 1000 !== 0)) {
      return `Ligne ${line} : minimumStock doit être positif ou nul, limité à trois décimales et compatible avec unitCode.`;
    }
  }
  return null;
}
