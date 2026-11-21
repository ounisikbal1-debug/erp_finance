import prisma from '../../../core/models/prisma';
import { BudgetRequestError } from './errors';
import { buildBudgetReport } from './report';
import { buildBudgetForecastReport } from './forecast';
import {
  parseBudgetForecastPeriod,
  parseBudgetPeriod,
  validateBudgetDraftAmount,
  validateBudgetDraftInput,
  validateBudgetRevisionInput,
} from './validation';

const budgetLineInclude = {
  createdBy: { select: { username: true } },
  approvedBy: { select: { username: true } },
};

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

export class BudgetService {
  static async getAnnualForecast(entityId: string, requestedAsOfPeriod: unknown) {
    const { year, asOfPeriod, yearStart, nextYearStart } = parseBudgetForecastPeriod(requestedAsOfPeriod);
    const periods = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: {
        name: true,
        countryId: true,
        country: { select: { code: true, currencyCode: true } },
      },
    });
    if (!entity) throw new BudgetRequestError('Société introuvable.', 404);
    const [budgetLines, journalLines] = await Promise.all([
      prisma.budgetLine.findMany({
        where: { entityId, period: { in: periods } },
        select: { period: true, accountCode: true, amount: true, status: true },
      }),
      prisma.journalLine.findMany({
        where: {
          journalEntry: {
            entityId,
            status: 'POSTED',
            date: { gte: yearStart, lt: nextYearStart },
          },
        },
        select: { accountCode: true, debit: true, credit: true, journalEntry: { select: { date: true } } },
      }),
    ]);
    const accountCodes = [...new Set([
      ...budgetLines.map((line) => line.accountCode),
      ...journalLines.map((line) => line.accountCode),
    ])];
    const accounts = await prisma.chartOfAccount.findMany({
      where: {
        countryId: entity.countryId,
        isPostingAllowed: true,
        OR: [
          { code: { in: accountCodes } },
          { type: { in: ['Expense', 'Revenue'] } },
        ],
      },
      select: { code: true, description: true, type: true },
    });
    return buildBudgetForecastReport({
      entity: { name: entity.name, countryCode: entity.country.code, currencyCode: entity.country.currencyCode },
      year,
      asOfPeriod,
      accounts,
      budgetLines,
      journalLines: journalLines.map((line) => ({
        accountCode: line.accountCode,
        debit: line.debit,
        credit: line.credit,
        date: line.journalEntry.date,
      })),
    });
  }

  static async getModuleData(entityId: string, requestedPeriod: unknown) {
    const { period, startAt, endExclusive } = parseBudgetPeriod(requestedPeriod);
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: {
        name: true,
        countryId: true,
        country: { select: { code: true, currencyCode: true } },
      },
    });
    if (!entity) throw new BudgetRequestError('Société introuvable.', 404);

    const [budgetLines, journalLines] = await Promise.all([
      prisma.budgetLine.findMany({
        where: { entityId, period },
        include: budgetLineInclude,
        orderBy: [{ accountCode: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.journalLine.findMany({
        where: {
          journalEntry: {
            entityId,
            status: 'POSTED',
            date: { gte: startAt, lt: endExclusive },
          },
        },
        select: { accountCode: true, debit: true, credit: true },
      }),
    ]);

    const accountCodes = [...new Set([
      ...budgetLines.map((line) => line.accountCode),
      ...journalLines.map((line) => line.accountCode),
    ])];
    const accounts = await prisma.chartOfAccount.findMany({
      where: {
        countryId: entity.countryId,
        isPostingAllowed: true,
        OR: [
          { code: { in: accountCodes } },
          { type: { in: ['Expense', 'Revenue'] } },
        ],
      },
      select: { code: true, description: true, type: true },
    });

    return buildBudgetReport({
      entity: {
        name: entity.name,
        countryCode: entity.country.code,
        currencyCode: entity.country.currencyCode,
      },
      period,
      accounts,
      budgetLines,
      journalLines,
    });
  }

  static async createDraftLine(value: unknown, entityId: string, createdByUserId: string) {
    const input = validateBudgetDraftInput(value);
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { countryId: true },
    });
    if (!entity) throw new BudgetRequestError('Société introuvable.', 404);

    const account = await prisma.chartOfAccount.findFirst({
      where: {
        countryId: entity.countryId,
        code: input.accountCode,
        type: { in: ['Expense', 'Revenue'] },
        isPostingAllowed: true,
      },
      select: { code: true },
    });
    if (!account) {
      throw new BudgetRequestError('Le compte doit appartenir au plan comptable du pays de la société et être de type charge ou produit.', 400);
    }

    try {
      return await prisma.budgetLine.create({
        data: {
          entityId,
          period: input.period,
          accountCode: input.accountCode,
          amount: input.amount,
          status: 'DRAFT',
          createdByUserId,
        },
        include: budgetLineInclude,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new BudgetRequestError('Une ligne budgétaire existe déjà pour ce compte et cette période.', 409);
      }
      throw error;
    }
  }

  static async approveLine(id: string, entityId: string, approvedByUserId: string) {
    const existing = await prisma.budgetLine.findFirst({
      where: { id, entityId },
      select: {
        id: true,
        status: true,
        createdByUserId: true,
        period: true,
        accountCode: true,
        revisionNumber: true,
        supersedesLineId: true,
      },
    });
    if (!existing) throw new BudgetRequestError('Ligne budgétaire introuvable.', 404);
    if (existing.status !== 'DRAFT') throw new BudgetRequestError('Seule une ligne en brouillon peut être approuvée.', 409);
    if (existing.createdByUserId === approvedByUserId) {
      throw new BudgetRequestError('Une autre personne doit approuver la ligne budgétaire.', 409);
    }

    if (!existing.supersedesLineId) {
      const updated = await prisma.budgetLine.updateMany({
        where: {
          id,
          entityId,
          status: 'DRAFT',
          createdByUserId: { not: approvedByUserId },
        },
        data: {
          status: 'APPROVED',
          approvedByUserId,
          approvedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        throw new BudgetRequestError('La ligne a changé ou a déjà été approuvée.', 409);
      }
      return prisma.budgetLine.findFirst({
        where: { id, entityId },
        include: budgetLineInclude,
      });
    }

    return prisma.$transaction(async (transaction) => {
      const current = await transaction.budgetLine.findFirst({
        where: { id, entityId, status: 'DRAFT' },
        select: {
          id: true,
          createdByUserId: true,
          period: true,
          accountCode: true,
          revisionNumber: true,
          supersedesLineId: true,
        },
      });
      if (!current || !current.supersedesLineId) {
        throw new BudgetRequestError('La révision a changé; rechargez le budget.', 409);
      }
      if (current.createdByUserId === approvedByUserId) {
        throw new BudgetRequestError('Une autre personne doit approuver la révision budgétaire.', 409);
      }

      const latest = await transaction.budgetLine.findFirst({
        where: {
          entityId,
          period: current.period,
          accountCode: current.accountCode,
        },
        orderBy: { revisionNumber: 'desc' },
        select: { id: true },
      });
      if (latest?.id !== current.id) {
        throw new BudgetRequestError('Une version plus récente existe; rechargez le budget.', 409);
      }
      const predecessor = await transaction.budgetLine.updateMany({
        where: {
          id: current.supersedesLineId,
          entityId,
          period: current.period,
          accountCode: current.accountCode,
          revisionNumber: current.revisionNumber - 1,
          status: 'APPROVED',
        },
        data: { status: 'SUPERSEDED' },
      });
      if (predecessor.count !== 1) {
        throw new BudgetRequestError('La version approuvée précédente a changé; rechargez le budget.', 409);
      }

      const updated = await transaction.budgetLine.updateMany({
        where: {
          id,
          entityId,
          status: 'DRAFT',
          createdByUserId: { not: approvedByUserId },
        },
        data: {
          status: 'APPROVED',
          approvedByUserId,
          approvedAt: new Date(),
        },
      });
      if (updated.count !== 1) throw new BudgetRequestError('La révision a changé pendant l’approbation.', 409);
      return transaction.budgetLine.findFirst({
        where: { id, entityId },
        include: budgetLineInclude,
      });
    });
  }

  static async updateDraftAmount(id: string, entityId: string, value: unknown) {
    const amount = validateBudgetDraftAmount(value);
    const existing = await prisma.budgetLine.findFirst({
      where: { id, entityId },
      select: { id: true, status: true },
    });
    if (!existing) throw new BudgetRequestError('Ligne budgétaire introuvable.', 404);
    if (existing.status !== 'DRAFT') {
      throw new BudgetRequestError('Seule une ligne en brouillon peut être modifiée.', 409);
    }

    const updated = await prisma.budgetLine.updateMany({
      where: { id, entityId, status: 'DRAFT' },
      data: { amount },
    });
    if (updated.count !== 1) {
      throw new BudgetRequestError('La ligne a changé ou a déjà été approuvée.', 409);
    }
    return prisma.budgetLine.findFirst({
      where: { id, entityId },
      include: budgetLineInclude,
    });
  }

  static async createRevision(id: string, entityId: string, value: unknown, createdByUserId: string) {
    const revision = validateBudgetRevisionInput(value);
    const current = await prisma.budgetLine.findFirst({
      where: { id, entityId, status: 'APPROVED' },
      select: { id: true, period: true, accountCode: true, revisionNumber: true },
    });
    if (!current) throw new BudgetRequestError('Seule une ligne budgétaire approuvée peut être révisée.', 409);

    const latest = await prisma.budgetLine.findFirst({
      where: { entityId, period: current.period, accountCode: current.accountCode },
      orderBy: { revisionNumber: 'desc' },
      select: { id: true, revisionNumber: true, status: true },
    });
    if (latest?.id !== current.id || latest.status !== 'APPROVED') {
      throw new BudgetRequestError('Une révision est déjà en cours ou cette version n’est plus courante.', 409);
    }

    try {
      return await prisma.budgetLine.create({
        data: {
          entityId,
          period: current.period,
          accountCode: current.accountCode,
          amount: revision.amount,
          status: 'DRAFT',
          revisionNumber: current.revisionNumber + 1,
          supersedesLineId: current.id,
          revisionReason: revision.reason,
          createdByUserId,
        },
        include: budgetLineInclude,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new BudgetRequestError('Une révision existe déjà pour cette ligne; rechargez le budget.', 409);
      }
      throw error;
    }
  }
}

export default BudgetService;
