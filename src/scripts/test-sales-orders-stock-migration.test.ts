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

describe('sales order stock fulfillment migration', () => {
  it('preserves legacy orders and enforces entity-scoped article and stock-pick links', async () => {
    const database = new sqlite3.Database(':memory:');
    try {
      await execute(database, `
        PRAGMA foreign_keys = ON;
        CREATE TABLE "Entity" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "Material" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "entityId" TEXT NOT NULL,
          UNIQUE ("id", "entityId"),
          FOREIGN KEY ("entityId") REFERENCES "Entity"("id")
        );
        CREATE TABLE "InvoiceItem" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "invoiceId" TEXT NOT NULL,
          "description" TEXT NOT NULL,
          "quantity" REAL NOT NULL,
          "unitPrice" REAL NOT NULL,
          "taxRate" REAL NOT NULL,
          "totalAmount" REAL NOT NULL
        );
        CREATE TABLE "SalesOrder" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "orderNumber" TEXT NOT NULL UNIQUE,
          "entityId" TEXT NOT NULL,
          "customerId" TEXT NOT NULL,
          "totalAmount" REAL NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'OPEN',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE "StockPick" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "entityId" TEXT NOT NULL,
          UNIQUE ("id", "entityId"),
          FOREIGN KEY ("entityId") REFERENCES "Entity"("id")
        );
        INSERT INTO "Entity" ("id") VALUES ('entity-a'), ('entity-b');
        INSERT INTO "Material" ("id", "entityId") VALUES ('material-a', 'entity-a'), ('material-b', 'entity-b');
        INSERT INTO "SalesOrder" ("id", "orderNumber", "entityId", "customerId", "totalAmount")
        VALUES ('order-a', 'CMD-LEGACY', 'entity-a', 'customer-a', 10);
      `);
      await execute(database, readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261110130000_sales_orders_stock_fulfillment',
        'migration.sql',
      ), 'utf8'));
      await execute(database, `
        INSERT INTO "StockPick" ("id", "entityId") VALUES ('pick-a', 'entity-a');
        INSERT INTO "SalesOrderLine" (
          "id", "entityId", "orderId", "materialId", "description", "quantity", "unitPrice", "totalAmount"
        ) VALUES ('line-a', 'entity-a', 'order-a', 'material-a', 'Article', 1, 10, 10);
        INSERT INTO "SalesOrderStockPickLink" ("id", "entityId", "salesOrderId", "stockPickId")
        VALUES ('link-a', 'entity-a', 'order-a', 'pick-a');
        INSERT INTO "InvoiceItem" (
          "id", "invoiceId", "description", "quantity", "unitPrice", "taxRate", "totalAmount", "materialId"
        ) VALUES ('invoice-line-a', 'invoice-a', 'Article', 1, 10, 0, 10, 'material-a');
      `);
      const legacyRows = await query<{ currencyCode: string; createdByUsername: string }>(
        database,
        `SELECT "currencyCode", "createdByUsername" FROM "SalesOrder" WHERE "id" = 'order-a'`,
      );
      assert.deepEqual(legacyRows, [{ currencyCode: '', createdByUsername: 'legacy' }]);

      await assert.rejects(execute(database, `
        INSERT INTO "SalesOrderLine" (
          "id", "entityId", "orderId", "materialId", "description", "quantity", "unitPrice", "totalAmount"
        ) VALUES ('line-cross', 'entity-a', 'order-a', 'material-b', 'Article cross-entity', 1, 10, 10);
      `), /FOREIGN KEY constraint failed/);
      await assert.rejects(execute(database, `
        INSERT INTO "SalesOrderStockPickLink" ("id", "entityId", "salesOrderId", "stockPickId")
        VALUES ('link-cross', 'entity-b', 'order-a', 'pick-a');
      `), /FOREIGN KEY constraint failed/);
      await assert.rejects(execute(database, `
        INSERT INTO "SalesOrderStockPickLink" ("id", "entityId", "salesOrderId", "stockPickId")
        VALUES ('link-duplicate', 'entity-a', 'order-a', 'pick-a');
      `), /UNIQUE constraint failed/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
