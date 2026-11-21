import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateRetirementCssGain } from './retirement-css-gain';

describe('retirement CSS gain', () => {
  it('calculates the CSS reduction from an eligible retirement contribution', () => {
    const result = calculateRetirementCssGain(2604.367, 104.175, 0.5);

    assert.deepEqual(result, {
      cssBeforeRetirementGain: 13.022,
      css: 12.501,
      gainCss: 0.521,
    });
  });

  it('keeps CSS unchanged when no retirement benefit is eligible', () => {
    const result = calculateRetirementCssGain(2604.367, 0, 0.5);

    assert.deepEqual(result, {
      cssBeforeRetirementGain: 13.022,
      css: 13.022,
      gainCss: 0,
    });
  });

  it('does not reduce the CSS base below zero', () => {
    const result = calculateRetirementCssGain(100, 150, 0.5);

    assert.deepEqual(result, {
      cssBeforeRetirementGain: 0.5,
      css: 0,
      gainCss: 0.5,
    });
  });
});
