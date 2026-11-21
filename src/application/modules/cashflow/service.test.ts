import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import { CashflowRequestError } from './errors';
import { CashflowService } from './service';

describe('CashflowService', () => {
  it('loads one entity, its mapped asset accounts and only its posted ledger lines', async () => {
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
    stub(prisma.cashAccountMapping, 'findMany', async (query: Record<string, unknown>) => {
      queries.mappings = query;
      return [{ accountCode: '5121' }];
    });
    stub(prisma.bankAccount, 'findMany', async (query: Record<string, unknown>) => {
      queries.bankAccounts = query;
      return [];
    });
    stub(prisma.chartOfAccount, 'findMany', async (query: Record<string, unknown>) => {
      queries.accounts = query;
      return [{ code: '5121', description: 'Bank', type: 'Asset' }];
    });
    stub(prisma.journalLine, 'findMany', async (query: Record<string, unknown>) => {
      queries.journal = query;
      return [{
        id: 'line-1',
        accountCode: '5121',
        debit: 100,
        credit: 0,
        description: null,
        journalEntry: {
          entryNumber: 'JE-1',
          date: new Date('2026-03-02T00:00:00.000Z'),
          reference: 'R-1',
          description: 'Receipt',
        },
      }];
    });
    try {
      const result = await CashflowService.getModuleData('entity-fr', '2026-03');
      assert.equal(result.totals.inflows, 100);
      assert.equal(result.totals.closingBalance, 100);
      assert.deepEqual(queries.entity, {
        where: { id: 'entity-fr' },
        select: {
          name: true,
          countryId: true,
          country: { select: { code: true, currencyCode: true } },
        },
      });
      assert.deepEqual(queries.mappings, {
        where: { entityId: 'entity-fr' },
        select: { accountCode: true },
        orderBy: { accountCode: 'asc' },
      });
      assert.deepEqual(queries.bankAccounts, {
        where: { entityId: 'entity-fr', isActive: true },
        select: { ledgerAccountCode: true },
      });
      assert.deepEqual(queries.accounts, {
        where: { countryId: 'country-fr', type: 'Asset', isPostingAllowed: true },
        select: { code: true, description: true, type: true },
        orderBy: { code: 'asc' },
      });
      assert.deepEqual(queries.journal, {
        where: {
          accountCode: { in: ['5121'] },
          journalEntry: {
            entityId: 'entity-fr',
            status: 'POSTED',
            date: { lt: new Date('2026-04-01T00:00:00.000Z') },
          },
        },
        select: {
          id: true,
          accountCode: true,
          debit: true,
          credit: true,
          description: true,
          journalEntry: {
            select: { entryNumber: true, date: true, reference: true, description: true },
          },
        },
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('validates account mappings and replaces them atomically for the authenticated entity', async () => {
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
    let bankAccountQuery: Record<string, unknown> | undefined;
    let deleted: unknown;
    let created: unknown;
    stub(prisma.entity, 'findUnique', async () => ({ countryId: 'country-a' }));
    stub(prisma.bankAccount, 'findMany', async (query: Record<string, unknown>) => {
      bankAccountQuery = query;
      return [{ ledgerAccountCode: '5121' }];
    });
    stub(prisma.chartOfAccount, 'findMany', async (query: Record<string, unknown>) => {
      accountQuery = query;
      return [{ code: '5121' }, { code: '531' }];
    });
    stub(prisma.cashAccountMapping, 'deleteMany', async (query: unknown) => { deleted = query; });
    stub(prisma.cashAccountMapping, 'createMany', async (query: unknown) => { created = query; });
    stub(prisma, '$transaction', async (callback: (transaction: typeof prisma) => Promise<unknown>) => callback(prisma));
    try {
      const result = await CashflowService.setCashAccounts({ accountCodes: ['531', '5121'] }, 'entity-a');
      assert.deepEqual(result, { accountCodes: ['5121', '531'] });
      assert.deepEqual(accountQuery, {
        where: { countryId: 'country-a', type: 'Asset', isPostingAllowed: true, code: { in: ['5121', '531'] } },
        select: { code: true },
      });
      assert.deepEqual(bankAccountQuery, {
        where: { entityId: 'entity-a', isActive: true },
        select: { ledgerAccountCode: true },
      });
      assert.deepEqual(deleted, { where: { entityId: 'entity-a' } });
      assert.deepEqual(created, {
        data: [
          { entityId: 'entity-a', accountCode: '5121' },
          { entityId: 'entity-a', accountCode: '531' },
        ],
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    const restoreEntity = Object.getOwnPropertyDescriptor(prisma.entity, 'findUnique');
    const restoreAccounts = Object.getOwnPropertyDescriptor(prisma.chartOfAccount, 'findMany');
    const restoreBankAccounts = Object.getOwnPropertyDescriptor(prisma.bankAccount, 'findMany');
    Object.defineProperty(prisma.entity, 'findUnique', { configurable: true, value: async () => ({ countryId: 'country-a' }) });
    Object.defineProperty(prisma.chartOfAccount, 'findMany', { configurable: true, value: async () => [] });
    Object.defineProperty(prisma.bankAccount, 'findMany', {
      configurable: true,
      value: async () => [{ ledgerAccountCode: '5121' }],
    });
    try {
      await assert.rejects(CashflowService.setCashAccounts({ accountCodes: ['999'] }, 'entity-a'), (error: unknown) => {
        assert.ok(error instanceof CashflowRequestError);
        assert.equal(error.statusCode, 400);
        return true;
      });
      Object.defineProperty(prisma.chartOfAccount, 'findMany', {
        configurable: true,
        value: async () => [{ code: '531' }],
      });
      await assert.rejects(CashflowService.setCashAccounts({ accountCodes: ['531'] }, 'entity-a'), (error: unknown) => {
        assert.ok(error instanceof CashflowRequestError);
        assert.equal(error.statusCode, 409);
        return true;
      });
    } finally {
      if (restoreEntity) Object.defineProperty(prisma.entity, 'findUnique', restoreEntity);
      else Reflect.deleteProperty(prisma.entity, 'findUnique');
      if (restoreAccounts) Object.defineProperty(prisma.chartOfAccount, 'findMany', restoreAccounts);
      else Reflect.deleteProperty(prisma.chartOfAccount, 'findMany');
      if (restoreBankAccounts) Object.defineProperty(prisma.bankAccount, 'findMany', restoreBankAccounts);
      else Reflect.deleteProperty(prisma.bankAccount, 'findMany');
    }
  });
});
