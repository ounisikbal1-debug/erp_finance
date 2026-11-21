import prisma from '../../../core/models/prisma';
import type { Prisma } from '@prisma/client';
import { ProjectRequestError } from './validation';
import type { ProjectRecord, ProjectRepository } from './service';
import type { ProjectCostCategory } from './validation';

const PROJECT_INCLUDE = {
  tasks: { orderBy: [{ dueAt: 'asc' as const }, { createdAt: 'asc' as const }] },
  milestones: { orderBy: [{ dueAt: 'asc' as const }, { createdAt: 'asc' as const }] },
  costs: { orderBy: [{ occurredAt: 'desc' as const }, { createdAt: 'desc' as const }] },
};

type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>;

function isProjectCostCategory(value: string): value is ProjectCostCategory {
  return value === 'MATERIAL' || value === 'LABOR' || value === 'OVERHEAD' || value === 'OTHER';
}

function toProjectRecord(row: ProjectRow): ProjectRecord {
  return {
    ...row,
    costs: row.costs.map((cost) => {
      if (!isProjectCostCategory(cost.category)) throw new Error(`Catégorie de coût projet inconnue : ${cost.category}`);
      return { ...cost, category: cost.category };
    }),
  };
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'P2002';
}

export class PrismaProjectRepository implements ProjectRepository {
  listProjects(entityId: string) {
    return prisma.project.findMany({
      where: { entityId },
      include: PROJECT_INCLUDE,
      orderBy: [{ startAt: 'desc' }, { name: 'asc' }],
    }).then((projects) => projects.map(toProjectRecord));
  }

  async findProject(entityId: string, projectId: string) {
    return prisma.project.findFirst({
      where: { id: projectId, entityId },
      include: PROJECT_INCLUDE,
    }).then((project) => project ? toProjectRecord(project) : null);
  }

  async createProject(entityId: string, input: Parameters<ProjectRepository['createProject']>[1]) {
    try {
      const project = await prisma.project.create({
        data: { ...input, entityId },
        include: PROJECT_INCLUDE,
      });
      return toProjectRecord(project);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ProjectRequestError('Ce code projet existe déjà dans cette entité.', 409);
      }
      throw error;
    }
  }

  async updateProjectStatus(
    entityId: string,
    projectId: string,
    status: Parameters<ProjectRepository['updateProjectStatus']>[2],
  ) {
    const updated = await prisma.project.updateMany({ where: { id: projectId, entityId }, data: { status } });
    if (updated.count !== 1) return null;
    const project = await prisma.project.findFirst({ where: { id: projectId, entityId }, include: PROJECT_INCLUDE });
    return project ? toProjectRecord(project) : null;
  }

  private async appendToProject<T>(
    entityId: string,
    projectId: string,
    createRecord: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({ where: { id: projectId, entityId }, select: { id: true } });
      if (!project) return null;
      await createRecord(tx);
      const updated = await tx.project.findFirst({
        where: { id: projectId, entityId },
        include: PROJECT_INCLUDE,
      });
      return updated ? toProjectRecord(updated) : null;
    });
  }

  createTask(entityId: string, projectId: string, input: Parameters<ProjectRepository['createTask']>[2]) {
    return this.appendToProject(entityId, projectId, (tx) => tx.projectTask.create({
      data: { ...input, entityId, projectId },
    }));
  }

  updateTaskStatus(
    entityId: string,
    projectId: string,
    taskId: string,
    status: Parameters<ProjectRepository['updateTaskStatus']>[3],
  ) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.projectTask.updateMany({
        where: { id: taskId, projectId, entityId },
        data: { status, completedAt: status === 'COMPLETED' ? new Date() : null },
      });
      if (updated.count !== 1) return null;
      const project = await tx.project.findFirst({ where: { id: projectId, entityId }, include: PROJECT_INCLUDE });
      return project ? toProjectRecord(project) : null;
    });
  }

  createMilestone(entityId: string, projectId: string, input: Parameters<ProjectRepository['createMilestone']>[2]) {
    return this.appendToProject(entityId, projectId, (tx) => tx.projectMilestone.create({
      data: { ...input, entityId, projectId },
    }));
  }

  completeMilestone(entityId: string, projectId: string, milestoneId: string) {
    return prisma.$transaction(async (tx) => {
      const milestone = await tx.projectMilestone.findFirst({
        where: { id: milestoneId, projectId, entityId },
        select: { completedAt: true },
      });
      if (!milestone) return null;
      if (!milestone.completedAt) {
        await tx.projectMilestone.updateMany({
          where: { id: milestoneId, projectId, entityId, completedAt: null },
          data: { completedAt: new Date() },
        });
      }
      const project = await tx.project.findFirst({ where: { id: projectId, entityId }, include: PROJECT_INCLUDE });
      return project ? toProjectRecord(project) : null;
    });
  }

  createCost(
    entityId: string,
    projectId: string,
    input: Parameters<ProjectRepository['createCost']>[2],
    userId: string,
  ) {
    return this.appendToProject(entityId, projectId, (tx) => tx.projectCost.create({
      data: { ...input, entityId, projectId, createdByUserId: userId },
    }));
  }
}
