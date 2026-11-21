import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reduceWithholdingPreviewState } from './withholding-preview-state';

describe('withholding preview state', () => {
  it('clears the calculated result and certificate input when form inputs change', () => {
    const state = reduceWithholdingPreviewState(
      { preview: { amount: 10 }, withholdingInput: { amountTtc: 100 } },
      { type: 'input-changed' },
    );

    assert.deepEqual(state, { preview: null, withholdingInput: null });
  });

  it('stores the calculated result with the exact input used for the calculation', () => {
    const preview = { amount: 10 };
    const withholdingInput = { amountTtc: 100 };
    const state = reduceWithholdingPreviewState(
      { preview: null, withholdingInput: null },
      { type: 'calculated', preview, withholdingInput },
    );

    assert.deepEqual(state, { preview, withholdingInput });
  });
});
