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

describe('withholding certificate migration', () => {
  it('creates an additive SQLite workflow with duplicate, status, audit, and reference guards', async () => {
    const database = new sqlite3.Database(':memory:');
    try {
      await execute(database, `
        PRAGMA foreign_keys = ON;
        CREATE TABLE "Entity" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "PurchaseInvoice" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "CashflowPayment" ("id" TEXT NOT NULL PRIMARY KEY);
        INSERT INTO "Entity" ("id") VALUES ('entity-a');
        INSERT INTO "PurchaseInvoice" ("id") VALUES ('invoice-a');
        INSERT INTO "CashflowPayment" ("id") VALUES ('payment-a');
      `);
      await execute(database, readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261110150000_tax_withholding_certificates',
        'migration.sql',
      ), 'utf8'));

      const createCertificate = (id: string, certificateNumber = id, sourceReference = 'INV-1', status = 'PREPARED') => `
        INSERT INTO "WithholdingCertificate" (
          "id", "entityId", "purchaseInvoiceId", "certificateNumber", "beneficiaryName",
          "category", "grossAmountTtc", "withholdingRate", "withholdingAmount", "currencyCode",
          "period", "sourceType", "sourceReference", "ruleSource", "ruleSourceDate",
          "ruleEffectiveFrom", "status", "preparedByUserId",
          "preparedByUsername", "updatedAt"
        ) VALUES (
          '${id}', 'entity-a', 'invoice-a', '${certificateNumber}', 'Supplier',
          'achats', 1000, 1, 10, 'TND', '2026-10', 'PURCHASE_INVOICE', '${sourceReference}',
          'User supplied conversation', NULL, NULL, '${status}', 'user-1', 'accountant', CURRENT_TIMESTAMP
        );
      `;
      await execute(database, createCertificate('certificate-1'));
      await execute(database, `
        INSERT INTO "WithholdingCertificateWorkflowEvent" (
          "id", "certificateId", "action", "actorUserId", "actorUsername", "note"
        ) VALUES ('event-prepared', 'certificate-1', 'PREPARED', 'user-1', 'accountant', 'prepared');
      `);

      await assert.rejects(execute(database, createCertificate('duplicate-number', 'certificate-1')), /UNIQUE constraint failed/);
      await assert.rejects(execute(database, createCertificate('duplicate-source', 'certificate-2')), /UNIQUE constraint failed/);
      await assert.rejects(execute(database, createCertificate('invalid-status', 'certificate-3', 'INV-3', 'DRAFT')), /CHECK constraint failed/);
      await assert.rejects(execute(database, `
        INSERT INTO "WithholdingCertificateWorkflowEvent" (
          "id", "certificateId", "action", "actorUserId", "actorUsername", "note"
        ) VALUES ('invalid-event', 'certificate-1', 'UNKNOWN', 'user-1', 'accountant', 'invalid');
      `), /CHECK constraint failed/);
      await assert.rejects(execute(database, `
        INSERT INTO "WithholdingCertificateWorkflowEvent" (
          "id", "certificateId", "action", "actorUserId", "actorUsername", "note"
        ) VALUES ('duplicate-event', 'certificate-1', 'PREPARED', 'user-1', 'accountant', 'duplicate');
      `), /UNIQUE constraint failed/);

      const foreignKeyErrors = await new Promise<Array<unknown>>((resolve, reject) => {
        database.all('PRAGMA foreign_key_check', (error, rows: unknown[]) => error ? reject(error) : resolve(rows));
      });
      assert.deepEqual(foreignKeyErrors, []);
      assert.equal(await new Promise<number>((resolve, reject) => {
        database.get('SELECT COUNT(*) AS count FROM "WithholdingCertificate"', (error, row: { count: number }) => (
          error ? reject(error) : resolve(row.count)
        ));
      }), 1);
    } finally {
      await new Promise<void>((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
