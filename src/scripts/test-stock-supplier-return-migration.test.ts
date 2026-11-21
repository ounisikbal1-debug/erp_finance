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

describe('stock supplier return migration', () => {
  it('preserves receipts and enforces source receipt, material, warehouse and idempotency scope', async () => {
    const database = new sqlite3.Database(':memory:');
    try {
      await execute(database, `
        PRAGMA foreign_keys = ON;
        CREATE TABLE "Entity" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "Material" (
          "id" TEXT NOT NULL,
          "entityId" TEXT NOT NULL,
          PRIMARY KEY ("id"),
          UNIQUE ("id", "entityId"),
          FOREIGN KEY ("entityId") REFERENCES "Entity" ("id")
        );
        CREATE TABLE "Warehouse" (
          "id" TEXT NOT NULL,
          "entityId" TEXT NOT NULL,
          PRIMARY KEY ("id"),
          UNIQUE ("id", "entityId"),
          FOREIGN KEY ("entityId") REFERENCES "Entity" ("id")
        );
        CREATE TABLE "StockReceipt" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "entityId" TEXT NOT NULL,
          "materialId" TEXT NOT NULL,
          "warehouseId" TEXT NOT NULL,
          "quantity" INTEGER NOT NULL,
          "unitCost" REAL NOT NULL,
          UNIQUE ("id", "entityId"),
          FOREIGN KEY ("entityId") REFERENCES "Entity" ("id"),
          FOREIGN KEY ("materialId", "entityId") REFERENCES "Material" ("id", "entityId"),
          FOREIGN KEY ("warehouseId", "entityId") REFERENCES "Warehouse" ("id", "entityId")
        );
        INSERT INTO "Entity" ("id") VALUES ('entity-a'), ('entity-b');
        INSERT INTO "Material" ("id", "entityId") VALUES ('material-a', 'entity-a');
        INSERT INTO "Warehouse" ("id", "entityId") VALUES ('warehouse-a', 'entity-a');
        INSERT INTO "StockReceipt" ("id", "entityId", "materialId", "warehouseId", "quantity", "unitCost")
        VALUES ('receipt-a', 'entity-a', 'material-a', 'warehouse-a', 5, 2.5);
      `);
      await execute(database, readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261108160000_stock_supplier_returns',
        'migration.sql',
      ), 'utf8'));

      const returnedQuantity = await new Promise<number>((resolve, reject) => {
        database.get('SELECT "returnedQuantity" AS quantity FROM "StockReceipt" WHERE "id" = ?', ['receipt-a'],
          (error, row: { quantity: number }) => error ? reject(error) : resolve(row.quantity));
      });
      assert.equal(returnedQuantity, 0);
      await execute(database, `
        INSERT INTO "StockSupplierReturn" (
          "id", "entityId", "sourceReceiptId", "materialId", "warehouseId", "quantity", "unitCost",
          "reason", "idempotencyKey", "createdByUserId", "createdByUsername"
        ) VALUES (
          'return-a', 'entity-a', 'receipt-a', 'material-a', 'warehouse-a', 2, 2.5,
          'Retour qualité', 'return-key', 'user-a', 'logistics'
        );
      `);
      await assert.rejects(execute(database, `
        INSERT INTO "StockSupplierReturn" (
          "id", "entityId", "sourceReceiptId", "materialId", "warehouseId", "quantity", "unitCost",
          "reason", "idempotencyKey", "createdByUserId", "createdByUsername"
        ) VALUES (
          'return-cross-entity', 'entity-b', 'receipt-a', 'material-a', 'warehouse-a', 1, 2.5,
          'Retour invalide', 'return-cross-key', 'user-b', 'other'
        );
      `), /FOREIGN KEY constraint failed/);
      await assert.rejects(execute(database, `
        INSERT INTO "StockSupplierReturn" (
          "id", "entityId", "sourceReceiptId", "materialId", "warehouseId", "quantity", "unitCost",
          "reason", "idempotencyKey", "createdByUserId", "createdByUsername"
        ) VALUES (
          'return-duplicate', 'entity-a', 'receipt-a', 'material-a', 'warehouse-a', 1, 2.5,
          'Retour dupliqué', 'return-key', 'user-a', 'logistics'
        );
      `), /UNIQUE constraint failed/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
