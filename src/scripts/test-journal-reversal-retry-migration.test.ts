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

describe('journal reversal retry migration', () => {
  it('preserves rejected attempts while allowing only one active reversal per original', async () => {
    const database = new sqlite3.Database(':memory:');
    try {
      await execute(database, `
        CREATE TABLE "JournalEntry" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "reversesEntryId" TEXT,
          "status" TEXT NOT NULL
        );
        CREATE TABLE "JournalEntryWorkflowEvent" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "journalEntryId" TEXT NOT NULL,
          "action" TEXT NOT NULL
        );
        CREATE TABLE "PurchaseInvoiceWorkflowEvent" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "purchaseInvoiceId" TEXT NOT NULL,
          "action" TEXT NOT NULL
        );
        CREATE TABLE "SalesInvoiceWorkflowEvent" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "invoiceId" TEXT NOT NULL,
          "action" TEXT NOT NULL
        );
        CREATE UNIQUE INDEX "JournalEntry_reversesEntryId_key"
        ON "JournalEntry"("reversesEntryId");
        CREATE UNIQUE INDEX "JournalEntryWorkflowEvent_journalEntryId_action_key"
        ON "JournalEntryWorkflowEvent"("journalEntryId", "action");
        CREATE UNIQUE INDEX "PurchaseInvoiceWorkflowEvent_purchaseInvoiceId_action_key"
        ON "PurchaseInvoiceWorkflowEvent"("purchaseInvoiceId", "action");
        CREATE UNIQUE INDEX "SalesInvoiceWorkflowEvent_invoiceId_action_key"
        ON "SalesInvoiceWorkflowEvent"("invoiceId", "action");
        INSERT INTO "JournalEntry" ("id", "reversesEntryId", "status")
        VALUES ('original', NULL, 'POSTED');
      `);
      const migration = readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261107100000_reversal_retry',
        'migration.sql',
      ), 'utf8');
      await execute(database, migration);
      await execute(database, `
        INSERT INTO "JournalEntry" ("id", "reversesEntryId", "status")
        VALUES ('rejected-first', 'original', 'REJECTED');
        INSERT INTO "JournalEntry" ("id", "reversesEntryId", "status")
        VALUES ('active-second', 'original', 'TO_REVIEW');
      `);
      await assert.rejects(execute(database, `
        INSERT INTO "JournalEntry" ("id", "reversesEntryId", "status")
        VALUES ('active-third', 'original', 'TO_REVIEW');
      `), /UNIQUE constraint failed/);
      await execute(database, `
        UPDATE "JournalEntry" SET "status" = 'REJECTED' WHERE "id" = 'active-second';
        INSERT INTO "JournalEntry" ("id", "reversesEntryId", "status")
        VALUES ('active-third', 'original', 'TO_REVIEW');
        INSERT INTO "JournalEntryWorkflowEvent" ("id", "journalEntryId", "action")
        VALUES ('requested-1', 'original', 'REVERSAL_REQUESTED');
        INSERT INTO "JournalEntryWorkflowEvent" ("id", "journalEntryId", "action")
        VALUES ('rejected-1', 'original', 'REVERSAL_REJECTED');
        INSERT INTO "JournalEntryWorkflowEvent" ("id", "journalEntryId", "action")
        VALUES ('requested-2', 'original', 'REVERSAL_REQUESTED');
        INSERT INTO "PurchaseInvoiceWorkflowEvent" ("id", "purchaseInvoiceId", "action")
        VALUES ('purchase-request-1', 'purchase', 'CANCELLATION_REQUESTED');
        INSERT INTO "PurchaseInvoiceWorkflowEvent" ("id", "purchaseInvoiceId", "action")
        VALUES ('purchase-reopen-1', 'purchase', 'CANCELLATION_REOPENED');
        INSERT INTO "PurchaseInvoiceWorkflowEvent" ("id", "purchaseInvoiceId", "action")
        VALUES ('purchase-request-2', 'purchase', 'CANCELLATION_REQUESTED');
        INSERT INTO "SalesInvoiceWorkflowEvent" ("id", "invoiceId", "action")
        VALUES ('sales-request-1', 'sales', 'CANCELLATION_REQUESTED');
        INSERT INTO "SalesInvoiceWorkflowEvent" ("id", "invoiceId", "action")
        VALUES ('sales-reopen-1', 'sales', 'CANCELLATION_REOPENED');
        INSERT INTO "SalesInvoiceWorkflowEvent" ("id", "invoiceId", "action")
        VALUES ('sales-request-2', 'sales', 'CANCELLATION_REQUESTED');
      `);
      const attempts = await new Promise<number>((resolve, reject) => {
        database.get(
          'SELECT COUNT(*) AS count FROM "JournalEntry" WHERE "reversesEntryId" = ?',
          ['original'],
          (error, row: { count: number }) => error ? reject(error) : resolve(row.count),
        );
      });
      assert.equal(attempts, 3);
      await execute(database, `
        INSERT INTO "JournalEntryWorkflowEvent" ("id", "journalEntryId", "action")
        VALUES ('submitted-1', 'original', 'SUBMITTED');
      `);
      await assert.rejects(execute(database, `
        INSERT INTO "JournalEntryWorkflowEvent" ("id", "journalEntryId", "action")
        VALUES ('submitted-2', 'original', 'SUBMITTED');
      `), /UNIQUE constraint failed/);
      await execute(database, `
        INSERT INTO "PurchaseInvoiceWorkflowEvent" ("id", "purchaseInvoiceId", "action")
        VALUES ('purchase-approved-1', 'purchase', 'APPROVED');
      `);
      await assert.rejects(execute(database, `
        INSERT INTO "PurchaseInvoiceWorkflowEvent" ("id", "purchaseInvoiceId", "action")
        VALUES ('purchase-approved-2', 'purchase', 'APPROVED');
      `), /UNIQUE constraint failed/);
    } finally {
      await new Promise<void>((resolve, reject) => database.close((error) => error ? reject(error) : resolve()));
    }
  });
});
