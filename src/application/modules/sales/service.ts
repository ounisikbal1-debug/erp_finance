import type { Prisma } from '@prisma/client';
import prisma from '../../../data/prisma/client';
import { randomUUID } from 'node:crypto';
import { validateJournalEntry } from '../finance/journal-validation';
import { applyAnalyticalAllocationRules, AnalyticalAllocationError } from '../controlling/allocation-rules';
import {
  assertConfiguredTaxRates,
  assertSalesPostingConfiguration,
  calculateInvoice,
  calculateQuote,
  getSalesPostingConfigurationIssues,
} from './invoice-validation';
import { validateCustomerContactUpdate, validateCustomerInput } from './customer-validation';
import { isSalesUniqueConstraintViolation, SalesRequestError } from './errors';
import { convertInvoiceComponents, normalizeInvoiceFxSnapshot } from '../fx/conversion';
import { FinanceService } from '../finance/service';
import { assertAccountingPeriodOpen } from '../finance/posting-period';
import MaterialsService from '../materials/service';
import { MaterialsRequestError } from '../materials/errors';
import {
  validateSalesOrderInput,
  validateSalesOrderInvoiceInput,
  validateSalesOrderPickInput,
} from './order';
import { toStockQuantityMilliUnits, validateStockQuantity } from '../materials/quantity';
import { appendJournalEntryAuditRecord } from '../finance/audit-chain';

export interface SalesWorkflowActor {
  id: string;
  username: string;
}

export const INVOICE_PAGE_SIZE_DEFAULT = 50;
export const INVOICE_PAGE_SIZE_MAX = 100;
export const INVOICE_PAGE_MAX = 1_000_000;

interface InvoicePaginationOptions {
  page?: number;
  pageSize?: number;
}

type QuoteDraftData = {
  customerId: string;
  entityId: string;
  currencyCode: string;
  items: ReturnType<typeof calculateQuote>['items'];
  subTotal: number;
  taxAmount: number;
  totalAmount: number;
};

async function validateQuoteDraft(
  data: unknown,
  client: Pick<Prisma.TransactionClient, 'entity' | 'customer' | 'taxRate'> = prisma,
): Promise<QuoteDraftData> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new SalesRequestError('Données de devis invalides.', 400);
  }
  const input = data as Record<string, unknown>;
  if (typeof input.customerId !== 'string' || !input.customerId.trim()
    || typeof input.entityId !== 'string' || !input.entityId.trim()) {
    throw new SalesRequestError('Le client et la société sont obligatoires pour le devis.', 400);
  }
  const customerId = input.customerId.trim();
  const entityId = input.entityId.trim();
  const calculation = calculateQuote(input.items);
  const entity = await client.entity.findUnique({
    where: { id: entityId },
    select: { countryId: true, country: { select: { currencyCode: true } } },
  });
  if (!entity) throw new SalesRequestError('Société introuvable.', 404);
  const customer = await client.customer.findFirst({
    where: { id: customerId, entityId },
    select: { id: true },
  });
  if (!customer) throw new SalesRequestError('Le client est introuvable pour cette société.', 404);
  const configuredTaxRates = await client.taxRate.findMany({
    where: { countryId: entity.countryId },
    select: { rate: true },
  });
  assertConfiguredTaxRates(calculation.items, configuredTaxRates.map(({ rate }) => rate));
  return {
    customerId,
    entityId,
    currencyCode: entity.country.currencyCode,
    items: calculation.items,
    subTotal: calculation.subTotal,
    taxAmount: calculation.taxAmount,
    totalAmount: calculation.totalAmount,
  };
}

function requireWorkflowNote(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 5 || value.trim().length > 500) {
    throw new SalesRequestError('Une note de contrôle de 5 à 500 caractères est obligatoire.', 400);
  }
  return value.trim();
}

function toMillimes(value: number): number | null {
  const millimes = Math.round(value * 1000);
  return Number.isFinite(value) && Number.isSafeInteger(millimes)
    && Math.abs(value * 1000 - millimes) <= 1e-7 ? millimes : null;
}

function assertSameAmount(actual: number, expected: number, label: string): void {
  if (toMillimes(actual) === null || toMillimes(expected) === null || toMillimes(actual) !== toMillimes(expected)) {
    throw new SalesRequestError(`Le contrôle de cohérence du montant ${label} a échoué.`, 422);
  }
}

