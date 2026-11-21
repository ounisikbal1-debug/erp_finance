import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import prisma from '../../../data/prisma/client';
import {
  BCT_INTERBANK_RATES_URL,
  BCT_INTERBANK_SOURCE_NAME,
} from './bct-interbank';
import {
  calculateOpenFxRevaluationItems,
  firstDayOfNextMonth,
  FxRevaluationError,
  type RevaluationBalance,
  type RevaluationRate,
} from './open-balance-revaluation';
import { appendJournalEntryAuditRecord } from '../finance/audit-chain';

interface FxRateOverride extends RevaluationRate {
  currencyCode: string;
}

interface RevaluationActor {
  id: string;
  username: string;
}

function parseCalendarDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new FxRevaluationError('La date de réévaluation doit respecter le format AAAA-MM-JJ.', 400);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new FxRevaluationError('La date de réévaluation est invalide.', 400);
  }
  const monthEnd = new Date(date);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  if (monthEnd.toISOString().slice(0, 10) !== value) {
    throw new FxRevaluationError('La réévaluation doit porter sur une date de fin de mois.', 400);
  }
  if (date > new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z')) {
    throw new FxRevaluationError('La date de réévaluation ne peut pas être future.', 400);
  }
  return value;
}

function parseOverrides(value: unknown): Map<string, FxRateOverride> {
  if (value === undefined || value === null) return new Map();
  if (!Array.isArray(value)) {
    throw new FxRevaluationError('Les taux manuels doivent être fournis sous forme de liste.', 400);
  }
  const overrides = new Map<string, FxRateOverride>();
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new FxRevaluationError(`Le taux manuel ${index + 1} est invalide.`, 400);
    }
    const input = raw as Record<string, unknown>;
    const currencyCode = typeof input.currencyCode === 'string' ? input.currencyCode.trim().toUpperCase() : '';
    const source = typeof input.source === 'string' ? input.source.trim() : '';
    const effectiveDate = input.effectiveDate;
    if (!/^[A-Z]{3}$/.test(currencyCode) || !source || source.length > 500
      || typeof input.rate !== 'number' || !Number.isFinite(input.rate) || input.rate <= 0
      || typeof effectiveDate !== 'string') {
      throw new FxRevaluationError(`Le taux manuel ${index + 1} doit contenir une devise, un taux positif, une date et une source.`, 400);
    }
    const date = new Date(`${effectiveDate}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)
      || !Number.isFinite(date.getTime())
      || date.toISOString().slice(0, 10) !== effectiveDate) {
      throw new FxRevaluationError(`La date du taux manuel ${currencyCode} est invalide.`, 400);
    }
    if (input.sourceUrl !== undefined && input.sourceUrl !== null
      && (typeof input.sourceUrl !== 'string' || input.sourceUrl.length > 1000)) {
      throw new FxRevaluationError(`L’URL source du taux manuel ${currencyCode} est invalide.`, 400);
    }
    if (input.importedAt !== undefined && input.importedAt !== null
      && (typeof input.importedAt !== 'string' || !Number.isFinite(Date.parse(input.importedAt)))) {
      throw new FxRevaluationError(`La date d’import du taux manuel ${currencyCode} est invalide.`, 400);
    }
    if (overrides.has(currencyCode)) {
      throw new FxRevaluationError(`Un seul taux manuel est admis pour ${currencyCode}.`, 400);
    }
    overrides.set(currencyCode, {
      currencyCode,
      rate: input.rate,
      effectiveDate,
      source,
      sourceUrl: typeof input.sourceUrl === 'string' ? input.sourceUrl : null,
      importedAt: typeof input.importedAt === 'string' ? new Date(input.importedAt).toISOString() : null,
    });
  }
  return overrides;
}

function startAndEndOfDay(value: string) {
  const start = new Date(`${value}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

async function loadClosingRates(
  tx: Prisma.TransactionClient,
  currencies: readonly string[],
  functionalCurrencyCode: string,
  effectiveDate: string,
  overrides: ReadonlyMap<string, FxRateOverride>,
): Promise<Map<string, RevaluationRate>> {
  const rates = new Map<string, RevaluationRate>();
  const currenciesNeedingBct = [...new Set(currencies.filter((currency) => (
    currency !== functionalCurrencyCode && !overrides.has(currency)
  )))];
  for (const [currencyCode, rate] of overrides) {
    if (rate.effectiveDate > effectiveDate) {
      throw new FxRevaluationError(`Le taux manuel de ${currencyCode} est postérieur à la clôture.`, 422);
    }
    rates.set(currencyCode, rate);
  }
  if (currenciesNeedingBct.length === 0) return rates;

  const bctCurrencies = [...new Set([
    ...currenciesNeedingBct.filter((currency) => currency !== 'TND'),
    ...(functionalCurrencyCode === 'TND' ? [] : [functionalCurrencyCode]),
  ])];
  const rows = bctCurrencies.length === 0
    ? []
    : await tx.exchangeRate.findMany({
      where: {
        sourceName: BCT_INTERBANK_SOURCE_NAME,
        rateType: 'INTERBANK',
        quoteCurrency: 'TND',
        baseCurrency: { in: bctCurrencies },
        effectiveDate: { lte: new Date(`${effectiveDate}T23:59:59.999Z`) },
      },
      select: {
        baseCurrency: true,
        rate: true,
        effectiveDate: true,
        importedAt: true,
        sourceUrl: true,
      },
      orderBy: { effectiveDate: 'desc' },
    });
  const dailyRates = new Map<string, Map<string, (typeof rows)[number]>>();
  for (const row of rows) {
    const day = row.effectiveDate.toISOString().slice(0, 10);
    const dayRates = dailyRates.get(day) ?? new Map();
    dayRates.set(row.baseCurrency, row);
    dailyRates.set(day, dayRates);
  }
  const commonDate = [...dailyRates.keys()].sort().reverse().find((day) => (
    bctCurrencies.every((currency) => dailyRates.get(day)?.has(currency))
  ));
  for (const currencyCode of currenciesNeedingBct) {
    const dayRates = commonDate ? dailyRates.get(commonDate) : undefined;
    const documentRate = currencyCode === 'TND' ? null : dayRates?.get(currencyCode);
    const functionalRate = functionalCurrencyCode === 'TND' ? null : dayRates?.get(functionalCurrencyCode);
    if ((currencyCode !== 'TND' && !documentRate)
      || (functionalCurrencyCode !== 'TND' && !functionalRate)) {
      throw new FxRevaluationError(
        `Aucun cours BCT interbancaire commun n’est disponible pour ${currencyCode}/${functionalCurrencyCode} à la clôture; fournissez un taux de clôture daté et sourcé.`,
        409,
      );
    }
    const documentTndRate = currencyCode === 'TND' ? 1 : documentRate!.rate;
    const functionalTndRate = functionalCurrencyCode === 'TND' ? 1 : functionalRate!.rate;
    const rate = documentTndRate / functionalTndRate;
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new FxRevaluationError(`Les cours BCT ne permettent pas une conversion sûre pour ${currencyCode}.`, 422);
    }
    const importedAt = [documentRate?.importedAt, functionalRate?.importedAt]
      .filter((value): value is Date => value !== undefined)
      .reduce((latest, value) => (value > latest ? value : latest), new Date(0));
    const sourceParts = [
      documentRate ? `${currencyCode}/TND=${documentRate.rate}` : null,
      functionalRate ? `${functionalCurrencyCode}/TND=${functionalRate.rate}` : null,
    ].filter((value): value is string => value !== null);
    rates.set(currencyCode, {
      rate,
      effectiveDate: commonDate!,
      source: `${BCT_INTERBANK_SOURCE_NAME}; ${sourceParts.join('; ')}; cours du ${commonDate}`,
      sourceUrl: documentRate?.sourceUrl ?? functionalRate?.sourceUrl ?? BCT_INTERBANK_RATES_URL,
      importedAt: importedAt.getTime() === 0 ? null : importedAt.toISOString(),
    });
  }
  return rates;
}

