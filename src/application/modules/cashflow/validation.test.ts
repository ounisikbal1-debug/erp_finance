import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CashflowRequestError } from './errors';
import { parseCashflowPeriod, validateCashAccountCodes } from './validation';

describe('cashflow input validation', () => {
  it('parses valid months as UTC half-open intervals', () => {
    assert.deepEqual(parseCashflowPeriod('2026-02'), {
      period: '2026-02',
      startAt: new Date('2026-02-01T00:00:00.000Z'),
      endExclusive: new Date('2026-03-01T00:00:00.000Z'),
    });
  });

  it('rejects invalid months and normalizes unique account codes', () => {
    assert.throws(() => parseCashflowPeriod('2026-13'), CashflowRequestError);
    assert.deepEqual(validateCashAccountCodes([' 5121 ', '531']), ['5121', '531']);
    assert.throws(() => validateCashAccountCodes(['5121', '5121']), /plusieurs fois/);
    assert.throws(() => validateCashAccountCodes('5121'), CashflowRequestError);
  });
});
