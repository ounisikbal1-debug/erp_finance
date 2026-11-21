import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sqlite3 from 'sqlite3';
import { after, before, describe, it } from 'node:test';
import { copyMigrationHistoryAtomically } from './adopt-prisma-baseline';

const projectRoot = resolve(__dirname, '../..');
const schemaSource = resolve(projectRoot, 'src/data/prisma/schema.prisma');
const prismaCli = resolve(projectRoot, 'node_modules/prisma/build/index.js');
const baselineScript = resolve(projectRoot, 'src/scripts/adopt-prisma-baseline.ts');
const migrationsDirectory = resolve(projectRoot, 'src/data/prisma/migrations');
let temporaryDirectory: string;

function databaseUrl(databasePath: string): string {
  return `file:${databasePath.replace(/\\/g, '/')}`;
}

function executeSql(databasePath: string, sql: string): Promise<void> {
  const database = new sqlite3.Database(databasePath);
  return new Promise((resolveExecute, rejectExecute) => {
    database.exec(sql, (error) => {
      database.close((closeError) => {
        if (error) rejectExecute(error);
        else if (closeError) rejectExecute(closeError);
        else resolveExecute();
      });
    });
  });
}

function queryRows<T>(databasePath: string, sql: string): Promise<T[]> {
  const database = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);
  return new Promise((resolveQuery, rejectQuery) => {
    database.all(sql, (error, rows) => {
      database.close((closeError) => {
        if (error) rejectQuery(error);
        else if (closeError) rejectQuery(closeError);
        else resolveQuery(rows as T[]);
      });
    });
  });
}