function getReversalDate(effectiveDate: string): Date {
  return new Date(`${firstDayOfNextMonth(effectiveDate)}T00:00:00.000Z`);
}

export class FxRevaluationService {
  static async createRun(input: {
    effectiveDate: unknown;
    rateOverrides?: unknown;
    note: unknown;
  }, entityId: string, actor: RevaluationActor) {
    const effectiveDate = parseCalendarDate(input.effectiveDate);
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    if (!note || note.length > 500) {
      throw new FxRevaluationError('Une note de contrôle est obligatoire (500 caractères maximum).', 400);
    }
    const overrides = parseOverrides(input.rateOverrides);
    const { start, end } = startAndEndOfDay(effectiveDate);

    return prisma.$transaction(async (tx) => {
      const existing = await tx.fxRevaluationRun.findUnique({
        where: { entityId_effectiveDate: { entityId, effectiveDate: start } },
        include: { items: true, revaluationJournalEntry: { include: { lines: true } } },
      });
      if (existing) return existing;

      const entity = await tx.entity.findUnique({
        where: { id: entityId },
        select: {
          code: true,
          countryId: true,
          country: {
            select: {
              currencyCode: true,
              unrealizedFxGainAccountCode: true,
              unrealizedFxLossAccountCode: true,
            },
          },
          cashflowAccountingMapping: {
            select: { receivableAccountCode: true, payableAccountCode: true },
          },
        },
      });
      if (!entity) throw new FxRevaluationError('Société introuvable.', 404);
      const functionalCurrencyCode = entity.country.currencyCode.toUpperCase();
      const [invoices, purchaseInvoices] = await Promise.all([
        tx.invoice.findMany({
          where: {
            entityId,
            status: { in: ['ISSUED', 'PAID'] },
            createdAt: { lt: end },
          },
          select: {
            id: true,
            documentCurrencyCode: true,
            functionalCurrencyCode: true,
            currencyCode: true,
            documentTotalAmount: true,
            totalAmount: true,
            cashflowPayments: {
              where: { entityId, paidAt: { lt: end } },
              select: {
                amount: true,
                carryingAmount: true,
                settledDocumentAmount: true,
                documentCurrencyCode: true,
                currencyCode: true,
                direction: true,
                paidAt: true,
              },
            },
          },
        }),
        tx.purchaseInvoice.findMany({
          where: {
            entityId,
            status: 'POSTED',
            issueDate: { lt: end },
          },
          select: {
            id: true,
            documentCurrencyCode: true,
            functionalCurrencyCode: true,
            currencyCode: true,
            documentTotalAmount: true,
            totalAmount: true,
            cashflowPayments: {
              where: { entityId, paidAt: { lt: end } },
              select: {
                amount: true,
                carryingAmount: true,
                settledDocumentAmount: true,
                documentCurrencyCode: true,
                currencyCode: true,
                direction: true,
                paidAt: true,
              },
            },
            supplierCreditNotes: {
              where: { status: 'POSTED' },
              select: {
                documentTotalAmount: true,
                totalAmount: true,
                currencyCode: true,
                postedAt: true,
              },
            },
          },
        }),
      ]);
      const balances: RevaluationBalance[] = [
        ...invoices.map((invoice) => {
          const documentCurrencyCode = (invoice.documentCurrencyCode ?? invoice.currencyCode ?? functionalCurrencyCode).toUpperCase();
          const functionalCode = (invoice.functionalCurrencyCode ?? functionalCurrencyCode).toUpperCase();
          return {
            sourceId: invoice.id,
            direction: 'CUSTOMER_RECEIPT' as const,
            documentCurrencyCode,
            functionalCurrencyCode: functionalCode,
            documentTotalAmount: invoice.documentTotalAmount ?? (documentCurrencyCode === functionalCode ? invoice.totalAmount : Number.NaN),
            functionalTotalAmount: invoice.totalAmount,
            payments: invoice.cashflowPayments,
          };
        }),
        ...purchaseInvoices.map((invoice) => {
          const documentCurrencyCode = (invoice.documentCurrencyCode ?? invoice.currencyCode ?? functionalCurrencyCode).toUpperCase();
          const functionalCode = (invoice.functionalCurrencyCode ?? functionalCurrencyCode).toUpperCase();
          return {
            sourceId: invoice.id,
            direction: 'SUPPLIER_PAYMENT' as const,
            documentCurrencyCode,
            functionalCurrencyCode: functionalCode,
            documentTotalAmount: invoice.documentTotalAmount ?? (documentCurrencyCode === functionalCode ? invoice.totalAmount : Number.NaN),
            functionalTotalAmount: invoice.totalAmount,
            payments: invoice.cashflowPayments,
            credits: invoice.supplierCreditNotes.map((creditNote) => ({
              documentAmount: creditNote.documentTotalAmount,
              carryingAmount: creditNote.totalAmount,
              currencyCode: creditNote.currencyCode,
              postedAt: creditNote.postedAt,
            })),
          };
        }),
      ];
      const foreignCurrencies = [...new Set(balances
        .filter((balance) => balance.documentCurrencyCode !== balance.functionalCurrencyCode)
        .map((balance) => balance.documentCurrencyCode))];
      if (foreignCurrencies.length === 0) {
        throw new FxRevaluationError('Aucune facture étrangère ouverte à réévaluer pour cette clôture.', 409);
      }
      const unusedOverrides = [...overrides.keys()].filter((currencyCode) => !foreignCurrencies.includes(currencyCode));
      if (unusedOverrides.length > 0) {
        throw new FxRevaluationError(`Aucun solde ouvert ne nécessite le taux manuel de ${unusedOverrides.join(', ')}.`, 400);
      }
      const rates = await loadClosingRates(tx, foreignCurrencies, functionalCurrencyCode, effectiveDate, overrides);
      const items = calculateOpenFxRevaluationItems(balances, rates, effectiveDate);
      if (items.length === 0) {
        throw new FxRevaluationError('Les soldes étrangers sont réglés ou ne présentent aucun écart de réévaluation.', 409);
      }

      const accountMapping = entity.cashflowAccountingMapping;
      const gainAccountCode = entity.country.unrealizedFxGainAccountCode;
      const lossAccountCode = entity.country.unrealizedFxLossAccountCode;
      if (!gainAccountCode || !lossAccountCode) {
        throw new FxRevaluationError('Les comptes pays de gains et pertes non réalisés doivent être configurés avant la réévaluation.', 409);
      }
      if (items.some((item) => item.direction === 'CUSTOMER_RECEIPT') && !accountMapping?.receivableAccountCode) {
        throw new FxRevaluationError('Le compte client du mapping de trésorerie est requis pour réévaluer les créances.', 409);
      }
      if (items.some((item) => item.direction === 'SUPPLIER_PAYMENT') && !accountMapping?.payableAccountCode) {
        throw new FxRevaluationError('Le compte fournisseur du mapping de trésorerie est requis pour réévaluer les dettes.', 409);
      }
      const configuredAccounts = [
        accountMapping?.receivableAccountCode,
        accountMapping?.payableAccountCode,
        gainAccountCode,
        lossAccountCode,
      ].filter((value): value is string => Boolean(value));
      const accounts = await tx.chartOfAccount.findMany({
        where: { countryId: entity.countryId, code: { in: [...new Set(configuredAccounts)] } },
        select: { code: true, type: true, isPostingAllowed: true },
      });
      const accountsByCode = new Map(accounts.map((account) => [account.code, account]));
      const requiredAccounts = [
        ...(items.some((item) => item.direction === 'CUSTOMER_RECEIPT')
          ? [[accountMapping!.receivableAccountCode!, 'Asset']] as const : []),
        ...(items.some((item) => item.direction === 'SUPPLIER_PAYMENT')
          ? [[accountMapping!.payableAccountCode!, 'Liability']] as const : []),
        [gainAccountCode, 'Revenue'] as const,
        [lossAccountCode, 'Expense'] as const,
      ];
      for (const [code, type] of requiredAccounts) {
        const account = accountsByCode.get(code);
        if (!account || account.type !== type || !account.isPostingAllowed) {
          throw new FxRevaluationError(`Le compte ${code} doit exister, être comptabilisable et être de type ${type}.`, 409);
        }
      }

      const journalLines = items.flatMap((item) => {
        const assetOrLiabilityCode = item.direction === 'CUSTOMER_RECEIPT'
          ? accountMapping!.receivableAccountCode!
          : accountMapping!.payableAccountCode!;
        const amount = Math.abs(item.adjustmentAmount);
        if (item.direction === 'CUSTOMER_RECEIPT') {
          return item.adjustmentAmount > 0
            ? [
              { accountCode: assetOrLiabilityCode, debit: amount, credit: 0, description: `${item.sourceId} ${item.documentCurrencyCode} — réévaluation` },
              { accountCode: gainAccountCode, debit: 0, credit: amount, description: `${item.sourceId} — gain latent` },
            ]
            : [
              { accountCode: lossAccountCode, debit: amount, credit: 0, description: `${item.sourceId} — perte latente` },
              { accountCode: assetOrLiabilityCode, debit: 0, credit: amount, description: `${item.sourceId} ${item.documentCurrencyCode} — réévaluation` },
            ];
        }
        return item.adjustmentAmount > 0
          ? [
            { accountCode: lossAccountCode, debit: amount, credit: 0, description: `${item.sourceId} — perte latente` },
            { accountCode: assetOrLiabilityCode, debit: 0, credit: amount, description: `${item.sourceId} ${item.documentCurrencyCode} — réévaluation` },
          ]
          : [
            { accountCode: assetOrLiabilityCode, debit: amount, credit: 0, description: `${item.sourceId} ${item.documentCurrencyCode} — réévaluation` },
            { accountCode: gainAccountCode, debit: 0, credit: amount, description: `${item.sourceId} — gain latent` },
          ];
      });
      const totalDebits = journalLines.reduce((total, line) => total + Math.round(line.debit * 1000), 0);
      const totalCredits = journalLines.reduce((total, line) => total + Math.round(line.credit * 1000), 0);
      if (!Number.isSafeInteger(totalDebits) || totalDebits === 0 || totalDebits !== totalCredits) {
        throw new FxRevaluationError('L’écriture de réévaluation ne s’équilibre pas au millime.', 422);
      }

      const journalEntry = await tx.journalEntry.create({
        data: {
          entryNumber: `FXR-${effectiveDate.replaceAll('-', '')}-${randomUUID().slice(0, 8)}`,
          entityId,
          date: start,
          reference: `FX-REVAL-${effectiveDate}`,
          description: `Réévaluation des soldes étrangers au ${effectiveDate}`,
          status: 'TO_REVIEW',
          createdByUserId: actor.id,
          createdByUsername: actor.username,
          lines: { create: journalLines },
          workflowEvents: {
            create: {
              action: 'SUBMITTED',
              actorUserId: actor.id,
              actorUsername: actor.username,
              note,
            },
          },
        },
        select: { id: true },
      });
      const run = await tx.fxRevaluationRun.create({
        data: {
          entityId,
          effectiveDate: start,
          reversalDate: getReversalDate(effectiveDate),
          functionalCurrencyCode,
          status: 'TO_REVIEW',
          revaluationJournalEntryId: journalEntry.id,
          createdByUserId: actor.id,
          createdByUsername: actor.username,
          items: {
            create: items.map((item) => {
              const isInvoice = invoices.some((invoice) => invoice.id === item.sourceId);
              const rate = rates.get(item.documentCurrencyCode)!;
              return {
                ...(isInvoice ? { invoiceId: item.sourceId } : { purchaseInvoiceId: item.sourceId }),
                direction: item.direction,
                documentCurrencyCode: item.documentCurrencyCode,
                openDocumentAmount: item.openDocumentAmount,
                oldCarryingAmount: item.oldCarryingAmount,
                revaluedCarryingAmount: item.revaluedCarryingAmount,
                adjustmentAmount: item.adjustmentAmount,
                exchangeRate: item.exchangeRate,
                exchangeRateEffectiveDate: new Date(`${item.exchangeRateEffectiveDate}T00:00:00.000Z`),
                exchangeRateSource: item.exchangeRateSource,
                exchangeRateSourceUrl: item.exchangeRateSourceUrl,
                exchangeRateImportedAt: rate.importedAt ? new Date(rate.importedAt) : null,
              };
            }),
          },
        },
        include: { items: true, revaluationJournalEntry: { include: { lines: true } } },
      });
      return run;
    });
  }

