import prisma from '../../../data/prisma/client';
import { MaterialsRequestError } from './errors';
import {
  buildStockJournalEntryData,
  getStockPostingConfigurationIssues,
  stockInventoryValueMillimes,
  stockValueMillimes,
} from './stock-accounting';
import {
  buildStockAdjustmentWhere,
  validateMaterialInput,
  validateMinimumStock,
  validateStockAdjustmentReason,
  validateStockDelta,
} from './validation';
import { assertAccountingPeriodOpen } from '../finance/posting-period';
import { validateVendorInput } from './vendor-validation';
import {
  matchesStockTransfer,
  matchesStockReceipt,
  matchesStockSupplierReturn,
  matchesStockPick,
  validateStockTransferInput,
  validateStockReceiptInput,
  validateStockSupplierReturnInput,
  validateStockPickInput,
  validateStockDispatchInput,
  validateWarehouseInput,
} from './warehouse-validation';
import { reconcileInvoiceLineReceipt } from './invoice-line-reconciliation';
import { validateStockQuantity, toStockQuantityMilliUnits } from './quantity';
import { calculatePurchaseInvoiceAmounts } from '../purchases/invoice';
import { convertInvoiceComponents } from '../fx/conversion';
import { appendJournalEntryAuditRecord } from '../finance/audit-chain';
import {
  consumeAvailableMaterialStock,
  consumeAvailableWarehouseStock,
  consumeReservedMaterialStock,
  consumeReservedWarehouseStock,
  releaseMaterialReservation,
  releaseWarehouseReservation,
  reserveMaterialStock,
  reserveWarehouseStock,
} from './stock-reservations';

export interface StockAdjustmentActor {
  id: string;
  username: string;
}

function assertStockActor(actor: StockAdjustmentActor): void {
  if (!actor || typeof actor.id !== 'string' || !actor.id.trim()
    || typeof actor.username !== 'string' || !actor.username.trim()) {
    throw new MaterialsRequestError('Un utilisateur authentifié est requis pour enregistrer le mouvement.', 401);
  }
}

