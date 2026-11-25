import prisma from '../../../core/models/prisma';
import type { Prisma } from '@prisma/client';
import {
  buildStockJournalEntryData,
  getStockPostingConfigurationIssues,
  stockInventoryValueMillimes,
  stockValueMillimes,
} from '../materials/stock-accounting';
import { toStockQuantityMilliUnits, validateStockQuantity } from '../materials/quantity';
import { assertAccountingPeriodOpen } from '../finance/posting-period';
import {
  consumeAvailableMaterialStock,
  consumeAvailableWarehouseStock,
  consumeUnallocatedMaterialStock,
} from '../materials/stock-reservations';
import { ProductionRequestError } from './errors';
import { MAX_PRODUCTION_STOCK_QUANTITY, validateProductionOrderInput } from './validation';
import { appendJournalEntryAuditRecord } from '../finance/audit-chain';

const orderInclude = {
  outputMaterial: { select: { id: true, sku: true, name: true, unitCode: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  consumptions: {
    include: {
      material: { select: { id: true, sku: true, name: true, unitCode: true } },
      warehouse: { select: { id: true, code: true, name: true } },
    },
    orderBy: { materialId: 'asc' },
  },
} satisfies Prisma.ProductionOrderInclude;

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

export class ProductionService {
  static async getModuleData(entityId: string) {
    const [materials, orders, warehouses, entity] = await Promise.all([
      prisma.material.findMany({
        where: { entityId },
        select: { id: true, sku: true, name: true, quantity: true, unitCode: true, unitPrice: true, costPrice: true },
        orderBy: { sku: 'asc' },
      }),
      prisma.productionOrder.findMany({
        where: { entityId },
        include: orderInclude,
        orderBy: [{ createdAt: 'desc' }, { orderNumber: 'asc' }],
      }),
      prisma.warehouse.findMany({
        where: { entityId },
        include: {
          stocks: {
            where: { entityId },
            include: { material: { select: { id: true, sku: true, name: true, unitCode: true } } },
            orderBy: { material: { sku: 'asc' } },
          },
        },
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
      }),
      prisma.entity.findUnique({
        where: { id: entityId },
        select: { country: { select: { currencyCode: true } } },
      }),
    ]);
    if (!entity) throw new ProductionRequestError('Société introuvable.', 404);
    return { materials, orders, warehouses, currencyCode: entity.country.currencyCode };
  }

  static async createDraftOrder(value: unknown, entityId: string) {
    let input: ReturnType<typeof validateProductionOrderInput>;
    try {
      input = validateProductionOrderInput(value);
    } catch (error) {
      throw new ProductionRequestError(error instanceof Error ? error.message : 'Données de production invalides');
    }

    const materialIds = [input.outputMaterialId, ...input.consumptions.map((line) => line.materialId)];
    const materials = await prisma.material.findMany({
      where: { entityId, id: { in: materialIds } },
      select: { id: true, unitCode: true },
    });
    if (materials.length !== materialIds.length) {
      throw new ProductionRequestError('Un ou plusieurs articles ne sont pas disponibles pour cette société.');
    }
    const materialUnits = new Map(materials.map((material) => [material.id, material.unitCode]));
    try {
      input = {
        ...input,
        outputQuantity: validateStockQuantity(
          input.outputQuantity,
          'La quantité produite',
          { unitCode: materialUnits.get(input.outputMaterialId) },
        ),
        consumptions: input.consumptions.map((line) => ({
          ...line,
          quantity: validateStockQuantity(
            line.quantity,
            'La quantité consommée',
            { unitCode: materialUnits.get(line.materialId) },
          ),
        })),
      };
    } catch (error) {
      throw new ProductionRequestError(error instanceof Error ? error.message : 'Quantité de production invalide.', 422);
    }
    const warehouseIds = [...new Set([
      input.warehouseId,
      ...input.consumptions.map((line) => line.warehouseId).filter((id): id is string => Boolean(id)),
    ])];
    const warehouses = await prisma.warehouse.findMany({
      where: { id: { in: warehouseIds }, entityId },
      select: { id: true },
    });
    if (warehouses.length !== warehouseIds.length) {
      throw new ProductionRequestError('Un dépôt de sortie ou de consommation est introuvable pour cette société.', 404);
    }

    try {
      return await prisma.productionOrder.create({
        data: {
          entityId,
          orderNumber: input.orderNumber,
          description: input.description,
          outputMaterialId: input.outputMaterialId,
          warehouseId: input.warehouseId,
          outputQuantity: input.outputQuantity,
          laborCost: input.laborCost,
          overheadCost: input.overheadCost,
          scrapQuantity: input.scrapQuantity,
          scrapReason: input.scrapReason,
          status: 'DRAFT',
          consumptions: {
            create: input.consumptions.map((line) => ({
              ...line,
              warehouseId: line.warehouseId ?? input.warehouseId,
            })),
          },
        },
        include: orderInclude,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ProductionRequestError('Ce numéro d’ordre existe déjà pour cette société.', 409);
      }
      throw error;
    }
  }

  static async postOrder(
    orderId: string,
    entityId: string,
    actor?: { id: string; username: string },
  ) {
    return prisma.$transaction(async (transaction) => {
      const order = await transaction.productionOrder.findFirst({
        where: { id: orderId, entityId },
        include: { outputMaterial: true, consumptions: true },
      });
      if (!order) throw new ProductionRequestError('Ordre de fabrication introuvable.', 404);
      if (order.status !== 'DRAFT') {
        throw new ProductionRequestError('Seul un ordre brouillon peut être confirmé.', 409);
      }
      if (order.warehouseId) {
        const warehouse = await transaction.warehouse.findFirst({
          where: { id: order.warehouseId, entityId },
          select: { id: true },
        });
        if (!warehouse) throw new ProductionRequestError('Le dépôt de l’ordre est indisponible pour cette société.', 409);
      }
      const inputWarehouseIds = [...new Set(order.consumptions
        .map((line) => line.warehouseId ?? order.warehouseId)
        .filter((warehouseId): warehouseId is string => Boolean(warehouseId)))];
      if (inputWarehouseIds.length > 0) {
        const warehouses = await transaction.warehouse.findMany({
          where: { id: { in: inputWarehouseIds }, entityId },
          select: { id: true },
        });
        if (warehouses.length !== inputWarehouseIds.length) {
          throw new ProductionRequestError('Un dépôt de consommation est indisponible pour cette société.', 409);
        }
      }

      const country = await transaction.entity.findUnique({
        where: { id: entityId },
        select: {
          country: {
            select: {
              id: true,
              code: true,
              stockAssetAccountCode: true,
              stockAdjustmentAccountCode: true,
              productionWipAccountCode: true,
              productionLaborAccountCode: true,
              productionOverheadAccountCode: true,
            },
          },
        },
      });
      if (!country) throw new ProductionRequestError('Société introuvable.', 404);
      const laborCostMillimes = Math.round(order.laborCost * 1000);
      const overheadCostMillimes = Math.round(order.overheadCost * 1000);
      if (!Number.isSafeInteger(laborCostMillimes) || !Number.isSafeInteger(overheadCostMillimes)) {
        throw new ProductionRequestError('Les coûts de production dépassent la précision comptable.', 422);
      }
      const accountCodes = [
        country.country.stockAssetAccountCode,
        country.country.productionWipAccountCode,
        ...(laborCostMillimes > 0 ? [country.country.productionLaborAccountCode] : []),
        ...(overheadCostMillimes > 0 ? [country.country.productionOverheadAccountCode] : []),
      ]
        .filter((code): code is string => Boolean(code));
      const accounts = await transaction.chartOfAccount.findMany({
        where: { countryId: country.country.id, code: { in: accountCodes } },
        select: { code: true, type: true, isPostingAllowed: true },
      });
      const issues = getStockPostingConfigurationIssues(
        country.country.code,
        country.country,
        accounts,
        'production',
        { labor: laborCostMillimes > 0, overhead: overheadCostMillimes > 0 },
      );
      if (issues.length > 0) {
        throw new ProductionRequestError(
          `Configuration comptable production incomplète pour ${country.country.code} : ${issues.join('; ')}.`,
          422,
        );
      }

      const inputMaterials = await transaction.material.findMany({
        where: { entityId, id: { in: order.consumptions.map(({ materialId }) => materialId) } },
        select: { id: true, costPrice: true, unitCode: true },
      });
      const inputCosts = new Map(inputMaterials.map((material) => [material.id, material.costPrice]));
      const inputUnits = new Map(inputMaterials.map((material) => [material.id, material.unitCode]));
      try {
        validateStockQuantity(order.outputQuantity, 'La quantité produite', { unitCode: order.outputMaterial.unitCode });
        validateStockQuantity(order.scrapQuantity, 'La quantité rebutée', {
          allowZero: true,
          unitCode: order.outputMaterial.unitCode,
        });
        for (const line of order.consumptions) {
          validateStockQuantity(line.quantity, 'La quantité consommée', { unitCode: inputUnits.get(line.materialId) });
        }
      } catch (error) {
        throw new ProductionRequestError(error instanceof Error ? error.message : 'Quantité de production invalide.', 409);
      }
      let totalInputValueMillimes = 0;
      try {
        for (const line of order.consumptions) {
          const unitCost = inputCosts.get(line.materialId);
          if (unitCost === undefined) {
            throw new ProductionRequestError('Une matière consommée est indisponible pour cette société.', 409);
          }
          totalInputValueMillimes += stockValueMillimes(line.quantity, unitCost);
          if (!Number.isSafeInteger(totalInputValueMillimes)) {
            throw new Error('La valeur totale des consommations dépasse la précision comptable.');
          }

        }
      } catch (error) {
        if (error instanceof ProductionRequestError) throw error;
        throw new ProductionRequestError(error instanceof Error ? error.message : 'Coût de production invalide.', 422);
      }

      const totalProductionCostMillimes = totalInputValueMillimes + laborCostMillimes + overheadCostMillimes;
      if (!Number.isSafeInteger(totalProductionCostMillimes)) {
        throw new ProductionRequestError('Le coût total de production dépasse la précision comptable.', 422);
      }
      let existingOutputValueMillimes: number;
      try {
        existingOutputValueMillimes = stockInventoryValueMillimes(
          order.outputMaterial.quantity,
          order.outputMaterial.costPrice,
        );
      } catch (error) {
        throw new ProductionRequestError(error instanceof Error ? error.message : 'Valorisation du produit invalide.', 422);
      }
      const outputQuantity = Math.round((order.outputMaterial.quantity + order.outputQuantity) * 1000) / 1000;
      const totalOutputValueMillimes = existingOutputValueMillimes + totalProductionCostMillimes;
      if (!Number.isSafeInteger(totalOutputValueMillimes) || toStockQuantityMilliUnits(outputQuantity) === null) {
        throw new ProductionRequestError('La valeur ou la quantité produite dépasse les limites prises en charge.', 422);
      }
      const outputUnitCost = totalOutputValueMillimes / outputQuantity / 1000;

      const postingDate = new Date();
      await assertAccountingPeriodOpen(
        transaction,
        entityId,
        postingDate,
        (message) => new ProductionRequestError(message, 409),
      );
      const claimed = await transaction.productionOrder.updateMany({
        where: { id: orderId, entityId, status: 'DRAFT' },
        data: { status: 'POSTED', postedAt: postingDate },
      });
      if (claimed.count !== 1) {
        throw new ProductionRequestError('Cet ordre a déjà été confirmé.', 409);
      }

      for (const line of order.consumptions) {
        const inputWarehouseId = line.warehouseId ?? order.warehouseId;
        const allocated = await transaction.materialWarehouseStock.aggregate({
          where: { entityId, materialId: line.materialId },
          _sum: { quantity: true },
        });
        const minimumCompanyQuantity = inputWarehouseId
          ? line.quantity
          : (allocated._sum.quantity ?? 0) + line.quantity;
        const updated = inputWarehouseId
          ? await consumeAvailableMaterialStock(transaction, entityId, line.materialId, line.quantity)
          : await consumeUnallocatedMaterialStock(
            transaction,
            entityId,
            line.materialId,
            minimumCompanyQuantity,
            line.quantity,
          );
        if (updated !== 1) {
          throw new ProductionRequestError('Stock insuffisant ou matière indisponible; aucun mouvement n’a été enregistré.', 409);
        }
        if (inputWarehouseId) {
          const warehouseStock = await consumeAvailableWarehouseStock(
            transaction,
            entityId,
            line.materialId,
            inputWarehouseId,
            line.quantity,
          );
          if (warehouseStock !== 1) {
            throw new ProductionRequestError('Stock insuffisant dans le dépôt de production; aucun mouvement n’a été enregistré.', 409);
          }
        }
        await transaction.stockMovement.create({
          data: {
            entityId,
            materialId: line.materialId,
            warehouseId: inputWarehouseId,
            movementType: 'PRODUCTION_CONSUMPTION',
            deltaQuantity: -line.quantity,
            reason: `Consommation de l’ordre de fabrication ${order.orderNumber}`,
            createdByUserId: actor?.id ?? 'production-service',
            createdByUsername: actor?.username ?? 'Production',
          },
        });
      }

      const outputUpdated = await transaction.material.updateMany({
        where: {
          id: order.outputMaterialId,
          entityId,
          quantity: { lte: MAX_PRODUCTION_STOCK_QUANTITY - order.outputQuantity },
        },
        data: {
          quantity: { increment: order.outputQuantity },
          costPrice: outputUnitCost,
        },
      });
      if (outputUpdated.count !== 1) {
        throw new ProductionRequestError('Stock produit hors limites ou article indisponible; aucun mouvement n’a été enregistré.', 409);
      }
      if (order.warehouseId) {
        const existingWarehouseStock = await transaction.materialWarehouseStock.findUnique({
          where: {
            materialId_warehouseId: {
              materialId: order.outputMaterialId,
              warehouseId: order.warehouseId,
            },
          },
          select: { quantity: true },
        });
        if ((existingWarehouseStock?.quantity ?? 0) > MAX_PRODUCTION_STOCK_QUANTITY - order.outputQuantity) {
          throw new ProductionRequestError('Stock produit du dépôt hors limites; aucun mouvement n’a été enregistré.', 409);
        }
        await transaction.materialWarehouseStock.upsert({
          where: {
            materialId_warehouseId: {
              materialId: order.outputMaterialId,
              warehouseId: order.warehouseId,
            },
          },
          create: {
            entityId,
            materialId: order.outputMaterialId,
            warehouseId: order.warehouseId,
            quantity: order.outputQuantity,
          },
          update: { quantity: { increment: order.outputQuantity } },
        });
      }
      await transaction.stockMovement.create({
        data: {
          entityId,
          materialId: order.outputMaterialId,
          warehouseId: order.warehouseId,
          movementType: 'PRODUCTION_OUTPUT',
          deltaQuantity: order.outputQuantity,
          reason: `Production de l’ordre de fabrication ${order.orderNumber}`,
          createdByUserId: actor?.id ?? 'production-service',
          createdByUsername: actor?.username ?? 'Production',
        },
      });

      const amount = totalProductionCostMillimes / 1000;
      const inputAmount = totalInputValueMillimes / 1000;
      const journalLines = [
        {
          accountCode: country.country.productionWipAccountCode!,
          debit: amount,
          credit: 0,
          description: `Coût complet — ${order.orderNumber}`,
        },
        {
          accountCode: country.country.stockAssetAccountCode!,
          debit: 0,
          credit: inputAmount,
          description: `Sortie matières — ${order.orderNumber}`,
        },
        ...(laborCostMillimes > 0
          ? [{
            accountCode: country.country.productionLaborAccountCode!,
            debit: 0,
            credit: laborCostMillimes / 1000,
            description: `Main-d’Å“uvre incorporée — ${order.orderNumber}`,
          }]
          : []),
        ...(overheadCostMillimes > 0
          ? [{
            accountCode: country.country.productionOverheadAccountCode!,
            debit: 0,
            credit: overheadCostMillimes / 1000,
            description: `Frais indirects incorporés — ${order.orderNumber}`,
          }]
          : []),
        {
          accountCode: country.country.stockAssetAccountCode!,
          debit: amount,
          credit: 0,
          description: `Entrée produit fini — ${order.orderNumber}${order.scrapQuantity > 0 ? ` (rebuts : ${order.scrapQuantity})` : ''}`,
        },
        {
          accountCode: country.country.productionWipAccountCode!,
          debit: 0,
          credit: amount,
          description: `Transfert coût produit fini — ${order.orderNumber}`,
        },
      ];
      const journalEntry = await transaction.journalEntry.create({
        data: buildStockJournalEntryData({
          entityId,
          date: postingDate,
          reference: `OF-${order.orderNumber}`,
          description: `Production de l’ordre ${order.orderNumber}`,
          lines: journalLines,
        }),
      });
      await appendJournalEntryAuditRecord(transaction, journalEntry.id);

      return transaction.productionOrder.findFirst({
        where: { id: orderId, entityId },
        include: orderInclude,
      });
    });
  }

  static async cancelDraftOrder(
    orderId: string,
    entityId: string,
    reason: unknown,
    actor?: { id: string; username: string },
  ) {
    if (!actor || typeof actor.id !== 'string' || !actor.id.trim()
      || typeof actor.username !== 'string' || !actor.username.trim()) {
      throw new ProductionRequestError('Un utilisateur authentifié est requis pour annuler un ordre.', 401);
    }
    if (typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 500) {
      throw new ProductionRequestError('Le motif d’annulation doit contenir de 5 à 500 caractères.', 400);
    }
    const order = await prisma.productionOrder.findFirst({
      where: { id: orderId, entityId },
      select: { id: true, status: true },
    });
    if (!order) throw new ProductionRequestError('Ordre de fabrication introuvable.', 404);
    if (order.status !== 'DRAFT') {
      throw new ProductionRequestError('Seul un ordre brouillon sans mouvement peut être annulé.', 409);
    }
    const updated = await prisma.productionOrder.updateMany({
      where: { id: orderId, entityId, status: 'DRAFT' },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledByUserId: actor.id,
        cancelledByUsername: actor.username,
        cancellationReason: reason.trim(),
      },
    });
    if (updated.count !== 1) {
      throw new ProductionRequestError('L’ordre a changé d’état; aucune annulation n’a été enregistrée.', 409);
    }
    return prisma.productionOrder.findFirst({
      where: { id: orderId, entityId },
      include: orderInclude,
    });
  }
}

export default ProductionService;
