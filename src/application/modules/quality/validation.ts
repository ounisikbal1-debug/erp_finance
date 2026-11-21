import { QualityRequestError } from './errors';

export const QUALITY_SOURCES = ['INTERNAL_AUDIT', 'CUSTOMER', 'SUPPLIER', 'PRODUCTION', 'EQUIPMENT', 'OTHER'] as const;
export const QUALITY_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const QUALITY_STATUSES = ['OPEN', 'INVESTIGATING', 'ACTION_REQUIRED', 'VERIFYING', 'CLOSED', 'CANCELLED'] as const;
export const ACTION_TYPES = ['CORRECTIVE', 'PREVENTIVE', 'CONTAINMENT'] as const;
export const ACTION_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

export type QualitySource = (typeof QUALITY_SOURCES)[number];
export type QualitySeverity = (typeof QUALITY_SEVERITIES)[number];
export type QualityStatus = (typeof QUALITY_STATUSES)[number];
export type QualityActionType = (typeof ACTION_TYPES)[number];
export type QualityActionStatus = (typeof ACTION_STATUSES)[number];

export function isQualityFindingOverdue(
  finding: { dueAt: Date | string | null; status: string },
  asOf = new Date(),
): boolean {
  return finding.dueAt !== null
    && ['OPEN', 'INVESTIGATING', 'ACTION_REQUIRED', 'VERIFYING'].includes(finding.status)
    && isPastDeadline(finding.dueAt, asOf);
}

export function isQualityActionOverdue(
  action: { dueAt: Date | string; status: string },
  asOf = new Date(),
): boolean {
  return ['OPEN', 'IN_PROGRESS'].includes(action.status)
    && isPastDeadline(action.dueAt, asOf);
}

function isPastDeadline(deadline: Date | string, asOf: Date): boolean {
  const time = deadline instanceof Date ? deadline.getTime() : Date.parse(deadline);
  return !Number.isNaN(time) && time < asOf.getTime();
}

export function isQualityStatus(value: string): value is QualityStatus {
  return new Set<string>(QUALITY_STATUSES).has(value);
}

export function isQualityActionStatus(value: string): value is QualityActionStatus {
  return new Set<string>(ACTION_STATUSES).has(value);
}

export const FINDING_TRANSITIONS: Record<QualityStatus, readonly QualityStatus[]> = {
  OPEN: ['INVESTIGATING', 'CANCELLED'],
  INVESTIGATING: ['ACTION_REQUIRED', 'CANCELLED'],
  ACTION_REQUIRED: ['VERIFYING', 'CANCELLED'],
  VERIFYING: ['ACTION_REQUIRED', 'CLOSED', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
};

export const ACTION_TRANSITIONS: Record<QualityActionStatus, readonly QualityActionStatus[]> = {
  OPEN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export interface QualityClosureEvidence {
  rootCause?: string | null;
  closureNotes?: string | null;
  actions: Array<{ status: string; verificationNotes?: string | null }>;
}

export function hasVerifiedQualityActions(actions: QualityClosureEvidence['actions']): boolean {
  return actions.length > 0
    && actions.every((action) => action.status === 'COMPLETED' && Boolean(action.verificationNotes?.trim()));
}

export function assertQualityFindingTransition(
  currentStatus: QualityStatus,
  nextStatus: QualityStatus,
  evidence: QualityClosureEvidence,
): void {
  if (!FINDING_TRANSITIONS[currentStatus].includes(nextStatus)) {
    throw new QualityRequestError('Transition de statut de non-conformité non autorisée.', 409);
  }
  if (nextStatus === 'VERIFYING' && !hasVerifiedQualityActions(evidence.actions)) {
    throw new QualityRequestError('La vérification ne peut commencer avant la réalisation et la preuve de toutes les actions CAPA.', 409);
  }
  if (nextStatus === 'CLOSED') {
    if (!evidence.rootCause?.trim() || !evidence.closureNotes?.trim() || !hasVerifiedQualityActions(evidence.actions)) {
      throw new QualityRequestError(
        'Clôture impossible: documentez la cause racine et la conclusion, et vérifiez toutes les actions CAPA.',
        409,
      );
    }
  }
}

export function assertQualityActionTransition(
  currentStatus: QualityActionStatus,
  nextStatus: QualityActionStatus,
  verificationNotes?: string | null,
): void {
  if (!ACTION_TRANSITIONS[currentStatus].includes(nextStatus)) {
    throw new QualityRequestError('Transition de statut de l’action CAPA non autorisée.', 409);
  }
  if (nextStatus === 'COMPLETED' && !verificationNotes?.trim()) {
    throw new QualityRequestError('Renseignez les preuves de vérification avant de terminer l’action.', 400);
  }
}

export interface QualityIssueInput {
  equipmentId?: string;
  title: string;
  description: string;
  source: QualitySource;
  severity: QualitySeverity;
  detectedAt: Date;
  dueAt?: Date;
  owner: string;
  rootCause?: string;
  containmentAction?: string;
}

export interface QualityIssueUpdate {
  title?: string;
  description?: string;
  source?: QualitySource;
  severity?: QualitySeverity;
  status?: QualityStatus;
  equipmentId?: string | null;
  dueAt?: Date | null;
  owner?: string;
  rootCause?: string | null;
  containmentAction?: string | null;
  closureNotes?: string | null;
}

export interface QualityActionInput {
  type: QualityActionType;
  description: string;
  owner: string;
  dueAt: Date;
}

export interface QualityActionUpdate {
  description?: string;
  owner?: string;
  dueAt?: Date;
  status?: QualityActionStatus;
  verificationNotes?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new QualityRequestError(`${field} est obligatoire (maximum ${maxLength} caractères).`, 400);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new QualityRequestError(`${field} ne peut pas dépasser ${maxLength} caractères.`, 400);
  }
  return value.trim() || undefined;
}

function enumValue<const T extends readonly string[]>(value: unknown, values: T, field: string): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new QualityRequestError(`${field} invalide.`, 400);
  }
  return value as T[number];
}

function parsedDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !value.trim()) {
    throw new QualityRequestError(`${field} est obligatoire.`, 400);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  if (!match) throw new QualityRequestError(`${field} doit être une date ISO en UTC.`, 400);
  const date = new Date(value);
  const expected = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${(match[7] ?? '').padEnd(3, '0')}Z`;
  if (Number.isNaN(date.getTime()) || date.toISOString() !== expected) {
    throw new QualityRequestError(`${field} est invalide.`, 400);
  }
  return date;
}

function optionalDate(value: unknown, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return parsedDate(value, field);
}

export function validateQualityIssueInput(input: unknown): QualityIssueInput {
  if (!isRecord(input)) throw new QualityRequestError('Non-conformité invalide.', 400);
  const detectedAt = parsedDate(input.detectedAt, 'La date de détection');
  const dueAt = optionalDate(input.dueAt, 'L’échéance');
  const equipmentId = optionalText(input.equipmentId, 'L’équipement associé', 100);
  const source = enumValue(input.source, QUALITY_SOURCES, 'La source');
  if (source === 'EQUIPMENT' && !equipmentId) {
    throw new QualityRequestError('Sélectionnez l’équipement concerné par cette non-conformité.', 400);
  }
  if (dueAt && dueAt < detectedAt) {
    throw new QualityRequestError('L’échéance ne peut pas précéder la date de détection.', 400);
  }
  const rootCause = optionalText(input.rootCause, 'La cause racine', 4000);
  const containmentAction = optionalText(input.containmentAction, 'L’action de sécurisation', 4000);
  return {
    title: requiredText(input.title, 'Le titre', 160),
    description: requiredText(input.description, 'La description', 4000),
    source,
    severity: enumValue(input.severity, QUALITY_SEVERITIES, 'La gravité'),
    detectedAt,
    ...(dueAt ? { dueAt } : {}),
    owner: requiredText(input.owner, 'Le responsable', 160),
    ...(equipmentId ? { equipmentId } : {}),
    ...(rootCause ? { rootCause } : {}),
    ...(containmentAction ? { containmentAction } : {}),
  };
}

export function validateQualityIssueUpdate(input: unknown): QualityIssueUpdate {
  if (!isRecord(input) || Object.keys(input).length === 0) {
    throw new QualityRequestError('Aucune modification de non-conformité fournie.', 400);
  }
  const update: QualityIssueUpdate = {};
  if ('title' in input) update.title = requiredText(input.title, 'Le titre', 160);
  if ('description' in input) update.description = requiredText(input.description, 'La description', 4000);
  if ('source' in input) update.source = enumValue(input.source, QUALITY_SOURCES, 'La source');
  if ('severity' in input) update.severity = enumValue(input.severity, QUALITY_SEVERITIES, 'La gravité');
  if ('status' in input) update.status = enumValue(input.status, QUALITY_STATUSES, 'Le statut');
  if ('equipmentId' in input) {
    update.equipmentId = input.equipmentId === null
      ? null
      : requiredText(input.equipmentId, 'L’équipement associé', 100);
  }
  if ('dueAt' in input) update.dueAt = optionalDate(input.dueAt, 'L’échéance');
  if ('owner' in input) update.owner = requiredText(input.owner, 'Le responsable', 160);
  if ('rootCause' in input) update.rootCause = input.rootCause === null ? null : optionalText(input.rootCause, 'La cause racine', 4000) ?? null;
  if ('containmentAction' in input) {
    update.containmentAction = input.containmentAction === null
      ? null
      : optionalText(input.containmentAction, 'L’action de sécurisation', 4000) ?? null;
  }
  if ('closureNotes' in input) update.closureNotes = input.closureNotes === null
    ? null
    : optionalText(input.closureNotes, 'Les notes de clôture', 4000) ?? null;
  if (Object.keys(update).length === 0) throw new QualityRequestError('Aucun champ modifiable fourni.', 400);
  return update;
}

export function validateQualityActionInput(input: unknown): QualityActionInput {
  if (!isRecord(input)) throw new QualityRequestError('Action CAPA invalide.', 400);
  return {
    type: enumValue(input.type, ACTION_TYPES, 'Le type d’action'),
    description: requiredText(input.description, 'La description de l’action', 2000),
    owner: requiredText(input.owner, 'Le responsable de l’action', 160),
    dueAt: parsedDate(input.dueAt, 'L’échéance de l’action'),
  };
}

export function validateQualityActionUpdate(input: unknown): QualityActionUpdate {
  if (!isRecord(input) || Object.keys(input).length === 0) {
    throw new QualityRequestError('Aucune modification d’action fournie.', 400);
  }
  const update: QualityActionUpdate = {};
  if ('description' in input) update.description = requiredText(input.description, 'La description de l’action', 2000);
  if ('owner' in input) update.owner = requiredText(input.owner, 'Le responsable de l’action', 160);
  if ('dueAt' in input) update.dueAt = parsedDate(input.dueAt, 'L’échéance de l’action');
  if ('status' in input) update.status = enumValue(input.status, ACTION_STATUSES, 'Le statut de l’action');
  if ('verificationNotes' in input) update.verificationNotes = input.verificationNotes === null
    ? null
    : optionalText(input.verificationNotes, 'Les notes de vérification', 4000) ?? null;
  if (Object.keys(update).length === 0) throw new QualityRequestError('Aucun champ modifiable fourni.', 400);
  return update;
}
