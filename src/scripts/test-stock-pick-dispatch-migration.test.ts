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

describe('stock pick and dispatch migration', () => {
  it('creates scoped pick, line and dispatch records with unique idempotency', async () => {
    const database = new sqlite3.Database(':memory:');
    try {
      await execute(database, `
        PRAGMA foreign_keys = ON;
        CREATE TABLE "Entity" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "Material" (
          "id" TEXT NOT NULL,
          "entityId" TEXT NOT NULL,
          PRIMARY KEY ("id"),
          UNIQUE ("id", "entityId"),
          FOREIGN KEY ("entityId") REFERENCES "Entity" ("id")
        );
        CREATE TABLE "Warehouse" (
          "id" TEXT NOT NULL,
          "entityId" TEXT NOT NULL,
          PRIMARY KEY ("id"),
          UNIQUE ("id", "entityId"),
          FOREIGN KEY ("entityId") REFERENCES "Entity" ("id")
        );
        INSERT INTO "Entity" ("id") VALUES ('entity-a'), ('entity-b');
        INSERT INTO "Material" ("id", "entityId") VALUES ('material-a', 'entity-a');
        INSERT INTO "Warehouse" ("id", "entityId") VALUES ('warehouse-a', 'entity-a');
      `);
      await execute(database, readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261110120000_stock_pick_dispatch',
        'migration.sql',
      ), 'utf8'));
      await execute(database, `
        INSERT INTO "StockPick" (
          "id", "entityId", "reference", "reason", "idempotencyKey", "createdByUserId", "createdByUsername"
        ) VALUES ('pick-a', 'entity-a', 'PICK-1', 'TEST order preparation', 'pick-key-1', 'user-a', 'logistics');
        INSERT INTO "StockPickLine" ("id", "entityId", "pickId", "materialId", "warehouseId", "quantity")
        VALUES ('pick-line-a', 'entity-a', 'pick-a', 'material-a', 'warehouse-a', 2);
        INSERT INTO "StockDispatch" (
          "id", "entityId", "pickId", "idempotencyKey", "confirmedByUserId", "confirmedByUsername"
        ) VALUES ('dispatch-a', 'entity-a', 'pick-a', 'dispatch-key-1', 'user-a', 'logistics');
      `);
      await assert.rejects(execute(database, `
        INSERT INTO "StockPickLine" ("id", "entityId", "pickId", "materialId", "warehouseId", "quantity")
        VALUES ('pick-line-cross', 'entity-b', 'pick-a', 'material-a', 'warehouse-a', 1);
      `), /FOREIGN KEY constraint failed/);
      await assert.rejects(execute(database, `
        INSERT INTO "StockDispatch" (
          "id", "entityId", "pickId", "idempotencyKey", "confirmedByUserId", "confirmedByUsername"
        ) VALUES ('dispatch-cross', 'entity-b', 'pick-a', 'dispatch-key-cross', 'user-b', 'other');
      `), /FOREIGN KEY constraint failed/);
      await assert.rejects(execute(database, `
        INSERT INTO "StockDispatch" (
          "id", "entityId", "pickId", "idempotencyKey", "confirmedByUserId", "confirmedByUsername"
        ) VALUES ('dispatch-duplicate', 'entity-a', 'pick-a', 'dispatch-key-1', 'user-a', 'logistics');
      `), /UNIQUE constraint failed/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
