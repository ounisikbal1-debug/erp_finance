export function calculateIndicativeUnitMargin(unitPrice: number, averageUnitCost: number): number | null {
  if (!Number.isFinite(unitPrice) || !Number.isFinite(averageUnitCost)) return null;
  const marginMillimes = Math.round((unitPrice - averageUnitCost) * 1000);
  return Number.isSafeInteger(marginMillimes) ? marginMillimes / 1000 : null;
}
