import { randomUUID } from 'node:crypto';
import type { Prisma, IntercompanyTransaction } from '@prisma/client';
import prisma from '../../../data/prisma/client';
import { assertAccountingPeriodOpen } from '../finance/posting-period';
import { IntercompanyRequestError } from './errors';
import { appendJournalEntryAuditRecord } from '../finance/audit-chain';

interface Actor {
  id: string;
  username: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function millimes(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new IntercompanyRequestError(`${label} doit être strictement positif.`, 400);
  }
  const scaled = value * 1000;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 1e-7) {
    throw new IntercompanyRequestError(`${label} doit être exprimé au millime près.`, 400);
  }
  return rounded;
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > maxLength) {
    throw new IntercompanyRequestError(`${label} est obligatoire (${maxLength} caractères maximum).`, 400);
  }
  return text;
}

function parseDate(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new IntercompanyRequestError('La date doit respecter le format AAAA-MM-JJ.', 400);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new IntercompanyRequestError('La date de transaction est invalide.', 400);
  }
  return date;
}

function requireActor(actor: Actor): Actor {
  if (!actor?.id?.trim() || !actor.username?.trim()) {
    throw new IntercompanyRequestError('Une identité authentifiée est requise.', 403);
  }
  return { id: actor.id.trim(), username: actor.username.trim() };
}

function validateFxAmounts(sellerAmount: number, buyerAmount: number, exchangeRate: unknown): number {
  if (typeof exchangeRate !== 'number' || !Number.isFinite(exchangeRate) || exchangeRate <= 0 || exchangeRate > 1_000_000) {
    throw new IntercompanyRequestError('Le taux de conversion doit être positif et fini.', 400);
  }
  const expectedBuyerMillimes = Math.round(sellerAmount * 1000 * exchangeRate);
  if (!Number.isSafeInteger(expectedBuyerMillimes) || Math.abs(expectedBuyerMillimes - buyerAmount) > 1) {
    throw new IntercompanyRequestError('Le montant acheteur doit correspondre au montant vendeur converti au taux fourni (tolérance d’un millime).', 422);
  }
  return exchangeRate;
}

async function validateJournalPairEntry(
  tx: Prisma.TransactionClient,
  journalEntryId: string,
  entityId: string,
  expectedLines: readonly { accountCode: string; debit: number; credit: number }[],
) {
  const entry = await tx.journalEntry.findFirst({
    where: { id: journalEntryId, entityId },
    include: { lines: true, entity: { select: { countryId: true } } },
  });
  if (!entry || entry.lines.length !== expectedLines.length) {
    throw new IntercompanyRequestError('Une pièce interco est absente ou son nombre de lignes est incohérent avec la nature et la TVA.', 422);
  }
  const debit = entry.lines.reduce((sum, line) => sum + Math.round(line.debit * 1000), 0);
  const credit = entry.lines.reduce((sum, line) => sum + Math.round(line.credit * 1000), 0);
  if (!Number.isSafeInteger(debit) || debit <= 0 || debit !== credit
    || entry.lines.some((line) => !Number.isFinite(line.debit) || !Number.isFinite(line.credit) || line.debit < 0 || line.credit < 0)) {
    throw new IntercompanyRequestError('Une pièce interco n’est plus équilibrée au millime.', 422);
  }
  const linesMatch = expectedLines.every((expected) => entry.lines.some((line) =>
    line.accountCode === expected.accountCode
    && Math.round(line.debit * 1000) === Math.round(expected.debit * 1000)
    && Math.round(line.credit * 1000) === Math.round(expected.credit * 1000)));
  if (!linesMatch || new Set(entry.lines.map(({ accountCode }) => accountCode)).size !== expectedLines.length) {
    throw new IntercompanyRequestError('Les montants des pièces ne correspondent plus à la transaction interco.', 422);
  }
  const codes = expectedLines.map(({ accountCode }) => accountCode);
  const accounts = await tx.chartOfAccount.findMany({
    where: { countryId: entry.entity.countryId, code: { in: codes }, isPostingAllowed: true },
    select: { code: true },
  });
  if (accounts.length !== codes.length) {
    throw new IntercompanyRequestError('Un compte de la paire interco n’existe plus ou n’est plus comptabilisable.', 422);
  }
}


function roundedMillimes(amount: number): number {
  return Math.round(amount * 1000) / 1000;
}

