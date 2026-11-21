import type { PrismaClient, Prisma } from '@prisma/client';
import { FinanceRequestError } from './errors';
import { appendJournalEntryAuditRecord } from './audit-chain';
import { assertAccountingPeriodOpen } from './posting-period';

export type DepreciationMethod = 'STRAIGHT_LINE' | 'DECLINING_BALANCE';
export type AssetCategory =
  | 'CONSTRUCTIONS'
  | 'EQUIPMENT_MACHINERY'
  | 'TRANSPORT'
  | 'IT_OFFICE'
  | 'FURNITURE';

export interface AssetData {
  id: string;
  entityId: string;
  code: string;
  name: string;
  category: AssetCategory;
  assetAccountCode: string;
  depreciationAccountCode: string;
  expenseAccountCode: string;
  acquisitionDate: string; // ISO
  inServiceDate: string; // ISO
  grossValue: number; // millimes (ou entiers)
  salvageValue: number;
  usefulLifeMonths: number;
  method: DepreciationMethod;
  accumulatedDepreciation: number;
  bookValue: number;
  status: 'IN_SERVICE' | 'DISPOSED' | 'FULLY_DEPRECIATED';
  costCenterId?: string | null;
  profitCenterId?: string | null;
}

export interface DepreciationScheduleYear {
  year: number;
  startingBookValue: number;
  depreciationAmount: number;
  accumulatedDepreciation: number;
  endingBookValue: number;
}

export function calculateStraightLineSchedule(
  grossValue: number,
  salvageValue: number,
  usefulLifeMonths: number,
  inServiceDate: Date,
): DepreciationScheduleYear[] {
  const depreciableAmount = Math.max(0, grossValue - salvageValue);
  if (depreciableAmount <= 0 || usefulLifeMonths <= 0) return [];

  const startYear = inServiceDate.getUTCFullYear();
  const startMonth = inServiceDate.getUTCMonth(); // 0 to 11
  const monthsInFirstYear = 12 - startMonth;
  const monthlyRate = depreciableAmount / usefulLifeMonths;

  const schedule: DepreciationScheduleYear[] = [];
  let currentBookValue = grossValue;
  let accumulated = 0;
  let remainingMonths = usefulLifeMonths;
  let currentYear = startYear;

  while (remainingMonths > 0) {
    const monthsThisYear = schedule.length === 0 ? Math.min(monthsInFirstYear, remainingMonths) : Math.min(12, remainingMonths);
    const amount = Math.min(Math.round(monthlyRate * monthsThisYear), currentBookValue - salvageValue);
    const startingVnc = currentBookValue;
    accumulated += amount;
    currentBookValue -= amount;
    remainingMonths -= monthsThisYear;

    schedule.push({
      year: currentYear,
      startingBookValue: startingVnc,
      depreciationAmount: amount,
      accumulatedDepreciation: accumulated,
      endingBookValue: currentBookValue,
    });

    currentYear++;
  }

  return schedule;
}

export class FixedAssetsService {
  constructor(private readonly prisma: PrismaClient) {}

  public computeSchedule(
    grossValue: number,
    salvageValue: number,
    usefulLifeMonths: number,
    inServiceDateStr: string,
  ): DepreciationScheduleYear[] {
    const inServiceDate = new Date(inServiceDateStr);
    return calculateStraightLineSchedule(grossValue, salvageValue, usefulLifeMonths, inServiceDate);
  }

