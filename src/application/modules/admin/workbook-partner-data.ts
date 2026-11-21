import prisma from '../../../data/prisma/client';
import ReceivablesService from '../receivables/service';
import PurchaseService from '../purchases/service';
import { WorkbookFeatureConfigurationError } from './workbook-feature-errors';
import type { WorkbookScoreSubjectType } from './workbook-score-service';

type PartnerType = Exclude<WorkbookScoreSubjectType, 'HEALTH'>;

interface PartnerIdentity {
  id: string;
  code: string;
}

function isPartnerType(value: unknown): value is PartnerType {
  return value === 'CUSTOMER' || value === 'SUPPLIER';
}

function requireText(value: unknown, label: string, minimum: number, maximum: number): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < minimum || value.length > maximum) {
    throw new WorkbookFeatureConfigurationError(`${label} est invalide.`, 400);
  }
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new WorkbookFeatureConfigurationError(`${label} est invalide.`, 400);
  }
  return value as Record<string, unknown>;
}

async function findPartner(entityId: string, partnerType: PartnerType, partnerIdOrCode: string): Promise<PartnerIdentity> {
  const partner = partnerType === 'CUSTOMER'
    ? await prisma.customer.findFirst({
      where: { entityId, OR: [{ id: partnerIdOrCode }, { code: partnerIdOrCode }] },
      select: { id: true, code: true },
    })
    : await prisma.vendor.findFirst({
      where: { entityId, OR: [{ id: partnerIdOrCode }, { code: partnerIdOrCode }] },
      select: { id: true, code: true },
    });
  if (!partner) throw new WorkbookFeatureConfigurationError('Partenaire introuvable dans cette entité.', 404);
  return partner;
}

export async function listWorkbookPartnerDisputes(input: {
  entityId: string;
  partnerType: unknown;
  partnerId: string;
}) {
  if (!isPartnerType(input.partnerType)) {
    throw new WorkbookFeatureConfigurationError('Le type de partenaire est invalide.', 400);
  }
  const partner = await findPartner(input.entityId, input.partnerType, input.partnerId);
  return prisma.partnerDispute.findMany({
    where: { entityId: input.entityId, partnerType: input.partnerType, partnerId: partner.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      reference: true,
      note: true,
      status: true,
      createdBy: true,
      createdAt: true,
      resolvedAt: true,
      resolvedBy: true,
      resolutionNote: true,
    },
  });
}

export async function createWorkbookPartnerDispute(
  entityId: string,
  input: unknown,
  actor: { id: string; username: string },
) {
  const data = requireRecord(input, 'Le litige');
  if (!isPartnerType(data.partnerType)) {
    throw new WorkbookFeatureConfigurationError('Le type de partenaire est invalide.', 400);
  }
  const partnerId = requireText(data.partnerId, 'L’identifiant du partenaire', 1, 100);
  const reference = data.reference === undefined || data.reference === null || data.reference === ''
    ? null
    : requireText(data.reference, 'La référence', 1, 100);
  const note = requireText(data.note, 'Le motif du litige', 5, 2000);
  if (!actor.id || !actor.username) {
    throw new WorkbookFeatureConfigurationError('Authentification administrateur requise.', 401);
  }
  const partner = await findPartner(entityId, data.partnerType, partnerId);
  return prisma.partnerDispute.create({
    data: {
      entityId,
      partnerType: data.partnerType,
      partnerId: partner.id,
      reference,
      note,
      createdByUserId: actor.id,
      createdBy: actor.username,
    },
    select: {
      id: true,
      partnerType: true,
      partnerId: true,
      reference: true,
      note: true,
      status: true,
      createdBy: true,
      createdAt: true,
    },
  });
}

export async function resolveWorkbookPartnerDispute(
  entityId: string,
  disputeId: string,
  input: unknown,
  actor: { id: string; username: string },
) {
  const data = requireRecord(input, 'La clôture du litige');
  if (data.status !== 'RESOLVED' && data.status !== 'WITHDRAWN') {
    throw new WorkbookFeatureConfigurationError('Le statut final doit être RESOLVED ou WITHDRAWN.', 400);
  }
  const resolutionNote = requireText(data.resolutionNote, 'La note de clôture', 5, 2000);
  if (!actor.id || !actor.username) {
    throw new WorkbookFeatureConfigurationError('Authentification administrateur requise.', 401);
  }
  const changed = await prisma.partnerDispute.updateMany({
    where: { id: disputeId, entityId, status: 'OPEN' },
    data: {
      status: data.status,
      resolvedAt: new Date(),
      resolvedByUserId: actor.id,
      resolvedBy: actor.username,
      resolutionNote,
    },
  });
  if (changed.count !== 1) {
    throw new WorkbookFeatureConfigurationError('Le litige est introuvable ou déjà clôturé.', 409);
  }
  return prisma.partnerDispute.findUniqueOrThrow({
    where: { id: disputeId },
    select: { id: true, status: true, resolvedAt: true, resolvedBy: true, resolutionNote: true },
  });
}

function toMillimes(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new WorkbookFeatureConfigurationError('Une valeur de règlement est invalide.', 422);
  }
  const millimes = Math.round(value * 1000);
  if (!Number.isSafeInteger(millimes) || Math.abs(value * 1000 - millimes) > 1e-7) {
    throw new WorkbookFeatureConfigurationError('Une valeur de règlement n’est pas précise au millime.', 422);
  }
  return millimes;
}

