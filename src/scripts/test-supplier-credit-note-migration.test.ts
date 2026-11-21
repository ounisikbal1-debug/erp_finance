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

describe('supplier credit note migration', () => {
  it('creates a scoped credit-note workflow with source, document, and posting references', async () => {
    const database = new sqlite3.Database(':memory:');
    try {
      await execute(database, `
        PRAGMA foreign_keys = ON;
        CREATE TABLE "Entity" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "Vendor" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "PurchaseInvoice" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "entityId" TEXT NOT NULL,
          UNIQUE ("id", "entityId"),
          FOREIGN KEY ("entityId") REFERENCES "Entity" ("id")
        );
        CREATE TABLE "PurchaseInvoiceLine" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "purchaseInvoiceId" TEXT NOT NULL,
          "entityId" TEXT NOT NULL,
          UNIQUE ("id", "purchaseInvoiceId", "entityId"),
          FOREIGN KEY ("purchaseInvoiceId", "entityId")
            REFERENCES "PurchaseInvoice" ("id", "entityId")
        );
        CREATE TABLE "StockSupplierReturn" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "entityId" TEXT NOT NULL,
          UNIQUE ("id", "entityId"),
          FOREIGN KEY ("entityId") REFERENCES "Entity" ("id")
        );
        CREATE TABLE "JournalEntry" ("id" TEXT NOT NULL PRIMARY KEY);
        INSERT INTO "Entity" ("id") VALUES ('entity-a'), ('entity-b');
        INSERT INTO "Vendor" ("id") VALUES ('vendor-a');
        INSERT INTO "PurchaseInvoice" ("id", "entityId") VALUES ('invoice-a', 'entity-a');
        INSERT INTO "PurchaseInvoiceLine" ("id", "purchaseInvoiceId", "entityId")
          VALUES ('line-a', 'invoice-a', 'entity-a');
        INSERT INTO "StockSupplierReturn" ("id", "entityId") VALUES ('return-a', 'entity-a'), ('return-b', 'entity-b');
        INSERT INTO "JournalEntry" ("id") VALUES ('journal-a');
      `);
      await execute(database, readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261109120000_supplier_credit_notes',
        'migration.sql',
      ), 'utf8'));
      await execute(database, readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261109130100_supplier_credit_applications',
        'migration.sql',
      ), 'utf8'));

      const note = (id: string, sourceReturnId: string, entityId = 'entity-a') => `
        INSERT INTO "SupplierCreditNote" (
          "id", "entityId", "vendorId", "sourceInvoiceId", "sourceInvoiceLineId", "sourceReturnId",
          "quantity", "unitPrice", "currencyCode", "functionalCurrencyCode",
          "documentSubTotal", "documentTaxAmount", "documentTotalAmount",
          "subTotal", "taxAmount", "totalAmount", "taxRateId", "taxRateCode", "taxRate",
          "exchangeRate", "status", "createdByUserId", "createdByUsername", "updatedAt"
        ) VALUES (
          '${id}', '${entityId}', 'vendor-a', 'invoice-a', 'line-a', '${sourceReturnId}',
          2, 10, 'TND', 'TND', 20, 3.8, 23.8, 20, 3.8, 23.8,
          'rate-a', 'VAT19', 19, 1, 'AWAITING_SUPPLIER_DOCUMENT', 'user-a', 'operator', CURRENT_TIMESTAMP
        );
      `;
      await execute(database, note('credit-a', 'return-a'));
      await assert.rejects(execute(database, note('credit-duplicate-return', 'return-a')), /UNIQUE constraint failed/);
      await assert.rejects(execute(database, note('credit-cross-entity', 'return-b', 'entity-b')), /FOREIGN KEY constraint failed/);
      await execute(database, `INSERT INTO "PurchaseInvoice" ("id", "entityId") VALUES ('invoice-b', 'entity-a');`);
      const application = (id: string, key: string, targetId = 'invoice-b', entityId = 'entity-a') => `
        INSERT INTO "SupplierCreditNoteApplication" (
          "id", "entityId", "supplierCreditNoteId", "targetPurchaseInvoiceId",
          "documentAmount", "functionalAmount", "idempotencyKey", "createdByUserId",
          "createdByUsername", "note"
        ) VALUES (
          '${id}', '${entityId}', 'credit-a', '${targetId}', 5, 5, '${key}',
          'user-a', 'operator', 'TEST application audit'
        );
      `;
      await execute(database, application('application-a', 'key-a'));
      await assert.rejects(
        execute(database, application('application-duplicate-key', 'key-a')),
        /UNIQUE constraint failed/,
      );
      await assert.rejects(
        execute(database, application('application-cross-entity', 'key-b', 'invoice-a', 'entity-b')),
        /FOREIGN KEY constraint failed/,
      );
      await assert.rejects(
        execute(database, application('application-missing-target', 'key-c', 'missing-invoice')),
        /FOREIGN KEY constraint failed/,
      );
      await assert.rejects(execute(database, `
        UPDATE "SupplierCreditNote" SET "postingJournalEntryId" = 'missing-journal' WHERE "id" = 'credit-a';
      `), /FOREIGN KEY constraint failed/);

      const violations = await new Promise<Array<unknown>>((resolve, reject) => {
        database.all('PRAGMA foreign_key_check', (error, rows: unknown[]) => error ? reject(error) : resolve(rows));
      });
      assert.deepEqual(violations, []);
    } finally {
      await new Promise<void>((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
