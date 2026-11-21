import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const migrationPath = resolve(
  __dirname,
  'migrations/20261111122800_initial_postgresql_schema/migration.sql',
);
const migration = readFileSync(migrationPath, 'utf8');
const sqliteSchema = readFileSync(resolve(__dirname, '../schema.prisma'), 'utf8');
const postgresqlSchema = readFileSync(resolve(__dirname, 'schema.prisma'), 'utf8');
const customsMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261112155000_customs_tariff_rates/migration.sql',
), 'utf8');
const vehicleFleetMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261112160000_vehicle_fleet/migration.sql',
), 'utf8');
const projectTrackingMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261112170000_project_tracking/migration.sql',
), 'utf8');
const publicTendersMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261112180000_public_tenders/migration.sql',
), 'utf8');
const customsDutyRegimesMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261112190000_customs_duty_regimes/migration.sql',
), 'utf8');
const journalAuditChainMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261112195000_journal_entry_audit_chain/migration.sql',
), 'utf8');
const vehicleMaintenanceCostsMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261112200000_vehicle_maintenance_costs/migration.sql',
), 'utf8');
const workbookFeatureConfigurationsMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261113000000_workbook_feature_configurations/migration.sql',
), 'utf8');
const workbookFeatureRevisionsMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261113210000_workbook_feature_revisions/migration.sql',
), 'utf8');
const partnerScoreSnapshotsMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261113010000_partner_score_snapshots/migration.sql',
), 'utf8');
const partnerDisputesMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261113020000_partner_disputes/migration.sql',
), 'utf8');
const salesQuoteOrderConversionMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261113130000_sales_quote_order_conversion/migration.sql',
), 'utf8');
const aiRequestAuditMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261113220000_ai_request_audit/migration.sql',
), 'utf8');
const workbookConnectorSecretsMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261113230000_workbook_connector_secrets/migration.sql',
), 'utf8');
const userAccountStatusMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261113233000_user_account_status/migration.sql',
), 'utf8');
const deferExtendedForeignKeysMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261115000000_defer_extended_foreign_keys/migration.sql',
), 'utf8');
const durableAuthSessionsMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261115010000_durable_auth_sessions/migration.sql',
), 'utf8');
const taxDeclarationWorkpapersMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261115020000_tax_declaration_workpapers/migration.sql',
), 'utf8');
const payrollRegisterSnapshotMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261115030000_hr_payroll_register_snapshot/migration.sql',
), 'utf8');
const employeeTerminationMigration = readFileSync(resolve(
  __dirname,
  'migrations/20261115040000_hr_employee_termination/migration.sql',
), 'utf8');