function dateOnly(value: Date): string {
  if (!Number.isFinite(value.getTime())) {
    throw new WorkbookFeatureConfigurationError('Une date de règlement est invalide.', 422);
  }
  return value.toISOString().slice(0, 10);
}

function calendarDaysBetween(start: string, end: string): number {
  return Math.floor((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000);
}

export async function collectWorkbookPartnerScoreMetrics(input: {
  entityId: string;
  partnerType: PartnerType;
  partnerId: string;
  lookbackDays: number;
}) {
  const partner = await findPartner(input.entityId, input.partnerType, input.partnerId);
  const asOf = new Date();
  const asOfDate = asOf.toISOString().slice(0, 10);
  const lookbackStart = new Date(asOf);
  lookbackStart.setUTCDate(lookbackStart.getUTCDate() - input.lookbackDays);
  const paymentWhere = {
    entityId: input.entityId,
    direction: input.partnerType === 'CUSTOMER' ? 'CUSTOMER_RECEIPT' : 'SUPPLIER_PAYMENT',
    paidAt: { gte: lookbackStart },
  };
  const payments = input.partnerType === 'CUSTOMER'
    ? await prisma.cashflowPayment.findMany({
      where: {
        ...paymentWhere,
        invoice: { is: { entityId: input.entityId, customerId: partner.id } },
      },
      select: {
        amount: true,
        carryingAmount: true,
        currencyCode: true,
        direction: true,
        paidAt: true,
        invoice: { select: { dueDate: true, currencyCode: true, functionalCurrencyCode: true } },
      },
    })
    : await prisma.cashflowPayment.findMany({
      where: {
        ...paymentWhere,
        purchaseInvoice: { is: { entityId: input.entityId, vendorId: partner.id } },
      },
      select: {
        amount: true,
        carryingAmount: true,
        currencyCode: true,
        direction: true,
        paidAt: true,
        purchaseInvoice: { select: { dueDate: true, currencyCode: true, functionalCurrencyCode: true } },
      },
    });
  if (payments.length === 0) {
    throw new WorkbookFeatureConfigurationError('Aucun règlement dans la période configurée; le score ne peut pas être calculé.', 422);
  }

  let totalPaidMillimes = 0;
  let onTimePaidMillimes = 0;
  let lateDayMillimes = 0;
  for (const payment of payments) {
    const invoice = input.partnerType === 'CUSTOMER'
      ? 'invoice' in payment ? payment.invoice : null
      : 'purchaseInvoice' in payment ? payment.purchaseInvoice : null;
    if (!invoice?.dueDate) {
      throw new WorkbookFeatureConfigurationError('Une échéance manque dans l’historique de règlements.', 422);
    }
    const expectedCurrency = invoice.functionalCurrencyCode ?? invoice.currencyCode;
    if (payment.direction !== paymentWhere.direction || payment.currencyCode !== expectedCurrency) {
      throw new WorkbookFeatureConfigurationError('Une devise ou direction de règlement est incohérente.', 422);
    }
    const amount = toMillimes(payment.carryingAmount ?? payment.amount);
    totalPaidMillimes += amount;
    if (!Number.isSafeInteger(totalPaidMillimes)) {
      throw new WorkbookFeatureConfigurationError('Le cumul des règlements dépasse la précision sûre.', 422);
    }
    const paidDate = dateOnly(payment.paidAt);
    const dueDate = dateOnly(invoice.dueDate);
    const daysLate = Math.max(0, calendarDaysBetween(dueDate, paidDate));
    if (daysLate === 0) onTimePaidMillimes += amount;
    lateDayMillimes += daysLate * amount;
    if (!Number.isSafeInteger(onTimePaidMillimes) || !Number.isSafeInteger(lateDayMillimes)) {
      throw new WorkbookFeatureConfigurationError('Le cumul des mesures de règlement dépasse la précision sûre.', 422);
    }
  }

  const disputeCount = await prisma.partnerDispute.count({
    where: { entityId: input.entityId, partnerType: input.partnerType, partnerId: partner.id, status: 'OPEN' },
  });
  const exposureReport = input.partnerType === 'CUSTOMER'
    ? await ReceivablesService.getAging(input.entityId, asOfDate)
    : await PurchaseService.getPayablesAging(input.entityId, asOfDate);
  const exposedInvoices = exposureReport.invoices.filter((invoice) => (
    input.partnerType === 'CUSTOMER'
      ? 'customerCode' in invoice && invoice.customerCode === partner.code
      : 'vendorCode' in invoice && invoice.vendorCode === partner.code
  ));
  let exposureMillimes = 0;
  for (const invoice of exposedInvoices) {
    if (invoice.diagnostic || invoice.outstandingAmount === null) {
      throw new WorkbookFeatureConfigurationError('Les créances/dettes du partenaire contiennent des données invalides.', 422);
    }
    exposureMillimes += toMillimes(invoice.outstandingAmount);
    if (!Number.isSafeInteger(exposureMillimes)) {
      throw new WorkbookFeatureConfigurationError('Le cumul de l’exposition dépasse la précision sûre.', 422);
    }
  }

  return {
    paymentHistory: onTimePaidMillimes / totalPaidMillimes,
    paymentDelay: lateDayMillimes / totalPaidMillimes,
    disputes: disputeCount,
    exposure: exposureMillimes / 1000,
    evidence: {
      observationStart: lookbackStart.toISOString(),
      asOf: asOf.toISOString(),
      paymentCount: payments.length,
      openDisputeCount: disputeCount,
      openExposureCurrencyUnit: exposureMillimes / 1000,
    },
  };
}
