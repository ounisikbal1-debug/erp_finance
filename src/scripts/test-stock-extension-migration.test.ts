import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sqlite3 from 'sqlite3';
import { describe, it } from 'node:test';

function execute(database: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    database.exec(sql, (error) => error ? reject(error) : resolve());
  });
}

function getRow<T>(database: sqlite3.Database, sql: string, values: unknown[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    database.get(sql, values, (error, row: T) => error ? reject(error) : resolve(row));
  });
}

describe('stock extension migration', () => {
  it('preserves aggregate material quantity and creates scoped warehouses, metadata, and movement audit tables', async () => {
    const database = new sqlite3.Database(':memory:');
    try {
      await execute(database, `
        PRAGMA foreign_keys = ON;
        CREATE TABLE "Entity" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "Material" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "sku" TEXT NOT NULL UNIQUE,
          "name" TEXT NOT NULL,
          "quantity" INTEGER NOT NULL DEFAULT 0,
          "unitPrice" REAL NOT NULL,
          "costPrice" REAL NOT NULL DEFAULT 0,
          "entityId" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE
        );
        INSERT INTO "Entity" ("id") VALUES ('entity-a'), ('entity-b');
        INSERT INTO "Material" ("id", "sku", "name", "quantity", "unitPrice", "entityId")
          VALUES ('material-a', 'MAT-A', 'Existing A', 12, 4, 'entity-a'),
                 ('material-b', 'MAT-B', 'Existing B', 7, 5, 'entity-b');
      `);
      await execute(database, readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261106130000_stock_warehouses_movements_metadata',
        'migration.sql',
      ), 'utf8'));

      const preserved = await getRow<{ quantity: number; unitCode: string; minimumStock: number | null }>(
        database,
        'SELECT "quantity", "unitCode", "minimumStock" FROM "Material" WHERE "id" = ?',
        ['material-a'],
      );
      assert.deepEqual(preserved, { quantity: 12, unitCode: 'EA', minimumStock: null });
      await execute(database, `
        UPDATE "Material" SET "barcode" = '12345', "minimumStock" = 4 WHERE "id" = 'material-a';
        UPDATE "Material" SET "barcode" = '12345' WHERE "id" = 'material-b';
        INSERT INTO "Warehouse" ("id", "code", "name", "entityId")
          VALUES ('warehouse-a', 'A', 'Depot A', 'entity-a');
        INSERT INTO "MaterialWarehouseStock" ("id", "entityId", "materialId", "warehouseId", "quantity", "updatedAt")
          VALUES ('balance-a', 'entity-a', 'material-a', 'warehouse-a', 3, CURRENT_TIMESTAMP);
        INSERT INTO "StockTransfer" (
          "id", "entityId", "materialId", "sourceWarehouseId", "destinationWarehouseId",
          "quantity", "reason", "idempotencyKey", "createdByUserId", "createdByUsername"
        ) VALUES (
          'transfer-a', 'entity-a', 'material-a', NULL, 'warehouse-a',
          3, 'Affectation test', 'key-a', 'user-a', 'testeur'
        );
        INSERT INTO "StockMovement" (
          "id", "entityId", "materialId", "warehouseId", "transferId", "movementType",
          "deltaQuantity", "reason", "createdByUserId", "createdByUsername"
        ) VALUES (
          'movement-a', 'entity-a', 'material-a', 'warehouse-a', 'transfer-a', 'TRANSFER_IN',
          3, 'Affectation test', 'user-a', 'testeur'
        );
      `);
      await assert.rejects(execute(database, `
        INSERT INTO "Warehouse" ("id", "code", "name", "entityId")
          VALUES ('warehouse-cross', 'A', 'Cross entity', 'entity-b');
        INSERT INTO "MaterialWarehouseStock" ("id", "entityId", "materialId", "warehouseId", "quantity", "updatedAt")
          VALUES ('balance-cross', 'entity-b', 'material-a', 'warehouse-cross', 1, CURRENT_TIMESTAMP);
      `), /FOREIGN KEY constraint failed/);
      await assert.rejects(execute(database, `
        INSERT INTO "StockTransfer" (
          "id", "entityId", "materialId", "destinationWarehouseId",
          "quantity", "reason", "idempotencyKey", "createdByUserId", "createdByUsername"
        ) VALUES (
          'transfer-duplicate', 'entity-a', 'material-a', 'warehouse-a',
          1, 'Duplicate key', 'key-a', 'user-a', 'testeur'
        );
      `), /UNIQUE constraint failed/);
      await assert.rejects(execute(database, `
        INSERT INTO "StockTransfer" (
          "id", "entityId", "materialId", "quantity", "reason",
          "idempotencyKey", "createdByUserId", "createdByUsername"
        ) VALUES (
          'transfer-no-location', 'entity-a', 'material-a', 1, 'No location',
          'key-no-location', 'user-a', 'testeur'
        );
      `), /CHECK constraint failed/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
