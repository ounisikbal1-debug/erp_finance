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

describe('production order cancellation migration', () => {
  it('preserves existing orders and adds nullable audit fields', async () => {
    const database = new sqlite3.Database(':memory:');
    try {
      await execute(database, `
        CREATE TABLE "ProductionOrder" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "entityId" TEXT NOT NULL,
          "orderNumber" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'DRAFT'
        );
        INSERT INTO "ProductionOrder" ("id", "entityId", "orderNumber", "status")
        VALUES ('order-existing', 'entity-a', 'OF-001', 'POSTED');
      `);
      await execute(database, readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261108130000_production_order_cancellation',
        'migration.sql',
      ), 'utf8'));

      const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
        database.get('SELECT * FROM "ProductionOrder" WHERE "id" = ?', ['order-existing'], (error, row) => (
          error ? reject(error) : resolve(row as Record<string, unknown>)
        ));
      });
      assert.equal(result.status, 'POSTED');
      assert.equal(result.cancelledAt, null);
      assert.equal(result.cancelledByUserId, null);
      assert.equal(result.cancelledByUsername, null);
      assert.equal(result.cancellationReason, null);
    } finally {
      await new Promise<void>((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
