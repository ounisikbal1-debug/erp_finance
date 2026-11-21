import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';
import sqlite3 from 'sqlite3';
import { verifyPassword } from '../application/security/passwords';
import { verifySqliteIntegrity } from './sqlite-backup';
import { bootstrapFirstAdmin, FirstAdminBootstrapError } from './bootstrap-first-admin';

let temporaryDirectory: string;
let databasePath: string;
let databaseUrl: string;

function createUserTable(path: string): Promise<void> {
  const database = new sqlite3.Database(path);
  return new Promise((resolveTable, rejectTable) => {
    database.exec(`CREATE TABLE User (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'ADMIN',
      isActive BOOLEAN NOT NULL DEFAULT 1,
      entityId TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`, (error) => {
      database.close((closeError) => {
        if (error) rejectTable(error);
        else if (closeError) rejectTable(closeError);
        else resolveTable();
      });
    });
  });
}

describe('first administrator bootstrap', () => {
  before(async () => {
    temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'safe-first-admin-'));
    databasePath = resolve(temporaryDirectory, 'isolated.db');
    databaseUrl = `file:${databasePath.replace(/\\/g, '/')}`;
    await createUserTable(databasePath);
  });

  after(async () => {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('creates only the first admin, hashes the password, and leaves a verified empty-account backup', async () => {
    const backupPath = await bootstrapFirstAdmin(
      databaseUrl,
      '  first.admin  ',
      'synthetic-only-password-123',
    );
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const users = await prisma.user.findMany({
        select: { username: true, passwordHash: true, role: true, isActive: true, entityId: true },
      });
      assert.equal(users.length, 1);
      assert.equal(users[0].username, 'first.admin');
      assert.equal(users[0].role, 'ADMIN');
      assert.equal(users[0].isActive, true);
      assert.equal(users[0].entityId, null);
      assert.notEqual(users[0].passwordHash, 'synthetic-only-password-123');
      assert.equal(await verifyPassword('synthetic-only-password-123', users[0].passwordHash), true);

      await verifySqliteIntegrity(backupPath);
      const backupPrisma = new PrismaClient({ datasources: { db: { url: `file:${backupPath.replace(/\\/g, '/')}` } } });
      try {
        assert.equal(await backupPrisma.user.count(), 0);
      } finally {
        await backupPrisma.$disconnect();
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('refuses non-empty databases and invalid input without creating another backup', async () => {
    const filesBefore = (await readdir(temporaryDirectory))
      .filter((name) => name.includes('.first-admin-'));
    await assert.rejects(
      bootstrapFirstAdmin(databaseUrl, 'second.admin', 'synthetic-only-password-456'),
      FirstAdminBootstrapError,
    );
    await assert.rejects(
      bootstrapFirstAdmin(databaseUrl, 'x', 'synthetic-only-password-789'),
      /3 à 100 caractères/,
    );
    await assert.rejects(
      bootstrapFirstAdmin(databaseUrl, 'another.admin', 'too-short'),
      /12 à 1024 caractères/,
    );
    const filesAfter = (await readdir(temporaryDirectory))
      .filter((name) => name.includes('.first-admin-'));
    assert.deepEqual(filesAfter, filesBefore);
  });

  it('requires an explicit absolute, persistent SQLite target', async () => {
    await assert.rejects(
      bootstrapFirstAdmin('file:relative.db', 'first.admin', 'synthetic-only-password-123'),
      /chemin SQLite absolu/,
    );
    await assert.rejects(
      bootstrapFirstAdmin('postgresql://localhost/safe', 'first.admin', 'synthetic-only-password-123'),
      /uniquement une base SQLite locale/,
    );
  });
});
