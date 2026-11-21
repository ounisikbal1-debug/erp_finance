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

describe('stock receipt migration', () => {
  it('creates entity-scoped receipt records with idempotency and referential integrity', async () => {
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
        INSERT INTO "Entity" ("id") VALUES ('entity-a'), ('entity-b');
        INSERT INTO "Material" ("id", "entityId") VALUES ('material-a', 'entity-a');
        INSERT INTO "Warehouse" ("id", "entityId") VALUES ('warehouse-a', 'entity-a');
      `);
      await execute(database, readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261106234500_stock_receipts',
        'migration.sql',
      ), 'utf8'));
      await execute(database, `
        INSERT INTO "StockReceipt" (
          "id", "entityId", "materialId", "warehouseId", "quantity", "unitCost",
          "reason", "idempotencyKey", "createdByUserId", "createdByUsername"
        ) VALUES (
          'receipt-a', 'entity-a', 'material-a', 'warehouse-a', 4, 12.5,
          'Bon de livraison BL-1', 'receipt-key-a', 'user-a', 'logistics'
        );
      `);
      await assert.rejects(execute(database, `
        INSERT INTO "StockReceipt" (
          "id", "entityId", "materialId", "warehouseId", "quantity", "unitCost",
          "reason", "idempotencyKey", "createdByUserId", "createdByUsername"
        ) VALUES (
          'receipt-cross', 'entity-b', 'material-a', 'warehouse-a', 1, 12,
          'Cross entity', 'receipt-key-cross', 'user-b', 'logistics'
        );
      `), /FOREIGN KEY constraint failed/);
      await assert.rejects(execute(database, `
        INSERT INTO "StockReceipt" (
          "id", "entityId", "materialId", "warehouseId", "quantity", "unitCost",
          "reason", "idempotencyKey", "createdByUserId", "createdByUsername"
        ) VALUES (
          'receipt-duplicate', 'entity-a', 'material-a', 'warehouse-a', 2, 12,
          'Duplicate key', 'receipt-key-a', 'user-a', 'logistics'
        );
      `), /UNIQUE constraint failed/);
      await execute(database, `
        CREATE TABLE "PurchaseInvoice" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "entityId" TEXT NOT NULL,
          UNIQUE ("id", "entityId"),
          FOREIGN KEY ("entityId") REFERENCES "Entity" ("id")
        );
        INSERT INTO "PurchaseInvoice" ("id", "entityId") VALUES ('invoice-a', 'entity-a');
      `);
      await execute(database, readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261107001900_stock_receipt_invoice_match',
        'migration.sql',
      ), 'utf8'));
      const preservedReceipt = await new Promise<Array<{ id: string; purchaseInvoiceId: string | null }>>((resolve, reject) => {
        database.all(
          'SELECT "id", "purchaseInvoiceId" FROM "StockReceipt" WHERE "id" = ?',
          ['receipt-a'],
          (error, rows) => error ? reject(error) : resolve(rows as Array<{ id: string; purchaseInvoiceId: string | null }>),
        );
      });
      assert.deepEqual(preservedReceipt, [{ id: 'receipt-a', purchaseInvoiceId: null }]);
      await execute(database, `
        INSERT INTO "StockReceipt" (
          "id", "entityId", "materialId", "purchaseInvoiceId", "warehouseId", "quantity", "unitCost",
          "reason", "idempotencyKey", "createdByUserId", "createdByUsername"
        ) VALUES (
          'receipt-linked', 'entity-a', 'material-a', 'invoice-a', 'warehouse-a', 2, 12,
          'Livraison rattachée', 'receipt-key-linked', 'user-a', 'logistics'
        );
      `);
      await assert.rejects(execute(database, `
        INSERT INTO "StockReceipt" (
          "id", "entityId", "materialId", "purchaseInvoiceId", "warehouseId", "quantity", "unitCost",
          "reason", "idempotencyKey", "createdByUserId", "createdByUsername"
        ) VALUES (
          'receipt-cross-invoice', 'entity-b', 'material-a', 'invoice-a', 'warehouse-a', 1, 12,
          'Rapprochement autre société', 'receipt-key-cross-invoice', 'user-b', 'logistics'
        );
      `), /FOREIGN KEY constraint failed/);
      await execute(database, readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261108120000_purchase_invoice_lines_receipt_match',
        'migration.sql',
      ), 'utf8'));
      await execute(database, `
        INSERT INTO "PurchaseInvoiceLine" (
          "id", "purchaseInvoiceId", "entityId", "description", "materialId", "quantity", "unitPrice"
        ) VALUES (
          'line-a', 'invoice-a', 'entity-a', 'Matière A', 'material-a', 4, 12.5
        );
        INSERT INTO "PurchaseInvoiceLineReceiptMatch" (
          "id", "entityId", "purchaseInvoiceId", "lineId", "receiptId"
        ) VALUES (
          'line-match-a', 'entity-a', 'invoice-a', 'line-a', 'receipt-linked'
        );
      `);
      await assert.rejects(execute(database, `
        INSERT INTO "PurchaseInvoiceLineReceiptMatch" (
          "id", "entityId", "purchaseInvoiceId", "lineId", "receiptId"
        ) VALUES (
          'line-match-cross-invoice', 'entity-a', 'invoice-a', 'line-a', 'receipt-a'
        );
      `), /FOREIGN KEY constraint failed/);
      const violations = await new Promise<unknown[]>((resolve, reject) => {
        database.all('PRAGMA foreign_key_check', (error, rows) => error ? reject(error) : resolve(rows));
      });
      assert.deepEqual(violations, []);
    } finally {
      await new Promise<void>((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
