import type { Prisma } from '@prisma/client';
import prisma from '../../../data/prisma/client';
import { ConsolidationRequestError } from './errors';

type EliminationPolicy = 'UNCONFIGURED' | 'NO_ELIMINATIONS_CONFIRMED' | 'MANUAL_ADJUSTMENTS';
type ConsolidationMethod = 'FULL' | 'PROPORTIONAL';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parsePeriod(value: unknown): { period: string; start: Date; end: Date } {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new ConsolidationRequestError('La période doit respecter le format AAAA-MM.', 400);
  }
  const [year, month] = value.split('-').map(Number);
  return {
    period: value,
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

function toMillimes(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const scaled = value * 1000;
  const rounded = Math.round(scaled);
  return Number.isSafeInteger(rounded) && Math.abs(scaled - rounded) <= 1e-7 ? rounded : null;
}

function validateMillimeAmount(value: unknown): number {
  const amount = typeof value === 'number' ? value : Number.NaN;
  const millimes = toMillimes(amount);
  if (millimes === null || millimes <= 0) {
    throw new ConsolidationRequestError('Le montant doit être positif et précis au millime.', 400);
  }
  return millimes / 1000;
}

function validateCurrency(value: unknown): string {
  const currencyCode = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new ConsolidationRequestError('La devise de reporting doit être un code ISO à trois lettres.', 400);
  }
  return currencyCode;
}

function applyOwnershipPercentage(amountInMillimes: number, ownershipPercentage: number): number | null {
  const percentageThousandths = ownershipPercentage * 1000;
  if (!Number.isSafeInteger(amountInMillimes) || !Number.isSafeInteger(percentageThousandths)) return null;
  const numerator = BigInt(amountInMillimes) * BigInt(percentageThousandths);
  const rounded = (numerator + 50_000n) / 100_000n;
  return rounded <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rounded) : null;
}

function parseRunDiagnostics(serialized: string): string[] {
  try {
    const parsed: unknown = JSON.parse(serialized);
    return Array.isArray(parsed) && parsed.every((message) => typeof message === 'string')
      ? parsed
      : ['Diagnostic de consolidation invalide.'];
  } catch {
    return ['Diagnostic de consolidation invalide.'];
  }
}

async function findOwnedGroup(groupId: string, ownerEntityId: string) {
  const group = await prisma.consolidationGroup.findFirst({
    where: { id: groupId, ownerEntityId },
    select: {
      id: true,
      ownerEntityId: true,
      name: true,
      reportingCurrencyCode: true,
      eliminationPolicy: true,
    },
  });
  if (!group) throw new ConsolidationRequestError('Groupe de consolidation introuvable pour cette société.', 404);
  return group;
}

function requireActorUserId(userId: unknown): string {
  if (typeof userId !== 'string' || !userId.trim()) {
    throw new ConsolidationRequestError('Une identité utilisateur est requise pour cette opération.', 401);
  }
  return userId.trim();
}

export class ConsolidationService {
  static async listEntities() {
    return prisma.entity.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        country: { select: { code: true, currencyCode: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  static async listGroups(ownerEntityId: string) {
    const groups = await prisma.consolidationGroup.findMany({
      where: { ownerEntityId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        reportingCurrencyCode: true,
        eliminationPolicy: true,
        entities: {
          select: {
            id: true,
            entityId: true,
            ownershipPercentage: true,
            consolidationMethod: true,
            entity: { select: { code: true, name: true, country: { select: { currencyCode: true } } } },
            _count: { select: { accountMappings: true, fxRates: true } },
          },
        },
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, period: true, status: true, diagnostics: true, createdAt: true },
        },
      },
    });
    return groups.map((group) => ({
      ...group,
      runs: group.runs.map((run) => ({ ...run, diagnostics: parseRunDiagnostics(run.diagnostics) })),
    }));
  }

  static async getGroup(groupId: string, ownerEntityId: string) {
    await findOwnedGroup(groupId, ownerEntityId);
    const group = await prisma.consolidationGroup.findFirstOrThrow({
      where: { id: groupId, ownerEntityId },
      include: {
        entities: {
          orderBy: { createdAt: 'asc' },
          include: {
            entity: { select: { id: true, code: true, name: true, country: { select: { code: true, currencyCode: true } } } },
            accountMappings: { orderBy: { localAccountCode: 'asc' } },
            fxRates: { orderBy: { period: 'desc' } },
          },
        },
        adjustments: { orderBy: [{ period: 'desc' }, { createdAt: 'desc' }] },
        eliminationConfirmations: { orderBy: { period: 'desc' } },
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { lines: { orderBy: { groupAccountCode: 'asc' } } },
        },
      },
    });
    return {
      ...group,
      runs: group.runs.map((run) => ({ ...run, diagnostics: parseRunDiagnostics(run.diagnostics) })),
    };
  }