  /**
   * Comptabilise la dotation périodique d'une immobilisation dans le Grand Livre
   * Débit: Compte de dotation (ex: 681100)
   * Crédit: Compte d'amortissement cumulé (ex: 281500)
   */
  public async postDepreciationEntry(
    entityId: string,
    asset: AssetData,
    fiscalYear: number,
    amount: number,
    actor: { id: string; username: string },
    postingDate = new Date(),
  ) {
    if (amount <= 0) throw new FinanceRequestError('Le montant de la dotation doit être strictement positif.', 400);
    if (asset.bookValue <= asset.salvageValue) {
      throw new FinanceRequestError("L'immobilisation est déjà totalement amortie.", 400);
    }

    const cappedAmount = Math.min(amount, asset.bookValue - asset.salvageValue);

    return this.prisma.$transaction(async (tx) => {
      await assertAccountingPeriodOpen(tx, entityId, postingDate);

      const entryNumber = `DOT-${asset.code}-${fiscalYear}`;
      const existing = await tx.journalEntry.findFirst({
        where: { entityId, entryNumber },
      });
      if (existing) {
        throw new FinanceRequestError(`La dotation pour l'année ${fiscalYear} a déjà été comptabilisée (${entryNumber}).`, 409);
      }

      const journalEntry = await tx.journalEntry.create({
        data: {
          entityId,
          entryNumber,
          date: postingDate,
          journal: 'OPERATIONS_DIVERSES',
          reference: `AMORT-${asset.code}`,
          description: `Dotation aux amortissements ${fiscalYear} - ${asset.name}`,
          status: 'POSTED',
          lines: {
            create: [
              {
                accountCode: asset.expenseAccountCode,
                description: `Dotation amort. ${asset.name}`,
                debit: cappedAmount,
                credit: 0,
                costCenterCode: asset.costCenterId ?? null,
              },
              {
                accountCode: asset.depreciationAccountCode,
                description: `Amortissement cumulé ${asset.name}`,
                debit: 0,
                credit: cappedAmount,
                costCenterCode: asset.costCenterId ?? null,
              },
            ],
          },
        },
      });

      await appendJournalEntryAuditRecord(tx, journalEntry.id);
      await tx.journalEntryWorkflowEvent.create({
        data: {
          journalEntryId: journalEntry.id,
          action: 'POSTED',
          actorUserId: actor.id,
          actorUsername: actor.username,
          note: `Dotation annuelle ${fiscalYear} pour immobilisation ${asset.code}`,
        },
      });

      return {
        journalEntryId: journalEntry.id,
        entryNumber: journalEntry.entryNumber,
        depreciationAmount: cappedAmount,
        newAccumulatedDepreciation: asset.accumulatedDepreciation + cappedAmount,
        newBookValue: asset.bookValue - cappedAmount,
      };
    });
  }

  /**
   * Sortie d'actif (Cession ou mise au rebut)
   */
  public async postAssetDisposal(
    entityId: string,
    asset: AssetData,
    salePrice: number,
    proceedsAccountCode: string,
    actor: { id: string; username: string },
    disposalDate = new Date(),
  ) {
    const netBookValue = asset.bookValue; // Valeur Nette Comptable
    const gainOrLoss = salePrice - netBookValue;

    return this.prisma.$transaction(async (tx) => {
      await assertAccountingPeriodOpen(tx, entityId, disposalDate);

      const entryNumber = `CES-${asset.code}-${Date.now()}`;
      const lines: Array<Prisma.JournalLineCreateWithoutJournalEntryInput> = [];

      // 1. Solde du compte d'amortissement cumulé (Débit 28x)
      if (asset.accumulatedDepreciation > 0) {
        lines.push({
          accountCode: asset.depreciationAccountCode,
          description: `Annulation amort. ${asset.name}`,
          debit: asset.accumulatedDepreciation,
          credit: 0,
        });
      }

      // 2. Encaissement ou créance de cession si vente (Débit 5x ou 4x)
      if (salePrice > 0) {
        lines.push({
          accountCode: proceedsAccountCode,
          description: `Produit cession ${asset.name}`,
          debit: salePrice,
          credit: 0,
        });
      }

      // 3. Sortie de la valeur brute d'origine (Crédit 21x)
      lines.push({
        accountCode: asset.assetAccountCode,
        description: `Sortie actif valeur brute ${asset.name}`,
        debit: 0,
        credit: asset.grossValue,
      });

      // 4. Équilibrage Plus-value (Crédit 756) ou Moins-value (Débit 656)
      if (gainOrLoss > 0) {
        lines.push({
          accountCode: '756000',
          description: `Plus-value sur cession ${asset.name}`,
          debit: 0,
          credit: gainOrLoss,
        });
      } else if (gainOrLoss < 0) {
        lines.push({
          accountCode: '656000',
          description: `Moins-value sur cession ${asset.name}`,
          debit: Math.abs(gainOrLoss),
          credit: 0,
        });
      }

      const journalEntry = await tx.journalEntry.create({
        data: {
          entityId,
          entryNumber,
          date: disposalDate,
          journal: 'OPERATIONS_DIVERSES',
          reference: `SORTIE-${asset.code}`,
          description: `Sortie d'actif ${asset.name} (Prix: ${salePrice})`,
          status: 'POSTED',
          lines: { create: lines },
        },
      });

      await appendJournalEntryAuditRecord(tx, journalEntry.id);
      await tx.journalEntryWorkflowEvent.create({
        data: {
          journalEntryId: journalEntry.id,
          action: 'POSTED',
          actorUserId: actor.id,
          actorUsername: actor.username,
          note: `Sortie d'actif ${asset.code} - Plus/Moins-value: ${gainOrLoss}`,
        },
      });

      return {
        journalEntryId: journalEntry.id,
        entryNumber: journalEntry.entryNumber,
        netBookValue,
        gainOrLoss,
        status: 'DISPOSED' as const,
      };
    });
  }
}