function expectedSellerLines(transaction: IntercompanyTransaction) {
  return [
    { accountCode: transaction.sellerReceivableAccountCode, debit: roundedMillimes(transaction.sellerAmount + transaction.sellerVatAmount), credit: 0 },
    { accountCode: transaction.sellerRevenueAccountCode, debit: 0, credit: transaction.sellerAmount },
    ...(transaction.sellerVatAmount > 0 && transaction.sellerVatAccountCode
      ? [{ accountCode: transaction.sellerVatAccountCode, debit: 0, credit: transaction.sellerVatAmount }]
      : []),
  ];
}

function expectedBuyerLines(transaction: IntercompanyTransaction) {
  const inventoryDebit = roundedMillimes(transaction.buyerAmount + (transaction.buyerVatRecoverable ? 0 : transaction.buyerVatAmount));
  return [
    { accountCode: transaction.buyerInventoryAccountCode, debit: inventoryDebit, credit: 0 },
    ...(transaction.buyerVatRecoverable && transaction.buyerVatAmount > 0 && transaction.buyerVatAccountCode
      ? [{ accountCode: transaction.buyerVatAccountCode, debit: transaction.buyerVatAmount, credit: 0 }]
      : []),
    { accountCode: transaction.buyerPayableAccountCode, debit: 0, credit: roundedMillimes(transaction.buyerAmount + transaction.buyerVatAmount) },
  ];
}

export class IntercompanyService {
  static async listPartners(entityId: string) {
    const memberships = await prisma.consolidationGroupEntity.findMany({
      where: { entityId },
      select: { groupId: true },
    });
    const groupIds = memberships.map(({ groupId }) => groupId);
    if (groupIds.length === 0) return [];
    return prisma.entity.findMany({
      where: {
        id: { not: entityId },
        consolidationMemberships: { some: { groupId: { in: groupIds } } },
      },
      select: { id: true, code: true, name: true, country: { select: { code: true, currencyCode: true } } },
      orderBy: { code: 'asc' },
    });
  }

