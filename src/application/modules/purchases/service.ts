import type { Prisma } from '@prisma/client';
import prisma from '../../../core/models/prisma';
import { calculatePurchaseInvoiceAmounts, validatePurchaseInvoiceInput } from './invoice';
import { isPurchaseUniqueConstraintViolation, PurchaseRequestError } from './errors';
import { convertInvoiceComponents, normalizeInvoiceFxSnapshot } from '../fx/conversion';
import { validateJournalEntry } from '../finance/journal-validation';
import { buildPurchasePostingLines, buildSupplierCreditNotePostingLines } from './posting-validation';
import { applyAnalyticalAllocationRules, AnalyticalAllocationError } from '../controlling/allocation-rules';
import { FinanceService } from '../finance/service';
import { calculatePayablesAging, parsePayablesAsOf } from './payables-aging';
import { assertAccountingPeriodOpen } from '../finance/posting-period';
import { validatePurchaseOrderInput, validatePurchaseOrderNote } from './order';
import { toStockQuantityMilliUnits, validateStockQuantity } from '../materials/quantity';
import { appendJournalEntryAuditRecord } from '../finance/audit-chain';

export interface PurchaseWorkflowActor {
  id: string;
  username: string;
}

function validateWorkflowNote(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 5 || value.trim().length > 500) {
    throw new PurchaseRequestError('Une note de contrôle de 5 à 500 caractères est obligatoire.', 400);
  }
  return value.trim();
}

function amountToMillimes(value: unknown, label: string): number {
  const millimes = typeof value === 'number' ? Math.round(value * 1000) : NaN;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0
    || !Number.isSafeInteger(millimes) || Math.abs(value * 1000 - millimes) > 1e-7) {
    throw new PurchaseRequestError(`${label} doit être positif ou nul et précis au millime.`, 422);
  }

  return millimes;
}

function quantityMilliUnits(value: number, label: string): number {
  const milliUnits = toStockQuantityMilliUnits(value);
  if (milliUnits === null) throw new PurchaseRequestError(`${label} n’est pas une quantité de stock valide.`, 422);
  return milliUnits;
}

function parseCreditNoteDate(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new PurchaseRequestError('La date du document fournisseur doit être au format AAAA-MM-JJ.', 400);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new PurchaseRequestError('La date du document fournisseur est invalide.', 400);
  }
  return date;
}

