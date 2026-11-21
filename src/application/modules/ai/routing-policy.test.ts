import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideAiRoute, type AiRoutingInput } from './routing-policy';

const ready: AiRoutingInput = {
  dataClass: 'AGGREGATED_REPORTS',
  taskType: 'CLASSIFICATION',
  preference: 'AUTO',
  internetAvailable: true,
  freeRamGiB: 4,
  localProviderReady: true,
  localProviderHealthy: true,
  cloudProviderId: 'configured-provider',
  cloudConsentForAggregates: true,
  cloudQuotaAvailable: true,
};

describe('sensitivity-first AI route decisions', () => {
  it('never sends sensitive finance, invoice, payroll, customer, or personal data to cloud', () => {
    for (const dataClass of ['ACCOUNTING_ENTRIES', 'INVOICES', 'PAYROLL', 'CUSTOMER_PERSONAL'] as const) {
      for (const localReady of [true, false]) {
        assert.deepEqual(decideAiRoute({
          ...ready,
          dataClass,
          preference: 'CLOUD',
          localProviderReady: localReady,
          localProviderHealthy: localReady,
        }), localReady
          ? { route: 'LOCAL', reason: 'SENSITIVE_DATA' }
          : { route: 'BLOCKED', reason: 'LOCAL_REQUIRED_BUT_UNAVAILABLE' });
      }
    }
  });

  it('forces local routing without internet and never routes by default without consent', () => {
    assert.deepEqual(decideAiRoute({ ...ready, internetAvailable: false }), { route: 'LOCAL', reason: 'OFFLINE' });
    assert.deepEqual(decideAiRoute({ ...ready, taskType: 'REASONING', cloudConsentForAggregates: false }), {
      route: 'LOCAL',
      reason: 'CLOUD_UNAVAILABLE',
    });
  });

  it('allows cloud only for consented aggregate complex reasoning with a configured provider', () => {
    assert.deepEqual(decideAiRoute({ ...ready, taskType: 'REASONING' }), {
      route: 'CLOUD',
      reason: 'AGGREGATE_CLOUD_OPT_IN',
    });
    assert.deepEqual(decideAiRoute({ ...ready, taskType: 'REASONING', cloudProviderId: null }), {
      route: 'LOCAL',
      reason: 'CLOUD_UNAVAILABLE',
    });
  });

  it('keeps OCR/classification local and uses cloud below 2.5 GiB only after provider, internet, and consent checks', () => {
    assert.deepEqual(decideAiRoute({ ...ready, freeRamGiB: 0.8, taskType: 'CLASSIFICATION' }), {
      route: 'LOCAL',
      reason: 'LOCAL_PREFERRED',
    });
    assert.deepEqual(decideAiRoute({ ...ready, freeRamGiB: 2.49, taskType: 'REASONING' }), { route: 'CLOUD', reason: 'LOW_MEMORY' });
    assert.deepEqual(decideAiRoute({
      ...ready,
      freeRamGiB: 0.8,
      taskType: 'REASONING',
      internetAvailable: false,
    }), { route: 'LOCAL', reason: 'OFFLINE' });
    assert.deepEqual(decideAiRoute({
      ...ready,
      freeRamGiB: 0.8,
      taskType: 'REASONING',
      cloudConsentForAggregates: false,
    }), { route: 'LOCAL', reason: 'CLOUD_UNAVAILABLE' });
  });

  it('permits cloud fallback only for aggregate data and falls back locally when cloud quota is exhausted', () => {
    assert.deepEqual(decideAiRoute({
      ...ready,
      localProviderHealthy: false,
      taskType: 'REASONING',
    }), { route: 'CLOUD', reason: 'LOCAL_FAILURE_FALLBACK' });
    assert.deepEqual(decideAiRoute({
      ...ready,
      dataClass: 'INVOICES',
      localProviderHealthy: false,
    }), { route: 'BLOCKED', reason: 'LOCAL_REQUIRED_BUT_UNAVAILABLE' });
    assert.deepEqual(decideAiRoute({
      ...ready,
      cloudQuotaAvailable: false,
      taskType: 'REASONING',
    }), { route: 'LOCAL', reason: 'CLOUD_QUOTA_EXHAUSTED' });
  });

  it('blocks when neither consented cloud nor a healthy local provider is available', () => {
    assert.deepEqual(decideAiRoute({
      ...ready,
      cloudConsentForAggregates: false,
      localProviderReady: false,
    }), { route: 'BLOCKED', reason: 'NO_AVAILABLE_PROVIDER' });
    assert.deepEqual(decideAiRoute({
      ...ready,
      preference: 'CLOUD',
      cloudConsentForAggregates: false,
      localProviderReady: false,
      taskType: 'REASONING',
    }), { route: 'BLOCKED', reason: 'CLOUD_CONSENT_REQUIRED' });
  });
});
