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

describe('customer CRM and quote migrations', () => {
  it('preserves customers, enforces entity-scoped codes, and keeps quotes non-posting and scoped', async () => {
    const database = new sqlite3.Database(':memory:');
    try {
      await execute(database, `
        PRAGMA foreign_keys = ON;
        CREATE TABLE "Entity" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "Invoice" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "SalesOrder" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "entityId" TEXT NOT NULL,
          UNIQUE ("id", "entityId")
        );
        CREATE TABLE "Customer" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "code" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "fiscalId" TEXT,
          "email" TEXT,
          "phone" TEXT,
          "address" TEXT,
          "entityId" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Customer_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");
        INSERT INTO "Entity" ("id") VALUES ('entity-a'), ('entity-b');
        INSERT INTO "Customer" ("id", "code", "name", "entityId") VALUES
          ('customer-a', 'C001', 'Existing customer A', 'entity-a'),
          ('customer-b', 'C002', 'Existing customer B', 'entity-b');
      `);
      const migrations = [
        '20261108090000_customer_contact_audit',
        '20261108100000_customer_code_entity_scope',
        '20261108110000_sales_quotes',
        '20261108140000_sales_quote_conversion',
        '20261113130000_sales_quote_order_conversion',
      ];
      for (const migrationName of migrations) {
        await execute(database, readFileSync(join(
          __dirname,
          '..',
          'data',
          'prisma',
          'migrations',
          migrationName,
          'migration.sql',
        ), 'utf8'));
      }

      const customerCount = await new Promise<number>((resolve, reject) => {
        database.get('SELECT COUNT(*) AS count FROM "Customer"', (error, row: { count: number }) => (
          error ? reject(error) : resolve(row.count)
        ));
      });
      assert.equal(customerCount, 2);
      await execute(database, `
        INSERT INTO "Customer" ("id", "code", "name", "entityId")
        VALUES ('customer-a2', 'C001', 'Same code, other entity', 'entity-b');
      `);
      await assert.rejects(execute(database, `
        INSERT INTO "Customer" ("id", "code", "name", "entityId")
        VALUES ('customer-a3', 'C001', 'Duplicate within entity', 'entity-a');
      `), /UNIQUE constraint failed/);

      await execute(database, `
        INSERT INTO "CustomerContactChange" (
          "id", "customerId", "field", "previousValue", "newValue", "actorUserId", "actorUsername"
        ) VALUES ('contact-change-a', 'customer-a', 'email', NULL, 'new@example.test', 'user-a', 'sales-a');
        INSERT INTO "SalesQuote" (
          "id", "quoteNumber", "entityId", "customerId", "currencyCode",
          "subTotal", "taxAmount", "totalAmount", "createdByUserId", "createdByUsername"
        ) VALUES (
          'quote-a', 'DEV-2026-001', 'entity-a', 'customer-a', 'TND',
          100, 19, 119, 'user-a', 'sales-a'
        );
      `);
      await assert.rejects(execute(database, `
        INSERT INTO "SalesQuote" (
          "id", "quoteNumber", "entityId", "customerId", "currencyCode",
          "subTotal", "taxAmount", "totalAmount", "createdByUserId", "createdByUsername"
        ) VALUES (
          'quote-cross-entity', 'DEV-2026-002', 'entity-a', 'customer-b', 'TND',
          100, 19, 119, 'user-a', 'sales-a'
        );
      `), /FOREIGN KEY constraint failed/);
      await assert.rejects(execute(database, `
        DELETE FROM "Customer" WHERE "id" = 'customer-a';
      `), /FOREIGN KEY constraint failed/);
      await execute(database, `      INSERT INTO "Invoice" ("id") VALUES ('invoice-a');
      INSERT INTO "SalesOrder" ("id", "entityId") VALUES ('order-a', 'entity-a');
      INSERT INTO "SalesQuoteItem" (
        "id", "quoteId", "position", "description", "quantity", "unitPrice", "taxRate", "totalAmount"
      ) VALUES ('quote-item-a', 'quote-a', 0, 'Service', 1, 100, 19, 119);
      INSERT INTO "SalesQuoteConversion" (
        "id", "quoteId", "invoiceId", "entityId",
        "convertedByUserId", "convertedByUsername", "acceptanceNote"
      ) VALUES (
        'conversion-a', 'quote-a', 'invoice-a', 'entity-a',
        'user-a', 'sales-a', 'Bon de commande BC-42'
      );
      `);
      await execute(database, `
        INSERT INTO "SalesQuoteOrderConversion" (
          "id", "quoteId", "salesOrderId", "entityId",
          "convertedByUserId", "convertedByUsername", "acceptanceNote"
        ) VALUES (
          'order-conversion-a', 'quote-a', 'order-a', 'entity-a',
          'user-a', 'sales-a', 'Bon de commande BC-42'
        );
      `);
      await assert.rejects(execute(database, `
        INSERT INTO "SalesQuoteOrderConversion" (
          "id", "quoteId", "salesOrderId", "entityId",
          "convertedByUserId", "convertedByUsername", "acceptanceNote"
        ) VALUES (
          'order-conversion-duplicate', 'quote-a', 'order-a', 'entity-a',
          'user-a', 'sales-a', 'Duplicate conversion'
        );
      `), /UNIQUE constraint failed/);
      await assert.rejects(execute(database, `
        INSERT INTO "SalesQuoteOrderConversion" (
          "id", "quoteId", "salesOrderId", "entityId",
          "convertedByUserId", "convertedByUsername", "acceptanceNote"
        ) VALUES (
          'cross-entity-order-conversion', 'quote-a', 'missing-order', 'entity-b',
          'user-a', 'sales-a', 'Wrong entity'
        );
      `), /FOREIGN KEY constraint failed/);
      await assert.rejects(execute(database, `
      INSERT INTO "SalesQuoteConversion" (
        "id", "quoteId", "invoiceId", "entityId",
        "convertedByUserId", "convertedByUsername", "acceptanceNote"
      ) VALUES (
        'conversion-duplicate', 'quote-a', 'invoice-b', 'entity-a',
        'user-a', 'sales-a', 'Duplicate conversion'
      );
      `), /UNIQUE constraint failed/);
      await assert.rejects(execute(database, `DELETE FROM "SalesQuote" WHERE "id" = 'quote-a';`), /FOREIGN KEY constraint failed/);
      await execute(database, `DELETE FROM "SalesQuoteConversion" WHERE "id" = 'conversion-a';`);
      await execute(database, `DELETE FROM "SalesQuoteOrderConversion" WHERE "id" = 'order-conversion-a';`);
      await execute(database, `
      DELETE FROM "SalesQuote" WHERE "id" = 'quote-a';`);
      const remainingLines = await new Promise<number>((resolve, reject) => {
        database.get('SELECT COUNT(*) AS count FROM "SalesQuoteItem"', (error, row: { count: number }) => (
          error ? reject(error) : resolve(row.count)
        ));
      });
      assert.equal(remainingLines, 0);
    } finally {
      await new Promise<void>((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
