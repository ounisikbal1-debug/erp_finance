import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAnomalyFilters } from './filters';

describe('anomaly entity and period filters', () => {
  it('scopes every source to the authenticated entity and limits the review window', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-11-01T12:00:00.000Z');
    const filters = buildAnomalyFilters('entity-1', from, to, '2026-01', '2026-11');
    assert.deepEqual(filters.journalEntries, {
      entityId: 'entity-1',
      status: 'POSTED',
      date: { gte: from, lte: to },
    });
    assert.deepEqual(filters.invoices, {
      entityId: 'entity-1',
      status: { in: ['ISSUED', 'PAID'] },
      createdAt: { gte: from, lte: to },
    });
    assert.deepEqual(filters.payslips, {
      employee: { entityId: 'entity-1' },
      period: { gte: '2026-01', lte: '2026-11' },
    });
  });
});
