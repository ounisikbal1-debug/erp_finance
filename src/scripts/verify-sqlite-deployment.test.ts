import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import sqlite3 from 'sqlite3';
import {
  resolveDeploymentTarget,
  verifyMigrationHistoryIsCurrent,
  verifySqliteDeploymentDatabase,
} from './verify-sqlite-deployment';

const projectRoot = resolve(__dirname, '../..');
const prismaCli = resolve(projectRoot, 'node_modules/prisma/build/index.js');
const schemaPath = resolve(projectRoot, 'src/data/prisma/schema.prisma');
let temporaryDirectory: string;
let databasePath: string;

function runSql(database: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    database.exec(sql, (error) => error ? rejectRun(error) : resolveRun());
  });
}

function closeDatabase(database: sqlite3.Database): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    database.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

describe('SQLite deployment preflight checks', () => {
  before(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'safe-deployment-check-'));
    databasePath = resolve(temporaryDirectory, 'target.sqlite');
    const database = new sqlite3.Database(databasePath);
    await runSql(database, `
      PRAGMA foreign_keys = ON;
      CREATE TABLE Parent (id TEXT PRIMARY KEY);
      CREATE TABLE Child (parentId TEXT REFERENCES Parent(id));
      INSERT INTO Parent (id) VALUES ('valid-parent');
      INSERT INTO Child (parentId) VALUES ('valid-parent');
    `);
    await closeDatabase(database);
  });

  after(async () => {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('requires an explicit matching absolute target', () => {
    assert.throws(
      () => resolveDeploymentTarget(undefined, databasePath),
      /SAFE_ERP_DATABASE_URL/,
    );
    assert.throws(
      () => resolveDeploymentTarget(`file:${databasePath}`, undefined),
      /chemin absolu/,
    );
    assert.throws(
      () => resolveDeploymentTarget('file:relative.sqlite', databasePath),
      /chemin SQLite absolu/,
    );
    assert.throws(
      () => resolveDeploymentTarget(`file:${databasePath}`, join(temporaryDirectory, 'other.sqlite')),
      /ne correspond pas/,
    );
    assert.equal(resolveDeploymentTarget(`file:${databasePath}`, databasePath), databasePath);
  });

  it('checks SQLite integrity and foreign keys without changing the file', async () => {
    const beforeCheck = await readFile(databasePath);
    await verifySqliteDeploymentDatabase(databasePath);
    const afterCheck = await readFile(databasePath);
    assert.deepEqual(afterCheck, beforeCheck);
  });

  it('runs the command-line preflight against the explicitly selected temporary target', () => {
    const output = execFileSync(process.execPath, [
      '--require',
      'ts-node/register',
      resolve(__dirname, 'verify-sqlite-deployment.ts'),
      '--expected-database-path',
      databasePath,
    ], {
      cwd: resolve(__dirname, '../..'),
      env: {
        ...process.env,
        SAFE_ERP_DATABASE_URL: `file:${databasePath.replace(/\\/g, '/')}`,
      },
      encoding: 'utf8',
      stdio: 'pipe',
    });

    assert.match(output, /PRAGMA integrity_check : ok/);
    assert.match(output, /PRAGMA foreign_key_check : 0 violation/);
    assert.match(output, new RegExp(databasePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  it('requires a current migration history for the post-deployment check', () => {
    const migratedDatabasePath = resolve(temporaryDirectory, 'post-deployment.sqlite');
    const databaseUrl = `file:${migratedDatabasePath.replace(/\\/g, '/')}`;
    execFileSync(process.execPath, [
      prismaCli,
      'migrate',
      'deploy',
      '--schema',
      schemaPath,
    ], {
      cwd: projectRoot,
      env: { ...process.env, SAFE_ERP_DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      stdio: 'pipe',
    });

    const output = execFileSync(process.execPath, [
      '--require',
      'ts-node/register',
      resolve(__dirname, 'verify-sqlite-deployment.ts'),
      '--expected-database-path',
      migratedDatabasePath,
      '--require-up-to-date',
    ], {
      cwd: projectRoot,
      env: { ...process.env, SAFE_ERP_DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    assert.match(output, /Historique Prisma à jour/);
    assert.match(verifyMigrationHistoryIsCurrent(migratedDatabasePath), /up to date/i);
  });

  it('refuses backup operations when no database target is configured', () => {
    const environment = { ...process.env };
    delete environment.SAFE_ERP_DATABASE_URL;
    assert.throws(() => execFileSync(process.execPath, [
      '--require',
      'ts-node/register',
      resolve(__dirname, 'manage-sqlite-backup.ts'),
      'backup',
    ], {
      cwd: resolve(__dirname, '../..'),
      env: environment,
      encoding: 'utf8',
      stdio: 'pipe',
    }), (error: unknown) => {
      assert.match(String((error as NodeJS.ErrnoException & { stderr?: Buffer }).stderr), /SAFE_ERP_DATABASE_URL/);
      return true;
    });
  });

  it('fails closed when the target contains a foreign-key violation', async () => {
    const database = new sqlite3.Database(databasePath);
    await runSql(database, "PRAGMA foreign_keys = OFF; INSERT INTO Child (parentId) VALUES ('missing-parent');");
    await closeDatabase(database);

    await assert.rejects(
      verifySqliteDeploymentDatabase(databasePath),
      /foreign_key_check.*1 violation/,
    );
  });
});
