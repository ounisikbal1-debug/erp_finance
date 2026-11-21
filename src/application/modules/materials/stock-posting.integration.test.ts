import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import { MaterialsRequestError } from './errors';
import MaterialsService from './service';
import { ProductionService } from '../production/service';
import AdminLocalizationService from '../admin/service';
import { SalesService } from '../sales/service';

const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
let entityAId = '';
let entityBId = '';
const actor = { id: 'stock-test-user', username: 'stock-tester' };

before(async () => {
  const country = await prisma.countryProfile.create({
    data: {
      code: `IT${suffix}`,
      name: `Integration ${suffix}`,
      currencyCode: 'TND',
      currencySymbol: 'DT',
      stampDuty: 0,
      corporateTax: 0,
      stockAssetAccountCode: 'STOCK',
      stockAdjustmentAccountCode: 'ADJ',
      productionWipAccountCode: 'WIP',
      accounts: {
        create: [
          { code: 'STOCK', description: 'Stock fictif', classNumber: 3, type: 'Asset' },
          { code: 'ADJ', description: 'Ajustement fictif', classNumber: 6, type: 'Expense' },
          { code: 'WIP', description: 'Production fictive', classNumber: 3, type: 'Asset' },
          { code: 'LAB', description: 'Main-d’œuvre fictive', classNumber: 6, type: 'Expense' },
          { code: 'OVERHEAD', description: 'Frais indirects fictifs', classNumber: 6, type: 'Expense' },
        ],
      },
    },
  });
  const entityA = await prisma.entity.create({
    data: { code: `ITA-${suffix}`, name: `Entity A ${suffix}`, countryId: country.id },
  });
  const entityB = await prisma.entity.create({
    data: { code: `ITB-${suffix}`, name: `Entity B ${suffix}`, countryId: country.id },
  });
  const configuredAccounts = await AdminLocalizationService.updateCountryAccounts(`IT${suffix}`, [
    { code: 'STOCK-GROUP', description: 'Groupe stock de test', classNumber: 3, type: 'Asset', isPostingAllowed: false },
    { code: 'CHARGES-GROUP', description: 'Groupe charges de test', classNumber: 6, type: 'Expense', isPostingAllowed: false },
    { code: 'STOCK', description: 'Stock fictif', classNumber: 3, type: 'Asset', parentCode: 'STOCK-GROUP' },
    { code: 'ADJ', description: 'Ajustement fictif', classNumber: 6, type: 'Expense', parentCode: 'CHARGES-GROUP' },
    { code: 'LAB', description: 'Main-d’œuvre fictive', classNumber: 6, type: 'Expense', parentCode: 'CHARGES-GROUP' },
    { code: 'OVERHEAD', description: 'Frais indirects fictifs', classNumber: 6, type: 'Expense', parentCode: 'CHARGES-GROUP' },
    { code: 'WIP', description: 'Production fictive', classNumber: 3, type: 'Asset', parentCode: 'STOCK-GROUP' },
  ]);
  const accountsByCode = new Map(configuredAccounts.map((account) => [account.code, account]));
  assert.equal(accountsByCode.get('STOCK-GROUP')?.isPostingAllowed, false);
  assert.equal(accountsByCode.get('STOCK')?.parentCode, 'STOCK-GROUP');
  assert.equal(accountsByCode.get('WIP')?.parentCode, 'STOCK-GROUP');
  assert.equal(accountsByCode.get('CHARGES-GROUP')?.isPostingAllowed, false);
  assert.equal(accountsByCode.get('ADJ')?.parentCode, 'CHARGES-GROUP');
  await AdminLocalizationService.updateCountryProfile(`IT${suffix}`, {
    productionLaborAccountCode: 'LAB',
    productionOverheadAccountCode: 'OVERHEAD',
  });
  entityAId = entityA.id;
  entityBId = entityB.id;
});

after(async () => {
  await prisma.$disconnect();
});