function quantityMilliUnits(value: number, label: string): number {
  const milliUnits = toStockQuantityMilliUnits(value);
  if (milliUnits === null) throw new MaterialsRequestError(`${label} n’est pas une quantité de stock valide.`, 409);
  return milliUnits;
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

export class MaterialsService {
  static async getModuleData(entityId: string) {
    const [entity, materials] = await Promise.all([
      prisma.entity.findUnique({
        where: { id: entityId },
        select: {
          name: true,
          country: {
            select: {
              code: true,
              currencyCode: true,
              stockAssetAccountCode: true,
              stockAdjustmentAccountCode: true,
              productionWipAccountCode: true,
              accounts: {
                include: { parent: { select: { code: true } } },
                orderBy: [{ classNumber: 'asc' }, { code: 'asc' }],
              },
            },
          },
        },
      }),
      prisma.material.findMany({
        where: { entityId },
        orderBy: { sku: 'asc' },
      }),
    ]);
    if (!entity) throw new Error('Société introuvable');
    return {
      entity: {
        name: entity.name,
        countryCode: entity.country.code,
        currencyCode: entity.country.currencyCode,
        stockAccounting: {
          stockAssetAccountCode: entity.country.stockAssetAccountCode,
          stockAdjustmentAccountCode: entity.country.stockAdjustmentAccountCode,
          productionWipAccountCode: entity.country.productionWipAccountCode,
          accounts: entity.country.accounts.map(({ parent, parentId: _parentId, ...account }) => ({
            ...account,
            parentCode: parent?.code ?? null,
          })),
        },
      },
      materials,
    };
  }

  static async listPurchaseInvoices(entityId: string) {
    return prisma.purchaseInvoice.findMany({
      where: { entityId, status: { in: ['TO_REVIEW', 'APPROVED', 'POSTED'] } },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        subTotal: true,
        currencyCode: true,
        exchangeRate: true,
        vendor: { select: { code: true, name: true } },
        lines: {
          select: {
            id: true,
            description: true,
            materialId: true,
            purchaseOrderLineId: true,
            quantity: true,
            unitPrice: true,
            receiptMatches: { select: { receipt: { select: { quantity: true, unitCost: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ issueDate: 'desc' }, { invoiceNumber: 'asc' }],
    });
  }

  static async listReceivablePurchaseOrderLines(entityId: string) {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { country: { select: { currencyCode: true } } },
    });
    if (!entity) throw new MaterialsRequestError('Société introuvable.', 404);
    const lines = await prisma.purchaseOrderLine.findMany({
      where: {
        entityId,
        materialId: { not: null },
        order: { entityId, status: 'APPROVED', currencyCode: entity.country.currencyCode },
      },
      select: {
        id: true,
        description: true,
        materialId: true,
        quantity: true,
        unitPrice: true,
        material: { select: { id: true, sku: true, name: true, unitCode: true } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            currencyCode: true,
            vendor: { select: { code: true, name: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (lines.length === 0) return [];

    const receipts = await prisma.stockReceipt.findMany({
      where: { entityId, purchaseOrderLineId: { in: lines.map((line) => line.id) } },
      select: {
        purchaseOrderLineId: true,
        quantity: true,
        supplierReturns: { select: { quantity: true } },
      },
    });
    const receivedByLine = new Map<string, number>();
    for (const receipt of receipts) {
      if (!receipt.purchaseOrderLineId) continue;
      const received = quantityMilliUnits(receipt.quantity, 'La quantité réceptionnée existante');
      const returned = receipt.supplierReturns.reduce(
        (total, item) => total + quantityMilliUnits(item.quantity, 'La quantité retournée existante'),
        0,
      );
      if (returned > received) {
        throw new MaterialsRequestError('Les retours fournisseur existants dépassent une réception liée à la commande.', 409);
      }
      const total = (receivedByLine.get(receipt.purchaseOrderLineId) ?? 0) + received - returned;
      if (!Number.isSafeInteger(total)) {
        throw new MaterialsRequestError('Le cumul des réceptions dépasse la précision de stock prise en charge.', 409);
      }
      receivedByLine.set(receipt.purchaseOrderLineId, total);
    }

    return lines.flatMap((line) => {
      const ordered = quantityMilliUnits(line.quantity, 'La quantité commandée');
      const received = receivedByLine.get(line.id) ?? 0;
      if (received > ordered) {
        throw new MaterialsRequestError(`Les réceptions de la ligne ${line.id} dépassent la quantité commandée.`, 409);
      }
      const remaining = ordered - received;
      return remaining > 0
        ? [{ ...line, receivedQuantity: received / 1000, remainingQuantity: remaining / 1000 }]
        : [];
    });
  }

  static async listStockReceipts(entityId: string) {
    return prisma.stockReceipt.findMany({
      where: { entityId },
      include: {
        material: { select: { id: true, sku: true, name: true, unitCode: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        purchaseInvoice: { select: { id: true, invoiceNumber: true, status: true } },
        invoiceLineMatch: { include: { line: { select: { id: true, description: true } } } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  static async listStockSupplierReturns(entityId: string) {
    return prisma.stockSupplierReturn.findMany({
      where: { entityId },
      include: {
        material: { select: { id: true, sku: true, name: true, unitCode: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        sourceReceipt: {
          select: {
            id: true,
            reason: true,
            purchaseInvoice: { select: { invoiceNumber: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  static async listStockPicks(entityId: string) {
    return prisma.stockPick.findMany({
      where: { entityId },
      include: {
        lines: {
          include: {
            material: { select: { id: true, sku: true, name: true, unitCode: true } },
            warehouse: { select: { id: true, code: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        dispatch: { select: { id: true, idempotencyKey: true, confirmedAt: true, confirmedByUsername: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  static async listMaterials(entityId?: string) {
    const where = entityId ? { entityId } : {};
    return await prisma.material.findMany({
      where,
      orderBy: { sku: 'asc' },
    });
  }

  static async createMaterial(data: unknown, entityId: string, actor: StockAdjustmentActor) {
    const materialInput = validateMaterialInput(data, entityId);
    const initialQuantity = materialInput.quantity ?? 0;
    if (initialQuantity > 0) assertStockActor(actor);
    const { initialStockReason, ...materialData } = materialInput;
    return prisma.$transaction(async (transaction) => {
      const material = await transaction.material.create({ data: materialData });
      if (initialQuantity > 0) {
        const context = await transaction.entity.findUnique({
          where: { id: entityId },
          select: {
            country: {
              select: {
                id: true,
                code: true,
                stockAssetAccountCode: true,
                stockAdjustmentAccountCode: true,
                productionWipAccountCode: true,
              },
            },
          },
        });
        if (!context) throw new MaterialsRequestError('Société introuvable.', 404);
        const accountCodes = [
          context.country.stockAssetAccountCode,
          context.country.stockAdjustmentAccountCode,
        ].filter((code): code is string => Boolean(code));
        const accounts = await transaction.chartOfAccount.findMany({
          where: { countryId: context.country.id, code: { in: accountCodes } },
          select: { code: true, type: true, isPostingAllowed: true },
        });
        const issues = getStockPostingConfigurationIssues(context.country.code, context.country, accounts, 'adjustment');
        if (issues.length > 0) {
          throw new MaterialsRequestError(
            `Configuration comptable stock incomplète pour ${context.country.code} : ${issues.join('; ')}.`,
            422,
          );
        }
        const journalDate = new Date();
        await assertAccountingPeriodOpen(
          transaction,
          entityId,
          journalDate,
          (message) => new MaterialsRequestError(message, 409),
        );
        let valueMillimes: number;
        try {
          valueMillimes = stockValueMillimes(initialQuantity, material.costPrice);
        } catch (error) {
          throw new MaterialsRequestError(error instanceof Error ? error.message : 'Coût de stock invalide.', 422);
        }
        const journalEntry = await transaction.journalEntry.create({
          data: buildStockJournalEntryData({
            entityId,
            date: journalDate,
            reference: `STOCK-IN-${material.sku}`,
            description: `Entrée initiale de stock ${material.sku} — ${initialStockReason}`,
            lines: [
              {
                accountCode: context.country.stockAssetAccountCode!,
                debit: valueMillimes / 1000,
                credit: 0,
                description: `Stock ${material.sku}`,
              },
              {
                accountCode: context.country.stockAdjustmentAccountCode!,
                debit: 0,
                credit: valueMillimes / 1000,
                description: `Contrepartie entrée initiale ${material.sku}`,
              },
            ],
          }),
        });
        await appendJournalEntryAuditRecord(transaction, journalEntry.id);
        await transaction.stockMovement.create({
          data: {
            entityId,
            materialId: material.id,
            movementType: 'INITIAL_STOCK',
            deltaQuantity: initialQuantity,
            reason: initialStockReason!,
            createdByUserId: actor.id,
            createdByUsername: actor.username,
          },
        });
      }
      return material;
    });
  }

  static async listWarehouses(entityId: string) {
    return prisma.warehouse.findMany({
      where: { entityId },
      include: {
        stocks: {
          where: { entityId },
          include: { material: { select: { id: true, sku: true, name: true, unitCode: true } } },
          orderBy: { material: { sku: 'asc' } },
        },
      },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
    });
  }

  static async createWarehouse(input: unknown, entityId: string) {
    let warehouseInput: ReturnType<typeof validateWarehouseInput>;
    try {
      warehouseInput = validateWarehouseInput(input);
    } catch (error) {
      throw new MaterialsRequestError(error instanceof Error ? error.message : 'Données de dépôt invalides', 422);
    }
    return prisma.warehouse.create({
      data: { ...warehouseInput, entityId },
    });
  }

  static async listStockMovements(entityId: string, materialId?: string) {
    if (materialId) {
      const material = await prisma.material.findFirst({ where: { id: materialId, entityId }, select: { id: true } });
      if (!material) throw new MaterialsRequestError('Article introuvable pour cette société.', 404);
    }
    return prisma.stockMovement.findMany({
      where: { entityId, ...(materialId ? { materialId } : {}) },
      include: {
        material: { select: { id: true, sku: true, name: true, unitCode: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        transfer: { select: { id: true, sourceWarehouseId: true, destinationWarehouseId: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
  }

  static async setMinimumStock(id: string, entityId: string, requestedMinimumStock: unknown) {
    let minimumStock: number | null;
    const material = await prisma.material.findFirst({
      where: { id, entityId },
      select: { id: true, unitCode: true },
    });
    if (!material) throw new MaterialsRequestError('Article introuvable pour cette société.', 404);
    try {
      minimumStock = validateMinimumStock(requestedMinimumStock, material.unitCode);
    } catch (error) {
      throw new MaterialsRequestError(error instanceof Error ? error.message : 'Seuil de stock invalide.', 422);
    }
    const result = await prisma.material.updateMany({
      where: { id, entityId, unitCode: material.unitCode },
      data: { minimumStock },
    });
    if (result.count !== 1) throw new MaterialsRequestError('Article introuvable pour cette société.', 404);
    return prisma.material.findFirstOrThrow({ where: { id, entityId } });
  }

  static async listVendors(entityId?: string) {
    const where = entityId ? { entityId } : {};
    return await prisma.vendor.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  static async createVendor(input: unknown, entityId: string) {
    try {
      return await prisma.vendor.create({ data: validateVendorInput(input, entityId) });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        throw new MaterialsRequestError('Ce code fournisseur est déjà utilisé. Choisissez un autre code.', 409);
      }
      throw error;
    }
  }

  static async updateStock(
    id: string,
    entityId: string,
    requestedDelta: unknown,
    requestedReason: unknown,
    actor: StockAdjustmentActor,
  ) {
    let deltaQuantity: number;
    try {
      deltaQuantity = validateStockDelta(requestedDelta);
    } catch (error) {
      throw new MaterialsRequestError(error instanceof Error ? error.message : 'Variation de stock invalide.', 422);
    }
    let reason: string;
    try {
      reason = validateStockAdjustmentReason(requestedReason);
    } catch (error) {
      throw new MaterialsRequestError(error instanceof Error ? error.message : 'Motif de mouvement invalide.', 422);
    }
    assertStockActor(actor);
    return prisma.$transaction(async (transaction) => {
      const material = await transaction.material.findFirst({
        where: { id, entityId },
        include: {
          entity: {
            select: {
              country: {
                select: {
                  id: true,
                  code: true,
                  stockAssetAccountCode: true,
                  stockAdjustmentAccountCode: true,
                  productionWipAccountCode: true,
                },
              },
            },
          },
        },
      });
      if (!material) throw new MaterialsRequestError('Article introuvable pour cette société.', 404);
      try {
        deltaQuantity = validateStockDelta(requestedDelta, material.unitCode);
      } catch (error) {
        throw new MaterialsRequestError(error instanceof Error ? error.message : 'Variation de stock invalide.', 422);
      }
      let minimumStockAfterAdjustment = 0;
      if (deltaQuantity < 0) {
        const allocated = await transaction.materialWarehouseStock.aggregate({
          where: { entityId, materialId: id },
          _sum: { quantity: true },
        });
        const allocatedQuantity = allocated._sum.quantity ?? 0;
        const unallocatedQuantity = material.quantity - allocatedQuantity;
        if (unallocatedQuantity < Math.abs(deltaQuantity)) {
          throw new MaterialsRequestError(
            'Le stock non affecté est insuffisant pour cet ajustement; utilisez un mouvement de dépôt.',
            409,
          );
        }
        minimumStockAfterAdjustment = allocatedQuantity + Math.abs(deltaQuantity);
      }
      const country = material.entity.country;
      const accountCodes = [country.stockAssetAccountCode, country.stockAdjustmentAccountCode]
        .filter((code): code is string => Boolean(code));
      const accounts = await transaction.chartOfAccount.findMany({
        where: { countryId: country.id, code: { in: accountCodes } },
        select: { code: true, type: true, isPostingAllowed: true },
      });
      const issues = getStockPostingConfigurationIssues(country.code, country, accounts, 'adjustment');
      if (issues.length > 0) {
        throw new MaterialsRequestError(
          `Configuration comptable stock incomplète pour ${country.code} : ${issues.join('; ')}.`,
          422,
        );
      }
      let valueMillimes: number;
      try {
        valueMillimes = stockValueMillimes(Math.abs(deltaQuantity), material.costPrice);
      } catch (error) {
        throw new MaterialsRequestError(error instanceof Error ? error.message : 'Coût de stock invalide.', 422);
      }
      const entryDate = new Date();
      await assertAccountingPeriodOpen(
        transaction,
        entityId,
        entryDate,
        (message) => new MaterialsRequestError(message, 409),
      );
      const result = await transaction.material.updateMany({
        where: deltaQuantity < 0
          ? { id, entityId, quantity: { gte: minimumStockAfterAdjustment } }
          : buildStockAdjustmentWhere(id, entityId, deltaQuantity),
        data: { quantity: { increment: deltaQuantity } },
      });
      if (result.count !== 1) {
        throw new MaterialsRequestError('Article introuvable ou variation de stock hors limites.', 409);
      }
      const amount = valueMillimes / 1000;
      const journalEntry = await transaction.journalEntry.create({
        data: buildStockJournalEntryData({
          entityId,
          date: entryDate,
          reference: `STOCK-${material.sku}-${entryDate.getTime()}`,
          description: `${deltaQuantity > 0 ? 'Entrée' : 'Sortie'} de stock ${material.sku} — ${reason}`,
          lines: deltaQuantity > 0
            ? [
              {
                accountCode: country.stockAssetAccountCode!,
                debit: amount,
                credit: 0,
                description: `Stock ${material.sku}`,
              },
              {
                accountCode: country.stockAdjustmentAccountCode!,
                debit: 0,
                credit: amount,
                description: `Ajustement stock ${material.sku}`,
              },
            ]
            : [
              {
                accountCode: country.stockAdjustmentAccountCode!,
                debit: amount,
                credit: 0,
                description: `Ajustement stock ${material.sku}`,
              },
              {
                accountCode: country.stockAssetAccountCode!,
                debit: 0,
                credit: amount,
                description: `Stock ${material.sku}`,
              },
            ],
        }),
      });
      await appendJournalEntryAuditRecord(transaction, journalEntry.id);
      await transaction.stockMovement.create({
        data: {
          entityId,
          materialId: id,
          movementType: 'ADJUSTMENT',
          deltaQuantity,
          reason,
          createdByUserId: actor.id,
          createdByUsername: actor.username,
        },
      });
      const updated = await transaction.material.findFirst({ where: { id, entityId } });
      if (!updated) throw new MaterialsRequestError('Article introuvable après la mise à jour.', 404);
      return updated;
    });
  }

  static async receiveStock(
    requestedInput: unknown,
    entityId: string,
    actor: StockAdjustmentActor,
  ) {
    let input: ReturnType<typeof validateStockReceiptInput>;
    try {
      input = validateStockReceiptInput(requestedInput);
    } catch (error) {
      throw new MaterialsRequestError(error instanceof Error ? error.message : 'Données de réception invalides.', 422);
    }
    assertStockActor(actor);

    try {
      return await prisma.$transaction(async (transaction) => {
        const existing = await transaction.stockReceipt.findUnique({
          where: { entityId_idempotencyKey: { entityId, idempotencyKey: input.idempotencyKey } },
          include: { material: true, invoiceLineMatch: { select: { lineId: true } } },
        });
        if (existing) {
          if (!matchesStockReceipt({
            ...existing,
            purchaseInvoiceLineId: existing.invoiceLineMatch?.lineId ?? null,
          }, input)) {
            throw new MaterialsRequestError('Cette clé de réception a déjà été utilisée pour un autre mouvement.', 409);
          }
          return { receipt: existing, material: existing.material };
        }

        if (input.purchaseInvoiceLineId && !input.purchaseInvoiceId) {
          throw new MaterialsRequestError('Une ligne de facture ne peut pas être sélectionnée sans facture fournisseur.', 422);
        }
        if (!input.purchaseOrderLineId && !input.purchaseInvoiceId) {
          throw new MaterialsRequestError('Une réception doit être rattachée à une commande ou une facture fournisseur.', 422);
        }
        let purchaseOrderVendorId: string | null = null;
        if (input.purchaseOrderLineId) {
          const orderLine = await transaction.purchaseOrderLine.findFirst({
            where: { id: input.purchaseOrderLineId, entityId },
            include: { order: { select: { status: true, currencyCode: true, vendorId: true } } },
          });
          if (!orderLine) throw new MaterialsRequestError('Ligne de commande fournisseur introuvable pour cette société.', 404);
          if (orderLine.order.status !== 'APPROVED') {
            throw new MaterialsRequestError('Seule une ligne de commande approuvée peut être réceptionnée.', 409);
          }
          purchaseOrderVendorId = orderLine.order.vendorId;
          if (orderLine.materialId !== input.materialId) {
            throw new MaterialsRequestError('L’article reçu ne correspond pas à la ligne de commande.', 422);
          }
          const company = await transaction.entity.findUnique({
            where: { id: entityId },
            select: { country: { select: { currencyCode: true } } },
          });
          if (!company) throw new MaterialsRequestError('Société introuvable.', 404);
          if (orderLine.order.currencyCode !== company.country.currencyCode) {
            throw new MaterialsRequestError('La devise de la commande ne correspond pas à la devise fonctionnelle.', 422);
          }
          if (Math.round(input.unitCost * 1000) !== Math.round(orderLine.unitPrice * 1000)) {
            throw new MaterialsRequestError('Le coût de réception doit correspondre au prix unitaire approuvé de la commande.', 409);
          }
          const previousReceipts = await transaction.stockReceipt.findMany({
            where: { entityId, purchaseOrderLineId: orderLine.id },
            select: { quantity: true, supplierReturns: { select: { quantity: true } } },
          });
          const netReceivedMilliUnits = previousReceipts.reduce((total, receipt) => {
            const received = quantityMilliUnits(receipt.quantity, 'La quantité reçue existante');
            const returned = receipt.supplierReturns.reduce(
              (sum, item) => sum + quantityMilliUnits(item.quantity, 'La quantité retournée existante'),
              0,
            );
            if (returned > received) throw new MaterialsRequestError('Les retours existants dépassent la réception.', 409);
            return total + received - returned;
          }, 0);
          if (netReceivedMilliUnits + quantityMilliUnits(input.quantity, 'La quantité reçue')
            > quantityMilliUnits(orderLine.quantity, 'La quantité commandée')) {
            throw new MaterialsRequestError('La réception dépasserait la quantité commandée encore disponible.', 409);
          }
        }
        if (input.purchaseInvoiceId) {
          const invoice = await transaction.purchaseInvoice.findFirst({
            where: { id: input.purchaseInvoiceId, entityId },
            select: {
              id: true,
              status: true,
              subTotal: true,
              currencyCode: true,
              vendorId: true,
              lines: { select: { id: true, materialId: true, purchaseOrderLineId: true }, take: 1 },
            },
          });
          if (!invoice) throw new MaterialsRequestError('Facture fournisseur introuvable pour cette société.', 404);
          if (invoice.status !== 'APPROVED') {
            throw new MaterialsRequestError('La réception doit être rattachée à une facture fournisseur approuvée.', 409);
          }
          if (purchaseOrderVendorId && invoice.vendorId !== purchaseOrderVendorId) {
            throw new MaterialsRequestError('Le fournisseur de la facture diffère de celui de la commande.', 422);
          }
          if (!input.purchaseInvoiceLineId && invoice.lines?.length) {
            throw new MaterialsRequestError('Sélectionnez la ligne de facture liée à cet article pour rapprocher la réception.', 422);
          }
          if (input.purchaseInvoiceLineId) {
            const line = await transaction.purchaseInvoiceLine.findFirst({
              where: {
                id: input.purchaseInvoiceLineId,
                purchaseInvoiceId: invoice.id,
                entityId,
              },
              include: {
                purchaseInvoice: { select: { exchangeRate: true } },
                receiptMatches: { select: { receipt: { select: { quantity: true, unitCost: true } } } },
              },
            });
            if (!line) throw new MaterialsRequestError('La ligne de facture est introuvable pour cette société et cette facture.', 404);
            if (!line.materialId || line.materialId !== input.materialId) {
              throw new MaterialsRequestError('La ligne de facture n’est pas liée à l’article réceptionné.', 422);
            }
            if (input.purchaseOrderLineId && line.purchaseOrderLineId !== input.purchaseOrderLineId) {
              throw new MaterialsRequestError('La ligne de facture ne correspond pas à la ligne de commande réceptionnée.', 422);
            }
            const reconciliation = reconcileInvoiceLineReceipt({
              lineQuantity: line.quantity,
              lineUnitPrice: line.unitPrice,
              exchangeRate: line.purchaseInvoice.exchangeRate ?? 1,
              receiptQuantity: input.quantity,
              receiptUnitCost: input.unitCost,
              previousReceipts: line.receiptMatches.map((match) => match.receipt),
            });
            if (!reconciliation.accepted) {
              throw new MaterialsRequestError(reconciliation.error ?? 'La ligne de réception ne peut pas être rapprochée.', 409);
            }
          }
          const linkedReceipts = await transaction.stockReceipt.findMany({
            where: { entityId, purchaseInvoiceId: invoice.id },
            select: { quantity: true, unitCost: true },
          });
          let previousReceiptValueMillimes = 0;
          try {
            for (const linkedReceipt of linkedReceipts) {
              previousReceiptValueMillimes += stockValueMillimes(linkedReceipt.quantity, linkedReceipt.unitCost);
              if (!Number.isSafeInteger(previousReceiptValueMillimes)) {
                throw new Error('La valeur des réceptions liées dépasse la précision comptable.');
              }
            }
            const invoiceSubTotalMillimes = Math.round(invoice.subTotal * 1000);
            if (!Number.isSafeInteger(invoiceSubTotalMillimes)
              || Math.abs(invoice.subTotal * 1000 - invoiceSubTotalMillimes) > 1e-7) {
              throw new Error('Le sous-total de la facture n’est pas exprimé au millime.');
            }
            const nextReceiptValueMillimes = previousReceiptValueMillimes
              + stockValueMillimes(input.quantity, input.unitCost);
            if (nextReceiptValueMillimes > invoiceSubTotalMillimes) {
              throw new MaterialsRequestError(
                `La réception dépasserait le HT de la facture (${invoiceSubTotalMillimes / 1000} ${invoice.currencyCode}).`,
                409,
              );
            }
          } catch (error) {
            if (error instanceof MaterialsRequestError) throw error;
            throw new MaterialsRequestError(
              error instanceof Error ? error.message : 'La valeur de la réception ne peut pas être rapprochée.',
              422,
            );
          }
        }

        const material = await transaction.material.findFirst({
          where: { id: input.materialId, entityId },
          select: { id: true, sku: true, quantity: true, costPrice: true, unitCode: true },
        });
        if (!material) throw new MaterialsRequestError('Article introuvable pour cette société.', 404);
        try {
          input = {
            ...input,
            quantity: validateStockQuantity(input.quantity, 'La quantité reçue', { unitCode: material.unitCode }),
          };
        } catch (error) {
          throw new MaterialsRequestError(error instanceof Error ? error.message : 'Quantité reçue invalide.', 422);
        }
        const warehouse = await transaction.warehouse.findFirst({
          where: { id: input.warehouseId, entityId },
          select: { id: true },
        });
        if (!warehouse) throw new MaterialsRequestError('Dépôt introuvable pour cette société.', 404);
        const newQuantity = Math.round((material.quantity + input.quantity) * 1000) / 1000;
        if (toStockQuantityMilliUnits(newQuantity) === null) {
          throw new MaterialsRequestError('La quantité reçue dépasse la capacité de stock prise en charge.', 422);
        }
        let receivedValueMillimes: number;
        let inventoryValueMillimes: number;
        try {
          receivedValueMillimes = stockValueMillimes(input.quantity, input.unitCost);
          inventoryValueMillimes = stockInventoryValueMillimes(material.quantity, material.costPrice)
            + receivedValueMillimes;
          if (!Number.isSafeInteger(inventoryValueMillimes)) {
            throw new Error('La valeur totale du stock dépasse la précision comptable.');
          }
        } catch (error) {
          throw new MaterialsRequestError(error instanceof Error ? error.message : 'Coût de réception invalide.', 422);
        }
        const newCostPrice = inventoryValueMillimes / 1000 / newQuantity;
        try {
          stockInventoryValueMillimes(newQuantity, newCostPrice);
        } catch (error) {
          throw new MaterialsRequestError(error instanceof Error ? error.message : 'Coût moyen après réception invalide.', 422);
        }

        const currentWarehouseStock = await transaction.materialWarehouseStock.findUnique({
          where: { materialId_warehouseId: { materialId: input.materialId, warehouseId: input.warehouseId } },
          select: { quantity: true },
        });
        const newWarehouseQuantity = Math.round(((currentWarehouseStock?.quantity ?? 0) + input.quantity) * 1000) / 1000;
        if (toStockQuantityMilliUnits(newWarehouseQuantity) === null) {
          throw new MaterialsRequestError('La quantité au dépôt dépasse la capacité de stock prise en charge.', 422);
        }

        const receipt = await transaction.stockReceipt.create({
          data: {
            entityId,
            materialId: input.materialId,
            purchaseOrderLineId: input.purchaseOrderLineId,
            purchaseInvoiceId: input.purchaseInvoiceId,
            warehouseId: input.warehouseId,
            quantity: input.quantity,
            unitCost: input.unitCost,
            reason: input.reason,
            idempotencyKey: input.idempotencyKey,
            createdByUserId: actor.id,
            createdByUsername: actor.username,
          },
        });
        if (input.purchaseInvoiceLineId && input.purchaseInvoiceId) {
          await transaction.purchaseInvoiceLineReceiptMatch.create({
            data: {
              entityId,
              purchaseInvoiceId: input.purchaseInvoiceId,
              lineId: input.purchaseInvoiceLineId,
              receiptId: receipt.id,
            },
          });
        }
        const updatedMaterialCount = await transaction.material.updateMany({
          where: { id: input.materialId, entityId, quantity: material.quantity },
          data: { quantity: { increment: input.quantity }, costPrice: newCostPrice },
        });
        if (updatedMaterialCount.count !== 1) {
          throw new MaterialsRequestError('Le stock a changé pendant la réception; aucune opération n’a été enregistrée.', 409);
        }
        await transaction.materialWarehouseStock.upsert({
          where: {
            materialId_warehouseId: { materialId: input.materialId, warehouseId: input.warehouseId },
          },
          create: {
            entityId,
            materialId: input.materialId,
            warehouseId: input.warehouseId,
            quantity: input.quantity,
          },
          update: { quantity: { increment: input.quantity } },
        });

        await transaction.stockMovement.create({
          data: {
            entityId,
            materialId: input.materialId,
            warehouseId: input.warehouseId,
            movementType: 'RECEIPT',
            deltaQuantity: input.quantity,
            reason: input.reason,
            createdByUserId: actor.id,
            createdByUsername: actor.username,
          },
        });
        const updatedMaterial = await transaction.material.findFirst({
          where: { id: input.materialId, entityId },
        });
        if (!updatedMaterial) throw new MaterialsRequestError('Article introuvable après la réception.', 404);
        return { receipt, material: updatedMaterial };
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        const existing = await prisma.stockReceipt.findUnique({
          where: { entityId_idempotencyKey: { entityId, idempotencyKey: input.idempotencyKey } },
          include: { material: true, invoiceLineMatch: { select: { lineId: true } } },
        });
        if (existing) {
          if (!matchesStockReceipt({
            ...existing,
            purchaseInvoiceLineId: existing.invoiceLineMatch?.lineId ?? null,
          }, input)) {
            throw new MaterialsRequestError('Cette clé de réception a déjà été utilisée pour un autre mouvement.', 409);
          }
          return { receipt: existing, material: existing.material };
        }
      }
      throw error;
    }
  }

  static async transferStock(
    requestedInput: unknown,
    entityId: string,
    actor: StockAdjustmentActor,
  ) {
    let input: ReturnType<typeof validateStockTransferInput>;
    try {
      input = validateStockTransferInput(requestedInput);
    } catch (error) {
      throw new MaterialsRequestError(error instanceof Error ? error.message : 'Données de transfert invalides.', 422);
    }

    assertStockActor(actor);

    try {
      return await prisma.$transaction(async (transaction) => {
      const existing = await transaction.stockTransfer.findUnique({
        where: { entityId_idempotencyKey: { entityId, idempotencyKey: input.idempotencyKey } },
      });
      if (existing) {
        if (!matchesStockTransfer(existing, input)) {
          throw new MaterialsRequestError('Cette clé de transfert a déjà été utilisée pour un autre mouvement.', 409);
        }
        return existing;
      }

      const material = await transaction.material.findFirst({
        where: { id: input.materialId, entityId },
        select: { id: true, quantity: true, unitCode: true },
      });
      if (!material) throw new MaterialsRequestError('Article introuvable pour cette société.', 404);
      try {
        input = {
          ...input,
          quantity: validateStockQuantity(input.quantity, 'La quantité transférée', { unitCode: material.unitCode }),
        };
      } catch (error) {
        throw new MaterialsRequestError(error instanceof Error ? error.message : 'Quantité transférée invalide.', 422);
      }

      if (input.sourceWarehouseId) {
        const source = await transaction.warehouse.findFirst({
          where: { id: input.sourceWarehouseId, entityId },
          select: { id: true },
        });
        if (!source) throw new MaterialsRequestError('Dépôt source introuvable pour cette société.', 404);
      }
      if (input.destinationWarehouseId) {
        const destination = await transaction.warehouse.findFirst({
          where: { id: input.destinationWarehouseId, entityId },
          select: { id: true },
        });
        if (!destination) throw new MaterialsRequestError('Dépôt de destination introuvable pour cette société.', 404);
      }

      if (input.sourceWarehouseId) {
        const sourceStock = await consumeAvailableWarehouseStock(
          transaction,
          entityId,
          input.materialId,
          input.sourceWarehouseId,
          input.quantity,
        );
        if (sourceStock !== 1) {
          throw new MaterialsRequestError('Le stock disponible au dépôt source est insuffisant.', 409);
        }
      } else {
        const allocated = await transaction.materialWarehouseStock.aggregate({
          where: { entityId, materialId: input.materialId },
          _sum: { quantity: true },
        });
        const requiredTotal = (allocated._sum.quantity ?? 0) + input.quantity;
        const guardedMaterial = await transaction.material.updateMany({
          where: { id: material.id, entityId, quantity: { gte: requiredTotal } },
          data: { quantity: { increment: 0 } },
        });
        if (guardedMaterial.count !== 1) {
          throw new MaterialsRequestError('Le stock non affecté est insuffisant pour ce transfert.', 409);
        }
      }

      const transfer = await transaction.stockTransfer.create({
        data: {
          entityId,
          materialId: input.materialId,
          sourceWarehouseId: input.sourceWarehouseId,
          destinationWarehouseId: input.destinationWarehouseId,
          quantity: input.quantity,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
          createdByUserId: actor.id,
          createdByUsername: actor.username,
        },
      });
      if (input.destinationWarehouseId) {
        const destinationStock = await transaction.materialWarehouseStock.findUnique({
          where: {
            materialId_warehouseId: {
              materialId: input.materialId,
              warehouseId: input.destinationWarehouseId,
            },
          },
          select: { quantity: true },
        });
        const destinationQuantity = Math.round(((destinationStock?.quantity ?? 0) + input.quantity) * 1000) / 1000;
        if (toStockQuantityMilliUnits(destinationQuantity) === null) {
          throw new MaterialsRequestError('La quantité au dépôt de destination dépasse la capacité de stock prise en charge.', 422);
        }
        await transaction.materialWarehouseStock.upsert({
          where: {
            materialId_warehouseId: {
              materialId: input.materialId,
              warehouseId: input.destinationWarehouseId,
            },
          },
          create: {
            entityId,
            materialId: input.materialId,
            warehouseId: input.destinationWarehouseId,
            quantity: input.quantity,
          },
          update: { quantity: { increment: input.quantity } },
        });
      }
      await transaction.stockMovement.createMany({
        data: [
          {
            entityId,
            materialId: input.materialId,
            warehouseId: input.sourceWarehouseId,
            transferId: transfer.id,
            movementType: 'TRANSFER_OUT',
            deltaQuantity: -input.quantity,
            reason: input.reason,
            createdByUserId: actor.id,
            createdByUsername: actor.username,
          },
          {
            entityId,
            materialId: input.materialId,
            warehouseId: input.destinationWarehouseId,
            transferId: transfer.id,
            movementType: 'TRANSFER_IN',
            deltaQuantity: input.quantity,
            reason: input.reason,
            createdByUserId: actor.id,
            createdByUsername: actor.username,
          },
        ],
      });
        return transfer;
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        const existing = await prisma.stockTransfer.findUnique({
          where: { entityId_idempotencyKey: { entityId, idempotencyKey: input.idempotencyKey } },
        });
        if (existing) {
          if (!matchesStockTransfer(existing, input)) {
            throw new MaterialsRequestError('Cette clé de transfert a déjà été utilisée pour un autre mouvement.', 409);
          }
          return existing;
        }
      }
      throw error;
    }
  }

  static async createStockPick(
    requestedInput: unknown,
    entityId: string,
    actor: StockAdjustmentActor,
  ) {
    let input: ReturnType<typeof validateStockPickInput>;
    try {
      input = validateStockPickInput(requestedInput);
    } catch (error) {
      throw new MaterialsRequestError(error instanceof Error ? error.message : 'Données de préparation invalides.', 422);
    }
    assertStockActor(actor);

    try {
      return await prisma.$transaction(async (transaction) => {
        const existing = await transaction.stockPick.findUnique({
          where: { entityId_idempotencyKey: { entityId, idempotencyKey: input.idempotencyKey } },
          include: {
            lines: {
              include: {
                material: { select: { id: true, sku: true, name: true, unitCode: true } },
                warehouse: { select: { id: true, code: true, name: true } },
              },
            },
            dispatch: true,
          },
        });
        if (existing) {
          if (!matchesStockPick(existing, input)) {
            throw new MaterialsRequestError('Cette clé de préparation a déjà été utilisée pour un autre bon.', 409);
          }
          return existing;
        }

        const materialIds = [...new Set(input.lines.map((line) => line.materialId))];
        const warehouseIds = [...new Set(input.lines.map((line) => line.warehouseId))];
        const [materials, warehouses] = await Promise.all([
          transaction.material.findMany({
            where: { entityId, id: { in: materialIds } },
            select: { id: true, unitCode: true },
          }),
          transaction.warehouse.findMany({
            where: { entityId, id: { in: warehouseIds } },
            select: { id: true },
          }),
        ]);
        if (materials.length !== materialIds.length) {
          throw new MaterialsRequestError('Un article de la préparation est introuvable pour cette société.', 404);
        }
        if (warehouses.length !== warehouseIds.length) {
          throw new MaterialsRequestError('Un dépôt de la préparation est introuvable pour cette société.', 404);
        }
        const unitByMaterialId = new Map(materials.map((material) => [material.id, material.unitCode]));
        const lines = input.lines.map((line) => ({
          ...line,
          quantity: validateStockQuantity(
            line.quantity,
            'La quantité préparée',
            { unitCode: unitByMaterialId.get(line.materialId) },
          ),
        }));
        const quantityByMaterial = new Map<string, number>();
        for (const line of lines) {
          const lineMilliUnits = quantityMilliUnits(line.quantity, 'La quantité préparée');
          const total = (quantityByMaterial.get(line.materialId) ?? 0) + lineMilliUnits;
          if (!Number.isSafeInteger(total)) {
            throw new MaterialsRequestError('Le cumul réservé dépasse la précision de stock prise en charge.', 409);
          }
          quantityByMaterial.set(line.materialId, total);
        }
        for (const [materialId, total] of quantityByMaterial) {
          if (await reserveMaterialStock(transaction, entityId, materialId, total / 1000) !== 1) {
            throw new MaterialsRequestError('Le stock global disponible est insuffisant pour préparer la commande.', 409);
          }
        }
        for (const line of lines) {
          if (await reserveWarehouseStock(
            transaction,
            entityId,
            line.materialId,
            line.warehouseId,
            line.quantity,
          ) !== 1) {
            throw new MaterialsRequestError('Le stock disponible au dépôt est insuffisant pour préparer la ligne.', 409);
          }
        }

        const pick = await transaction.stockPick.create({
          data: {
            entityId,
            reference: input.reference,
            reason: input.reason,
            status: 'PICKED',
            idempotencyKey: input.idempotencyKey,
            createdByUserId: actor.id,
            createdByUsername: actor.username,
          },
        });
        for (const line of lines) {
          await transaction.stockPickLine.create({
            data: {
              entityId,
              pickId: pick.id,
              materialId: line.materialId,
              warehouseId: line.warehouseId,
              quantity: line.quantity,
            },
          });
        }
        return transaction.stockPick.findUniqueOrThrow({
          where: { id: pick.id },
          include: {
            lines: {
              include: {
                material: { select: { id: true, sku: true, name: true, unitCode: true } },
                warehouse: { select: { id: true, code: true, name: true } },
              },
            },
            dispatch: true,
          },
        });
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        const existing = await prisma.stockPick.findUnique({
          where: { entityId_idempotencyKey: { entityId, idempotencyKey: input.idempotencyKey } },
          include: {
            lines: {
              include: {
                material: { select: { id: true, sku: true, name: true, unitCode: true } },
                warehouse: { select: { id: true, code: true, name: true } },
              },
            },
            dispatch: true,
          },
        });
        if (existing) {
          if (!matchesStockPick(existing, input)) {
            throw new MaterialsRequestError('Cette clé de préparation a déjà été utilisée pour un autre bon.', 409);
          }
          return existing;
        }
        throw new MaterialsRequestError('La référence du bon de préparation existe déjà pour cette société.', 409);
      }
      throw error;
    }
  }

  static async cancelStockPick(
    pickId: string,
    entityId: string,
    actor: StockAdjustmentActor,
  ) {
    assertStockActor(actor);
    return prisma.$transaction(async (transaction) => {
      const pick = await transaction.stockPick.findFirst({
        where: { id: pickId, entityId },
        include: { lines: true, dispatch: true },
      });
      if (!pick) throw new MaterialsRequestError('Bon de préparation introuvable pour cette société.', 404);
      if (pick.status === 'CANCELLED') return pick;
      if (pick.status !== 'PICKED' || pick.dispatch) {
        throw new MaterialsRequestError('Seul un bon préparé et non expédié peut être annulé.', 409);
      }

      const claimed = await transaction.stockPick.updateMany({
        where: { id: pick.id, entityId, status: 'PICKED' },
        data: { status: 'CANCELLED' },
      });
      if (claimed.count !== 1) {
        throw new MaterialsRequestError('Le bon a changé pendant son annulation; rechargez-le.', 409);
      }

      const quantitiesByLocation = new Map<string, {
        materialId: string;
        warehouseId: string;
        quantityMilliUnits: number;
      }>();
      const quantitiesByMaterial = new Map<string, number>();
      for (const line of pick.lines) {
        const lineMilliUnits = quantityMilliUnits(line.quantity, 'La quantité réservée');
        const key = `${line.materialId}\0${line.warehouseId}`;
        const total = (quantitiesByLocation.get(key)?.quantityMilliUnits ?? 0) + lineMilliUnits;
        if (!Number.isSafeInteger(total)) {
          throw new MaterialsRequestError('Le cumul réservé dépasse la précision de stock prise en charge.', 409);
        }
        quantitiesByLocation.set(key, {
          materialId: line.materialId,
          warehouseId: line.warehouseId,
          quantityMilliUnits: total,
        });
        const materialTotal = (quantitiesByMaterial.get(line.materialId) ?? 0) + lineMilliUnits;
        if (!Number.isSafeInteger(materialTotal)) {
          throw new MaterialsRequestError('Le cumul réservé dépasse la précision de stock prise en charge.', 409);
        }
        quantitiesByMaterial.set(line.materialId, materialTotal);
      }
      for (const [materialId, total] of quantitiesByMaterial) {
        if (await releaseMaterialReservation(transaction, entityId, materialId, total / 1000) !== 1) {
          throw new MaterialsRequestError('La réservation globale du bon est incohérente; aucune annulation n’a été validée.', 409);
        }
      }
      for (const location of quantitiesByLocation.values()) {
        if (await releaseWarehouseReservation(
          transaction,
          entityId,
          location.materialId,
          location.warehouseId,
          location.quantityMilliUnits / 1000,
        ) !== 1) {
          throw new MaterialsRequestError('La réservation du dépôt est incohérente; aucune annulation n’a été validée.', 409);
        }
      }
      return transaction.stockPick.findUniqueOrThrow({
        where: { id: pick.id },
        include: {
          lines: {
            include: {
              material: { select: { id: true, sku: true, name: true, unitCode: true } },
              warehouse: { select: { id: true, code: true, name: true } },
            },
          },
          dispatch: true,
        },
      });
    });
  }

  static async cancelStockPickByIdempotencyKey(
    idempotencyKey: string,
    entityId: string,
    actor: StockAdjustmentActor,
  ) {
    const pick = await prisma.stockPick.findUnique({
      where: { entityId_idempotencyKey: { entityId, idempotencyKey } },
      select: { id: true },
    });
    return pick ? this.cancelStockPick(pick.id, entityId, actor) : null;
  }

  static async confirmStockDispatch(
    pickId: string,
    requestedInput: unknown,
    entityId: string,
    actor: StockAdjustmentActor,
  ) {
    let input: ReturnType<typeof validateStockDispatchInput>;
    try {
      input = validateStockDispatchInput(requestedInput);
    } catch (error) {
      throw new MaterialsRequestError(error instanceof Error ? error.message : 'Données d’expédition invalides.', 422);
    }
    assertStockActor(actor);

    try {
      return await prisma.$transaction(async (transaction) => {
        const existingByKey = await transaction.stockDispatch.findUnique({
          where: { entityId_idempotencyKey: { entityId, idempotencyKey: input.idempotencyKey } },
          include: {
            pick: {
              include: {
                lines: {
                  include: {
                    material: { select: { id: true, sku: true, name: true, unitCode: true } },
                    warehouse: { select: { id: true, code: true, name: true } },
                  },
                },
              },
            },
          },
        });
        if (existingByKey) {
          if (existingByKey.pickId !== pickId) {
            throw new MaterialsRequestError('Cette clé d’expédition a déjà été utilisée pour un autre bon.', 409);
          }
          return existingByKey;
        }
        const pick = await transaction.stockPick.findFirst({
          where: { id: pickId, entityId },
          include: {
            lines: {
              include: {
                material: { select: { id: true, quantity: true, unitCode: true } },
                warehouse: { select: { id: true } },
              },
            },
            dispatch: true,
          },
        });
        if (!pick) throw new MaterialsRequestError('Bon de préparation introuvable pour cette société.', 404);
        if (pick.dispatch) {
          throw new MaterialsRequestError('Ce bon a déjà été expédié avec une autre clé d’idempotence.', 409);
        }
        if (pick.status !== 'PICKED') {
          throw new MaterialsRequestError('Seul un bon préparé peut être expédié.', 409);
        }
        const quantityByLocation = new Map<string, {
          materialId: string;
          warehouseId: string;
          quantityMilliUnits: number;
        }>();
        for (const line of pick.lines) {
          let quantity: number;
          try {
            quantity = validateStockQuantity(line.quantity, 'La quantité expédiée', { unitCode: line.material.unitCode });
          } catch (error) {
            throw new MaterialsRequestError(error instanceof Error ? error.message : 'Quantité expédiée invalide.', 409);
          }
          const key = `${line.materialId}\0${line.warehouseId}`;
          const existing = quantityByLocation.get(key);
          const lineMilliUnits = quantityMilliUnits(quantity, 'La quantité expédiée');
          const total = (existing?.quantityMilliUnits ?? 0) + lineMilliUnits;
          if (!Number.isSafeInteger(total)) {
            throw new MaterialsRequestError('Le cumul expédié dépasse la précision de stock prise en charge.', 409);
          }
          quantityByLocation.set(key, {
            materialId: line.materialId,
            warehouseId: line.warehouseId,
            quantityMilliUnits: total,
          });
        }
        const claimed = await transaction.stockPick.updateMany({
          where: { id: pick.id, entityId, status: 'PICKED' },
          data: { status: 'DISPATCHED' },
        });
        if (claimed.count !== 1) {
          throw new MaterialsRequestError('Le bon a changé pendant la confirmation; rechargez-le.', 409);
        }
        for (const location of quantityByLocation.values()) {
          const quantity = location.quantityMilliUnits / 1000;
          const warehouseChanged = await consumeReservedWarehouseStock(
            transaction,
            entityId,
            location.materialId,
            location.warehouseId,
            quantity,
          );
          if (warehouseChanged !== 1) {
            throw new MaterialsRequestError('Le stock disponible au dépôt a changé ou est insuffisant; aucune expédition n’a été validée.', 409);
          }
          const materialChanged = await consumeReservedMaterialStock(
            transaction,
            entityId,
            location.materialId,
            quantity,
          );
          if (materialChanged !== 1) {
            throw new MaterialsRequestError('Le stock global disponible a changé ou est insuffisant; aucune expédition n’a été validée.', 409);
          }
          await transaction.stockMovement.create({
            data: {
              entityId,
              materialId: location.materialId,
              warehouseId: location.warehouseId,
              movementType: 'DISPATCH',
              deltaQuantity: -quantity,
              reason: `Expédition ${pick.reference} — ${pick.reason}`,
              createdByUserId: actor.id,
              createdByUsername: actor.username,
            },
          });
        }
        const dispatch = await transaction.stockDispatch.create({
          data: {
            entityId,
            pickId: pick.id,
            idempotencyKey: input.idempotencyKey,
            confirmedByUserId: actor.id,
            confirmedByUsername: actor.username,
          },
        });
        return transaction.stockDispatch.findUniqueOrThrow({
          where: { id: dispatch.id },
          include: {
            pick: {
              include: {
                lines: {
                  include: {
                    material: { select: { id: true, sku: true, name: true, unitCode: true } },
                    warehouse: { select: { id: true, code: true, name: true } },
                  },
                },
              },
            },
          },
        });
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        const existing = await prisma.stockDispatch.findUnique({
          where: { entityId_idempotencyKey: { entityId, idempotencyKey: input.idempotencyKey } },
          include: {
            pick: {
              include: {
                lines: {
                  include: {
                    material: { select: { id: true, sku: true, name: true, unitCode: true } },
                    warehouse: { select: { id: true, code: true, name: true } },
                  },
                },
              },
            },
          },
        });
        if (existing?.pickId === pickId) return existing;
        throw new MaterialsRequestError('Ce bon ou cette clé d’expédition a déjà été utilisé.', 409);
      }
      throw error;
    }
  }

  static async returnStockToSupplier(
    requestedInput: unknown,
    entityId: string,
    actor: StockAdjustmentActor,
  ) {
    let input: ReturnType<typeof validateStockSupplierReturnInput>;
    try {
      input = validateStockSupplierReturnInput(requestedInput);
    } catch (error) {
      throw new MaterialsRequestError(error instanceof Error ? error.message : 'Données de retour invalides.', 422);
    }
    assertStockActor(actor);

    try {
      return await prisma.$transaction(async (transaction) => {
        const existing = await transaction.stockSupplierReturn.findUnique({
          where: { entityId_idempotencyKey: { entityId, idempotencyKey: input.idempotencyKey } },
        });
        if (existing) {
          if (!matchesStockSupplierReturn(existing, input)) {
            throw new MaterialsRequestError('Cette clé a déjà été utilisée pour un autre retour.', 409);
          }
          return existing;
        }

        const receipt = await transaction.stockReceipt.findFirst({
          where: { id: input.sourceReceiptId, entityId },
          select: {
            id: true,
            materialId: true,
            warehouseId: true,
            quantity: true,
            returnedQuantity: true,
            purchaseInvoiceId: true,
            material: { select: { unitCode: true } },
            invoiceLineMatch: {
              select: {
                line: {
                  select: {
                    id: true,
                    purchaseInvoiceId: true,
                    quantity: true,
                    unitPrice: true,
                    purchaseInvoice: {
                      select: {
                        vendorId: true,
                        status: true,
                        currencyCode: true,
                        documentCurrencyCode: true,
                        functionalCurrencyCode: true,
                        taxRateId: true,
                        taxRateCode: true,
                        taxRate: true,
                        exchangeRate: true,
                        exchangeRateDate: true,
                        exchangeRateSource: true,
                        exchangeRateImportedAt: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });
        if (!receipt) throw new MaterialsRequestError('Réception d’origine introuvable pour cette société.', 404);
        try {
          input = {
            ...input,
            quantity: validateStockQuantity(input.quantity, 'La quantité retournée', { unitCode: receipt.material.unitCode }),
          };
        } catch (error) {
          throw new MaterialsRequestError(error instanceof Error ? error.message : 'Quantité retournée invalide.', 422);
        }
        if (quantityMilliUnits(receipt.returnedQuantity, 'La quantité déjà retournée')
          + quantityMilliUnits(input.quantity, 'La quantité retournée')
          > quantityMilliUnits(receipt.quantity, 'La quantité reçue')) {
          throw new MaterialsRequestError(
            `La quantité retournée dépasserait le solde de la réception (${receipt.quantity - receipt.returnedQuantity}).`,
            409,
          );
        }

        const material = await transaction.material.findFirst({
          where: { id: receipt.materialId, entityId },
          select: { id: true, sku: true, quantity: true, costPrice: true, unitCode: true },
        });
        if (!material) throw new MaterialsRequestError('Article de la réception indisponible pour cette société.', 409);
        const warehouseStock = await transaction.materialWarehouseStock.findUnique({
          where: { materialId_warehouseId: { materialId: receipt.materialId, warehouseId: receipt.warehouseId } },
          select: { quantity: true },
        });
        if (!warehouseStock
          || quantityMilliUnits(warehouseStock.quantity, 'Le stock du dépôt')
            < quantityMilliUnits(input.quantity, 'La quantité retournée')) {
          throw new MaterialsRequestError('Stock insuffisant dans le dépôt de la réception; aucun retour n’a été enregistré.', 409);
        }

        const context = await transaction.entity.findUnique({
          where: { id: entityId },
          select: {
            country: {
              select: {
                id: true,
                code: true,
                stockAssetAccountCode: true,
                stockAdjustmentAccountCode: true,
                productionWipAccountCode: true,
              },
            },
          },
        });
        if (!context) throw new MaterialsRequestError('Société introuvable.', 404);
        const accountCodes = [context.country.stockAssetAccountCode, context.country.stockAdjustmentAccountCode]
          .filter((code): code is string => Boolean(code));
        const accounts = await transaction.chartOfAccount.findMany({
          where: { countryId: context.country.id, code: { in: accountCodes } },
          select: { code: true, type: true, isPostingAllowed: true },
        });
        const issues = getStockPostingConfigurationIssues(context.country.code, context.country, accounts, 'adjustment');
        if (issues.length > 0) {
          throw new MaterialsRequestError(
            `Configuration comptable stock incomplète pour ${context.country.code} : ${issues.join('; ')}.`,
            422,
          );
        }

        let valueMillimes: number;
        try {
          valueMillimes = stockValueMillimes(input.quantity, material.costPrice);
        } catch (error) {
          throw new MaterialsRequestError(error instanceof Error ? error.message : 'Valeur de retour invalide.', 422);
        }
        const returnDate = new Date();
        await assertAccountingPeriodOpen(
          transaction,
          entityId,
          returnDate,
          (message) => new MaterialsRequestError(message, 409),
        );
        const receiptUpdate = await transaction.stockReceipt.updateMany({
          where: {
            id: receipt.id,
            entityId,
            returnedQuantity: { lte: receipt.quantity - input.quantity },
          },
          data: { returnedQuantity: { increment: input.quantity } },
        });
        if (receiptUpdate.count !== 1) {
          throw new MaterialsRequestError('Le solde de retour a changé; aucun retour n’a été enregistré.', 409);
        }
        const returned = await transaction.stockSupplierReturn.create({
          data: {
            entityId,
            sourceReceiptId: receipt.id,
            materialId: receipt.materialId,
            warehouseId: receipt.warehouseId,
            quantity: input.quantity,
            unitCost: material.costPrice,
            reason: input.reason,
            idempotencyKey: input.idempotencyKey,
            createdByUserId: actor.id,
            createdByUsername: actor.username,
          },
        });
        const invoiceLine = receipt.invoiceLineMatch?.line;
        if (invoiceLine && receipt.purchaseInvoiceId === invoiceLine.purchaseInvoiceId) {
          const linkedReceipts = await transaction.stockReceipt.findMany({
            where: { entityId, invoiceLineMatch: { is: { lineId: invoiceLine.id } } },
            select: { supplierReturns: { select: { quantity: true } } },
          });
          const returnedLineQuantity = linkedReceipts.reduce((total, item) => (
            total + item.supplierReturns.reduce((sum, supplierReturn) => sum + supplierReturn.quantity, 0)
          ), 0);
          const returnedLineMilliUnits = toStockQuantityMilliUnits(returnedLineQuantity);
          const invoiceLineMilliUnits = toStockQuantityMilliUnits(invoiceLine.quantity);
          if (returnedLineMilliUnits === null || invoiceLineMilliUnits === null
            || returnedLineMilliUnits > invoiceLineMilliUnits) {
            throw new MaterialsRequestError('Les retours liés dépasseraient la quantité de la ligne de facture.', 409);
          }
          const priorCreditNotes = await transaction.supplierCreditNote.findMany({
            where: { entityId, sourceInvoiceLineId: invoiceLine.id, status: { not: 'REJECTED' } },
            select: { quantity: true },
          });
          const creditedQuantity = priorCreditNotes.reduce((total, creditNote) => total + creditNote.quantity, 0);
          const creditedQuantityMilliUnits = toStockQuantityMilliUnits(creditedQuantity);
          const newCreditQuantityMilliUnits = toStockQuantityMilliUnits(creditedQuantity + input.quantity);
          if (creditedQuantityMilliUnits === null || newCreditQuantityMilliUnits === null
            || newCreditQuantityMilliUnits > invoiceLineMilliUnits) {
            throw new MaterialsRequestError('Les avoirs demandés dépasseraient la quantité de la ligne de facture.', 409);
          }
          const invoice = invoiceLine.purchaseInvoice;
          const unitPriceMillimes = Math.round(invoiceLine.unitPrice * 1000);
          const subTotalMillimes = Math.round(unitPriceMillimes * input.quantity);
          if (!Number.isSafeInteger(unitPriceMillimes) || !Number.isSafeInteger(subTotalMillimes)
            || unitPriceMillimes < 0 || subTotalMillimes <= 0
            || Math.abs(invoiceLine.unitPrice * 1000 - unitPriceMillimes) > 1e-7) {
            throw new MaterialsRequestError('Le prix de la ligne de facture ne peut pas produire un avoir précis au millime.', 422);
          }
          let documentAmounts: ReturnType<typeof calculatePurchaseInvoiceAmounts>;
          let functionalAmounts: ReturnType<typeof convertInvoiceComponents>;
          try {
            documentAmounts = calculatePurchaseInvoiceAmounts(subTotalMillimes / 1000, invoice.taxRate);
            functionalAmounts = convertInvoiceComponents({
              subTotal: documentAmounts.subTotal,
              taxAmount: documentAmounts.taxAmount,
            }, invoice.exchangeRate ?? 1);
          } catch (error) {
            throw new MaterialsRequestError(
              error instanceof Error ? error.message : 'Le montant de l’avoir fournisseur est invalide.',
              422,
            );
          }
          const creditNote = await transaction.supplierCreditNote.create({
            data: {
              entityId,
              vendorId: invoice.vendorId,
              sourceInvoiceId: invoiceLine.purchaseInvoiceId,
              sourceInvoiceLineId: invoiceLine.id,
              sourceReturnId: returned.id,
              quantity: input.quantity,
              unitPrice: invoiceLine.unitPrice,
              currencyCode: invoice.documentCurrencyCode ?? invoice.currencyCode,
              functionalCurrencyCode: invoice.functionalCurrencyCode ?? invoice.currencyCode,
              documentSubTotal: documentAmounts.subTotal,
              documentTaxAmount: documentAmounts.taxAmount,
              documentTotalAmount: documentAmounts.totalAmount,
              subTotal: functionalAmounts.subTotal,
              taxAmount: functionalAmounts.taxAmount,
              totalAmount: functionalAmounts.totalAmount,
              taxRateId: invoice.taxRateId,
              taxRateCode: invoice.taxRateCode,
              taxRate: invoice.taxRate,
              exchangeRate: invoice.exchangeRate ?? 1,
              exchangeRateDate: invoice.exchangeRateDate,
              exchangeRateSource: invoice.exchangeRateSource,
              exchangeRateImportedAt: invoice.exchangeRateImportedAt,
              status: 'AWAITING_SUPPLIER_DOCUMENT',
              createdByUserId: actor.id,
              createdByUsername: actor.username,
              workflowEvents: {
                create: {
                  action: 'RETURN_LINKED',
                  actorUserId: actor.id,
                  actorUsername: actor.username,
                  note: `Avoir attendu après retour fournisseur ${returned.id}; saisir la référence et la date du document fournisseur.`,
                },
              },
            },
          });
          if (!creditNote.id) {
            throw new MaterialsRequestError('Le brouillon d’avoir fournisseur lié au retour n’a pas été créé.', 500);
          }
        }
        const warehouseUpdate = await consumeAvailableWarehouseStock(
          transaction,
          entityId,
          receipt.materialId,
          receipt.warehouseId,
          input.quantity,
        );
        if (warehouseUpdate !== 1) {
          throw new MaterialsRequestError('Le stock du dépôt a changé; aucun retour n’a été enregistré.', 409);
        }
        const materialUpdate = await consumeAvailableMaterialStock(
          transaction,
          entityId,
          receipt.materialId,
          input.quantity,
        );
        if (materialUpdate !== 1) {
          throw new MaterialsRequestError('Le stock total a changé; aucun retour n’a été enregistré.', 409);
        }
        const journalEntry = await transaction.journalEntry.create({
          data: buildStockJournalEntryData({
            entityId,
            date: returnDate,
            reference: `STK-RET-${returned.id}`,
            description: `Retour fournisseur ${material.sku} — ${input.reason}`,
            lines: [
              {
                accountCode: context.country.stockAdjustmentAccountCode!,
                debit: valueMillimes / 1000,
                credit: 0,
                description: `Retour fournisseur ${material.sku}`,
              },
              {
                accountCode: context.country.stockAssetAccountCode!,
                debit: 0,
                credit: valueMillimes / 1000,
                description: `Sortie de stock ${material.sku}`,
              },
            ],
          }),
        });
        await appendJournalEntryAuditRecord(transaction, journalEntry.id);
        await transaction.stockMovement.create({
          data: {
            entityId,
            materialId: receipt.materialId,
            warehouseId: receipt.warehouseId,
            movementType: 'SUPPLIER_RETURN',
            deltaQuantity: -input.quantity,
            reason: input.reason,
            createdByUserId: actor.id,
            createdByUsername: actor.username,
          },
        });
        return returned;
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        const existing = await prisma.stockSupplierReturn.findUnique({
          where: { entityId_idempotencyKey: { entityId, idempotencyKey: input.idempotencyKey } },
        });
        if (existing) {
          if (!matchesStockSupplierReturn(existing, input)) {
            throw new MaterialsRequestError('Cette clé a déjà été utilisée pour un autre retour.', 409);
          }
          return existing;
        }
      }
      throw error;
    }
  }
}

export default MaterialsService;