  static async createGroup(value: unknown, ownerEntityId: string) {
    if (!isRecord(value)) throw new ConsolidationRequestError('Les données du groupe sont invalides.', 400);
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    const reportingCurrencyCode = validateCurrency(value.reportingCurrencyCode);
    if (!name || name.length > 100) throw new ConsolidationRequestError('Le nom du groupe est obligatoire (100 caractères maximum).', 400);
    const owner = await prisma.entity.findUnique({
      where: { id: ownerEntityId },
      select: { id: true },
    });
    if (!owner) throw new ConsolidationRequestError('Société propriétaire introuvable.', 404);
    try {
      return await prisma.consolidationGroup.create({
        data: {
          ownerEntityId,
          name,
          reportingCurrencyCode,
          entities: {
            create: {
              entityId: ownerEntityId,
              ownershipPercentage: 100,
              consolidationMethod: 'FULL',
            },
          },
        },
        select: { id: true, name: true, reportingCurrencyCode: true, eliminationPolicy: true },
      });
    } catch (error) {
      if (isRecord(error) && error.code === 'P2002') {
        throw new ConsolidationRequestError('Un groupe porte déjà ce nom pour cette société.', 409);
      }
      throw error;
    }
  }

  static async addEntity(value: unknown, groupId: string, ownerEntityId: string) {
    if (!isRecord(value) || typeof value.entityId !== 'string') {
      throw new ConsolidationRequestError('Sélectionnez une société à ajouter au groupe.', 400);
    }
    const ownershipPercentage = typeof value.ownershipPercentage === 'number' ? value.ownershipPercentage : Number.NaN;
    if (!Number.isFinite(ownershipPercentage) || ownershipPercentage <= 0 || ownershipPercentage > 100
      || !Number.isSafeInteger(ownershipPercentage * 1000)) {
      throw new ConsolidationRequestError('La participation doit être positive, ne pas dépasser 100% et être précise au millième de pourcentage.', 400);
    }
    const consolidationMethod = value.consolidationMethod === undefined ? 'FULL' : value.consolidationMethod;
    if (consolidationMethod !== 'FULL' && consolidationMethod !== 'PROPORTIONAL') {
      throw new ConsolidationRequestError('Choisissez l’intégration globale ou proportionnelle.', 422);
    }
    await findOwnedGroup(groupId, ownerEntityId);
    const entity = await prisma.entity.findUnique({ where: { id: value.entityId }, select: { id: true } });
    if (!entity) throw new ConsolidationRequestError('Société membre introuvable.', 404);
    try {
      return await prisma.consolidationGroupEntity.create({
        data: {
          groupId,
          entityId: entity.id,
          ownershipPercentage,
          consolidationMethod: consolidationMethod as ConsolidationMethod,
        },
        include: {
          entity: { select: { code: true, name: true, country: { select: { currencyCode: true } } } },
        },
      });
    } catch (error) {
      if (isRecord(error) && error.code === 'P2002') {
        throw new ConsolidationRequestError('Cette société est déjà membre du groupe.', 409);
      }
      throw error;
    }
  }

