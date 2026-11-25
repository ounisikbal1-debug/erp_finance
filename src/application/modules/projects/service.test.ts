import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProjectService, type ProjectRecord, type ProjectRepository } from './service';

function createRepository(): ProjectRepository {
  const projects: ProjectRecord[] = [];
  const projectForEntity = (entityId: string, projectId: string) =>
    projects.find((project) => project.entityId === entityId && project.id === projectId) ?? null;
  return {
    async listProjects(entityId) {
      return projects.filter((project) => project.entityId === entityId);
    },
    async findProject(entityId, projectId) {
      return projectForEntity(entityId, projectId);
    },
    async createProject(entityId, input) {
      const project: ProjectRecord = {
        id: `project-${projects.length + 1}`,
        entityId,
        ...input,
        status: 'PLANNED',
        createdAt: new Date(),
        tasks: [],
        milestones: [],
        costs: [],
      };
      projects.push(project);
      return project;
    },
    async createTask(entityId, projectId, input) {
      const project = projectForEntity(entityId, projectId);
      if (!project) return null;
      project.tasks.push({ id: `task-${project.tasks.length + 1}`, ...input, status: 'PLANNED', completedAt: null });
      return project;
    },
    async updateProjectStatus(entityId, projectId, status) {
      const project = projectForEntity(entityId, projectId);
      if (!project) return null;
      project.status = status;
      return project;
    },
    async updateTaskStatus(entityId, projectId, taskId, status) {
      const project = projectForEntity(entityId, projectId);
      const task = project?.tasks.find((item) => item.id === taskId);
      if (!project || !task) return null;
      task.status = status;
      task.completedAt = status === 'COMPLETED' ? new Date() : null;
      return project;
    },
    async completeMilestone(entityId, projectId, milestoneId) {
      const project = projectForEntity(entityId, projectId);
      const milestone = project?.milestones.find((item) => item.id === milestoneId);
      if (!project || !milestone) return null;
      milestone.completedAt = new Date();
      return project;
    },
    async createMilestone(entityId, projectId, input) {
      const project = projectForEntity(entityId, projectId);
      if (!project) return null;
      project.milestones.push({ id: `milestone-${project.milestones.length + 1}`, ...input, completedAt: null });
      return project;
    },
    async createCost(entityId, projectId, input, userId) {
      const project = projectForEntity(entityId, projectId);
      if (!project) return null;
      project.costs.push({
        id: `cost-${project.costs.length + 1}`,
        ...input,
        createdByUserId: userId,
        createdAt: new Date(),
      });
      return project;
    },
  };
}

describe('ProjectService', () => {
  it('keeps projects scoped to an entity and summarizes only recorded costs', async () => {
    const service = new ProjectService(createRepository());
    const project = await service.createProject({
      projectCode: 'SITE-1',
      name: 'Chantier test',
      budgetAmount: 1000,
      contractAmount: 1400,
    }, 'entity-a');
    await service.createCost(project.id, {
      category: 'MATERIAL',
      description: 'Matériaux saisis',
      amount: 250,
      occurredAt: '2026-11-12',
    }, 'entity-a', 'user-a');
    await service.createCost(project.id, {
      category: 'LABOR',
      description: 'Main-d’Å“uvre saisie',
      amount: 125.25,
      occurredAt: '2026-11-12',
    }, 'entity-a', 'user-a');

    const [listed] = await service.listProjects('entity-a');
    assert.equal(listed.summary.recordedCosts, 375.25);
    assert.equal(listed.summary.budgetVariance, 624.75);
    assert.equal(listed.summary.contractLessRecordedCosts, 1024.75);
    assert.deepEqual(await service.listProjects('entity-b'), []);
    await assert.rejects(
      service.createTask(project.id, { title: 'Tâche hors entité' }, 'entity-b'),
      /Projet introuvable pour cette entité/,
    );
  });
});