  static async listRuns(entityId: string) {
    return prisma.fxRevaluationRun.findMany({
      where: { entityId },
      include: {
        items: true,
        revaluationJournalEntry: { select: { id: true, entryNumber: true, status: true } },
        reversalJournalEntry: { select: { id: true, entryNumber: true, status: true, date: true } },
      },
      orderBy: { effectiveDate: 'desc' },
      take: 50,
    });
  }

  static async processDueReversals(now = new Date()) {
    const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const dueRuns = await prisma.fxRevaluationRun.findMany({
      where: {
        status: 'POSTED',
        reversalJournalEntryId: null,
        reversalDate: { lte: today },
      },
      select: { id: true },
      take: 100,
    });
    let processed = 0;
    for (const { id } of dueRuns) {
      await prisma.$transaction(async (tx) => {
        const run = await tx.fxRevaluationRun.findUnique({
          where: { id },
          include: { revaluationJournalEntry: { include: { lines: true } } },
        });
        if (!run || run.status !== 'POSTED' || run.reversalJournalEntryId
          || run.reversalDate > today) return;
        const existingReversal = await tx.journalEntry.findFirst({
          where: { entityId: run.entityId, reversesEntryId: run.revaluationJournalEntryId },
          select: { id: true, status: true },
        });
        if (existingReversal) {
          if (existingReversal.status === 'POSTED') {
            await tx.fxRevaluationRun.update({
              where: { id },
              data: { reversalJournalEntryId: existingReversal.id, reversalProcessedAt: now },
            });
          }
          return;
        }
        const reversalActor = {
          id: 'system-fx-revaluation',
          username: 'SAFE FX Revaluation',
        };
        const reversal = await tx.journalEntry.create({
          data: {
            entryNumber: `FXREV-${run.id}`,
            entityId: run.entityId,
            date: run.reversalDate,
            reference: run.revaluationJournalEntry.entryNumber,
            description: `Contrepassation automatique de la réévaluation du ${run.effectiveDate.toISOString().slice(0, 10)}`,
            status: 'POSTED',
            reversesEntryId: run.revaluationJournalEntryId,
            createdByUserId: reversalActor.id,
            createdByUsername: reversalActor.username,
            approvedByUserId: reversalActor.id,
            approvedByUsername: reversalActor.username,
            approvedAt: now,
            postedByUserId: reversalActor.id,
            postedByUsername: reversalActor.username,
            postedAt: now,
            lines: {
              create: run.revaluationJournalEntry.lines.map((line) => ({
                accountCode: line.accountCode,
                debit: line.credit,
                credit: line.debit,
                description: line.description,
                costCenterCode: line.costCenterCode,
              })),
            },
            workflowEvents: {
              create: [
                { action: 'SUBMITTED', actorUserId: reversalActor.id, actorUsername: reversalActor.username, note: 'Contrepassation automatique planifiée à l’ouverture de la période suivante.' },
                { action: 'APPROVED', actorUserId: reversalActor.id, actorUsername: reversalActor.username, note: 'Contrepassation automatique exacte d’une réévaluation comptabilisée.' },
                { action: 'POSTED', actorUserId: reversalActor.id, actorUsername: reversalActor.username, note: 'Comptabilisation automatique de la contrepassation à la date d’ouverture.' },
              ],
            },
          },
          select: { id: true },
        });
        await appendJournalEntryAuditRecord(tx, reversal.id);
        await tx.fxRevaluationRun.update({
          where: { id },
          data: { reversalJournalEntryId: reversal.id, reversalProcessedAt: now },
        });
        processed += 1;
      });
    }
    return { processed };
  }
}

export default FxRevaluationService;
