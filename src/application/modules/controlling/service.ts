import prisma from '../../../core/models/prisma';
import { buildCostCenterFilter, buildCostCenterJournalFilter } from './filters';
import { calculateCostCenterAnalytics } from './analytics';
import { ControllingRequestError } from './errors';
import { parseControllingPeriod, validateCostCenterDraft, validateCostCenterUpdate } from './validation';

export class ControllingService {
  static async listCostCenters(entityId: string) {
    return await prisma.costCenter.findMany({
      where: buildCostCenterFilter(entityId),
      orderBy: { code: 'asc' },
    });
  }

  static async getCostCenterAnalytics(entityId: string, requestedPeriod?: unknown) {
    const period = parseControllingPeriod(requestedPeriod);
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { countryId: true },
    });
    if (!entity) throw new Error('Société introuvable');
    const costCenters = await this.listCostCenters(entityId);
    const lines = await prisma.journalLine.findMany({
      where: buildCostCenterJournalFilter(entityId, period.startAt && period.endExclusive
        ? { startAt: period.startAt, endExclusive: period.endExclusive }
        : null),
      select: { costCenterCode: true, accountCode: true, debit: true, credit: true },
    });
    const accountCodes = [...new Set(lines.map((line) => line.accountCode))];
    const accounts = accountCodes.length === 0
      ? []
      : await prisma.chartOfAccount.findMany({
        where: { countryId: entity.countryId, code: { in: accountCodes } },
        select: { code: true, type: true },
      });
    return calculateCostCenterAnalytics(
      costCenters,
      lines,
      accounts,
    );
  }

  static async createCostCenter(value: unknown, entityId: string) {
    const input = validateCostCenterDraft(value);
    try {
      return await prisma.costCenter.create({ data: { ...input, entityId } });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw new ControllingRequestError('Ce code de centre de coûts est déjà utilisé.', 409);
      }
      throw error;
    }
  }

  static async updateCostCenter(code: string, value: unknown, entityId: string) {
    const input = validateCostCenterUpdate(value);
    const existing = await prisma.costCenter.findFirst({
      where: { code, entityId },
      select: { id: true },
    });
    if (!existing) throw new ControllingRequestError('Centre de coûts introuvable.', 404);
    const updated = await prisma.costCenter.updateMany({
      where: { code, entityId },
      data: input,
    });
    if (updated.count !== 1) throw new ControllingRequestError('Le centre de coûts a changé; rechargez la liste.', 409);
    return prisma.costCenter.findFirst({ where: { code, entityId } });
  }
}

export default ControllingService;
