import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';

type AuditClient = Pick<Prisma.TransactionClient,
  'journalEntry'
  | 'journalEntryAuditChainHead'
  | 'journalEntryAuditRecord'
>;

const HASH_VERSION = 1;

function canonicalEntry(entry: {
  id: string;
  entityId: string;
  entryNumber: string;
  date: Date;
  reference: string | null;
  description: string;
  status: string;
  createdByUserId: string | null;
  createdByUsername: string | null;
  approvedByUserId: string | null;
  approvedByUsername: string | null;
  approvedAt: Date | null;
  postedByUserId: string | null;
  postedByUsername: string | null;
  postedAt: Date | null;
  createdAt: Date;
  lines: Array<{
    accountCode: string;
    debit: number;
    credit: number;
    description: string | null;
    costCenterCode: string | null;
  }>;
}) {
  const lines = entry.lines.map((line) => ({
    accountCode: line.accountCode,
    debit: line.debit,
    credit: line.credit,
    description: line.description,
    costCenterCode: line.costCenterCode,
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return {
    id: entry.id,
    entityId: entry.entityId,
    entryNumber: entry.entryNumber,
    date: entry.date.toISOString(),
    reference: entry.reference,
    description: entry.description,
    status: entry.status,
    createdByUserId: entry.createdByUserId,
    createdByUsername: entry.createdByUsername,
    approvedByUserId: entry.approvedByUserId,
    approvedByUsername: entry.approvedByUsername,
    approvedAt: entry.approvedAt?.toISOString() ?? null,
    postedByUserId: entry.postedByUserId,
    postedByUsername: entry.postedByUsername,
    postedAt: entry.postedAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
    lines,
  };
}

function calculateEntryHash(input: {
  entityId: string;
  sequence: number;
  previousHash: string | null;
  entry: ReturnType<typeof canonicalEntry>;
}): string {
  return createHash('sha256').update(JSON.stringify({
    hashVersion: HASH_VERSION,
    entityId: input.entityId,
    sequence: input.sequence,
    previousHash: input.previousHash,
    entry: input.entry,
  })).digest('hex');
}

export async function appendJournalEntryAuditRecord(
  client: AuditClient,
  journalEntryId: string,
): Promise<{ sequence: number; entryHash: string }> {
  const entry = await client.journalEntry.findUnique({
    where: { id: journalEntryId },
    include: { lines: true },
  });
  if (!entry || entry.status !== 'POSTED') {
    throw new Error('Une écriture doit exister et être comptabilisée pour être ajoutée à la chaîne SHA-256.');
  }

  const alreadyRecorded = await client.journalEntryAuditRecord.findUnique({
    where: { journalEntryId },
    select: { sequence: true, entryHash: true },
  });
  if (alreadyRecorded) return alreadyRecorded;

  const now = new Date();
  const head = await client.journalEntryAuditChainHead.upsert({
    where: { entityId: entry.entityId },
    create: {
      entityId: entry.entityId,
      lastSequence: 0,
      lastHash: null,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    update: { updatedAt: now },
  });

  const rechecked = await client.journalEntryAuditRecord.findUnique({
    where: { journalEntryId },
    select: { sequence: true, entryHash: true },
  });
  if (rechecked) return rechecked;

  const sequence = head.lastSequence + 1;
  const previousHash = head.lastHash;
  const entryHash = calculateEntryHash({
    entityId: entry.entityId,
    sequence,
    previousHash,
    entry: canonicalEntry(entry),
  });
  await client.journalEntryAuditRecord.create({
    data: {
      entityId: entry.entityId,
      journalEntryId: entry.id,
      sequence,
      previousHash,
      entryHash,
      hashVersion: HASH_VERSION,
    },
  });
  await client.journalEntryAuditChainHead.update({
    where: { entityId: entry.entityId },
    data: { lastSequence: sequence, lastHash: entryHash, updatedAt: new Date() },
  });
  return { sequence, entryHash };
}

export interface JournalAuditVerification {
  entityId: string;
  valid: boolean;
  checkedEntries: number;
  headSequence: number;
  errors: string[];
}

export async function verifyJournalEntryAuditChain(
  client: AuditClient,
  entityId: string,
): Promise<JournalAuditVerification> {
  const head = await client.journalEntryAuditChainHead.findUnique({ where: { entityId } });
  if (!head) {
    return { entityId, valid: false, checkedEntries: 0, headSequence: 0, errors: ['Aucun état de chaîne n’existe pour cette société.'] };
  }

  const records = await client.journalEntryAuditRecord.findMany({
    where: { entityId },
    orderBy: { sequence: 'asc' },
  });
  const errors: string[] = [];
  let expectedSequence = 1;
  let expectedPreviousHash: string | null = null;
  const recordedEntryIds = new Set<string>();

  for (const record of records) {
    recordedEntryIds.add(record.journalEntryId);
    if (record.sequence !== expectedSequence) errors.push(`Séquence manquante ou désordonnée à la position ${expectedSequence}.`);
    if (record.previousHash !== expectedPreviousHash) errors.push(`Lien précédent invalide pour l’écriture ${record.journalEntryId}.`);
    const entry = await client.journalEntry.findFirst({
      where: { id: record.journalEntryId, entityId },
      include: { lines: true },
    });
    if (!entry) {
      errors.push(`Écriture source introuvable pour l’enregistrement ${record.journalEntryId}.`);
    } else {
      const expectedHash = calculateEntryHash({
        entityId,
        sequence: record.sequence,
        previousHash: record.previousHash,
        entry: canonicalEntry(entry),
      });
      if (entry.status !== 'POSTED' || record.hashVersion !== HASH_VERSION || expectedHash !== record.entryHash) {
        errors.push(`Empreinte invalide pour l’écriture ${record.journalEntryId}.`);
      }
    }
    expectedPreviousHash = record.entryHash;
    expectedSequence += 1;
  }

  const missingEntries = await client.journalEntry.findMany({
    where: {
      entityId,
      status: 'POSTED',
      OR: [
        { createdAt: { gte: head.startedAt } },
        { postedAt: { gte: head.startedAt } },
      ],
    },
    select: { id: true },
  });
  for (const entry of missingEntries) {
    if (!recordedEntryIds.has(entry.id)) errors.push(`Aucune empreinte n’est enregistrée pour l’écriture ${entry.id}.`);
  }

  const lastRecord = records[records.length - 1];
  if (head.lastSequence !== records.length
    || head.lastHash !== (lastRecord?.entryHash ?? null)) {
    errors.push('La tête de chaîne ne correspond pas au dernier enregistrement.');
  }

  return {
    entityId,
    valid: errors.length === 0,
    checkedEntries: records.length,
    headSequence: head.lastSequence,
    errors,
  };
}
