import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import { getModuleRoles } from '../../../auth';
import { ProjectService, type ProjectRecord, type ProjectRepository } from '../service';
import { createProjectsRouter } from './index';

function createRepository(): ProjectRepository {
  const projects: ProjectRecord[] = [];
  const findProject = (entityId: string, projectId: string) =>
    projects.find((project) => project.entityId === entityId && project.id === projectId) ?? null;
  return {
    async listProjects(entityId) {
      return projects.filter((project) => project.entityId === entityId);
    },
    async findProject(entityId, projectId) {
      return findProject(entityId, projectId);
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
      const project = findProject(entityId, projectId);
      if (!project) return null;
      project.tasks.push({ id: `task-${project.tasks.length + 1}`, ...input, status: 'PLANNED', completedAt: null });
      return project;
    },
    async updateProjectStatus(entityId, projectId, status) {
      const project = findProject(entityId, projectId);
      if (!project) return null;
      project.status = status;
      return project;
    },
    async updateTaskStatus(entityId, projectId, taskId, status) {
      const project = findProject(entityId, projectId);
      const task = project?.tasks.find((item) => item.id === taskId);
      if (!project || !task) return null;
      task.status = status;
      task.completedAt = status === 'COMPLETED' ? new Date() : null;
      return project;
    },
    async createMilestone(entityId, projectId, input) {
      const project = findProject(entityId, projectId);
      if (!project) return null;
      project.milestones.push({ id: `milestone-${project.milestones.length + 1}`, ...input, completedAt: null });
      return project;
    },
    async completeMilestone(entityId, projectId, milestoneId) {
      const project = findProject(entityId, projectId);
      const milestone = project?.milestones.find((item) => item.id === milestoneId);
      if (!project || !milestone) return null;
      milestone.completedAt = new Date();
      return project;
    },
    async createCost(entityId, projectId, input, userId) {
      const project = findProject(entityId, projectId);
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

describe('projects API', () => {
  it('creates scoped projects and records tasks, milestones, and costs', async () => {
    assert.deepEqual(getModuleRoles('projects'), ['ADMIN', 'FINANCIAL_MANAGER']);
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-a',
        username: 'manager',
        role: 'FINANCIAL_MANAGER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(createProjectsRouter(new ProjectService(createRepository())));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;

      const createdResponse = await fetch(`${base}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectCode: 'SITE-1',
          name: 'Chantier test',
          budgetAmount: 1000,
          entityId: 'entity-spoofed',
        }),
      });
      assert.equal(createdResponse.status, 201);
      const project = await createdResponse.json() as { id: string; entityId?: string };
      assert.equal(project.entityId, 'entity-a');

      assert.equal((await fetch(`${base}/${project.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Fondations' }),
      })).status, 201);
      assert.equal((await fetch(`${base}/${project.id}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Réception provisoire' }),
      })).status, 201);
      assert.equal((await fetch(`${base}/${project.id}/costs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'MATERIAL', description: 'Matériaux', amount: 25, occurredAt: '2026-11-12' }),
      })).status, 201);
      assert.equal((await fetch(`${base}/${project.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACTIVE' }),
      })).status, 200);
      assert.equal((await fetch(`${base}/${project.id}/tasks/task-1/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      })).status, 200);
      assert.equal((await fetch(`${base}/${project.id}/milestones/milestone-1/complete`, {
        method: 'PATCH',
      })).status, 200);

      const [listed] = await (await fetch(`${base}/`)).json() as Array<{
        status: string;
        tasks: unknown[];
        milestones: unknown[];
        costs: unknown[];
        summary: { recordedCosts: number };
      }>;
      assert.equal(listed.tasks.length, 1);
      assert.equal(listed.milestones.length, 1);
      assert.equal(listed.costs.length, 1);
      assert.equal(listed.status, 'ACTIVE');
      assert.equal(listed.summary.recordedCosts, 25);

      const missingScopeApp = express();
      missingScopeApp.use(express.json());
      missingScopeApp.use((_req, res, next) => {
        res.locals.authenticatedUser = {
          id: 'user-unscoped',
          username: 'manager',
          role: 'FINANCIAL_MANAGER',
          entityId: null,
        };
        next();
      });
      missingScopeApp.use(createProjectsRouter(new ProjectService(createRepository())));
      const missingScopeServer = createServer(missingScopeApp);
      await new Promise<void>((resolve) => missingScopeServer.listen(0, '127.0.0.1', resolve));
      try {
        const missingScopeAddress = missingScopeServer.address();
        assert.ok(missingScopeAddress && typeof missingScopeAddress !== 'string');
        assert.equal((await fetch(`http://127.0.0.1:${missingScopeAddress.port}/`)).status, 403);
      } finally {
        await new Promise<void>((resolve, reject) => missingScopeServer.close((error) => error ? reject(error) : resolve()));
      }
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
