import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { open, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import sqlite3 from 'sqlite3';
import type { Prisma, PrismaClient } from '@prisma/client';
import { resolveDatabaseConfiguration } from '../data/prisma/database-config';

export interface SourceColumn {
  name: string;
}

export interface TargetColumn {
  name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
}

export interface SourceTable {
  name: string;
  rowCount: number;
  columns: SourceColumn[];
  dependencies: string[];
}

export interface TargetTable {
  name: string;
  rowCount: number;
  columns: TargetColumn[];
}

export interface TableImportPlan {
  name: string;
  rowCount: number;
  columns: SourceColumn[];
  dependencies: string[];
  omittedTargetColumns: string[];
}

export function buildTableImportPlan(
  sourceTables: SourceTable[],
  targetTables: TargetTable[],
): TableImportPlan[] {
  const targetByName = new Map(targetTables.map((table) => [table.name, table]));
  const blockers: string[] = [];
  const sourceByName = new Map(sourceTables.map((table) => [table.name, table]));

  for (const source of sourceTables) {
    if (!targetByName.has(source.name)) {
      blockers.push(`La table SQLite "${source.name}" n’existe pas dans le schéma PostgreSQL.`);
      continue;
    }

    const target = targetByName.get(source.name)!;
    const targetColumns = new Map(target.columns.map((column) => [column.name, column]));
    for (const column of source.columns) {
      if (!targetColumns.has(column.name)) {
        blockers.push(`La colonne SQLite "${source.name}"."${column.name}" n’existe pas dans PostgreSQL.`);
      }
    }
    const sourceColumnNames = new Set(source.columns.map((column) => column.name));
    for (const column of target.columns) {
      if (
        !sourceColumnNames.has(column.name)
        && column.is_nullable === 'NO'
        && column.column_default === null
      ) {
        blockers.push(
          `La colonne PostgreSQL requise "${source.name}"."${column.name}" ` +
          'est absente de la source et ne possède pas de valeur par défaut.',
        );
      }
    }
  }

  if (blockers.length > 0) {
    throw new Error(blockers.join('\n'));
  }

  const remaining = new Set(sourceTables.map((table) => table.name));
  const ordered: TableImportPlan[] = [];
  const sourceOrder = new Map(sourceTables.map((table, index) => [table.name, index]));
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((name) => sourceByName.get(name)!.dependencies.every(
        (dependency) => dependency === name || !remaining.has(dependency),
      ))
      .filter((name) => name !== 'MonthlyCloseLock' || remaining.size === 1)
      .sort((left, right) => sourceOrder.get(left)! - sourceOrder.get(right)!);
    if (ready.length === 0) {
      ready.push(...[...remaining].sort());
    }
    for (const name of ready) {
      const source = sourceByName.get(name)!;
      const target = targetByName.get(name)!;
      const sourceColumns = new Set(source.columns.map((column) => column.name));
      ordered.push({
        name,
        rowCount: source.rowCount,
        columns: source.columns,
        dependencies: source.dependencies,
        omittedTargetColumns: target.columns
          .filter((column) => !sourceColumns.has(column.name))
          .map((column) => column.name),
      });
      remaining.delete(name);
    }
  }
  return ordered;
}

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Identifiant SQL source non pris en charge : ${identifier}`);
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

function openSourceDatabase(databasePath: string): sqlite3.Database {
  return new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);
}

function all<T>(database: sqlite3.Database, sql: string): Promise<T[]> {
  return new Promise((resolveRows, rejectRows) => {
    database.all(sql, (error, rows) => {
      if (error) rejectRows(error);
      else resolveRows(rows as T[]);
    });
  });
}

function get<T>(database: sqlite3.Database, sql: string): Promise<T | undefined> {
  return new Promise((resolveRow, rejectRow) => {
    database.get(sql, (error, row) => {
      if (error) rejectRow(error);
      else resolveRow(row as T | undefined);
    });
  });
}

async function closeSourceDatabase(database: sqlite3.Database): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    database.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

function migrationStatus(): string {
  const projectRoot = resolve(__dirname, '../..');
  const prismaCli = resolve(projectRoot, 'node_modules/prisma/build/index.js');
  const schemaPath = resolve(__dirname, '../data/prisma/postgresql/schema.prisma');
  return execFileSync(process.execPath, [
    prismaCli,
    'migrate',
    'status',
    '--schema',
    schemaPath,
  ], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Erreur inconnue.';
  return message.replace(/(postgres(?:ql)?:\/\/)[^/@\s]+@/gi, '$1[identifiants masqués]@');
}

function parseArguments(args: string[]): {
  sourcePath: string;
  reportPath: string;
  approvedReportPath?: string;
  apply: boolean;
  confirmTargetEmpty: boolean;
} {
  let sourcePath: string | undefined;
  let reportPath: string | undefined;
  let approvedReportPath: string | undefined;
  let apply = false;
  let confirmTargetEmpty = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--source') {
      sourcePath = args[++index];
    } else if (args[index] === '--report') {
      reportPath = args[++index];
    } else if (args[index] === '--approved-report') {
      approvedReportPath = args[++index];
    } else if (args[index] === '--apply') {
      apply = true;
    } else if (args[index] === '--confirm-target-empty') {
      confirmTargetEmpty = true;
    } else {
      throw new Error(`Option inconnue : ${args[index]}`);
    }
  }
  if (!sourcePath || !isAbsolute(sourcePath)) {
    throw new Error('--source exige le chemin absolu d’une base SQLite de sauvegarde.');
  }
  if (!reportPath || !isAbsolute(reportPath)) {
    throw new Error('--report exige un chemin absolu vers un nouveau rapport JSON.');
  }
  if (apply && !confirmTargetEmpty) {
    throw new Error('--apply exige aussi --confirm-target-empty.');
  }
  if (apply && (!approvedReportPath || !isAbsolute(approvedReportPath))) {
    throw new Error('--apply exige --approved-report avec le chemin absolu d’un dry-run validé.');
  }
  if (!apply && approvedReportPath) {
    throw new Error('--approved-report ne s’utilise qu’avec --apply.');
  }
  if (!apply && confirmTargetEmpty) {
    throw new Error('--confirm-target-empty ne s’utilise qu’avec --apply.');
  }
  if (approvedReportPath && resolve(approvedReportPath) === resolve(reportPath)) {
    throw new Error('--approved-report et --report doivent désigner des fichiers différents.');
  }
  return {
    sourcePath: resolve(sourcePath),
    reportPath: resolve(reportPath),
    approvedReportPath: approvedReportPath ? resolve(approvedReportPath) : undefined,
    apply,
    confirmTargetEmpty,
  };
}

function fileSha256(filePath: string): Promise<string> {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', rejectHash);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

function importPlanSha256(plan: TableImportPlan[], targetTables: TargetTable[]): string {
  const fingerprint = {
    tables: plan.map(({ name, rowCount, columns, dependencies, omittedTargetColumns }) => ({
      name,
      rowCount,
      columns: columns.map(({ name: columnName }) => columnName),
      dependencies,
      omittedTargetColumns,
    })),
    targetTables: targetTables.map(({ name, columns }) => ({
      name,
      columns: columns.map(({ name: columnName, data_type, is_nullable, column_default }) => ({
        name: columnName,
        data_type,
        is_nullable,
        column_default,
      })),
    })),
  };
  return createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');
}

export function assertApprovedDryRun(
  approvedReport: unknown,
  expected: {
    sourceSha256: string;
    targetFingerprint: string;
    planFingerprint: string;
    migrationStatusFingerprint: string;
    migrationSetFingerprint: string;
  },
): void {
  if (!approvedReport || typeof approvedReport !== 'object') {
    throw new Error('Le rapport de dry-run approuvé est invalide.');
  }
  const report = approvedReport as Record<string, unknown>;
  if (
    report.status !== 'dry-run-valid'
    || report.mode !== 'dry-run'
    || report.sourceSha256 !== expected.sourceSha256
    || report.targetFingerprint !== expected.targetFingerprint
    || report.planFingerprint !== expected.planFingerprint
    || report.migrationStatusFingerprint !== expected.migrationStatusFingerprint
    || report.migrationSetFingerprint !== expected.migrationSetFingerprint
  ) {
    throw new Error('Le rapport approuvé ne correspond pas à cette source, cible ou prévalidation.');
  }
}

async function postgresqlMigrationSetSha256(): Promise<string> {
  const migrationRoot = resolve(__dirname, '../data/prisma/postgresql/migrations');
  const entries = await readdir(migrationRoot, { withFileTypes: true });
  const hash = createHash('sha256');
  const migrationNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const migrationName of migrationNames) {
    const migrationFile = resolve(migrationRoot, migrationName, 'migration.sql');
    hash.update(migrationName);
    hash.update('\0');
    hash.update(await readFile(migrationFile));
    hash.update('\0');
  }
  hash.update(await readFile(resolve(__dirname, '../data/prisma/postgresql/schema.prisma')));
  hash.update(await readFile(resolve(__dirname, '../data/prisma/postgresql/migration_lock.toml')));
  return hash.digest('hex');
}

async function inspectSource(databasePath: string): Promise<{
  database: sqlite3.Database;
  tables: SourceTable[];
  triggers: string[];
  migrationNames: string[];
}> {
  const database = openSourceDatabase(databasePath);
  try {
    const integrity = await get<{ integrity_check: string }>(database, 'PRAGMA integrity_check');
    assert.equal(integrity?.integrity_check, 'ok', 'PRAGMA integrity_check n’a pas retourné ok.');
    const foreignKeyViolations = await all<Record<string, unknown>>(database, 'PRAGMA foreign_key_check');
    assert.equal(
      foreignKeyViolations.length,
      0,
      `La source contient ${foreignKeyViolations.length} violation(s) de clé étrangère.`,
    );
    const tableRows = await all<{ name: string }>(
      database,
      `SELECT "name" FROM "sqlite_master"
       WHERE "type" = 'table'
         AND "name" NOT LIKE 'sqlite_%'
         AND "name" <> '_prisma_migrations'
       ORDER BY "name"`,
    );
    const tables: SourceTable[] = [];
    for (const { name } of tableRows) {
      quoteIdentifier(name);
      const columns = await all<{ name: string }>(database, `PRAGMA table_info(${quoteIdentifier(name)})`);
      const references = await all<{ table: string }>(database, `PRAGMA foreign_key_list(${quoteIdentifier(name)})`);
      const count = await get<{ count: number }>(
        database,
        `SELECT COUNT(*) AS "count" FROM ${quoteIdentifier(name)}`,
      );
      tables.push({
        name,
        columns,
        rowCount: Number(count?.count ?? 0),
        dependencies: [...new Set(references.map((reference) => reference.table))],
      });
    }
    const triggerRows = await all<{ name: string }>(
      database,
      `SELECT "name" FROM "sqlite_master" WHERE "type" = 'trigger' ORDER BY "name"`,
    );
    const migrationTable = await get<{ name: string }>(
      database,
      `SELECT "name" FROM "sqlite_master" WHERE "type" = 'table' AND "name" = '_prisma_migrations'`,
    );
    let migrationNames: string[] = [];
    if (migrationTable) {
      const migrationColumns = await all<{ name: string }>(database, 'PRAGMA table_info("_prisma_migrations")');
      const availableMigrationColumns = new Set(migrationColumns.map(({ name }) => name));
      if (['migration_name', 'finished_at', 'rolled_back_at', 'started_at']
        .every((columnName) => availableMigrationColumns.has(columnName))) {
        const appliedMigrations = await all<{ migration_name: string }>(
          database,
          `SELECT "migration_name" FROM "_prisma_migrations"
           WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
           ORDER BY "started_at", "migration_name"`,
        );
        migrationNames = appliedMigrations.map(({ migration_name }) => migration_name);
      }
    }
    return {
      database,
      tables,
      triggers: triggerRows.map((row) => row.name),
      migrationNames,
    };
  } catch (error) {
    await closeSourceDatabase(database);
    throw error;
  }
}

async function targetMetadata(client: Pick<PrismaClient, '$queryRawUnsafe'>): Promise<{
  databaseName: string;
  tables: TargetTable[];
  nonDeferrableForeignKeys: string[];
}> {
  const [databaseResult, tableRows, foreignKeyRows] = await Promise.all([
    client.$queryRawUnsafe('SELECT current_database() AS "databaseName"'),
    client.$queryRawUnsafe(
      `SELECT "table_name" AS "name"
       FROM "information_schema"."tables"
       WHERE "table_schema" = 'public'
         AND "table_type" = 'BASE TABLE'
         AND "table_name" <> '_prisma_migrations'
       ORDER BY "table_name"`,
    ),
    client.$queryRawUnsafe(
      `SELECT "constraint_name" AS "name"
       FROM "information_schema"."table_constraints"
       WHERE "constraint_schema" = 'public'
         AND "constraint_type" = 'FOREIGN KEY'
         AND "is_deferrable" = 'NO'
       ORDER BY "constraint_name"`,
    ),
  ]);
  const databaseName = (databaseResult as Array<{ databaseName: string }>)[0]?.databaseName;
  const names = (tableRows as Array<{ name: string }>).map(({ name }) => name);
  const tables: TargetTable[] = [];
  for (const name of names) {
    quoteIdentifier(name);
    const columns = await client.$queryRawUnsafe(
      `SELECT "column_name" AS "name", "data_type", "is_nullable", "column_default"
       FROM "information_schema"."columns"
       WHERE "table_schema" = 'public' AND "table_name" = $1
       ORDER BY "ordinal_position"`,
      name,
    ) as TargetColumn[];
    const result = await client.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint AS "count" FROM "public".${quoteIdentifier(name)}`,
    ) as Array<{ count: bigint | string }>;
    tables.push({ name, columns, rowCount: Number(result[0]?.count ?? 0) });
  }
  return {
    databaseName,
    tables,
    nonDeferrableForeignKeys: (foreignKeyRows as Array<{ name: string }>).map(({ name }) => name),
  };
}

