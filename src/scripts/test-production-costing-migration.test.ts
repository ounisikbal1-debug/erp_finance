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

describe('production costing and input warehouse migration', () => {
  it('preserves existing orders and validates optional input warehouse references', async () => {
    const database = new sqlite3.Database(':memory:');
    try {
      await execute(database, `
        PRAGMA foreign_keys = ON;
        CREATE TABLE "CountryProfile" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "Warehouse" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "ProductionOrder" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "outputQuantity" REAL NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'DRAFT'
        );
        CREATE TABLE "ProductionOrderMaterialLine" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "orderId" TEXT NOT NULL,
          "materialId" TEXT NOT NULL,
          "quantity" REAL NOT NULL,
          CONSTRAINT "ProductionOrderMaterialLine_orderId_materialId_key" UNIQUE ("orderId", "materialId")
        );
        INSERT INTO "CountryProfile" ("id") VALUES ('country-a');
        INSERT INTO "Warehouse" ("id") VALUES ('warehouse-a');
        INSERT INTO "ProductionOrder" ("id", "outputQuantity", "status")
        VALUES ('order-existing', 4.5, 'POSTED');
        INSERT INTO "ProductionOrderMaterialLine" ("id", "orderId", "materialId", "quantity")
        VALUES ('line-existing', 'order-existing', 'material-a', 2.25);
      `);
      await execute(database, readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261109130000_production_costing_scrap_and_input_warehouses',
        'migration.sql',
      ), 'utf8'));

      const oldOrder = await new Promise<Record<string, unknown>>((resolve, reject) => {
        database.get('SELECT * FROM "ProductionOrder" WHERE "id" = ?', ['order-existing'], (error, row) => (
          error ? reject(error) : resolve(row as Record<string, unknown>)
        ));
      });
      assert.equal(oldOrder.status, 'POSTED');
      assert.equal(oldOrder.outputQuantity, 4.5);
      assert.equal(oldOrder.laborCost, 0);
      assert.equal(oldOrder.overheadCost, 0);
      assert.equal(oldOrder.scrapQuantity, 0);

      await execute(database, `
        INSERT INTO "ProductionOrderMaterialLine" ("id", "orderId", "materialId", "quantity", "warehouseId")
        VALUES ('line-new', 'order-existing', 'material-b', 1.25, 'warehouse-a');
      `);
      await assert.rejects(execute(database, `
        INSERT INTO "ProductionOrderMaterialLine" ("id", "orderId", "materialId", "quantity", "warehouseId")
        VALUES ('line-invalid', 'order-existing', 'material-c', 1, 'missing-warehouse');
      `), /FOREIGN KEY constraint failed/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