describe('isolated stock and production accounting', () => {
  it('persists initial stock and adjustments with balanced journal entries', async () => {
    const material = await MaterialsService.createMaterial({
      sku: `RAW-${suffix}`,
      name: 'Matière fictive',
      quantity: 10,
      unitPrice: 4,
      costPrice: 2.5,
      initialStockReason: 'Inventaire initial de test',
    }, entityAId, actor);
    assert.equal(material.quantity, 10);

    const adjusted = await MaterialsService.updateStock(
      material.id,
      entityAId,
      -2,
      'Correction inventaire',
      actor,
    );
    assert.equal(adjusted.quantity, 8);
    const withThreshold = await MaterialsService.setMinimumStock(material.id, entityAId, 6);
    assert.equal(withThreshold.minimumStock, 6);
    await assert.rejects(
      MaterialsService.updateStock(material.id, entityAId, 1, 'x', actor),
      (error: unknown) => error instanceof MaterialsRequestError && error.statusCode === 422,
    );
    await assert.rejects(
      MaterialsService.updateStock(material.id, entityAId, 1, 'Motif valide', { id: '', username: '' }),
      (error: unknown) => error instanceof MaterialsRequestError && error.statusCode === 401,
    );

    const entries = await prisma.journalEntry.findMany({
      where: { entityId: entityAId },
      include: { lines: true },
      orderBy: { createdAt: 'asc' },
    });
    assert.equal(entries.length, 2);
    for (const entry of entries) {
      const debitMillimes = entry.lines.reduce((sum, line) => sum + Math.round(line.debit * 1000), 0);
      const creditMillimes = entry.lines.reduce((sum, line) => sum + Math.round(line.credit * 1000), 0);
      assert.equal(debitMillimes, creditMillimes);
      assert.ok(debitMillimes > 0);
    }
    assert.deepEqual(entries[1].lines.map((line) => [line.accountCode, line.debit, line.credit]), [
      ['ADJ', 5, 0],
      ['STOCK', 0, 5],
    ]);
    const movements = await MaterialsService.listStockMovements(entityAId, material.id);
    assert.deepEqual(movements.map(({ movementType, deltaQuantity, createdByUsername }) => [
      movementType, deltaQuantity, createdByUsername,
    ]).sort(([left], [right]) => String(left).localeCompare(String(right))), [
      ['INITIAL_STOCK', 10, actor.username],
      ['ADJUSTMENT', -2, actor.username],
    ].sort(([left], [right]) => String(left).localeCompare(String(right))));
  });

  it('persists measured stock fractions through adjustments, transfers, and production', async () => {
    const raw = await MaterialsService.createMaterial({
      sku: `FRACTIONAL-RAW-${suffix}`,
      name: 'Matière fractionnaire',
      quantity: 2.375,
      unitCode: 'KG',
      unitPrice: 4,
      costPrice: 1.2,
      initialStockReason: 'Stock fractionnaire de test',
    }, entityAId, actor);
    assert.equal(raw.quantity, 2.375);

    const adjusted = await MaterialsService.updateStock(
      raw.id,
      entityAId,
      0.125,
      'Ajustement fractionnaire',
      actor,
    );
    assert.equal(adjusted.quantity, 2.5);

    const inputWarehouse = await MaterialsService.createWarehouse(
      { code: `FRACTIONAL-RAW-${suffix}`, name: 'Dépôt matières fractionnaires' },
      entityAId,
    );
    const outputWarehouse = await MaterialsService.createWarehouse(
      { code: `FRACTIONAL-FIN-${suffix}`, name: 'Dépôt produits fractionnaires' },
      entityAId,
    );
    await MaterialsService.transferStock({
      materialId: raw.id,
      sourceWarehouseId: null,
      destinationWarehouseId: inputWarehouse.id,
      quantity: 0.375,
      reason: 'Transfert fractionnaire',
      idempotencyKey: `fractional-transfer-${suffix}`,
    }, entityAId, actor);
    await MaterialsService.transferStock({
      materialId: raw.id,
      sourceWarehouseId: null,
      destinationWarehouseId: inputWarehouse.id,
      quantity: 0.5,
      reason: 'Approvisionnement fractionnaire du dépôt',
      idempotencyKey: `fractional-transfer-production-${suffix}`,
    }, entityAId, actor);
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: raw.id } })).quantity, 2.5);
    assert.equal((await prisma.materialWarehouseStock.findUniqueOrThrow({
      where: { materialId_warehouseId: { materialId: raw.id, warehouseId: inputWarehouse.id } },
    })).quantity, 0.875);

    const finished = await MaterialsService.createMaterial({
      sku: `FRACTIONAL-FIN-${suffix}`,
      name: 'Produit fractionnaire',
      unitCode: 'KG',
      unitPrice: 8,
      costPrice: 0,
    }, entityAId, actor);
    const order = await ProductionService.createDraftOrder({
      orderNumber: `FRACTIONAL-OF-${suffix}`,
      outputMaterialId: finished.id,
      outputQuantity: 0.75,
      warehouseId: outputWarehouse.id,
      consumptions: [{ materialId: raw.id, quantity: 0.5, warehouseId: inputWarehouse.id }],
    }, entityAId);
    const posted = await ProductionService.postOrder(order.id, entityAId);
    assert.equal(posted?.status, 'POSTED');
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: raw.id } })).quantity, 2);
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: finished.id } })).quantity, 0.75);
    assert.equal((await prisma.materialWarehouseStock.findUniqueOrThrow({
      where: { materialId_warehouseId: { materialId: raw.id, warehouseId: inputWarehouse.id } },
    })).quantity, 0.375);
    assert.equal((await prisma.materialWarehouseStock.findUniqueOrThrow({
      where: { materialId_warehouseId: { materialId: finished.id, warehouseId: outputWarehouse.id } },
    })).quantity, 0.75);
    assert.equal((await prisma.productionOrderMaterialLine.findFirstOrThrow({
      where: { orderId: order.id },
    })).quantity, 0.5);
  });

  it('keeps stock isolated between entities', async () => {
    const material = await prisma.material.findFirstOrThrow({
      where: { entityId: entityAId, sku: `RAW-${suffix}` },
    });
    await assert.rejects(
      MaterialsService.updateStock(material.id, entityBId, 1, 'Correction inventaire', actor),
      (error: unknown) => error instanceof MaterialsRequestError && error.statusCode === 404,
    );
    assert.equal(await prisma.material.count({ where: { entityId: entityBId } }), 0);
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: material.id } })).quantity, 8);
  });

  it('rolls back quantity changes when journal persistence fails', async () => {
    const material = await prisma.material.findFirstOrThrow({
      where: { entityId: entityAId, sku: `RAW-${suffix}` },
    });
    const entriesBefore = await prisma.journalEntry.count({ where: { entityId: entityAId } });
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER "reject_stock_journal" BEFORE INSERT ON "JournalEntry" WHEN NEW."reference" LIKE 'STOCK-%' BEGIN SELECT RAISE(ABORT, 'forced test failure'); END`,
    );
    try {
      await assert.rejects(MaterialsService.updateStock(
        material.id,
        entityAId,
        1,
        'Correction inventaire',
        actor,
      ));
      assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: material.id } })).quantity, 8);
      assert.equal(await prisma.journalEntry.count({ where: { entityId: entityAId } }), entriesBefore);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER "reject_stock_journal"');
    }
  });

  it('moves stock between entity-scoped warehouses without changing total stock or accounting', async () => {
    const material = await MaterialsService.createMaterial({
      sku: `TRANSFER-${suffix}`,
      name: 'Article de transfert',
      quantity: 8,
      unitPrice: 5,
      costPrice: 2,
      initialStockReason: 'Stock fictif pour transfert',
    }, entityAId, actor);
    const source = await MaterialsService.createWarehouse({ code: `A-${suffix}`, name: 'Dépôt A' }, entityAId);
    const destination = await MaterialsService.createWarehouse({ code: `B-${suffix}`, name: 'Dépôt B' }, entityAId);
    const otherEntityWarehouse = await MaterialsService.createWarehouse(
      { code: `X-${suffix}`, name: 'Dépôt autre société' },
      entityBId,
    );
    const journalsBefore = await prisma.journalEntry.count({ where: { entityId: entityAId } });
    const firstTransferInput = {
      materialId: material.id,
      sourceWarehouseId: null,
      destinationWarehouseId: destination.id,
      quantity: 3,
      reason: 'Affectation au dépôt B',
      idempotencyKey: `transfer-${suffix}-1`,
    };
    const firstTransfer = await MaterialsService.transferStock(firstTransferInput, entityAId, actor);
    const replay = await MaterialsService.transferStock(firstTransferInput, entityAId, actor);
    assert.equal(replay.id, firstTransfer.id);
    assert.equal(await prisma.stockMovement.count({ where: { transferId: firstTransfer.id } }), 2);
    await assert.rejects(
      MaterialsService.transferStock({ ...firstTransferInput, quantity: 4 }, entityAId, actor),
      (error: unknown) => error instanceof MaterialsRequestError && error.statusCode === 409,
    );

    await MaterialsService.transferStock({
      ...firstTransferInput,
      sourceWarehouseId: destination.id,
      destinationWarehouseId: source.id,
      quantity: 2,
      reason: 'Rééquilibrage entre dépôts',
      idempotencyKey: `transfer-${suffix}-2`,
    }, entityAId, actor);
    await MaterialsService.transferStock({
      ...firstTransferInput,
      sourceWarehouseId: source.id,
      destinationWarehouseId: null,
      quantity: 1,
      reason: 'Retour au stock non affecté',
      idempotencyKey: `transfer-${suffix}-3`,
    }, entityAId, actor);
    await MaterialsService.transferStock({
      ...firstTransferInput,
      sourceWarehouseId: null,
      destinationWarehouseId: source.id,
      quantity: 5,
      reason: 'Approvisionnement du dépôt de production',
      idempotencyKey: `transfer-${suffix}-production`,
    }, entityAId, actor);
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: material.id } })).quantity, 8);
    assert.equal((await prisma.materialWarehouseStock.findUniqueOrThrow({
      where: { materialId_warehouseId: { materialId: material.id, warehouseId: destination.id } },
    })).quantity, 1);
    assert.equal((await prisma.materialWarehouseStock.findUniqueOrThrow({
      where: { materialId_warehouseId: { materialId: material.id, warehouseId: source.id } },
    })).quantity, 6);
    assert.equal(await prisma.journalEntry.count({ where: { entityId: entityAId } }), journalsBefore);
    const transferMovements = await MaterialsService.listStockMovements(entityAId, material.id);
    assert.equal(transferMovements.filter(({ movementType }) => movementType.startsWith('TRANSFER_')).length, 8);
    await assert.rejects(
      MaterialsService.transferStock({
        ...firstTransferInput,
        sourceWarehouseId: destination.id,
        destinationWarehouseId: source.id,
        quantity: 2,
        idempotencyKey: `transfer-${suffix}-4`,
      }, entityAId, actor),
      (error: unknown) => error instanceof MaterialsRequestError && error.statusCode === 409,
    );
    await assert.rejects(
      MaterialsService.transferStock({
        ...firstTransferInput,
        destinationWarehouseId: otherEntityWarehouse.id,
        idempotencyKey: `transfer-${suffix}-5`,
      }, entityAId, actor),
      (error: unknown) => error instanceof MaterialsRequestError && error.statusCode === 404,
    );
    const finished = await MaterialsService.createMaterial({
      sku: `TRANSFER-FIN-${suffix}`,
      name: 'Produit fini de test',
      unitPrice: 10,
      costPrice: 0,
    }, entityAId, actor);
    const productionOrder = await ProductionService.createDraftOrder({
      orderNumber: `TRANSFER-OF-${suffix}`,
      outputMaterialId: finished.id,
      outputQuantity: 1,
      warehouseId: source.id,
      consumptions: [{ materialId: material.id, quantity: 7 }],
    }, entityAId);
    await assert.rejects(ProductionService.postOrder(productionOrder.id, entityAId), /Stock insuffisant/);
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: material.id } })).quantity, 8);
    assert.equal((await MaterialsService.listStockMovements(entityBId)).length, 0);
  });

  it('posts production costs, updates output valuation, and rolls back failed journals', async () => {
    const raw = await MaterialsService.createMaterial({
      sku: `PROD-RAW-${suffix}`,
      name: 'Composant fictif',
      quantity: 8,
      unitCode: 'KG',
      unitPrice: 4,
      costPrice: 2.5,
      initialStockReason: 'Stock initial composant',
    }, entityAId, actor);
    const finished = await MaterialsService.createMaterial({
      sku: `FIN-${suffix}`,
      name: 'Produit fictif',
      unitCode: 'KG',
      unitPrice: 12,
      costPrice: 0,
    }, entityAId, actor);
    const warehouse = await MaterialsService.createWarehouse(
      { code: `PROD-${suffix}`, name: 'Dépôt de production' },
      entityAId,
    );
    await MaterialsService.transferStock({
      materialId: raw.id,
      sourceWarehouseId: null,
      destinationWarehouseId: warehouse.id,
      quantity: 4,
      reason: 'Approvisionnement du dépôt',
      idempotencyKey: `production-transfer-${suffix}`,
    }, entityAId, actor);
    const order = await ProductionService.createDraftOrder({
      orderNumber: `OF-${suffix}`,
      outputMaterialId: finished.id,
      outputQuantity: 2,
      warehouseId: warehouse.id,
      laborCost: 2,
      overheadCost: 3,
      scrapQuantity: 0.5,
      scrapReason: 'Défaut qualité sur le lot',
      consumptions: [{ materialId: raw.id, quantity: 4 }],
    }, entityAId);
    const posted = await ProductionService.postOrder(order.id, entityAId);
    assert.equal(posted?.status, 'POSTED');
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: raw.id } })).quantity, 4);
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: finished.id } })).quantity, 2);
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: finished.id } })).costPrice, 7.5);

    const productionEntry = await prisma.journalEntry.findFirstOrThrow({
      where: { entityId: entityAId, reference: `OF-OF-${suffix}` },
      include: { lines: true },
    });
    assert.equal(productionEntry.lines.length, 6);
    assert.equal(productionEntry.lines.reduce((sum, line) => sum + line.debit, 0), 30);
    assert.equal(productionEntry.lines.reduce((sum, line) => sum + line.credit, 0), 30);
    assert.deepEqual(productionEntry.lines.map((line) => [line.accountCode, line.debit, line.credit]), [
      ['WIP', 15, 0],
      ['STOCK', 0, 10],
      ['LAB', 0, 2],
      ['OVERHEAD', 0, 3],
      ['STOCK', 15, 0],
      ['WIP', 0, 15],
    ]);

    const rawForRollback = await MaterialsService.createMaterial({
      sku: `ROLLBACK-RAW-${suffix}`,
      name: 'Composant rollback fictif',
      quantity: 4,
      unitPrice: 4,
      costPrice: 3,
      initialStockReason: 'Stock initial rollback',
    }, entityAId, actor);
    const outputForRollback = await MaterialsService.createMaterial({
      sku: `ROLLBACK-FIN-${suffix}`,
      name: 'Produit rollback fictif',
      unitPrice: 12,
      costPrice: 0,
    }, entityAId, actor);
    await MaterialsService.transferStock({
      materialId: rawForRollback.id,
      sourceWarehouseId: null,
      destinationWarehouseId: warehouse.id,
      quantity: 2,
      reason: 'Approvisionnement rollback',
      idempotencyKey: `production-transfer-rollback-${suffix}`,
    }, entityAId, actor);
    const rollbackOrder = await ProductionService.createDraftOrder({
      orderNumber: `OF-ROLLBACK-${suffix}`,
      outputMaterialId: outputForRollback.id,
      outputQuantity: 1,
      warehouseId: warehouse.id,
      consumptions: [{ materialId: rawForRollback.id, quantity: 2 }],
    }, entityAId);
    const entriesBefore = await prisma.journalEntry.count({ where: { entityId: entityAId } });
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER "reject_production_journal" BEFORE INSERT ON "JournalEntry" WHEN NEW."reference" LIKE 'OF-%' BEGIN SELECT RAISE(ABORT, 'forced test failure'); END`,
    );
    try {
      await assert.rejects(ProductionService.postOrder(rollbackOrder.id, entityAId));
      assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: rawForRollback.id } })).quantity, 4);
      assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: outputForRollback.id } })).quantity, 0);
      assert.equal((await prisma.productionOrder.findUniqueOrThrow({ where: { id: rollbackOrder.id } })).status, 'DRAFT');
      assert.equal(await prisma.journalEntry.count({ where: { entityId: entityAId } }), entriesBefore);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER "reject_production_journal"');
    }
  });

  it('fulfills sales orders through reserved stock dispatch and releases reservations on cancellation', async () => {
    const material = await MaterialsService.createMaterial({
      sku: `SALES-${suffix}`,
      name: 'Article de commande client',
      quantity: 8,
      unitPrice: 15,
      costPrice: 5,
      initialStockReason: 'Stock de test commande client',
    }, entityAId, actor);
    const warehouse = await MaterialsService.createWarehouse(
      { code: `SALES-${suffix}`, name: 'Dépôt commandes clients' },
      entityAId,
    );
    await MaterialsService.transferStock({
      materialId: material.id,
      sourceWarehouseId: null,
      destinationWarehouseId: warehouse.id,
      quantity: 8,
      reason: 'Affectation du stock au dépôt de préparation',
      idempotencyKey: `sales-transfer-${suffix}`,
    }, entityAId, actor);
    const customer = await prisma.customer.create({
      data: { code: `SALES-${suffix}`, name: 'Client de test', entityId: entityAId },
    });

    const order = await SalesService.createSalesOrder({
      customerId: customer.id,
      lines: [{ materialId: material.id, quantity: 3, unitPrice: 15 }],
    }, entityAId, actor);
    assert.equal(order.status, 'OPEN');
    assert.equal(order.totalAmount, 45);

    const pickInput = {
      lines: [{ salesOrderLineId: order.lines[0].id, warehouseId: warehouse.id }],
    };
    const pick = await SalesService.createSalesOrderStockPick(order.id, pickInput, entityAId, actor);
    const retriedPick = await SalesService.createSalesOrderStockPick(order.id, pickInput, entityAId, actor);
    assert.equal(retriedPick.id, pick.id);
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: material.id } })).quantity, 8);
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: material.id } })).reservedQuantity, 3);
    assert.equal((await prisma.materialWarehouseStock.findUniqueOrThrow({
      where: { materialId_warehouseId: { materialId: material.id, warehouseId: warehouse.id } },
    })).reservedQuantity, 3);

    const dispatch = await SalesService.dispatchSalesOrder(order.id, entityAId, actor);
    const retriedDispatch = await SalesService.dispatchSalesOrder(order.id, entityAId, actor);
    assert.equal(retriedDispatch.id, dispatch.id);
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: material.id } })).quantity, 5);
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: material.id } })).reservedQuantity, 0);
    assert.equal((await prisma.materialWarehouseStock.findUniqueOrThrow({
      where: { materialId_warehouseId: { materialId: material.id, warehouseId: warehouse.id } },
    })).quantity, 5);
    assert.equal(await prisma.stockMovement.count({
      where: { entityId: entityAId, materialId: material.id, movementType: 'DISPATCH' },
    }), 1);
    assert.equal((await prisma.salesOrder.findUniqueOrThrow({ where: { id: order.id } })).status, 'DISPATCHED');
    await assert.rejects(SalesService.cancelSalesOrder(order.id, entityAId, actor), /expédiée ne peut pas être annulée/);

    const cancellableOrder = await SalesService.createSalesOrder({
      customerId: customer.id,
      lines: [{ materialId: material.id, quantity: 2, unitPrice: 15 }],
    }, entityAId, actor);
    await SalesService.createSalesOrderStockPick(cancellableOrder.id, {
      lines: [{ salesOrderLineId: cancellableOrder.lines[0].id, warehouseId: warehouse.id }],
    }, entityAId, actor);
    const cancelledOrder = await SalesService.cancelSalesOrder(cancellableOrder.id, entityAId, actor);
    assert.equal(cancelledOrder?.status, 'CANCELLED');
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: material.id } })).quantity, 5);
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: material.id } })).reservedQuantity, 0);
    assert.equal((await prisma.materialWarehouseStock.findUniqueOrThrow({
      where: { materialId_warehouseId: { materialId: material.id, warehouseId: warehouse.id } },
    })).quantity, 5);
    assert.equal(await prisma.stockMovement.count({
      where: { entityId: entityAId, materialId: material.id, movementType: 'DISPATCH' },
    }), 1);
  });
});
