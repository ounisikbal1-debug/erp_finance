import prisma from '../../../core/models/prisma';
import { FinanceRequestError } from '../finance/errors';
import {
  getCloseChecks,
  getMonthlyCloseCheckKey,
  isAnnualClosePeriod,
  parseMonthlyClosePeriod,
  validateCloseLockNote,
} from './checklist';

function isUniqueConstraintViolation(error: unknown): boolean {
  return error !== null && typeof error === 'object'
    && 'code' in error && error.code === 'P2002';
}

function getPeriodRange(period: string) {
  const startAt = new Date(isAnnualClosePeriod(period) ? `${period}-01-01T00:00:00.000Z` : `${period}-01T00:00:00.000Z`);
  const endExclusive = new Date(startAt);
  if (isAnnualClosePeriod(period)) endExclusive.setUTCFullYear(endExclusive.getUTCFullYear() + 1);
  else endExclusive.setUTCMonth(endExclusive.getUTCMonth() + 1);
  return { startAt, endExclusive };
}

export class MonthlyCloseService {
  static async getChecklist(entityId: string, value: unknown) {
    const period = parseMonthlyClosePeriod(value);
    const { startAt, endExclusive } = getPeriodRange(period);
    const [entity, events, pendingJournalEntriesCount, unreconciledBankLinesCount, bankStatementLineCount, closeLock] = await Promise.all([
      prisma.entity.findUnique({
        where: { id: entityId },
        select: { id: true, name: true, country: { select: { currencyCode: true } } },
      }),
      prisma.monthlyCloseChecklistEvent.findMany({
        where: { entityId, period },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.journalEntry.count({
        where: {
          entityId,
          date: { gte: startAt, lt: endExclusive },
          status: { in: ['TO_REVIEW', 'APPROVED'] },
        },
      }),
      prisma.bankStatementLine.count({
        where: {
          entityId,
          transactionDate: { gte: startAt, lt: endExclusive },
          reconciliation: { is: null },
        },
      }),
      prisma.bankStatementLine.count({
        where: {
          entityId,
          transactionDate: { gte: startAt, lt: endExclusive },
        },
      }),
      prisma.monthlyCloseLock.findUnique({
        where: { entityId_period: { entityId, period } },
      }),
    ]);

    if (!entity) throw new FinanceRequestError('Société introuvable.', 404);
    const latestEventByCheck = new Map<string, (typeof events)[number]>();
    for (const event of events) {
      if (!latestEventByCheck.has(event.checkKey)) latestEventByCheck.set(event.checkKey, event);
    }

    return {
      entity: { id: entity.id, name: entity.name, currencyCode: entity.country.currencyCode },
      period,
      periodType: isAnnualClosePeriod(period) ? 'annual' as const : 'monthly' as const,
      signalCoverage: {
        journalEntriesAwaitingApproval: pendingJournalEntriesCount,
        bankStatementLines: bankStatementLineCount,
        unreconciledBankStatementLines: unreconciledBankLinesCount,
      },
      checks: getCloseChecks(period).map((check) => {
        const latestEvent = latestEventByCheck.get(check.key);
        const automaticCount = check.key === 'journal-workflow'
          ? pendingJournalEntriesCount
          : check.key === 'bank-reconciliation'
            ? unreconciledBankLinesCount
            : null;
        return {
          ...check,
          checked: latestEvent?.checked ?? false,
          latestEvent: latestEvent ? {
            checked: latestEvent.checked,
            note: latestEvent.note,
            actorUserId: latestEvent.actorUserId,
            actorUsername: latestEvent.actorUsername,
            createdAt: latestEvent.createdAt.toISOString(),
          } : null,
          automaticCount,
        };
      }),
      history: events.map((event) => ({
        id: event.id,
        checkKey: event.checkKey,
        checked: event.checked,
        note: event.note,
        actorUserId: event.actorUserId,
        actorUsername: event.actorUsername,
        createdAt: event.createdAt.toISOString(),
      })),
      historyTruncated: events.length === 500,
      lock: closeLock ? {
        lockedAt: closeLock.lockedAt.toISOString(),
        note: closeLock.note,
        actorUserId: closeLock.actorUserId,
        actorUsername: closeLock.actorUsername,
      } : null,
    };
  }

  static async recordCheck(input: {
    entityId: string;
    period: unknown;
    checkKey: unknown;
    checked: boolean;
    note: string;
    actorUserId: string;
    actorUsername: string;
  }) {
    const period = parseMonthlyClosePeriod(input.period);
    const checkKey = getMonthlyCloseCheckKey(input.checkKey, period);
    await prisma.$transaction(async (transaction) => {
      const lock = await transaction.monthlyCloseLock.findUnique({
        where: { entityId_period: { entityId: input.entityId, period } },
        select: { id: true },
      });
      if (lock) throw new FinanceRequestError('La période est clôturée et ses contrôles ne peuvent plus être modifiés.', 409);
      await transaction.monthlyCloseChecklistEvent.create({
        data: {
          entityId: input.entityId,
          period,
          checkKey,
          checked: input.checked,
          note: input.note,
          actorUserId: input.actorUserId,
          actorUsername: input.actorUsername,
        },
      });
    });
    return await this.getChecklist(input.entityId, period);
  }

  static async lockPeriod(input: {
    entityId: string;
    period: unknown;
    note: unknown;
    actorUserId: string;
    actorUsername: string;
  }) {
    const period = parseMonthlyClosePeriod(input.period);
    const note = validateCloseLockNote(input.note);
    try {
      await prisma.$transaction(async (transaction) => {
        const existing = await transaction.monthlyCloseLock.findUnique({
          where: { entityId_period: { entityId: input.entityId, period } },
          select: { id: true },
        });
        if (existing) throw new FinanceRequestError('Cette période est déjà clôturée.', 409);
        const events = await transaction.monthlyCloseChecklistEvent.findMany({
          where: { entityId: input.entityId, period },
          orderBy: { createdAt: 'desc' },
          take: 500,
        });
        const latestEventByCheck = new Map<string, (typeof events)[number]>();
        for (const event of events) {
          if (!latestEventByCheck.has(event.checkKey)) latestEventByCheck.set(event.checkKey, event);
        }
        const incompleteChecks = getCloseChecks(period).filter(
          (check) => latestEventByCheck.get(check.key)?.checked !== true,
        );
        if (incompleteChecks.length > 0) {
          throw new FinanceRequestError('La période ne peut être clôturée qu’après confirmation de tous les contrôles requis.', 409);
        }
        await transaction.monthlyCloseLock.create({
          data: {
            entityId: input.entityId,
            period,
            note,
            actorUserId: input.actorUserId,
            actorUsername: input.actorUsername,
          },
        });
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new FinanceRequestError('Cette période a été clôturée entre-temps.', 409);
      }
      throw error;
    }
    return this.getChecklist(input.entityId, period);
  }
}

export default MonthlyCloseService;
