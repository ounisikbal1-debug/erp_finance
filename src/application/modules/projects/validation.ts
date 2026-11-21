export type ProjectCostCategory = 'MATERIAL' | 'LABOR' | 'OVERHEAD' | 'OTHER';
export type ProjectStatus = 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
export type ProjectTaskStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface ProjectInput {
  projectCode: string;
  name: string;
  description: string | null;
  budgetAmount: number | null;
  contractAmount: number | null;
  startAt: Date | null;
  endAt: Date | null;
}

export interface ProjectTaskInput {
  title: string;
  description: string | null;
  dueAt: Date | null;
}

export interface ProjectMilestoneInput {
  title: string;
  description: string | null;
  dueAt: Date | null;
}

export interface ProjectCostInput {
  category: ProjectCostCategory;
  description: string;
  amount: number;
  occurredAt: Date;
  sourceReference: string | null;
}

export class ProjectRequestError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'ProjectRequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new ProjectRequestError(`${label} doit contenir entre 1 et ${maxLength} caractères.`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new ProjectRequestError(`${label} ne peut pas dépasser ${maxLength} caractères.`);
  }
  return value.trim() || null;
}

function optionalAmount(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0
    || !Number.isSafeInteger(Math.round(value * 1_000))
    || Math.abs(value * 1_000 - Math.round(value * 1_000)) > 1e-7) {
    throw new ProjectRequestError(`${label} doit être un montant positif ou nul avec au maximum trois décimales.`);
  }
  return value;
}

function optionalDate(value: unknown, label: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ProjectRequestError(`${label} doit être au format AAAA-MM-JJ.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ProjectRequestError(`${label} est invalide.`);
  }
  return parsed;
}

function requiredDate(value: unknown, label: string): Date {
  const parsed = optionalDate(value, label);
  if (!parsed) throw new ProjectRequestError(`${label} est obligatoire.`);
  return parsed;
}

export function validateProjectInput(value: unknown): ProjectInput {
  if (!isRecord(value)) throw new ProjectRequestError('Données de projet invalides.');
  const startAt = optionalDate(value.startAt, 'La date de début');
  const endAt = optionalDate(value.endAt, 'La date de fin');
  if (startAt && endAt && endAt < startAt) {
    throw new ProjectRequestError('La date de fin ne peut pas précéder la date de début.');
  }
  return {
    projectCode: requiredText(value.projectCode, 'Le code projet', 30),
    name: requiredText(value.name, 'Le nom du projet', 160),
    description: optionalText(value.description, 'La description', 2_000),
    budgetAmount: optionalAmount(value.budgetAmount, 'Le budget'),
    contractAmount: optionalAmount(value.contractAmount, 'Le montant contractuel'),
    startAt,
    endAt,
  };
}

function validateScheduleInput(value: unknown, label: string): ProjectTaskInput {
  if (!isRecord(value)) throw new ProjectRequestError(`Données ${label.toLowerCase()} invalides.`);
  return {
    title: requiredText(value.title, `Le titre ${label.toLowerCase()}`, 160),
    description: optionalText(value.description, 'La description', 2_000),
    dueAt: optionalDate(value.dueAt, 'La date d’échéance'),
  };
}

export function validateProjectTaskInput(value: unknown): ProjectTaskInput {
  return validateScheduleInput(value, 'de la tâche');
}

export function validateProjectMilestoneInput(value: unknown): ProjectMilestoneInput {
  return validateScheduleInput(value, 'de l’étape');
}

export function validateProjectCostInput(value: unknown): ProjectCostInput {
  if (!isRecord(value)) throw new ProjectRequestError('Données de coût projet invalides.');
  const category = value.category;
  if (category !== 'MATERIAL' && category !== 'LABOR' && category !== 'OVERHEAD' && category !== 'OTHER') {
    throw new ProjectRequestError('La catégorie du coût est invalide.');
  }

  const amount = optionalAmount(value.amount, 'Le coût');
  if (amount === null || amount === 0) throw new ProjectRequestError('Le coût doit être supérieur à zéro.');
  return {
    category,
    description: requiredText(value.description, 'La description du coût', 300),
    amount,
    occurredAt: requiredDate(value.occurredAt, 'La date du coût'),
    sourceReference: optionalText(value.sourceReference, 'La référence source', 160),
  };
}

export function validateProjectStatus(value: unknown): ProjectStatus {
  if (value !== 'PLANNED' && value !== 'ACTIVE' && value !== 'ON_HOLD'
    && value !== 'COMPLETED' && value !== 'CANCELLED') {
    throw new ProjectRequestError('Le statut du projet est invalide.');
  }
  return value;
}

export function validateProjectTaskStatus(value: unknown): ProjectTaskStatus {
  if (value !== 'PLANNED' && value !== 'IN_PROGRESS' && value !== 'COMPLETED' && value !== 'CANCELLED') {
    throw new ProjectRequestError('Le statut de la tâche est invalide.');
  }
  return value;
}
