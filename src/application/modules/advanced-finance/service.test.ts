import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import { AdvancedFinanceService } from './service';

describe('AdvancedFinanceService.getDashboardSummary', () => {
  it('scopes source queries to the entity and account classification to its country plan', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    const queries: Record<string, Record<string, unknown> | undefined> = {};
    const asOf = new Date('2026-11-15T12:00:00.000Z');
    const calculatedAt = new Date('2026-11-14T12:00:00.000Z');
    let healthScoreEnabled = true;

    stub(prisma.entity, 'findUnique', async (query: Record<string, unknown>) => {
      queries.entity = query;
      return {
        name: 'SAFE FR',
        countryId: 'country-fr',
        country: { code: 'FR', currencyCode: 'EUR' },
      };
    });
    stub(prisma.material, 'findMany', async (query: Record<string, unknown>) => {
      queries.materials = query;
      return [];
    });
    stub(prisma.invoice, 'findMany', async (query: Record<string, unknown>) => {
      queries.invoices = query;
      return [{ status: 'ISSUED', totalAmount: 120, currencyCode: 'EUR' }];
    });
    stub(prisma.journalLine, 'findMany', async (query: Record<string, unknown>) => {
      queries.journalLines = query;
      return [{
        accountCode: 'REV.01',
        debit: 0,
        credit: 200,
        journalEntry: { date: new Date('2026-11-04T00:00:00.000Z') },
      }];
    });
    stub(prisma.chartOfAccount, 'findMany', async (query: Record<string, unknown>) => {
      queries.accounts = query;
      return [{ code: 'REV.01', type: 'Revenue' }];
    });
    stub(prisma.workbookFeatureConfiguration, 'findUnique', async (query: Record<string, unknown>) => {
      queries.healthScoreConfiguration = query;
      return { enabled: healthScoreEnabled, confirmedAt: calculatedAt, version: 3 };
    });
    stub(prisma.partnerScoreSnapshot, 'findFirst', async (query: Record<string, unknown>) => {
      queries.healthScoreSnapshot = query;
      return {
        score: 72,
        alertThreshold: 40,
        alertTriggered: false,
        configurationVersion: 3,
        calculatedAt,
      };
    });

    try {
      const result = await AdvancedFinanceService.getDashboardSummary('entity-fr', asOf);
      assert.equal(result.entity.name, 'SAFE FR');
      assert.equal(result.entity.currencyCode, 'EUR');
      assert.equal(result.kpis.postedRevenue, 200);
      assert.equal(result.kpis.issuedInvoiceAmount, 120);
      assert.deepEqual(result.healthScore, {
        score: 72,
        alertThreshold: 40,
        alertTriggered: false,
        configurationVersion: 3,
        calculatedAt: calculatedAt.toISOString(),
      });
      assert.deepEqual(queries.entity, {
        where: { id: 'entity-fr' },
        select: {
          name: true,
          countryId: true,
          country: { select: { code: true, currencyCode: true } },
        },
      });
      assert.deepEqual(queries.materials, {
        where: { entityId: 'entity-fr' },
        select: { quantity: true, costPrice: true },
      });
      assert.deepEqual(queries.invoices, {
        where: { entityId: 'entity-fr', status: 'ISSUED' },
        select: { status: true, totalAmount: true, currencyCode: true },
      });
      assert.deepEqual(queries.journalLines, {
        where: {
          journalEntry: {
            entityId: 'entity-fr',
            status: 'POSTED',
            date: { gte: new Date('2025-12-01T00:00:00.000Z'), lte: asOf },
          },
        },
        select: {
          accountCode: true,
          debit: true,
          credit: true,
          journalEntry: { select: { date: true } },
        },
      });
      assert.deepEqual(queries.accounts, {
        where: { countryId: 'country-fr' },
        select: { code: true, type: true },
      });
      assert.deepEqual(queries.healthScoreConfiguration, {
        where: { entityId_featureKey: { entityId: 'entity-fr', featureKey: 'financial-health-score' } },
        select: { enabled: true, confirmedAt: true, version: true },
      });
      assert.deepEqual(queries.healthScoreSnapshot, {
        where: {
          entityId: 'entity-fr',
          scoreType: 'HEALTH',
          partnerId: 'entity-fr',
          configurationVersion: 3,
          calculatedAt: { lte: asOf },
        },
        orderBy: [{ calculatedAt: 'desc' }, { id: 'desc' }],
        select: {
          score: true,
          alertThreshold: true,
          alertTriggered: true,
          configurationVersion: true,
          calculatedAt: true,
        },
      });

      healthScoreEnabled = false;
      delete queries.healthScoreSnapshot;
      const disabledResult = await AdvancedFinanceService.getDashboardSummary('entity-fr', asOf);
      assert.equal(disabledResult.healthScore, null);
      assert.equal(queries.healthScoreSnapshot, undefined);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });
});
