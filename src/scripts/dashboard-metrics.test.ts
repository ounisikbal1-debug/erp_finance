import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateInvoiceDashboardMetrics } from './dashboard-metrics';

describe('calculateInvoiceDashboardMetrics', () => {
  it('uses invoice totals and excludes drafts from recognized revenue', () => {
    assert.deepEqual(calculateInvoiceDashboardMetrics([
      { status: 'DRAFT', totalAmount: 100 },
      { status: 'ISSUED', totalAmount: 50 },
      { status: 'PAID', totalAmount: 25 },
    ]), { totalCA: 75, anomalousInvoices: 0 });
  });

  it('reports negative invoice totals as anomalous', () => {
    assert.deepEqual(calculateInvoiceDashboardMetrics([
      { status: 'DRAFT', totalAmount: -1 },
      { status: 'ISSUED', totalAmount: 10 },
    ]), { totalCA: 10, anomalousInvoices: 1 });
  });
});
