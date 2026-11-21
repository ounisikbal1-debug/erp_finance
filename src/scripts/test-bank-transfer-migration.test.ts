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

describe('internal bank transfer migration', () => {
  it('preserves existing banking records and enforces transfer references and idempotency', async () => {
    const database = new sqlite3.Database(':memory:');
    try {
      await execute(database, `
        PRAGMA foreign_keys = ON;
        CREATE TABLE "Entity" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "BankAccount" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "JournalEntry" ("id" TEXT NOT NULL PRIMARY KEY);
        INSERT INTO "Entity" ("id") VALUES ('entity-a');
        INSERT INTO "BankAccount" ("id") VALUES ('bank-a'), ('bank-b');
        INSERT INTO "JournalEntry" ("id") VALUES ('journal-existing');
      `);
      await execute(database, readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261110100000_internal_bank_transfers',
        'migration.sql',
      ), 'utf8'));

      const journalCount = await new Promise<number>((resolve, reject) => {
        database.get('SELECT COUNT(*) AS count FROM "JournalEntry"', (error, row) => (
          error ? reject(error) : resolve((row as { count: number }).count)
        ));
      });
      assert.equal(journalCount, 1);
      await execute(database, `
        INSERT INTO "JournalEntry" ("id") VALUES ('journal-transfer');
        INSERT INTO "BankTransfer" (
          "id", "entityId", "sourceBankAccountId", "destinationBankAccountId",
          "amount", "currencyCode", "transferredAt", "description",
          "idempotencyKey", "postingJournalEntryId", "createdByUserId"
        ) VALUES (
          'transfer-a', 'entity-a', 'bank-a', 'bank-b',
          4.125, 'TND', '2026-03-04T00:00:00.000Z', 'Test transfert',
          'request-a', 'journal-transfer', 'user-a'
        );
      `);
      await assert.rejects(execute(database, `
        INSERT INTO "BankTransfer" (
          "id", "entityId", "sourceBankAccountId", "destinationBankAccountId",
          "amount", "currencyCode", "transferredAt", "description",
          "idempotencyKey", "postingJournalEntryId", "createdByUserId"
        ) VALUES (
          'transfer-b', 'entity-a', 'bank-a', 'bank-b',
          4.125, 'TND', '2026-03-04T00:00:00.000Z', 'Test doublon',
          'request-a', 'journal-existing', 'user-a'
        );
      `), /UNIQUE constraint failed/);
      await assert.rejects(execute(database, `
        INSERT INTO "BankTransfer" (
          "id", "entityId", "sourceBankAccountId", "destinationBankAccountId",
          "amount", "currencyCode", "transferredAt", "description",
          "idempotencyKey", "postingJournalEntryId", "createdByUserId"
        ) VALUES (
          'transfer-c', 'entity-a', 'bank-missing', 'bank-b',
          4.125, 'TND', '2026-03-04T00:00:00.000Z', 'Test référence',
          'request-c', 'journal-existing', 'user-a'
        );
      `), /FOREIGN KEY constraint failed/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
