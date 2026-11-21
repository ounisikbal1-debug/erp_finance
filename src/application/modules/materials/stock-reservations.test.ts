import assert from 'node:assert/strict';
import sqlite3 from 'sqlite3';
import { describe, it } from 'node:test';
import {
  consumeAvailableMaterialStock,
  consumeAvailableWarehouseStock,
  consumeReservedMaterialStock,
  consumeReservedWarehouseStock,
  releaseMaterialReservation,
  releaseWarehouseReservation,
  reserveMaterialStock,
  reserveWarehouseStock,
  type StockReservationTransaction,
} from './stock-reservations';

function execute(database: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    database.exec(sql, (error) => error ? reject(error) : resolve());
  });
}

function executeRaw(database: sqlite3.Database) {
  return (strings: TemplateStringsArray, ...values: unknown[]): Promise<number> => new Promise((resolve, reject) => {
    database.run(strings.join('?'), values, function onComplete(error) {
      if (error) reject(error);
      else resolve(this.changes);
    });
  });
}

function query(database: sqlite3.Database, sql: string): Promise<Record<string, number>[]> {
  return new Promise((resolve, reject) => {
    database.all(sql, (error, rows) => error ? reject(error) : resolve(rows as Record<string, number>[]));
  });
}

describe('stock reservation statements', () => {
  it('uses atomic available-quantity guards when concurrent picks reserve the same stock', async () => {
    const database = new sqlite3.Database(':memory:');
    const transaction = { $executeRaw: executeRaw(database) } as unknown as StockReservationTransaction;
    try {
      await execute(database, `
        CREATE TABLE "Material" (
          "id" TEXT PRIMARY KEY, "entityId" TEXT NOT NULL, "quantity" REAL NOT NULL,
          "reservedQuantity" REAL NOT NULL
        );
        CREATE TABLE "MaterialWarehouseStock" (
          "entityId" TEXT NOT NULL, "materialId" TEXT NOT NULL, "warehouseId" TEXT NOT NULL,
          "quantity" REAL NOT NULL, "reservedQuantity" REAL NOT NULL,
          PRIMARY KEY ("materialId", "warehouseId")
        );
        INSERT INTO "Material" VALUES ('material-a', 'entity-a', 5, 0);
        INSERT INTO "MaterialWarehouseStock" VALUES ('entity-a', 'material-a', 'warehouse-a', 5, 0);
      `);

      const competingReservations = await Promise.all([
        reserveMaterialStock(transaction, 'entity-a', 'material-a', 3),
        reserveMaterialStock(transaction, 'entity-a', 'material-a', 3),
      ]);
      assert.deepEqual(competingReservations.sort(), [0, 1]);
      assert.equal(await reserveWarehouseStock(transaction, 'entity-a', 'material-a', 'warehouse-a', 3), 1);
      assert.equal(await reserveWarehouseStock(transaction, 'entity-a', 'material-a', 'warehouse-a', 3), 0);
      assert.deepEqual(await query(database, 'SELECT "quantity", "reservedQuantity" FROM "Material"'), [
        { quantity: 5, reservedQuantity: 3 },
      ]);
      assert.deepEqual(await query(database, 'SELECT "quantity", "reservedQuantity" FROM "MaterialWarehouseStock"'), [
        { quantity: 5, reservedQuantity: 3 },
      ]);

      assert.equal(await consumeAvailableMaterialStock(transaction, 'entity-a', 'material-a', 3), 0);
      assert.equal(await consumeAvailableWarehouseStock(transaction, 'entity-a', 'material-a', 'warehouse-a', 3), 0);
      assert.equal(await consumeAvailableMaterialStock(transaction, 'entity-a', 'material-a', 2), 1);
      assert.equal(await consumeAvailableWarehouseStock(transaction, 'entity-a', 'material-a', 'warehouse-a', 2), 1);
      assert.equal(await consumeReservedMaterialStock(transaction, 'entity-a', 'material-a', 3), 1);
      assert.equal(await consumeReservedWarehouseStock(transaction, 'entity-a', 'material-a', 'warehouse-a', 3), 1);
      assert.equal(await consumeReservedMaterialStock(transaction, 'entity-a', 'material-a', 3), 0);
      assert.deepEqual(await query(database, 'SELECT "quantity", "reservedQuantity" FROM "Material"'), [
        { quantity: 0, reservedQuantity: 0 },
      ]);
      assert.deepEqual(await query(database, 'SELECT "quantity", "reservedQuantity" FROM "MaterialWarehouseStock"'), [
        { quantity: 0, reservedQuantity: 0 },
      ]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('releases a reservation at most once without changing physical quantity', async () => {
    const database = new sqlite3.Database(':memory:');
    const transaction = { $executeRaw: executeRaw(database) } as unknown as StockReservationTransaction;
    try {
      await execute(database, `
        CREATE TABLE "Material" (
          "id" TEXT PRIMARY KEY, "entityId" TEXT NOT NULL, "quantity" REAL NOT NULL,
          "reservedQuantity" REAL NOT NULL
        );
        CREATE TABLE "MaterialWarehouseStock" (
          "entityId" TEXT NOT NULL, "materialId" TEXT NOT NULL, "warehouseId" TEXT NOT NULL,
          "quantity" REAL NOT NULL, "reservedQuantity" REAL NOT NULL,
          PRIMARY KEY ("materialId", "warehouseId")
        );
        INSERT INTO "Material" VALUES ('material-a', 'entity-a', 5, 2);
        INSERT INTO "MaterialWarehouseStock" VALUES ('entity-a', 'material-a', 'warehouse-a', 5, 2);
      `);

      assert.equal(await releaseMaterialReservation(transaction, 'entity-a', 'material-a', 2), 1);
      assert.equal(await releaseWarehouseReservation(transaction, 'entity-a', 'material-a', 'warehouse-a', 2), 1);
      assert.equal(await releaseMaterialReservation(transaction, 'entity-a', 'material-a', 2), 0);
      assert.equal(await releaseWarehouseReservation(transaction, 'entity-a', 'material-a', 'warehouse-a', 2), 0);
      assert.deepEqual(await query(database, 'SELECT "quantity", "reservedQuantity" FROM "Material"'), [
        { quantity: 5, reservedQuantity: 0 },
      ]);
      assert.deepEqual(await query(database, 'SELECT "quantity", "reservedQuantity" FROM "MaterialWarehouseStock"'), [
        { quantity: 5, reservedQuantity: 0 },
      ]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
