import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import sqlite3 from 'sqlite3';
import {
  createSqliteBackup,
  verifySqliteIntegrity,
} from './sqlite-backup';

const SCHEMA_PATH = resolve(__dirname, '../data/prisma/schema.prisma');
const MIGRATIONS_PATH = resolve(__dirname, '../data/prisma/migrations');
const PROJECT_ROOT = resolve(__dirname, '../..');
const PRISMA_CLI = resolve(PROJECT_ROOT, 'node_modules/prisma/build/index.js');
const VALUE_FLAGS = new Set(['--expected-database-path', '--backup-path']);

type SchemaObject = {
  type: string;
  name: string;
  tableName: string;
  sql: string | null;
};

type MigrationHistoryRow = {
  id: string;
  migration_name: string;
  checksum: string;
  started_at: string;
  finished_at: string | null;
  rolled_back_at: string | null;
  logs: string | null;
  applied_steps_count: number;
};

type BaselineOptions = {
  databasePath: string;
  expectedDatabasePath: string;
  backupPath?: string;
  adopt: boolean;
  targetIsOffline: boolean;
  dataEffectsReviewed: boolean;
};

function getFlagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

function parseOptions(args: string[]): BaselineOptions {
  const allowedFlags = new Set([
    '--expected-database-path',
    '--backup-path',
    '--adopt',
    '--confirm-target-offline',
    '--confirm-data-effects-reviewed',
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!allowedFlags.has(arg)) throw new Error(`Unknown option or unexpected argument: ${arg}`);
    if (VALUE_FLAGS.has(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value.`);
      index += 1;
    }
  }

  const databaseUrl = process.env.SAFE_ERP_DATABASE_URL;
  if (!databaseUrl) throw new Error('SAFE_ERP_DATABASE_URL must explicitly identify the target SQLite file.');
  const expectedPathValue = getFlagValue(args, '--expected-database-path');
  if (!expectedPathValue || !isAbsolute(expectedPathValue)) {
    throw new Error('--expected-database-path must be the absolute path of the intended database.');
  }
  const databasePath = resolveSqlitePath(databaseUrl);
  const expectedDatabasePath = resolve(expectedPathValue);
  if (!samePath(databasePath, expectedDatabasePath)) {
    throw new Error(
      `Configured SQLite target does not match --expected-database-path (configured: ${databasePath}).`,
    );
  }

  const adopt = args.includes('--adopt');
  const backupPathValue = getFlagValue(args, '--backup-path');
  if (adopt && (!backupPathValue || !isAbsolute(backupPathValue))) {
    throw new Error('--adopt requires an absolute --backup-path for a new verified backup file.');
  }
  if (!adopt && backupPathValue) {
    throw new Error('--backup-path is only accepted together with --adopt.');
  }

  return {
    databasePath,
    expectedDatabasePath,
    backupPath: backupPathValue ? resolve(backupPathValue) : undefined,
    adopt,
    targetIsOffline: args.includes('--confirm-target-offline'),
    dataEffectsReviewed: args.includes('--confirm-data-effects-reviewed'),
  };
}

function resolveSqlitePath(databaseUrl: string): string {
  const [fileUrl, ...queryParts] = databaseUrl.split('?');
  if (!fileUrl.startsWith('file:')) {
    throw new Error('Only persistent SQLite file: URLs are supported for baseline adoption.');
  }
  const query = new URLSearchParams(queryParts.join('?'));
  let filename = decodeURIComponent(fileUrl.slice('file:'.length));
  if (!filename || filename === ':memory:' || query.get('mode') === 'memory') {
    throw new Error('A persistent SQLite database is required for baseline adoption.');
  }
  filename = filename.replace(/^\/+([A-Za-z]:[\\/])/, '$1');
  return resolve(dirname(SCHEMA_PATH), filename);
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left).replace(/[\\/]+$/, '');
  const normalizedRight = resolve(right).replace(/[\\/]+$/, '');
  return process.platform === 'win32'
    ? normalizedLeft.toLocaleLowerCase() === normalizedRight.toLocaleLowerCase()
    : normalizedLeft === normalizedRight;
}

function runPrisma(databasePath: string, ...args: string[]): string {
  return execFileSync(process.execPath, [
    PRISMA_CLI,
    ...args,
    '--schema',
    SCHEMA_PATH,
  ], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      SAFE_ERP_DATABASE_URL: `file:${databasePath.replace(/\\/g, '/')}`,
    },
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function query<T>(databasePath: string, sql: string): Promise<T[]> {
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

async function getSchemaObjects(databasePath: string): Promise<SchemaObject[]> {
  const objects = await query<SchemaObject>(databasePath, `
    SELECT "type", "name", "tbl_name" AS "tableName", "sql"
    FROM sqlite_master
    WHERE "name" NOT LIKE 'sqlite_%'
      AND "name" <> '_prisma_migrations'
    ORDER BY "type", "name"
  `);
  return objects.map((object) => ({
    ...object,
    sql: object.sql?.replace(/\s+/g, ' ').trim() ?? null,
  }));
}

function fingerprint(objects: SchemaObject[]): string {
  return createHash('sha256').update(JSON.stringify(objects)).digest('hex');
}

function schemaDifference(expected: SchemaObject[], actual: SchemaObject[]): string[] {
  const expectedByName = new Map(expected.map((object) => [`${object.type}:${object.name}`, object]));
  const actualByName = new Map(actual.map((object) => [`${object.type}:${object.name}`, object]));
  const names = new Set([...expectedByName.keys(), ...actualByName.keys()]);
  return [...names].sort().flatMap((name) => {
    const expectedObject = expectedByName.get(name);
    const actualObject = actualByName.get(name);
    if (!expectedObject) return [`extra ${name}`];
    if (!actualObject) return [`missing ${name}`];
    return JSON.stringify(expectedObject) === JSON.stringify(actualObject)
      ? []
      : [`definition differs ${name}`];
  });
}

function getDataEffectMigrations(migrationDirectories: string[]): string[] {
  return migrationDirectories.filter((name) => {
    const sql = readFileSync(resolve(MIGRATIONS_PATH, name, 'migration.sql'), 'utf8');
    return /\b(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO|DROP\s+TABLE|DROP\s+INDEX)\b/i.test(sql);
  });
}

async function migrationDirectories(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_PATH, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const name of directories) {
    if (!existsSync(resolve(MIGRATIONS_PATH, name, 'migration.sql'))) {
      throw new Error(`Migration directory has no migration.sql: ${name}`);
    }
  }
  if (!existsSync(resolve(MIGRATIONS_PATH, 'migration_lock.toml'))) {
    throw new Error('Prisma migration_lock.toml is missing.');
  }
  return directories;
}

function assertNoSqliteSidecars(databasePath: string): void {
  const sidecars = [`${databasePath}-wal`, `${databasePath}-shm`, `${databasePath}-journal`]
    .filter(existsSync);
  if (sidecars.length) {
    throw new Error(
      `Baseline refused: SQLite sidecar files exist (${sidecars.join(', ')}); verify the database is offline and coherent.`,
    );
  }
}

async function assertDatabaseReady(databasePath: string): Promise<void> {
  if (!existsSync(databasePath)) throw new Error(`Target SQLite database does not exist: ${databasePath}`);
  assertNoSqliteSidecars(databasePath);
  await verifySqliteIntegrity(databasePath);
  const tables = await query<{ name: string }>(databasePath, `
    SELECT "name" FROM sqlite_master
    WHERE "type" = 'table' AND "name" = '_prisma_migrations'
  `);
  if (tables.length) {
    throw new Error('Target already has _prisma_migrations; this tool only handles a database with no Prisma history.');
  }
  const foreignKeyViolations = await query<Record<string, unknown>>(databasePath, 'PRAGMA foreign_key_check');
  if (foreignKeyViolations.length) {
    throw new Error(`Target has ${foreignKeyViolations.length} SQLite foreign-key violation(s).`);
  }
}

async function createReferenceDatabase(temporaryDirectory: string): Promise<string> {
  const referenceDirectory = resolve(temporaryDirectory, 'reference');
  const prismaDirectory = resolve(referenceDirectory, 'prisma');
  await mkdir(prismaDirectory, { recursive: true });
  await cp(MIGRATIONS_PATH, resolve(prismaDirectory, 'migrations'), { recursive: true });
  await cp(SCHEMA_PATH, resolve(prismaDirectory, 'schema.prisma'));
  const referenceDatabasePath = resolve(referenceDirectory, 'reference.sqlite');
  runPrisma(referenceDatabasePath, 'migrate', 'deploy');
  const status = runPrisma(referenceDatabasePath, 'migrate', 'status');
  if (!/up to date/i.test(status)) throw new Error('Disposable migration reference is not up to date.');
  return referenceDatabasePath;
}

async function assertSchemaMatches(targetPath: string, referencePath: string): Promise<string> {
  const [expected, actual] = await Promise.all([
    getSchemaObjects(referencePath),
    getSchemaObjects(targetPath),
  ]);
  const expectedFingerprint = fingerprint(expected);
  const actualFingerprint = fingerprint(actual);
  if (expectedFingerprint !== actualFingerprint) {
    const differences = schemaDifference(expected, actual).slice(0, 20);
    throw new Error(
      `Target schema does not exactly match the versioned migration result ` +
      `(expected ${expectedFingerprint.slice(0, 16)}, actual ${actualFingerprint.slice(0, 16)}). ` +
      `Differences: ${differences.join('; ')}${schemaDifference(expected, actual).length > 20 ? '; …' : ''}`,
    );
  }
  return actualFingerprint;
}

function assertMigrationHistoryMatchesPrismaSchema(temporaryDirectory: string): void {
  const shadowDatabasePath = resolve(temporaryDirectory, 'schema-diff-shadow.sqlite');
  const shadowDatabaseUrl = `file:${shadowDatabasePath.replace(/\\/g, '/')}`;
  const result = spawnSync(process.execPath, [
    PRISMA_CLI,
    'migrate',
    'diff',
    '--from-migrations',
    MIGRATIONS_PATH,
    '--to-schema-datamodel',
    SCHEMA_PATH,
    '--shadow-database-url',
    shadowDatabaseUrl,
    '--exit-code',
  ], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      SAFE_ERP_DATABASE_URL: shadowDatabaseUrl,
    },
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.error) throw result.error;
  if (result.status === 2) {
    const details = `${result.stdout || ''}${result.stderr || ''}`.trim().slice(0, 2000);
    throw new Error(
      'Baseline adoption is blocked: the versioned migration result differs from the current ' +
      'schema.prisma. Review and resolve this drift non-destructively before adopting history.' +
      (details ? ` Prisma diff summary: ${details}` : ''),
    );
  }
  if (result.status !== 0) {
    const details = `${result.stdout || ''}${result.stderr || ''}`.trim();
    throw new Error(
      `Could not verify migration/schema alignment (exit ${result.status ?? 'unknown'}).` +
      (details ? ` ${details}` : ''),
    );
  }
}

async function assertBackupMatches(
  targetPath: string,
  backupPath: string,
  expectedFingerprint: string,
): Promise<void> {
  if (samePath(targetPath, backupPath)) throw new Error('Backup path must differ from the database target.');
  await createSqliteBackup(targetPath, backupPath);
  const backupObjects = await getSchemaObjects(backupPath);
  if (fingerprint(backupObjects) !== expectedFingerprint) {
    throw new Error('Created backup schema does not match the preflighted target.');
  }
  const foreignKeyViolations = await query<Record<string, unknown>>(backupPath, 'PRAGMA foreign_key_check');
  if (foreignKeyViolations.length) {
    throw new Error(`Backup has ${foreignKeyViolations.length} SQLite foreign-key violation(s).`);
  }
}

async function resolveHistory(databasePath: string, migrations: string[]): Promise<void> {
  for (const migrationName of migrations) {
    runPrisma(databasePath, 'migrate', 'resolve', '--applied', migrationName);
  }
  const status = runPrisma(databasePath, 'migrate', 'status');
  if (!/up to date/i.test(status)) throw new Error('Adopted Prisma history did not reach an up-to-date status.');
}

async function readMigrationHistory(databasePath: string): Promise<{
  createTableSql: string;
  rows: MigrationHistoryRow[];
}> {
  const table = await query<{ sql: string | null }>(databasePath, `
    SELECT "sql" FROM sqlite_master
    WHERE "type" = 'table' AND "name" = '_prisma_migrations'
  `);
  if (!table[0]?.sql) throw new Error('Staged Prisma migration history table is missing.');
  const rows = await query<MigrationHistoryRow>(databasePath, `
    SELECT "id", "migration_name", "checksum", "started_at", "finished_at",
           "rolled_back_at", "logs", "applied_steps_count"
    FROM "_prisma_migrations"
    ORDER BY "started_at", "migration_name"
  `);
  return { createTableSql: table[0].sql, rows };
}

function runSql(
  database: sqlite3.Database,
  sql: string,
  parameters: Array<string | number | null> = [],
): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    database.run(sql, parameters, (error) => error ? rejectRun(error) : resolveRun());
  });
}

export async function copyMigrationHistoryAtomically(
  targetPath: string,
  stagedPath: string,
): Promise<void> {
  const history = await readMigrationHistory(stagedPath);
  if (!history.rows.length) throw new Error('Staged Prisma migration history is empty.');

  const target = new sqlite3.Database(targetPath, sqlite3.OPEN_READWRITE);
  let transactionStarted = false;
  try {
    await runSql(target, 'BEGIN IMMEDIATE');
    transactionStarted = true;

    const existingHistory = await new Promise<boolean>((resolveExists, rejectExists) => {
      target.get<{ count: number }>(`
        SELECT COUNT(*) AS "count" FROM sqlite_master
        WHERE "type" = 'table' AND "name" = '_prisma_migrations'
      `, (error, row) => {
        if (error) rejectExists(error);
        else resolveExists((row?.count ?? 0) > 0);
      });
    });
    if (existingHistory) {
      throw new Error('Target acquired _prisma_migrations during baseline; refusing metadata insertion.');
    }

    await runSql(target, history.createTableSql);
    for (const row of history.rows) {
      await runSql(target, `
        INSERT INTO "_prisma_migrations" (
          "id", "migration_name", "checksum", "started_at", "finished_at",
          "rolled_back_at", "logs", "applied_steps_count"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        row.id,
        row.migration_name,
        row.checksum,
        row.started_at,
        row.finished_at,
        row.rolled_back_at,
        row.logs,
        row.applied_steps_count,
      ]);
    }
    await runSql(target, 'COMMIT');
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      try {
        await runSql(target, 'ROLLBACK');
      } catch (rollbackError) {
        throw new Error('Migration metadata transaction failed and rollback also failed.', {
          cause: new AggregateError([error, rollbackError]),
        });
      }
    }
    throw error;
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      target.close((error) => error ? rejectClose(error) : resolveClose());
    });
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  await assertDatabaseReady(options.databasePath);

  const temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'safe-prisma-baseline-'));
  try {
    const migrations = await migrationDirectories();
    const dataEffectMigrations = getDataEffectMigrations(migrations);
    const referencePath = await createReferenceDatabase(temporaryDirectory);
    const schemaFingerprint = await assertSchemaMatches(options.databasePath, referencePath);

    process.stdout.write(
      `Target identity verified: ${options.expectedDatabasePath}\n` +
      `SQLite integrity and foreign keys verified; no Prisma history exists.\n` +
      `Schema matches ${migrations.length} versioned migrations (SHA-256 ${schemaFingerprint}).\n` +
      `Migrations with data/destructive SQL requiring operator review: ${dataEffectMigrations.join(', ') || 'none'}\n`,
    );

    if (!options.adopt) {
      process.stdout.write('Read-only preflight complete; no target or backup files were written.\n');
      return;
    }
    if (!options.targetIsOffline) {
      throw new Error('--adopt requires --confirm-target-offline; this tool never stops a server.');
    }
    if (!options.dataEffectsReviewed) {
      throw new Error('--adopt requires --confirm-data-effects-reviewed after review of the listed migration SQL.');
    }
    if (!options.backupPath) {
      throw new Error('--adopt requires a new --backup-path.');
    }

    assertMigrationHistoryMatchesPrismaSchema(temporaryDirectory);
    await assertBackupMatches(options.databasePath, options.backupPath, schemaFingerprint);
    const stagedDatabasePath = resolve(temporaryDirectory, 'adoption-stage.sqlite');
    await createSqliteBackup(options.backupPath, stagedDatabasePath);
    await resolveHistory(stagedDatabasePath, migrations);
    const currentSchemaFingerprint = fingerprint(await getSchemaObjects(options.databasePath));
    if (currentSchemaFingerprint !== schemaFingerprint) {
      throw new Error('Target schema changed after preflight; refusing Prisma metadata adoption.');
    }
    assertNoSqliteSidecars(options.databasePath);
    await copyMigrationHistoryAtomically(options.databasePath, stagedDatabasePath);
    const status = runPrisma(options.databasePath, 'migrate', 'status');
    if (!/up to date/i.test(status)) {
      throw new Error('Adopted Prisma history did not reach an up-to-date status.');
    }

    process.stdout.write(
      `Migration history adopted without executing migration SQL. Verified backup: ${options.backupPath}\n`,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown baseline adoption error.';
    process.stderr.write(`Prisma baseline adoption refused/failed: ${message}\n`);
    process.exitCode = 1;
  });
}