describe('PostgreSQL baseline migration', () => {
  it('uses PostgreSQL DDL rather than SQLite-only constructs', () => {
    assert.match(migration, /CREATE TABLE "MonthlyCloseLock"/);
    assert.match(migration, /TIMESTAMP\(3\)/);
    assert.doesNotMatch(migration, /\b(?:DATETIME|PRAGMA|strftime|sqlite_master)\b/i);
    assert.doesNotMatch(migration, /RAISE\s*\(\s*ABORT/i);
  });

  it('preserves locked-period journal protections and immutable close locks', () => {
    assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
    assert.match(migration, /CREATE TRIGGER "JournalEntry_locked_period_insert"/);
    assert.match(migration, /CREATE TRIGGER "JournalEntry_locked_period_update"/);
    assert.match(migration, /CREATE TRIGGER "JournalEntry_locked_period_delete"/);
    assert.match(migration, /CREATE TRIGGER "MonthlyCloseLock_immutable_update"/);
    assert.match(migration, /CREATE TRIGGER "MonthlyCloseLock_immutable_delete"/);
    assert.match(migration, /CREATE TRIGGER "MonthlyCloseLock_lock_period_insert"/);
    assert.match(migration, /pg_advisory_xact_lock\(814432, hashtext\(advisory_key\)\)/);
    assert.match(migration, /RAISE EXCEPTION 'SAFE_PERIOD_LOCKED'/);
    assert.match(migration, /RAISE EXCEPTION 'SAFE_PERIOD_LOCK_IMMUTABLE'/);
  });

  it('keeps the Prisma migration provider separate from SQLite', () => {
    const lockPath = resolve(__dirname, 'migration_lock.toml');
    assert.equal(readFileSync(lockPath, 'utf8').trim(), 'provider = "postgresql"');
    assert.equal(
      sqliteSchema.replace(/\r\n/g, '\n').replace('provider = "sqlite"', 'provider = "postgresql"'),
      postgresqlSchema.replace(/\r\n/g, '\n'),
    );
  });

  it('adds account activation status with a backwards-compatible active default', () => {
    assert.match(userAccountStatusMigration, /ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true/);
    assert.match(userAccountStatusMigration, /CREATE INDEX "User_role_isActive_idx" ON "User"\("role", "isActive"\)/);
    assert.doesNotMatch(userAccountStatusMigration, /\b(?:DATETIME|PRAGMA|sqlite_master)\b/i);
  });

  it('makes extended-schema foreign keys deferrable for safe database restores', () => {
    const constraints = [
      'CustomsTariffRate_countryId_fkey',
      'EquipmentVehicleAssignment_equipmentId_entityId_fkey',
      'EquipmentVehicleAssignment_employeeId_entityId_fkey',
      'EquipmentVehicleAssignment_entityId_fkey',
      'Project_entityId_fkey',
      'ProjectTask_projectId_entityId_fkey',
      'ProjectMilestone_projectId_entityId_fkey',
      'ProjectCost_projectId_entityId_fkey',
      'TenderBid_entityId_fkey',
      'TenderDocument_tenderBidId_entityId_fkey',
      'TenderCaution_tenderBidId_entityId_fkey',
      'CustomsDutyRegime_entityId_fkey',
      'CustomsStockSheet_regimeId_entityId_fkey',
      'CustomsStockMovement_stockSheetId_entityId_fkey',
      'CustomsBond_regimeId_entityId_fkey',
      'PartnerScoreSnapshot_entityId_fkey',
      'PartnerDispute_entityId_fkey',
      'SalesQuoteOrderConversion_quoteId_entityId_fkey',
      'SalesQuoteOrderConversion_salesOrderId_entityId_fkey',
      'SalesQuoteOrderConversion_entityId_fkey',
      'WorkbookFeatureConfiguration_entityId_fkey',
      'WorkbookFeatureConfigurationRevision_entityId_fkey',
      'WorkbookConnectorSecret_entityId_fkey',
      'AiRequestAuditEvent_entityId_fkey',
    ];
    for (const constraint of constraints) {
      assert.match(
        deferExtendedForeignKeysMigration,
        new RegExp(`ALTER CONSTRAINT "${constraint}" DEFERRABLE INITIALLY DEFERRED`),
      );
    }
  });

  it('stores shared authentication sessions with deferred user and entity references', () => {
    assert.match(durableAuthSessionsMigration, /CREATE TABLE "AuthSession"/);
    assert.match(durableAuthSessionsMigration, /"lastActivityAt" TIMESTAMP\(3\) NOT NULL/);
    assert.match(durableAuthSessionsMigration, /"revokedAt" TIMESTAMP\(3\)/);
    assert.match(
      durableAuthSessionsMigration,
      /AuthSession_userId_fkey[\s\S]*?DEFERRABLE INITIALLY DEFERRED/,
    );
    assert.match(
      durableAuthSessionsMigration,
      /AuthSession_entityId_fkey[\s\S]*?DEFERRABLE INITIALLY DEFERRED/,
    );
  });

  it('stores versioned, entity-scoped RS and IS workpapers with PostgreSQL types', () => {
    assert.match(taxDeclarationWorkpapersMigration, /CREATE TABLE "TaxDeclarationWorkpaper"/);
    assert.match(taxDeclarationWorkpapersMigration, /"amount" DOUBLE PRECISION NOT NULL/);
    assert.match(taxDeclarationWorkpapersMigration, /"taxableBase" DOUBLE PRECISION/);
    assert.match(taxDeclarationWorkpapersMigration, /"certificateCount" INTEGER/);
    assert.match(taxDeclarationWorkpapersMigration, /FOREIGN KEY \("entityId"\) REFERENCES "Entity"\("id"\) ON DELETE CASCADE/);
    assert.match(taxDeclarationWorkpapersMigration, /TaxDeclarationWorkpaper_entityId_fkey[\s\S]*?DEFERRABLE INITIALLY DEFERRED/);
    assert.match(taxDeclarationWorkpapersMigration, /CREATE UNIQUE INDEX "TaxDeclarationWorkpaper_entityId_period_section_version_key"/);
    assert.match(postgresqlSchema, /model TaxDeclarationWorkpaper/);
    assert.match(sqliteSchema, /model TaxDeclarationWorkpaper/);
    assert.doesNotMatch(taxDeclarationWorkpapersMigration, /\b(?:DATETIME|PRAGMA|sqlite_master)\b/i);
  });

  it('stores currency and calculation snapshots on historical payroll records without rewriting them', () => {
    assert.match(payrollRegisterSnapshotMigration, /ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'TND'/);
    assert.match(payrollRegisterSnapshotMigration, /ADD COLUMN "calculationSnapshot" TEXT/);
    assert.match(postgresqlSchema, /model Payslip \{[\s\S]*?currencyCode\s+String\s+@default\("TND"\)[\s\S]*?calculationSnapshot\s+String\?/);
    assert.match(sqliteSchema, /model Payslip \{[\s\S]*?currencyCode\s+String\s+@default\("TND"\)[\s\S]*?calculationSnapshot\s+String\?/);
    assert.doesNotMatch(payrollRegisterSnapshotMigration, /\b(?:DATETIME|PRAGMA|sqlite_master)\b/i);
  });

  it('stores employment end dates and actor-attributed HR history with PostgreSQL types', () => {
    assert.match(employeeTerminationMigration, /ALTER TABLE "Employee" ADD COLUMN "terminatedAt" TIMESTAMP\(3\)/);
    assert.match(employeeTerminationMigration, /CREATE TABLE "EmployeeEmploymentEvent"/);
    assert.match(employeeTerminationMigration, /"previousTerminatedAt" TIMESTAMP\(3\)/);
    assert.match(employeeTerminationMigration, /"newTerminatedAt" TIMESTAMP\(3\)/);
    assert.match(employeeTerminationMigration, /"actorUserId" TEXT NOT NULL/);
    assert.match(employeeTerminationMigration, /"note" TEXT NOT NULL/);
    assert.match(employeeTerminationMigration, /ON DELETE RESTRICT/);
    assert.match(employeeTerminationMigration, /EmployeeEmploymentEvent_employeeId_fkey[\s\S]*?DEFERRABLE INITIALLY DEFERRED/);
    assert.match(employeeTerminationMigration, /CREATE INDEX "EmployeeEmploymentEvent_employeeId_createdAt_idx"/);
    assert.match(postgresqlSchema, /model Employee \{[\s\S]*?terminatedAt\s+DateTime\?/);
    assert.match(sqliteSchema, /model Employee \{[\s\S]*?terminatedAt\s+DateTime\?/);
    assert.doesNotMatch(employeeTerminationMigration, /\b(?:DATETIME|PRAGMA|sqlite_master)\b/i);
  });

  it('creates configurable customs tariff records using PostgreSQL types', () => {
    assert.match(customsMigration, /CREATE TABLE "CustomsTariffRate"/);
    assert.match(customsMigration, /"tariffCode" TEXT NOT NULL/);
    assert.match(customsMigration, /"customsDutyRate" DOUBLE PRECISION NOT NULL/);
    assert.match(customsMigration, /"createdByUserId" TEXT NOT NULL/);
    assert.doesNotMatch(customsMigration, /\b(?:DATETIME|PRAGMA|sqlite_master)\b/i);
  });

  it('creates entity-scoped fleet fields and employee assignments with PostgreSQL types', () => {
    assert.match(vehicleFleetMigration, /ALTER TABLE "Equipment" ADD COLUMN "vehicleOdometerKm" INTEGER/);
    assert.match(vehicleFleetMigration, /"vehicleInsuranceExpiry" TIMESTAMP\(3\)/);
    assert.match(vehicleFleetMigration, /CREATE TABLE "EquipmentVehicleAssignment"/);
    assert.match(vehicleFleetMigration, /FOREIGN KEY \("employeeId", "entityId"\) REFERENCES "Employee"\("id", "entityId"\)/);
    assert.match(vehicleFleetMigration, /CREATE UNIQUE INDEX "EquipmentVehicleAssignment_equipmentId_entityId_key"/);
    assert.doesNotMatch(vehicleFleetMigration, /\b(?:DATETIME|PRAGMA|sqlite_master)\b/i);
  });

  it('creates entity-scoped project tracking tables using PostgreSQL types', () => {
    assert.match(projectTrackingMigration, /CREATE TABLE "Project"/);
    assert.match(projectTrackingMigration, /CREATE TABLE "ProjectTask"/);
    assert.match(projectTrackingMigration, /CREATE TABLE "ProjectMilestone"/);
    assert.match(projectTrackingMigration, /CREATE TABLE "ProjectCost"/);
    assert.match(projectTrackingMigration, /"budgetAmount" DOUBLE PRECISION/);
    assert.match(projectTrackingMigration, /FOREIGN KEY \("projectId", "entityId"\) REFERENCES "Project"\("id", "entityId"\)/);
    assert.doesNotMatch(projectTrackingMigration, /\b(?:DATETIME|PRAGMA|sqlite_master)\b/i);
  });

  it('creates the composite project key before entity-scoped foreign keys use it', () => {
    const projectKeyIndex = projectTrackingMigration.indexOf(
      'CREATE UNIQUE INDEX "Project_id_entityId_key" ON "Project"("id", "entityId")',
    );
    const projectTaskForeignKey = projectTrackingMigration.indexOf(
      'FOREIGN KEY ("projectId", "entityId") REFERENCES "Project"("id", "entityId")',
    );
    assert.ok(projectKeyIndex >= 0 && projectKeyIndex < projectTaskForeignKey);
  });

  it('creates entity-scoped tender tracking, configurable documents, and manual cautions', () => {
    assert.match(publicTendersMigration, /CREATE TABLE "TenderBid"/);
    assert.match(publicTendersMigration, /CREATE TABLE "TenderDocument"/);
    assert.match(publicTendersMigration, /CREATE TABLE "TenderCaution"/);
    assert.match(publicTendersMigration, /FOREIGN KEY \("tenderBidId", "entityId"\) REFERENCES "TenderBid"\("id", "entityId"\)/);
    assert.match(publicTendersMigration, /"amount" DOUBLE PRECISION NOT NULL/);
    assert.doesNotMatch(publicTendersMigration, /\b(?:DATETIME|PRAGMA|sqlite_master)\b/i);
  });

  it('creates the composite tender key before entity-scoped foreign keys use it', () => {
    const tenderKeyIndex = publicTendersMigration.indexOf(
      'CREATE UNIQUE INDEX "TenderBid_id_entityId_key" ON "TenderBid"("id", "entityId")',
    );
    const tenderDocumentForeignKey = publicTendersMigration.indexOf(
      'FOREIGN KEY ("tenderBidId", "entityId") REFERENCES "TenderBid"("id", "entityId")',
    );
    assert.ok(tenderKeyIndex >= 0 && tenderKeyIndex < tenderDocumentForeignKey);
  });

  it('creates entity-scoped AT/ACT records, stock ledgers, and manually recorded bonds', () => {
    assert.match(customsDutyRegimesMigration, /CREATE TABLE "CustomsDutyRegime"/);
    assert.match(customsDutyRegimesMigration, /CREATE TABLE "CustomsStockSheet"/);
    assert.match(customsDutyRegimesMigration, /CREATE TABLE "CustomsStockMovement"/);
    assert.match(customsDutyRegimesMigration, /CREATE TABLE "CustomsBond"/);
    assert.match(customsDutyRegimesMigration, /FOREIGN KEY \("regimeId", "entityId"\) REFERENCES "CustomsDutyRegime"\("id", "entityId"\)/);
    assert.match(customsDutyRegimesMigration, /"amount" DOUBLE PRECISION NOT NULL/);
    assert.doesNotMatch(customsDutyRegimesMigration, /\b(?:DATETIME|PRAGMA|sqlite_master)\b/i);
  });

  it('creates an append-only SHA-256 journal chain and seeds entity heads', () => {
    assert.match(journalAuditChainMigration, /CREATE TABLE "JournalEntryAuditChainHead"/);
    assert.match(journalAuditChainMigration, /CREATE TABLE "JournalEntryAuditRecord"/);
    assert.match(journalAuditChainMigration, /"entryHash" TEXT NOT NULL/);
    assert.match(journalAuditChainMigration, /BEFORE UPDATE OR DELETE ON "JournalEntryAuditRecord"/);
    assert.match(journalAuditChainMigration, /INSERT INTO "JournalEntryAuditChainHead"/);
    assert.match(journalAuditChainMigration, /CREATE TRIGGER "Entity_JournalEntryAuditChainHead_insert"/);
    assert.doesNotMatch(journalAuditChainMigration, /\b(?:DATETIME|PRAGMA|sqlite_master)\b/i);
  });

  it('stores manually recorded vehicle maintenance costs and odometer readings', () => {
    assert.match(vehicleMaintenanceCostsMigration, /ALTER TABLE "MaintenanceWorkOrder" ADD COLUMN "actualCost" DOUBLE PRECISION/);
    assert.match(vehicleMaintenanceCostsMigration, /ADD COLUMN "actualCostCurrencyCode" TEXT/);
    assert.match(vehicleMaintenanceCostsMigration, /ADD COLUMN "completionOdometerKm" INTEGER/);
    assert.match(postgresqlSchema, /actualCost\s+Float\?/);
    assert.match(postgresqlSchema, /actualCostCurrencyCode\s+String\?/);
    assert.match(postgresqlSchema, /completionOdometerKm\s+Int\?/);
    assert.doesNotMatch(vehicleMaintenanceCostsMigration, /\b(?:DATETIME|PRAGMA|sqlite_master)\b/i);
  });

  it('stores entity-scoped workbook configuration drafts without activation defaults', () => {
    assert.match(workbookFeatureConfigurationsMigration, /CREATE TABLE "WorkbookFeatureConfiguration"/);
    assert.match(workbookFeatureConfigurationsMigration, /"configurationJson" TEXT NOT NULL DEFAULT '\{\}'/);
    assert.match(workbookFeatureConfigurationsMigration, /"enabled" BOOLEAN NOT NULL DEFAULT false/);
    assert.match(workbookFeatureConfigurationsMigration, /"confirmedAt" TIMESTAMP\(3\)/);
    assert.match(workbookFeatureConfigurationsMigration, /FOREIGN KEY \("entityId"\) REFERENCES "Entity"\s+\("id"\) ON DELETE CASCADE/);
    assert.match(workbookFeatureConfigurationsMigration, /UNIQUE INDEX "WorkbookFeatureConfiguration_entityId_featureKey_key"/);
    assert.doesNotMatch(workbookFeatureConfigurationsMigration, /\b(?:DATETIME|PRAGMA|sqlite_master)\b/i);
  });

  it('stores immutable, entity-scoped configuration revisions with actor and version metadata', () => {
    assert.match(workbookFeatureRevisionsMigration, /CREATE TABLE "WorkbookFeatureConfigurationRevision"/);
    assert.match(workbookFeatureRevisionsMigration, /"version" INTEGER NOT NULL/);
    assert.match(workbookFeatureRevisionsMigration, /"actorUserId" TEXT NOT NULL/);
    assert.match(workbookFeatureRevisionsMigration, /"actorUsername" TEXT NOT NULL/);
    assert.match(workbookFeatureRevisionsMigration, /UNIQUE INDEX "WorkbookFeatureConfigurationRevision_entityId_featureKey_version_key"/);
    assert.match(workbookFeatureRevisionsMigration, /FOREIGN KEY \("entityId"\) REFERENCES "Entity"/);
    assert.doesNotMatch(workbookFeatureRevisionsMigration, /\b(?:DATETIME|PRAGMA|sqlite_master)\b/i);
    assert.match(postgresqlSchema, /model WorkbookFeatureConfigurationRevision/);
  });

  it('stores entity-scoped, versioned score history without mutable partner decisions', () => {
    assert.match(partnerScoreSnapshotsMigration, /CREATE TABLE "PartnerScoreSnapshot"/);
    assert.match(partnerScoreSnapshotsMigration, /"score" DOUBLE PRECISION NOT NULL/);
    assert.match(partnerScoreSnapshotsMigration, /"configurationVersion" INTEGER NOT NULL/);
    assert.match(partnerScoreSnapshotsMigration, /"alertTriggered" BOOLEAN NOT NULL/);
    assert.match(partnerScoreSnapshotsMigration, /FOREIGN KEY \("entityId"\) REFERENCES "Entity"\s+\("id"\) ON DELETE CASCADE/);
    assert.match(partnerScoreSnapshotsMigration, /CREATE INDEX "PartnerScoreSnapshot_entityId_scoreType_partnerId_calculatedAt_idx"/);
    assert.doesNotMatch(partnerScoreSnapshotsMigration, /\b(?:DATETIME|PRAGMA|sqlite_master)\b/i);
  });

  it('stores entity-scoped partner disputes with explicit resolution metadata', () => {
    assert.match(partnerDisputesMigration, /CREATE TABLE "PartnerDispute"/);
    assert.match(partnerDisputesMigration, /"partnerType" TEXT NOT NULL/);
    assert.match(partnerDisputesMigration, /"status" TEXT NOT NULL DEFAULT 'OPEN'/);
    assert.match(partnerDisputesMigration, /"resolutionNote" TEXT/);
    assert.match(partnerDisputesMigration, /FOREIGN KEY \("entityId"\) REFERENCES "Entity"\s+\("id"\) ON DELETE CASCADE/);
    assert.match(partnerDisputesMigration, /CREATE INDEX "PartnerDispute_entityId_partnerType_partnerId_status_idx"/);
    assert.doesNotMatch(partnerDisputesMigration, /\b(?:DATETIME|PRAGMA|sqlite_master)\b/i);
  });

  it('stores idempotent, entity-scoped quote-to-order acceptance links', () => {
    assert.match(salesQuoteOrderConversionMigration, /CREATE TABLE "SalesQuoteOrderConversion"/);
    assert.match(salesQuoteOrderConversionMigration, /"acceptanceNote" TEXT NOT NULL/);
    assert.match(salesQuoteOrderConversionMigration, /UNIQUE INDEX "SalesQuoteOrderConversion_quoteId_entityId_key"/);
    assert.match(salesQuoteOrderConversionMigration, /FOREIGN KEY \("salesOrderId", "entityId"\) REFERENCES "SalesOrder"\("id", "entityId"\)/);
    assert.doesNotMatch(salesQuoteOrderConversionMigration, /\b(?:DATETIME|PRAGMA|sqlite_master)\b/i);
    assert.match(postgresqlSchema, /model SalesQuoteOrderConversion/);
  });

  it('stores append-only entity-scoped AI metadata without prompts or prompt hashes', () => {
    assert.match(aiRequestAuditMigration, /CREATE TABLE "AiRequestAuditEvent"/);
    assert.match(aiRequestAuditMigration, /"actorUserId" TEXT NOT NULL/);
    assert.match(aiRequestAuditMigration, /"cloudConsent" BOOLEAN NOT NULL DEFAULT false/);
    assert.match(aiRequestAuditMigration, /"failureStatusCode" INTEGER/);
    assert.match(aiRequestAuditMigration, /SAFE_AI_AUDIT_EVENT_IMMUTABLE/);
    assert.doesNotMatch(aiRequestAuditMigration, /promptHash|"prompt"/i);
    assert.doesNotMatch(aiRequestAuditMigration, /\b(?:DATETIME|PRAGMA|sqlite_master)\b/i);
    assert.match(postgresqlSchema, /model AiRequestAuditEvent/);
  });

  it('stores only AES-GCM connector ciphertext and credential field names by entity', () => {
    assert.match(workbookConnectorSecretsMigration, /CREATE TABLE "WorkbookConnectorSecret"/);
    assert.match(workbookConnectorSecretsMigration, /"ciphertext" TEXT NOT NULL/);
    assert.match(workbookConnectorSecretsMigration, /"authTag" TEXT NOT NULL/);
    assert.match(workbookConnectorSecretsMigration, /"keyId" TEXT NOT NULL/);
    assert.match(workbookConnectorSecretsMigration, /"version" INTEGER NOT NULL/);
    assert.match(workbookConnectorSecretsMigration, /ON DELETE CASCADE/);
    assert.doesNotMatch(workbookConnectorSecretsMigration, /password|secretValue|tokenValue/i);
    assert.doesNotMatch(workbookConnectorSecretsMigration, /\b(?:DATETIME|PRAGMA|sqlite_master)\b/i);
    assert.match(postgresqlSchema, /model WorkbookConnectorSecret/);
  });
});
