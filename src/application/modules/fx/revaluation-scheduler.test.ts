import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import FxRevaluationService from './revaluation-service';
import {
  millisecondsUntilNextFxReversal,
  startDailyFxReversalProcessing,
} from './revaluation-scheduler';

describe('FX revaluation reversal schedule', () => {
  it('schedules shortly after midnight UTC and advances when the time has passed', () => {
    assert.equal(
      millisecondsUntilNextFxReversal(new Date('2026-03-31T23:59:00.000Z')),
      6 * 60 * 1000,
    );
    assert.equal(
      millisecondsUntilNextFxReversal(new Date('2026-04-01T00:05:00.000Z')),
      24 * 60 * 60 * 1000,
    );
  });

  it('logs only safe metadata when reversal processing fails', async () => {
    const originalProcess = FxRevaluationService.processDueReversals;
    const originalConsoleError = console.error;
    const diagnostics: unknown[][] = [];
    let stop: (() => void) | undefined;
    FxRevaluationService.processDueReversals = async () => {
      throw Object.assign(new Error('synthetic sensitive database diagnostic'), { code: 'P2021' });
    };
    console.error = (...args: unknown[]) => {
      diagnostics.push(args);
    };

    try {
      stop = startDailyFxReversalProcessing();
      await new Promise<void>((resolve) => setImmediate(resolve));
    } finally {
      stop?.();
      FxRevaluationService.processDueReversals = originalProcess;
      console.error = originalConsoleError;
    }

    assert.equal(JSON.stringify(diagnostics).includes('synthetic sensitive database diagnostic'), false);
    assert.deepEqual(diagnostics, [[
      'Échec du traitement des contrepassations FX dues:',
      { errorType: 'Error', errorCode: 'P2021' },
    ]]);
  });
});
