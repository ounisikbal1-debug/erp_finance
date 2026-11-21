import assert from 'node:assert/strict';
import { access, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import prisma from '../core/models/prisma';

async function writeSignal(directory: string, name: string, value: Record<string, unknown> = {}): Promise<void> {
  const path = join(directory, name);
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value), { flag: 'wx' });
  await rename(temporaryPath, path);
}

async function waitForSignal(directory: string, name: string): Promise<void> {
  const signalPath = join(directory, name);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      await access(signalPath);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for PostgreSQL race signal ${name}.`);
}

async function holdCloseLock(directory: string): Promise<void> {
  await prisma.$connect();
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      `INSERT INTO "MonthlyCloseLock" ("id", "entityId", "period", "note", "actorUserId", "actorUsername")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      'synthetic-period-lock',
      'synthetic-lock-entity',
      '2026-01',
      'Synthetic integration lock',
      'test-user',
      'integration',
    );
    await writeSignal(directory, 'lock-created.json');
    await waitForSignal(directory, 'release-lock.json');
  });

  let lockMutationRejected = false;
  await assert.rejects(
    prisma.$executeRawUnsafe(
      `UPDATE "MonthlyCloseLock" SET "note" = $1 WHERE "id" = $2`,
      'changed',
      'synthetic-period-lock',
    ),
    (error: unknown) => {
      assert.match(String(error), /SAFE_PERIOD_LOCK_IMMUTABLE/i);
      lockMutationRejected = true;
      return true;
    },
  );
  await writeSignal(directory, 'lock-result.json', { lockMutationRejected });
}

async function insertJournalEntry(directory: string): Promise<void> {
  await prisma.$connect();
  await writeSignal(directory, 'journal-ready.json');
  await waitForSignal(directory, 'start-journal.json');
  await writeSignal(directory, 'journal-attempting.json');

  let journalInsertRejected = false;
  await assert.rejects(
    prisma.$executeRawUnsafe(
      `INSERT INTO "JournalEntry" ("id", "entryNumber", "entityId", "date", "description")
       VALUES ($1, $2, $3, $4, $5)`,
      'synthetic-blocked-journal',
      'SYNTH-BLOCKED',
      'synthetic-lock-entity',
      new Date('2026-01-15T12:00:00.000Z'),
      'Synthetic locked-period race',
    ),
    (error: unknown) => {
      assert.match(String(error), /SAFE_PERIOD_LOCKED/i);
      journalInsertRejected = true;
      return true;
    },
  );
  await writeSignal(directory, 'journal-result.json', { journalInsertRejected });
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  const directory = process.argv[3];
  assert.ok(mode === 'lock' || mode === 'journal', 'Worker mode must be lock or journal.');
  assert.ok(directory, 'A temporary signal directory is required.');

  try {
    if (mode === 'lock') await holdCloseLock(directory);
    else await insertJournalEntry(directory);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
