import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import FinanceService from '../finance/service';
import LocalFinancialAssistantService, { getInterpretationLanguage } from './service';

const auditEvents: Array<Record<string, unknown>> = [];
const auditDelegate = prisma.aiRequestAuditEvent;
const originalAuditCreate = Object.getOwnPropertyDescriptor(auditDelegate, 'create');

before(() => {
  Object.defineProperty(auditDelegate, 'create', {
    configurable: true,
    value: async (args: { data: Record<string, unknown> }) => {
      auditEvents.push(args.data);
      return args.data;
    },
  });
});

after(() => {
  if (originalAuditCreate) Object.defineProperty(auditDelegate, 'create', originalAuditCreate);
  else Reflect.deleteProperty(auditDelegate, 'create');
});

describe('local financial assistant service', () => {
  it('uses Gemini only for aggregate totals and a fixed intent, never the free-text identifiers', async () => {
    const envKeys = [
      'SAFE_ERP_AI_ENABLED',
      'SAFE_ERP_AI_HARDWARE_READY',
      'SAFE_ERP_AI_MODEL_APPROVED',
      'SAFE_ERP_AI_PROVIDER',
      'SAFE_ERP_AI_MODEL',
      'SAFE_ERP_AI_OLLAMA_URL',
      'SAFE_ERP_AI_CLOUD_ENABLED',
      'SAFE_ERP_AI_CLOUD_CONSENT_AGGREGATES',
      'GEMINI_API_KEY',
      'GROQ_API_KEY',
    ] as const;
    const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    const originalSummary = Object.getOwnPropertyDescriptor(FinanceService, 'getFinancialPeriodSummary');
    const originalFetch = globalThis.fetch;
    let remotePrompt = '';
    let requestCount = 0;
    const auditStart = auditEvents.length;
    process.env.SAFE_ERP_AI_ENABLED = 'true';
    process.env.SAFE_ERP_AI_HARDWARE_READY = 'true';
    process.env.SAFE_ERP_AI_MODEL_APPROVED = 'true';
    process.env.SAFE_ERP_AI_PROVIDER = 'ollama-local';
    process.env.SAFE_ERP_AI_MODEL = 'TEST-local-model';
    process.env.SAFE_ERP_AI_OLLAMA_URL = 'http://127.0.0.1:11434';
    process.env.SAFE_ERP_AI_CLOUD_ENABLED = 'true';
    process.env.SAFE_ERP_AI_CLOUD_CONSENT_AGGREGATES = 'true';
    process.env.GEMINI_API_KEY = 'TEST-gemini-key';
    process.env.GROQ_API_KEY = '';
    Object.defineProperty(FinanceService, 'getFinancialPeriodSummary', {
      configurable: true,
      value: async (_entityId: string, from: string, to: string) => ({
        entity: { name: 'PRIVATE_ENTITY', countryCode: 'TN', currencyCode: 'TND' },
        periodStart: from,
        periodEnd: to,
        totals: [
          { type: 'Revenue', accountCount: 2, movement: 1500 },
          { type: 'Expense', accountCount: 3, movement: 900 },
        ],
        accounts: [],
        coverage: { postedJournalLineCount: 4 },
      }),
    });
    globalThis.fetch = async (input, init) => {
      requestCount += 1;
      const url = String(input);
      if (url.startsWith('http://127.0.0.1')) return new Response('', { status: 503 });
      const body = JSON.parse(String(init?.body)) as {
        contents: Array<{ parts: Array<{ text: string }> }>;
      };
      remotePrompt = body.contents[0].parts[0].text;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Aggregate-only cloud answer' }] } }],
      }), { status: 200 });
    };

    try {
      const result = await LocalFinancialAssistantService.ask(
        'private-entity-id',
        '2026-01-01',
        '2026-01-31',
        'Résume la période pour client CLIENT_SECRET, matricule fiscal MF12345678',
        true,
        'TEST_user',
      );
      assert.ok(requestCount >= 1 && requestCount <= 2);
      assert.equal(result.provider, 'gemini-cloud');
      assert.equal(result.cloudDataScope, 'AGGREGATE_TOTALS_AND_FIXED_QUERY_INTENT');
      assert.match(remotePrompt, /"movement":1500/);
      assert.match(remotePrompt, /Fais une synthèse des totaux agrégés/);
      assert.doesNotMatch(remotePrompt, /CLIENT_SECRET|MF12345678|private-entity-id|PRIVATE_ENTITY/);
      assert.equal(result.answer, 'Aggregate-only cloud answer');
      const requestEvents = auditEvents.slice(auditStart);
      assert.deepEqual(requestEvents.map((event) => event.eventType), ['STARTED', 'SUCCEEDED']);
      assert.equal(requestEvents[1].route, 'CLOUD');
      assert.equal(requestEvents[1].provider, 'gemini-cloud');
      assert.equal(requestEvents.some((event) => 'prompt' in event || 'promptHash' in event), false);
      assert.equal(result.fallbackUsed, false);
    } finally {
      for (const key of envKeys) {
        const value = originalEnv[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      globalThis.fetch = originalFetch;
      if (originalSummary) Object.defineProperty(FinanceService, 'getFinancialPeriodSummary', originalSummary);
      else Reflect.deleteProperty(FinanceService, 'getFinancialPeriodSummary');
    }
  });

  it('sends only period-level aggregates to an Ollama loopback endpoint', async () => {
    const originalEnabled = process.env.SAFE_ERP_AI_ENABLED;
    const originalHardwareReady = process.env.SAFE_ERP_AI_HARDWARE_READY;
    const originalModelApproved = process.env.SAFE_ERP_AI_MODEL_APPROVED;
    const originalProvider = process.env.SAFE_ERP_AI_PROVIDER;
    const originalModel = process.env.SAFE_ERP_AI_MODEL;
    const originalUrl = process.env.SAFE_ERP_AI_OLLAMA_URL;
    const originalSummary = Object.getOwnPropertyDescriptor(FinanceService, 'getFinancialPeriodSummary');
    const originalFetch = globalThis.fetch;
    let postedUrl = '';
    let postedPrompt = '';
    let postedOptions: { model: string; stream: boolean; think: boolean; options: { temperature: number; num_ctx: number; num_predict: number } } | null = null;
    process.env.SAFE_ERP_AI_ENABLED = 'true';
    process.env.SAFE_ERP_AI_HARDWARE_READY = 'true';
    process.env.SAFE_ERP_AI_MODEL_APPROVED = 'true';
    process.env.SAFE_ERP_AI_PROVIDER = 'ollama-local';
    process.env.SAFE_ERP_AI_MODEL = 'TEST-local-model';
    process.env.SAFE_ERP_AI_OLLAMA_URL = 'http://127.0.0.1:11434';
    Object.defineProperty(FinanceService, 'getFinancialPeriodSummary', {
      configurable: true,
      value: async (_entityId: string, from: string, to: string) => ({
        entity: { name: 'TEST_PRIVATE_ENTITY_NAME', countryCode: 'TN', currencyCode: 'TND' },
        periodStart: from,
        periodEnd: to,
        totals: from === '2026-01-01'
          ? [
            { type: 'Revenue', accountCount: 2, movement: 1500 },
            { type: 'Expense', accountCount: 3, movement: 900 },
            { type: 'Asset', accountCount: 1, movement: null },
          ]
          : [
            { type: 'Revenue', accountCount: 1, movement: 1000 },
            { type: 'Expense', accountCount: 2, movement: 700 },
          ],
        accounts: [{ code: 'TEST_PRIVATE_ACCOUNT', description: 'TEST_PRIVATE_DESCRIPTION', type: 'Revenue', movement: 1500 }],
        coverage: { postedJournalLineCount: from === '2026-01-01' ? 4 : 2 },
      }),
    });
    globalThis.fetch = async (input, init) => {
      postedUrl = String(input);
      const body = JSON.parse(String(init?.body)) as {
        prompt: string;
        model: string;
        stream: boolean;
        think: boolean;
        options: { temperature: number; num_ctx: number; num_predict: number };
      };
      postedPrompt = body.prompt;
      postedOptions = body;
      return new Response(JSON.stringify({ response: 'Analyse indicative TEST.' }), { status: 200 });
    };

    try {
      const result = await LocalFinancialAssistantService.ask(
        'TEST_entity',
        '2026-01-01',
        '2026-01-31',
        'Résume la période',
        false,
        'TEST_user',
      );
      assert.equal(postedUrl, 'http://127.0.0.1:11434/api/generate');
      assert.deepEqual(postedOptions, {
        model: 'TEST-local-model',
        stream: false,
        think: false,
        options: { temperature: 0.1, num_ctx: 4096, num_predict: 700 },
        prompt: postedPrompt,
      });
      assert.match(postedPrompt, /"movement":1500/);
      assert.doesNotMatch(postedPrompt, /TEST_PRIVATE/);
      assert.equal(result.provider, 'ollama-local');
      assert.equal(result.answer, 'Analyse indicative TEST.');
      assert.match(postedPrompt, /Période précédente comparable: 2025-12-01 au 2025-12-31/);
      assert.match(postedPrompt, /"percentChange":50/);
      assert.deepEqual(result.explanation.evidence.totals, [
        { type: 'Revenue', movement: 1500 },
        { type: 'Expense', movement: 900 },
      ]);
      assert.deepEqual(result.explanation.evidence.previousPeriod, {
        periodStart: '2025-12-01',
        periodEnd: '2025-12-31',
        postedJournalLineCount: 2,
        totals: [
          { type: 'Revenue', movement: 1000 },
          { type: 'Expense', movement: 700 },
        ],
      });
      assert.equal(result.explanation.evidence.comparison.revenue.percentChange, 50);
      assert.equal(result.explanation.evidence.comparison.expenses.percentChange, (200 / 700) * 100);
      assert.deepEqual(result.explanation.excludedTotalTypes, ['Asset']);
      assert.equal(result.explanation.evidence.postedJournalLineCount, 4);
      assert.ok(result.explanation.rules.some((rule) => rule.includes('POSTED')));
    } finally {
      if (originalEnabled === undefined) delete process.env.SAFE_ERP_AI_ENABLED;
      else process.env.SAFE_ERP_AI_ENABLED = originalEnabled;
      if (originalHardwareReady === undefined) delete process.env.SAFE_ERP_AI_HARDWARE_READY;
      else process.env.SAFE_ERP_AI_HARDWARE_READY = originalHardwareReady;
      if (originalModelApproved === undefined) delete process.env.SAFE_ERP_AI_MODEL_APPROVED;
      else process.env.SAFE_ERP_AI_MODEL_APPROVED = originalModelApproved;
      if (originalProvider === undefined) delete process.env.SAFE_ERP_AI_PROVIDER;
      else process.env.SAFE_ERP_AI_PROVIDER = originalProvider;
      if (originalModel === undefined) delete process.env.SAFE_ERP_AI_MODEL;
      else process.env.SAFE_ERP_AI_MODEL = originalModel;
      if (originalUrl === undefined) delete process.env.SAFE_ERP_AI_OLLAMA_URL;
      else process.env.SAFE_ERP_AI_OLLAMA_URL = originalUrl;
      globalThis.fetch = originalFetch;
      if (originalSummary) Object.defineProperty(FinanceService, 'getFinancialPeriodSummary', originalSummary);
      else Reflect.deleteProperty(FinanceService, 'getFinancialPeriodSummary');
    }
  });

  it('selects only explicit country languages and rejects unknown or ambiguous mappings', () => {
    assert.equal(getInterpretationLanguage('TN'), 'fr');
    assert.equal(getInterpretationLanguage('US'), 'en');
    assert.throws(() => getInterpretationLanguage('VU'), /Aucune langue d’interprétation/);
    assert.throws(() => getInterpretationLanguage('AE'), /Aucune langue d’interprétation/);
  });

  it('refuses an unsupported cloud provider before reading financial data', async () => {
    const originalEnabled = process.env.SAFE_ERP_AI_ENABLED;
    const originalProvider = process.env.SAFE_ERP_AI_PROVIDER;
    const originalSummary = Object.getOwnPropertyDescriptor(FinanceService, 'getFinancialPeriodSummary');
    let summaryCalled = false;
    process.env.SAFE_ERP_AI_ENABLED = 'true';
    process.env.SAFE_ERP_AI_PROVIDER = 'gemini-cloud';
    Object.defineProperty(FinanceService, 'getFinancialPeriodSummary', {
      configurable: true,
      value: async () => {
        summaryCalled = true;
        throw new Error('Financial data must not be read for an unsupported provider.');
      },
    });

    try {
      await assert.rejects(
        () => LocalFinancialAssistantService.ask(
          'TEST_entity', '2026-01-01', '2026-01-31', 'Résume la période', false, 'TEST_user',
        ),
        /Seul le fournisseur Ollama local/,
      );
      assert.equal(summaryCalled, false);
    } finally {
      if (originalEnabled === undefined) delete process.env.SAFE_ERP_AI_ENABLED;
      else process.env.SAFE_ERP_AI_ENABLED = originalEnabled;
      if (originalProvider === undefined) delete process.env.SAFE_ERP_AI_PROVIDER;
      else process.env.SAFE_ERP_AI_PROVIDER = originalProvider;
      if (originalSummary) Object.defineProperty(FinanceService, 'getFinancialPeriodSummary', originalSummary);
      else Reflect.deleteProperty(FinanceService, 'getFinancialPeriodSummary');
    }
  });

  it('refuses remote Ollama endpoints and validates questions', async () => {
    const originalEnabled = process.env.SAFE_ERP_AI_ENABLED;
    const originalHardwareReady = process.env.SAFE_ERP_AI_HARDWARE_READY;
    const originalModelApproved = process.env.SAFE_ERP_AI_MODEL_APPROVED;
    const originalProvider = process.env.SAFE_ERP_AI_PROVIDER;
    const originalModel = process.env.SAFE_ERP_AI_MODEL;
    const originalUrl = process.env.SAFE_ERP_AI_OLLAMA_URL;
    process.env.SAFE_ERP_AI_ENABLED = 'true';
    process.env.SAFE_ERP_AI_HARDWARE_READY = 'true';
    process.env.SAFE_ERP_AI_MODEL_APPROVED = 'true';
    process.env.SAFE_ERP_AI_PROVIDER = 'ollama-local';
    process.env.SAFE_ERP_AI_MODEL = 'TEST-local-model';
    process.env.SAFE_ERP_AI_OLLAMA_URL = 'https://example.invalid';
    try {
      await assert.rejects(
        LocalFinancialAssistantService.ask(
          'TEST_entity', '2026-01-01', '2026-01-31', 'Question valable', false, 'TEST_user',
        ),
        /machine locale/,
      );
      await assert.rejects(
        LocalFinancialAssistantService.ask(
          'TEST_entity', '2026-01-01', '2026-01-31', '  a ', false, 'TEST_user',
        ),
        /entre 5 et 1000 caractères/,
      );
    } finally {
      if (originalEnabled === undefined) delete process.env.SAFE_ERP_AI_ENABLED;
      else process.env.SAFE_ERP_AI_ENABLED = originalEnabled;
      if (originalHardwareReady === undefined) delete process.env.SAFE_ERP_AI_HARDWARE_READY;
      else process.env.SAFE_ERP_AI_HARDWARE_READY = originalHardwareReady;
      if (originalModelApproved === undefined) delete process.env.SAFE_ERP_AI_MODEL_APPROVED;
      else process.env.SAFE_ERP_AI_MODEL_APPROVED = originalModelApproved;
      if (originalProvider === undefined) delete process.env.SAFE_ERP_AI_PROVIDER;
      else process.env.SAFE_ERP_AI_PROVIDER = originalProvider;
      if (originalModel === undefined) delete process.env.SAFE_ERP_AI_MODEL;
      else process.env.SAFE_ERP_AI_MODEL = originalModel;
      if (originalUrl === undefined) delete process.env.SAFE_ERP_AI_OLLAMA_URL;
      else process.env.SAFE_ERP_AI_OLLAMA_URL = originalUrl;
    }
  });

  it('fails closed before reading financial data when audit storage is unavailable', async () => {
    const originalCreate = Object.getOwnPropertyDescriptor(auditDelegate, 'create');
    let summaryCalled = false;
    const originalSummary = Object.getOwnPropertyDescriptor(FinanceService, 'getFinancialPeriodSummary');
    Object.defineProperty(auditDelegate, 'create', {
      configurable: true,
      value: async () => { throw new Error('TEST database unavailable'); },
    });
    Object.defineProperty(FinanceService, 'getFinancialPeriodSummary', {
      configurable: true,
      value: async () => {
        summaryCalled = true;
        throw new Error('Financial data must not be read without an audit record.');
      },
    });

    try {
      await assert.rejects(
        LocalFinancialAssistantService.ask(
          'TEST_entity', '2026-01-01', '2026-01-31', 'Résume la période', false, 'TEST_user',
        ),
        /Le journal de sécurité IA est indisponible/,
      );
      assert.equal(summaryCalled, false);
    } finally {
      if (originalCreate) Object.defineProperty(auditDelegate, 'create', originalCreate);
      if (originalSummary) Object.defineProperty(FinanceService, 'getFinancialPeriodSummary', originalSummary);
      else Reflect.deleteProperty(FinanceService, 'getFinancialPeriodSummary');
    }
  });
});