  static async list(entityId: string) {
    return prisma.intercompanyTransaction.findMany({
      where: { OR: [{ sellerEntityId: entityId }, { buyerEntityId: entityId }] },
      include: {
        sellerEntity: { select: { id: true, code: true, name: true, country: { select: { code: true, currencyCode: true } } } },
        buyerEntity: { select: { id: true, code: true, name: true, country: { select: { code: true, currencyCode: true } } } },
        sellerJournalEntry: { select: { id: true, entryNumber: true, status: true } },
        buyerJournalEntry: { select: { id: true, entryNumber: true, status: true } },
      },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  static async create(value: unknown, sellerEntityId: string, actorValue: Actor) {
    if (!isRecord(value)) throw new IntercompanyRequestError('Les données de la transaction interco sont invalides.', 400);
    const actor = requireActor(actorValue);
    const buyerEntityId = requiredText(value.buyerEntityId, 'Société acheteuse', 100);
    if (buyerEntityId === sellerEntityId) {
      throw new IntercompanyRequestError('Une transaction interco doit relier deux sociétés distinctes.', 422);
    }
    const reference = requiredText(value.reference, 'Référence', 80);
    const description = requiredText(value.description, 'Libellé', 250);
    const transactionDate = parseDate(value.date);
    const currencyCode = typeof value.currencyCode === 'string' ? value.currencyCode.trim().toUpperCase() : '';
    if (!/^[A-Z]{3}$/.test(currencyCode)) {
      throw new IntercompanyRequestError('La devise de transaction doit être un code de trois lettres.', 400);
    }
    const sellerAmount = millimes(value.sellerAmount, 'Montant vendeur HT') / 1000;
    const buyerAmount = millimes(value.buyerAmount, 'Montant acheteur HT');
    const exchangeRate = validateFxAmounts(sellerAmount, buyerAmount, value.exchangeRate);
    const nature = requiredText(value.transactionNature, 'Nature de l’opération', 40).toUpperCase();
    const taxCodeByNature: Record<string, string> = { FUEL: 'TVA_13', ACCOUNTING_FEES: 'TVA_13', INSURANCE: 'TVA_0', OTHER: 'TVA_19' };
    const taxRateCode = taxCodeByNature[nature];
    if (!taxRateCode) throw new IntercompanyRequestError('La nature doit être carburant, honoraires comptables, assurance ou autre opération.', 400);
    const agreementReference = requiredText(value.agreementReference, 'Référence de convention intersociétés', 100);
    const supportingDocumentReference = requiredText(value.supportingDocumentReference, 'Référence de facture ou pièce justificative', 120);
    const sellerReceivableAccountCode = requiredText(value.sellerReceivableAccountCode, 'Compte créance interco vendeur', 50);
    const sellerRevenueAccountCode = requiredText(value.sellerRevenueAccountCode, 'Compte produit vendeur', 50);
    const buyerInventoryAccountCode = requiredText(value.buyerInventoryAccountCode, 'Compte achat acheteur', 50);
    const buyerPayableAccountCode = requiredText(value.buyerPayableAccountCode, 'Compte dette interco acheteur', 50);

    const [seller, buyer] = await Promise.all([
      prisma.entity.findUnique({ where: { id: sellerEntityId }, select: { id: true, countryId: true, country: { select: { code: true, currencyCode: true } } } }),
      prisma.entity.findUnique({ where: { id: buyerEntityId }, select: { id: true, countryId: true, country: { select: { code: true, currencyCode: true } } } }),
    ]);
    if (!seller || !buyer) throw new IntercompanyRequestError('Une des sociétés interco est introuvable.', 404);
    const sellerMemberships = await prisma.consolidationGroupEntity.findMany({
      where: { entityId: sellerEntityId },
      select: { groupId: true },
    });
    const sharedGroupCount = sellerMemberships.length === 0 ? 0 : await prisma.consolidationGroupEntity.count({
      where: { entityId: buyerEntityId, groupId: { in: sellerMemberships.map(({ groupId }) => groupId) } },
    });
    if (sharedGroupCount === 0) {
      throw new IntercompanyRequestError('Les deux sociétés doivent appartenir à un même groupe inter-entités avant toute transaction.', 409);
    }
    if (seller.country.code !== 'TN' || buyer.country.code !== 'TN') {
      throw new IntercompanyRequestError('Les opérations intersociétés avec la France, les États-Unis ou les Émirats restent bloquées tant que leur plan comptable, régime de TVA et comptes de taxe locaux ne sont pas configurés.', 422);
    }
    if (currencyCode !== seller.country.currencyCode || seller.country.currencyCode !== buyer.country.currencyCode) {
      throw new IntercompanyRequestError('Le premier circuit TVA est limité aux entités tunisiennes en TND; les conversions transfrontalières attendent le paramétrage fiscal et comptable local.', 422);
    }
    const rate = await prisma.taxRate.findFirst({ where: { countryId: seller.countryId, code: taxRateCode } });
    if (!rate) throw new IntercompanyRequestError(`Le taux ${taxRateCode} n’est pas configuré dans le profil fiscal tunisien.`, 422);
    const sellerVatAmount = roundedMillimes(sellerAmount * rate.rate / 100);
    const buyerHt = buyerAmount / 1000;
    const buyerVatAmount = roundedMillimes(buyerHt * rate.rate / 100);
    const buyerVatRecoverable = buyerVatAmount > 0 && rate.purchaseVatRecoverable;
    const sellerVatAccountCode = sellerVatAmount > 0 ? '4367' : null;
    const buyerVatAccountCode = buyerVatRecoverable ? '4366' : null;
    const requestedAccounts = [
      { countryId: seller.countryId, code: sellerReceivableAccountCode, type: 'Asset', category: 'TRADE_RECEIVABLE' },
      { countryId: seller.countryId, code: sellerRevenueAccountCode, type: 'Revenue', category: 'REVENUE' },
      { countryId: buyer.countryId, code: buyerInventoryAccountCode, type: 'Asset', category: 'INVENTORY' },
      { countryId: buyer.countryId, code: buyerPayableAccountCode, type: 'Liability', category: 'TRADE_PAYABLE' },
      ...(sellerVatAccountCode ? [{ countryId: seller.countryId, code: sellerVatAccountCode, type: 'Liability', category: 'OTHER_CURRENT_LIABILITY' }] : []),
      ...(buyerVatAccountCode ? [{ countryId: buyer.countryId, code: buyerVatAccountCode, type: 'Asset', category: 'OTHER_CURRENT_ASSET' }] : []),
    ];
    const accountResults = await Promise.all(requestedAccounts.map(({ countryId, code }) => prisma.chartOfAccount.findFirst({
      where: { countryId, code, isPostingAllowed: true },
      select: { code: true, type: true, financialCategory: true },
    })));
    if (accountResults.some((account) => !account)) {
      throw new IntercompanyRequestError('Chaque compte interco doit exister et être comptabilisable dans le plan du pays concerné.', 422);
    }
    if (accountResults.some((account, index) => account?.type !== requestedAccounts[index].type
      || account.financialCategory !== requestedAccounts[index].category)) {
      throw new IntercompanyRequestError('Les comptes interco/TVA doivent avoir les classifications de créance, produit, stock, dette et taxe exigées.', 422);
    }

    const id = randomUUID();
    const sellerEntryId = randomUUID();
    const buyerEntryId = randomUUID();
    const sellerEntryNumber = `IC-${id}-S`;
    const buyerEntryNumber = `IC-${id}-B`;
    const note = `Transaction interco ${reference}; préparée par ${actor.username}.`;
    try {
      return await prisma.intercompanyTransaction.create({
        data: {
          reference,
          description,
          transactionDate,
          currencyCode,
          sellerAmount,
          buyerAmount: buyerAmount / 1000,
          exchangeRate,
          transactionNature: nature,
          agreementReference,
          supportingDocumentReference,
          taxRateCode,
          taxRate: rate.rate,
          sellerVatAmount,
          buyerVatAmount,
          buyerVatRecoverable,
          sellerVatAccountCode,
          buyerVatAccountCode,
          sellerReceivableAccountCode,
          sellerRevenueAccountCode,
          buyerInventoryAccountCode,
          buyerPayableAccountCode,
          createdByUserId: actor.id,
          sellerEntity: { connect: { id: seller.id } },
          buyerEntity: { connect: { id: buyer.id } },
          sellerJournalEntry: {
            create: {
              id: sellerEntryId,
              entryNumber: sellerEntryNumber,
              entityId: seller.id,
              date: transactionDate,
              reference,
              description: `Vente intercompagnie — ${description}`,
              status: 'TO_REVIEW',
              createdByUserId: actor.id,
              createdByUsername: actor.username,
              lines: { create: [
                { accountCode: sellerReceivableAccountCode, debit: roundedMillimes(sellerAmount + sellerVatAmount), credit: 0, description: `Créance TTC interco sur ${buyerEntityId}` },
                { accountCode: sellerRevenueAccountCode, debit: 0, credit: sellerAmount, description: `Vente HT interco à ${buyerEntityId}` },
                ...(sellerVatAmount > 0 && sellerVatAccountCode ? [{ accountCode: sellerVatAccountCode, debit: 0, credit: sellerVatAmount, description: `TVA collectée ${taxRateCode} sur ${supportingDocumentReference}` }] : []),
              ] },
              workflowEvents: { create: { action: 'SUBMITTED', actorUserId: actor.id, actorUsername: actor.username, note } },
            },
          },
          buyerJournalEntry: {
            create: {
              id: buyerEntryId,
              entryNumber: buyerEntryNumber,
              entityId: buyer.id,
              date: transactionDate,
              reference,
              description: `Achat intercompagnie — ${description}`,
              status: 'TO_REVIEW',
              createdByUserId: actor.id,
              createdByUsername: actor.username,
              lines: { create: [
                { accountCode: buyerInventoryAccountCode, debit: roundedMillimes(buyerHt + (buyerVatRecoverable ? 0 : buyerVatAmount)), credit: 0, description: `Achat interco HT et TVA non récupérable auprès de ${sellerEntityId}` },
                ...(buyerVatRecoverable && buyerVatAccountCode ? [{ accountCode: buyerVatAccountCode, debit: buyerVatAmount, credit: 0, description: `TVA déductible ${taxRateCode} — ${supportingDocumentReference}` }] : []),
                { accountCode: buyerPayableAccountCode, debit: 0, credit: roundedMillimes(buyerHt + buyerVatAmount), description: `Dette TTC interco envers ${sellerEntityId}` },
              ] },
              workflowEvents: { create: { action: 'SUBMITTED', actorUserId: actor.id, actorUsername: actor.username, note } },
            },
          },
        },
        include: {
          sellerJournalEntry: { include: { lines: true } },
          buyerJournalEntry: { include: { lines: true } },
          sellerEntity: { select: { id: true, code: true, name: true } },
          buyerEntity: { select: { id: true, code: true, name: true } },
        },
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new IntercompanyRequestError('Cette référence interco existe déjà.', 409);
      }
      throw error;
    }
  }

  static async approve(transactionId: string, entityId: string, actorValue: Actor) {
    const actor = requireActor(actorValue);
    return prisma.$transaction(async (tx) => {
      const current = await tx.intercompanyTransaction.findFirst({
        where: { id: transactionId, OR: [{ sellerEntityId: entityId }, { buyerEntityId: entityId }] },
        include: { sellerJournalEntry: true, buyerJournalEntry: true },
      });
      if (!current) throw new IntercompanyRequestError('Transaction interco introuvable pour cette société.', 404);
      if (current.status !== 'PENDING_APPROVAL') {
        throw new IntercompanyRequestError('La convention a déjà été entièrement approuvée ou comptabilisée.', 409);
      }
      if (current.createdByUserId === actor.id) {
        throw new IntercompanyRequestError('Le préparateur ne peut pas approuver sa convention.', 403);
      }
      const isSeller = current.sellerEntityId === entityId;
      const alreadyApproved = isSeller ? current.sellerConventionApprovedAt : current.buyerConventionApprovedAt;
      if (alreadyApproved) throw new IntercompanyRequestError('Votre société a déjà approuvé cette convention.', 409);
      const otherApproverId = isSeller ? current.buyerConventionApprovedByUserId : current.sellerConventionApprovedByUserId;
      if (otherApproverId === actor.id) {
        throw new IntercompanyRequestError('Les deux sociétés doivent désigner des approbateurs distincts.', 403);
      }
      await validateJournalPairEntry(tx, current.sellerJournalEntryId, current.sellerEntityId, expectedSellerLines(current));
      await validateJournalPairEntry(tx, current.buyerJournalEntryId, current.buyerEntityId, expectedBuyerLines(current));

      const journalEntryId = isSeller ? current.sellerJournalEntryId : current.buyerJournalEntryId;
      const changedEntry = await tx.journalEntry.updateMany({
        where: { id: journalEntryId, entityId, status: 'TO_REVIEW' },
        data: { status: 'APPROVED', approvedByUserId: actor.id, approvedByUsername: actor.username, approvedAt: new Date() },
      });
      if (changedEntry.count !== 1) throw new IntercompanyRequestError('La pièce de votre société a changé; rechargez la transaction.', 409);
      const now = new Date();
      const note = `${isSeller ? 'Vendeur' : 'Acheteur'} — approbation société de la convention ${current.agreementReference ?? current.reference}; transaction ${current.reference}.`;
      await tx.journalEntryWorkflowEvent.create({
        data: { journalEntryId, action: 'APPROVED', actorUserId: actor.id, actorUsername: actor.username, note },
      });
      const updated = await tx.intercompanyTransaction.update({
        where: { id: current.id },
        data: isSeller
          ? { sellerConventionApprovedByUserId: actor.id, sellerConventionApprovedAt: now }
          : { buyerConventionApprovedByUserId: actor.id, buyerConventionApprovedAt: now },
        include: { sellerJournalEntry: true, buyerJournalEntry: true },
      });
      if (!updated.sellerConventionApprovedAt || !updated.buyerConventionApprovedAt) return updated;
      return tx.intercompanyTransaction.update({
        where: { id: current.id },
        data: { status: 'APPROVED', approvedByUserId: actor.id, approvedAt: now },
        include: { sellerJournalEntry: true, buyerJournalEntry: true },
      });
    });
  }

  static async post(transactionId: string, entityId: string, actorValue: Actor) {
    const actor = requireActor(actorValue);
    return prisma.$transaction(async (tx) => {
      const current = await tx.intercompanyTransaction.findFirst({
        where: { id: transactionId, OR: [{ sellerEntityId: entityId }, { buyerEntityId: entityId }] },
        include: { sellerJournalEntry: true, buyerJournalEntry: true },
      });
      if (!current) throw new IntercompanyRequestError('Transaction interco introuvable pour cette société.', 404);
      if (current.status !== 'APPROVED'
        || current.sellerJournalEntry.status !== 'APPROVED'
        || current.buyerJournalEntry.status !== 'APPROVED') {
        throw new IntercompanyRequestError('La paire interco doit être approuvée avant comptabilisation.', 409);
      }
      if (actor.id === current.createdByUserId
        || actor.id === current.sellerConventionApprovedByUserId
        || actor.id === current.buyerConventionApprovedByUserId) {
        throw new IntercompanyRequestError('La comptabilisation exige une identité distincte du préparateur et des deux sociétés approbatrices.', 403);
      }
      await validateJournalPairEntry(tx, current.sellerJournalEntryId, current.sellerEntityId, expectedSellerLines(current));
      await validateJournalPairEntry(tx, current.buyerJournalEntryId, current.buyerEntityId, expectedBuyerLines(current));
      await assertAccountingPeriodOpen(tx, current.sellerEntityId, current.sellerJournalEntry.date);
      await assertAccountingPeriodOpen(tx, current.buyerEntityId, current.buyerJournalEntry.date);
      const now = new Date();
      const [sellerUpdate, buyerUpdate] = await Promise.all([
        tx.journalEntry.updateMany({
          where: { id: current.sellerJournalEntryId, entityId: current.sellerEntityId, status: 'APPROVED' },
          data: { status: 'POSTED', postedByUserId: actor.id, postedByUsername: actor.username, postedAt: now },
        }),
        tx.journalEntry.updateMany({
          where: { id: current.buyerJournalEntryId, entityId: current.buyerEntityId, status: 'APPROVED' },
          data: { status: 'POSTED', postedByUserId: actor.id, postedByUsername: actor.username, postedAt: now },
        }),
      ]);
      if (sellerUpdate.count !== 1 || buyerUpdate.count !== 1) {
        throw new IntercompanyRequestError('Une écriture a changé; aucune comptabilisation partielle n’a été conservée.', 409);
      }
      const entriesToHash = [
        { entityId: current.sellerEntityId, journalEntryId: current.sellerJournalEntryId },
        { entityId: current.buyerEntityId, journalEntryId: current.buyerJournalEntryId },
      ].sort((left, right) => left.entityId.localeCompare(right.entityId));
      for (const entry of entriesToHash) {
        await appendJournalEntryAuditRecord(tx, entry.journalEntryId);
      }
      const note = `Comptabilisation atomique de la paire interco ${current.reference}.`;
      await tx.journalEntryWorkflowEvent.createMany({
        data: [current.sellerJournalEntryId, current.buyerJournalEntryId].map((journalEntryId) => ({
          journalEntryId, action: 'POSTED', actorUserId: actor.id, actorUsername: actor.username, note,
        })),
      });
      return tx.intercompanyTransaction.update({
        where: { id: current.id },
        data: { status: 'POSTED' },
        include: { sellerJournalEntry: true, buyerJournalEntry: true },
      });
    });
  }

  static async reconcile(transactionId: string, entityId: string, actorValue: Actor) {
    const actor = requireActor(actorValue);
    return prisma.$transaction(async (tx) => {
      const current = await tx.intercompanyTransaction.findFirst({
        where: { id: transactionId, OR: [{ sellerEntityId: entityId }, { buyerEntityId: entityId }] },
        include: { sellerJournalEntry: true, buyerJournalEntry: true },
      });
      if (!current) throw new IntercompanyRequestError('Transaction interco introuvable pour cette société.', 404);
      if (current.status !== 'POSTED' && current.status !== 'RECONCILED') {
        throw new IntercompanyRequestError('Seule une paire comptabilisée peut être rapprochée.', 409);
      }
      if (current.sellerJournalEntry.status !== 'POSTED' || current.buyerJournalEntry.status !== 'POSTED') {
        throw new IntercompanyRequestError('Les deux écritures doivent être comptabilisées pour être rapprochées.', 409);
      }
      const isSeller = current.sellerEntityId === entityId;
      const changed = await tx.intercompanyTransaction.updateMany({
        where: {
          id: current.id,
          ...(isSeller
            ? { sellerReconciledAt: null }
            : { buyerReconciledAt: null }),
        },
        data: isSeller
          ? { sellerReconciledByUserId: actor.id, sellerReconciledAt: new Date() }
          : { buyerReconciledByUserId: actor.id, buyerReconciledAt: new Date() },
      });
      if (changed.count !== 1) {
        return tx.intercompanyTransaction.findUniqueOrThrow({ where: { id: current.id } });
      }
      const updated = await tx.intercompanyTransaction.findUniqueOrThrow({ where: { id: current.id } });
      const reconciled = Boolean(updated.sellerReconciledAt && updated.buyerReconciledAt);
      return tx.intercompanyTransaction.update({
        where: { id: current.id },
        data: { status: reconciled ? 'RECONCILED' : 'POSTED' },
      });
    });
  }
}

export default IntercompanyService;
