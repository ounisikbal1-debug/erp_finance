import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { millisecondsUntilNextFxImport } from './scheduler';

describe('daily FX import schedule', () => {
  it('targets 06:00 UTC and advances to the following day after the scheduled time', () => {
    assert.equal(
      millisecondsUntilNextFxImport(new Date('2026-10-29T05:30:00.000Z')),
      30 * 60 * 1000,
    );
    assert.equal(
      millisecondsUntilNextFxImport(new Date('2026-10-29T06:00:00.000Z')),
      24 * 60 * 60 * 1000,
    );
  });
});
