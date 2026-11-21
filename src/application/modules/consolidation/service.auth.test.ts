import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConsolidationRequestError } from './errors';
import ConsolidationService from './service';

describe('consolidation adjustment actors', () => {
  it('rejects adjustment creation without an auditable creator', async () => {
    await assert.rejects(
      ConsolidationService.createAdjustment({
        period: '2026-03',
        description: 'Synthetic adjustment',
        debitAccountCode: '2000',
        creditAccountCode: '1000',
        amount: 10,
      }, 'group-a', 'entity-a', ''),
      (error: unknown) => error instanceof ConsolidationRequestError && error.statusCode === 401,
    );
  });

  it('rejects approval without an actor before looking up the adjustment', async () => {
    await assert.rejects(
      ConsolidationService.approveAdjustment('adjustment-a', 'entity-a', '  '),
      (error: unknown) => error instanceof ConsolidationRequestError && error.statusCode === 401,
    );
  });
});
