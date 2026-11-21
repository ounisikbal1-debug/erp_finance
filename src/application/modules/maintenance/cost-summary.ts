export interface VehicleMaintenanceCostRecord {
  status: string;
  completedAt: Date | string | null;
  actualCost: number | null;
  actualCostCurrencyCode: string | null;
  completionOdometerKm: number | null;
}

export interface VehicleMaintenanceCostSummary {
  ratePerKm: number | null;
  distanceKm: number | null;
  currencyCode: string | null;
  recordedOrderCount: number;
  completedOrderCount: number;
}

export function summarizeVehicleMaintenanceCost(
  workOrders: readonly VehicleMaintenanceCostRecord[],
): VehicleMaintenanceCostSummary {
  const completed = workOrders.filter((order) => order.status === 'COMPLETED');
  const recorded = completed
    .filter((order) => order.completedAt !== null
      && order.actualCost !== null
      && order.completionOdometerKm !== null
      && Number.isFinite(order.actualCost)
      && order.actualCost >= 0
      && Number.isSafeInteger(order.completionOdometerKm))
    .slice()
    .sort((left, right) => new Date(left.completedAt!).getTime() - new Date(right.completedAt!).getTime());
  const currencies = new Set(recorded.map((order) => order.actualCostCurrencyCode).filter(
    (code): code is string => code !== null,
  ));
  const allCurrencyCodesPresent = recorded.every((order) => order.actualCostCurrencyCode !== null);
  const sameCurrency = currencies.size === 1 && allCurrencyCodesPresent;

  if (recorded.length !== completed.length || recorded.length < 2 || !sameCurrency) {
    return {
      ratePerKm: null,
      distanceKm: null,
      currencyCode: sameCurrency ? [...currencies][0] ?? null : null,
      recordedOrderCount: recorded.length,
      completedOrderCount: completed.length,
    };
  }

  const firstOdometer = recorded[0].completionOdometerKm!;
  const lastOdometer = recorded[recorded.length - 1].completionOdometerKm!;
  const distanceKm = lastOdometer - firstOdometer;
  if (distanceKm <= 0) {
    return {
      ratePerKm: null,
      distanceKm: null,
      currencyCode: [...currencies][0],
      recordedOrderCount: recorded.length,
      completedOrderCount: completed.length,
    };
  }

  const costAfterBaseline = recorded.slice(1).reduce((total, order) => total + order.actualCost!, 0);
  return {
    ratePerKm: Math.round((costAfterBaseline / distanceKm) * 1000) / 1000,
    distanceKm,
    currencyCode: [...currencies][0],
    recordedOrderCount: recorded.length,
    completedOrderCount: completed.length,
  };
}