export class PurchasesService {
  private static async matchUnlinkedPurchaseOrderReceipts(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    entityId: string,
  ) {
    const lines = await tx.purchaseInvoiceLine.findMany({
      where: { entityId, purchaseInvoiceId: invoiceId, materialId: { not: null }, purchaseOrderLineId: { not: null } },
      select: { id: true, purchaseOrderLineId: true, quantity: true },
    });
    for (const line of lines) {
      if (!line.purchaseOrderLineId) continue;
      const invoiceQuantity = quantityMilliUnits(line.quantity, 'La quantité facturée');
      const receipts = await tx.stockReceipt.findMany({
        where: { entityId, purchaseOrderLineId: line.purchaseOrderLineId, purchaseInvoiceId: null },
        include: { supplierReturns: { select: { quantity: true } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      let matchedQuantity = 0;
      for (const receipt of receipts) {
        const received = quantityMilliUnits(receipt.quantity, 'La quantité réceptionnée');
        const returned = receipt.supplierReturns.reduce(
          (sum, supplierReturn) => sum + quantityMilliUnits(supplierReturn.quantity, 'La quantité retournée'),
          0,
        );
        if (returned > received) {
          throw new PurchaseRequestError('Les retours fournisseur dépassent une réception liée à la commande.', 409);
        }
        const netQuantity = received - returned;
        if (netQuantity === 0 || matchedQuantity + netQuantity > invoiceQuantity) continue;
        const linked = await tx.stockReceipt.updateMany({
          where: { id: receipt.id, entityId, purchaseInvoiceId: null },
          data: { purchaseInvoiceId: invoiceId },
        });
        if (linked.count !== 1) {
          throw new PurchaseRequestError('Une réception de la commande a changé pendant son rapprochement avec la facture.', 409);
        }
        await tx.purchaseInvoiceLineReceiptMatch.create({
          data: {
            entityId,
            purchaseInvoiceId: invoiceId,
            lineId: line.id,
            receiptId: receipt.id,
          },
        });
        matchedQuantity += netQuantity;
      }
    }
  }

  static async getPurchaseOrders(entityId: string) {
    return prisma.purchaseOrder.findMany({
      where: { entityId },
      include: {
        vendor: { select: { id: true, code: true, name: true } },
        lines: { include: { material: { select: { id: true, sku: true, unitCode: true } } } },
        workflowEvents: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  static async getReceivablePurchaseOrderLine(orderId: string, lineId: unknown, entityId: string) {
    if (typeof lineId !== 'string' || !lineId.trim()) {
      throw new PurchaseRequestError('Sélectionnez une ligne de commande à réceptionner.', 400);
    }
    const line = await prisma.purchaseOrderLine.findFirst({
      where: { id: lineId, entityId, orderId },
      include: { order: { select: { status: true } } },
    });
    if (!line) throw new PurchaseRequestError('Ligne de commande introuvable pour cette société.', 404);
    if (line.order.status !== 'APPROVED') {
      throw new PurchaseRequestError('Seule une ligne de commande approuvée peut être réceptionnée.', 409);
    }
    if (!line.materialId) {
      throw new PurchaseRequestError('Cette ligne de service n’est pas une ligne de stock et ne peut pas créer de réception.', 422);
    }
    return { id: line.id, materialId: line.materialId };
  }

  static async createPurchaseOrder(input: unknown, entityId: string, actor: PurchaseWorkflowActor) {
    const data = validatePurchaseOrderInput(input);
    const [entity, vendor] = await Promise.all([
      prisma.entity.findUnique({
        where: { id: entityId },
        select: { country: { select: { currencyCode: true } } },
      }),
      prisma.vendor.findFirst({ where: { id: data.vendorId, entityId }, select: { id: true } }),
    ]);
    if (!entity) throw new PurchaseRequestError('Société introuvable.', 404);
    if (!vendor) throw new PurchaseRequestError('Fournisseur introuvable pour cette société.', 404);
    if (data.currencyCode !== entity.country.currencyCode) {
      throw new PurchaseRequestError('La commande doit être exprimée dans la devise fonctionnelle de la société; les devises étrangères nécessitent un taux de conversion figé.', 422);
    }
    const materialIds = data.lines.map((line) => line.materialId).filter((id): id is string => Boolean(id));
    if (materialIds.length > 0) {
      const materials = await prisma.material.findMany({
        where: { entityId, id: { in: materialIds } },
        select: { id: true, unitCode: true },
      });
      if (materials.length !== new Set(materialIds).size) {
        throw new PurchaseRequestError('Un article de la commande est introuvable pour cette société.', 422);
      }
      const units = new Map(materials.map((material) => [material.id, material.unitCode]));
      try {
        data.lines = data.lines.map((line) => ({
          ...line,
          quantity: validateStockQuantity(
            line.quantity,
            'La quantité commandée',
            { unitCode: line.materialId ? units.get(line.materialId) : undefined },
          ),
        }));
      } catch (error) {
        throw new PurchaseRequestError(error instanceof Error ? error.message : 'Quantité commandée invalide.', 422);
      }
    }
    try {
      return await prisma.purchaseOrder.create({
        data: {
          entityId,
          orderNumber: data.orderNumber,
          vendorId: vendor.id,
          currencyCode: data.currencyCode,
          expectedAt: data.expectedAt ? new Date(`${data.expectedAt}T00:00:00.000Z`) : null,
          description: data.description,
          createdByUserId: actor.id,
          createdByUsername: actor.username,
          status: 'TO_REVIEW',
          lines: { create: data.lines },
          workflowEvents: {
            create: {
              action: 'SUBMITTED',
              actorUserId: actor.id,
              actorUsername: actor.username,
              note: 'Commande soumise au contrôle.',
            },
          },
        },
        include: {
          vendor: { select: { id: true, code: true, name: true } },
          lines: { include: { material: { select: { id: true, sku: true, unitCode: true } } } },
          workflowEvents: true,
        },
      });
    } catch (error) {
      if (isPurchaseUniqueConstraintViolation(error)) {
        throw new PurchaseRequestError('Ce numéro de commande existe déjà pour cette société.', 409);
      }
      throw error;
    }
  }

  static async approvePurchaseOrder(
    orderId: string,
    entityId: string,
    actor: PurchaseWorkflowActor,
    noteValue: unknown,
  ) {
    const note = validatePurchaseOrderNote(noteValue);
    return prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findFirst({
        where: { id: orderId, entityId },
        select: { id: true, status: true, createdByUserId: true },
      });
      if (!order) throw new PurchaseRequestError('Commande fournisseur introuvable pour cette société.', 404);
      if (!order.createdByUserId || order.createdByUserId === actor.id) {
        throw new PurchaseRequestError('La commande doit être approuvée par une personne distincte de son préparateur.', 422);
      }
      if (order.status === 'APPROVED') return tx.purchaseOrder.findUnique({ where: { id: order.id } });
      if (order.status !== 'TO_REVIEW') {
        throw new PurchaseRequestError('Seule une commande à contrôler peut être approuvée.', 409);
      }
      const changed = await tx.purchaseOrder.updateMany({
        where: { id: order.id, entityId, status: 'TO_REVIEW' },
        data: {
          status: 'APPROVED',
          approvedByUserId: actor.id,
          approvedByUsername: actor.username,
          approvedAt: new Date(),
        },
      });
      if (changed.count !== 1) throw new PurchaseRequestError('La commande a changé pendant le contrôle; rechargez-la.', 409);
      await tx.purchaseOrderWorkflowEvent.create({
        data: {
          purchaseOrderId: order.id,
          action: 'APPROVED',
          actorUserId: actor.id,
          actorUsername: actor.username,
          note,
        },
      });
      return tx.purchaseOrder.findUnique({
        where: { id: order.id },
        include: { lines: true, workflowEvents: { orderBy: { createdAt: 'asc' } } },
      });
    });
  }

  static async rejectPurchaseOrder(
    orderId: string,
    entityId: string,
    actor: PurchaseWorkflowActor,
    noteValue: unknown,
  ) {
    const note = validatePurchaseOrderNote(noteValue);
    return prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findFirst({
        where: { id: orderId, entityId },
        select: { id: true, status: true, createdByUserId: true },
      });
      if (!order) throw new PurchaseRequestError('Commande fournisseur introuvable pour cette société.', 404);
      if (!order.createdByUserId || order.createdByUserId === actor.id) {
        throw new PurchaseRequestError('La commande doit être contrôlée par une personne distincte de son préparateur.', 422);
      }
      if (order.status !== 'TO_REVIEW') {
        throw new PurchaseRequestError('Seule une commande à contrôler peut être rejetée.', 409);
      }
      const changed = await tx.purchaseOrder.updateMany({
        where: { id: order.id, entityId, status: 'TO_REVIEW' },
        data: { status: 'REJECTED', rejectedAt: new Date(), rejectionReason: note },
      });
      if (changed.count !== 1) throw new PurchaseRequestError('La commande a changé pendant le contrôle; rechargez-la.', 409);
      await tx.purchaseOrderWorkflowEvent.create({
        data: {
          purchaseOrderId: order.id,
          action: 'REJECTED',
          actorUserId: actor.id,
          actorUsername: actor.username,
          note,
        },
      });
      return tx.purchaseOrder.findUnique({
        where: { id: order.id },
        include: { lines: true, workflowEvents: { orderBy: { createdAt: 'asc' } } },
      });
    });
  }

  static async getSupplierCreditNotes(entityId: string) {
    const creditNotes = await prisma.supplierCreditNote.findMany({
      where: { entityId },
      include: {
        vendor: { select: { id: true, code: true, name: true } },
        sourceInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            vendorId: true,
            currencyCode: true,
            documentCurrencyCode: true,
            functionalCurrencyCode: true,
            documentTotalAmount: true,
            totalAmount: true,
            cashflowPayments: {
              where: { entityId, direction: 'SUPPLIER_PAYMENT' },
              select: { amount: true, settledDocumentAmount: true, carryingAmount: true },
            },
            supplierCreditNotes: {
              where: { status: 'POSTED' },
              orderBy: [{ postedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
              select: { id: true, documentTotalAmount: true, totalAmount: true },
            },
          },
        },
        sourceInvoiceLine: { select: { description: true, quantity: true, unitPrice: true } },
        sourceReturn: { select: { id: true, quantity: true, reason: true, createdAt: true } },
        workflowEvents: { orderBy: { createdAt: 'asc' } },
        applications: {
          include: { targetPurchaseInvoice: { select: { id: true, invoiceNumber: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    return creditNotes.map((creditNote) => {
      if (creditNote.status !== 'POSTED') {
        return { ...creditNote, unappliedDocumentAmount: 0, unappliedFunctionalAmount: 0 };
      }
      const sourceDocumentTotal = amountToMillimes(
        creditNote.sourceInvoice.documentTotalAmount ?? creditNote.sourceInvoice.totalAmount,
        'Le total document de la facture source',
      );
      const sourceFunctionalTotal = amountToMillimes(creditNote.sourceInvoice.totalAmount, 'Le total fonctionnel de la facture source');
      const paid = creditNote.sourceInvoice.cashflowPayments.reduce((totals, payment) => ({
        document: totals.document + amountToMillimes(payment.settledDocumentAmount ?? payment.amount, 'Un règlement source'),
        functional: totals.functional + amountToMillimes(payment.carryingAmount ?? payment.amount, 'Un règlement fonctionnel source'),
      }), { document: 0, functional: 0 });
      let documentRemaining = Math.max(0, sourceDocumentTotal - paid.document);
      let functionalRemaining = Math.max(0, sourceFunctionalTotal - paid.functional);
      let sourceAppliedDocument = 0;
      let sourceAppliedFunctional = 0;
      for (const sourceCredit of creditNote.sourceInvoice.supplierCreditNotes) {
        const documentAmount = amountToMillimes(sourceCredit.documentTotalAmount, 'Un avoir source existant');
        const functionalAmount = amountToMillimes(sourceCredit.totalAmount, 'Un avoir fonctionnel source existant');
        const appliedDocument = Math.min(documentRemaining, documentAmount);
        const appliedFunctional = Math.min(functionalRemaining, functionalAmount);
        if (sourceCredit.id === creditNote.id) {
          sourceAppliedDocument = appliedDocument;
          sourceAppliedFunctional = appliedFunctional;
          break;
        }
        documentRemaining -= appliedDocument;
        functionalRemaining -= appliedFunctional;
      }
      const priorApplications = creditNote.applications.reduce((totals, application) => ({
        document: totals.document + amountToMillimes(application.documentAmount, 'Une affectation existante'),
        functional: totals.functional + amountToMillimes(application.functionalAmount, 'Une affectation fonctionnelle existante'),
      }), { document: 0, functional: 0 });
      const unappliedDocument = amountToMillimes(creditNote.documentTotalAmount, 'Le montant document de l’avoir')
        - sourceAppliedDocument - priorApplications.document;
      const unappliedFunctional = amountToMillimes(creditNote.totalAmount, 'Le montant fonctionnel de l’avoir')
        - sourceAppliedFunctional - priorApplications.functional;
      if (unappliedDocument < 0 || unappliedFunctional < 0) {
        throw new PurchaseRequestError('Les affectations d’un avoir dépassent son solde comptabilisé; le solde doit être contrôlé.', 409);
      }
      return {
        ...creditNote,
        unappliedDocumentAmount: unappliedDocument / 1000,
        unappliedFunctionalAmount: unappliedFunctional / 1000,
      };
    });
  }

  static async applySupplierCreditNote(
    creditNoteId: string,
    entityId: string,
    actor: PurchaseWorkflowActor,
    input: unknown,
  ) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new PurchaseRequestError('Les données d’affectation de l’avoir sont invalides.', 400);
    }
    const data = input as Record<string, unknown>;
    const targetPurchaseInvoiceId = typeof data.targetPurchaseInvoiceId === 'string'
      ? data.targetPurchaseInvoiceId.trim()
      : '';
    const idempotencyKey = typeof data.idempotencyKey === 'string' ? data.idempotencyKey.trim() : '';
    if (!targetPurchaseInvoiceId || targetPurchaseInvoiceId.length > 128
      || !idempotencyKey || idempotencyKey.length > 128) {
      throw new PurchaseRequestError('La facture cible et une clé d’idempotence valide sont requises.', 400);
    }
    const documentAmount = amountToMillimes(data.documentAmount, 'Le montant affecté');
    if (documentAmount <= 0) throw new PurchaseRequestError('Le montant affecté doit être supérieur à zéro.', 422);
    const note = validateWorkflowNote(data.note);

    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.supplierCreditNoteApplication.findUnique({
          where: { entityId_idempotencyKey: { entityId, idempotencyKey } },
        });
        if (existing) {
          if (existing.supplierCreditNoteId !== creditNoteId
            || existing.targetPurchaseInvoiceId !== targetPurchaseInvoiceId
            || amountToMillimes(existing.documentAmount, 'Le montant affecté existant') !== documentAmount
            || existing.note !== note) {
            throw new PurchaseRequestError('Cette clé d’idempotence a déjà été utilisée pour une autre affectation.', 409);
          }
          return existing;
        }

        const credit = await tx.supplierCreditNote.findFirst({
          where: { id: creditNoteId, entityId, status: 'POSTED' },
          select: {
            id: true,
            vendorId: true,
            sourceInvoiceId: true,
            currencyCode: true,
            functionalCurrencyCode: true,
            documentTotalAmount: true,
            totalAmount: true,
            exchangeRate: true,
            postedAt: true,
            createdAt: true,
            applications: { select: { documentAmount: true, functionalAmount: true } },
          },
        });
        if (!credit) throw new PurchaseRequestError('Seul un avoir comptabilisé peut être affecté.', 409);
        if (credit.sourceInvoiceId === targetPurchaseInvoiceId) {
          throw new PurchaseRequestError('L’avoir réduit déjà la facture source; choisissez une autre facture du même fournisseur.', 409);
        }

        const target = await tx.purchaseInvoice.findFirst({
          where: { id: targetPurchaseInvoiceId, entityId, status: 'POSTED' },
          select: {
            id: true,
            vendorId: true,
            currencyCode: true,
            documentCurrencyCode: true,
            functionalCurrencyCode: true,
            documentTotalAmount: true,
            totalAmount: true,
            exchangeRate: true,
            cashflowPayments: {
              where: { entityId, direction: 'SUPPLIER_PAYMENT' },
              select: { amount: true, settledDocumentAmount: true, carryingAmount: true },
            },
            supplierCreditNotes: {
              where: { status: 'POSTED' },
              select: { documentTotalAmount: true, totalAmount: true },
            },
            supplierCreditApplications: {
              select: { documentAmount: true, functionalAmount: true },
            },
          },
        });
        if (!target) throw new PurchaseRequestError('Facture fournisseur cible introuvable ou non comptabilisée.', 404);
        if (target.vendorId !== credit.vendorId) {
          throw new PurchaseRequestError('L’avoir ne peut être affecté qu’à une facture du même fournisseur.', 422);
        }
        const targetCurrency = target.documentCurrencyCode ?? target.currencyCode;
        const targetFunctionalCurrency = target.functionalCurrencyCode ?? target.currencyCode;
        if (targetCurrency !== credit.currencyCode
          || targetFunctionalCurrency !== credit.functionalCurrencyCode
          || (target.exchangeRate ?? 1) !== credit.exchangeRate) {
          throw new PurchaseRequestError('L’affectation nécessite la même devise document, la même devise fonctionnelle et le même taux figé.', 422);
        }

        const source = await tx.purchaseInvoice.findFirst({
          where: { id: credit.sourceInvoiceId, entityId, status: 'POSTED' },
          select: {
            documentTotalAmount: true,
            totalAmount: true,
            cashflowPayments: {
              where: { entityId, direction: 'SUPPLIER_PAYMENT' },
              select: { amount: true, settledDocumentAmount: true, carryingAmount: true },
            },
            supplierCreditNotes: {
              where: { status: 'POSTED' },
              orderBy: [{ postedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                documentTotalAmount: true,
                totalAmount: true,
                postedAt: true,
                createdAt: true,
                applications: { select: { documentAmount: true, functionalAmount: true } },
              },
            },
          },
        });
        if (!source) throw new PurchaseRequestError('Facture source de l’avoir introuvable ou non comptabilisée.', 409);

        const documentTotal = amountToMillimes(source.documentTotalAmount ?? source.totalAmount, 'Le total document de la facture source');
        const functionalTotal = amountToMillimes(source.totalAmount, 'Le total fonctionnel de la facture source');
        const paid = source.cashflowPayments.reduce((totals, payment) => ({
          document: totals.document + amountToMillimes(payment.settledDocumentAmount ?? payment.amount, 'Un règlement source'),
          functional: totals.functional + amountToMillimes(payment.carryingAmount ?? payment.amount, 'Un règlement fonctionnel source'),
        }), { document: 0, functional: 0 });
        let sourceRoomDocument = Math.max(0, documentTotal - paid.document);
        let sourceRoomFunctional = Math.max(0, functionalTotal - paid.functional);
        let creditSourceAppliedDocument = 0;
        let creditSourceAppliedFunctional = 0;
        for (const prior of source.supplierCreditNotes) {
          const priorDocument = amountToMillimes(prior.documentTotalAmount, 'Un avoir source existant');
          const priorFunctional = amountToMillimes(prior.totalAmount, 'Un avoir fonctionnel source existant');
          const appliedDocument = Math.min(sourceRoomDocument, priorDocument);
          const appliedFunctional = Math.min(sourceRoomFunctional, priorFunctional);
          if (prior.id === credit.id) {
            creditSourceAppliedDocument = appliedDocument;
            creditSourceAppliedFunctional = appliedFunctional;
            break;
          }
          sourceRoomDocument -= appliedDocument;
          sourceRoomFunctional -= appliedFunctional;
        }
        const creditDocumentTotal = amountToMillimes(credit.documentTotalAmount, 'Le montant document de l’avoir');
        const creditFunctionalTotal = amountToMillimes(credit.totalAmount, 'Le montant fonctionnel de l’avoir');
        const alreadyApplied = credit.applications.reduce((totals, application) => ({
          document: totals.document + amountToMillimes(application.documentAmount, 'Une affectation existante'),
          functional: totals.functional + amountToMillimes(application.functionalAmount, 'Une affectation fonctionnelle existante'),
        }), { document: 0, functional: 0 });
        const availableDocument = creditDocumentTotal - creditSourceAppliedDocument - alreadyApplied.document;
        const availableFunctional = creditFunctionalTotal - creditSourceAppliedFunctional - alreadyApplied.functional;
        if (!Number.isSafeInteger(availableDocument) || !Number.isSafeInteger(availableFunctional)
          || availableDocument <= 0 || availableFunctional <= 0) {
          throw new PurchaseRequestError('Aucun solde d’avoir non affecté n’est disponible après la facture source.', 409);
        }
        const functionalAmount = Math.round(documentAmount * credit.exchangeRate);
        if (!Number.isSafeInteger(functionalAmount) || documentAmount > availableDocument
          || functionalAmount <= 0 || functionalAmount > availableFunctional) {
          throw new PurchaseRequestError('Le montant dépasse le solde d’avoir disponible ou sa conversion figée.', 409);
        }

        const targetDocumentTotal = amountToMillimes(target.documentTotalAmount ?? target.totalAmount, 'Le total document de la facture cible');
        const targetFunctionalTotal = amountToMillimes(target.totalAmount, 'Le total fonctionnel de la facture cible');
        const targetPaid = target.cashflowPayments.reduce((totals, payment) => ({
          document: totals.document + amountToMillimes(payment.settledDocumentAmount ?? payment.amount, 'Un règlement cible'),
          functional: totals.functional + amountToMillimes(payment.carryingAmount ?? payment.amount, 'Un règlement fonctionnel cible'),
        }), { document: 0, functional: 0 });
        const targetCredit = target.supplierCreditNotes.reduce((totals, item) => ({
          document: totals.document + amountToMillimes(item.documentTotalAmount, 'Un avoir cible existant'),
          functional: totals.functional + amountToMillimes(item.totalAmount, 'Un avoir fonctionnel cible existant'),
        }), { document: 0, functional: 0 });
        const alreadyAppliedToTarget = target.supplierCreditApplications.reduce((totals, item) => ({
          document: totals.document + amountToMillimes(item.documentAmount, 'Une affectation cible existante'),
          functional: totals.functional + amountToMillimes(item.functionalAmount, 'Une affectation fonctionnelle cible existante'),
        }), { document: 0, functional: 0 });
        const targetAvailableDocument = Math.max(0, targetDocumentTotal - targetPaid.document
          - Math.min(targetCredit.document, Math.max(0, targetDocumentTotal - targetPaid.document))
          - alreadyAppliedToTarget.document);
        const targetAvailableFunctional = Math.max(0, targetFunctionalTotal - targetPaid.functional
          - Math.min(targetCredit.functional, Math.max(0, targetFunctionalTotal - targetPaid.functional))
          - alreadyAppliedToTarget.functional);
        if (documentAmount > targetAvailableDocument || functionalAmount > targetAvailableFunctional) {
          throw new PurchaseRequestError('Le montant affecté dépasse le solde payable disponible de la facture cible.', 409);
        }
        return tx.supplierCreditNoteApplication.create({
          data: {
            entityId,
            supplierCreditNoteId: credit.id,
            targetPurchaseInvoiceId: target.id,
            documentAmount: documentAmount / 1000,
            functionalAmount: functionalAmount / 1000,
            idempotencyKey,
            createdByUserId: actor.id,
            createdByUsername: actor.username,
            note,
          },
          include: { targetPurchaseInvoice: { select: { id: true, invoiceNumber: true } } },
        });
      });
    } catch (error) {
      if (isPurchaseUniqueConstraintViolation(error)) {
        const existing = await prisma.supplierCreditNoteApplication.findUnique({
          where: { entityId_idempotencyKey: { entityId, idempotencyKey } },
          include: { targetPurchaseInvoice: { select: { id: true, invoiceNumber: true } } },
        });
        if (existing && existing.supplierCreditNoteId === creditNoteId
          && existing.targetPurchaseInvoiceId === targetPurchaseInvoiceId
          && amountToMillimes(existing.documentAmount, 'Le montant affecté existant') === documentAmount
          && existing.note === note) return existing;
      }
      throw error;
    }
  }

  static async recordSupplierCreditNoteDocument(
    creditNoteId: string,
    entityId: string,
    actor: PurchaseWorkflowActor,
    input: unknown,
  ) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new PurchaseRequestError('Les données du document d’avoir sont invalides.', 400);
    }
    const data = input as Record<string, unknown>;
    const supplierDocumentNumber = typeof data.supplierDocumentNumber === 'string'
      ? data.supplierDocumentNumber.trim()
      : '';
    if (!supplierDocumentNumber || supplierDocumentNumber.length > 100) {
      throw new PurchaseRequestError('La référence réelle de l’avoir fournisseur est obligatoire (100 caractères maximum).', 400);
    }
    const creditDate = parseCreditNoteDate(data.creditDate);
    const note = validateWorkflowNote(data.note);
    const documentSubTotal = amountToMillimes(data.documentSubTotal, 'Le montant HT du document');
    const documentTaxAmount = amountToMillimes(data.documentTaxAmount, 'La TVA du document');
    const documentTotalAmount = amountToMillimes(data.documentTotalAmount, 'Le montant TTC du document');

    return prisma.$transaction(async (tx) => {
      const current = await tx.supplierCreditNote.findFirst({
        where: { id: creditNoteId, entityId },
        select: {
          id: true,
          status: true,
          documentSubTotal: true,
          documentTaxAmount: true,
          documentTotalAmount: true,
        },
      });
      if (!current) throw new PurchaseRequestError('Avoir fournisseur introuvable pour cette société.', 404);
      if (current.status !== 'AWAITING_SUPPLIER_DOCUMENT') {
        throw new PurchaseRequestError('Le document externe ne peut être enregistré que sur un avoir en attente.', 409);
      }
      if (documentSubTotal !== amountToMillimes(current.documentSubTotal, 'Le montant HT attendu')
        || documentTaxAmount !== amountToMillimes(current.documentTaxAmount, 'La TVA attendue')
        || documentTotalAmount !== amountToMillimes(current.documentTotalAmount, 'Le montant TTC attendu')) {
        throw new PurchaseRequestError(
          'Les montants du document fournisseur diffèrent du rapprochement calculé; aucun écart n’est configuré, le document reste en attente.',
          409,
        );
      }
      try {
        const changed = await tx.supplierCreditNote.updateMany({
          where: { id: current.id, entityId, status: 'AWAITING_SUPPLIER_DOCUMENT' },
          data: { supplierDocumentNumber, creditDate, status: 'TO_REVIEW' },
        });
        if (changed.count !== 1) throw new PurchaseRequestError('L’avoir a changé pendant la saisie; rechargez-le.', 409);
        await tx.supplierCreditNoteWorkflowEvent.create({
          data: {
            supplierCreditNoteId: current.id,
            action: 'DOCUMENT_RECORDED',
            actorUserId: actor.id,
            actorUsername: actor.username,
            note,
          },
        });
      } catch (error) {
        if (isPurchaseUniqueConstraintViolation(error)) {
          throw new PurchaseRequestError('Cette référence d’avoir fournisseur existe déjà pour cette société.', 409);
        }
        throw error;
      }
      return tx.supplierCreditNote.findUnique({
        where: { id: current.id },
        include: { workflowEvents: { orderBy: { createdAt: 'asc' } } },
      });
    });
  }

  static async approveSupplierCreditNote(
    creditNoteId: string,
    entityId: string,
    actor: PurchaseWorkflowActor,
    noteValue: unknown,
  ) {
    const note = validateWorkflowNote(noteValue);
    return prisma.$transaction(async (tx) => {
      const creditNote = await tx.supplierCreditNote.findFirst({
        where: { id: creditNoteId, entityId },
        select: {
          id: true,
          status: true,
          createdByUserId: true,
          supplierDocumentNumber: true,
          creditDate: true,
          sourceInvoiceId: true,
        },
      });
      if (!creditNote) throw new PurchaseRequestError('Avoir fournisseur introuvable pour cette société.', 404);
      if (!creditNote.createdByUserId || creditNote.createdByUserId === actor.id) {
        throw new PurchaseRequestError('L’avoir doit être approuvé par une personne distincte de son préparateur.', 422);
      }
      if (creditNote.status !== 'TO_REVIEW' || !creditNote.supplierDocumentNumber || !creditNote.creditDate) {
        throw new PurchaseRequestError('L’avoir doit comporter le document fournisseur avant approbation.', 409);
      }
      const invoice = await tx.purchaseInvoice.findFirst({
        where: { id: creditNote.sourceInvoiceId, entityId, status: 'POSTED' },
        select: { id: true },
      });
      if (!invoice) {
        throw new PurchaseRequestError('La facture source doit être comptabilisée avant l’approbation de son avoir.', 409);
      }
      const changed = await tx.supplierCreditNote.updateMany({
        where: { id: creditNote.id, entityId, status: 'TO_REVIEW' },
        data: {
          status: 'APPROVED',
          approvedByUserId: actor.id,
          approvedByUsername: actor.username,
          approvedAt: new Date(),
        },
      });
      if (changed.count !== 1) throw new PurchaseRequestError('L’avoir a changé pendant le contrôle; rechargez-le.', 409);
      await tx.supplierCreditNoteWorkflowEvent.create({
        data: {
          supplierCreditNoteId: creditNote.id,
          action: 'APPROVED',
          actorUserId: actor.id,
          actorUsername: actor.username,
          note,
        },
      });
      return tx.supplierCreditNote.findUnique({
        where: { id: creditNote.id },
        include: { workflowEvents: { orderBy: { createdAt: 'asc' } } },
      });
    });
  }

  static async postSupplierCreditNote(
    creditNoteId: string,
    entityId: string,
    actor: PurchaseWorkflowActor,
    noteValue: unknown,
  ) {
    const note = validateWorkflowNote(noteValue);
    try {
      return await prisma.$transaction(async (tx) => {
        const creditNote = await tx.supplierCreditNote.findFirst({
          where: { id: creditNoteId, entityId },
        });
        if (!creditNote) throw new PurchaseRequestError('Avoir fournisseur introuvable pour cette société.', 404);
        if (creditNote.status === 'POSTED') {
          if (!creditNote.postingJournalEntryId) {
            throw new PurchaseRequestError('L’avoir est comptabilisé sans pièce liée; intervention requise.', 409);
          }
          const journal = await tx.journalEntry.findUnique({
            where: { id: creditNote.postingJournalEntryId },
            include: { lines: true },
          });
          if (!journal) throw new PurchaseRequestError('La pièce liée à l’avoir est introuvable; intervention requise.', 409);
          return journal;
        }
        if (creditNote.status !== 'APPROVED' || !creditNote.approvedByUserId
          || !creditNote.supplierDocumentNumber || !creditNote.creditDate) {
          throw new PurchaseRequestError('L’avoir doit être approuvé et documenté avant comptabilisation.', 409);
        }
        if (creditNote.createdByUserId === actor.id || creditNote.approvedByUserId === actor.id) {
          throw new PurchaseRequestError('La personne qui a préparé ou approuvé l’avoir ne peut pas le comptabiliser.', 422);
        }
        const { invoice, configuration } = await this.getPostingContext(tx, creditNote.sourceInvoiceId, entityId);
        if (invoice.status !== 'POSTED' || invoice.vendorId !== creditNote.vendorId) {
          throw new PurchaseRequestError('La facture source doit rester comptabilisée et liée au même fournisseur.', 409);
        }
        const priorCredits = await tx.supplierCreditNote.findMany({
            where: { entityId, sourceInvoiceId: invoice.id, status: 'POSTED' },
            select: { documentTotalAmount: true, totalAmount: true },
          });
        const credited = priorCredits.reduce((totals, prior) => ({
          document: totals.document + amountToMillimes(prior.documentTotalAmount, 'Un avoir existant'),
          functional: totals.functional + amountToMillimes(prior.totalAmount, 'Un avoir fonctionnel existant'),
        }), { document: 0, functional: 0 });
        const invoiceDocumentMillimes = amountToMillimes(
          invoice.documentTotalAmount ?? invoice.totalAmount,
          'Le montant TTC de la facture source',
        );
        const invoiceFunctionalMillimes = amountToMillimes(invoice.totalAmount, 'Le montant fonctionnel de la facture source');
        if (credited.document + amountToMillimes(creditNote.documentTotalAmount, 'Le montant TTC de l’avoir')
          > invoiceDocumentMillimes
          || credited.functional + amountToMillimes(creditNote.totalAmount, 'Le montant fonctionnel de l’avoir')
          > invoiceFunctionalMillimes) {
          throw new PurchaseRequestError('Les avoirs cumulés dépasseraient le total de la facture source.', 409);
        }
        await assertAccountingPeriodOpen(
          tx,
          entityId,
          creditNote.creditDate,
          (message) => new PurchaseRequestError(message, 409),
        );
        const lines = buildSupplierCreditNotePostingLines(creditNote, configuration);
        const entryNumber = `PURCHASE-CREDIT-${creditNote.id}`;
        const validated = validateJournalEntry({
          entryNumber,
          entityId,
          date: creditNote.creditDate.toISOString().slice(0, 10),
          reference: creditNote.supplierDocumentNumber,
          description: `Avoir fournisseur ${creditNote.supplierDocumentNumber}`,
          lines,
        });
        const journal = await tx.journalEntry.create({
          data: {
            entryNumber: validated.entryNumber,
            entityId,
            date: new Date(`${validated.date}T00:00:00.000Z`),
            reference: validated.reference,
            description: validated.description,
            status: 'POSTED',
            lines: { create: validated.lines },
          },
          include: { lines: true },
        });
        await appendJournalEntryAuditRecord(tx, journal.id);
        const changed = await tx.supplierCreditNote.updateMany({
          where: { id: creditNote.id, entityId, status: 'APPROVED', postingJournalEntryId: null },
          data: {
            status: 'POSTED',
            postedByUserId: actor.id,
            postedByUsername: actor.username,
            postedAt: new Date(),
            postingJournalEntryId: journal.id,
          },
        });
        if (changed.count !== 1) throw new PurchaseRequestError('L’avoir a changé pendant sa comptabilisation; rechargez-le.', 409);
        await tx.supplierCreditNoteWorkflowEvent.create({
          data: {
            supplierCreditNoteId: creditNote.id,
            action: 'POSTED',
            actorUserId: actor.id,
            actorUsername: actor.username,
            note,
          },
        });
        return journal;
      });
    } catch (error) {
      if (isPurchaseUniqueConstraintViolation(error)) {
        const posted = await prisma.supplierCreditNote.findFirst({
          where: { id: creditNoteId, entityId, status: 'POSTED', postingJournalEntryId: { not: null } },
          select: { postingJournalEntryId: true },
        });
        if (posted?.postingJournalEntryId) {
          const journal = await prisma.journalEntry.findUnique({
            where: { id: posted.postingJournalEntryId },
            include: { lines: true },
          });
          if (!journal) throw new PurchaseRequestError('La pièce liée à l’avoir est introuvable; intervention requise.', 409);
          return journal;
        }
      }
      throw error;
    }
  }

  static async getModuleData(entityId: string) {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: {
        name: true,
        countryId: true,
        country: {
          select: {
            code: true,
            currencyCode: true,
            taxRates: {
              select: { id: true, code: true, name: true, rate: true, purchaseVatRecoverable: true },
              orderBy: { rate: 'asc' },
            },
          },
        },
      },
    });
    if (!entity) throw new PurchaseRequestError('Société introuvable', 404);
    const [vendors, materials, warehouses, invoiceRows] = await Promise.all([
      prisma.vendor.findMany({
        where: { entityId },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.material.findMany({
        where: { entityId },
        select: { id: true, sku: true, name: true, unitCode: true },
        orderBy: { sku: 'asc' },
      }),
      prisma.warehouse.findMany({
        where: { entityId },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      prisma.purchaseInvoice.findMany({
        where: { entityId },
        select: {
          id: true,
          invoiceNumber: true,
          issueDate: true,
          dueDate: true,
          currencyCode: true,
          subTotal: true,
          taxRateCode: true,
          taxRate: true,
          taxAmount: true,
          totalAmount: true,
          documentCurrencyCode: true,
          documentSubTotal: true,
          documentTaxAmount: true,
          documentTotalAmount: true,
          functionalCurrencyCode: true,
          exchangeRate: true,
          exchangeRateDate: true,
          exchangeRateSource: true,
          exchangeRateImportedAt: true,
          status: true,
          createdByUsername: true,
          approvedByUsername: true,
          approvedAt: true,
          postedByUsername: true,
          postedAt: true,
          workflowEvents: {
            select: { action: true, actorUsername: true, note: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
          postingJournalEntryId: true,
          vendor: { select: { id: true, code: true, name: true } },
          lines: {
            select: { id: true, description: true, materialId: true, purchaseOrderLineId: true, quantity: true, unitPrice: true },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);
    const postingJournalIds = invoiceRows
      .map((invoice) => invoice.postingJournalEntryId)
      .filter((id): id is string => Boolean(id));
    const postingJournals = postingJournalIds.length > 0
      ? await prisma.journalEntry.findMany({
        where: { id: { in: postingJournalIds }, entityId },
        select: { id: true, entryNumber: true, date: true },
      })
      : [];
    const journalsById = new Map(postingJournals.map((journal) => [journal.id, journal]));
    const invoices = invoiceRows.map((invoice) => ({
      ...invoice,
      postingJournalEntry: invoice.postingJournalEntryId
        ? journalsById.get(invoice.postingJournalEntryId) ?? null
        : null,
    }));
    return {
      entity: { name: entity.name, countryCode: entity.country.code, currencyCode: entity.country.currencyCode },
      vendors,
      materials,
      warehouses,
      taxRates: entity.country.taxRates,
      invoices,
    };
  }

  static async getPayablesAging(entityId: string, value: unknown) {
    const { asOf, endExclusive } = parsePayablesAsOf(value);
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { name: true, country: { select: { currencyCode: true } } },
    });
    if (!entity) throw new PurchaseRequestError('Société introuvable.', 404);
    const invoices = await prisma.purchaseInvoice.findMany({
      where: {
        entityId,
        status: 'POSTED',
        OR: [{ postedAt: null }, { postedAt: { lt: endExclusive } }],
      },
      select: {
        id: true,
        invoiceNumber: true,
        postedAt: true,
        dueDate: true,
        status: true,
        totalAmount: true,
        currencyCode: true,
        functionalCurrencyCode: true,
        vendor: { select: { code: true, name: true } },
        cashflowPayments: {
          where: { entityId, paidAt: { lt: endExclusive } },
          select: { amount: true, currencyCode: true, direction: true, paidAt: true },
        },
        supplierCreditNotes: {
          where: { status: 'POSTED' },
          select: { totalAmount: true, currencyCode: true, status: true, postedAt: true },
        },
        supplierCreditApplications: {
          select: { functionalAmount: true, createdAt: true },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { postedAt: 'asc' }],
    });
    return calculatePayablesAging({
      entity: { name: entity.name, currencyCode: entity.country.currencyCode },
      invoices,
      asOf,
    });
  }

  static async getSupplierScore(vendorId: string, entityId: string) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, entityId },
      select: { id: true },
    });
    if (!vendor) throw new PurchaseRequestError('Fournisseur introuvable pour cette société.', 404);

    const [snapshot, configuration] = await Promise.all([
      prisma.partnerScoreSnapshot.findFirst({
        where: { entityId, scoreType: 'SUPPLIER', partnerId: vendor.id },
        orderBy: [{ calculatedAt: 'desc' }, { id: 'desc' }],
        select: {
          score: true,
          alertThreshold: true,
          alertTriggered: true,
          configurationVersion: true,
          calculatedAt: true,
        },
      }),
      prisma.workbookFeatureConfiguration.findUnique({
        where: { entityId_featureKey: { entityId, featureKey: 'customer-supplier-scoring' } },
        select: { enabled: true, confirmedAt: true, version: true },
      }),
    ]);
    if (!snapshot) return null;
    return {
      ...snapshot,
      isCurrent: Boolean(configuration?.enabled
        && configuration.confirmedAt
        && configuration.version === snapshot.configurationVersion),
    };
  }

  static async createDraftInvoice(input: unknown, entityId: string, actor: PurchaseWorkflowActor) {
    const data = validatePurchaseInvoiceInput(input);
    const [entity, vendor, taxRate] = await Promise.all([
      prisma.entity.findUnique({
        where: { id: entityId },
        select: { countryId: true, country: { select: { currencyCode: true } } },
      }),
      prisma.vendor.findFirst({
        where: { id: data.vendorId, entityId },
        select: { id: true },
      }),
      prisma.taxRate.findFirst({
        where: { id: data.taxRateId },
        select: { id: true, countryId: true, code: true, rate: true },
      }),
    ]);
    if (!entity) throw new PurchaseRequestError('Société introuvable', 404);
    if (!vendor) throw new PurchaseRequestError('Fournisseur introuvable pour cette société.', 404);
    if (!taxRate || taxRate.countryId !== entity.countryId) {
      throw new PurchaseRequestError('Le taux sélectionné n’appartient pas au profil pays de cette société.', 422);
    }
    const materialIds = (data.lines ?? [])
      .map((line) => line.materialId)
      .filter((id): id is string => id !== null);
    if (materialIds.length > 0) {
      const materials = await prisma.material.findMany({
        where: { id: { in: materialIds }, entityId },
        select: { id: true, unitCode: true },
      });
      if (materials.length !== new Set(materialIds).size) {
        throw new PurchaseRequestError('Un article lié à une ligne est introuvable pour cette société.', 422);
      }
      const units = new Map(materials.map((material) => [material.id, material.unitCode]));
      try {
        data.lines = data.lines?.map((line) => ({
          ...line,
          quantity: validateStockQuantity(
            line.quantity,
            'La quantité facturée',
            { unitCode: line.materialId ? units.get(line.materialId) : undefined },
          ),
        }));
      } catch (error) {
        throw new PurchaseRequestError(error instanceof Error ? error.message : 'Quantité facturée invalide.', 422);
      }
    }

    const snapshot = normalizeInvoiceFxSnapshot(data, entity.country.currencyCode, data.issueDate);
    const linkedOrderLines = data.lines?.filter((line) => line.purchaseOrderLineId) ?? [];
    if (new Set(linkedOrderLines.map((line) => line.purchaseOrderLineId)).size !== linkedOrderLines.length) {
      throw new PurchaseRequestError('Une ligne de commande ne peut apparaître qu’une fois sur la facture.', 422);
    }
    if (linkedOrderLines.length > 0) {
      const orderLineIds = linkedOrderLines.map((line) => line.purchaseOrderLineId!);
      const [orderLines, existingInvoiceLines] = await Promise.all([
        prisma.purchaseOrderLine.findMany({
          where: { entityId, id: { in: orderLineIds } },
          include: { order: { select: { status: true, vendorId: true, currencyCode: true } } },
        }),
        prisma.purchaseInvoiceLine.findMany({
          where: {
            entityId,
            purchaseOrderLineId: { in: orderLineIds },
            purchaseInvoice: { status: { in: ['TO_REVIEW', 'APPROVED', 'POSTED'] } },
          },
          select: {
            purchaseOrderLineId: true,
            quantity: true,
            purchaseInvoice: { select: { vendorId: true } },
          },
        }),
      ]);
      if (orderLines.length !== orderLineIds.length) {
        throw new PurchaseRequestError('Une ligne de commande liée est introuvable pour cette société.', 404);
      }
      const invoicedQuantityByLine = new Map<string, number>();
      existingInvoiceLines.forEach((line) => {
        if (!line.purchaseOrderLineId) return;
        const quantity = quantityMilliUnits(line.quantity, 'La quantité facturée existante');
        invoicedQuantityByLine.set(
          line.purchaseOrderLineId,
          (invoicedQuantityByLine.get(line.purchaseOrderLineId) ?? 0) + quantity,
        );
      });
      const orderLineById = new Map(orderLines.map((line) => [line.id, line]));
      linkedOrderLines.forEach((invoiceLine) => {
        const purchaseOrderLineId = invoiceLine.purchaseOrderLineId!;
        const orderLine = orderLineById.get(purchaseOrderLineId);
        if (!orderLine || orderLine.order.status !== 'APPROVED') {
          throw new PurchaseRequestError('La ligne de commande doit appartenir à une commande approuvée.', 409);
        }
        if (orderLine.order.vendorId !== vendor.id) {
          throw new PurchaseRequestError('Le fournisseur de la facture diffère de celui de la commande.', 422);
        }
        if (orderLine.order.currencyCode !== snapshot.documentCurrencyCode || snapshot.exchangeRate !== 1) {
          throw new PurchaseRequestError('Une ligne de commande ne peut être rapprochée que d’une facture dans la même devise, sans conversion.', 422);
        }
        if (orderLine.materialId !== invoiceLine.materialId) {
          throw new PurchaseRequestError('L’article de la facture ne correspond pas à la ligne de commande.', 422);
        }
        const invoiceUnitPriceMillimes = Math.round(invoiceLine.unitPrice * 1000);
        const orderUnitPriceMillimes = Math.round(orderLine.unitPrice * 1000);
        if (invoiceUnitPriceMillimes !== orderUnitPriceMillimes) {
          throw new PurchaseRequestError('Le prix unitaire facturé diffère du prix approuvé; aucun écart de prix n’est configuré.', 409);
        }
        const totalInvoiced = (invoicedQuantityByLine.get(purchaseOrderLineId) ?? 0)
          + quantityMilliUnits(invoiceLine.quantity, 'La quantité facturée');
        if (totalInvoiced > quantityMilliUnits(orderLine.quantity, 'La quantité commandée')) {
          throw new PurchaseRequestError('La quantité facturée dépasserait le solde de la commande.', 409);
        }
      });
    }
    const documentAmounts = calculatePurchaseInvoiceAmounts(data.subTotal, taxRate.rate);
    const functionalAmounts = convertInvoiceComponents({
      subTotal: documentAmounts.subTotal,
      taxAmount: documentAmounts.taxAmount,
    }, snapshot.exchangeRate);
    try {
      return await prisma.purchaseInvoice.create({
        data: {
          invoiceNumber: data.invoiceNumber,
          entityId,
          vendorId: vendor.id,
          issueDate: new Date(`${data.issueDate}T00:00:00.000Z`),
          dueDate: new Date(`${data.dueDate}T00:00:00.000Z`),
          currencyCode: snapshot.functionalCurrencyCode,
          subTotal: functionalAmounts.subTotal,
          taxAmount: functionalAmounts.taxAmount,
          totalAmount: functionalAmounts.totalAmount,
          documentCurrencyCode: snapshot.documentCurrencyCode,
          documentSubTotal: documentAmounts.subTotal,
          documentTaxAmount: documentAmounts.taxAmount,
          documentTotalAmount: documentAmounts.totalAmount,
          functionalCurrencyCode: snapshot.functionalCurrencyCode,
          exchangeRate: snapshot.exchangeRate,
          exchangeRateDate: new Date(`${snapshot.exchangeRateDate}T00:00:00.000Z`),
          exchangeRateSource: snapshot.exchangeRateSource,
          exchangeRateImportedAt: snapshot.exchangeRateImportedAt
            ? new Date(snapshot.exchangeRateImportedAt)
            : null,
          taxRateId: taxRate.id,
          taxRateCode: taxRate.code,
          taxRate: taxRate.rate,
          createdByUserId: actor.id,
          createdByUsername: actor.username,
          status: 'TO_REVIEW',
          ...(data.lines ? {
            lines: {
              create: data.lines.map((line) => ({
                description: line.description,
                materialId: line.materialId,
                purchaseOrderLineId: line.purchaseOrderLineId ?? null,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
              })),
            },
          } : {}),
        },
        include: { vendor: { select: { id: true, code: true, name: true } } },
      });
    } catch (error) {
      if (isPurchaseUniqueConstraintViolation(error)) {
        throw new PurchaseRequestError('Ce numéro de facture existe déjà pour cette société.', 409);
      }
      throw error;
    }
  }

  private static async getPostingContext(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    entityId: string,
  ) {
    const invoice = await tx.purchaseInvoice.findFirst({
      where: { id: invoiceId, entityId },
      include: {
        lines: { select: { description: true } },
        entity: {
          select: {
            countryId: true,
            country: {
              select: {
                code: true,
                currencyCode: true,
                purchaseExpenseAccountCode: true,
                purchaseVatAccountCode: true,
                taxRates: {
                  select: { id: true, code: true, rate: true, purchaseVatRecoverable: true },
                },
              },
            },
          },
        },
      },
    });
    if (!invoice) throw new PurchaseRequestError('Facture fournisseur introuvable pour cette société.', 404);
    const mapping = await tx.cashflowAccountingMapping.findUnique({
      where: { entityId },
      select: { payableAccountCode: true },
    });
    const accountCodes = [
      invoice.entity.country.purchaseExpenseAccountCode,
      invoice.entity.country.purchaseVatAccountCode,
      mapping?.payableAccountCode ?? null,
    ].filter((code): code is string => Boolean(code));
    const accounts = await tx.chartOfAccount.findMany({
      where: { countryId: invoice.entity.countryId, code: { in: accountCodes } },
      select: { code: true, type: true, isPostingAllowed: true },
    });
    return {
      invoice,
      configuration: {
        functionalCurrencyCode: invoice.entity.country.currencyCode,
        purchaseExpenseAccountCode: invoice.entity.country.purchaseExpenseAccountCode,
        purchaseVatAccountCode: invoice.entity.country.purchaseVatAccountCode,
        payableAccountCode: mapping?.payableAccountCode ?? null,
        taxRates: invoice.entity.country.taxRates,
        accounts,
      },
    };
  }

  static async approveInvoice(invoiceId: string, entityId: string, actor: PurchaseWorkflowActor, noteValue: unknown) {
    const note = validateWorkflowNote(noteValue);
    return prisma.$transaction(async (tx) => {
      const { invoice, configuration } = await this.getPostingContext(tx, invoiceId, entityId);
      if (!invoice.createdByUserId || invoice.createdByUserId === actor.id) {
        throw new PurchaseRequestError('La facture doit avoir un auteur identifié différent du contrôleur.', 422);
      }
      if (invoice.status !== 'TO_REVIEW') {
        throw new PurchaseRequestError('Seule une facture à contrôler peut être validée.', 409);
      }
      buildPurchasePostingLines(invoice, configuration);
      await this.matchUnlinkedPurchaseOrderReceipts(tx, invoice.id, entityId);
      const changed = await tx.purchaseInvoice.updateMany({
        where: { id: invoice.id, entityId, status: 'TO_REVIEW' },
        data: {
          status: 'APPROVED',
          approvedByUserId: actor.id,
          approvedByUsername: actor.username,
          approvedAt: new Date(),
        },
      });
      if (changed.count !== 1) throw new PurchaseRequestError('La facture a changé pendant le contrôle; rechargez-la.', 409);
      await tx.purchaseInvoiceWorkflowEvent.create({
        data: {
          purchaseInvoiceId: invoice.id,
          action: 'APPROVED',
          actorUserId: actor.id,
          actorUsername: actor.username,
          note,
        },
      });
      return tx.purchaseInvoice.findUnique({
        where: { id: invoice.id },
        include: { workflowEvents: { orderBy: { createdAt: 'asc' } } },
      });
    });
  }

  static async rejectInvoice(invoiceId: string, entityId: string, actor: PurchaseWorkflowActor, noteValue: unknown) {
    const note = validateWorkflowNote(noteValue);
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.purchaseInvoice.findFirst({
        where: { id: invoiceId, entityId },
        select: { id: true, status: true, createdByUserId: true },
      });
      if (!invoice) throw new PurchaseRequestError('Facture fournisseur introuvable pour cette société.', 404);
      if (!invoice.createdByUserId || invoice.createdByUserId === actor.id) {
        throw new PurchaseRequestError('La facture doit avoir un auteur identifié différent du contrôleur.', 422);
      }
      if (invoice.status !== 'TO_REVIEW') {
        throw new PurchaseRequestError('Seule une facture à contrôler peut être rejetée.', 409);
      }
      const changed = await tx.purchaseInvoice.updateMany({
        where: { id: invoice.id, entityId, status: 'TO_REVIEW' },
        data: { status: 'REJECTED' },
      });
      if (changed.count !== 1) throw new PurchaseRequestError('La facture a changé pendant le contrôle; rechargez-la.', 409);
      await tx.purchaseInvoiceWorkflowEvent.create({
        data: {
          purchaseInvoiceId: invoice.id,
          action: 'REJECTED',
          actorUserId: actor.id,
          actorUsername: actor.username,
          note,
        },
      });
      return tx.purchaseInvoice.findUnique({
        where: { id: invoice.id },
        include: { workflowEvents: { orderBy: { createdAt: 'asc' } } },
      });
    });
  }

  static async cancelInvoice(
    invoiceId: string,
    entityId: string,
    actor: PurchaseWorkflowActor,
    noteValue: unknown,
    reversalDateValue?: unknown,
  ) {
    const note = validateWorkflowNote(noteValue);
    const invoice = await prisma.purchaseInvoice.findFirst({
      where: { id: invoiceId, entityId },
      select: { id: true, status: true, postingJournalEntryId: true },
    });
    if (!invoice) throw new PurchaseRequestError('Facture fournisseur introuvable pour cette société.', 404);
    if (!invoice.postingJournalEntryId
      || !['POSTED', 'CANCELLATION_PENDING', 'CANCELLED'].includes(invoice.status)) {
      throw new PurchaseRequestError('Seule une facture fournisseur comptabilisée peut être annulée.', 409);
    }

    return FinanceService.createJournalReversal(
      invoice.postingJournalEntryId,
      entityId,
      actor,
      note,
      reversalDateValue,
      async (tx, reversal) => {
        const current = await tx.purchaseInvoice.findFirst({
          where: { id: invoice.id, entityId, postingJournalEntryId: invoice.postingJournalEntryId },
          select: { id: true, status: true, createdByUserId: true, approvedByUserId: true, postedByUserId: true },
        });
        if (!current) throw new PurchaseRequestError('La facture fournisseur comptabilisée est introuvable pour cette société.', 404);
        if (current.status === 'CANCELLED') {
          if (reversal.status !== 'POSTED') {
            throw new PurchaseRequestError('Le statut d’annulation ne correspond pas à la contrepassation liée.', 409);
          }
          return;
        }
        if (current.status === 'CANCELLATION_PENDING') {
          if (reversal.status === 'REJECTED') {
            throw new PurchaseRequestError('La contrepassation liée a été rejetée; une nouvelle revue est nécessaire.', 409);
          }
          if (reversal.status === 'POSTED') {
            const changed = await tx.purchaseInvoice.updateMany({
              where: { id: current.id, entityId, status: 'CANCELLATION_PENDING' },
              data: { status: 'CANCELLED' },
            });
            if (changed.count !== 1) throw new PurchaseRequestError('La facture a changé pendant la clôture de son annulation.', 409);
            await tx.purchaseInvoiceWorkflowEvent.create({
              data: {
                purchaseInvoiceId: current.id,
                action: 'CANCELLED',
                actorUserId: actor.id,
                actorUsername: actor.username,
                note: `Contrepassation déjà comptabilisée: ${note}`,
              },
            });
          }
          return;
        }
        if (current.status !== 'POSTED') {
          throw new PurchaseRequestError('Seule une facture fournisseur comptabilisée sans règlement peut être annulée.', 409);
        }
        if (!current.createdByUserId || current.createdByUserId === actor.id
          || current.approvedByUserId === actor.id || current.postedByUserId === actor.id) {
          throw new PurchaseRequestError('La demande d’annulation doit être préparée par une personne distincte de l’auteur, du contrôleur et du comptabilisateur de la facture.', 422);
        }
        const [paymentCount, revaluationCount, creditNoteCount] = await Promise.all([
          tx.cashflowPayment.count({ where: { entityId, purchaseInvoiceId: current.id } }),
          tx.fxRevaluationItem.count({ where: { purchaseInvoiceId: current.id } }),
          tx.supplierCreditNote.count({ where: { entityId, sourceInvoiceId: current.id, status: { not: 'REJECTED' } } }),
        ]);
        if (paymentCount > 0 || revaluationCount > 0 || creditNoteCount > 0) {
          throw new PurchaseRequestError('La facture comporte des règlements, une réévaluation ou un avoir fournisseur; traitez ces opérations avant de demander son annulation.', 409);
        }
        if (reversal.status === 'REJECTED') {
          throw new PurchaseRequestError('La contrepassation liée a été rejetée; une nouvelle revue est nécessaire.', 409);
        }
        const cancelled = reversal.status === 'POSTED';
        const changed = await tx.purchaseInvoice.updateMany({
          where: { id: current.id, entityId, status: 'POSTED' },
          data: { status: cancelled ? 'CANCELLED' : 'CANCELLATION_PENDING' },
        });
        if (changed.count !== 1) throw new PurchaseRequestError('La facture a changé pendant la demande d’annulation; rechargez-la.', 409);
        await tx.purchaseInvoiceWorkflowEvent.create({
          data: {
            purchaseInvoiceId: current.id,
            action: cancelled ? 'CANCELLED' : 'CANCELLATION_REQUESTED',
            actorUserId: actor.id,
            actorUsername: actor.username,
            note: cancelled ? `Contrepassation déjà comptabilisée: ${note}` : note,
          },
        });
      },
    );
  }

  static async postInvoice(invoiceId: string, entityId: string, actor: PurchaseWorkflowActor, noteValue: unknown) {
    const note = validateWorkflowNote(noteValue);
    try {
      return await prisma.$transaction(async (tx) => {
        const { invoice, configuration } = await this.getPostingContext(tx, invoiceId, entityId);
        if (invoice.status === 'POSTED') {
          if (!invoice.postingJournalEntryId) {
            throw new PurchaseRequestError('La facture est marquée comptabilisée sans pièce liée; intervention requise.', 409);
          }
          const journal = await tx.journalEntry.findUnique({
            where: { id: invoice.postingJournalEntryId },
            include: { lines: true },
          });
          if (!journal) throw new PurchaseRequestError('La pièce liée à la facture est introuvable; intervention requise.', 409);
          return journal;
        }
        if (invoice.status !== 'APPROVED' || !invoice.approvedByUserId) {
          throw new PurchaseRequestError('La facture doit être validée avant sa comptabilisation.', 409);
        }
        if (invoice.approvedByUserId === actor.id) {
          throw new PurchaseRequestError('La personne qui a validé ne peut pas comptabiliser la même facture.', 422);
        }
        await this.matchUnlinkedPurchaseOrderReceipts(tx, invoice.id, entityId);
        const materialLines = await tx.purchaseInvoiceLine.findMany({
          where: { entityId, purchaseInvoiceId: invoice.id, materialId: { not: null } },
          select: {
            id: true,
            quantity: true,
            receiptMatches: {
              select: {
                receipt: {
                  select: {
                    quantity: true,
                    supplierReturns: { select: { quantity: true } },
                  },
                },
              },
            },
          },
        });
        for (const line of materialLines) {
          const invoicedQuantity = quantityMilliUnits(line.quantity, 'La quantité facturée');
          const receivedQuantity = line.receiptMatches.reduce((total, match) => {
            const received = quantityMilliUnits(match.receipt.quantity, 'La quantité réceptionnée');
            const returned = match.receipt.supplierReturns.reduce(
              (sum, supplierReturn) => sum + quantityMilliUnits(supplierReturn.quantity, 'La quantité retournée'),
              0,
            );
            if (returned > received) {
              throw new PurchaseRequestError('Les retours fournisseur dépassent une réception liée à la facture.', 409);
            }
            return total + received - returned;
          }, 0);
          if (receivedQuantity < invoicedQuantity) {
            throw new PurchaseRequestError(
              `La ligne matérielle ${line.id} doit être réceptionnée intégralement avant la comptabilisation.`,
              409,
            );
          }
        }
        await assertAccountingPeriodOpen(
          tx,
          entityId,
          invoice.issueDate,
          (message) => new PurchaseRequestError(message, 409),
        );
        let lines = buildPurchasePostingLines(invoice, configuration);
        try {
          const lineDescriptions = (invoice.lines ?? []).map((line) => line.description).filter(Boolean).join(' ');
          lines = await applyAnalyticalAllocationRules(tx, entityId, invoice.entity.country.code, 'PURCHASE', `${invoice.invoiceNumber} ${lineDescriptions}`.trim(), lines);
        } catch (error) {
          if (error instanceof AnalyticalAllocationError) throw new PurchaseRequestError(error.message, 422);
          throw error;
        }
        const entryNumber = `PURCHASE-${invoice.id}`;
        const validated = validateJournalEntry({
          entryNumber,
          entityId,
          date: invoice.issueDate.toISOString().slice(0, 10),
          reference: invoice.invoiceNumber,
          description: `Facture fournisseur ${invoice.invoiceNumber}`,
          lines,
        });
        const journal = await tx.journalEntry.create({
          data: {
            entryNumber: validated.entryNumber,
            entityId,
            date: new Date(`${validated.date}T00:00:00.000Z`),
            reference: validated.reference,
            description: validated.description,
            status: 'POSTED',
            lines: { create: validated.lines },
          },
          include: { lines: true },
        });
        await appendJournalEntryAuditRecord(tx, journal.id);
        const changed = await tx.purchaseInvoice.updateMany({
          where: { id: invoice.id, entityId, status: 'APPROVED', postingJournalEntryId: null },
          data: {
            status: 'POSTED',
            postedByUserId: actor.id,
            postedByUsername: actor.username,
            postedAt: new Date(),
            postingJournalEntryId: journal.id,
          },
        });
        if (changed.count !== 1) throw new PurchaseRequestError('La facture a changé pendant la comptabilisation; rechargez-la.', 409);
        await tx.purchaseInvoiceWorkflowEvent.create({
          data: {
            purchaseInvoiceId: invoice.id,
            action: 'POSTED',
            actorUserId: actor.id,
            actorUsername: actor.username,
            note,
          },
        });
        return journal;
      });
    } catch (error) {
      if (isPurchaseUniqueConstraintViolation(error)) {
        const posted = await prisma.purchaseInvoice.findFirst({
          where: { id: invoiceId, entityId, status: 'POSTED', postingJournalEntryId: { not: null } },
          select: { postingJournalEntryId: true },
        });
        if (posted?.postingJournalEntryId) {
          const journal = await prisma.journalEntry.findUnique({
            where: { id: posted.postingJournalEntryId },
            include: { lines: true },
          });
          if (!journal) throw new PurchaseRequestError('La pièce liée à la facture est introuvable; intervention requise.', 409);
          return journal;
        }
      }
      throw error;
    }
  }
}

export default PurchasesService;
