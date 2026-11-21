import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import sqlite3 from 'sqlite3';
import {
  createSqliteBackup,
  restoreSqliteBackup,
  verifySqliteIntegrity,
} from './sqlite-backup';

let temporaryDirectory: string;
let databasePath: string;
let backupPath: string;

function runSql(database: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    database.run(sql, (error) => error ? rejectRun(error) : resolveRun());
  });
}

function getValue(database: sqlite3.Database): Promise<string> {
  return new Promise((resolveValue, rejectValue) => {
    database.get<{ value: string }>('SELECT value FROM Snapshot', (error, row) => {
      if (error) rejectValue(error);
      else resolveValue(row.value);
    });
  });
}

function closeDatabase(database: sqlite3.Database): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    database.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

describe('SQLite backup and restore utilities', () => {
  before(async () => {
    temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'safe-sqlite-backup-'));
    databasePath = resolve(temporaryDirectory, 'target.db');
    backupPath = resolve(temporaryDirectory, 'known-good.sqlite');

    const database = new sqlite3.Database(databasePath);
    await runSql(database, 'CREATE TABLE Snapshot (value TEXT NOT NULL)');
    await runSql(database, "INSERT INTO Snapshot (value) VALUES ('before-change')");
    await closeDatabase(database);
  });

  after(async () => {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('creates an exclusive, integrity-checked backup and restores it with a rollback copy', async () => {
    await createSqliteBackup(databasePath, backupPath);
    await assert.rejects(createSqliteBackup(databasePath, backupPath), /EEXIST/);

    const database = new sqlite3.Database(databasePath);
    await runSql(database, "UPDATE Snapshot SET value = 'after-change'");
    await closeDatabase(database);

    const rollbackPath = await restoreSqliteBackup(databasePath, backupPath, true);
    await verifySqliteIntegrity(databasePath);
    await verifySqliteIntegrity(rollbackPath);

    const restoredDatabase = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);
    assert.equal(await getValue(restoredDatabase), 'before-change');
    await closeDatabase(restoredDatabase);

    const rollbackDatabase = new sqlite3.Database(rollbackPath, sqlite3.OPEN_READONLY);
    assert.equal(await getValue(rollbackDatabase), 'after-change');
    await closeDatabase(rollbackDatabase);
  });

  it('refuses restore without offline confirmation and leaves the target unchanged', async () => {
    const database = new sqlite3.Database(databasePath);
    await runSql(database, "UPDATE Snapshot SET value = 'still-current'");
    await closeDatabase(database);

    const filesBefore = (await readdir(temporaryDirectory)).sort();
    await assert.rejects(
      restoreSqliteBackup(databasePath, backupPath, false),
      /base cible est hors ligne/,
    );
    const filesAfter = (await readdir(temporaryDirectory)).sort();
    assert.deepEqual(filesAfter, filesBefore);

    const unchangedDatabase = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);
    assert.equal(await getValue(unchangedDatabase), 'still-current');
    await closeDatabase(unchangedDatabase);
  });

  it('refuses a target with SQLite sidecars and an invalid backup', async () => {
    const walPath = `${databasePath}-wal`;
    await writeFile(walPath, 'temporary sidecar marker');
    await assert.rejects(restoreSqliteBackup(databasePath, backupPath, true), /fichiers SQLite annexes/);
    await unlink(walPath);

    const invalidBackupPath = resolve(temporaryDirectory, 'invalid.sqlite');
    await writeFile(invalidBackupPath, 'not a SQLite database');
    await assert.rejects(
      restoreSqliteBackup(databasePath, invalidBackupPath, true),
      /SQLite|database|file/i,
    );

    const unchangedDatabase = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);
    assert.equal(await getValue(unchangedDatabase), 'still-current');
    await closeDatabase(unchangedDatabase);
  });
});
