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

function query<T>(database: sqlite3.Database, sql: string): Promise<T> {
  return new Promise((resolve, reject) => {
    database.get(sql, (error, row: T) => error ? reject(error) : resolve(row));
  });
}

describe('user account status migration', () => {
  it('adds an active-by-default status without changing existing account access', async () => {
    const database = new sqlite3.Database(':memory:');
    try {
      await execute(database, `
        CREATE TABLE "User" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "role" TEXT NOT NULL
        );
        INSERT INTO "User" ("id", "role") VALUES ('existing-admin', 'ADMIN');
      `);
      const migration = readFileSync(join(
        __dirname,
        '..',
        'data',
        'prisma',
        'migrations',
        '20261113233000_user_account_status',
        'migration.sql',
      ), 'utf8');
      await execute(database, migration);
      const existing = await query<{ isActive: number }>(
        database,
        `SELECT "isActive" FROM "User" WHERE "id" = 'existing-admin'`,
      );
      assert.equal(existing.isActive, 1);
      await execute(database, `INSERT INTO "User" ("id", "role", "isActive") VALUES ('disabled-user', 'ACCOUNTANT', 0)`);
      const index = await query<{ name: string }>(
        database,
        `SELECT "name" FROM pragma_index_list('User') WHERE "name" = 'User_role_isActive_idx'`,
      );
      assert.equal(index.name, 'User_role_isActive_idx');
    } finally {
      await new Promise<void>((resolve, reject) => database.close((error) => error ? reject(error) : resolve()));
    }
  });
});
