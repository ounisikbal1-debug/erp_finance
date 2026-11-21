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

describe('sales order invoice migration', () => {
  it('links one invoice per order within the same entity and preserves existing records', async () => {
    const database = new sqlite3.Database(':memory:');
    try {
      await execute(database, `
        PRAGMA foreign_keys = ON;
        CREATE TABLE "Entity" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "SalesOrder" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "entityId" TEXT NOT NULL,
          UNIQUE ("id", "entityId"),
          FOREIGN KEY ("entityId") REFERENCES "Entity"("id")
        );
        CREATE TABLE "Invoice" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "entityId" TEXT NOT NULL,
          FOREIGN KEY ("entityId") REFERENCES "Entity"("id")
        );
        INSERT INTO "Entity" ("id") VALUES ('entity-a'), ('entity-b');
        INSERT INTO "SalesOrder" ("id", "entityId") VALUES ('order-a', 'entity-a'), ('order-b', 'entity-b');
        INSERT INTO "Invoice" ("id", "entityId") VALUES ('invoice-a', 'entity-a'), ('invoice-b', 'entity-b');
      `);
      await execute(database, readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261110160000_sales_order_invoicing',
        'migration.sql',
      ), 'utf8'));
      await execute(database, `
        INSERT INTO "SalesOrderInvoiceLink" (
          "id", "entityId", "salesOrderId", "invoiceId", "createdByUserId", "createdByUsername"
        ) VALUES ('link-a', 'entity-a', 'order-a', 'invoice-a', 'user-a', 'sales-a');
      `);

      const links = await query<{ salesOrderId: string; invoiceId: string; createdByUsername: string }>(
        database,
        `SELECT "salesOrderId", "invoiceId", "createdByUsername" FROM "SalesOrderInvoiceLink"`,
      );
      assert.deepEqual(links, [{
        salesOrderId: 'order-a',
        invoiceId: 'invoice-a',
        createdByUsername: 'sales-a',
      }]);

      await assert.rejects(execute(database, `
        INSERT INTO "SalesOrderInvoiceLink" (
          "id", "entityId", "salesOrderId", "invoiceId", "createdByUserId", "createdByUsername"
        ) VALUES ('link-duplicate-order', 'entity-a', 'order-a', 'invoice-b', 'user-a', 'sales-a');
      `), /UNIQUE constraint failed/);
      await assert.rejects(execute(database, `
        INSERT INTO "SalesOrderInvoiceLink" (
          "id", "entityId", "salesOrderId", "invoiceId", "createdByUserId", "createdByUsername"
        ) VALUES ('link-cross-entity', 'entity-a', 'order-b', 'invoice-b', 'user-a', 'sales-a');
      `), /FOREIGN KEY constraint failed/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
