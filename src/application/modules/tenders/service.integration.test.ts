import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { after, before, describe, it } from 'node:test';
import { TenderService } from './service';

const projectRoot = resolve(__dirname, '../../../..');
const schemaPath = resolve(projectRoot, 'src/data/prisma/schema.prisma');
const prismaCli = resolve(projectRoot, 'node_modules/prisma/build/index.js');
let temporaryDirectory = '';
let database: PrismaClient;

function databaseUrl(databasePath: string): string {
  return `file:${databasePath.replace(/\\/g, '/')}`;
}

describe('TenderService (isolated SQLite database)', () => {
  before(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'safe-tenders-'));
    const url = databaseUrl(join(temporaryDirectory, 'tenders.sqlite'));
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
    if (database) await database.$disconnect();
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('persists scoped tenders, configurable documents, and manual cautions', async () => {
    const suffix = randomUUID();
    const country = await database.countryProfile.create({
      data: { code: `TN${suffix.slice(0, 6)}`, name: `Tender ${suffix}` },
    });
    const entity = await database.entity.create({
      data: { code: `TD-${suffix}`, name: `Tender entity ${suffix}`, countryId: country.id },
    });
    const otherEntity = await database.entity.create({
      data: { code: `TD-OTHER-${suffix}`, name: `Other tender entity ${suffix}`, countryId: country.id },
    });
    const service = new TenderService(database);

    try {
      const tender = await service.create(entity.id, {
        tenderReference: 'AO-TEST-1',
        title: 'Appel d’offres synthétique',
        contractingAuthority: 'Administration synthétique',
        submissionDeadline: '2027-01-15',
      });
      const document = await service.addDocument(entity.id, tender.id, { title: 'Pièce définie par l’équipe' });
      await service.updateDocument(entity.id, tender.id, document.id, {
        status: 'READY',
        validUntil: '2027-01-10',
        reference: 'DOC-SYNTHETIQUE',
      });
      const caution = await service.addCaution(entity.id, tender.id, {
        kind: 'PROVISIONAL',
        amount: 1250,
        currencyCode: 'TND',
        reference: 'REF-SYNTHETIQUE',
      });
      await service.updateCaution(entity.id, tender.id, caution.id, {
        status: 'RELEASED',
        issuedAt: '2026-12-01',
        releasedAt: '2026-12-15',
      });
      await service.updateStatus(entity.id, tender.id, 'SUBMITTED');

      const [listed] = await service.list(entity.id);
      assert.equal(listed.status, 'SUBMITTED');
      assert.equal(listed.documents.length, 1);
      assert.equal(listed.documents[0].title, 'Pièce définie par l’équipe');
      assert.equal(listed.documents[0].status, 'READY');
      assert.equal(listed.documents[0].reference, 'DOC-SYNTHETIQUE');
      assert.equal(listed.cautions.length, 1);
      assert.equal(listed.cautions[0].amount, 1250);
      assert.equal(listed.cautions[0].status, 'RELEASED');
      assert.equal(listed.cautions[0].releasedAt?.toISOString().slice(0, 10), '2026-12-15');
      assert.equal((await service.list(otherEntity.id)).length, 0);
      await assert.rejects(
        service.addDocument(otherEntity.id, tender.id, { title: 'Hors entité' }),
        /introuvable pour cette entité/,
      );
      await assert.rejects(
        service.updateDocument(otherEntity.id, tender.id, document.id, { status: 'READY' }),
        /introuvable/,
      );
    } finally {
      await database.entity.deleteMany({ where: { id: { in: [entity.id, otherEntity.id] } } });
      await database.countryProfile.delete({ where: { id: country.id } });
    }
  });
});