function validateTargetIsEmpty(tables: TargetTable[]): void {
  const populated = tables.filter((table) => table.rowCount !== 0);
  if (populated.length > 0) {
    throw new Error(
      `La cible PostgreSQL n’est pas vide : ${populated.map((table) => `${table.name}=${table.rowCount}`).join(', ')}.`,
    );
  }
}

function convertValue(value: unknown, column: TargetColumn): unknown {
  if (value === null || value === undefined) return null;
  if (column.data_type === 'boolean') {
    if (value === 1 || value === '1' || value === true) return true;
    if (value === 0 || value === '0' || value === false) return false;
    throw new Error(`Valeur booléenne invalide dans la colonne "${column.name}".`);
  }
  if (column.data_type === 'json' || column.data_type === 'jsonb') {
    if (typeof value !== 'string') return value;
    JSON.parse(value);
  }
  return value;
}

function postgresTypeCast(column: TargetColumn): string {
  switch (column.data_type) {
    case 'date':
      return '::date';
    case 'json':
      return '::json';
    case 'jsonb':
      return '::jsonb';
    case 'timestamp without time zone':
      return '::timestamp';
    case 'timestamp with time zone':
      return '::timestamptz';
    default:
      return '';
  }
}

async function readSourceBatch(
  database: sqlite3.Database,
  tableName: string,
  columns: SourceColumn[],
  limit: number,
  offset: number,
): Promise<Array<Record<string, unknown>>> {
  const columnList = columns.map((column) => quoteIdentifier(column.name)).join(', ');
  return all(
    database,
    `SELECT ${columnList} FROM ${quoteIdentifier(tableName)} LIMIT ${limit} OFFSET ${offset}`,
  );
}

