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

function query<T>(database: sqlite3.Database, sql: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    database.all(sql, (error, rows) => error ? reject(error) : resolve(rows as T[]));
  });
}

describe('multijurisdiction tax rules migration', () => {
  it('preserves existing country/entity references and permits unconfigured foreign profiles', async () => {
    const database = new sqlite3.Database(':memory:');
    try {
      await execute(database, `
        PRAGMA foreign_keys = ON;
        CREATE TABLE "CountryProfile" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "code" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "currencyCode" TEXT NOT NULL DEFAULT 'TND',
          "currencySymbol" TEXT NOT NULL DEFAULT 'DT',
          "stampDuty" REAL NOT NULL DEFAULT 1.0,
          "corporateTax" REAL NOT NULL DEFAULT 20.0,
          "isDefault" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL,
          "productionWipAccountCode" TEXT,
          "salesReceivableAccountCode" TEXT,
          "salesRevenueAccountCode" TEXT,
          "salesStampDutyAccountCode" TEXT,
          "salesVatAccountCode" TEXT,
          "stockAdjustmentAccountCode" TEXT,
          "stockAssetAccountCode" TEXT,
          "purchaseExpenseAccountCode" TEXT,
          "purchaseVatAccountCode" TEXT,
          "realizedFxGainAccountCode" TEXT,
          "realizedFxLossAccountCode" TEXT,
          "unrealizedFxGainAccountCode" TEXT,
          "unrealizedFxLossAccountCode" TEXT,
          "productionLaborAccountCode" TEXT,
          "productionOverheadAccountCode" TEXT
        );
        CREATE UNIQUE INDEX "CountryProfile_code_key" ON "CountryProfile"("code");
        CREATE TABLE "Entity" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL);
        CREATE UNIQUE INDEX "Entity_name_key" ON "Entity"("name");
        CREATE TABLE "JournalEntryAuditChainHead" (
          "entityId" TEXT NOT NULL PRIMARY KEY,
          "lastSequence" INTEGER NOT NULL,
          "lastHash" TEXT,
          "startedAt" DATETIME NOT NULL,
          "createdAt" DATETIME NOT NULL,
          "updatedAt" DATETIME NOT NULL,
          FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE
        );
        CREATE TRIGGER "Entity_JournalEntryAuditChainHead_insert"
        AFTER INSERT ON "Entity"
        BEGIN
          INSERT INTO "JournalEntryAuditChainHead"
            ("entityId", "lastSequence", "lastHash", "startedAt", "createdAt", "updatedAt")
          VALUES (NEW."id", 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        END;
        CREATE TABLE "User" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "entityId" TEXT,
          FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL
        );
        CREATE TABLE "PayrollConfig" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "countryId" TEXT NOT NULL,
          "updatedAt" DATETIME NOT NULL,
          FOREIGN KEY ("countryId") REFERENCES "CountryProfile"("id") ON DELETE CASCADE
        );
        INSERT INTO "CountryProfile" ("id", "code", "name", "currencyCode", "currencySymbol", "stampDuty", "corporateTax", "isDefault", "updatedAt")
        VALUES ('tn-country', 'TN', 'Tunisie', 'TND', 'DT', 1.0, 20.0, 1, CURRENT_TIMESTAMP);
        INSERT INTO "Entity" ("id", "name") VALUES ('existing-entity', 'Société existante');
        INSERT INTO "User" ("id", "entityId") VALUES ('existing-user', 'existing-entity');
        INSERT INTO "PayrollConfig" ("id", "countryId", "updatedAt") VALUES ('existing-payroll', 'tn-country', CURRENT_TIMESTAMP);
      `);

      const migration = readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261114010000_multijurisdiction_tax_rules',
        'migration.sql',
      ), 'utf8');
      await execute(database, migration);

      const preserved = await query<{
        profileCode: string;
        stampDuty: number;
        corporateTax: number;
        entityName: string;
        entityCode: string;
        countryId: string;
        userEntityId: string;
        payrollCountryId: string;
      }>(database, `
        SELECT
          country."code" AS profileCode,
          country."stampDuty" AS stampDuty,
          country."corporateTax" AS corporateTax,
          entity."name" AS entityName,
          entity."code" AS entityCode,
          entity."countryId" AS countryId,
          user."entityId" AS userEntityId,
          payroll."countryId" AS payrollCountryId
        FROM "CountryProfile" country
        JOIN "Entity" entity ON entity."countryId" = country."id"
        JOIN "User" user ON user."entityId" = entity."id"
        JOIN "PayrollConfig" payroll ON payroll."countryId" = country."id"
        WHERE entity."id" = 'existing-entity'
      `);
      assert.deepEqual(preserved, [{
        profileCode: 'TN',
        stampDuty: 1,
        corporateTax: 20,
        entityName: 'Société existante',
        entityCode: 'LEGACY-existing-entity',
        countryId: 'tn-country',
        userEntityId: 'existing-entity',
        payrollCountryId: 'tn-country',
      }]);

      await execute(database, `
        INSERT INTO "CountryProfile" ("id", "code", "name", "currencyCode", "currencySymbol", "stampDuty", "corporateTax", "updatedAt")
        VALUES ('fr-country', 'FR', 'France', 'EUR', 'EUR', NULL, NULL, CURRENT_TIMESTAMP);
        INSERT INTO "Entity" ("id", "code", "name", "countryId")
        VALUES ('new-entity', 'SAFE-FR', 'SAFE EUROPE FRANCE', 'fr-country');
      `);
      const newProfile = await query<{ stampDuty: number | null; corporateTax: number | null }>(
        database,
        `SELECT "stampDuty", "corporateTax" FROM "CountryProfile" WHERE "code" = 'FR'`,
      );
      assert.deepEqual(newProfile, [{ stampDuty: null, corporateTax: null }]);
      const auditHead = await query<{ entityId: string }>(
        database,
        `SELECT "entityId" FROM "JournalEntryAuditChainHead" WHERE "entityId" = 'new-entity'`,
      );
      assert.deepEqual(auditHead, [{ entityId: 'new-entity' }]);
      const violations = await query<Record<string, unknown>>(database, 'PRAGMA foreign_key_check');
      assert.deepEqual(violations, []);
      const taxTables = await query<{ name: string }>(
        database,
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('TaxJurisdiction', 'CountryTaxRule', 'CountryTaxRate', 'CountryTaxThreshold') ORDER BY name`,
      );
      assert.deepEqual(taxTables.map(({ name }) => name), [
        'CountryTaxRate',
        'CountryTaxRule',
        'CountryTaxThreshold',
        'TaxJurisdiction',
      ]);
    } finally {
      await new Promise<void>((resolve, reject) => database.close((error) => error ? reject(error) : resolve()));
    }
  });
});
