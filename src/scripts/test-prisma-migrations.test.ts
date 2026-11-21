import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import sqlite3 from 'sqlite3';
import { after, before, describe, it } from 'node:test';

const projectRoot = resolve(__dirname, '../..');
const migrationsSource = resolve(projectRoot, 'src/data/prisma/migrations');
const schemaSource = resolve(projectRoot, 'src/data/prisma/schema.prisma');
const prismaCli = resolve(projectRoot, 'node_modules/prisma/build/index.js');
let temporaryDirectory: string;

function databaseUrl(databasePath: string): string {
  return `file:${databasePath.replace(/\\/g, '/')}`;
}

function runPrisma(schemaPath: string, databasePath: string, ...args: string[]): string {
  return execFileSync(process.execPath, [
    prismaCli,
    ...args,
    '--schema',
    schemaPath,
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

async function assertDatabaseIntegrity(databasePath: string): Promise<void> {
  const database = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);
  try {
    const integrity = await new Promise<string>((resolveIntegrity, rejectIntegrity) => {
      database.get<{ integrity_check: string }>('PRAGMA integrity_check', (error, row) => {
        if (error) rejectIntegrity(error);
        else if (!row) rejectIntegrity(new Error('SQLite integrity check returned no result.'));
        else resolveIntegrity(row.integrity_check);
      });
    });
    assert.equal(integrity, 'ok');

    const foreignKeyViolations = await new Promise<unknown[]>((resolveRows, rejectRows) => {
      database.all('PRAGMA foreign_key_check', (error, rows) => {
        if (error) rejectRows(error);
        else resolveRows(rows);
      });
    });
    assert.deepEqual(foreignKeyViolations, []);
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      database.close((error) => error ? rejectClose(error) : resolveClose());
    });
  }
}

async function prepareIsolatedProject(projectName: string): Promise<{
  databasePath: string;
  migrationsPath: string;
  schemaPath: string;
}> {
  const projectPath = join(temporaryDirectory, projectName);
  const prismaPath = join(projectPath, 'prisma');
  const migrationsPath = join(prismaPath, 'migrations');
  const schemaPath = join(prismaPath, 'schema.prisma');
  await cp(migrationsSource, migrationsPath, { recursive: true });
  await cp(schemaSource, schemaPath);
  return {
    databasePath: join(projectPath, 'isolated.sqlite'),
    migrationsPath,
    schemaPath,
  };
}