async function importTables(
  database: sqlite3.Database,
  target: Prisma.TransactionClient,
  plan: TableImportPlan[],
): Promise<void> {
  for (const table of plan) {
    if (table.rowCount === 0) continue;
    const targetColumns = await target.$queryRawUnsafe(
      `SELECT "column_name" AS "name", "data_type", "is_nullable", "column_default"
       FROM "information_schema"."columns"
       WHERE "table_schema" = 'public' AND "table_name" = $1`,
      table.name,
    ) as TargetColumn[];
    const targetColumnByName = new Map(targetColumns.map((column) => [column.name, column]));
    const columns = table.columns;
    const batchSize = Math.max(1, Math.min(100, Math.floor(30000 / columns.length)));
    for (let offset = 0; offset < table.rowCount; offset += batchSize) {
      const rows = await readSourceBatch(database, table.name, columns, batchSize, offset);
      if (rows.length === 0) {
        throw new Error(`La lecture de "${table.name}" s’est arrêtée avant le compte prévalidé.`);
      }
      const values = rows.flatMap((row) => columns.map((column) => {
        const targetColumn = targetColumnByName.get(column.name);
        assert.ok(targetColumn, `Colonne cible manquante : ${table.name}.${column.name}`);
        return convertValue(row[column.name], targetColumn);
      }));
      const placeholders = rows.map((_, rowIndex) => {
        const rowValues = columns.map((column, columnIndex) => {
          const targetColumn = targetColumnByName.get(column.name);
          assert.ok(targetColumn, `Colonne cible manquante : ${table.name}.${column.name}`);
          const parameter = `$${rowIndex * columns.length + columnIndex + 1}`;
          return `${parameter}${postgresTypeCast(targetColumn)}`;
        });
        return `(${rowValues.join(', ')})`;
      });
      await target.$executeRawUnsafe(
        `INSERT INTO "public".${quoteIdentifier(table.name)} ` +
        `(${columns.map((column) => quoteIdentifier(column.name)).join(', ')}) ` +
        `VALUES ${placeholders.join(', ')}`,
        ...values,
      );
    }
  }
}

