import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  generateAggregateCloudText,
  generateAggregateWithLocalFallback,
  resolveAggregateCloudConfiguration,
  type AiGenerationResult,
} from './cloud-gateway';

const enabledEnvironment = (): NodeJS.ProcessEnv => ({
  SAFE_ERP_AI_CLOUD_ENABLED: 'true',
  SAFE_ERP_AI_CLOUD_CONSENT_AGGREGATES: 'true',
  GEMINI_API_KEY: 'TEST-gemini-key',
  GROQ_API_KEY: 'TEST-groq-key',
});

describe('aggregate cloud AI gateway', () => {
  it('requires explicit cloud enablement, aggregate consent, and a provider key', () => {
    assert.equal(resolveAggregateCloudConfiguration({ GEMINI_API_KEY: 'TEST-key' }), null);
    assert.equal(resolveAggregateCloudConfiguration({
      SAFE_ERP_AI_CLOUD_ENABLED: 'true',
      GEMINI_API_KEY: 'TEST-key',
    }), null);
    assert.equal(resolveAggregateCloudConfiguration({
      SAFE_ERP_AI_CLOUD_ENABLED: 'true',
      SAFE_ERP_AI_CLOUD_CONSENT_AGGREGATES: 'true',
    }), null);
    assert.equal(resolveAggregateCloudConfiguration({
      SAFE_ERP_AI_CLOUD_ENABLED: 'true',
      SAFE_ERP_AI_CLOUD_CONSENT_AGGREGATES: 'true',
      GROQ_API_KEY: 'TEST-groq-key',
    }), null);
    assert.equal(resolveAggregateCloudConfiguration(enabledEnvironment())?.geminiModel, 'gemini-3.8-flash');
  });

  it('calls Gemini through its official API with the key in a header and parses the response', async () => {
    const originalFetch = globalThis.fetch;
    let requestUrl = '';
    let requestHeaders: Headers | undefined;
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input);
      requestHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Aggregate summary' }] } }],
      }), { status: 200 });
    };
    try {
      const result = await generateAggregateCloudText('Safe fixed prompt', { env: enabledEnvironment() });
      assert.equal(result.answer, 'Aggregate summary');
      assert.equal(result.model, 'gemini-3.8-flash');
      assert.equal(result.provider, 'gemini-cloud');
      assert.match(requestUrl, /models\/gemini-3\.8-flash:generateContent$/);
      assert.equal(new URL(requestUrl).search, '');
      assert.equal(requestHeaders?.get('x-goog-api-key'), 'TEST-gemini-key');
      assert.equal(requestHeaders?.get('cache-control'), 'no-store');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uses Groq as a fallback if Gemini quota or service availability fails', async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];
    let groqHeaders: Headers | undefined;
    globalThis.fetch = async (input, init) => {
      requestedUrls.push(String(input));
      if (requestedUrls.length === 1) return new Response('', { status: 429 });
      groqHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Groq fallback summary' } }],
      }), { status: 200 });
    };
    try {
      const result = await generateAggregateCloudText('Fixed aggregate prompt', { env: enabledEnvironment() });
      assert.equal(result.answer, 'Groq fallback summary');
      assert.equal(result.provider, 'groq-cloud');
      assert.equal(result.fallbackUsed, true);
      assert.deepEqual(requestedUrls, [
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
        'https://api.groq.com/openai/v1/chat/completions',
      ]);
      assert.equal(groqHeaders?.get('authorization'), 'Bearer TEST-groq-key');
      assert.equal(groqHeaders?.get('cache-control'), 'no-store');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('prefers local at or above 2.5 GiB, uses cloud below that threshold, and never cloud-falls back without consent', async () => {
    const local: AiGenerationResult = { answer: 'local', model: 'phi4-mini', provider: 'ollama-local' };
    const cloud: AiGenerationResult = { answer: 'cloud', model: 'gemini-3.8-flash', provider: 'gemini-cloud' };
    const env = enabledEnvironment();
    const calls: string[] = [];
    const generateLocal = async () => {
      calls.push('local');
      return local;
    };
    const generateCloud = async () => {
      calls.push('cloud');
      return cloud;
    };

    assert.equal((await generateAggregateWithLocalFallback('local prompt', 'fixed cloud prompt', {
      env, freeRamGiB: 3, generateLocal, generateCloud,
    })).provider, 'ollama-local');
    assert.equal((await generateAggregateWithLocalFallback('local prompt', 'fixed cloud prompt', {
      env, freeRamGiB: 2.5, generateLocal, generateCloud,
    })).provider, 'ollama-local');
    assert.equal((await generateAggregateWithLocalFallback('local prompt', 'fixed cloud prompt', {
      env, freeRamGiB: 2.49, generateLocal, generateCloud,
    })).provider, 'gemini-cloud');
    assert.deepEqual(calls, ['local', 'local', 'cloud']);

    calls.length = 0;
    await assert.rejects(() => generateAggregateWithLocalFallback('local prompt', 'fixed cloud prompt', {
      env: { ...env, SAFE_ERP_AI_CLOUD_CONSENT_AGGREGATES: 'false' },
      freeRamGiB: 0.5,
      generateLocal: async () => { throw new Error('local unavailable'); },
      generateCloud,
    }), /local unavailable/);
    assert.deepEqual(calls, []);
  });

  it('falls back to cloud only when the caller provides a fixed aggregate-safe prompt', async () => {
    await assert.rejects(() => generateAggregateWithLocalFallback('free text with private identifiers', null, {
      env: enabledEnvironment(),
      freeRamGiB: 0.5,
      generateLocal: async () => { throw new Error('local unavailable'); },
      generateCloud: async () => { throw new Error('must not call cloud'); },
    }), /local unavailable/);
  });

  it('marks a route switch when the preferred provider fails', async () => {
    const cloud: AiGenerationResult = { answer: 'cloud', model: 'gemini-3.8-flash', provider: 'gemini-cloud' };
    const local: AiGenerationResult = { answer: 'local', model: 'phi4-mini', provider: 'ollama-local' };
    const cloudFallback = await generateAggregateWithLocalFallback('local', 'fixed cloud prompt', {
      env: enabledEnvironment(),
      freeRamGiB: 3,
      generateLocal: async () => { throw new Error('local unavailable'); },
      generateCloud: async () => cloud,
    });
    assert.equal(cloudFallback.fallbackUsed, true);

    const localFallback = await generateAggregateWithLocalFallback('local', 'fixed cloud prompt', {
      env: enabledEnvironment(),
      freeRamGiB: 0.5,
      generateLocal: async () => local,
      generateCloud: async () => { throw new Error('cloud unavailable'); },
    });
    assert.equal(localFallback.fallbackUsed, true);
  });
});
