import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import { FinanceService } from './service';

describe('FinanceService.getFinancialPeriodSummary', () => {
  it('scopes posted movements to the authenticated entity and classifies them with its country plan', async () => {
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
    stub(prisma.entity, 'findUnique', async (query: Record<string, unknown>) => {
      queries.entity = query;
      return {
        name: 'SAFE FR',
        countryId: 'country-fr',
        country: { code: 'FR', currencyCode: 'EUR', corporateTax: 25 },
      };
    });
    stub(prisma.journalLine, 'findMany', async (query: Record<string, unknown>) => {
      queries.lines = query;
      return [{ accountCode: 'REV.01', debit: 0, credit: 125.5 }];
    });
    stub(prisma.chartOfAccount, 'findMany', async (query: Record<string, unknown>) => {
      queries.accounts = query;
      return [{ code: 'REV.01', description: 'Ventes', type: 'Revenue', financialCategory: 'REVENUE' }];
    });

    try {
      const result = await FinanceService.getFinancialPeriodSummary(
        'entity-fr',
        '2026-01-01',
        '2026-01-31',
        new Date('2026-02-01T00:00:00.000Z'),
      );
      assert.equal(result.entity.currencyCode, 'EUR');
      assert.equal(result.entity.corporateTax, 25);
      assert.equal(result.totals.find(({ type }) => type === 'Revenue')?.movement, 125.5);
      assert.deepEqual(queries.entity, {
        where: { id: 'entity-fr' },
        select: {
          name: true,
          countryId: true,
          country: { select: { code: true, currencyCode: true, corporateTax: true } },
        },
      });
      assert.deepEqual(queries.lines, {
        where: {
          journalEntry: {
            entityId: 'entity-fr',
            status: 'POSTED',
            date: {
              gte: new Date('2026-01-01T00:00:00.000Z'),
              lt: new Date('2026-02-01T00:00:00.000Z'),
            },
          },
        },
        select: { accountCode: true, debit: true, credit: true },
      });
      assert.deepEqual(queries.accounts, {
        where: { countryId: 'country-fr' },
        select: { code: true, description: true, type: true, financialCategory: true },
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });
});
