import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { after, before, describe, it } from 'node:test';
import { CustomsRegimeService } from './regime-service';

const projectRoot = resolve(__dirname, '../../../..');
const schemaPath = resolve(projectRoot, 'src/data/prisma/schema.prisma');
const prismaCli = resolve(projectRoot, 'node_modules/prisma/build/index.js');
let temporaryDirectory = '';
let database: PrismaClient;

function databaseUrl(databasePath: string): string {
  return `file:${databasePath.replace(/\\/g, '/')}`;
}

describe('CustomsRegimeService (isolated SQLite database)', () => {
  before(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'safe-customs-regime-'));
    const url = databaseUrl(join(temporaryDirectory, 'customs.sqlite'));
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

  it('persists scoped AT/ACT records, stock movements, and manually released bonds', async () => {
    const suffix = randomUUID();
    const country = await database.countryProfile.create({
      data: { code: `CR${suffix.slice(0, 6)}`, name: `Customs ${suffix}` },
    });
    const entity = await database.entity.create({
      data: { code: `CR-${suffix}`, name: `Customs entity ${suffix}`, countryId: country.id },
    });
    const otherEntity = await database.entity.create({
      data: { code: `CR-OTHER-${suffix}`, name: `Other customs entity ${suffix}`, countryId: country.id },
    });
    const service = new CustomsRegimeService(database);

    try {
      const regime = await service.createRegime(entity.id, {
        regimeType: 'AT',
        regimeReference: 'AT-SYNTHETIC',
        title: 'Admission temporaire de test',
        startsAt: '2026-01-01',
      });
      await service.updateRegimeStatus(entity.id, regime.id, 'ACTIVE');
      const sheet = await service.createStockSheet(entity.id, regime.id, {
        sheetReference: 'FICHE-TEST',
        tariffCode: '1234567890',
        itemDescription: 'Intrant synthétique',
        unitCode: 'KG',
      });
      await service.addStockMovement(entity.id, sheet.id, {
        direction: 'INBOUND',
        quantity: 500,
        occurredAt: '2026-05-01',
        reference: 'ENTREE-TEST',
      });
      await service.addStockMovement(entity.id, sheet.id, {
        direction: 'OUTBOUND',
        quantity: 200,
        occurredAt: '2026-06-01',
        reference: 'SORTIE-TEST',
      });
      const bond = await service.createBond(entity.id, regime.id, {
        bondReference: 'CAUTION-TEST',
        amount: 1250,
        currencyCode: 'TND',
      });
      await service.releaseBond(entity.id, regime.id, bond.id, {
        releasedAt: '2026-07-01',
        releaseReference: 'MAINLEVEE-TEST',
      });

      const [listed] = await service.list(entity.id);
      assert.equal(listed.status, 'ACTIVE');
      assert.equal(listed.stockSheets[0].movements.length, 2);
      assert.equal(listed.stockSheets[0].movements[0].direction, 'INBOUND');
      assert.equal(listed.bonds[0].status, 'RELEASED');
      assert.equal(listed.bonds[0].releaseReference, 'MAINLEVEE-TEST');
      assert.equal((await service.list(otherEntity.id)).length, 0);
      await assert.rejects(
        service.addStockMovement(otherEntity.id, sheet.id, {
          direction: 'OUTBOUND',
          quantity: 1,
          occurredAt: '2026-06-02',
          reference: 'HORS-ENTITE',
        }),
        /introuvable pour cette entité/,
      );
    } finally {
      await database.entity.deleteMany({ where: { id: { in: [entity.id, otherEntity.id] } } });
      await database.countryProfile.delete({ where: { id: country.id } });
    }
  });
});
