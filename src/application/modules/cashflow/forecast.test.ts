import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCashForecast, parseForecastDate, validateForecastHorizon } from './forecast';
import { CashflowRequestError } from './errors';

describe('cash forecast projection', () => {
  it('projects only dated planned and confirmed items in the configured currency and horizon', () => {
    const report = buildCashForecast({
      asOfDate: new Date('2026-03-01T00:00:00.000Z'),
      openingBalance: 1000,
      openingBalanceSource: 'MANUAL',
      currencyCode: 'TND',
      horizonDays: 3,
      items: [
        { id: 'in', expectedDate: '2026-03-02T00:00:00.000Z', description: 'Encaissement prévu', direction: 'INFLOW', amount: 125.375, category: 'Client', status: 'PLANNED' },
        { id: 'out', expectedDate: '2026-03-03T00:00:00.000Z', description: 'Paiement prévu', direction: 'OUTFLOW', amount: 20.25, category: 'Fournisseur', status: 'PLANNED' },
        { id: 'outside', expectedDate: '2026-03-05T00:00:00.000Z', description: 'Hors horizon', direction: 'INFLOW', amount: 1, category: 'Autre', status: 'PLANNED' },
      ],
    });
    assert.equal(report.openingBalance, 1000);
    assert.equal(report.openingBalanceSource, 'MANUAL');
    assert.deepEqual(report.days, [
      { date: '2026-03-02', inflows: 125.375, outflows: 0, closingBalance: 1125.375 },
      { date: '2026-03-03', inflows: 0, outflows: 20.25, closingBalance: 1105.125 },
      { date: '2026-03-04', inflows: 0, outflows: 0, closingBalance: 1105.125 },
    ]);
    assert.deepEqual(report.items.map((item) => item.id), ['in', 'out']);
    assert.equal(report.diagnostics.totalsAvailable, true);
  });

  it('does not present manually submitted flows as confirmed', () => {
    const report = buildCashForecast({
      asOfDate: new Date('2026-03-01T00:00:00.000Z'),
      openingBalance: 100,
      openingBalanceSource: 'MANUAL',
      currencyCode: 'TND',
      horizonDays: 1,
      items: [
        { id: 'confirmed', expectedDate: '2026-03-02T00:00:00.000Z', description: 'Paiement', direction: 'OUTFLOW', amount: 10, category: 'Fournisseur', status: 'CONFIRMED' },
      ],
    });
    assert.equal(report.diagnostics.invalidItemCount, 1);
    assert.equal(report.diagnostics.totalsAvailable, false);
  });

  it('does not fabricate a projection without a known starting balance', () => {
    const report = buildCashForecast({
      asOfDate: null,
      openingBalance: null,
      openingBalanceSource: null,
      currencyCode: 'EUR',
      horizonDays: 1,
      items: [],
    });
    assert.equal(report.openingBalance, null);
    assert.deepEqual(report.days, []);
    assert.equal(report.diagnostics.hasOpeningBalance, false);
  });

  it('validates horizon and calendar dates', () => {
    assert.equal(validateForecastHorizon(undefined), 30);
    assert.equal(validateForecastHorizon('90'), 90);
    assert.throws(() => validateForecastHorizon('0'), CashflowRequestError);
    assert.throws(() => validateForecastHorizon(366), CashflowRequestError);
    assert.throws(() => parseForecastDate('2026-02-30'), CashflowRequestError);
    assert.equal(parseForecastDate('2026-03-04').toISOString(), '2026-03-04T00:00:00.000Z');
  });
});