function runPrisma(databasePath: string, ...args: string[]): string {
  return execFileSync(process.execPath, [
    prismaCli,
    ...args,
    '--schema',
    schemaSource,
  ], {
    cwd: projectRoot,
    env: {
      ...process.env,
      SAFE_ERP_DATABASE_URL: databaseUrl(databasePath),
    },
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function runBaseline(
  databasePath: string,
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return execFileSync(process.execPath, [
    '--require',
    'ts-node/register',
    baselineScript,
    '--expected-database-path',
    databasePath,
    ...args,
  ], {
    cwd: projectRoot,
    env: {
      ...environment,
      SAFE_ERP_DATABASE_URL: databaseUrl(databasePath),
    },
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

async function migrationCount(): Promise<number> {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()
    && existsSync(join(migrationsDirectory, entry.name, 'migration.sql'))).length;
}

async function prepareSchemaMatchingTarget(name: string): Promise<string> {
  const projectPath = join(temporaryDirectory, name);
  const databasePath = join(projectPath, 'target.sqlite');
  runPrisma(databasePath, 'migrate', 'deploy');
  await executeSql(databasePath, `
    INSERT INTO "Entity" ("id", "name") VALUES ('entity-baseline', 'Synthetic baseline entity');
    INSERT INTO "Currency" ("id", "code", "name", "rate")
    VALUES ('currency-tn', 'TND', 'Tunisian dinar', 1), ('currency-eu', 'EUR', 'Euro', 3.4);
    INSERT INTO "PayrollRule" ("id", "name", "rate")
    VALUES ('payroll-rule-baseline', 'Synthetic preserved rule', 9.68);
    INSERT INTO "ChartOfAccount" ("id", "code", "description", "type")
    VALUES ('account-baseline', '101', 'Synthetic retained account', 'ASSET');
    INSERT INTO "JournalEntry" ("id", "entryNumber", "entityId", "description")
    VALUES ('journal-baseline', 'JRN-BASELINE', 'entity-baseline', 'Synthetic retained journal');
    INSERT INTO "JournalLine" ("id", "journalEntryId", "accountCode", "debit", "credit")
    VALUES ('journal-line-baseline', 'journal-baseline', '101', 125, 0);
    PRAGMA foreign_keys = OFF;
    DROP TABLE "_prisma_migrations";
    PRAGMA foreign_keys = ON;
  `);
  return databasePath;
}

describe('controlled Prisma migration baseline adoption', () => {
  before(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'safe-prisma-baseline-test-'));
  });

  after(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('preflights read-only and refuses schema mismatch before creating a backup or history', async () => {
    const databasePath = await prepareSchemaMatchingTarget('mismatch');
    const backupPath = join(temporaryDirectory, 'must-not-exist.sqlite');
    await executeSql(databasePath, 'CREATE TABLE "UnapprovedExtraTable" ("id" TEXT PRIMARY KEY)');

    assert.throws(() => runBaseline(databasePath, [
      '--adopt',
      '--backup-path',
      backupPath,
      '--confirm-target-offline',
      '--confirm-data-effects-reviewed',
    ]), /Target schema does not exactly match/i);

    assert.equal(await queryRows(databasePath, `
      SELECT "name" FROM sqlite_master WHERE "name" = '_prisma_migrations'
    `).then((rows) => rows.length), 0);
    assert.equal(await queryRows(databasePath, `
      SELECT "name" FROM sqlite_master WHERE "name" = 'UnapprovedExtraTable'
    `).then((rows) => rows.length), 1);
    assert.equal(existsSync(backupPath), false);
  });

  it('requires explicit offline and data-effect confirmations without modifying the target', async () => {
    const databasePath = await prepareSchemaMatchingTarget('missing-confirmation');
    const backupPath = join(temporaryDirectory, 'not-created.sqlite');

    assert.throws(() => runBaseline(databasePath, [
      '--adopt',
      '--backup-path',
      backupPath,
    ]), /--confirm-target-offline/);

    assert.equal(await queryRows(databasePath, `
      SELECT "name" FROM sqlite_master WHERE "name" = '_prisma_migrations'
    `).then((rows) => rows.length), 0);
    assert.equal(await queryRows(databasePath, `
      SELECT "id" FROM "JournalLine" WHERE "id" = 'journal-line-baseline'
    `).then((rows) => rows.length), 1);
    assert.equal(existsSync(backupPath), false);
  });

  it('refuses adoption while the current Prisma schema drifts and preserves the target', async () => {
    const databasePath = await prepareSchemaMatchingTarget('adopt');
    const backupPath = join(temporaryDirectory, 'must-not-be-created.sqlite');

    assert.throws(() => runBaseline(databasePath, [
      '--adopt',
      '--backup-path',
      backupPath,
      '--confirm-target-offline',
      '--confirm-data-effects-reviewed',
    ]), /differs from the current schema\.prisma/i);

    assert.equal(existsSync(backupPath), false);
    assert.equal(await queryRows(databasePath, `
      SELECT "name" FROM sqlite_master WHERE "name" = '_prisma_migrations'
    `).then((rows) => rows.length), 0);
    assert.deepEqual(await queryRows(databasePath, `
      SELECT "id", "code", "description" FROM "ChartOfAccount" WHERE "id" = 'account-baseline'
    `), [{
      id: 'account-baseline',
      code: '101',
      description: 'Synthetic retained account',
    }]);
    assert.deepEqual(await queryRows(databasePath, `
      SELECT "JournalEntry"."entryNumber", "JournalLine"."debit", "JournalLine"."credit"
      FROM "JournalEntry"
      JOIN "JournalLine" ON "JournalLine"."journalEntryId" = "JournalEntry"."id"
      WHERE "JournalEntry"."id" = 'journal-baseline'
    `), [{ entryNumber: 'JRN-BASELINE', debit: 125, credit: 0 }]);
    assert.deepEqual(await queryRows(databasePath, `
      SELECT "id", "code" FROM "Currency" ORDER BY "code"
    `), [{ id: 'currency-eu', code: 'EUR' }, { id: 'currency-tn', code: 'TND' }]);
    assert.deepEqual(await queryRows(databasePath, `
      SELECT "id", "name", "rate" FROM "PayrollRule" WHERE "id" = 'payroll-rule-baseline'
    `), [{
      id: 'payroll-rule-baseline',
      name: 'Synthetic preserved rule',
      rate: 9.68,
    }]);
    assert.deepEqual(await queryRows(databasePath, `
      SELECT "id" FROM "JournalLine" WHERE "id" = 'journal-line-baseline'
    `), [{ id: 'journal-line-baseline' }]);
  });

  it('copies staged migration metadata atomically and preserves target business rows', async () => {
    const targetPath = await prepareSchemaMatchingTarget('atomic-success');
    const stagedPath = join(temporaryDirectory, 'migration-history-stage.sqlite');
    runPrisma(stagedPath, 'migrate', 'deploy');

    await copyMigrationHistoryAtomically(targetPath, stagedPath);

    assert.match(runPrisma(targetPath, 'migrate', 'status'), /up to date/i);
    assert.equal(await queryRows(targetPath, `
      SELECT COUNT(*) AS "count" FROM "_prisma_migrations"
    `).then((rows: Array<{ count: number }>) => rows[0].count), await migrationCount());
    assert.deepEqual(await queryRows(targetPath, `
      SELECT "JournalEntry"."entryNumber", "JournalLine"."debit", "JournalLine"."credit"
      FROM "JournalEntry"
      JOIN "JournalLine" ON "JournalLine"."journalEntryId" = "JournalEntry"."id"
      WHERE "JournalEntry"."id" = 'journal-baseline'
    `), [{ entryNumber: 'JRN-BASELINE', debit: 125, credit: 0 }]);
  });

});
