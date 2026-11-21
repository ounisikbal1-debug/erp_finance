import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import { BudgetService } from './service';

function stub(target: object, property: string, value: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, { configurable: true, value });
  return () => {
    if (original) Object.defineProperty(target, property, original);
    else Reflect.deleteProperty(target, property);
  };
}

describe('BudgetService revisions', () => {
  it('creates a reasoned draft revision without replacing the approved version', async () => {
    const restorers: Array<() => void> = [];
    const queries: Array<{ operation: string; args?: unknown }> = [];
    restorers.push(stub(prisma.budgetLine, 'findFirst', async (args: unknown) => {
      queries.push({ operation: 'findFirst', args });
      if (queries.length === 1) {
        return { id: 'budget-v1', period: '2026-10', accountCode: '601', revisionNumber: 1 };
      }
      return { id: 'budget-v1', revisionNumber: 1, status: 'APPROVED' };
    }));
    restorers.push(stub(prisma.budgetLine, 'create', async (args: unknown) => {
      queries.push({ operation: 'create', args });
      return { id: 'budget-v2', status: 'DRAFT' };
    }));
    try {
      const result = await BudgetService.createRevision('budget-v1', 'entity-a', {
        amount: 125.001,
        reason: 'Actualisation des coûts',
      }, 'preparer');
      assert.deepEqual(result, { id: 'budget-v2', status: 'DRAFT' });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.deepEqual(queries[2], {
      operation: 'create',
      args: {
        data: {
          entityId: 'entity-a',
          period: '2026-10',
          accountCode: '601',
          amount: 125.001,
          status: 'DRAFT',
          revisionNumber: 2,
          supersedesLineId: 'budget-v1',
          revisionReason: 'Actualisation des coûts',
          createdByUserId: 'preparer',
        },
        include: {
          createdBy: { select: { username: true } },
          approvedBy: { select: { username: true } },
        },
      },
    });
  });

  it('does not create another revision while one is already current or pending', async () => {
    const original = Object.getOwnPropertyDescriptor(prisma.budgetLine, 'findFirst');
    let queries = 0;
    Object.defineProperty(prisma.budgetLine, 'findFirst', {
      configurable: true,
      value: async () => {
        queries += 1;
        return queries === 1
          ? { id: 'budget-v1', period: '2026-10', accountCode: '601', revisionNumber: 1 }
          : { id: 'budget-v2', revisionNumber: 2, status: 'DRAFT' };
      },
    });
    const originalCreate = Object.getOwnPropertyDescriptor(prisma.budgetLine, 'create');
    Object.defineProperty(prisma.budgetLine, 'create', {
      configurable: true,
      value: async () => { throw new Error('No revision should be inserted'); },
    });
    try {
      await assert.rejects(BudgetService.createRevision('budget-v1', 'entity-a', {
        amount: 130,
        reason: 'Actualisation',
      }, 'preparer'), /déjà en cours/);
    } finally {
      if (original) Object.defineProperty(prisma.budgetLine, 'findFirst', original);
      else Reflect.deleteProperty(prisma.budgetLine, 'findFirst');
      if (originalCreate) Object.defineProperty(prisma.budgetLine, 'create', originalCreate);
      else Reflect.deleteProperty(prisma.budgetLine, 'create');
    }
  });

  it('supersedes the previous approved line only inside the distinct approval transaction', async () => {
    const restorers: Array<() => void> = [];
    const calls: Array<{ operation: string; args?: unknown }> = [];
    restorers.push(stub(prisma.budgetLine, 'findFirst', async () => ({
      id: 'budget-v2',
      status: 'DRAFT',
      createdByUserId: 'preparer',
      revisionNumber: 2,
      supersedesLineId: 'budget-v1',
      period: '2026-10',
      accountCode: '601',
    })));
    const transaction = {
      budgetLine: {
        async findFirst(args: unknown) {
          calls.push({ operation: 'findFirst', args });
          return calls.length === 1
            ? {
              id: 'budget-v2',
              createdByUserId: 'preparer',
              revisionNumber: 2,
              supersedesLineId: 'budget-v1',
              period: '2026-10',
              accountCode: '601',
            }
            : calls.length === 2 ? { id: 'budget-v2' } : { id: 'budget-v2', status: 'APPROVED' };
        },
        async updateMany(args: unknown) {
          calls.push({ operation: 'updateMany', args });
          return { count: 1 };
        },
      },
    };
    restorers.push(stub(prisma, '$transaction', async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)));
    try {
      const result = await BudgetService.approveLine('budget-v2', 'entity-a', 'reviewer');
      assert.deepEqual(result, { id: 'budget-v2', status: 'APPROVED' });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.deepEqual(calls.filter((call) => call.operation === 'updateMany'), [
      {
        operation: 'updateMany',
        args: {
          where: {
            id: 'budget-v1',
            entityId: 'entity-a',
            period: '2026-10',
            accountCode: '601',
            revisionNumber: 1,
            status: 'APPROVED',
          },
          data: { status: 'SUPERSEDED' },
        },
      },
      {
        operation: 'updateMany',
        args: {
          where: {
            id: 'budget-v2',
            entityId: 'entity-a',
            status: 'DRAFT',
            createdByUserId: { not: 'reviewer' },
          },
          data: {
            status: 'APPROVED',
            approvedByUserId: 'reviewer',
            approvedAt: (calls[3]?.args as { data: { approvedAt: Date } }).data.approvedAt,
          },
        },
      },
    ]);
    assert.ok(((calls[3]?.args as { data: { approvedAt: unknown } }).data.approvedAt) instanceof Date);
  });
});
