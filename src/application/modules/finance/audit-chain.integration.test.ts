import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import express from 'express';
import { after, before, describe, it } from 'node:test';
import { appendJournalEntryAuditRecord, verifyJournalEntryAuditChain } from './audit-chain';

const projectRoot = resolve(__dirname, '../../../..');
const schemaPath = resolve(projectRoot, 'src/data/prisma/schema.prisma');
const prismaCli = resolve(projectRoot, 'node_modules/prisma/build/index.js');
let temporaryDirectory = '';
let database: PrismaClient;
let sharedDatabase: PrismaClient | null = null;
let testDatabaseUrl = '';

function databaseUrl(databasePath: string): string {
  return `file:${databasePath.replace(/\\/g, '/')}`;
}

describe('journal entry SHA-256 chain (isolated SQLite database)', () => {
  before(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'safe-journal-audit-'));
    const url = databaseUrl(join(temporaryDirectory, 'audit.sqlite'));
    testDatabaseUrl = url;
    execFileSync(process.execPath, [
      prismaCli,
      'db',
      'push',
      '--schema',
      schemaPath,
      '--skip-generate',
    ], {
      cwd: projectRoot,
      env: { ...process.env, SAFE_ERP_DATABASE_URL: url },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    database = new PrismaClient({ datasources: { db: { url } } });
  });

  after(async () => {
    if (sharedDatabase) await sharedDatabase.$disconnect();
    if (database) await database.$disconnect();
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('links posted entries and detects changes to the hashed journal data', async () => {
    const suffix = randomUUID();
    const country = await database.countryProfile.create({
      data: { code: `AU${suffix.slice(0, 6)}`, name: `Audit ${suffix}` },
    });
    const entity = await database.entity.create({
      data: { code: `AU-${suffix}`, name: `Audit entity ${suffix}`, countryId: country.id },
    });

    try {
      const entries: string[] = [];
      for (let index = 1; index <= 2; index += 1) {
        await database.$transaction(async (tx) => {
          const entry = await tx.journalEntry.create({
            data: {
              entryNumber: `AUDIT-${suffix}-${index}`,
              entityId: entity.id,
              description: `Posted audit entry ${index}`,
              status: 'POSTED',
              lines: { create: [
                { accountCode: '1000', debit: index, credit: 0 },
                { accountCode: '2000', debit: 0, credit: index },
              ] },
            },
          });
          entries.push(entry.id);
          await appendJournalEntryAuditRecord(tx, entry.id);
        });
      }

      await Promise.all([3, 4].map((index) => database.$transaction(async (tx) => {
        const entry = await tx.journalEntry.create({
          data: {
            entryNumber: `AUDIT-${suffix}-${index}`,
            entityId: entity.id,
            description: `Concurrent audit entry ${index}`,
            status: 'POSTED',
            lines: { create: [
              { accountCode: '1000', debit: index, credit: 0 },
              { accountCode: '2000', debit: 0, credit: index },
            ] },
          },
        });
        entries.push(entry.id);
        await appendJournalEntryAuditRecord(tx, entry.id);
      })));

      const records = await database.journalEntryAuditRecord.findMany({
        where: { entityId: entity.id },
        orderBy: { sequence: 'asc' },
      });
      assert.equal(records.length, 4);
      assert.equal(records[0].sequence, 1);
      assert.equal(records[0].previousHash, null);
      for (let index = 1; index < records.length; index += 1) {
        assert.equal(records[index].sequence, index + 1);
        assert.equal(records[index].previousHash, records[index - 1].entryHash);
      }
      assert.deepEqual(await verifyJournalEntryAuditChain(database, entity.id), {
        entityId: entity.id,
        valid: true,
        checkedEntries: 4,
        headSequence: 4,
        errors: [],
      });

      await database.journalLine.updateMany({
        where: { journalEntryId: entries[0] },
        data: { debit: 99 },
      });
      const verification = await verifyJournalEntryAuditChain(database, entity.id);
      assert.equal(verification.valid, false);
      assert.ok(verification.errors.some((message) => message.includes(entries[0])));
    } finally {
      await database.entity.delete({ where: { id: entity.id } });
      await database.countryProfile.delete({ where: { id: country.id } });
    }
  });

  it('records an entry only when the finance workflow posts it', async () => {
    const suffix = randomUUID();
    const country = await database.countryProfile.create({
      data: { code: `FW${suffix.slice(0, 6)}`, name: `Finance workflow ${suffix}` },
    });
    const entity = await database.entity.create({
      data: { code: `FW-${suffix}`, name: `Finance workflow entity ${suffix}`, countryId: country.id },
    });
    await database.chartOfAccount.createMany({
      data: [
        { countryId: country.id, code: 'AUDIT-CASH', description: 'Audit cash account', classNumber: 1, type: 'Asset' },
        { countryId: country.id, code: 'AUDIT-REVENUE', description: 'Audit revenue account', classNumber: 7, type: 'Revenue' },
      ],
    });

    try {
      process.env.SAFE_ERP_DATABASE_URL = testDatabaseUrl;
      const sharedClientModule = await import('../../../data/prisma/client');
      sharedDatabase = sharedClientModule.default;
      const financeModule = await import('./service');
      const entry = await financeModule.default.createJournalEntry({
        entryNumber: `FINANCE-AUDIT-${suffix}`,
        entityId: entity.id,
        date: '2026-11-12',
        description: 'Écriture de test de la chaîne',
        lines: [
          { accountCode: 'AUDIT-CASH', debit: 100, credit: 0 },
          { accountCode: 'AUDIT-REVENUE', debit: 0, credit: 100 },
        ],
      }, { id: 'preparer', username: 'Préparateur' }, 'Soumission de test');
      await financeModule.default.approveJournalEntry(
        entry.id,
        entity.id,
        { id: 'approbateur', username: 'Approbateur' },
        'Contrôle de test',
      );
      await financeModule.default.postJournalEntry(
        entry.id,
        entity.id,
        { id: 'comptable', username: 'Comptable' },
        'Comptabilisation de test',
      );

      const auditRecord = await database.journalEntryAuditRecord.findUnique({
        where: { journalEntryId: entry.id },
      });
      assert.equal(auditRecord?.entityId, entity.id);
      assert.equal(auditRecord?.sequence, 1);
      assert.equal((await verifyJournalEntryAuditChain(database, entity.id)).valid, true);

      const financeApi = await import('./api/index');
      const app = express();
      app.use((_request, response, next) => {
        response.locals.authenticatedUser = {
          id: 'auditor',
          username: 'Auditeur',
          role: 'FINANCIAL_MANAGER',
          entityId: entity.id,
        };
        next();
      });
      app.use(financeApi.default);
      const server = createServer(app);
      await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
      try {
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        const response = await fetch(`http://127.0.0.1:${address.port}/audit-chain/verify`);
        assert.equal(response.status, 200);
        const verification = await response.json() as { valid: boolean; checkedEntries: number };
        assert.equal(verification.valid, true);
        assert.equal(verification.checkedEntries, 1);
      } finally {
        await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
      }
    } finally {
      await database.entity.delete({ where: { id: entity.id } });
      await database.countryProfile.delete({ where: { id: country.id } });
    }
  });
});
