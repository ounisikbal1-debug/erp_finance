import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ControllingRequestError } from './errors';
import { parseControllingPeriod, validateCostCenterDraft, validateCostCenterUpdate } from './validation';

describe('controlling validation', () => {
  it('normalizes managed cost center fields', () => {
    assert.deepEqual(validateCostCenterDraft({ code: ' CC-OPS ', name: ' Opérations ', department: ' Supply ' }), {
      code: 'CC-OPS',
      name: 'Opérations',
      department: 'Supply',
    });
    assert.deepEqual(validateCostCenterUpdate({ name: 'Production', department: 'Atelier' }), {
      name: 'Production',
      department: 'Atelier',
    });
  });

  it('rejects invalid codes and empty labels', () => {
    assert.throws(() => validateCostCenterDraft({ code: 'bad code', name: 'Ops', department: 'Ops' }), ControllingRequestError);
    assert.throws(() => validateCostCenterDraft({ code: 'OPS', name: ' ', department: 'Ops' }), /obligatoire/);
    assert.throws(() => validateCostCenterUpdate({ name: 'Finance' }), /département/);
  });

  it('supports all periods and validates UTC month, quarter, and year ranges', () => {
    assert.deepEqual(parseControllingPeriod(undefined), { period: null, startAt: null, endExclusive: null });
    assert.deepEqual(parseControllingPeriod('2026-02'), {
      period: '2026-02',
      startAt: new Date('2026-02-01T00:00:00.000Z'),
      endExclusive: new Date('2026-03-01T00:00:00.000Z'),
    });
    assert.deepEqual(parseControllingPeriod('2024-Q1'), {
      period: '2024-Q1',
      startAt: new Date('2024-01-01T00:00:00.000Z'),
      endExclusive: new Date('2024-04-01T00:00:00.000Z'),
    });
    assert.deepEqual(parseControllingPeriod('2026-Q4'), {
      period: '2026-Q4',
      startAt: new Date('2026-10-01T00:00:00.000Z'),
      endExclusive: new Date('2027-01-01T00:00:00.000Z'),
    });
    assert.deepEqual(parseControllingPeriod('2026'), {
      period: '2026',
      startAt: new Date('2026-01-01T00:00:00.000Z'),
      endExclusive: new Date('2027-01-01T00:00:00.000Z'),
    });
    assert.throws(() => parseControllingPeriod('2026-13'), ControllingRequestError);
    assert.throws(() => parseControllingPeriod('2026-Q5'), ControllingRequestError);
  });
});
