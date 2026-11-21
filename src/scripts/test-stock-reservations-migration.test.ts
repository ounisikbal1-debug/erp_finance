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

function query<T>(database: sqlite3.Database, sql: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    database.all(sql, (error, rows) => error ? reject(error) : resolve(rows as T[]));
  });
}

describe('stock reservation migration', () => {
  it('backfills reservations from only prepared picks and preserves physical stock', async () => {
    const database = new sqlite3.Database(':memory:');
    try {
      await execute(database, `
        CREATE TABLE "Material" (
          "id" TEXT NOT NULL PRIMARY KEY, "entityId" TEXT NOT NULL, "quantity" REAL NOT NULL
        );
        CREATE TABLE "MaterialWarehouseStock" (
          "entityId" TEXT NOT NULL, "materialId" TEXT NOT NULL, "warehouseId" TEXT NOT NULL,
          "quantity" REAL NOT NULL
        );
        CREATE TABLE "StockPick" (
          "id" TEXT NOT NULL PRIMARY KEY, "entityId" TEXT NOT NULL, "status" TEXT NOT NULL
        );
        CREATE TABLE "StockPickLine" (
          "id" TEXT NOT NULL PRIMARY KEY, "entityId" TEXT NOT NULL, "pickId" TEXT NOT NULL,
          "materialId" TEXT NOT NULL, "warehouseId" TEXT NOT NULL, "quantity" REAL NOT NULL
        );
        INSERT INTO "Material" VALUES ('material-a', 'entity-a', 10), ('material-b', 'entity-a', 7);
        INSERT INTO "MaterialWarehouseStock" VALUES
          ('entity-a', 'material-a', 'warehouse-a', 8),
          ('entity-a', 'material-b', 'warehouse-a', 7);
        INSERT INTO "StockPick" VALUES
          ('pick-a', 'entity-a', 'PICKED'),
          ('pick-b', 'entity-a', 'PICKED'),
          ('pick-c', 'entity-a', 'DISPATCHED'),
          ('pick-d', 'entity-a', 'CANCELLED');
        INSERT INTO "StockPickLine" VALUES
          ('line-a', 'entity-a', 'pick-a', 'material-a', 'warehouse-a', 2),
          ('line-b', 'entity-a', 'pick-b', 'material-a', 'warehouse-a', 1),
          ('line-c', 'entity-a', 'pick-c', 'material-a', 'warehouse-a', 4),
          ('line-d', 'entity-a', 'pick-d', 'material-b', 'warehouse-a', 3);
      `);
      await execute(database, readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261110160000_stock_reservations',
        'migration.sql',
      ), 'utf8'));

      assert.deepEqual(await query(database, `
        SELECT "id", "quantity", "reservedQuantity" FROM "Material" ORDER BY "id"
      `), [
        { id: 'material-a', quantity: 10, reservedQuantity: 3 },
        { id: 'material-b', quantity: 7, reservedQuantity: 0 },
      ]);
      assert.deepEqual(await query(database, `
        SELECT "materialId", "quantity", "reservedQuantity"
        FROM "MaterialWarehouseStock" ORDER BY "materialId"
      `), [
        { materialId: 'material-a', quantity: 8, reservedQuantity: 3 },
        { materialId: 'material-b', quantity: 7, reservedQuantity: 0 },
      ]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
