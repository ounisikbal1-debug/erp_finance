import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import sqlite3 from 'sqlite3';
import { verifyPassword } from '../application/security/passwords';
import { resetUserPassword } from './reset-admin-password';

let temporaryDirectory: string;
let databasePath: string;
let databaseUrl: string;

function runSql(database: sqlite3.Database, sql: string, parameters: unknown[] = []): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    database.run(sql, parameters, (error) => error ? rejectRun(error) : resolveRun());
  });
}

function getRow<T>(database: sqlite3.Database, sql: string, parameters: unknown[] = []): Promise<T> {
  return new Promise((resolveRow, rejectRow) => {
    database.get<T>(sql, parameters, (error, row) => {
      if (error) rejectRow(error);
      else resolveRow(row);
    });
  });
}

function closeDatabase(database: sqlite3.Database): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    database.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

describe('admin password reset utility', () => {
  before(async () => {
    temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'safe-password-reset-'));
    databasePath = resolve(temporaryDirectory, 'test.db');
    databaseUrl = `file:${databasePath.replace(/\\/g, '/')}`;

    const database = new sqlite3.Database(databasePath);
    await runSql(database, `CREATE TABLE User (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'ADMIN',
      entityId TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await runSql(database, `CREATE TABLE CountryProfile (
      id TEXT PRIMARY KEY NOT NULL,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      corporateTax REAL NOT NULL,
      stampDuty REAL NOT NULL
    )`);
    await runSql(database, `CREATE TABLE TaxRate (
      id TEXT PRIMARY KEY NOT NULL,
      countryId TEXT NOT NULL,
      code TEXT NOT NULL,
      rate REAL NOT NULL,
      FOREIGN KEY (countryId) REFERENCES CountryProfile(id)
    )`);
    await runSql(database, `INSERT INTO User (id, username, passwordHash, role, entityId)
      VALUES ('user-1', 'admin', 'existing-hash', 'ADMIN', NULL)`);
    await runSql(database, `INSERT INTO User (id, username, passwordHash, role, entityId)
      VALUES ('user-2', 'finance', 'finance-existing-hash', 'FINANCE', 'entity-1')`);
    await runSql(database, `INSERT INTO CountryProfile (id, code, name, corporateTax, stampDuty)
      VALUES ('country-1', 'TN', 'Tunisie', 15.5, 1.0)`);
    await runSql(database, `INSERT INTO TaxRate (id, countryId, code, rate)
      VALUES ('tax-1', 'country-1', 'TVA_19', 19.0)`);
    await closeDatabase(database);
  });

  after(async () => {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('resets only the selected account password and preserves a recoverable backup', async () => {
    const backupPath = await resetUserPassword(databaseUrl, 'admin', 'Nouveau-mot-de-passe-2026');
    const database = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);
    const updatedUser = await getRow<{
      id: string;
      username: string;
      passwordHash: string;
      role: string;
      entityId: string | null;
      createdAt: string;
    }>(
      database,
      'SELECT id, username, passwordHash, role, entityId, createdAt FROM User WHERE username = ?',
      ['admin'],
    );
    const country = await getRow<{ code: string; corporateTax: number; stampDuty: number }>(
      database,
      'SELECT code, corporateTax, stampDuty FROM CountryProfile WHERE id = ?',
      ['country-1'],
    );
    const taxRate = await getRow<{ code: string; rate: number }>(
      database,
      'SELECT code, rate FROM TaxRate WHERE id = ?',
      ['tax-1'],
    );
    const unchangedUser = await getRow<{ passwordHash: string; role: string; entityId: string }>(
      database,
      'SELECT passwordHash, role, entityId FROM User WHERE username = ?',
      ['finance'],
    );
    await closeDatabase(database);

    assert.equal(await verifyPassword('Nouveau-mot-de-passe-2026', updatedUser.passwordHash), true);
    assert.equal(updatedUser.role, 'ADMIN');
    assert.equal(updatedUser.entityId, null);
    assert.deepEqual(unchangedUser, {
      passwordHash: 'finance-existing-hash',
      role: 'FINANCE',
      entityId: 'entity-1',
    });
    assert.deepEqual(country, { code: 'TN', corporateTax: 15.5, stampDuty: 1 });
    assert.deepEqual(taxRate, { code: 'TVA_19', rate: 19 });

    const backup = new sqlite3.Database(backupPath, sqlite3.OPEN_READONLY);
    const originalUser = await getRow<{
      id: string;
      username: string;
      passwordHash: string;
      role: string;
      entityId: string | null;
      createdAt: string;
    }>(
      backup,
      'SELECT id, username, passwordHash, role, entityId, createdAt FROM User WHERE username = ?',
      ['admin'],
    );
    const originalTaxRate = await getRow<{ rate: number }>(
      backup,
      'SELECT rate FROM TaxRate WHERE id = ?',
      ['tax-1'],
    );
    await closeDatabase(backup);
    assert.deepEqual(
      { ...updatedUser, passwordHash: originalUser.passwordHash },
      originalUser,
    );
    assert.notEqual(updatedUser.passwordHash, originalUser.passwordHash);
    assert.equal(originalTaxRate.rate, 19);
  });

  it('rejects short passwords and missing accounts before creating a backup', async () => {
    const backupsBefore = (await readdir(temporaryDirectory))
      .filter((name) => name.startsWith('test.db.backup-'));
    await assert.rejects(
      resetUserPassword(databaseUrl, 'admin', 'trop-court'),
      /au moins 12 caractères/,
    );
    await assert.rejects(
      resetUserPassword(databaseUrl, 'inconnu', 'Nouveau-mot-de-passe-2026'),
      /Aucun compte/,
    );
    await assert.rejects(
      resetUserPassword(databaseUrl, '   ', 'Nouveau-mot-de-passe-2026'),
      /ne peut pas être vide/,
    );
    const backupsAfter = (await readdir(temporaryDirectory))
      .filter((name) => name.startsWith('test.db.backup-'));
    assert.deepEqual(backupsAfter, backupsBefore);
  });
});
