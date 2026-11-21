import prisma from '../../../core/models/prisma';
import { calculateAdvancedFinancialAnalysis } from './analysis';
import { calculateDashboardSummary } from './dashboard';

export class AdvancedFinanceService {
  static async getDashboardSummary(entityId: string, asOf = new Date()) {
    const periodStart = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 11, 1));
    const [entity, materials, invoices, journalLines, healthScoreConfiguration] = await Promise.all([
      prisma.entity.findUnique({
        where: { id: entityId },
        select: {
          name: true,
          countryId: true,
          country: { select: { code: true, currencyCode: true } },
        },
      }),
      prisma.material.findMany({
        where: { entityId },
        select: { quantity: true, costPrice: true },
      }),
      prisma.invoice.findMany({
        where: { entityId, status: 'ISSUED' },
        select: { status: true, totalAmount: true, currencyCode: true },
      }),
      prisma.journalLine.findMany({
        where: {
          journalEntry: {
            entityId,
            status: 'POSTED',
            date: { gte: periodStart, lte: asOf },
          },
        },
        select: {
          accountCode: true,
          debit: true,
          credit: true,
          journalEntry: { select: { date: true } },
        },
      }),
      prisma.workbookFeatureConfiguration.findUnique({
        where: { entityId_featureKey: { entityId, featureKey: 'financial-health-score' } },
        select: { enabled: true, confirmedAt: true, version: true },
      }),
    ]);
    if (!entity) throw new Error('Société introuvable');

    const accounts = await prisma.chartOfAccount.findMany({
      where: { countryId: entity.countryId },
      select: { code: true, type: true },
    });

    const healthScoreSnapshot = healthScoreConfiguration?.enabled && healthScoreConfiguration.confirmedAt
      ? await prisma.partnerScoreSnapshot.findFirst({
        where: {
          entityId,
          scoreType: 'HEALTH',
          partnerId: entityId,
          configurationVersion: healthScoreConfiguration.version,
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
      })
      : null;
    if (healthScoreSnapshot
      && (!Number.isFinite(healthScoreSnapshot.score)
        || healthScoreSnapshot.score < 0
        || healthScoreSnapshot.score > 100
        || !Number.isFinite(healthScoreSnapshot.alertThreshold)
        || healthScoreSnapshot.alertThreshold < 0
        || healthScoreSnapshot.alertThreshold > 100)) {
      throw new Error('Le score de santé financière enregistré est invalide.');
    }

    const summary = calculateDashboardSummary({
      entity: {
        name: entity.name,
        countryCode: entity.country.code,
        currencyCode: entity.country.currencyCode,
      },
      materials,
      invoices,
      journalLines: journalLines.map((line) => ({
        accountCode: line.accountCode,
        debit: line.debit,
        credit: line.credit,
        date: line.journalEntry.date,
      })),
      accounts,
      asOf,
    });
    return {
      ...summary,
      healthScore: healthScoreSnapshot
        ? {
          score: healthScoreSnapshot.score,
          alertThreshold: healthScoreSnapshot.alertThreshold,
          alertTriggered: healthScoreSnapshot.alertTriggered,
          configurationVersion: healthScoreSnapshot.configurationVersion,
          calculatedAt: healthScoreSnapshot.calculatedAt.toISOString(),
        }
        : null,
    };
  }

  static async getAdvancedFinancialAnalysis(entityId: string, asOf = new Date()) {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: {
        countryId: true,
        country: { select: { code: true, currencyCode: true } },
      },
    });
    if (!entity) throw new Error('Société introuvable');

    const [accounts, journalLines] = await Promise.all([
      prisma.chartOfAccount.findMany({
        where: { countryId: entity.countryId },
        select: { code: true, description: true, type: true, financialCategory: true, isPostingAllowed: true },
      }),
      prisma.journalLine.findMany({
        where: { journalEntry: { entityId, status: 'POSTED', date: { lte: asOf } } },
        select: {
          accountCode: true,
          debit: true,
          credit: true,
          journalEntry: { select: { date: true } },
        },
      }),
    ]);

    return calculateAdvancedFinancialAnalysis({
      countryCode: entity.country.code,
      currency: entity.country.currencyCode,
      accounts,
      journalLines: journalLines.map((line) => ({
        accountCode: line.accountCode,
        debit: line.debit,
        credit: line.credit,
        date: line.journalEntry.date,
      })),
      asOf,
    });
  }
}

export default AdvancedFinanceService;
