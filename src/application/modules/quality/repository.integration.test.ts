import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import QualityService from './service';

const databaseTest = process.env.NODE_ENV === 'test' && Boolean(process.env.SAFE_ERP_TEST_DATABASE_URL)
  ? describe
  : describe.skip;

after(async () => {
  await prisma.$disconnect();
});

databaseTest('QualityService (isolated synthetic SQLite database)', () => {
  it('persists scoped equipment findings and verified corrective actions through closure', async () => {
    const suffix = randomUUID();
    const country = await prisma.countryProfile.create({
      data: { code: `QLT${suffix.slice(0, 6)}`, name: `Qualité synthétique ${suffix}` },
    });
    const firstEntity = await prisma.entity.create({
      data: { code: `QLT-A-${suffix}`, name: `Entité qualité A ${suffix}`, countryId: country.id },
    });
    const secondEntity = await prisma.entity.create({
      data: { code: `QLT-B-${suffix}`, name: `Entité qualité B ${suffix}`, countryId: country.id },
    });
    const equipment = await prisma.equipment.create({
      data: {
        entityId: firstEntity.id,
        assetTag: `EQ-${suffix}`,
        name: 'Équipement fictif de test',
        category: 'Test',
      },
    });

    try {
      const finding = await QualityService.createFinding({
        title: 'Vibration hors seuil',
        description: 'Mesure fictive supérieure au seuil de test.',
        source: 'EQUIPMENT',
        severity: 'HIGH',
        equipmentId: equipment.id,
        detectedAt: '2026-11-05T09:00:00.000Z',
        dueAt: '2026-11-12T09:00:00.000Z',
        owner: 'Responsable qualité fictif',
      }, firstEntity.id);

      assert.equal(finding.equipment?.id, equipment.id);
      assert.equal((await QualityService.listFindings(firstEntity.id)).length, 1);
      assert.equal((await QualityService.listFindings(secondEntity.id)).length, 0);
      assert.equal((await QualityService.listEquipment(firstEntity.id)).length, 1);
      assert.equal((await QualityService.listEquipment(secondEntity.id)).length, 0);

      await assert.rejects(() => QualityService.createFinding({
        title: 'Référence inter-entité interdite',
        description: 'Un équipement d’une autre société ne peut pas être associé.',
        source: 'EQUIPMENT',
        severity: 'LOW',
        equipmentId: equipment.id,
        detectedAt: '2026-11-05T09:00:00.000Z',
        owner: 'Responsable fictif',
      }, secondEntity.id), /Équipement actif introuvable pour cette société/);

      const action = await QualityService.createAction(finding.id, {
        type: 'CORRECTIVE',
        description: 'Remplacer la pièce fictive.',
        owner: 'Technicien fictif',
        dueAt: '2026-11-10T09:00:00.000Z',
      }, firstEntity.id);
      await QualityService.updateAction(action.id, { status: 'IN_PROGRESS' }, firstEntity.id);
      await QualityService.updateAction(action.id, {
        status: 'COMPLETED',
        verificationNotes: 'Contrôle synthétique conforme après remplacement.',
      }, firstEntity.id);
      await QualityService.updateFinding(finding.id, { status: 'INVESTIGATING' }, firstEntity.id);
      await QualityService.updateFinding(finding.id, { status: 'ACTION_REQUIRED' }, firstEntity.id);
      await QualityService.updateFinding(finding.id, { status: 'VERIFYING' }, firstEntity.id);
      const closed = await QualityService.updateFinding(finding.id, {
        status: 'CLOSED',
        rootCause: 'Usure fictive de la pièce.',
        closureNotes: 'Vérification synthétique satisfaisante.',
      }, firstEntity.id);

      assert.equal(closed.status, 'CLOSED');
      assert.equal(closed.actions[0].status, 'COMPLETED');
      assert.match(closed.actions[0].verificationNotes ?? '', /Contrôle synthétique/);
      assert.ok(closed.actions[0].completedAt instanceof Date);
    } finally {
      await prisma.entity.deleteMany({ where: { id: { in: [firstEntity.id, secondEntity.id] } } });
      await prisma.countryProfile.delete({ where: { id: country.id } });
    }
  });
});
