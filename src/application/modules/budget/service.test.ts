import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import { BudgetRequestError } from './errors';
import { BudgetService } from './service';

describe('BudgetService', () => {
  it('loads one entity, its full fiscal year, approved budgets and posted monthly actuals for the annual forecast', async () => {
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
      return { name: 'SAFE TN', countryId: 'country-tn', country: { code: 'TN', currencyCode: 'TND' } };
    });
    stub(prisma.budgetLine, 'findMany', async (query: Record<string, unknown>) => {
      queries.budgets = query;
      return [{
        period: '2026-12', accountCode: '601', amount: 125, status: 'APPROVED',
      }];
    });
    stub(prisma.journalLine, 'findMany', async (query: Record<string, unknown>) => {
      queries.journal = query;
      return [{
        accountCode: '601',
        debit: 50,
        credit: 0,
        journalEntry: { date: new Date('2026-10-15T00:00:00.000Z') },
      }];
    });
    stub(prisma.chartOfAccount, 'findMany', async (query: Record<string, unknown>) => {
      queries.accounts = query;
      return [{ code: '601', description: 'Achats', type: 'Expense' }];
    });

    try {
      const result = await BudgetService.getAnnualForecast('entity-tn', '2026-10');
      assert.equal(result.year, 2026);
      assert.equal(result.lines[0].actualYtd, 50);
      assert.deepEqual(queries.entity, {
        where: { id: 'entity-tn' },
        select: {
          name: true,
          countryId: true,
          country: { select: { code: true, currencyCode: true } },
        },
      });
      assert.deepEqual(queries.budgets, {
        where: {
          entityId: 'entity-tn',
          period: { in: Array.from({ length: 12 }, (_, index) => `2026-${String(index + 1).padStart(2, '0')}`) },
        },
        select: { period: true, accountCode: true, amount: true, status: true },
      });
      assert.deepEqual(queries.journal, {
        where: {
          journalEntry: {
            entityId: 'entity-tn',
            status: 'POSTED',
            date: {
              gte: new Date('2026-01-01T00:00:00.000Z'),
              lt: new Date('2027-01-01T00:00:00.000Z'),
            },
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
        where: {
          countryId: 'country-tn',
          isPostingAllowed: true,
          OR: [
            { code: { in: ['601'] } },
            { type: { in: ['Expense', 'Revenue'] } },
          ],
        },
        select: { code: true, description: true, type: true },
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('loads one entity and month of approved/draft budgets with posted ledger actuals and country accounts', async () => {
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
      return { name: 'SAFE FR', countryId: 'country-fr', country: { code: 'FR', currencyCode: 'EUR' } };
    });
    stub(prisma.budgetLine, 'findMany', async (query: Record<string, unknown>) => {
      queries.budgets = query;
      return [{
        id: 'budget-1',
        period: '2026-02',
        accountCode: '601',
        amount: 125,
        status: 'APPROVED',
        createdByUserId: 'user-a',
        createdBy: { username: 'admin' },
        approvedByUserId: 'user-b',
        approvedBy: { username: 'finance' },
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        approvedAt: new Date('2026-02-02T00:00:00.000Z'),
      }];
    });
    stub(prisma.journalLine, 'findMany', async (query: Record<string, unknown>) => {
      queries.journal = query;
      return [{ accountCode: '601', debit: 50, credit: 0 }];
    });
    stub(prisma.chartOfAccount, 'findMany', async (query: Record<string, unknown>) => {
      queries.accounts = query;
      return [{ code: '601', description: 'Purchases', type: 'Expense' }];
    });

    try {
      const result = await BudgetService.getModuleData('entity-fr', '2026-02');
      assert.equal(result.entity.currencyCode, 'EUR');
      assert.equal(result.lines[0].actual, 50);
      assert.deepEqual(queries.entity, {
        where: { id: 'entity-fr' },
        select: {
          name: true,
          countryId: true,
          country: { select: { code: true, currencyCode: true } },
        },
      });
      assert.deepEqual(queries.budgets, {
        where: { entityId: 'entity-fr', period: '2026-02' },
        include: {
          createdBy: { select: { username: true } },
          approvedBy: { select: { username: true } },
        },
        orderBy: [{ accountCode: 'asc' }, { createdAt: 'asc' }],
      });
      assert.deepEqual(queries.journal, {
        where: {
          journalEntry: {
            entityId: 'entity-fr',
            status: 'POSTED',
            date: {
              gte: new Date('2026-02-01T00:00:00.000Z'),
              lt: new Date('2026-03-01T00:00:00.000Z'),
            },
          },
        },
        select: { accountCode: true, debit: true, credit: true },
      });
      assert.deepEqual(queries.accounts, {
        where: {
          countryId: 'country-fr',
          isPostingAllowed: true,
          OR: [
            { code: { in: ['601'] } },
            { type: { in: ['Expense', 'Revenue'] } },
          ],
        },
        select: { code: true, description: true, type: true },
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('rejects budgets on accounts that are missing or outside the local income/expense accounts', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let accountQuery: Record<string, unknown> | undefined;
    stub(prisma.entity, 'findUnique', async () => ({ countryId: 'country-a' }));
    stub(prisma.chartOfAccount, 'findFirst', async (query: Record<string, unknown>) => {
      accountQuery = query;
      return null;
    });
    try {
      await assert.rejects(BudgetService.createDraftLine({
        period: '2026-10',
        accountCode: '601',
        amount: 12,
      }, 'entity-a', 'creator'), (error: unknown) => {
        assert.ok(error instanceof BudgetRequestError);
        assert.equal(error.statusCode, 400);
        return true;
      });
      assert.deepEqual(accountQuery, {
        where: { countryId: 'country-a', code: '601', type: { in: ['Expense', 'Revenue'] }, isPostingAllowed: true },
        select: { code: true },
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('requires a different user to approve a draft and guards the final update', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let updateQuery: Record<string, unknown> | undefined;
    let updateData: Record<string, unknown> | undefined;
    stub(prisma.budgetLine, 'findFirst', async () => ({
      id: 'budget-1',
      status: 'DRAFT',
      createdByUserId: 'creator',
    }));
    stub(prisma.budgetLine, 'updateMany', async (query: Record<string, unknown>) => {
      updateQuery = query;
      updateData = query.data as Record<string, unknown>;
      return { count: 1 };
    });
    try {
      const approved = await BudgetService.approveLine('budget-1', 'entity-a', 'reviewer');
      assert.deepEqual(updateQuery, {
        where: {
          id: 'budget-1',
          entityId: 'entity-a',
          status: 'DRAFT',
          createdByUserId: { not: 'reviewer' },
        },
        data: updateData,
      });
      assert.equal(updateData?.status, 'APPROVED');
      assert.equal(updateData?.approvedByUserId, 'reviewer');
      assert.ok(updateData?.approvedAt instanceof Date);
      assert.equal(approved?.id, 'budget-1');
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    const original = Object.getOwnPropertyDescriptor(prisma.budgetLine, 'findFirst');
    Object.defineProperty(prisma.budgetLine, 'findFirst', {
      configurable: true,
      value: async () => ({ id: 'budget-1', status: 'DRAFT', createdByUserId: 'same-user' }),
    });
    try {
      await assert.rejects(BudgetService.approveLine('budget-1', 'entity-a', 'same-user'), /autre personne/);
    } finally {
      if (original) Object.defineProperty(prisma.budgetLine, 'findFirst', original);
      else Reflect.deleteProperty(prisma.budgetLine, 'findFirst');
    }
  });

  it('updates only draft amounts within the requested entity', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let updateQuery: Record<string, unknown> | undefined;
    stub(prisma.budgetLine, 'findFirst', async () => ({ id: 'budget-1', status: 'DRAFT' }));
    stub(prisma.budgetLine, 'updateMany', async (query: Record<string, unknown>) => {
      updateQuery = query;
      return { count: 1 };
    });
    try {
      const result = await BudgetService.updateDraftAmount('budget-1', 'entity-a', { amount: 99.123 });
      assert.deepEqual(updateQuery, {
        where: { id: 'budget-1', entityId: 'entity-a', status: 'DRAFT' },
        data: { amount: 99.123 },
      });
      assert.equal(result?.id, 'budget-1');
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('does not allow approved budget amounts to be edited', async () => {
    const original = Object.getOwnPropertyDescriptor(prisma.budgetLine, 'findFirst');
    Object.defineProperty(prisma.budgetLine, 'findFirst', {
      configurable: true,
      value: async () => ({ id: 'budget-1', status: 'APPROVED' }),
    });
    try {
      await assert.rejects(BudgetService.updateDraftAmount('budget-1', 'entity-a', { amount: 99 }), /brouillon/);
    } finally {
      if (original) Object.defineProperty(prisma.budgetLine, 'findFirst', original);
      else Reflect.deleteProperty(prisma.budgetLine, 'findFirst');
    }
  });
});
