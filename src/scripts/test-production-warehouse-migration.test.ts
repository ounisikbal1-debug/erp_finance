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

describe('production warehouse migration', () => {
  it('preserves old orders and constrains new warehouse references', async () => {
    const database = new sqlite3.Database(':memory:');
    try {
      await execute(database, `
        PRAGMA foreign_keys = ON;
        CREATE TABLE "Warehouse" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "ProductionOrder" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "entityId" TEXT NOT NULL,
          "orderNumber" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'DRAFT'
        );
        INSERT INTO "ProductionOrder" ("id", "entityId", "orderNumber", "status")
        VALUES ('order-existing', 'entity-a', 'OF-001', 'POSTED');
        INSERT INTO "Warehouse" ("id") VALUES ('warehouse-a');
      `);
      await execute(database, readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261108150000_production_order_warehouse',
        'migration.sql',
      ), 'utf8'));

      const oldOrder = await new Promise<Record<string, unknown>>((resolve, reject) => {
        database.get('SELECT * FROM "ProductionOrder" WHERE "id" = ?', ['order-existing'], (error, row) => (
          error ? reject(error) : resolve(row as Record<string, unknown>)
        ));
      });
      assert.equal(oldOrder.status, 'POSTED');
      assert.equal(oldOrder.warehouseId, null);
      await execute(database, `
        INSERT INTO "ProductionOrder" ("id", "entityId", "orderNumber", "warehouseId")
        VALUES ('order-new', 'entity-a', 'OF-002', 'warehouse-a');
      `);
      await assert.rejects(execute(database, `
        INSERT INTO "ProductionOrder" ("id", "entityId", "orderNumber", "warehouseId")
        VALUES ('order-invalid', 'entity-a', 'OF-003', 'missing-warehouse');
      `), /FOREIGN KEY constraint failed/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
