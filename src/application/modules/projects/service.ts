import {
  ProjectRequestError,
  validateProjectCostInput,
  validateProjectInput,
  validateProjectMilestoneInput,
  validateProjectTaskInput,
  validateProjectStatus,
  validateProjectTaskStatus,
  type ProjectCostInput,
  type ProjectInput,
  type ProjectMilestoneInput,
  type ProjectTaskInput,
} from './validation';

export interface ProjectRecord {
  id: string;
  entityId: string;
  projectCode: string;
  name: string;
  description: string | null;
  status: string;
  budgetAmount: number | null;
  contractAmount: number | null;
  startAt: Date | null;
  endAt: Date | null;
  createdAt: Date;
  tasks: Array<ProjectTaskInput & { id: string; status: string; completedAt: Date | null }>;
  milestones: Array<ProjectMilestoneInput & { id: string; completedAt: Date | null }>;
  costs: Array<ProjectCostInput & { id: string; createdByUserId: string; createdAt: Date }>;
}

export interface ProjectRepository {
  listProjects(entityId: string): Promise<ProjectRecord[]>;
  findProject(entityId: string, projectId: string): Promise<ProjectRecord | null>;
  createProject(entityId: string, input: ProjectInput): Promise<ProjectRecord>;
  createTask(entityId: string, projectId: string, input: ProjectTaskInput): Promise<ProjectRecord | null>;
  updateProjectStatus(entityId: string, projectId: string, status: ReturnType<typeof validateProjectStatus>): Promise<ProjectRecord | null>;
  updateTaskStatus(
    entityId: string,
    projectId: string,
    taskId: string,
    status: ReturnType<typeof validateProjectTaskStatus>,
  ): Promise<ProjectRecord | null>;
  completeMilestone(entityId: string, projectId: string, milestoneId: string): Promise<ProjectRecord | null>;
  createMilestone(entityId: string, projectId: string, input: ProjectMilestoneInput): Promise<ProjectRecord | null>;
  createCost(
    entityId: string,
    projectId: string,
    input: ProjectCostInput,
    userId: string,
  ): Promise<ProjectRecord | null>;
}

export function summarizeProject(project: ProjectRecord) {
  const recordedCosts = Math.round(project.costs.reduce((sum, cost) => sum + cost.amount, 0) * 1_000) / 1_000;
  return {
    recordedCosts,
    budgetVariance: project.budgetAmount === null
      ? null
      : Math.round((project.budgetAmount - recordedCosts) * 1_000) / 1_000,
    contractLessRecordedCosts: project.contractAmount === null
      ? null
      : Math.round((project.contractAmount - recordedCosts) * 1_000) / 1_000,
  };
}

export class ProjectService {
  constructor(private readonly repository: ProjectRepository) {}

  async listProjects(entityId: string) {
    const projects = await this.repository.listProjects(entityId);
    return projects.map((project) => ({ ...project, summary: summarizeProject(project) }));
  }

  async createProject(value: unknown, entityId: string) {
    const input = validateProjectInput(value);
    return this.repository.createProject(entityId, input);
  }

  async createTask(projectId: string, value: unknown, entityId: string) {
    const input = validateProjectTaskInput(value);
    const project = await this.repository.createTask(entityId, projectId, input);
    if (!project) throw new ProjectRequestError('Projet introuvable pour cette entité.', 404);
    return project;
  }

  async updateProjectStatus(projectId: string, value: unknown, entityId: string) {
    const project = await this.repository.updateProjectStatus(entityId, projectId, validateProjectStatus(value));
    if (!project) throw new ProjectRequestError('Projet introuvable pour cette entité.', 404);
    return project;
  }

  async updateTaskStatus(projectId: string, taskId: string, value: unknown, entityId: string) {
    const project = await this.repository.updateTaskStatus(
      entityId,
      projectId,
      taskId,
      validateProjectTaskStatus(value),
    );
    if (!project) throw new ProjectRequestError('Projet ou tâche introuvable pour cette entité.', 404);
    return project;
  }

  async completeMilestone(projectId: string, milestoneId: string, entityId: string) {
    const project = await this.repository.completeMilestone(entityId, projectId, milestoneId);
    if (!project) throw new ProjectRequestError('Projet ou jalon introuvable pour cette entité.', 404);
    return project;
  }

  async createMilestone(projectId: string, value: unknown, entityId: string) {
    const input = validateProjectMilestoneInput(value);
    const project = await this.repository.createMilestone(entityId, projectId, input);
    if (!project) throw new ProjectRequestError('Projet introuvable pour cette entité.', 404);
    return project;
  }

  async createCost(projectId: string, value: unknown, entityId: string, userId: string) {
    if (!userId.trim()) throw new ProjectRequestError('Un utilisateur authentifié est requis.', 401);
    const input = validateProjectCostInput(value);
    const project = await this.repository.createCost(entityId, projectId, input, userId);
    if (!project) throw new ProjectRequestError('Projet introuvable pour cette entité.', 404);
    return { ...project, summary: summarizeProject(project) };
  }
}
