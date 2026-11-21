import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import { BCT_INTERBANK_RATES_URL, BCT_INTERBANK_SOURCE_NAME } from './bct-interbank';
import { FxRatesService } from './service';

const SYNTHETIC_HTML = `
<h3>Cours Moyens des Devises Cotées en dinar tunisien</h3>
<h5>Journée du 29/10/2026</h5>
<table>
<tr><th>Monnaie</th><th>Sigle</th><th>Unité</th><th>Valeur</th></tr>
<tr><td>EURO</td><td>EUR</td><td>1</td><td>3,4</td></tr>
<tr><td>DIRHAM</td><td>AED</td><td>10</td><td>8,0</td></tr>
</table>
<h3>Cours Moyens en dinar tunisien pour le Change Manuel</h3>`;

describe('FxRatesService', () => {
  it('stores normalized imported rates with the publication and import metadata', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    const upserts: Array<Record<string, unknown>> = [];
    let transactionOperations: unknown[] | undefined;
    stub(prisma.exchangeRate, 'upsert', async (query: Record<string, unknown>) => {
      upserts.push(query);
      return {};
    });
    stub(prisma, '$transaction', async (operations: unknown[]) => {
      transactionOperations = operations;
      return [];
    });
    const importedAt = new Date('2026-10-30T06:00:00.000Z');
    const fetcher: typeof fetch = async (url, init) => {
      assert.equal(url, BCT_INTERBANK_RATES_URL);
      assert.ok(init?.signal);
      return new Response(SYNTHETIC_HTML, { status: 200 });
    };

    try {
      const result = await FxRatesService.importBctInterbankRates(fetcher, importedAt);
      assert.deepEqual(result, {
        effectiveDate: '2026-10-29',
        importedAt: importedAt.toISOString(),
        sourceName: BCT_INTERBANK_SOURCE_NAME,
        sourceUrl: BCT_INTERBANK_RATES_URL,
        count: 2,
      });
      assert.equal(transactionOperations?.length, 2);
      assert.equal(upserts[0].where instanceof Object, true);
      assert.deepEqual(upserts[0].create, {
        baseCurrency: 'EUR',
        quoteCurrency: 'TND',
        rate: 3.4,
        sourceUnit: 1,
        sourceValue: 3.4,
        sourceName: BCT_INTERBANK_SOURCE_NAME,
        sourceUrl: BCT_INTERBANK_RATES_URL,
        rateType: 'INTERBANK',
        effectiveDate: new Date('2026-10-29T00:00:00.000Z'),
        importedAt,
      });
      assert.deepEqual(upserts[1].create, {
        baseCurrency: 'AED',
        quoteCurrency: 'TND',
        rate: 0.8,
        sourceUnit: 10,
        sourceValue: 8,
        sourceName: BCT_INTERBANK_SOURCE_NAME,
        sourceUrl: BCT_INTERBANK_RATES_URL,
        rateType: 'INTERBANK',
        effectiveDate: new Date('2026-10-29T00:00:00.000Z'),
        importedAt,
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('returns a same-day BCT suggestion scoped to the entity functional currency', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let query: Record<string, unknown> | undefined;
    const importedAt = new Date('2026-10-30T06:00:00.000Z');
    stub(prisma.entity, 'findUnique', async () => ({ country: { currencyCode: 'TND' } }));
    stub(prisma.exchangeRate, 'findMany', async (value: Record<string, unknown>) => {
      query = value;
      return [{
        baseCurrency: 'EUR',
        rate: 3.4,
        sourceUnit: 1,
        sourceValue: 3.4,
        sourceName: BCT_INTERBANK_SOURCE_NAME,
        sourceUrl: BCT_INTERBANK_RATES_URL,
        effectiveDate: new Date('2026-10-29T00:00:00.000Z'),
        importedAt,
      }];
    });

    try {
      assert.deepEqual(await FxRatesService.getRateSuggestion('entity-1', 'eur', '2026-10-29'), {
        available: true,
        documentCurrencyCode: 'EUR',
        functionalCurrencyCode: 'TND',
        exchangeRate: 3.4,
        exchangeRateDate: '2026-10-29',
        exchangeRateSource: `${BCT_INTERBANK_SOURCE_NAME}; EUR/TND (3.4 TND par unité); ${BCT_INTERBANK_RATES_URL}`,
        exchangeRateImportedAt: importedAt.toISOString(),
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.deepEqual(query, {
      where: {
        sourceName: BCT_INTERBANK_SOURCE_NAME,
        rateType: 'INTERBANK',
        quoteCurrency: 'TND',
        baseCurrency: { in: ['EUR'] },
        effectiveDate: {
          gte: new Date('2026-10-29T00:00:00.000Z'),
          lt: new Date('2026-10-30T00:00:00.000Z'),
        },
      },
      select: {
        baseCurrency: true,
        rate: true,
        sourceUnit: true,
        sourceValue: true,
        sourceName: true,
        sourceUrl: true,
        effectiveDate: true,
        importedAt: true,
      },
    });
  });

  it('derives cross rates from same-day BCT rates and leaves incomplete pairs unavailable', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    stub(prisma.entity, 'findUnique', async () => ({ country: { currencyCode: 'EUR' } }));
    let rates: Array<Record<string, unknown>> = [
      { baseCurrency: 'USD', rate: 3.1, importedAt: new Date('2026-10-30T06:00:00Z') },
      { baseCurrency: 'EUR', rate: 3.4, importedAt: new Date('2026-10-30T06:00:00Z') },
    ];
    stub(prisma.exchangeRate, 'findMany', async () => rates);

    try {
      const suggestion = await FxRatesService.getRateSuggestion('entity-1', 'USD', '2026-10-29');
      assert.equal(suggestion.available, true);
      assert.equal(suggestion.exchangeRate, 3.1 / 3.4);
      assert.match(suggestion.exchangeRateSource ?? '', /USD\/TND.*EUR\/TND/);

      rates = [{ baseCurrency: 'USD', rate: 3.1, importedAt: new Date('2026-10-30T06:00:00Z') }];
      const unavailable = await FxRatesService.getRateSuggestion('entity-1', 'USD', '2026-10-29');
      assert.equal(unavailable.available, false);
      assert.equal(unavailable.exchangeRate, null);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });
});
