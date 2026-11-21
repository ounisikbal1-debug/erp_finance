import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import { PrismaProjectRepository } from './repository';
import { ProjectService } from './service';

const databaseTest = process.env.NODE_ENV === 'test' && Boolean(process.env.SAFE_ERP_TEST_DATABASE_URL)
  ? describe
  : describe.skip;

after(async () => {
  await prisma.$disconnect();
});

databaseTest('PrismaProjectRepository (isolated test database)', () => {
  it('persists scoped projects, tasks, milestones, and manually recorded costs', async () => {
    const suffix = randomUUID();
    const country = await prisma.countryProfile.create({
      data: { code: `PRJ${suffix.slice(0, 6)}`, name: `Project ${suffix}` },
    });
    const entity = await prisma.entity.create({
      data: { code: `PRJ-${suffix}`, name: `Project entity ${suffix}`, countryId: country.id },
    });
    const otherEntity = await prisma.entity.create({
      data: { code: `PRJ-OTHER-${suffix}`, name: `Other project entity ${suffix}`, countryId: country.id },
    });
    const service = new ProjectService(new PrismaProjectRepository());

    try {
      const project = await service.createProject({
        projectCode: 'SITE-TEST',
        name: 'Chantier synthétique',
        budgetAmount: 10000,
        contractAmount: 14000,
        startAt: '2026-11-01',
        endAt: '2027-01-31',
      }, entity.id);
      const withTask = await service.createTask(project.id, { title: 'Fondations' }, entity.id);
      const withMilestone = await service.createMilestone(project.id, { title: 'Réception provisoire' }, entity.id);
      await service.updateProjectStatus(project.id, 'ACTIVE', entity.id);
      await service.updateTaskStatus(project.id, withTask.tasks[0].id, 'COMPLETED', entity.id);
      await service.completeMilestone(project.id, withMilestone.milestones[0].id, entity.id);
      await service.createCost(project.id, {
        category: 'MATERIAL',
        description: 'Matériaux synthétiques',
        amount: 125.5,
        occurredAt: '2026-11-12',
        sourceReference: 'DOC-TEST',
      }, entity.id, 'user-test');

      const [listed] = await service.listProjects(entity.id);
      assert.equal(listed.tasks.length, 1);
      assert.equal(listed.tasks[0].status, 'COMPLETED');
      assert.equal(listed.milestones.length, 1);
      assert.ok(listed.milestones[0].completedAt instanceof Date);
      assert.equal(listed.status, 'ACTIVE');
      assert.equal(listed.summary.recordedCosts, 125.5);
      assert.equal((await service.listProjects(otherEntity.id)).length, 0);
      await assert.rejects(
        service.createCost(project.id, {
          category: 'OTHER',
          description: 'Hors entité',
          amount: 10,
          occurredAt: '2026-11-12',
        }, otherEntity.id, 'user-test'),
        /Projet introuvable pour cette entité/,
      );
    } finally {
      await prisma.entity.deleteMany({ where: { id: { in: [entity.id, otherEntity.id] } } });
      await prisma.countryProfile.delete({ where: { id: country.id } });
    }
  });
});