describe('Prisma migration deployment paths', () => {
  before(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'safe-prisma-migrations-'));
  });

  after(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('deploys the complete migration chain to a fresh disposable SQLite database', async () => {
    const project = await prepareIsolatedProject('fresh');

    runPrisma(project.schemaPath, project.databasePath, 'migrate', 'deploy');
    const status = runPrisma(project.schemaPath, project.databasePath, 'migrate', 'status');

    assert.match(status, /up to date/i);
    const maintenanceColumns = await queryRows<{ name: string }>(
      project.databasePath,
      `PRAGMA table_info("MaintenanceWorkOrder")`,
    );
    assert.ok(maintenanceColumns.some((column) => column.name === 'actualCost'));
    assert.ok(maintenanceColumns.some((column) => column.name === 'actualCostCurrencyCode'));
    assert.ok(maintenanceColumns.some((column) => column.name === 'completionOdometerKm'));
    const featureConfigurationColumns = await queryRows<{ name: string }>(
      project.databasePath,
      `PRAGMA table_info("WorkbookFeatureConfiguration")`,
    );
    assert.ok(featureConfigurationColumns.some((column) => column.name === 'configurationJson'));
    assert.ok(featureConfigurationColumns.some((column) => column.name === 'confirmedAt'));
    const featureRevisionColumns = await queryRows<{ name: string }>(
      project.databasePath,
      `PRAGMA table_info("WorkbookFeatureConfigurationRevision")`,
    );
    assert.ok(featureRevisionColumns.some((column) => column.name === 'version'));
    assert.ok(featureRevisionColumns.some((column) => column.name === 'actorUsername'));
    const scoreSnapshotColumns = await queryRows<{ name: string }>(
      project.databasePath,
      `PRAGMA table_info("PartnerScoreSnapshot")`,
    );
    assert.ok(scoreSnapshotColumns.some((column) => column.name === 'configurationVersion'));
    assert.ok(scoreSnapshotColumns.some((column) => column.name === 'alertTriggered'));
    const disputeColumns = await queryRows<{ name: string }>(
      project.databasePath,
      `PRAGMA table_info("PartnerDispute")`,
    );
    assert.ok(disputeColumns.some((column) => column.name === 'partnerType'));
    assert.ok(disputeColumns.some((column) => column.name === 'resolutionNote'));
    const aiAuditColumns = await queryRows<{ name: string }>(
      project.databasePath,
      `PRAGMA table_info("AiRequestAuditEvent")`,
    );
    assert.ok(aiAuditColumns.some((column) => column.name === 'actorUserId'));
    assert.ok(aiAuditColumns.some((column) => column.name === 'failureStatusCode'));
    assert.ok(!aiAuditColumns.some((column) => column.name.toLowerCase().includes('prompt')));
    const connectorSecretColumns = await queryRows<{ name: string }>(
      project.databasePath,
      `PRAGMA table_info("WorkbookConnectorSecret")`,
    );
    assert.ok(connectorSecretColumns.some((column) => column.name === 'ciphertext'));
    assert.ok(connectorSecretColumns.some((column) => column.name === 'authTag'));
    assert.ok(connectorSecretColumns.some((column) => column.name === 'version'));
    assert.ok(!connectorSecretColumns.some((column) => /password|token|secretValue/i.test(column.name)));
    const suffix = randomUUID();
    const entityId = `audit-${suffix}`;
    const countryId = `country-${suffix}`;
    const recordId = `audit-record-${suffix}`;
    await executeSql(project.databasePath, `
      INSERT INTO "CountryProfile" ("id", "code", "name", "updatedAt")
      VALUES ('${countryId}', 'TEST-${suffix}', 'Synthetic migration country', CURRENT_TIMESTAMP);
      INSERT INTO "Entity" ("id", "name", "countryId")
      VALUES ('${entityId}', 'Audit test entity', '${countryId}');
      INSERT INTO "JournalEntryAuditRecord" ("id", "entityId", "journalEntryId", "sequence", "entryHash")
      VALUES ('${recordId}', '${entityId}', 'missing-journal-entry', 1, '${'a'.repeat(64)}');
      INSERT INTO "AiRequestAuditEvent" (
        "id", "requestId", "entityId", "actorUserId", "task", "dataClass", "eventType", "route", "cloudConsent"
      ) VALUES (
        'ai-audit-${suffix}', 'ai-request-${suffix}', '${entityId}', 'synthetic-user',
        'FINANCIAL_INSIGHTS', 'AGGREGATED_REPORTS', 'STARTED', 'PENDING', 1
      );
      INSERT INTO "WorkbookConnectorSecret" (
        "id", "entityId", "featureKey", "keyId", "fieldNamesJson", "ciphertext", "iv", "authTag",
        "updatedByUserId", "updatedByUsername", "updatedAt"
      ) VALUES (
        'connector-secret-${suffix}', '${entityId}', 'tuneps-connector', 'test-key-1',
        '["username"]', 'c3ludGhldGljLWVuY3J5cHRlZA==', 'c3ludGhldGljLWl2', 'c3ludGhldGljLXRhZw==',
        'synthetic-user', 'migration-test', CURRENT_TIMESTAMP
      );
    `);
    await executeSql(project.databasePath, `
      INSERT INTO "WorkbookFeatureConfiguration" ("id", "entityId", "featureKey", "updatedAt")
      VALUES ('feature-${suffix}', '${entityId}', 'cloud-ai', CURRENT_TIMESTAMP);
    `);
    const [featureConfiguration] = await queryRows<{
      configurationJson: string;
      enabled: number;
      version: number;
    }>(
      project.databasePath,
      `SELECT "configurationJson", "enabled", "version" FROM "WorkbookFeatureConfiguration" WHERE "id" = 'feature-${suffix}'`,
    );
    assert.deepEqual(featureConfiguration, { configurationJson: '{}', enabled: 0, version: 1 });
    await executeSql(project.databasePath, `
      INSERT INTO "WorkbookFeatureConfigurationRevision" (
        "id", "entityId", "featureKey", "version", "configurationJson", "enabled", "actorUserId", "actorUsername"
      ) VALUES (
        'revision-${suffix}', '${entityId}', 'cloud-ai', 1, '{}', 0, 'synthetic-admin', 'migration-test'
      );
    `);
    const [featureRevision] = await queryRows<{ featureKey: string; version: number; actorUsername: string }>(
      project.databasePath,
      `SELECT "featureKey", "version", "actorUsername" FROM "WorkbookFeatureConfigurationRevision" WHERE "id" = 'revision-${suffix}'`,
    );
    assert.deepEqual(featureRevision, { featureKey: 'cloud-ai', version: 1, actorUsername: 'migration-test' });
    const [aiAuditEvent] = await queryRows<{
      task: string;
      dataClass: string;
      eventType: string;
      route: string;
      cloudConsent: number;
    }>(
      project.databasePath,
      `SELECT "task", "dataClass", "eventType", "route", "cloudConsent" FROM "AiRequestAuditEvent" WHERE "id" = 'ai-audit-${suffix}'`,
    );
    assert.deepEqual(aiAuditEvent, {
      task: 'FINANCIAL_INSIGHTS',
      dataClass: 'AGGREGATED_REPORTS',
      eventType: 'STARTED',
      route: 'PENDING',
      cloudConsent: 1,
    });
    const [connectorSecret] = await queryRows<{ fieldNamesJson: string; updatedByUsername: string }>(
      project.databasePath,
      `SELECT "fieldNamesJson", "updatedByUsername" FROM "WorkbookConnectorSecret" WHERE "id" = 'connector-secret-${suffix}'`,
    );
    assert.deepEqual(connectorSecret, { fieldNamesJson: '["username"]', updatedByUsername: 'migration-test' });
    await executeSql(project.databasePath, `
      INSERT INTO "PartnerDispute" (
        "id", "entityId", "partnerType", "partnerId", "note", "createdByUserId", "createdBy"
      ) VALUES (
        'dispute-${suffix}', '${entityId}', 'CUSTOMER', 'synthetic-customer', 'Synthetic dispute',
        'synthetic-admin', 'migration-test'
      );
    `);
    const [dispute] = await queryRows<{ status: string; note: string }>(
      project.databasePath,
      `SELECT "status", "note" FROM "PartnerDispute" WHERE "id" = 'dispute-${suffix}'`,
    );
    assert.deepEqual(dispute, { status: 'OPEN', note: 'Synthetic dispute' });
    const [head] = await queryRows<{ entityId: string; lastSequence: number }>(
      project.databasePath,
      `SELECT "entityId", "lastSequence" FROM "JournalEntryAuditChainHead" WHERE "entityId" = '${entityId}'`,
    );
    assert.deepEqual(head, { entityId, lastSequence: 0 });
    await assert.rejects(
      executeSql(project.databasePath, `UPDATE "JournalEntryAuditRecord" SET "entryHash" = 'changed' WHERE "id" = '${recordId}'`),
      /SAFE_AUDIT_RECORD_IMMUTABLE/,
    );
    await assert.rejects(
      executeSql(project.databasePath, `DELETE FROM "JournalEntryAuditRecord" WHERE "id" = '${recordId}'`),
      /SAFE_AUDIT_RECORD_IMMUTABLE/,
    );
    await assert.rejects(
      executeSql(project.databasePath, `UPDATE "AiRequestAuditEvent" SET "route" = 'CLOUD' WHERE "id" = 'ai-audit-${suffix}'`),
      /SAFE_AI_AUDIT_EVENT_IMMUTABLE/,
    );
    await assert.rejects(
      executeSql(project.databasePath, `DELETE FROM "AiRequestAuditEvent" WHERE "id" = 'ai-audit-${suffix}'`),
      /SAFE_AI_AUDIT_EVENT_IMMUTABLE/,
    );
    await assertDatabaseIntegrity(project.databasePath);
  });

  it('refuses Prisma CLI operations without an explicit database URL', async () => {
    const project = await prepareIsolatedProject('missing-target');
    const environment = { ...process.env };
    delete environment.SAFE_ERP_DATABASE_URL;

    assert.throws(() => execFileSync(process.execPath, [
      prismaCli,
      'migrate',
      'status',
      '--schema',
      project.schemaPath,
    ], {
      cwd: dirname(project.schemaPath),
      env: environment,
      encoding: 'utf8',
      stdio: 'pipe',
    }), /SAFE_ERP_DATABASE_URL/);
  });

  it('upgrades a synthetic pre-latest database with the newest migration cohort', async () => {
    const project = await prepareIsolatedProject('upgrade');
    const migrationFolders = await readdir(project.migrationsPath, { withFileTypes: true });
    const latestMigrations = migrationFolders
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('20261110'))
      .map((entry) => entry.name);

    assert.ok(latestMigrations.length > 0, 'expected a latest migration cohort');
    for (const migrationName of latestMigrations) {
      await rm(join(project.migrationsPath, migrationName), { recursive: true, force: true });
    }

    const stockPickMigration = '20261110120000_stock_pick_dispatch';
    const remainingMigrations = latestMigrations.filter((name) => name !== stockPickMigration);
    for (const migrationName of remainingMigrations) {
      await rm(join(project.migrationsPath, migrationName), { recursive: true, force: true });
    }

    await cp(
      join(migrationsSource, stockPickMigration),
      join(project.migrationsPath, stockPickMigration),
      { recursive: true },
    );
    runPrisma(project.schemaPath, project.databasePath, 'migrate', 'deploy');
    await executeSql(project.databasePath, `
      INSERT INTO "CountryProfile" ("id", "code", "name", "updatedAt")
      VALUES ('country-upgrade', 'UPGRADE', 'Synthetic upgrade country', CURRENT_TIMESTAMP);
      INSERT INTO "Entity" ("id", "name", "countryId")
      VALUES ('entity-upgrade', 'Synthetic upgrade entity', 'country-upgrade');
      INSERT INTO "Currency" ("id", "code", "name", "rate")
      VALUES ('currency-tn', 'TND', 'Tunisian dinar', 1), ('currency-eu', 'EUR', 'Euro', 3.4);
      INSERT INTO "PayrollRule" ("id", "name", "rate")
      VALUES ('payroll-rule-upgrade', 'Synthetic legacy rule', 9.68);
      INSERT INTO "Material" ("id", "entityId", "name", "quantity", "unitPrice")
      VALUES ('material-upgrade', 'entity-upgrade', 'Synthetic retained material', 10, 4);
      INSERT INTO "Warehouse" ("id", "code", "name", "entityId")
      VALUES ('warehouse-upgrade', 'WH-UPGRADE', 'Synthetic warehouse', 'entity-upgrade');
      INSERT INTO "MaterialWarehouseStock" (
        "id", "entityId", "materialId", "warehouseId", "quantity", "updatedAt"
      ) VALUES (
        'stock-upgrade', 'entity-upgrade', 'material-upgrade', 'warehouse-upgrade', 8, CURRENT_TIMESTAMP
      );
      INSERT INTO "StockPick" (
        "id", "entityId", "reference", "reason", "status", "idempotencyKey",
        "createdByUserId", "createdByUsername"
      ) VALUES (
        'pick-upgrade', 'entity-upgrade', 'PICK-UPGRADE', 'Synthetic legacy reservation',
        'PICKED', 'pick-upgrade-key', 'user-upgrade', 'upgrade-test'
      );
      INSERT INTO "StockPickLine" (
        "id", "entityId", "pickId", "materialId", "warehouseId", "quantity"
      ) VALUES (
        'pick-line-upgrade', 'entity-upgrade', 'pick-upgrade', 'material-upgrade', 'warehouse-upgrade', 2
      );
      INSERT INTO "SalesOrder" ("id", "orderNumber", "entityId", "totalAmount")
      VALUES ('order-upgrade', 'ORDER-UPGRADE', 'entity-upgrade', 12);
    `);
    const syntheticOrders = Array.from({ length: 250 }, (_, index) => {
      const sequence = index + 1;
      return `('order-volume-${sequence}', 'ORDER-VOLUME-${sequence}', 'entity-upgrade', ${sequence * 10})`;
    });
    await executeSql(project.databasePath, `
      INSERT INTO "SalesOrder" ("id", "orderNumber", "entityId", "totalAmount")
      VALUES ${syntheticOrders.join(',')};
    `);
    const orderBaseline = await queryRows<{
      orderCount: number;
      totalAmount: number;
      distinctEntities: number;
    }>(project.databasePath, `
      SELECT COUNT(*) AS "orderCount",
             COALESCE(SUM("totalAmount"), 0) AS "totalAmount",
             COUNT(DISTINCT "entityId") AS "distinctEntities"
      FROM "SalesOrder"
    `);

    for (const migrationName of remainingMigrations) {
      await cp(
        join(migrationsSource, migrationName),
        join(project.migrationsPath, migrationName),
        { recursive: true },
      );
    }
    runPrisma(project.schemaPath, project.databasePath, 'migrate', 'deploy');
    const status = runPrisma(project.schemaPath, project.databasePath, 'migrate', 'status');

    assert.match(status, /up to date/i);
    assert.deepEqual(await queryRows(project.databasePath, `
      SELECT "Material"."id", "Material"."quantity", "Material"."reservedQuantity",
             "MaterialWarehouseStock"."quantity" AS "warehouseQuantity",
             "MaterialWarehouseStock"."reservedQuantity" AS "warehouseReservedQuantity"
      FROM "Material"
      JOIN "MaterialWarehouseStock" ON "MaterialWarehouseStock"."materialId" = "Material"."id"
      WHERE "Material"."id" = 'material-upgrade'
    `), [{
      id: 'material-upgrade',
      quantity: 10,
      reservedQuantity: 2,
      warehouseQuantity: 8,
      warehouseReservedQuantity: 2,
    }]);
    assert.deepEqual(await queryRows(project.databasePath, `
      SELECT "id", "code", "name", "rate" FROM "Currency" ORDER BY "code"
    `), [
      { id: 'currency-eu', code: 'EUR', name: 'Euro', rate: 3.4 },
      { id: 'currency-tn', code: 'TND', name: 'Tunisian dinar', rate: 1 },
    ]);
    assert.deepEqual(await queryRows(project.databasePath, `
      SELECT "id", "name", "rate" FROM "PayrollRule" WHERE "id" = 'payroll-rule-upgrade'
    `), [{ id: 'payroll-rule-upgrade', name: 'Synthetic legacy rule', rate: 9.68 }]);
    assert.deepEqual(await queryRows(project.databasePath, `
      SELECT "id", "orderNumber", "currencyCode", "createdByUsername"
      FROM "SalesOrder" WHERE "id" = 'order-upgrade'
    `), [{
      id: 'order-upgrade',
      orderNumber: 'ORDER-UPGRADE',
      currencyCode: '',
      createdByUsername: 'legacy',
    }]);
    assert.deepEqual(await queryRows(project.databasePath, `
      SELECT COUNT(*) AS "orderCount",
             COALESCE(SUM("totalAmount"), 0) AS "totalAmount",
             COUNT(DISTINCT "entityId") AS "distinctEntities"
      FROM "SalesOrder"
    `), orderBaseline);
    assert.equal(orderBaseline[0].orderCount, 251);
    assert.equal(orderBaseline[0].totalAmount, 313762);
    assert.equal(orderBaseline[0].distinctEntities, 1);
    assert.deepEqual(await queryRows(project.databasePath, `
      SELECT "id", "orderNumber", "totalAmount"
      FROM "SalesOrder"
      WHERE "id" = 'order-volume-250'
    `), [{
      id: 'order-volume-250',
      orderNumber: 'ORDER-VOLUME-250',
      totalAmount: 2500,
    }]);
    await assertDatabaseIntegrity(project.databasePath);
  });

  it('preserves existing entities when assigning their country during migration', async () => {
    const project = await prepareIsolatedProject('entity-country-migration');
    const countryMigration = '20261114010000_multijurisdiction_tax_rules';
    await rm(join(project.migrationsPath, countryMigration), { recursive: true, force: true });

    runPrisma(project.schemaPath, project.databasePath, 'migrate', 'deploy');
    await executeSql(project.databasePath, `
      INSERT INTO "CountryProfile" ("id", "code", "name", "updatedAt")
      VALUES ('country-legacy-tn', 'TN', 'Tunisia', CURRENT_TIMESTAMP);
      INSERT INTO "Entity" ("id", "name")
      VALUES ('entity-legacy-tn', 'Synthetic legacy Tunisia entity');
    `);

    await cp(
      join(migrationsSource, countryMigration),
      join(project.migrationsPath, countryMigration),
      { recursive: true },
    );
    runPrisma(project.schemaPath, project.databasePath, 'migrate', 'deploy');

    assert.deepEqual(await queryRows(project.databasePath, `
      SELECT "id", "name", "countryId" FROM "Entity" WHERE "id" = 'entity-legacy-tn'
    `), [{
      id: 'entity-legacy-tn',
      name: 'Synthetic legacy Tunisia entity',
      countryId: 'country-legacy-tn',
    }]);
    await assertDatabaseIntegrity(project.databasePath);
  });
});
