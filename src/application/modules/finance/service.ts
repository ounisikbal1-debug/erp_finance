import type { Prisma } from '@prisma/client';
import prisma from '../../../data/prisma/client';
import { JournalEntryInput, validateJournalEntry, validateJournalReversalDate } from './journal-validation';
import { aggregateBalance, buildBalanceLineFilter } from './balance';
import { assertAccountCodesExist, assertPostingAccountCodesAllowed } from './account-validation';
import { FinanceRequestError } from './errors';
import { assertAccountingPeriodOpen } from './posting-period';
import { calculateFinancialPeriodSummary, parseFinancialReportPeriod } from './financial-report';
import { appendJournalEntryAuditRecord, verifyJournalEntryAuditChain } from './audit-chain';

export interface JournalWorkflowActor {
  id: string;
  username: string;
}

type JournalReversalHook = (
  tx: Prisma.TransactionClient,
  reversal: { id: string; status: string },
) => Promise<void>;

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function requireWorkflowNote(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 5 || value.trim().length > 500) {
    throw new FinanceRequestError('Une note de contrôle de 5 à 500 caractères est obligatoire.', 400);
  }
  return value.trim();
}

export class FinanceService {
  /**
   * Plan comptable associé au pays de l'entité authentifiée.
   */
  static async getChartOfAccounts(entityId: string) {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { countryId: true },
    });
    if (!entity) throw new FinanceRequestError('Société introuvable', 404);
    return await prisma.chartOfAccount.findMany({
      where: { countryId: entity.countryId },
      orderBy: [{ classNumber: 'asc' }, { code: 'asc' }],
    });
  }

  /**
   * Création d'une écriture comptable en partie double (Règle fondamentale Comptabilité SAFE)
   */
  static async createJournalEntry(input: JournalEntryInput, actor: JournalWorkflowActor, noteValue: unknown) {
    const data = validateJournalEntry(input);
    const note = requireWorkflowNote(noteValue);
    const entity = await prisma.entity.findUnique({
      where: { id: data.entityId },
      select: { countryId: true },
    });
    if (!entity) throw new FinanceRequestError('Société introuvable', 404);

    const accountCodes = [...new Set(data.lines.map((line) => line.accountCode))];
    const accounts = await prisma.chartOfAccount.findMany({
      where: { countryId: entity.countryId, code: { in: accountCodes } },
      select: { code: true, isPostingAllowed: true },
    });
    assertAccountCodesExist(accountCodes, accounts.map((account) => account.code));
    try {
      assertPostingAccountCodesAllowed(accountCodes, accounts);
    } catch (error) {
      throw new FinanceRequestError(error instanceof Error ? error.message : 'Compte de regroupement non comptabilisable.', 422);
    }

    return await prisma.$transaction(async (tx) => tx.journalEntry.create({
      data: {
        entryNumber: data.entryNumber,
        entityId: data.entityId,
        ...(data.date ? { date: new Date(`${data.date}T00:00:00.000Z`) } : {}),
        reference: data.reference,
        description: data.description,
        status: 'TO_REVIEW',
        createdByUserId: actor.id,
        createdByUsername: actor.username,
        lines: {
          create: data.lines.map((line) => ({
            accountCode: line.accountCode,
            debit: line.debit,
            credit: line.credit,
            description: line.description,
            costCenterCode: line.costCenterCode,
          })),
        },
        workflowEvents: {
          create: {
            action: 'SUBMITTED',
            actorUserId: actor.id,
            actorUsername: actor.username,
            note,
          },
        },
      },
      include: { lines: true, workflowEvents: true },
    }));
  }

  private static async validateStoredJournalEntry(
    journalEntryId: string,
    entityId: string,
    client: Pick<Prisma.TransactionClient, 'journalEntry' | 'chartOfAccount'>,
  ) {
    const entry = await client.journalEntry.findFirst({
      where: { id: journalEntryId, entityId },
      include: { lines: true, entity: { select: { countryId: true } } },
    });
    if (!entry) throw new FinanceRequestError('Écriture introuvable pour cette société.', 404);
    const data = validateJournalEntry({
      entryNumber: entry.entryNumber,
      entityId: entry.entityId,
      date: entry.date.toISOString().slice(0, 10),
      reference: entry.reference ?? undefined,
      description: entry.description,
      lines: entry.lines.map((line) => ({
        accountCode: line.accountCode,
        debit: line.debit,
        credit: line.credit,
        description: line.description ?? undefined,
        costCenterCode: line.costCenterCode ?? undefined,
      })),
    });
    const codes = [...new Set(data.lines.map((line) => line.accountCode))];
    const accounts = await client.chartOfAccount.findMany({
      where: { countryId: entry.entity.countryId, code: { in: codes } },
      select: { code: true, isPostingAllowed: true },
    });
    assertAccountCodesExist(codes, accounts.map((account) => account.code));
    try {
      assertPostingAccountCodesAllowed(codes, accounts);
    } catch (error) {
      throw new FinanceRequestError(error instanceof Error ? error.message : 'Compte de regroupement non comptabilisable.', 422);
    }
    return entry;
  }

  static async createJournalReversal(
    originalEntryId: string,
    entityId: string,
    actor: JournalWorkflowActor,
    noteValue: unknown,
    dateValue?: unknown,
    onReversal?: JournalReversalHook,
  ) {
    const note = requireWorkflowNote(noteValue);

    try {
      return await prisma.$transaction(async (tx) => {
        const original = await tx.journalEntry.findFirst({
          where: { id: originalEntryId, entityId },
          include: { lines: true },
        });
        if (!original) throw new FinanceRequestError('Écriture introuvable pour cette société.', 404);
        const intercompany = await tx.intercompanyTransaction.findFirst({
          where: { OR: [{ sellerJournalEntryId: original.id }, { buyerJournalEntryId: original.id }] },
          select: { id: true },
        });
        if (intercompany) {
          throw new FinanceRequestError('La contrepassation interco doit être traitée sur les deux sociétés; le workflow de reversal interco n’est pas encore disponible.', 409);
        }
        if (original.status !== 'POSTED') {
          throw new FinanceRequestError('Seule une écriture comptabilisée peut être contrepassée.', 409);
        }
        const existingReversal = await tx.journalEntry.findFirst({
          where: { reversesEntryId: original.id, entityId, status: { not: 'REJECTED' } },
          select: { id: true },
        });
        if (existingReversal) {
          const reversal = await tx.journalEntry.findUnique({
            where: { id: existingReversal.id },
            include: { lines: true, workflowEvents: true },
          });
          if (!reversal) throw new FinanceRequestError('La contrepassation liée est introuvable.', 409);
          await onReversal?.(tx, reversal);
          return reversal;
        }

        await this.validateStoredJournalEntry(original.id, entityId, tx);
        const rejectedAttemptCount = await tx.journalEntry.count({
          where: { reversesEntryId: original.id, entityId, status: 'REJECTED' },
        });
        const reversalDate = validateJournalReversalDate(original.date, dateValue);
        const reversalData = validateJournalEntry({
          entryNumber: rejectedAttemptCount === 0
            ? `REV-${original.entryNumber}`
            : `REV-${original.entryNumber}-${rejectedAttemptCount + 1}`,
          entityId,
          date: reversalDate,
          reference: original.entryNumber,
          description: `Contrepassation de ${original.entryNumber}: ${original.description}`,
          lines: original.lines.map((line) => ({
            accountCode: line.accountCode,
            debit: line.credit,
            credit: line.debit,
            description: line.description ?? undefined,
            costCenterCode: line.costCenterCode ?? undefined,
          })),
        });
        const reversal = await tx.journalEntry.create({
          data: {
            entryNumber: reversalData.entryNumber,
            entityId,
            date: new Date(`${reversalData.date}T00:00:00.000Z`),
            reference: reversalData.reference,
            description: reversalData.description,
            status: 'TO_REVIEW',
            reversesEntryId: original.id,
            createdByUserId: actor.id,
            createdByUsername: actor.username,
            lines: {
              create: reversalData.lines.map((line) => ({
                accountCode: line.accountCode,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
                costCenterCode: line.costCenterCode,
              })),
            },
            workflowEvents: {
              create: {
                action: 'SUBMITTED',
                actorUserId: actor.id,
                actorUsername: actor.username,
                note,
              },
            },
          },
          include: { lines: true, workflowEvents: true },
        });
        await onReversal?.(tx, reversal);
        await tx.journalEntryWorkflowEvent.create({
          data: {
            journalEntryId: original.id,
            action: 'REVERSAL_REQUESTED',
            actorUserId: actor.id,
            actorUsername: actor.username,
            note,
          },
        });
        return reversal;
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      const existing = await prisma.journalEntry.findFirst({
        where: { reversesEntryId: originalEntryId, entityId, status: { not: 'REJECTED' } },
        include: { lines: true, workflowEvents: true },
      });
      if (existing) {
        if (onReversal) {
          await prisma.$transaction(async (tx) => {
            const reversal = await tx.journalEntry.findFirst({
              where: { id: existing.id, entityId },
              select: { id: true, status: true },
            });
            if (!reversal) throw new FinanceRequestError('La contrepassation liée est introuvable.', 409);
            await onReversal(tx, reversal);
          });
        }
        return existing;
      }
      throw error;
    }
  }

  static async approveJournalEntry(
    journalEntryId: string,
    entityId: string,
    actor: JournalWorkflowActor,
    noteValue: unknown,
  ) {
    const note = requireWorkflowNote(noteValue);
    return prisma.$transaction(async (tx) => {
      const current = await tx.journalEntry.findFirst({
        where: { id: journalEntryId, entityId },
        select: { status: true, createdByUserId: true, reversesEntryId: true },
      });
      if (!current) throw new FinanceRequestError('Écriture introuvable pour cette société.', 404);
      const intercompany = await tx.intercompanyTransaction.findFirst({
        where: { OR: [{ sellerJournalEntryId: journalEntryId }, { buyerJournalEntryId: journalEntryId }] },
        select: { id: true },
      });
      if (intercompany) {
        throw new FinanceRequestError('Cette pièce appartient à une paire interco; utilisez le workflow intercompagnies pour approuver les deux sociétés ensemble.', 409);
      }
      if (!current.createdByUserId || current.createdByUserId === actor.id) {
        throw new FinanceRequestError('L’écriture doit être contrôlée par une personne différente de son préparateur.', 422);
      }
      if (current.status !== 'TO_REVIEW') {
        throw new FinanceRequestError('Seule une écriture en attente de contrôle peut être approuvée.', 409);
      }
      await this.validateStoredJournalEntry(journalEntryId, entityId, tx);
      const changed = await tx.journalEntry.updateMany({
        where: { id: journalEntryId, entityId, status: 'TO_REVIEW' },
        data: {
          status: 'APPROVED',
          approvedByUserId: actor.id,
          approvedByUsername: actor.username,
          approvedAt: new Date(),
        },
      });
      if (changed.count !== 1) throw new FinanceRequestError('L’écriture a changé pendant le contrôle; rechargez-la.', 409);
      await tx.journalEntryWorkflowEvent.create({
        data: { journalEntryId, action: 'APPROVED', actorUserId: actor.id, actorUsername: actor.username, note },
      });
      return tx.journalEntry.findUnique({ where: { id: journalEntryId }, include: { lines: true, workflowEvents: true } });
    });
  }

  static async rejectJournalEntry(
    journalEntryId: string,
    entityId: string,
    actor: JournalWorkflowActor,
    noteValue: unknown,
  ) {
    const note = requireWorkflowNote(noteValue);
    return prisma.$transaction(async (tx) => {
      const current = await tx.journalEntry.findFirst({
        where: { id: journalEntryId, entityId },
        select: { status: true, createdByUserId: true, reversesEntryId: true },
      });
      if (!current) throw new FinanceRequestError('Écriture introuvable pour cette société.', 404);
      const intercompany = await tx.intercompanyTransaction.findFirst({
        where: { OR: [{ sellerJournalEntryId: journalEntryId }, { buyerJournalEntryId: journalEntryId }] },
        select: { id: true },
      });
      if (intercompany) {
        throw new FinanceRequestError('Une pièce interco ne peut pas être rejetée seule; la paire doit être traitée ensemble.', 409);
      }
      if (!current.createdByUserId || current.createdByUserId === actor.id) {
        throw new FinanceRequestError('L’écriture doit être contrôlée par une personne différente de son préparateur.', 422);
      }
      if (current.status !== 'TO_REVIEW') {
        throw new FinanceRequestError('Seule une écriture en attente de contrôle peut être rejetée.', 409);
      }
      const changed = await tx.journalEntry.updateMany({
        where: { id: journalEntryId, entityId, status: 'TO_REVIEW' },
        data: { status: 'REJECTED' },
      });
      if (changed.count !== 1) throw new FinanceRequestError('L’écriture a changé pendant le contrôle; rechargez-la.', 409);
      await tx.journalEntryWorkflowEvent.create({
        data: { journalEntryId, action: 'REJECTED', actorUserId: actor.id, actorUsername: actor.username, note },
      });
      if (current.reversesEntryId) {
        await tx.journalEntryWorkflowEvent.create({
          data: {
            journalEntryId: current.reversesEntryId,
            action: 'REVERSAL_REJECTED',
            actorUserId: actor.id,
            actorUsername: actor.username,
            note,
          },
        });
        const purchaseInvoice = await tx.purchaseInvoice.findFirst({
          where: {
            entityId,
            postingJournalEntryId: current.reversesEntryId,
            status: 'CANCELLATION_PENDING',
          },
          select: { id: true },
        });
        if (purchaseInvoice) {
          const reopened = await tx.purchaseInvoice.updateMany({
            where: { id: purchaseInvoice.id, entityId, status: 'CANCELLATION_PENDING' },
            data: { status: 'POSTED' },
          });
          if (reopened.count === 1) {
            await tx.purchaseInvoiceWorkflowEvent.create({
              data: {
                purchaseInvoiceId: purchaseInvoice.id,
                action: 'CANCELLATION_REOPENED',
                actorUserId: actor.id,
                actorUsername: actor.username,
                note: `Contrepassation rejetée: ${note}`,
              },
            });
          }
        }
        const salesInvoice = await tx.invoice.findFirst({
          where: {
            entityId,
            postingJournalEntryId: current.reversesEntryId,
            status: 'CANCELLATION_PENDING',
          },
          select: { id: true },
        });
        if (salesInvoice) {
          const reopened = await tx.invoice.updateMany({
            where: { id: salesInvoice.id, entityId, status: 'CANCELLATION_PENDING' },
            data: { status: 'ISSUED' },
          });
          if (reopened.count === 1) {
            await tx.salesInvoiceWorkflowEvent.create({
              data: {
                invoiceId: salesInvoice.id,
                action: 'CANCELLATION_REOPENED',
                actorUserId: actor.id,
                actorUsername: actor.username,
                note: `Contrepassation rejetée: ${note}`,
              },
            });
          }
        }
      }
      return tx.journalEntry.findUnique({ where: { id: journalEntryId }, include: { lines: true, workflowEvents: true } });
    });
  }

  static async postJournalEntry(
    journalEntryId: string,
    entityId: string,
    actor: JournalWorkflowActor,
    noteValue: unknown,
  ) {
    const note = requireWorkflowNote(noteValue);
    return prisma.$transaction(async (tx) => {
      const current = await tx.journalEntry.findFirst({
        where: { id: journalEntryId, entityId },
        select: { status: true, createdByUserId: true, approvedByUserId: true, reversesEntryId: true, date: true },
      });
      if (!current) throw new FinanceRequestError('Écriture introuvable pour cette société.', 404);
      if (current.status === 'POSTED') {
        return tx.journalEntry.findUnique({ where: { id: journalEntryId }, include: { lines: true, workflowEvents: true } });
      }
      const intercompany = await tx.intercompanyTransaction.findFirst({
        where: { OR: [{ sellerJournalEntryId: journalEntryId }, { buyerJournalEntryId: journalEntryId }] },
        select: { id: true },
      });
      if (intercompany) {
        throw new FinanceRequestError('Cette pièce appartient à une paire interco; comptabilisez les deux sociétés ensemble via le workflow intercompagnies.', 409);
      }
      if (current.status !== 'APPROVED' || !current.approvedByUserId) {
        throw new FinanceRequestError('L’écriture doit être approuvée avant comptabilisation.', 409);
      }
      await assertAccountingPeriodOpen(tx, entityId, current.date);
      if (!current.createdByUserId || current.createdByUserId === actor.id || current.approvedByUserId === actor.id) {
        throw new FinanceRequestError('La comptabilisation exige une identité distincte du préparateur et du contrôleur.', 422);
      }
      await this.validateStoredJournalEntry(journalEntryId, entityId, tx);
      const changed = await tx.journalEntry.updateMany({
        where: { id: journalEntryId, entityId, status: 'APPROVED' },
        data: {
          status: 'POSTED',
          postedByUserId: actor.id,
          postedByUsername: actor.username,
          postedAt: new Date(),
        },
      });
      if (changed.count !== 1) throw new FinanceRequestError('L’écriture a changé avant comptabilisation; rechargez-la.', 409);
      await appendJournalEntryAuditRecord(tx, journalEntryId);
      await tx.journalEntryWorkflowEvent.create({
        data: { journalEntryId, action: 'POSTED', actorUserId: actor.id, actorUsername: actor.username, note },
      });
      if (current.reversesEntryId) {
        const purchaseInvoice = await tx.purchaseInvoice.findFirst({
          where: {
            entityId,
            postingJournalEntryId: current.reversesEntryId,
            status: 'CANCELLATION_PENDING',
          },
          select: { id: true },
        });
        if (purchaseInvoice) {
          const cancelled = await tx.purchaseInvoice.updateMany({
            where: { id: purchaseInvoice.id, entityId, status: 'CANCELLATION_PENDING' },
            data: { status: 'CANCELLED' },
          });
          if (cancelled.count === 1) {
            await tx.purchaseInvoiceWorkflowEvent.create({
              data: {
                purchaseInvoiceId: purchaseInvoice.id,
                action: 'CANCELLED',
                actorUserId: actor.id,
                actorUsername: actor.username,
                note: `Contrepassation comptabilisée: ${note}`,
              },
            });
          }
        }
        const salesInvoice = await tx.invoice.findFirst({
          where: {
            entityId,
            postingJournalEntryId: current.reversesEntryId,
            status: 'CANCELLATION_PENDING',
          },
          select: { id: true },
        });
        if (salesInvoice) {
          const cancelled = await tx.invoice.updateMany({
            where: { id: salesInvoice.id, entityId, status: 'CANCELLATION_PENDING' },
            data: { status: 'CANCELLED' },
          });
          if (cancelled.count === 1) {
            await tx.salesInvoiceWorkflowEvent.create({
              data: {
                invoiceId: salesInvoice.id,
                action: 'CANCELLED',
                actorUserId: actor.id,
                actorUsername: actor.username,
                note: `Contrepassation comptabilisée: ${note}`,
              },
            });
          }
        }
      }
      await tx.fxRevaluationRun.updateMany({
        where: { entityId, revaluationJournalEntryId: journalEntryId, status: 'TO_REVIEW' },
        data: { status: 'POSTED' },
      });
      return tx.journalEntry.findUnique({ where: { id: journalEntryId }, include: { lines: true, workflowEvents: true } });
    });
  }

  static async listJournalEntries(entityId?: string) {
    const where = entityId ? { entityId } : {};
    const entries = await prisma.journalEntry.findMany({
      where,
      include: { lines: true, workflowEvents: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    const reversalTargetIds = entries.flatMap((entry) => entry.reversesEntryId ? [entry.reversesEntryId] : []);
    const reversedByEntries = reversalTargetIds.length
      ? await prisma.journalEntry.findMany({
        where: { reversesEntryId: { in: entries.map((entry) => entry.id) } },
        select: { id: true, entryNumber: true, status: true, reversesEntryId: true },
      })
      : [];
    return entries.map((entry) => ({
      ...entry,
      reversedByEntry: reversedByEntries.find((reversal) => reversal.reversesEntryId === entry.id) ?? null,
    }));
  }

  static verifyAuditChain(entityId: string) {
    return verifyJournalEntryAuditChain(prisma, entityId);
  }

  /**
   * Balance générale des comptes (Grand Livre SAFE)
   */
  static async getBalanceGenerale(entityId?: string) {
    const lines = await prisma.journalLine.findMany({
      where: buildBalanceLineFilter(entityId),
      select: { accountCode: true, debit: true, credit: true },
    });
    return aggregateBalance(lines);
  }

  static async getFinancialPeriodSummary(entityId: string, from: unknown, to: unknown, generatedAt = new Date()) {
    const period = parseFinancialReportPeriod(from, to);
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: {
        name: true,
        countryId: true,
        country: { select: { code: true, currencyCode: true, corporateTax: true } },
      },
    });
    if (!entity) throw new FinanceRequestError('Société introuvable', 404);

    const [journalLines, accounts] = await Promise.all([
      prisma.journalLine.findMany({
        where: {
          journalEntry: {
            entityId,
            status: 'POSTED',
            date: { gte: period.startAt, lt: period.endExclusive },
          },
        },
        select: { accountCode: true, debit: true, credit: true },
      }),
      prisma.chartOfAccount.findMany({
        where: { countryId: entity.countryId },
        select: { code: true, description: true, type: true, financialCategory: true },
      }),
    ]);

    return calculateFinancialPeriodSummary({
      entity: {
        name: entity.name,
        countryCode: entity.country.code,
        currencyCode: entity.country.currencyCode,
        corporateTax: entity.country.corporateTax,
      },
      accounts,
      journalLines,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      generatedAt,
    });
  }
}

export default FinanceService;
