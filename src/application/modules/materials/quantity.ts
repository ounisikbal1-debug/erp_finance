export const MAX_STOCK_QUANTITY = 2_147_483_647;
export const STOCK_QUANTITY_SCALE = 1000;

const DISCRETE_UNIT_CODES = new Set(['EA', 'BOX', 'PACK']);

export function toStockQuantityMilliUnits(quantity: number): number | null {
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > MAX_STOCK_QUANTITY) return null;
  const milliUnits = Math.round(quantity * STOCK_QUANTITY_SCALE);
  if (!Number.isSafeInteger(milliUnits)
    || Math.abs(quantity * STOCK_QUANTITY_SCALE - milliUnits) > 1e-7) return null;
  return milliUnits;
}

export function validateStockQuantity(
  value: unknown,
  label: string,
  options: { allowZero?: boolean; unitCode?: string } = {},
): number {
  const allowZero = options.allowZero ?? false;
  const milliUnits = typeof value === 'number' ? toStockQuantityMilliUnits(value) : null;
  if (milliUnits === null || (!allowZero && milliUnits === 0)) {
    throw new Error(`${label} doit être ${allowZero ? 'positif ou nul' : 'strictement positif'} avec au plus trois décimales`);
  }
  if (options.unitCode && DISCRETE_UNIT_CODES.has(options.unitCode.toUpperCase()) && milliUnits % STOCK_QUANTITY_SCALE !== 0) {
    throw new Error(`${label} doit être un nombre entier pour l’unité ${options.unitCode.toUpperCase()}`);
  }
  return milliUnits / STOCK_QUANTITY_SCALE;
}
