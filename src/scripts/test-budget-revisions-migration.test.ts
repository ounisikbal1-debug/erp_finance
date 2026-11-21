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

function scalar(database: sqlite3.Database, sql: string): Promise<number> {
  return new Promise((resolve, reject) => {
    database.get(sql, (error, row: { count: number }) => error ? reject(error) : resolve(row.count));
  });
}

describe('budget revision migration', () => {
  it('preserves existing budget rows and allows one unique row per revision number', async () => {
    const database = new sqlite3.Database(':memory:');
    try {
      await execute(database, `
        CREATE TABLE "BudgetLine" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "entityId" TEXT NOT NULL,
          "period" TEXT NOT NULL,
          "accountCode" TEXT NOT NULL,
          "amount" REAL NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'DRAFT'
        );
        CREATE UNIQUE INDEX "BudgetLine_entityId_period_accountCode_key"
        ON "BudgetLine"("entityId", "period", "accountCode");
        INSERT INTO "BudgetLine" ("id", "entityId", "period", "accountCode", "amount", "status")
        VALUES ('budget-v1', 'entity-a', '2026-10', '601', 100, 'APPROVED');
      `);
      await execute(database, readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261106200000_budget_line_revisions',
        'migration.sql',
      ), 'utf8'));

      assert.equal(await scalar(database, 'SELECT COUNT(*) AS count FROM "BudgetLine"'), 1);
      assert.equal(await scalar(database, 'SELECT "revisionNumber" AS count FROM "BudgetLine" WHERE "id" = \'budget-v1\''), 1);
      await execute(database, `
        INSERT INTO "BudgetLine" (
          "id", "entityId", "period", "accountCode", "amount", "status",
          "revisionNumber", "supersedesLineId", "revisionReason"
        ) VALUES (
          'budget-v2', 'entity-a', '2026-10', '601', 125, 'DRAFT',
          2, 'budget-v1', 'Actualisation'
        );
      `);
      await assert.rejects(execute(database, `
        INSERT INTO "BudgetLine" (
          "id", "entityId", "period", "accountCode", "amount", "status", "revisionNumber"
        ) VALUES ('budget-v2-duplicate', 'entity-a', '2026-10', '601', 130, 'DRAFT', 2);
      `), /UNIQUE constraint failed/);
      assert.equal(await scalar(database, 'SELECT COUNT(*) AS count FROM "BudgetLine"'), 2);
    } finally {
      await new Promise<void>((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