  static async setEliminationPolicy(value: unknown, groupId: string, ownerEntityId: string, userId?: string) {
    if (!isRecord(value)
      || (value.policy !== 'NO_ELIMINATIONS_CONFIRMED' && value.policy !== 'MANUAL_ADJUSTMENTS')) {
      throw new ConsolidationRequestError('Choisissez explicitement l’absence d’éliminations ou la saisie manuelle des ajustements.', 400);
    }
    await findOwnedGroup(groupId, ownerEntityId);
    if (value.policy === 'NO_ELIMINATIONS_CONFIRMED') {
      if (!userId) throw new ConsolidationRequestError('Une confirmation utilisateur est requise pour la période.', 401);
      const { period } = parsePeriod(value.period);
      return prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
        await transaction.consolidationGroup.update({
          where: { id: groupId },
          data: { eliminationPolicy: value.policy as EliminationPolicy },
        });
        const confirmation = await transaction.consolidationEliminationConfirmation.upsert({
          where: { groupId_period: { groupId, period } },
          create: { groupId, period, confirmedByUserId: userId },
          update: { confirmedByUserId: userId, confirmedAt: new Date() },
        });
        return { id: groupId, eliminationPolicy: value.policy, confirmation };
      });
    }
    return prisma.consolidationGroup.update({
      where: { id: groupId },
      data: { eliminationPolicy: value.policy as EliminationPolicy },
      select: { id: true, eliminationPolicy: true },
    });
  }

  static async setAccountMappings(value: unknown, groupId: string, entityId: string, ownerEntityId: string) {
    if (!isRecord(value) || !Array.isArray(value.mappings)) {
      throw new ConsolidationRequestError('La liste des mappings comptables est obligatoire.', 400);
    }
    await findOwnedGroup(groupId, ownerEntityId);
    const membership = await prisma.consolidationGroupEntity.findFirst({
      where: { groupId, entityId },
      include: { entity: { select: { countryId: true } } },
    });
    if (!membership) throw new ConsolidationRequestError('Société absente du périmètre de consolidation.', 404);
    const mappings = value.mappings.map((row) => {
      if (!isRecord(row)) throw new ConsolidationRequestError('Un mapping comptable est invalide.', 400);
      const localAccountCode = typeof row.localAccountCode === 'string' ? row.localAccountCode.trim() : '';
      const groupAccountCode = typeof row.groupAccountCode === 'string' ? row.groupAccountCode.trim() : '';
      const groupAccountDescription = typeof row.groupAccountDescription === 'string'
        ? row.groupAccountDescription.trim()
        : null;
      if (!localAccountCode || !groupAccountCode || localAccountCode.length > 50 || groupAccountCode.length > 50
        || (groupAccountDescription !== null && groupAccountDescription.length > 150)) {
        throw new ConsolidationRequestError('Chaque mapping requiert des comptes locaux et groupe valides.', 400);
      }
      return { localAccountCode, groupAccountCode, groupAccountDescription };
    });
    if (new Set(mappings.map(({ localAccountCode }) => localAccountCode)).size !== mappings.length) {
      throw new ConsolidationRequestError('Un compte local ne peut être mappé qu’une seule fois.', 409);
    }
    const localCodes = mappings.map(({ localAccountCode }) => localAccountCode);
    const accounts = localCodes.length === 0 ? [] : await prisma.chartOfAccount.findMany({
      where: {
        countryId: membership.entity.countryId,
        code: { in: localCodes },
        isPostingAllowed: true,
      },
      select: { code: true },
    });
    if (accounts.length !== localCodes.length) {
      throw new ConsolidationRequestError('Chaque compte local doit exister et être comptabilisable dans le plan pays.', 422);
    }
    return prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      await transaction.consolidationAccountMapping.deleteMany({ where: { membershipId: membership.id } });
      if (mappings.length > 0) {
        await transaction.consolidationAccountMapping.createMany({
          data: mappings.map((mapping) => ({ ...mapping, membershipId: membership.id })),
        });
      }
      return transaction.consolidationAccountMapping.findMany({
        where: { membershipId: membership.id },
        orderBy: { localAccountCode: 'asc' },
      });
    });
  }

  static async listMemberAccounts(groupId: string, entityId: string, ownerEntityId: string) {
    await findOwnedGroup(groupId, ownerEntityId);
    const membership = await prisma.consolidationGroupEntity.findFirst({
      where: { groupId, entityId },
      select: { entity: { select: { countryId: true } } },
    });
    if (!membership) throw new ConsolidationRequestError('Société absente du périmètre de consolidation.', 404);
    return prisma.chartOfAccount.findMany({
      where: { countryId: membership.entity.countryId, isPostingAllowed: true },
      select: { code: true, description: true, type: true },
      orderBy: { code: 'asc' },
    });
  }

  static async setFxRate(value: unknown, groupId: string, entityId: string, ownerEntityId: string) {
    if (!isRecord(value)) throw new ConsolidationRequestError('Le taux de conversion est invalide.', 400);
    const { period } = parsePeriod(value.period);
    const rate = typeof value.rate === 'number' ? value.rate : Number.NaN;
    const source = typeof value.source === 'string' ? value.source.trim() : '';
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1_000_000 || !source || source.length > 120) {
      throw new ConsolidationRequestError('Le taux doit être positif et sa source explicitement renseignée.', 400);
    }
    if (typeof value.rateDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.rateDate)) {
      throw new ConsolidationRequestError('La date du taux doit respecter le format AAAA-MM-JJ.', 400);
    }
    const rateDate = new Date(`${value.rateDate}T00:00:00.000Z`);
    if (!Number.isFinite(rateDate.getTime()) || rateDate.toISOString().slice(0, 10) !== value.rateDate) {
      throw new ConsolidationRequestError('La date du taux est invalide.', 400);
    }
    const { start, end } = parsePeriod(period);
    if (rateDate < start || rateDate >= end) {
      throw new ConsolidationRequestError('La date du taux doit appartenir à la période déclarée.', 400);
    }
    await findOwnedGroup(groupId, ownerEntityId);
    const membership = await prisma.consolidationGroupEntity.findFirst({ where: { groupId, entityId }, select: { id: true } });
    if (!membership) throw new ConsolidationRequestError('Société absente du périmètre de consolidation.', 404);
    return prisma.consolidationFxRate.upsert({
      where: { membershipId_period: { membershipId: membership.id, period } },
      create: { membershipId: membership.id, period, rate, rateDate, source },
      update: { rate, rateDate, source },
    });
  }

  static async createAdjustment(value: unknown, groupId: string, ownerEntityId: string, userId: string) {
    const actorUserId = requireActorUserId(userId);
    if (!isRecord(value)) throw new ConsolidationRequestError('L’ajustement d’élimination est invalide.', 400);
    const { period } = parsePeriod(value.period);
    const description = typeof value.description === 'string' ? value.description.trim() : '';
    const debitAccountCode = typeof value.debitAccountCode === 'string' ? value.debitAccountCode.trim() : '';
    const creditAccountCode = typeof value.creditAccountCode === 'string' ? value.creditAccountCode.trim() : '';
    const amount = validateMillimeAmount(value.amount);
    if (!description || description.length > 250 || !debitAccountCode || !creditAccountCode
      || debitAccountCode === creditAccountCode || debitAccountCode.length > 50 || creditAccountCode.length > 50) {
      throw new ConsolidationRequestError('Renseignez un libellé et deux comptes groupe distincts.', 400);
    }
    const group = await findOwnedGroup(groupId, ownerEntityId);
    if (group.eliminationPolicy !== 'MANUAL_ADJUSTMENTS') {
      throw new ConsolidationRequestError('Configurez d’abord la politique d’ajustements manuels du groupe.', 409);
    }
    const mappedCodes = await prisma.consolidationAccountMapping.findMany({
      where: { membership: { groupId }, groupAccountCode: { in: [debitAccountCode, creditAccountCode] } },
      select: { groupAccountCode: true },
    });
    if (new Set(mappedCodes.map(({ groupAccountCode }) => groupAccountCode)).size !== 2) {
      throw new ConsolidationRequestError('Les deux comptes groupe doivent être définis par les mappings des membres.', 422);
    }
    return prisma.consolidationAdjustment.create({
      data: {
        groupId,
        period,
        description,
        debitAccountCode,
        creditAccountCode,
        amount,
        createdByUserId: actorUserId,
      },
    });
  }

  static async approveAdjustment(adjustmentId: string, ownerEntityId: string, userId: string) {
    const actorUserId = requireActorUserId(userId);
    const adjustment = await prisma.consolidationAdjustment.findFirst({
      where: { id: adjustmentId, group: { ownerEntityId } },
      select: { id: true, status: true, createdByUserId: true },
    });
    if (!adjustment) throw new ConsolidationRequestError('Ajustement d’élimination introuvable pour cette société.', 404);
    if (adjustment.status !== 'DRAFT') throw new ConsolidationRequestError('Cet ajustement a déjà été approuvé.', 409);
    if (!adjustment.createdByUserId || adjustment.createdByUserId === actorUserId) {
      throw new ConsolidationRequestError('La personne ayant préparé l’ajustement ne peut pas l’approuver.', 403);
    }
    const updated = await prisma.consolidationAdjustment.updateMany({
      where: {
        id: adjustment.id,
        status: 'DRAFT',
        createdByUserId: { not: actorUserId },
      },
      data: { status: 'APPROVED', approvedByUserId: actorUserId, approvedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new ConsolidationRequestError('Cet ajustement a déjà été approuvé par un autre contrôleur.', 409);
    }
    const approvedAdjustment = await prisma.consolidationAdjustment.findUnique({ where: { id: adjustment.id } });
    if (!approvedAdjustment) {
      throw new ConsolidationRequestError('L’ajustement approuvé est introuvable.', 409);
    }
    return approvedAdjustment;
  }

  static async run(groupId: string, ownerEntityId: string, requestedPeriod: unknown) {
    const { period, start, end } = parsePeriod(requestedPeriod);
    const group = await prisma.consolidationGroup.findFirst({
      where: { id: groupId, ownerEntityId },
      include: {
        entities: {
          include: {
            entity: { select: { id: true, code: true, country: { select: { id: true, currencyCode: true } } } },
            accountMappings: true,
            fxRates: { where: { period } },
          },
        },
        adjustments: { where: { period } },
        eliminationConfirmations: { where: { period }, select: { id: true } },
      },
    });
    if (!group) throw new ConsolidationRequestError('Groupe de consolidation introuvable pour cette société.', 404);
    const diagnostics: string[] = [];
    if (group.entities.length < 2) diagnostics.push('Ajoutez au moins deux sociétés au périmètre.');
    if (group.eliminationPolicy === 'UNCONFIGURED') {
      diagnostics.push('La politique d’élimination intragroupe n’est pas explicitement configurée.');
    }
    if (group.eliminationPolicy === 'NO_ELIMINATIONS_CONFIRMED' && group.eliminationConfirmations.length === 0) {
      diagnostics.push(`L’absence d’éliminations n’est pas confirmée pour ${period}.`);
    }
    if (group.eliminationPolicy === 'MANUAL_ADJUSTMENTS'
      && !group.adjustments.some((adjustment) => adjustment.status === 'APPROVED')) {
      diagnostics.push('Saisissez et approuvez les ajustements d’élimination de la période, ou confirmez explicitement leur absence.');
    }
    if (group.eliminationPolicy === 'MANUAL_ADJUSTMENTS'
      && group.adjustments.some((adjustment) => adjustment.status !== 'APPROVED')) {
      diagnostics.push('Un ou plusieurs ajustements de la période restent à approuver.');
    }

    const entityIds = group.entities.map(({ entityId }) => entityId);
    const journalEntries = entityIds.length === 0 ? [] : await prisma.journalEntry.findMany({
      where: {
        entityId: { in: entityIds },
        status: 'POSTED',
        date: { gte: start, lt: end },
      },
      select: {
        id: true,
        entryNumber: true,
        entityId: true,
        lines: { select: { accountCode: true, debit: true, credit: true } },
      },
    });
    const memberByEntityId = new Map(group.entities.map((member) => [member.entityId, member]));
    for (const entry of journalEntries) {
      if (entry.lines.length === 0) {
        const member = memberByEntityId.get(entry.entityId);
        diagnostics.push(`L’écriture ${entry.entryNumber} de la société ${member?.entity.code ?? entry.entityId} ne contient aucune ligne comptable.`);
      }
    }
    const journalLines = journalEntries.flatMap((entry) => entry.lines.map((line) => ({
      ...line,
      journalEntry: { id: entry.id, entryNumber: entry.entryNumber, entityId: entry.entityId },
    })));
    const journalEntryTotals = new Map<string, {
      entryNumber: string;
      entityId: string;
      debit: number;
      credit: number;
      valid: boolean;
    }>();
    for (const line of journalLines) {
      const { id, entryNumber, entityId } = line.journalEntry;
      const totals = journalEntryTotals.get(id) ?? {
        entryNumber,
        entityId,
        debit: 0,
        credit: 0,
        valid: true,
      };
      const debit = toMillimes(line.debit);
      const credit = toMillimes(line.credit);
      if (debit === null || credit === null || debit < 0 || credit < 0) {
        totals.valid = false;
      } else {
        totals.debit += debit;
        totals.credit += credit;
        if (!Number.isSafeInteger(totals.debit) || !Number.isSafeInteger(totals.credit)) {
          totals.valid = false;
        }
      }
      journalEntryTotals.set(id, totals);
    }
    for (const totals of journalEntryTotals.values()) {
      const member = memberByEntityId.get(totals.entityId);
      if (totals.valid && member && totals.debit !== totals.credit) {
        diagnostics.push(
          `L’écriture ${totals.entryNumber} de la société ${member.entity.code} n’est pas équilibrée au millime `
          + `(débit ${ (totals.debit / 1000).toFixed(3) } ${member.entity.country.currencyCode}, `
          + `crédit ${ (totals.credit / 1000).toFixed(3) } ${member.entity.country.currencyCode}).`,
        );
      }
    }
    const mappingByEntity = new Map(group.entities.map((member) => [
      member.entityId,
      new Map(member.accountMappings.map((mapping) => [mapping.localAccountCode, mapping.groupAccountCode])),
    ]));
    for (const entityId of entityIds) {
      const missingCodes = [...new Set(journalLines
        .filter((line) => line.journalEntry.entityId === entityId)
        .map((line) => line.accountCode)
        .filter((code) => !mappingByEntity.get(entityId)?.has(code)))];
      if (missingCodes.length > 0) {
        diagnostics.push(`Mapping manquant pour ${entityId}: ${missingCodes.join(', ')}.`);
      }
    }
    for (const member of group.entities) {
      if (member.entity.country.currencyCode !== group.reportingCurrencyCode && member.fxRates.length === 0) {
        diagnostics.push(`Taux de conversion manquant pour ${member.entityId} en ${period}.`);
      }
      const fxRate = member.fxRates[0];
      if (fxRate && (fxRate.rateDate < start || fxRate.rateDate >= end)) {
        diagnostics.push(`La date du taux de conversion de ${member.entityId} n’appartient pas à la période ${period}.`);
      }
      if (member.consolidationMethod !== 'FULL' && member.consolidationMethod !== 'PROPORTIONAL') {
        diagnostics.push(`Méthode de consolidation non prise en charge pour ${member.entityId}.`);
      }
    }

    const mappedTypes = await prisma.chartOfAccount.findMany({
      where: {
        countryId: { in: group.entities.map(({ entity }) => entity.country.id) },
        code: { in: [...new Set(journalLines.map(({ accountCode }) => accountCode))] },
      },
      select: { countryId: true, code: true, type: true },
    });
    const accountTypeByEntityAndCode = new Map<string, string>();
    for (const member of group.entities) {
      for (const account of mappedTypes.filter(({ countryId }) => countryId === member.entity.country.id)) {
        accountTypeByEntityAndCode.set(`${member.entityId}:${account.code}`, account.type);
      }
    }
    const typeByGroupCode = new Map<string, string>();
    for (const member of group.entities) {
      for (const mapping of member.accountMappings) {
        const type = accountTypeByEntityAndCode.get(`${member.entityId}:${mapping.localAccountCode}`);
        const existing = typeByGroupCode.get(mapping.groupAccountCode);
        if (type && existing && existing !== type) {
          diagnostics.push(`Le compte groupe ${mapping.groupAccountCode} reçoit des types comptables incompatibles.`);
        } else if (type) {
          typeByGroupCode.set(mapping.groupAccountCode, type);
        }
      }
    }

    const aggregated = new Map<string, { debit: number; credit: number }>();
    let invalidLineCount = 0;
    for (const line of journalLines) {
      const member = group.entities.find(({ entityId }) => entityId === line.journalEntry.entityId);
      const groupAccountCode = mappingByEntity.get(line.journalEntry.entityId)?.get(line.accountCode);
      const debit = toMillimes(line.debit);
      const credit = toMillimes(line.credit);
      if (!member || !groupAccountCode || debit === null || credit === null || debit < 0 || credit < 0) {
        invalidLineCount += 1;
        continue;
      }
      const rate = member.entity.country.currencyCode === group.reportingCurrencyCode
        ? 1
        : member.fxRates[0]?.rate ?? Number.NaN;
      const ownershipPercentage = member.consolidationMethod === 'PROPORTIONAL'
        ? member.ownershipPercentage
        : 100;
      const includedDebit = member.consolidationMethod === 'PROPORTIONAL'
        ? applyOwnershipPercentage(debit, ownershipPercentage)
        : debit;
      const includedCredit = member.consolidationMethod === 'PROPORTIONAL'
        ? applyOwnershipPercentage(credit, ownershipPercentage)
        : credit;
      const convertedDebit = includedDebit === null ? Number.NaN : Math.round(includedDebit * rate);
      const convertedCredit = includedCredit === null ? Number.NaN : Math.round(includedCredit * rate);
      if (!Number.isSafeInteger(convertedDebit) || !Number.isSafeInteger(convertedCredit)) {
        invalidLineCount += 1;
        continue;
      }
      const totals = aggregated.get(groupAccountCode) ?? { debit: 0, credit: 0 };
      totals.debit += convertedDebit;
      totals.credit += convertedCredit;
      if (!Number.isSafeInteger(totals.debit) || !Number.isSafeInteger(totals.credit)) {
        invalidLineCount += 1;
        aggregated.delete(groupAccountCode);
      } else {
        aggregated.set(groupAccountCode, totals);
      }
    }
    if (invalidLineCount > 0) diagnostics.push(`${invalidLineCount} ligne(s) comptable(s) invalides empêchent la consolidation.`);

    const eliminationTotals = new Map<string, { debit: number; credit: number }>();
    if (group.eliminationPolicy === 'MANUAL_ADJUSTMENTS') {
      for (const adjustment of group.adjustments.filter(({ status }) => status === 'APPROVED')) {
        const amount = toMillimes(adjustment.amount);
        if (amount === null || amount <= 0) {
          diagnostics.push(`L’ajustement ${adjustment.id} n’est pas précis au millime.`);
          continue;
        }
        const debitTotals = eliminationTotals.get(adjustment.debitAccountCode) ?? { debit: 0, credit: 0 };
        const creditTotals = eliminationTotals.get(adjustment.creditAccountCode) ?? { debit: 0, credit: 0 };
        debitTotals.debit += amount;
        creditTotals.credit += amount;
        eliminationTotals.set(adjustment.debitAccountCode, debitTotals);
        eliminationTotals.set(adjustment.creditAccountCode, creditTotals);
      }
    }
    const totalDebit = [...aggregated.values(), ...eliminationTotals.values()].reduce((total, row) => total + row.debit, 0);
    const totalCredit = [...aggregated.values(), ...eliminationTotals.values()].reduce((total, row) => total + row.credit, 0);
    if (!Number.isSafeInteger(totalDebit) || !Number.isSafeInteger(totalCredit) || totalDebit !== totalCredit) {
      diagnostics.push('Les totaux débit/crédit convertis ou ajustés ne sont pas équilibrés au millime.');
    }

    const status = diagnostics.length === 0 ? 'READY' : 'BLOCKED';
    const lines = status === 'READY'
      ? [
        ...[...aggregated].map(([groupAccountCode, totals]) => ({
          groupAccountCode,
          debit: totals.debit / 1000,
          credit: totals.credit / 1000,
          lineType: 'AGGREGATE',
        })),
        ...[...eliminationTotals].map(([groupAccountCode, totals]) => ({
          groupAccountCode,
          debit: totals.debit / 1000,
          credit: totals.credit / 1000,
          lineType: 'ELIMINATION',
        })),
      ]
      : [];
    return prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const run = await transaction.consolidationRun.create({
        data: {
          groupId,
          period,
          status,
          reportingCurrencyCode: group.reportingCurrencyCode,
          diagnostics: JSON.stringify(diagnostics),
          lines: { create: lines },
        },
        include: { lines: { orderBy: { groupAccountCode: 'asc' } } },
      });
      return { ...run, diagnostics };
    });
  }

  static async getRun(runId: string, ownerEntityId: string) {
    const run = await prisma.consolidationRun.findFirst({
      where: { id: runId, group: { ownerEntityId } },
      include: { group: { select: { name: true, reportingCurrencyCode: true } }, lines: { orderBy: { groupAccountCode: 'asc' } } },
    });
    if (!run) throw new ConsolidationRequestError('Résultat de consolidation introuvable pour cette société.', 404);
    return { ...run, diagnostics: parseRunDiagnostics(run.diagnostics) };
  }
}

export default ConsolidationService;
