import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { summarizeVehicleMaintenanceCost } from './cost-summary';

describe('vehicle maintenance cost summary', () => {
  it('computes recorded maintenance cost per km after the baseline reading', () => {
    const summary = summarizeVehicleMaintenanceCost([
      {
        status: 'COMPLETED',
        completedAt: '2026-01-01T00:00:00.000Z',
        actualCost: 100,
        actualCostCurrencyCode: 'TND',
        completionOdometerKm: 10000,
      },
      {
        status: 'COMPLETED',
        completedAt: '2026-02-01T00:00:00.000Z',
        actualCost: 250,
        actualCostCurrencyCode: 'TND',
        completionOdometerKm: 12500,
      },
      {
        status: 'PLANNED',
        completedAt: null,
        actualCost: null,
        actualCostCurrencyCode: null,
        completionOdometerKm: null,
      },
    ]);

    assert.deepEqual(summary, {
      ratePerKm: 0.1,
      distanceKm: 2500,
      currencyCode: 'TND',
      recordedOrderCount: 2,
      completedOrderCount: 2,
    });
  });

  it('does not estimate a rate when completed records are incomplete or distance is zero', () => {
    const incomplete = summarizeVehicleMaintenanceCost([
      {
        status: 'COMPLETED',
        completedAt: '2026-01-01T00:00:00.000Z',
        actualCost: 100,
        actualCostCurrencyCode: 'TND',
        completionOdometerKm: 10000,
      },
      {
        status: 'COMPLETED',
        completedAt: '2026-02-01T00:00:00.000Z',
        actualCost: null,
        actualCostCurrencyCode: null,
        completionOdometerKm: null,
      },
    ]);
    assert.equal(incomplete.ratePerKm, null);
    assert.equal(incomplete.recordedOrderCount, 1);
    assert.equal(incomplete.completedOrderCount, 2);

    const zeroDistance = summarizeVehicleMaintenanceCost([
      {
        status: 'COMPLETED',
        completedAt: '2026-01-01T00:00:00.000Z',
        actualCost: 100,
        actualCostCurrencyCode: 'TND',
        completionOdometerKm: 10000,
      },
      {
        status: 'COMPLETED',
        completedAt: '2026-02-01T00:00:00.000Z',
        actualCost: 150,
        actualCostCurrencyCode: 'TND',
        completionOdometerKm: 10000,
      },
    ]);
    assert.equal(zeroDistance.ratePerKm, null);
    assert.equal(zeroDistance.distanceKm, null);
  });
});