async function assertImportedCounts(
  target: Prisma.TransactionClient,
  plan: TableImportPlan[],
  targetTables: TargetTable[],
): Promise<void> {
  const importedCounts = new Map(plan.map((table) => [table.name, table.rowCount]));
  for (const table of targetTables) {
    const result = await target.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint AS "count" FROM "public".${quoteIdentifier(table.name)}`,
    ) as Array<{ count: bigint | string }>;
    const actual = Number(result[0]?.count ?? 0);
    const expected = importedCounts.get(table.name) ?? 0;
    if (actual !== expected) {
      throw new Error(
        `Écart de lignes après reprise pour "${table.name}" : attendu=${expected}, cible=${actual}.`,
      );
    }
  }
}

async function writeReport(reportFile: Awaited<ReturnType<typeof open>>, report: unknown): Promise<void> {
  await reportFile.truncate(0);
  const contents = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, 'utf8');
  let offset = 0;
  while (offset < contents.length) {
    const result = await reportFile.write(contents, offset, contents.length - offset, offset);
    if (result.bytesWritten === 0) throw new Error('Impossible d’écrire le rapport d’import complet.');
    offset += result.bytesWritten;
  }
  await reportFile.sync();
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (!existsSync(options.sourcePath)) {
    throw new Error(`Base SQLite source introuvable : ${options.sourcePath}`);
  }
  if (existsSync(options.reportPath)) {
    throw new Error(`Le rapport existe déjà; choisissez un nouveau chemin : ${options.reportPath}`);
  }
  if (options.approvedReportPath && !existsSync(options.approvedReportPath)) {
    throw new Error(`Rapport dry-run approuvé introuvable : ${options.approvedReportPath}`);
  }
  const configuration = resolveDatabaseConfiguration();
  if (configuration.provider !== 'postgresql') {
    throw new Error('Définissez SAFE_ERP_DATABASE_PROVIDER=postgresql pour l’import.');
  }
  if (!options.apply && options.confirmTargetEmpty) {
    throw new Error('La confirmation de cible vide n’est valide qu’avec --apply.');
  }

  const reportFile = await open(options.reportPath, 'wx');
  const report: Record<string, unknown> = {
    version: 1,
    status: 'preflight',
    source: 'SQLite SAFE backup',
    targetEngine: 'PostgreSQL',
    mode: options.apply ? 'apply' : 'dry-run',
    tables: [],
    discrepancies: [],
    warnings: [],
  };
  let source: Awaited<ReturnType<typeof inspectSource>> | undefined;
  let client: PrismaClient | undefined;
  let importCommitted = false;
  try {
    await writeReport(reportFile, report);
    const sourceSha256 = await fileSha256(options.sourcePath);
    source = await inspectSource(options.sourcePath);
    report.warnings = [
      'Les triggers SQLite source ne sont pas copiés; les règles de protection du schéma PostgreSQL sont fournies par ses migrations.',
      ...(source.triggers.length > 0
        ? [`La source comporte ${source.triggers.length} trigger(s) SQLite; leurs règles doivent être examinées séparément.`]
        : []),
      ...(source.migrationNames.length === 0
        ? ['Aucun historique Prisma exploitable dans la source; la vérification s’appuie sur sa structure et ses contraintes.']
        : []),
    ];
    const status = migrationStatus();
    if (!/up to date|successfully applied/i.test(status)) {
      throw new Error(`L’historique PostgreSQL n’est pas à jour : ${status.trim()}`);
    }

    client = (require('../core/models/prisma') as { default: PrismaClient }).default;
    await client.$connect();
    const target = await targetMetadata(client);
    validateTargetIsEmpty(target.tables);
    if (target.nonDeferrableForeignKeys.length > 0) {
      throw new Error(
        `La cible contient des clés étrangères non différables requises par la reprise : ` +
        `${target.nonDeferrableForeignKeys.join(', ')}.`,
      );
    }
    const plan = buildTableImportPlan(source.tables, target.tables);
    const targetFingerprint = createHash('sha256').update(configuration.url).digest('hex');
    const planFingerprint = importPlanSha256(plan, target.tables);
    const migrationStatusFingerprint = createHash('sha256').update(status.trim()).digest('hex');
    const migrationSetFingerprint = await postgresqlMigrationSetSha256();
    if ((await fileSha256(options.sourcePath)) !== sourceSha256) {
      throw new Error('La base SQLite source a changé pendant les contrôles; aucun import effectué.');
    }
    report.targetDatabase = target.databaseName;
    report.migrationStatus = status.trim();
    report.sourceSha256 = sourceSha256;
    report.sourceMigrationNames = source.migrationNames;
    report.targetFingerprint = targetFingerprint;
    report.planFingerprint = planFingerprint;
    report.migrationStatusFingerprint = migrationStatusFingerprint;
    report.migrationSetFingerprint = migrationSetFingerprint;
    report.tables = plan.map(({ name, rowCount, dependencies, omittedTargetColumns }) => ({
      name,
      rows: rowCount,
      dependencies,
      omittedTargetColumns,
    }));
    const plannedTables = new Set(plan.map((table) => table.name));
    report.discrepancies = [
      ...plan
      .filter((table) => table.omittedTargetColumns.length > 0)
      .map((table) => ({
        table: table.name,
        omittedTargetColumns: table.omittedTargetColumns,
        handling: 'PostgreSQL defaults or NULL values will be used.',
      })),
      ...target.tables
        .filter((table) => !plannedTables.has(table.name))
        .map((table) => ({
          table: table.name,
          sourceTableMissing: true,
          targetRows: table.rowCount,
          handling: 'La table cible reste vide; aucune table source correspondante.',
        })),
    ];

    if (!options.apply) {
      report.status = 'dry-run-valid';
      await writeReport(reportFile, report);
      process.stdout.write(`Dry-run valide; aucune donnée écrite. Rapport : ${options.reportPath}\n`);
      return;
    }

    const approvedReport = JSON.parse(
      await readFile(options.approvedReportPath!, 'utf8'),
    ) as unknown;
    assertApprovedDryRun(approvedReport, {
      sourceSha256,
      targetFingerprint,
      planFingerprint,
      migrationStatusFingerprint,
      migrationSetFingerprint,
    });
    report.status = 'apply-started';
    await writeReport(reportFile, report);
    await client.$transaction(async (transaction) => {
      await transaction.$queryRawUnsafe('SELECT pg_advisory_xact_lock(814433, 0)::text');
      const freshTarget = await targetMetadata(transaction);
      validateTargetIsEmpty(freshTarget.tables);
      if (freshTarget.nonDeferrableForeignKeys.length > 0) {
        throw new Error(
          `La cible contient des clés étrangères non différables requises par la reprise : ` +
          `${freshTarget.nonDeferrableForeignKeys.join(', ')}.`,
        );
      }
      await transaction.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED');
      await importTables(source!.database, transaction, plan);
      await assertImportedCounts(transaction, plan, freshTarget.tables);
      if ((await fileSha256(options.sourcePath)) !== sourceSha256) {
        throw new Error('La base SQLite source a changé pendant l’import; la transaction est annulée.');
      }
    }, {
      isolationLevel: 'Serializable',
      maxWait: 10000,
      timeout: 600000,
    });
    importCommitted = true;
    report.status = 'imported';
    await writeReport(reportFile, report);
    process.stdout.write(`Import PostgreSQL terminé et vérifié. Rapport : ${options.reportPath}\n`);
  } catch (error) {
    report.status = importCommitted ? 'imported-report-update-failed' : options.apply ? 'apply-failed' : 'blocked';
    report.error = sanitizeError(error);
    await writeReport(reportFile, report);
    throw error;
  } finally {
    if (source) await closeSourceDatabase(source.database);
    if (client) await client.$disconnect();
    await reportFile.close();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`Échec de l’import SQLite vers PostgreSQL : ${sanitizeError(error)}\n`);
    process.exitCode = 1;
  });
}
