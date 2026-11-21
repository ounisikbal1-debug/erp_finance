import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import { MONTHLY_CLOSE_CHECKS } from './checklist';
import { MonthlyCloseService } from './service';

function stub(target: object, property: string, value: unknown, restorers: Array<() => void>) {
  const original = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, { configurable: true, value });
  restorers.push(() => {
    if (original) Object.defineProperty(target, property, original);
    else Reflect.deleteProperty(target, property);
  });
}

describe('MonthlyCloseService', () => {
  it('scopes signals and checklist events to the entity and month', async () => {
    const restorers: Array<() => void> = [];
    const queries: Record<string, unknown> = {};
    stub(prisma.entity, 'findUnique', async (query: unknown) => {
      queries.entity = query;
      return { id: 'entity-a', name: 'SAFE TN', country: { currencyCode: 'TND' } };
    }, restorers);
    stub(prisma.monthlyCloseChecklistEvent, 'findMany', async (query: unknown) => {
      queries.events = query;
      return [{
        id: 'event-1',
        checkKey: 'journal-workflow',
        checked: true,
        note: 'Écritures vérifiées.',
        actorUserId: 'user-a',
        actorUsername: 'finance',
        createdAt: new Date('2026-03-20T12:00:00.000Z'),
      }];
    }, restorers);
    stub(prisma.monthlyCloseLock, 'findUnique', async (query: unknown) => {
      queries.lock = query;
      return null;
    }, restorers);
    stub(prisma.journalEntry, 'count', async (query: unknown) => {
      queries.journals = query;
      return 2;
    }, restorers);
    stub(prisma.bankStatementLine, 'count', async (query: unknown) => {
      const callNo = Number(queries.bankCountCalls ?? 0) + 1;
      queries.bankCountCalls = callNo;
      queries[`bank${callNo}`] = query;
      return callNo === 1 ? 3 : 8;
    }, restorers);

    try {
      const result = await MonthlyCloseService.getChecklist('entity-a', '2026-03');
      assert.equal(result.entity.name, 'SAFE TN');
      assert.equal(result.signalCoverage.journalEntriesAwaitingApproval, 2);
      assert.equal(result.signalCoverage.unreconciledBankStatementLines, 3);
      assert.equal(result.signalCoverage.bankStatementLines, 8);
      assert.equal(result.checks.find(({ key }) => key === 'journal-workflow')?.checked, true);
      assert.equal(result.checks.find(({ key }) => key === 'journal-workflow')?.automaticCount, 2);
      assert.equal(result.checks.find(({ key }) => key === 'bank-reconciliation')?.checked, false);
      assert.deepEqual(queries.events, {
        where: { entityId: 'entity-a', period: '2026-03' },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      assert.deepEqual(queries.lock, { where: { entityId_period: { entityId: 'entity-a', period: '2026-03' } } });
      assert.deepEqual(queries.journals, {
        where: {
          entityId: 'entity-a',
          date: { gte: new Date('2026-03-01T00:00:00.000Z'), lt: new Date('2026-04-01T00:00:00.000Z') },
          status: { in: ['TO_REVIEW', 'APPROVED'] },
        },
      });
      assert.deepEqual(queries.bank1, {
        where: {
          entityId: 'entity-a',
          transactionDate: { gte: new Date('2026-03-01T00:00:00.000Z'), lt: new Date('2026-04-01T00:00:00.000Z') },
          reconciliation: { is: null },
        },
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('uses a distinct annual period key and annual date range/checklist', async () => {
    const restorers: Array<() => void> = [];
    const queries: Record<string, unknown> = {};
    stub(prisma.entity, 'findUnique', async () => ({
      id: 'entity-a',
      name: 'SAFE TN',
      country: { currencyCode: 'TND' },
    }), restorers);
    stub(prisma.monthlyCloseChecklistEvent, 'findMany', async (query: unknown) => {
      queries.events = query;
      return [];
    }, restorers);
    stub(prisma.monthlyCloseLock, 'findUnique', async () => null, restorers);
    stub(prisma.journalEntry, 'count', async (query: unknown) => {
      queries.journals = query;
      return 0;
    }, restorers);
    stub(prisma.bankStatementLine, 'count', async (query: unknown) => {
      const callNo = Number(queries.bankCountCalls ?? 0) + 1;
      queries.bankCountCalls = callNo;
      queries[`bank${callNo}`] = query;
      return 0;
    }, restorers);

    try {
      const result = await MonthlyCloseService.getChecklist('entity-a', '2026');
      assert.equal(result.period, '2026');
      assert.equal(result.checks.length, 7);
      assert.equal(result.checks[0].key, 'annual-inventory-review');
      assert.deepEqual(queries.events, {
        where: { entityId: 'entity-a', period: '2026' },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      assert.deepEqual(queries.journals, {
        where: {
          entityId: 'entity-a',
          date: { gte: new Date('2026-01-01T00:00:00.000Z'), lt: new Date('2027-01-01T00:00:00.000Z') },
          status: { in: ['TO_REVIEW', 'APPROVED'] },
        },
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('persists each human confirmation as a separate user-attributed event', async () => {
    const restorers: Array<() => void> = [];
    let created: unknown;
    stub(prisma.monthlyCloseChecklistEvent, 'create', async (query: unknown) => {
      created = query;
      return { id: 'event-2' };
    }, restorers);
    stub(prisma, '$transaction', async (callback: (transaction: typeof prisma) => unknown) => callback(prisma), restorers);
    stub(prisma.monthlyCloseLock, 'findUnique', async () => null, restorers);
    stub(MonthlyCloseService, 'getChecklist', async (entityId: string, period: unknown) => ({
      entity: { id: entityId, name: 'SAFE TN', currencyCode: 'TND' },
      period,
      checks: [],
    }), restorers);

    try {
      const result = await MonthlyCloseService.recordCheck({
        entityId: 'entity-a',
        period: '2026',
        checkKey: 'annual-inventory-review',
        checked: true,
        note: 'Relevés du mois vérifiés.',
        actorUserId: 'user-a',
        actorUsername: 'finance',
      });
      assert.deepEqual(created, {
        data: {
          entityId: 'entity-a',
          period: '2026',
          checkKey: 'annual-inventory-review',
          checked: true,
          note: 'Relevés du mois vérifiés.',
          actorUserId: 'user-a',
          actorUsername: 'finance',
        },
      });
      assert.equal(result.period, '2026');
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('locks a period only after every required control is confirmed', async () => {
    const restorers: Array<() => void> = [];
    let created: unknown;
    stub(prisma, '$transaction', async (callback: (transaction: typeof prisma) => unknown) => callback(prisma), restorers);
    stub(prisma.monthlyCloseLock, 'findUnique', async () => null, restorers);
    stub(prisma.monthlyCloseChecklistEvent, 'findMany', async () => MONTHLY_CLOSE_CHECKS.map((check) => ({
      id: check.key,
      checkKey: check.key,
      checked: true,
    })), restorers);
    stub(prisma.monthlyCloseLock, 'create', async (query: unknown) => {
      created = query;
      return { id: 'lock-a' };
    }, restorers);
    stub(MonthlyCloseService, 'getChecklist', async (_entityId: string, period: unknown) => ({
      period,
      lock: { actorUsername: 'finance' },
    }), restorers);

    try {
      const result = await MonthlyCloseService.lockPeriod({
        entityId: 'entity-a',
        period: '2026-03',
        note: 'Tous les contrôles vérifiés.',
        actorUserId: 'user-a',
        actorUsername: 'finance',
      });
      assert.deepEqual(created, {
        data: {
          entityId: 'entity-a',
          period: '2026-03',
          note: 'Tous les contrôles vérifiés.',
          actorUserId: 'user-a',
          actorUsername: 'finance',
        },
      });
      assert.equal(result.period, '2026-03');
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('does not lock periods with unchecked controls or permit checklist changes after locking', async () => {
    const restorers: Array<() => void> = [];
    let lockCreated = false;
    let eventCreated = false;
    stub(prisma, '$transaction', async (callback: (transaction: typeof prisma) => unknown) => callback(prisma), restorers);
    stub(prisma.monthlyCloseLock, 'findUnique', async () => null, restorers);
    stub(prisma.monthlyCloseChecklistEvent, 'findMany', async () => MONTHLY_CLOSE_CHECKS.slice(1).map((check) => ({
      id: check.key,
      checkKey: check.key,
      checked: true,
    })), restorers);
    stub(prisma.monthlyCloseLock, 'create', async () => { lockCreated = true; return { id: 'lock-a' }; }, restorers);

    try {
      await assert.rejects(MonthlyCloseService.lockPeriod({
        entityId: 'entity-a',
        period: '2026-03',
        note: 'Tous les contrôles vérifiés.',
        actorUserId: 'user-a',
        actorUsername: 'finance',
      }), /qu’après confirmation de tous les contrôles requis/);
      assert.equal(lockCreated, false);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    const lockRestorers: Array<() => void> = [];
    stub(prisma, '$transaction', async (callback: (transaction: typeof prisma) => unknown) => callback(prisma), lockRestorers);
    stub(prisma.monthlyCloseLock, 'findUnique', async () => ({ id: 'lock-a' }), lockRestorers);
    stub(prisma.monthlyCloseChecklistEvent, 'create', async () => { eventCreated = true; return { id: 'event-a' }; }, lockRestorers);
    try {
      await assert.rejects(MonthlyCloseService.recordCheck({
        entityId: 'entity-a',
        period: '2026-03',
        checkKey: 'journal-workflow',
        checked: false,
        note: 'Réouverture demandée.',
        actorUserId: 'user-a',
        actorUsername: 'finance',
      }), /période est clôturée/);
      assert.equal(eventCreated, false);
    } finally {
      lockRestorers.reverse().forEach((restore) => restore());
    }
  });
});
