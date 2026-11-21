import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FinanceRequestError } from './errors';
import { assertAccountingPeriodOpen } from './posting-period';

describe('assertAccountingPeriodOpen', () => {
  it('allows an open period and checks both its month and annual close keys', async () => {
    let query: unknown;
    await assertAccountingPeriodOpen({
      monthlyCloseLock: {
        findFirst: async (value: unknown) => { query = value; return null; },
      },
    } as never, 'entity-a', new Date('2026-10-31T23:59:59.000Z'));
    assert.deepEqual(query, {
      where: { entityId: 'entity-a', period: { in: ['2026-10', '2026'] } },
      select: { period: true },
    });
  });

  it('blocks both monthly and annual locks using the caller domain error', async () => {
    for (const period of ['2026-10', '2026']) {
      await assert.rejects(assertAccountingPeriodOpen({
        monthlyCloseLock: { findFirst: async () => ({ period }) },
      } as never, 'entity-a', new Date('2026-10-01T00:00:00.000Z')), (error: unknown) => (
        error instanceof FinanceRequestError
        && error.statusCode === 409
        && error.message.includes(period)
      ));
    }
  });

  it('rejects invalid posting dates before querying the close register', async () => {
    let queried = false;
    await assert.rejects(assertAccountingPeriodOpen({
      monthlyCloseLock: { findFirst: async () => { queried = true; return null; } },
    } as never, 'entity-a', new Date(Number.NaN)), /date comptable doit être une date valide/);
    assert.equal(queried, false);
  });
});
