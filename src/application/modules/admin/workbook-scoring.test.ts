import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateWorkbookScore,
  validateWorkbookScoreConfiguration,
} from './workbook-scoring';
import { WorkbookFeatureConfigurationError } from './workbook-feature-errors';

const customerConfiguration = {
  alertThreshold: 60,
  lookbackDays: 365,
  components: [
    { key: 'paymentHistory', weight: 25, minimum: 0, maximum: 1, higherIsBetter: true },
    { key: 'paymentDelay', weight: 25, minimum: 0, maximum: 90, higherIsBetter: false },
    { key: 'disputes', weight: 25, minimum: 0, maximum: 10, higherIsBetter: false },
    { key: 'exposure', weight: 25, minimum: 0, maximum: 1, higherIsBetter: false },
  ],
};

const healthConfiguration = {
  alertThreshold: 55,
  lookbackDays: 365,
  components: [
    { key: 'liquidity', weight: 20, minimum: 0, maximum: 3, higherIsBetter: true },
    { key: 'solvency', weight: 20, minimum: 0, maximum: 1, higherIsBetter: true },
    { key: 'profitability', weight: 20, minimum: -1, maximum: 1, higherIsBetter: true },
    { key: 'workingCapital', weight: 20, minimum: -100000, maximum: 100000, higherIsBetter: true },
    { key: 'paymentDelay', weight: 20, minimum: 0, maximum: 120, higherIsBetter: false },
  ],
};

describe('workbook configurable scoring', () => {
  it('calculates only from a complete, explicitly weighted configuration', () => {
    const configuration = validateWorkbookScoreConfiguration('customer-supplier-scoring', customerConfiguration);
    const result = calculateWorkbookScore(configuration, {
      paymentHistory: 1,
      paymentDelay: 0,
      disputes: 0,
      exposure: 0,
    });
    assert.equal(result.score, 100);
    assert.equal(result.alert, false);
    assert.equal(result.components.length, 4);
  });

  it('uses the configured threshold and direction to produce an explainable alert', () => {
    const configuration = validateWorkbookScoreConfiguration('customer-supplier-scoring', customerConfiguration);
    const result = calculateWorkbookScore(configuration, {
      paymentHistory: 0,
      paymentDelay: 90,
      disputes: 10,
      exposure: 1,
    });
    assert.equal(result.score, 0);
    assert.equal(result.alert, true);
    assert.equal(result.components.every((component) => component.contribution === 0), true);
  });

  it('rejects invented defaults, wrong weights, missing metrics, and out-of-range values', () => {
    assert.throws(
      () => validateWorkbookScoreConfiguration('customer-supplier-scoring', {}),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400,
    );
    assert.throws(
      () => validateWorkbookScoreConfiguration('customer-supplier-scoring', {
        ...customerConfiguration,
        components: customerConfiguration.components.map((component) => ({ ...component, weight: 20 })),
      }),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400,
    );
    const configuration = validateWorkbookScoreConfiguration('customer-supplier-scoring', customerConfiguration);
    assert.throws(
      () => calculateWorkbookScore(configuration, { paymentHistory: 0.5 }),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400,
    );
    assert.throws(
      () => calculateWorkbookScore(configuration, {
        paymentHistory: 1.1,
        paymentDelay: 0,
        disputes: 0,
        exposure: 0,
      }),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400,
    );
  });

  it('calculates the health score only from manually supplied, configured financial metrics', () => {
    const configuration = validateWorkbookScoreConfiguration('financial-health-score', healthConfiguration);
    const result = calculateWorkbookScore(configuration, {
      liquidity: 1.5,
      solvency: 0.6,
      profitability: 0.2,
      workingCapital: 10000,
      paymentDelay: 30,
    });
    assert.equal(result.score, 60);
    assert.equal(result.alert, false);
    assert.throws(
      () => calculateWorkbookScore(configuration, {
        liquidity: 1.5,
        solvency: 0.6,
        profitability: 0.2,
        workingCapital: 10000,
      }),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400,
    );
  });
});
