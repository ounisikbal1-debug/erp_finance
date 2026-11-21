import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertLocalAiReady, LocalAiGatewayError, resolveFinancialInsightsProvider } from './gateway';

describe('AI gateway', () => {
  it('keeps the existing local provider as the default and accepts its explicit selection', () => {
    assert.equal(resolveFinancialInsightsProvider(undefined), 'ollama-local');
    assert.equal(resolveFinancialInsightsProvider('ollama-local'), 'ollama-local');
    assert.equal(resolveFinancialInsightsProvider(' ollama-local '), 'ollama-local');
  });

  it('fails closed for cloud or unknown providers', () => {
    assert.equal(resolveFinancialInsightsProvider('gemini-cloud'), null);
    assert.equal(resolveFinancialInsightsProvider('unknown-provider'), null);
  });

  it('requires explicit enablement, hardware readiness, and model approval', () => {
    const keys = [
      'SAFE_ERP_AI_ENABLED',
      'SAFE_ERP_AI_HARDWARE_READY',
      'SAFE_ERP_AI_MODEL_APPROVED',
      'SAFE_ERP_AI_PROVIDER',
      'SAFE_ERP_AI_MODEL',
    ] as const;
    const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.SAFE_ERP_AI_ENABLED = 'true';
    process.env.SAFE_ERP_AI_HARDWARE_READY = 'true';
    process.env.SAFE_ERP_AI_MODEL_APPROVED = 'true';
    process.env.SAFE_ERP_AI_PROVIDER = 'ollama-local';
    process.env.SAFE_ERP_AI_MODEL = 'TEST-local-model';

    try {
      assert.equal(assertLocalAiReady(), 'TEST-local-model');
      for (const key of ['SAFE_ERP_AI_ENABLED', 'SAFE_ERP_AI_HARDWARE_READY', 'SAFE_ERP_AI_MODEL_APPROVED'] as const) {
        const approvedValue = process.env[key];
        delete process.env[key];
        assert.throws(() => assertLocalAiReady(), LocalAiGatewayError);
        process.env[key] = approvedValue;
        process.env[key] = 'false';
        assert.throws(() => assertLocalAiReady(), LocalAiGatewayError);
        process.env[key] = approvedValue;
      }
    } finally {
      for (const key of keys) {
        const value = original[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