export class SalesService {
  static async listConfiguredTaxRates(entityId: string) {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: {
        countryId: true,
        country: {
          select: {
            code: true,
            currencyCode: true,
            currencySymbol: true,
            stampDuty: true,
            salesReceivableAccountCode: true,
            salesRevenueAccountCode: true,
            salesVatAccountCode: true,
            salesStampDutyAccountCode: true,
          },
        },
      },
    });
    if (!entity) throw new SalesRequestError('Société introuvable', 404);
    const mapping = {
      receivableAccountCode: entity.country.salesReceivableAccountCode,
      revenueAccountCode: entity.country.salesRevenueAccountCode,
      vatAccountCode: entity.country.salesVatAccountCode,
      stampDutyAccountCode: entity.country.salesStampDutyAccountCode,
    };
    const mappedAccountCodes = Object.values(mapping).filter((code): code is string => typeof code === 'string');
    const [rates, accounts] = await Promise.all([
      prisma.taxRate.findMany({
        where: { countryId: entity.countryId },
        select: { code: true, name: true, rate: true },
        orderBy: { rate: 'asc' },
      }),
      prisma.chartOfAccount.findMany({
        where: {
          countryId: entity.countryId,
          code: { in: mappedAccountCodes },
        },
        select: { code: true, type: true },
      }),
    ]);
    return {
      countryCode: entity.country.code,
      currencyCode: entity.country.currencyCode,
      currencySymbol: entity.country.currencySymbol,
      rates,
      missingRequirements: getSalesPostingConfigurationIssues(
        entity.country.code,
        entity.country.stampDuty,
        rates.map(({ rate }) => rate),
        accounts,
        mapping,
      ),
    };
  }

  static async listCustomers(entityId?: string) {
    const where = entityId ? { entityId } : {};
    return await prisma.customer.findMany({
      where,
      select: { id: true, code: true, name: true, fiscalId: true, email: true, phone: true, address: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getCustomerScore(customerId: string, entityId: string) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, entityId },
      select: { id: true },
    });
    if (!customer) throw new SalesRequestError('Client introuvable pour cette société.', 404);

    const [snapshot, configuration] = await Promise.all([
      prisma.partnerScoreSnapshot.findFirst({
        where: { entityId, scoreType: 'CUSTOMER', partnerId: customer.id },
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

  static async createCustomer(data: unknown, entityId: string) {
    try {
      return await prisma.customer.create({ data: validateCustomerInput(data, entityId) });
    } catch (error) {
      if (isSalesUniqueConstraintViolation(error)) {
        throw new SalesRequestError('Ce code client est déjà utilisé dans cette société. Choisissez un autre code.', 409);
      }
      throw error;
    }
  }

  static async updateCustomerContacts(
    id: string,
    data: unknown,
    entityId: string,
    actor: SalesWorkflowActor,
  ) {
    const contacts = validateCustomerContactUpdate(data);
    const where = { id, entityId };
    return prisma.$transaction(async (transaction) => {
      const current = await transaction.customer.findFirst({
        where,
        select: { id: true, code: true, name: true, fiscalId: true, email: true, phone: true, address: true },
      });
      if (!current) throw new SalesRequestError('Client introuvable pour cette société.', 404);

      const changes: Array<{ field: keyof typeof contacts; previousValue: string | null; newValue: string | null }> = [];
      for (const field of Object.keys(contacts) as Array<keyof typeof contacts>) {
        const previousValue = current[field] ?? null;
        const newValue = contacts[field] ?? null;
        if (previousValue !== newValue) changes.push({ field, previousValue, newValue });
      }
      if (changes.length === 0) return current;

      const guardedWhere: Prisma.CustomerWhereInput = { ...where };
      for (const change of changes) guardedWhere[change.field] = change.previousValue;
      const result = await transaction.customer.updateMany({ where: guardedWhere, data: contacts });
      if (result.count !== 1) throw new SalesRequestError('Le client a changé pendant la mise à jour; rechargez-le.', 409);
      await transaction.customerContactChange.createMany({
        data: changes.map((change) => ({
          customerId: id,
          ...change,
          actorUserId: actor.id,
          actorUsername: actor.username,
        })),
      });
      const updatedCustomer = await transaction.customer.findFirst({
        where,
        select: { id: true, code: true, name: true, fiscalId: true, email: true, phone: true, address: true },
      });
      if (!updatedCustomer) throw new SalesRequestError('Client introuvable après la mise à jour.', 404);
      return updatedCustomer;
    });
  }

  static async listCustomerContactHistory(id: string, entityId: string) {
    const customer = await prisma.customer.findFirst({
      where: { id, entityId },
      select: { id: true },
    });
    if (!customer) throw new SalesRequestError('Client introuvable pour cette société.', 404);
    return prisma.customerContactChange.findMany({
      where: { customerId: id },
      select: {
        id: true,
        field: true,
        previousValue: true,
        newValue: true,
        actorUserId: true,
        actorUsername: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  static async listInvoices(entityId?: string, options: InvoicePaginationOptions = {}) {
    const requestedPage = options.page ?? 1;
    const pageSize = options.pageSize ?? INVOICE_PAGE_SIZE_DEFAULT;
    if (!Number.isSafeInteger(requestedPage) || requestedPage < 1 || requestedPage > INVOICE_PAGE_MAX) {
      throw new SalesRequestError(`Le numéro de page doit être compris entre 1 et ${INVOICE_PAGE_MAX}.`, 400);
    }
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > INVOICE_PAGE_SIZE_MAX) {
      throw new SalesRequestError(`La taille de page doit être comprise entre 1 et ${INVOICE_PAGE_SIZE_MAX}.`, 400);
    }

    const where = entityId ? { entityId } : {};
    const total = await prisma.invoice.count({ where });
    const totalPages = Math.ceil(total / pageSize);
    const page = Math.min(requestedPage, Math.max(1, totalPages));
    const items = await prisma.invoice.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        invoiceNumber: true,
        createdAt: true,
        currencyCode: true,
        subTotal: true,
        taxAmount: true,
        totalAmount: true,
        documentCurrencyCode: true,
        documentSubTotal: true,
        documentTaxAmount: true,
        documentStampDuty: true,
        documentTotalAmount: true,
        functionalCurrencyCode: true,
        exchangeRate: true,
        exchangeRateDate: true,
        exchangeRateSource: true,
        exchangeRateImportedAt: true,
        dueDate: true,
        status: true,
        createdByUsername: true,
        approvedByUsername: true,
        approvedAt: true,
        issuedByUsername: true,
        issuedAt: true,
        postingJournalEntryId: true,
        salesOrderLink: {
          select: { salesOrder: { select: { orderNumber: true } } },
        },
        workflowEvents: {
          select: { action: true, actorUsername: true, note: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
        customer: { select: { name: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return {
      items,
      pagination: { page, pageSize, total, totalPages },
    };
  }

  static async listSalesOrders(entityId: string) {
    return prisma.salesOrder.findMany({
      where: { entityId },
      include: {
        customer: { select: { id: true, name: true } },
        lines: {
          include: { material: { select: { id: true, sku: true, name: true, unitCode: true } } },
          orderBy: { createdAt: 'asc' },
        },
        stockPickLink: {
          include: {
            stockPick: {
              include: {
                lines: {
                  include: {
                    material: { select: { id: true, sku: true, name: true, unitCode: true } },
                    warehouse: { select: { id: true, code: true, name: true } },
                  },
                  orderBy: { createdAt: 'asc' },
                },
                dispatch: { select: { id: true, confirmedAt: true, confirmedByUsername: true } },
              },
            },
          },
        },
        invoiceLink: {
          select: {
            invoice: { select: { id: true, invoiceNumber: true, status: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  static async createSalesOrder(
    data: unknown,
    entityId: string,
    actor: SalesWorkflowActor,
    client: Prisma.TransactionClient = prisma,
  ) {
    const input = validateSalesOrderInput(data);
    if (input.idempotencyKey) {
      const existing = await client.salesOrder.findUnique({
        where: { id: input.idempotencyKey },
        include: {
          customer: { select: { id: true, name: true } },
          lines: {
            include: { material: { select: { id: true, sku: true, name: true, unitCode: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (existing) {
        const canonicalize = (lines: Array<{ materialId: string; quantity: number; unitPrice: number }>) => (
          lines
            .map(({ materialId, quantity, unitPrice }) => ({ materialId, quantity, unitPrice }))
            .sort((left, right) => (
              left.materialId.localeCompare(right.materialId)
              || left.quantity - right.quantity
              || left.unitPrice - right.unitPrice
            ))
        );
        if (existing.entityId !== entityId
          || existing.customerId !== input.customerId
          || JSON.stringify(canonicalize(existing.lines)) !== JSON.stringify(canonicalize(input.lines))) {
          throw new SalesRequestError('Cette clé d’idempotence est déjà utilisée par une autre commande.', 409);
        }
        return existing;
      }
    }
    const [entity, customer, materials] = await Promise.all([
      client.entity.findUnique({
        where: { id: entityId },
        select: { country: { select: { currencyCode: true } } },
      }),
      client.customer.findFirst({
        where: { id: input.customerId, entityId },
        select: { id: true },
      }),
      client.material.findMany({
        where: { entityId, id: { in: [...new Set(input.lines.map(({ materialId }) => materialId))] } },
        select: { id: true, name: true, unitCode: true },
      }),
    ]);
    if (!entity) throw new SalesRequestError('Société introuvable.', 404);
    if (!customer) throw new SalesRequestError('Le client est introuvable pour cette société.', 404);
    if (materials.length !== new Set(input.lines.map(({ materialId }) => materialId)).size) {
      throw new SalesRequestError('Un article de la commande est introuvable pour cette société.', 404);
    }

    const materialById = new Map(materials.map((material) => [material.id, material]));
    let totalMillimes = 0;
    const lines = input.lines.map((line, index) => {
      const material = materialById.get(line.materialId);
      if (!material) throw new SalesRequestError(`Article introuvable à la ligne ${index + 1}.`, 404);
      let quantity: number;
      try {
        quantity = validateStockQuantity(
          line.quantity,
          `La quantité commandée à la ligne ${index + 1}`,
          { unitCode: material.unitCode },
        );
      } catch (error) {
        throw new SalesRequestError(error instanceof Error ? error.message : 'Quantité commandée invalide.', 400);
      }
      const lineMillimes = Math.round(line.unitPrice * 1000 * quantity);
      if (!Number.isSafeInteger(lineMillimes)) {
        throw new SalesRequestError('Le total de la commande dépasse la précision prise en charge.', 400);
      }
      totalMillimes += lineMillimes;
      if (!Number.isSafeInteger(totalMillimes)) {
        throw new SalesRequestError('Le total de la commande dépasse la précision prise en charge.', 400);
      }
      return {
        materialId: line.materialId,
        description: material.name,
        quantity,
        unitPrice: line.unitPrice,
        totalAmount: lineMillimes / 1000,
      };
    });
    const orderNumber = `CMD-${new Date().getUTCFullYear()}-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    return client.salesOrder.create({
      data: {
        ...(input.idempotencyKey ? { id: input.idempotencyKey } : {}),
        orderNumber,
        entityId,
        customerId: customer.id,
        currencyCode: entity.country.currencyCode,
        totalAmount: totalMillimes / 1000,
        status: 'OPEN',
        createdByUserId: actor.id,
        createdByUsername: actor.username,
        lines: { create: lines },
      },
      include: {
        customer: { select: { id: true, name: true } },
        lines: {
          include: { material: { select: { id: true, sku: true, name: true, unitCode: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  static async createSalesOrderStockPick(
    orderId: string,
    data: unknown,
    entityId: string,
    actor: SalesWorkflowActor,
  ) {
    const input = validateSalesOrderPickInput(data);
    const order = await prisma.salesOrder.findFirst({
      where: { id: orderId, entityId },
      include: {
        lines: { orderBy: { createdAt: 'asc' } },
        stockPickLink: { include: { stockPick: true } },
      },
    });
    if (!order) throw new SalesRequestError('Commande client introuvable pour cette société.', 404);
    if (order.status === 'CANCELLED') throw new SalesRequestError('Une commande annulée ne peut pas être préparée.', 409);
    if (order.stockPickLink) return order.stockPickLink.stockPick;
    if (order.status !== 'OPEN') throw new SalesRequestError('Seule une commande ouverte peut être préparée.', 409);

    const lineIds = new Set(order.lines.map(({ id }) => id));
    if (input.lines.length !== lineIds.size
      || input.lines.some(({ salesOrderLineId }) => !lineIds.has(salesOrderLineId))) {
      throw new SalesRequestError('La préparation doit associer exactement chaque ligne de la commande à un dépôt.', 400);
    }
    const lineById = new Map(order.lines.map((line) => [line.id, line]));
    const quantitiesByLocation = new Map<string, {
      materialId: string;
      warehouseId: string;
      quantityMilliUnits: number;
    }>();
    for (const selection of input.lines) {
      const line = lineById.get(selection.salesOrderLineId);
      if (!line) throw new SalesRequestError('Une ligne de commande est introuvable.', 404);
      const key = `${line.materialId}\0${selection.warehouseId}`;
      const existing = quantitiesByLocation.get(key);
      const lineMilliUnits = toStockQuantityMilliUnits(line.quantity);
      if (lineMilliUnits === null) {
        throw new SalesRequestError('Une quantité de commande ne respecte plus la précision de stock.', 409);
      }
      const total = (existing?.quantityMilliUnits ?? 0) + lineMilliUnits;
      if (!Number.isSafeInteger(total)) {
        throw new SalesRequestError('Le cumul préparé dépasse la précision de stock prise en charge.', 409);
      }
      quantitiesByLocation.set(key, {
        materialId: line.materialId,
        warehouseId: selection.warehouseId,
        quantityMilliUnits: total,
      });
    }
    let pick: Awaited<ReturnType<typeof MaterialsService.createStockPick>>;
    try {
      pick = await MaterialsService.createStockPick({
        reference: order.orderNumber,
        reason: `Préparation commande client ${order.orderNumber}`,
        idempotencyKey: `sales-order-pick-${order.id}`,
        lines: [...quantitiesByLocation.values()].map(({ quantityMilliUnits, ...line }) => ({
          ...line,
          quantity: quantityMilliUnits / 1000,
        })),
      }, entityId, actor);
    } catch (error) {
      if (error instanceof MaterialsRequestError) {
        const statusCode = error.statusCode === 403 || error.statusCode === 404
          || error.statusCode === 409 || error.statusCode === 422 ? error.statusCode : 400;
        throw new SalesRequestError(error.message, statusCode);
      }
      throw error;
    }

    try {
      return await prisma.$transaction(async (transaction) => {
        const existingLink = await transaction.salesOrderStockPickLink.findFirst({
          where: { salesOrderId: order.id, entityId },
          include: { stockPick: true },
        });
        if (existingLink) {
          if (existingLink.stockPickId !== pick.id) {
            throw new SalesRequestError('Une autre préparation est déjà associée à cette commande.', 409);
          }
          return existingLink.stockPick;
        }
        await transaction.salesOrderStockPickLink.create({
          data: { entityId, salesOrderId: order.id, stockPickId: pick.id },
        });
        const changed = await transaction.salesOrder.updateMany({
          where: { id: order.id, entityId, status: 'OPEN' },
          data: { status: 'PICKED' },
        });
        if (changed.count !== 1) {
          throw new SalesRequestError('La commande a changé pendant sa préparation; rechargez-la.', 409);
        }
        return pick;
      });
    } catch (error) {
      const current = await prisma.salesOrder.findFirst({
        where: { id: order.id, entityId },
        select: { status: true },
      });
      if (current?.status === 'CANCELLED') {
        await MaterialsService.cancelStockPick(pick.id, entityId, actor);
        throw new SalesRequestError('La commande a été annulée pendant sa préparation; la réservation a été libérée.', 409);
      }
      throw error;
    }
  }

  static async cancelSalesOrder(
    orderId: string,
    entityId: string,
    actor: SalesWorkflowActor,
  ) {
    const order = await prisma.salesOrder.findFirst({
      where: { id: orderId, entityId },
      select: {
        id: true,
        status: true,
        stockPickLink: {
          select: { stockPickId: true },
        },
      },
    });
    if (!order) throw new SalesRequestError('Commande client introuvable pour cette société.', 404);
    if (order.status === 'DISPATCHED') {
      throw new SalesRequestError('Une commande expédiée ne peut pas être annulée par ce workflow.', 409);
    }

    if (order.stockPickLink) {
      try {
        await MaterialsService.cancelStockPick(order.stockPickLink.stockPickId, entityId, actor);
      } catch (error) {
        if (error instanceof MaterialsRequestError) {
          const statusCode = error.statusCode === 403 || error.statusCode === 404
            || error.statusCode === 409 || error.statusCode === 422 ? error.statusCode : 400;
          throw new SalesRequestError(error.message, statusCode);
        }
        throw error;
      }
    } else {
      try {
        await MaterialsService.cancelStockPickByIdempotencyKey(
          `sales-order-pick-${order.id}`,
          entityId,
          actor,
        );
      } catch (error) {
        if (error instanceof MaterialsRequestError) {
          const statusCode = error.statusCode === 403 || error.statusCode === 404
            || error.statusCode === 409 || error.statusCode === 422 ? error.statusCode : 400;
          throw new SalesRequestError(error.message, statusCode);
        }
        throw error;
      }
    }

    const changed = await prisma.salesOrder.updateMany({
      where: { id: order.id, entityId, status: { in: ['OPEN', 'PICKED'] } },
      data: { status: 'CANCELLED' },
    });
    if (changed.count !== 1 && order.status !== 'CANCELLED') {
      const current = await prisma.salesOrder.findFirst({
        where: { id: order.id, entityId },
        select: { status: true },
      });
      if (current?.status !== 'CANCELLED') {
        throw new SalesRequestError('La commande a changé pendant son annulation; rechargez-la.', 409);
      }
    }
    return prisma.salesOrder.findFirst({ where: { id: order.id, entityId } });
  }

  static async dispatchSalesOrder(
    orderId: string,
    entityId: string,
    actor: SalesWorkflowActor,
  ) {
    const order = await prisma.salesOrder.findFirst({
      where: { id: orderId, entityId },
      select: {
        id: true,
        status: true,
        stockPickLink: { select: { stockPickId: true, stockPick: { select: { dispatch: { select: { id: true } } } } } },
      },
    });
    if (!order) throw new SalesRequestError('Commande client introuvable pour cette société.', 404);
    if (!order.stockPickLink) throw new SalesRequestError('Préparez la commande avant de confirmer son expédition.', 409);
    if (order.status !== 'PICKED' && order.status !== 'DISPATCHED') {
      throw new SalesRequestError('Seule une commande préparée peut être expédiée.', 409);
    }
    if (order.status === 'DISPATCHED' && !order.stockPickLink.stockPick.dispatch) {
      throw new SalesRequestError('Le statut expédié de la commande ne correspond pas à un dispatch de stock confirmé.', 409);
    }
    let dispatch: Awaited<ReturnType<typeof MaterialsService.confirmStockDispatch>>;
    try {
      dispatch = await MaterialsService.confirmStockDispatch(order.stockPickLink.stockPickId, {
        idempotencyKey: `sales-order-dispatch-${order.id}`,
      }, entityId, actor);
    } catch (error) {
      if (error instanceof MaterialsRequestError) {
        const statusCode = error.statusCode === 403 || error.statusCode === 404
          || error.statusCode === 409 || error.statusCode === 422 ? error.statusCode : 400;
        throw new SalesRequestError(error.message, statusCode);
      }
      throw error;
    }
    const updated = await prisma.salesOrder.updateMany({
      where: { id: order.id, entityId, status: 'PICKED' },
      data: { status: 'DISPATCHED' },
    });
    if (updated.count !== 1 && order.status !== 'DISPATCHED') {
      const current = await prisma.salesOrder.findFirst({
        where: { id: order.id, entityId },
        select: { status: true },
      });
      if (current?.status !== 'DISPATCHED') {
        throw new SalesRequestError('La commande a changé pendant sa confirmation d’expédition; rechargez-la.', 409);
      }
    }
    return dispatch;
  }

  static async convertSalesOrderToInvoice(
    orderId: string,
    data: unknown,
    entityId: string,
    actor: SalesWorkflowActor,
  ) {
    const order = await prisma.salesOrder.findFirst({
      where: { id: orderId, entityId },
      include: {
        lines: { orderBy: { createdAt: 'asc' } },
        stockPickLink: {
          select: { stockPick: { select: { dispatch: { select: { id: true } } } } },
        },
        invoiceLink: {
          select: {
            invoice: {
              include: { items: true, customer: true, workflowEvents: true },
            },
          },
        },
      },
    });
    if (!order) throw new SalesRequestError('Commande client introuvable pour cette société.', 404);
    if (order.invoiceLink) return { invoice: order.invoiceLink.invoice, created: false };
    if (order.status !== 'DISPATCHED' || !order.stockPickLink?.stockPick.dispatch) {
      throw new SalesRequestError('Seule une commande dont l’expédition de stock est confirmée peut être facturée.', 409);
    }
    if (!order.currencyCode.trim()) {
      throw new SalesRequestError('La devise de la commande est absente; vérifiez la commande avant sa facturation.', 422);
    }

    const input = validateSalesOrderInvoiceInput(data);
    const lineById = new Map(order.lines.map((line) => [line.id, line]));
    if (input.lines.length !== lineById.size
      || input.lines.some(({ salesOrderLineId }) => !lineById.has(salesOrderLineId))) {
      throw new SalesRequestError('La facture doit reprendre exactement toutes les lignes de la commande.', 400);
    }
    const taxRateByLineId = new Map(input.lines.map(({ salesOrderLineId, taxRate }) => [salesOrderLineId, taxRate]));
    const items = order.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: taxRateByLineId.get(line.id) as number,
      materialId: line.materialId,
    }));

    try {
      return await prisma.$transaction(async (transaction) => {
        const existing = await transaction.salesOrderInvoiceLink.findUnique({
          where: { salesOrderId_entityId: { salesOrderId: order.id, entityId } },
          include: { invoice: { include: { items: true, customer: true, workflowEvents: true } } },
        });
        if (existing) return { invoice: existing.invoice, created: false };

        const currentOrder = await transaction.salesOrder.findFirst({
          where: { id: order.id, entityId, status: 'DISPATCHED' },
          select: {
            stockPickLink: {
              select: {
                stockPick: {
                  select: { dispatch: { select: { id: true } } },
                },
              },
            },
          },
        });
        if (!currentOrder?.stockPickLink?.stockPick.dispatch) {
          throw new SalesRequestError('La commande n’a plus d’expédition de stock confirmée; rechargez-la.', 409);
        }

        const invoice = await this.createInvoice({
          customerId: order.customerId,
          entityId,
          documentCurrencyCode: order.currencyCode,
          items,
        }, actor, transaction);
        assertSameAmount(invoice.documentSubTotal ?? invoice.subTotal, order.totalAmount, 'HT de la commande');

        await transaction.salesOrderInvoiceLink.create({
          data: {
            entityId,
            salesOrderId: order.id,
            invoiceId: invoice.id,
            createdByUserId: actor.id,
            createdByUsername: actor.username,
          },
        });
        await transaction.salesInvoiceWorkflowEvent.create({
          data: {
            invoiceId: invoice.id,
            action: 'CREATED_FROM_ORDER',
            actorUserId: actor.id,
            actorUsername: actor.username,
            note: `Facture brouillon créée à partir de la commande ${order.orderNumber}.`,
          },
        });
        return { invoice, created: true };
      });
    } catch (error) {
      if (!isSalesUniqueConstraintViolation(error)) throw error;
      const existing = await prisma.salesOrderInvoiceLink.findUnique({
        where: { salesOrderId_entityId: { salesOrderId: order.id, entityId } },
        include: { invoice: { include: { items: true, customer: true, workflowEvents: true } } },
      });
      if (!existing) throw error;
      return { invoice: existing.invoice, created: false };
    }
  }

  static async listQuotes(entityId: string) {
    return prisma.salesQuote.findMany({
      where: { entityId, status: { in: ['DRAFT', 'CONVERTED', 'ORDERED'] } },
      select: {
        id: true,
        quoteNumber: true,
        customerId: true,
        currencyCode: true,
        subTotal: true,
        taxAmount: true,
        totalAmount: true,
        status: true,
        createdByUsername: true,
        createdAt: true,
        customer: { select: { name: true } },
        items: {
          select: {
            position: true,
            description: true,
            quantity: true,
            unitPrice: true,
            taxRate: true,
            totalAmount: true,
          },
          orderBy: { position: 'asc' },
        },
        conversion: {
          select: {
            acceptanceNote: true,
            invoice: { select: { id: true, invoiceNumber: true, status: true } },
          },
        },
        orderConversion: {
          select: {
            acceptanceNote: true,
            salesOrder: { select: { id: true, orderNumber: true, status: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async createQuote(data: unknown, actor: SalesWorkflowActor) {
    const quote = await validateQuoteDraft(data);
    const quoteNumber = `DEV-${new Date().getUTCFullYear()}-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    return prisma.$transaction((transaction) => transaction.salesQuote.create({
      data: {
        quoteNumber,
        entityId: quote.entityId,
        customerId: quote.customerId,
        currencyCode: quote.currencyCode,
        subTotal: quote.subTotal,
        taxAmount: quote.taxAmount,
        totalAmount: quote.totalAmount,
        status: 'DRAFT',
        createdByUserId: actor.id,
        createdByUsername: actor.username,
        items: {
          create: quote.items.map((item, position) => ({ ...item, position })),
        },
      },
      include: {
        customer: { select: { name: true } },
        items: { orderBy: { position: 'asc' } },
      },
    }));
  }

  static async updateQuote(quoteId: string, data: unknown, entityId: string) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new SalesRequestError('Données de devis invalides.', 400);
    }
    return prisma.$transaction(async (transaction) => {
      const quote = await validateQuoteDraft({ ...(data as Record<string, unknown>), entityId }, transaction);
      const existing = await transaction.salesQuote.findFirst({
        where: { id: quoteId, entityId, status: 'DRAFT' },
        select: { id: true },
      });
      if (!existing) {
        const found = await transaction.salesQuote.findFirst({
          where: { id: quoteId, entityId },
          select: { status: true },
        });
        if (!found) throw new SalesRequestError('Devis introuvable pour cette société.', 404);
        throw new SalesRequestError('Seul un devis brouillon peut être modifié.', 409);
      }

      const updated = await transaction.salesQuote.updateMany({
        where: { id: quoteId, entityId, status: 'DRAFT' },
        data: {
          customerId: quote.customerId,
          currencyCode: quote.currencyCode,
          subTotal: quote.subTotal,
          taxAmount: quote.taxAmount,
          totalAmount: quote.totalAmount,
        },
      });
      if (updated.count !== 1) throw new SalesRequestError('Le devis a changé; rechargez la liste avant de le modifier.', 409);
      await transaction.salesQuoteItem.deleteMany({ where: { quoteId } });
      await transaction.salesQuoteItem.createMany({
        data: quote.items.map((item, position) => ({ ...item, position, quoteId })),
      });
      return transaction.salesQuote.findFirst({
        where: { id: quoteId, entityId },
        include: {
          customer: { select: { name: true } },
          items: { orderBy: { position: 'asc' } },
        },
      });
    });
  }

  static async convertQuoteToInvoice(
    quoteId: string,
    data: unknown,
    entityId: string,
    actor: SalesWorkflowActor,
  ) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new SalesRequestError('Les informations de conversion du devis sont invalides.', 400);
    }

    const input = data as Record<string, unknown>;
    if (input.acceptanceConfirmed !== true) {
      throw new SalesRequestError('Confirmez l’acceptation documentée du devis par le client.', 422);
    }
    const acceptanceNote = input.acceptanceNote;
    if (typeof acceptanceNote !== 'string'
      || acceptanceNote.trim().length < 3
      || acceptanceNote.trim().length > 500) {
      throw new SalesRequestError('La référence ou note d’acceptation (3 à 500 caractères) est obligatoire.', 400);
    }

    return prisma.$transaction(async (transaction) => {
      const quote = await transaction.salesQuote.findFirst({
        where: { id: quoteId, entityId },
        include: {
          items: { orderBy: { position: 'asc' } },
          conversion: { include: { invoice: true } },
        },
      });
      if (!quote) throw new SalesRequestError('Devis introuvable pour cette société.', 404);
      if (quote.status === 'CONVERTED' && quote.conversion) return quote.conversion.invoice;
      if (quote.status !== 'DRAFT' || quote.conversion) {
        throw new SalesRequestError('Seul un devis brouillon non converti peut être transformé.', 409);
      }

      const invoice = await this.createInvoice({
        entityId,
        customerId: quote.customerId,
        documentCurrencyCode: quote.currencyCode,
        dueDate: input.dueDate,
        items: quote.items.map(({ description, quantity, unitPrice, taxRate }) => ({
          description,
          quantity,
          unitPrice,
          taxRate,
        })),
      }, actor, transaction);
      const changed = await transaction.salesQuote.updateMany({
        where: { id: quoteId, entityId, status: 'DRAFT' },
        data: { status: 'CONVERTED' },
      });
      if (changed.count !== 1) {
        throw new SalesRequestError('Le devis a changé pendant sa conversion; rechargez la liste.', 409);
      }
      await transaction.salesQuoteConversion.create({
        data: {
          quoteId,
          invoiceId: invoice.id,
          entityId,
          convertedByUserId: actor.id,
          convertedByUsername: actor.username,
          acceptanceNote: acceptanceNote.trim(),
        },
      });
      return invoice;
    });
  }

  static async convertQuoteToOrder(
    quoteId: string,
    data: unknown,
    entityId: string,
    actor: SalesWorkflowActor,
  ) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new SalesRequestError('Les informations de conversion du devis sont invalides.', 400);
    }
    const input = data as Record<string, unknown>;
    if (input.acceptanceConfirmed !== true) {
      throw new SalesRequestError('Confirmez l’acceptation documentée du devis par le client.', 422);
    }
    const acceptanceNote = input.acceptanceNote;
    if (typeof acceptanceNote !== 'string'
      || acceptanceNote.trim().length < 3
      || acceptanceNote.trim().length > 500) {
      throw new SalesRequestError('La référence ou note d’acceptation (3 à 500 caractères) est obligatoire.', 400);
    }
    if (!Array.isArray(input.itemMappings)) {
      throw new SalesRequestError('Associez chaque ligne du devis à un article du catalogue.', 400);
    }
    const mappings = new Map<number, string>();
    for (const rawMapping of input.itemMappings) {
      if (!rawMapping || typeof rawMapping !== 'object' || Array.isArray(rawMapping)) {
        throw new SalesRequestError('Une association d’article est invalide.', 400);
      }
      const mapping = rawMapping as Record<string, unknown>;
      if (!Number.isSafeInteger(mapping.position) || (mapping.position as number) < 0
        || typeof mapping.materialId !== 'string' || !mapping.materialId.trim()) {
        throw new SalesRequestError('Chaque association doit fournir la ligne du devis et un article valide.', 400);
      }
      const position = mapping.position as number;
      if (mappings.has(position)) {
        throw new SalesRequestError('Chaque ligne du devis ne peut être associée qu’une seule fois.', 400);
      }
      mappings.set(position, mapping.materialId.trim());
    }

    return prisma.$transaction(async (transaction) => {
      const quote = await transaction.salesQuote.findFirst({
        where: { id: quoteId, entityId },
        include: {
          items: { orderBy: { position: 'asc' } },
          orderConversion: { include: { salesOrder: true } },
          conversion: true,
        },
      });
      if (!quote) throw new SalesRequestError('Devis introuvable pour cette société.', 404);
      if (quote.status === 'ORDERED' && quote.orderConversion) return quote.orderConversion.salesOrder;
      if (quote.status !== 'DRAFT' || quote.orderConversion || quote.conversion) {
        throw new SalesRequestError('Seul un devis brouillon non converti peut devenir une commande.', 409);
      }
      if (mappings.size !== quote.items.length
        || quote.items.some((item) => !mappings.has(item.position))
        || [...mappings.keys()].some((position) => !quote.items.some((item) => item.position === position))) {
        throw new SalesRequestError('Associez exactement chaque ligne du devis à un article du catalogue.', 400);
      }

      const salesOrder = await this.createSalesOrder({
        customerId: quote.customerId,
        lines: quote.items.map((item) => ({
          materialId: mappings.get(item.position),
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      }, entityId, actor, transaction);
      const changed = await transaction.salesQuote.updateMany({
        where: { id: quoteId, entityId, status: 'DRAFT' },
        data: { status: 'ORDERED' },
      });
      if (changed.count !== 1) {
        throw new SalesRequestError('Le devis a changé pendant sa conversion; rechargez la liste.', 409);
      }
      await transaction.salesQuoteOrderConversion.create({
        data: {
          quoteId,
          salesOrderId: salesOrder.id,
          entityId,
          convertedByUserId: actor.id,
          convertedByUsername: actor.username,
          acceptanceNote: acceptanceNote.trim(),
        },
      });
      return salesOrder;
    });
  }

  /** Crée une facture à contrôler sans l'émettre ni créer de journal. */
  static async createInvoice(data: {
    customerId: string;
    entityId: string;
    items: Array<{ description: string; quantity: number; unitPrice: number; taxRate: number; materialId?: string | null }>;
    issueDate?: unknown;
    dueDate?: unknown;
    documentCurrencyCode?: unknown;
    exchangeRate?: unknown;
    exchangeRateDate?: unknown;
    exchangeRateSource?: unknown;
    exchangeRateImportedAt?: unknown;
  }, actor: SalesWorkflowActor, transaction?: Prisma.TransactionClient) {
    if (!data
      || typeof data.customerId !== 'string' || !data.customerId.trim()
      || typeof data.entityId !== 'string' || !data.entityId.trim()) {
      throw new SalesRequestError('Le client et la société sont obligatoires', 400);
    }

    const client = transaction ?? prisma;
    const entity = await client.entity.findUnique({
      where: { id: data.entityId },
      include: { country: true },
    });

    if (!entity) throw new SalesRequestError('Société introuvable', 404);
    const customer = await client.customer.findFirst({
      where: { id: data.customerId, entityId: data.entityId },
      select: { name: true },
    });
    if (!customer) throw new SalesRequestError('Le client est introuvable pour cette société', 404);

    const issueDate = data.issueDate === undefined ? new Date().toISOString().slice(0, 10) : data.issueDate;
    if (typeof issueDate !== 'string') {
      throw new SalesRequestError('La date d’émission doit être une chaîne AAAA-MM-JJ.', 400);
    }
    let dueDate: Date | null = null;
    if (data.dueDate !== undefined && data.dueDate !== null && data.dueDate !== '') {
      if (typeof data.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.dueDate)) {
        throw new SalesRequestError('La date d’échéance doit être une date calendaire AAAA-MM-JJ.', 400);
      }
      const parsedDueDate = new Date(`${data.dueDate}T00:00:00.000Z`);
      if (!Number.isFinite(parsedDueDate.getTime()) || parsedDueDate.toISOString().slice(0, 10) !== data.dueDate) {
        throw new SalesRequestError('La date d’échéance doit être une date calendaire valide.', 400);
      }
      if (data.dueDate < issueDate) {
        throw new SalesRequestError('La date d’échéance ne peut pas précéder la date d’émission.', 400);
      }
      dueDate = parsedDueDate;
    }
    const snapshot = normalizeInvoiceFxSnapshot(data, entity.country.currencyCode, issueDate);
    const documentCalculation = calculateInvoice(data.items, entity.country.stampDuty);
    const materialIds = data.items.flatMap(({ materialId }) => {
      if (materialId === undefined || materialId === null) return [];
      if (typeof materialId !== 'string' || !materialId.trim()) {
        throw new SalesRequestError('Un article lié à une ligne de facture est invalide.', 400);
      }
      return [materialId.trim()];
    });
    if (materialIds.length > 0) {
      const materials = await client.material.findMany({
        where: { entityId: data.entityId, id: { in: [...new Set(materialIds)] } },
        select: { id: true },
      });
      if (materials.length !== new Set(materialIds).size) {
        throw new SalesRequestError('Un article de facture est introuvable pour cette société.', 404);
      }
    }
    const functionalCalculation = convertInvoiceComponents({
      subTotal: documentCalculation.subTotal,
      taxAmount: documentCalculation.taxAmount,
      otherAmount: documentCalculation.stampDuty,
    }, snapshot.exchangeRate);
    const mapping = {
      receivableAccountCode: entity.country.salesReceivableAccountCode,
      revenueAccountCode: entity.country.salesRevenueAccountCode,
      vatAccountCode: entity.country.salesVatAccountCode,
      stampDutyAccountCode: entity.country.salesStampDutyAccountCode,
    };
    const mappedAccountCodes = Object.values(mapping).filter((code): code is string => typeof code === 'string');
    const [configuredTaxRates, accounts] = await Promise.all([
      client.taxRate.findMany({
        where: { countryId: entity.countryId },
        select: { rate: true },
      }),
      client.chartOfAccount.findMany({
        where: { countryId: entity.countryId, code: { in: mappedAccountCodes } },
        select: { code: true, type: true },
      }),
    ]);
    const salesAccounts = assertSalesPostingConfiguration(
      entity.country.code,
      entity.country.stampDuty,
      configuredTaxRates.map(({ rate }) => rate),
      accounts,
      mapping,
    );
    assertConfiguredTaxRates(documentCalculation.items, configuredTaxRates.map(({ rate }) => rate));
    const issuedAt = new Date(`${issueDate}T00:00:00.000Z`);
    const invoiceNumber = `FAC-${issuedAt.getUTCFullYear()}-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const createInvoiceRecord = (clientWithInvoice: Pick<Prisma.TransactionClient, 'invoice'>) => (
      clientWithInvoice.invoice.create({
        data: {
          invoiceNumber,
          entityId: data.entityId,
          customerId: data.customerId,
          currencyCode: snapshot.functionalCurrencyCode,
          vatAccountCode: salesAccounts.vatAccountCode,
          subTotal: functionalCalculation.subTotal,
          taxAmount: functionalCalculation.taxAmount,
          stampDuty: functionalCalculation.otherAmount,
          totalAmount: functionalCalculation.totalAmount,
          documentCurrencyCode: snapshot.documentCurrencyCode,
          documentSubTotal: documentCalculation.subTotal,
          documentTaxAmount: documentCalculation.taxAmount,
          documentStampDuty: documentCalculation.stampDuty,
          documentTotalAmount: documentCalculation.totalAmount,
          functionalCurrencyCode: snapshot.functionalCurrencyCode,
          exchangeRate: snapshot.exchangeRate,
          exchangeRateDate: new Date(`${snapshot.exchangeRateDate}T00:00:00.000Z`),
          exchangeRateSource: snapshot.exchangeRateSource,
          exchangeRateImportedAt: snapshot.exchangeRateImportedAt
            ? new Date(snapshot.exchangeRateImportedAt)
            : null,
          dueDate,
          status: 'TO_REVIEW',
          createdByUserId: actor.id,
          createdByUsername: actor.username,
          createdAt: issuedAt,
          items: {
            create: documentCalculation.items.map((item, index) => ({
              ...item,
              materialId: data.items[index].materialId?.trim() || null,
            })),
          },
        },
        include: { items: true, customer: true, workflowEvents: true },
      })
    );
    return transaction ? createInvoiceRecord(transaction) : prisma.$transaction(createInvoiceRecord);
  }

  private static async getInvoiceForWorkflow(
    invoiceId: string,
    entityId: string,
    client: Pick<Prisma.TransactionClient, 'invoice' | 'chartOfAccount'> = prisma,
  ) {
    const invoice = await client.invoice.findFirst({
      where: { id: invoiceId, entityId },
      include: {
        items: true,
        customer: { select: { name: true } },
        entity: {
          select: {
            countryId: true,
            country: {
              select: {
                code: true,
                currencyCode: true,
                stampDuty: true,
                salesReceivableAccountCode: true,
                salesRevenueAccountCode: true,
                salesVatAccountCode: true,
                salesStampDutyAccountCode: true,
                taxRates: { select: { rate: true } },
              },
            },
          },
        },
      },
    });
    if (!invoice) throw new SalesRequestError('Facture introuvable pour cette société.', 404);
    const mapping = {
      receivableAccountCode: invoice.entity.country.salesReceivableAccountCode,
      revenueAccountCode: invoice.entity.country.salesRevenueAccountCode,
      vatAccountCode: invoice.entity.country.salesVatAccountCode,
      stampDutyAccountCode: invoice.entity.country.salesStampDutyAccountCode,
    };
    const codes = Object.values(mapping).filter((code): code is string => Boolean(code));
    const accounts = await client.chartOfAccount.findMany({
      where: { countryId: invoice.entity.countryId, code: { in: codes } },
      select: { code: true, type: true, isPostingAllowed: true },
    });
    const salesAccounts = assertSalesPostingConfiguration(
      invoice.entity.country.code,
      invoice.entity.country.stampDuty,
      invoice.entity.country.taxRates.map(({ rate }) => rate),
      accounts,
      mapping,
    );
    if (accounts.some((account) => !account.isPostingAllowed)) {
      throw new SalesRequestError('Un compte de vente configuré est interdit à la comptabilisation.', 422);
    }

    const issueDate = invoice.createdAt.toISOString().slice(0, 10);
    const snapshot = normalizeInvoiceFxSnapshot({
      documentCurrencyCode: invoice.documentCurrencyCode ?? invoice.currencyCode,
      exchangeRate: invoice.exchangeRate ?? undefined,
      exchangeRateDate: invoice.exchangeRateDate?.toISOString().slice(0, 10),
      exchangeRateSource: invoice.exchangeRateSource ?? undefined,
      exchangeRateImportedAt: invoice.exchangeRateImportedAt?.toISOString(),
    }, invoice.entity.country.currencyCode, issueDate);
    const calculated = calculateInvoice(invoice.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxRate: item.taxRate,
    })), invoice.entity.country.stampDuty);
    assertSameAmount(invoice.documentSubTotal ?? invoice.subTotal, calculated.subTotal, 'HT document');
    assertSameAmount(invoice.documentTaxAmount ?? invoice.taxAmount, calculated.taxAmount, 'TVA document');
    assertSameAmount(invoice.documentStampDuty ?? invoice.stampDuty, calculated.stampDuty, 'timbre document');
    assertSameAmount(invoice.documentTotalAmount ?? invoice.totalAmount, calculated.totalAmount, 'TTC document');
    assertConfiguredTaxRates(calculated.items, invoice.entity.country.taxRates.map(({ rate }) => rate));
    const functional = convertInvoiceComponents({
      subTotal: calculated.subTotal,
      taxAmount: calculated.taxAmount,
      otherAmount: calculated.stampDuty,
    }, snapshot.exchangeRate);
    assertSameAmount(invoice.subTotal, functional.subTotal, 'HT fonctionnel');
    assertSameAmount(invoice.taxAmount, functional.taxAmount, 'TVA fonctionnelle');
    assertSameAmount(invoice.stampDuty, functional.otherAmount, 'timbre fonctionnel');
    assertSameAmount(invoice.totalAmount, functional.totalAmount, 'TTC fonctionnel');

    const lines = [
      { accountCode: salesAccounts.receivableAccountCode, debit: functional.totalAmount, credit: 0, description: 'Créance client TTC' },
      { accountCode: salesAccounts.revenueAccountCode, debit: 0, credit: functional.subTotal, description: 'Chiffre d’affaires HT' },
      { accountCode: salesAccounts.vatAccountCode, debit: 0, credit: functional.taxAmount, description: 'TVA collectée' },
      { accountCode: salesAccounts.stampDutyAccountCode, debit: 0, credit: functional.otherAmount, description: 'Droit de timbre fiscal' },
    ].filter((line) => line.debit > 0 || line.credit > 0);
    return {
      invoice,
      journalEntry: validateJournalEntry({
        entryNumber: `JE-${invoice.invoiceNumber}`,
        entityId,
        date: issueDate,
        reference: invoice.invoiceNumber,
        description: `Facture vente client ${invoice.customer.name}`,
        lines,
      }),
    };
  }

  static async approveInvoice(invoiceId: string, entityId: string, actor: SalesWorkflowActor, noteValue: unknown) {
    const note = requireWorkflowNote(noteValue);
    return prisma.$transaction(async (tx) => {
      const current = await tx.invoice.findFirst({
        where: { id: invoiceId, entityId },
        select: { id: true, status: true, createdByUserId: true },
      });
      if (!current) throw new SalesRequestError('Facture introuvable pour cette société.', 404);
      if (!current.createdByUserId || current.createdByUserId === actor.id) {
        throw new SalesRequestError('La facture doit être contrôlée par une personne différente de son auteur.', 422);
      }
      if (current.status !== 'TO_REVIEW') throw new SalesRequestError('Seule une facture à contrôler peut être validée.', 409);
      await this.getInvoiceForWorkflow(invoiceId, entityId, tx);
      const changed = await tx.invoice.updateMany({
        where: { id: invoiceId, entityId, status: 'TO_REVIEW' },
        data: {
          status: 'APPROVED',
          approvedByUserId: actor.id,
          approvedByUsername: actor.username,
          approvedAt: new Date(),
        },
      });
      if (changed.count !== 1) throw new SalesRequestError('La facture a changé pendant le contrôle; rechargez-la.', 409);
      await tx.salesInvoiceWorkflowEvent.create({
        data: { invoiceId, action: 'APPROVED', actorUserId: actor.id, actorUsername: actor.username, note },
      });
      return tx.invoice.findUnique({ where: { id: invoiceId }, include: { workflowEvents: true } });
    });
  }

  static async rejectInvoice(invoiceId: string, entityId: string, actor: SalesWorkflowActor, noteValue: unknown) {
    const note = requireWorkflowNote(noteValue);
    return prisma.$transaction(async (tx) => {
      const current = await tx.invoice.findFirst({
        where: { id: invoiceId, entityId },
        select: { id: true, status: true, createdByUserId: true },
      });
      if (!current) throw new SalesRequestError('Facture introuvable pour cette société.', 404);
      if (!current.createdByUserId || current.createdByUserId === actor.id) {
        throw new SalesRequestError('La facture doit être contrôlée par une personne différente de son auteur.', 422);
      }
      if (current.status !== 'TO_REVIEW') throw new SalesRequestError('Seule une facture à contrôler peut être rejetée.', 409);
      const changed = await tx.invoice.updateMany({
        where: { id: invoiceId, entityId, status: 'TO_REVIEW' },
        data: { status: 'REJECTED' },
      });
      if (changed.count !== 1) throw new SalesRequestError('La facture a changé pendant le contrôle; rechargez-la.', 409);
      await tx.salesInvoiceWorkflowEvent.create({
        data: { invoiceId, action: 'REJECTED', actorUserId: actor.id, actorUsername: actor.username, note },
      });
      return tx.invoice.findUnique({ where: { id: invoiceId }, include: { workflowEvents: true } });
    });
  }

  static async issueInvoice(invoiceId: string, entityId: string, actor: SalesWorkflowActor, noteValue: unknown) {
    const note = requireWorkflowNote(noteValue);
    return prisma.$transaction(async (tx) => {
      const current = await tx.invoice.findFirst({
        where: { id: invoiceId, entityId },
        select: { id: true, status: true, postingJournalEntryId: true, approvedByUserId: true, createdAt: true },
      });
      if (!current) throw new SalesRequestError('Facture introuvable pour cette société.', 404);
      if (current.status === 'ISSUED' && current.postingJournalEntryId) {
        const journal = await tx.journalEntry.findUnique({
          where: { id: current.postingJournalEntryId },
          include: { lines: true },
        });
        if (!journal) throw new SalesRequestError('Le journal lié à cette facture est introuvable.', 409);
        return journal;
      }
      if (current.status !== 'APPROVED' || !current.approvedByUserId) {
        throw new SalesRequestError('La facture doit être approuvée avant émission.', 409);
      }
      if (current.approvedByUserId === actor.id) {
        throw new SalesRequestError('La personne qui a approuvé ne peut pas émettre cette facture.', 422);
      }
      const { invoice, journalEntry } = await this.getInvoiceForWorkflow(invoiceId, entityId, tx);
      await assertAccountingPeriodOpen(
        tx,
        entityId,
        invoice.createdAt,
        (message) => new SalesRequestError(message, 409),
      );
      let postingLines = journalEntry.lines;
      try {
        postingLines = await applyAnalyticalAllocationRules(tx, entityId, invoice.entity.country.code, 'SALE', `${invoice.invoiceNumber} ${invoice.items.map((item) => item.description).join(' ')}`, postingLines);
      } catch (error) {
        if (error instanceof AnalyticalAllocationError) throw new SalesRequestError(error.message, 422);
        throw error;
      }
      const journal = await tx.journalEntry.create({
        data: {
          ...journalEntry,
          date: invoice.createdAt,
          status: 'POSTED',
          lines: { create: postingLines },
        },
        include: { lines: true },
      });
      await appendJournalEntryAuditRecord(tx, journal.id);
      const changed = await tx.invoice.updateMany({
        where: { id: invoiceId, entityId, status: 'APPROVED', postingJournalEntryId: null },
        data: {
          status: 'ISSUED',
          issuedByUserId: actor.id,
          issuedByUsername: actor.username,
          issuedAt: new Date(),
          postingJournalEntryId: journal.id,
        },
      });
      if (changed.count !== 1) throw new SalesRequestError('La facture a changé pendant son émission; rechargez-la.', 409);
      await tx.salesInvoiceWorkflowEvent.create({
        data: { invoiceId, action: 'ISSUED', actorUserId: actor.id, actorUsername: actor.username, note },
      });
      return journal;
    });
  }

  static async cancelInvoice(
    invoiceId: string,
    entityId: string,
    actor: SalesWorkflowActor,
    noteValue: unknown,
    reversalDateValue?: unknown,
  ) {
    const note = requireWorkflowNote(noteValue);
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, entityId },
      select: { id: true, status: true, postingJournalEntryId: true },
    });
    if (!invoice) throw new SalesRequestError('Facture introuvable pour cette société.', 404);
    if (!invoice.postingJournalEntryId
      || !['ISSUED', 'CANCELLATION_PENDING', 'CANCELLED'].includes(invoice.status)) {
      throw new SalesRequestError('Seule une facture émise peut être annulée; les factures non émises restent dans leur workflow de contrôle.', 409);
    }

    return FinanceService.createJournalReversal(
      invoice.postingJournalEntryId,
      entityId,
      actor,
      note,
      reversalDateValue,
      async (tx, reversal) => {
        const current = await tx.invoice.findFirst({
          where: { id: invoice.id, entityId, postingJournalEntryId: invoice.postingJournalEntryId },
          select: { id: true, status: true, createdByUserId: true, approvedByUserId: true, issuedByUserId: true },
        });
        if (!current) throw new SalesRequestError('La facture émise est introuvable pour cette société.', 404);
        if (current.status === 'CANCELLED') {
          if (reversal.status !== 'POSTED') {
            throw new SalesRequestError('Le statut d’annulation ne correspond pas à la contrepassation liée.', 409);
          }
          return;
        }
        if (current.status === 'CANCELLATION_PENDING') {
          if (reversal.status === 'REJECTED') {
            throw new SalesRequestError('La contrepassation liée a été rejetée; une nouvelle revue est nécessaire.', 409);
          }
          if (reversal.status === 'POSTED') {
            const changed = await tx.invoice.updateMany({
              where: { id: current.id, entityId, status: 'CANCELLATION_PENDING' },
              data: { status: 'CANCELLED' },
            });
            if (changed.count !== 1) throw new SalesRequestError('La facture a changé pendant la clôture de son annulation.', 409);
            await tx.salesInvoiceWorkflowEvent.create({
              data: {
                invoiceId: current.id,
                action: 'CANCELLED',
                actorUserId: actor.id,
                actorUsername: actor.username,
                note: `Contrepassation déjà comptabilisée: ${note}`,
              },
            });
          }
          return;
        }
        if (current.status !== 'ISSUED') {
          throw new SalesRequestError('Seule une facture émise sans règlement peut être annulée.', 409);
        }
        if (!current.createdByUserId || current.createdByUserId === actor.id
          || current.approvedByUserId === actor.id || current.issuedByUserId === actor.id) {
          throw new SalesRequestError('La demande d’annulation doit être préparée par une personne distincte de l’auteur, du contrôleur et de l’émetteur de la facture.', 422);
        }
        const [paymentCount, revaluationCount] = await Promise.all([
          tx.cashflowPayment.count({ where: { entityId, invoiceId: current.id } }),
          tx.fxRevaluationItem.count({ where: { invoiceId: current.id } }),
        ]);
        if (paymentCount > 0 || revaluationCount > 0) {
          throw new SalesRequestError('La facture comporte des règlements ou une réévaluation de change; traitez ces opérations avant de demander son annulation.', 409);
        }
        if (reversal.status === 'REJECTED') {
          throw new SalesRequestError('La contrepassation liée a été rejetée; une nouvelle revue est nécessaire.', 409);
        }
        const cancelled = reversal.status === 'POSTED';
        const changed = await tx.invoice.updateMany({
          where: { id: current.id, entityId, status: 'ISSUED' },
          data: { status: cancelled ? 'CANCELLED' : 'CANCELLATION_PENDING' },
        });
        if (changed.count !== 1) throw new SalesRequestError('La facture a changé pendant la demande d’annulation; rechargez-la.', 409);
        await tx.salesInvoiceWorkflowEvent.create({
          data: {
            invoiceId: current.id,
            action: cancelled ? 'CANCELLED' : 'CANCELLATION_REQUESTED',
            actorUserId: actor.id,
            actorUsername: actor.username,
            note: cancelled ? `Contrepassation déjà comptabilisée: ${note}` : note,
          },
        });
      },
    );
  }
}

export default SalesService;
