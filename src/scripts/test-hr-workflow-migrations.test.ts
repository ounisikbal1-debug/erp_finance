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

function rows<T extends object = { name: string }>(database: sqlite3.Database, sql: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    database.all<T>(sql, (error, result) => error ? reject(error) : resolve(result));
  });
}

describe('HR workflow migrations', () => {
  it('creates HR workflow and private document metadata tables in a synthetic database', async () => {
    const database = new sqlite3.Database(':memory:');
    try {
      await execute(database, `
        PRAGMA foreign_keys = ON;
        CREATE TABLE "Entity" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "Employee" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "entityId" TEXT NOT NULL,
          FOREIGN KEY ("entityId") REFERENCES "Entity"("id")
        );
        CREATE TABLE "Payslip" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "employeeId" TEXT NOT NULL,
          "period" TEXT NOT NULL,
          "grossSalary" REAL NOT NULL,
          "employeeCnss" REAL NOT NULL,
          "employerCnss" REAL NOT NULL,
          "foprolos" REAL NOT NULL,
          "taxableGross" REAL NOT NULL,
          "irpp" REAL NOT NULL,
          "css" REAL NOT NULL,
          "netSalary" REAL NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO "Payslip" (
          "id", "employeeId", "period", "grossSalary", "employeeCnss", "employerCnss",
          "foprolos", "taxableGross", "irpp", "css", "netSalary"
        ) VALUES ('legacy-payslip', 'employee-old', '2026-09', 1000, 0, 0, 0, 1000, 0, 0, 1000);
      `);
      for (const migrationName of [
        '20261107210000_hr_employee_documents',
        '20261107220000_hr_recruitment_pipeline',
        '20261107230000_hr_candidate_interviews',
        '20261107240000_hr_expense_claims',
        '20261106235000_hr_leave_entitlements',
        '20261108180000_hr_employee_document_files',
        '20261110140000_hr_payslip_tax_snapshot',
        '20261110160000_hr_leave_entitlement_policy_source',
        '20261115030000_hr_payroll_register_snapshot',
        '20261115040000_hr_employee_termination',
      ]) {
        const sql = readFileSync(join(
          __dirname, '..', 'data', 'prisma', 'migrations', migrationName, 'migration.sql',
        ), 'utf8');
        await execute(database, sql);
      }

      const documentColumns = await rows(database, `PRAGMA table_info("EmployeeDocument")`);
      assert.deepEqual(documentColumns.map(({ name }) => name), [
        'id', 'employeeId', 'category', 'title', 'validFrom', 'validUntil', 'status',
        'createdByUserId', 'createdByUsername', 'createdAt', 'archivedAt',
        'archivedByUserId', 'archivedByUsername', 'archiveNote',
      ]);
      const documentFileColumns = await rows(database, `PRAGMA table_info("EmployeeDocumentFile")`);
      assert.deepEqual(documentFileColumns.map(({ name }) => name), [
        'id', 'documentId', 'storageKey', 'mimeType', 'sizeBytes', 'sha256',
        'uploadedByUserId', 'uploadedByUsername', 'uploadedAt',
      ]);
      const employeeColumns = await rows(database, `PRAGMA table_info("Employee")`);
      assert.ok(employeeColumns.some(({ name }) => name === 'terminatedAt'));
      const employmentEventColumns = await rows(database, `PRAGMA table_info("EmployeeEmploymentEvent")`);
      assert.deepEqual(employmentEventColumns.map(({ name }) => name), [
        'id', 'employeeId', 'action', 'previousTerminatedAt', 'newTerminatedAt',
        'actorUserId', 'actorUsername', 'note', 'createdAt',
      ]);
      const candidateColumns = await rows(database, `PRAGMA table_info("CandidateApplication")`);
      assert.ok(candidateColumns.some(({ name }) => name === 'anonymizedAt'));
      assert.ok(!candidateColumns.some(({ name }) => /file|cv|resume|storage|path|note/i.test(name)));
      const claimColumns = await rows(database, `PRAGMA table_info("EmployeeExpenseClaim")`);
      assert.ok(!claimColumns.some(({ name }) => /payment|journal|posting|receipt|file|path/i.test(name)));
      const entitlementColumns = await rows(database, `PRAGMA table_info("HrLeaveEntitlement")`);
      assert.deepEqual(entitlementColumns.map(({ name }) => name), [
        'id', 'entityId', 'employeeId', 'leaveType', 'year', 'entitlementDays',
        'updatedByUserId', 'updatedByUsername', 'updatedAt', 'policySource', 'effectiveFrom',
      ]);
      const entitlementEventColumns = await rows(database, `PRAGMA table_info("HrLeaveEntitlementEvent")`);
      assert.deepEqual(entitlementEventColumns.map(({ name }) => name), [
        'id', 'entitlementId', 'previousEntitlementDays', 'nextEntitlementDays',
        'reason', 'actorUserId', 'actorUsername', 'createdAt', 'policySource', 'effectiveFrom',
      ]);
      const indexes = await rows(database, `SELECT name FROM sqlite_master WHERE type = 'index'`);
      assert.ok(indexes.some(({ name }) => name === 'CandidateApplication_positionId_email_key'));
      assert.ok(indexes.some(({ name }) => name === 'EmployeeExpenseClaim_employeeId_status_idx'));
      assert.ok(indexes.some(({ name }) => name === 'EmployeeDocumentFile_documentId_key'));
      assert.ok(indexes.some(({ name }) => name === 'EmployeeDocumentFile_storageKey_key'));
      assert.ok(indexes.some(({ name }) => name === 'EmployeeEmploymentEvent_employeeId_createdAt_idx'));
      assert.ok(indexes.some(({ name }) => name === 'HrLeaveEntitlement_employeeId_leaveType_year_key'));
      assert.ok(indexes.some(({ name }) => name === 'HrLeaveEntitlementEvent_entitlementId_createdAt_idx'));

      await execute(database, `
        INSERT INTO "Payslip" (
          "id", "employeeId", "period", "grossSalary", "employeeCnss", "employerCnss",
          "foprolos", "taxableGross", "irpp", "css", "netSalary", "fiscalBenefitType",
          "complementaryRetirementRate", "retirementContribution", "annualRetirementContributionDeduction",
          "irppBeforeRetirementGain", "cssBeforeRetirementGain", "gainIrpp", "gainCss",
          "currencyCode", "calculationSnapshot"
        ) VALUES ('new-payslip', 'employee-new', '2026-10', 1000, 0, 0, 0, 1000, 0, 0, 1000,
          'COMPLEMENTARY_RETIREMENT', 4, 40, 480, 5, 1, 0.2, 0.1, 'TND', '{"version":"SAFE_PAYROLL_CALCULATION_V1"}');
        INSERT INTO "Entity" ("id") VALUES ('entity-a');
        INSERT INTO "Employee" ("id", "entityId") VALUES ('employee-a', 'entity-a');
        INSERT INTO "EmployeeEmploymentEvent" (
          "id", "employeeId", "action", "previousTerminatedAt", "newTerminatedAt",
          "actorUserId", "actorUsername", "note"
        ) VALUES ('employment-event-a', 'employee-a', 'EMPLOYMENT_END_DATE_SET', NULL,
          '2026-10-31T00:00:00.000Z', 'user-a', 'hr', 'Fin du contrat');
        INSERT INTO "EmployeeDocument" ("id", "employeeId", "category", "title", "createdByUserId", "createdByUsername")
        VALUES ('doc-a', 'employee-a', 'CONTRACT', 'Contrat', 'user-a', 'hr');
        INSERT INTO "EmployeeDocumentFile" (
          "id", "documentId", "storageKey", "mimeType", "sizeBytes", "sha256", "uploadedByUserId", "uploadedByUsername"
        ) VALUES ('file-a', 'doc-a', 'opaque-uuid', 'application/pdf', 8, 'hash', 'user-a', 'hr');
        INSERT INTO "HrLeaveEntitlement" (
          "id", "entityId", "employeeId", "leaveType", "year", "entitlementDays",
          "policySource", "effectiveFrom", "updatedByUserId", "updatedByUsername", "updatedAt"
        ) VALUES ('entitlement-a', 'entity-a', 'employee-a', 'ANNUAL', 2026, 24,
          'Politique RH v2', '2026-01-01', 'user-a', 'hr', CURRENT_TIMESTAMP);
        INSERT INTO "HrLeaveEntitlementEvent" (
          "id", "entitlementId", "previousEntitlementDays", "nextEntitlementDays",
          "policySource", "effectiveFrom", "reason", "actorUserId", "actorUsername"
        ) VALUES ('event-a', 'entitlement-a', NULL, 24, 'Politique RH v2', '2026-01-01',
          'Politique RH', 'user-a', 'hr');
      `);
      const employmentEvents = await rows(database, `SELECT employeeId, action, actorUsername, note
        FROM "EmployeeEmploymentEvent" WHERE id = 'employment-event-a'`);
      assert.deepEqual(employmentEvents, [{
        employeeId: 'employee-a',
        action: 'EMPLOYMENT_END_DATE_SET',
        actorUsername: 'hr',
        note: 'Fin du contrat',
      }]);
      const historicalPayslips = await rows<{
        currencyCode: string;
        calculationSnapshot: string | null;
        fiscalBenefitType: string | null;
        complementaryRetirementRate: number | null;
        retirementContribution: number | null;
        annualRetirementContributionDeduction: number | null;
        irppBeforeRetirementGain: number | null;
        cssBeforeRetirementGain: number | null;
        gainIrpp: number | null;
        gainCss: number | null;
      }>(database, `SELECT currencyCode, calculationSnapshot, fiscalBenefitType, complementaryRetirementRate, retirementContribution,
        annualRetirementContributionDeduction, irppBeforeRetirementGain, cssBeforeRetirementGain, gainIrpp, gainCss
        FROM "Payslip" WHERE id = 'legacy-payslip'`);
      assert.deepEqual(historicalPayslips, [{
        currencyCode: 'TND',
        calculationSnapshot: null,
        fiscalBenefitType: null,
        complementaryRetirementRate: null,
        retirementContribution: null,
        annualRetirementContributionDeduction: null,
        irppBeforeRetirementGain: null,
        cssBeforeRetirementGain: null,
        gainIrpp: null,
        gainCss: null,
      }]);
      const newPayslips = await rows<{
        currencyCode: string;
        calculationSnapshot: string;
        fiscalBenefitType: string;
        complementaryRetirementRate: number;
        retirementContribution: number;
        annualRetirementContributionDeduction: number;
        irppBeforeRetirementGain: number;
        cssBeforeRetirementGain: number;
        gainIrpp: number;
        gainCss: number;
      }>(database, `SELECT currencyCode, calculationSnapshot, fiscalBenefitType, complementaryRetirementRate, retirementContribution,
        annualRetirementContributionDeduction, irppBeforeRetirementGain, cssBeforeRetirementGain, gainIrpp, gainCss
        FROM "Payslip" WHERE id = 'new-payslip'`);
      assert.deepEqual(newPayslips, [{
        currencyCode: 'TND',
        calculationSnapshot: '{"version":"SAFE_PAYROLL_CALCULATION_V1"}',
        fiscalBenefitType: 'COMPLEMENTARY_RETIREMENT',
        complementaryRetirementRate: 4,
        retirementContribution: 40,
        annualRetirementContributionDeduction: 480,
        irppBeforeRetirementGain: 5,
        cssBeforeRetirementGain: 1,
        gainIrpp: 0.2,
        gainCss: 0.1,
      }]);
      const foreignKeyErrors = await rows(database, `PRAGMA foreign_key_check`);
      assert.deepEqual(foreignKeyErrors, []);
    } finally {
      await new Promise<void>((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
