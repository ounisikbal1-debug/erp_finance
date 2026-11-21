import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCostCenterFilter, buildCostCenterJournalFilter } from './filters';
import { calculateCostCenterAnalytics } from './analytics';

describe('controlling entity filters', () => {
  it('scopes cost centers and posted journal lines to the same entity', () => {
    assert.deepEqual(buildCostCenterFilter('entity-1'), { entityId: 'entity-1' });
    assert.deepEqual(buildCostCenterJournalFilter('entity-1'), {
      costCenterCode: { not: null },
      journalEntry: { entityId: 'entity-1', status: 'POSTED' },
    });
  });

  it('filters controlling journal lines to one UTC calendar month when requested', () => {
    assert.deepEqual(buildCostCenterJournalFilter('entity-1', {
      startAt: new Date('2026-02-01T00:00:00.000Z'),
      endExclusive: new Date('2026-03-01T00:00:00.000Z'),
    }), {
      costCenterCode: { not: null },
      journalEntry: {
        entityId: 'entity-1',
        status: 'POSTED',
        date: {
          gte: new Date('2026-02-01T00:00:00.000Z'),
          lt: new Date('2026-03-01T00:00:00.000Z'),
        },
      },
    });
  });

  describe('cost center analytics', () => {
    it('classifies posted amounts using the country chart account types', () => {
      const result = calculateCostCenterAnalytics(
        [{ code: 'CC-1', name: 'Production' }],
        [
          { costCenterCode: 'CC-1', accountCode: 'EXP.01', debit: 100, credit: 5 },
          { costCenterCode: 'CC-1', accountCode: 'REV.01', debit: 2, credit: 30 },
          { costCenterCode: 'CC-1', accountCode: 'ASSET.01', debit: 12, credit: 0 },
        ],
        [
          { code: 'EXP.01', type: 'Expense' },
          { code: 'REV.01', type: 'Revenue' },
          { code: 'ASSET.01', type: 'Asset' },
        ],
      );
      assert.deepEqual(result, [{
        code: 'CC-1',
        name: 'Production',
        totalExpenses: 95,
        totalRevenues: 28,
        netBalance: -67,
        unmappedAccountCodes: [],
      }]);
    });

    it('reports account codes missing from the entity country chart without counting them', () => {
      const result = calculateCostCenterAnalytics(
        [{ code: 'CC-1' }],
        [{ costCenterCode: 'CC-1', accountCode: 'UNKNOWN', debit: 9, credit: 0 }],
        [],
      );
      assert.equal(result[0].totalExpenses, 0);
      assert.deepEqual(result[0].unmappedAccountCodes, ['UNKNOWN']);
    });
  });
});
