const CONFIG_TYPES = ['PROFILE', 'TAX', 'PAYROLL', 'ACCOUNTING'] as const;
const STATUSES = ['DRAFT', 'IN_REVIEW', 'REVIEWED', 'APPROVED', 'REJECTED'] as const;

export type RegulatoryConfigType = (typeof CONFIG_TYPES)[number];
export type RegulatoryRevisionStatus = (typeof STATUSES)[number];

export class RegulatoryRevisionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegulatoryRevisionValidationError';
  }
}

export interface RegulatoryRevisionInput {
  configType: RegulatoryConfigType;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  source: string;
  supersedesRevisionId?: string;
  closureNote?: string;
  retroactiveConfirmed: boolean;
}

export interface RegulatoryRevisionPeriod {
  id?: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  status: string;
}

export function getSupersededRevisionEndDate(
  existing: RegulatoryRevisionPeriod,
  replacementStart: Date,
): Date {
  if (existing.status === 'REJECTED') {
    throw new RegulatoryRevisionValidationError('Une version rejetée ne peut pas être remplacée.');
  }
  if (replacementStart.getTime() <= existing.effectiveFrom.getTime()) {
    throw new RegulatoryRevisionValidationError('La nouvelle date d’effet doit suivre le début de la version remplacée.');
  }
  if (existing.effectiveTo && replacementStart.getTime() > existing.effectiveTo.getTime()) {
    throw new RegulatoryRevisionValidationError('La version sélectionnée ne couvre pas la date d’effet de la nouvelle règle.');
  }
  return new Date(replacementStart.getTime() - 24 * 60 * 60 * 1000);
}

export function assertRevisionPeriodDoesNotOverlap(
  candidate: Pick<RegulatoryRevisionInput, 'effectiveFrom' | 'effectiveTo'>,
  existingRevisions: readonly RegulatoryRevisionPeriod[],
): void {
  const candidateEnd = candidate.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY;
  const overlaps = existingRevisions.some((revision) => {
    if (revision.status === 'REJECTED') return false;
    const revisionEnd = revision.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY;
    return candidate.effectiveFrom.getTime() <= revisionEnd
      && revision.effectiveFrom.getTime() <= candidateEnd;
  });
  if (overlaps) {
    throw new RegulatoryRevisionValidationError('La période d’effet chevauche une autre version non rejetée pour ce pays et ce domaine.');
  }
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateRegulatoryRevisionInput(value: unknown): RegulatoryRevisionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RegulatoryRevisionValidationError('Les métadonnées de version réglementaire doivent être un objet.');
  }
  const input = value as Record<string, unknown>;
  const allowedFields = [
    'configType',
    'effectiveFrom',
    'effectiveTo',
    'source',
    'supersedesRevisionId',
    'closureNote',
    'retroactiveConfirmed',
  ];
  const unknownFields = Object.keys(input).filter((field) => !allowedFields.includes(field));
  if (unknownFields.length > 0) {
    throw new RegulatoryRevisionValidationError(`Champs de version inconnus : ${unknownFields.join(', ')}.`);
  }
  if (typeof input.configType !== 'string' || !(CONFIG_TYPES as readonly string[]).includes(input.configType)) {
    throw new RegulatoryRevisionValidationError('Le type de configuration doit être PROFILE, TAX, PAYROLL ou ACCOUNTING.');
  }
  if (typeof input.effectiveFrom !== 'string' || !isCalendarDate(input.effectiveFrom)) {
    throw new RegulatoryRevisionValidationError('La date d’effet initiale doit être une date réelle au format AAAA-MM-JJ.');
  }
  let effectiveTo: Date | null = null;
  if (input.effectiveTo !== undefined && input.effectiveTo !== null && input.effectiveTo !== '') {
    if (typeof input.effectiveTo !== 'string' || !isCalendarDate(input.effectiveTo)) {
      throw new RegulatoryRevisionValidationError('La date de fin d’effet doit être une date réelle au format AAAA-MM-JJ.');
    }
    effectiveTo = new Date(`${input.effectiveTo}T00:00:00.000Z`);
    if (effectiveTo.getTime() < new Date(`${input.effectiveFrom}T00:00:00.000Z`).getTime()) {
      throw new RegulatoryRevisionValidationError('La fin d’effet ne peut pas précéder le début.');
    }
  }
  if (typeof input.source !== 'string' || !input.source.trim() || input.source.trim().length > 500) {
    throw new RegulatoryRevisionValidationError('La source réglementaire est obligatoire et limitée à 500 caractères.');
  }
  let supersedesRevisionId: string | undefined;
  let closureNote: string | undefined;
  if (input.supersedesRevisionId !== undefined && input.supersedesRevisionId !== '') {
    if (typeof input.supersedesRevisionId !== 'string' || !input.supersedesRevisionId.trim()) {
      throw new RegulatoryRevisionValidationError('La version remplacée est invalide.');
    }
    if (typeof input.closureNote !== 'string' || input.closureNote.trim().length < 3 || input.closureNote.trim().length > 500) {
      throw new RegulatoryRevisionValidationError('Une justification de clôture de 3 à 500 caractères est obligatoire.');
    }
    supersedesRevisionId = input.supersedesRevisionId.trim();
    closureNote = input.closureNote.trim();
  } else if (input.closureNote !== undefined && input.closureNote !== '') {
    throw new RegulatoryRevisionValidationError('Sélectionnez la version à remplacer avant de préciser une justification de clôture.');
  }
  if (input.retroactiveConfirmed !== undefined && typeof input.retroactiveConfirmed !== 'boolean') {
    throw new RegulatoryRevisionValidationError('La confirmation de rétroactivité doit être booléenne.');
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const isRetroactive = new Date(`${input.effectiveFrom}T00:00:00.000Z`).getTime() < today.getTime();
  if (isRetroactive && input.retroactiveConfirmed !== true) {
    throw new RegulatoryRevisionValidationError('Une date d’effet passée exige une confirmation explicite de rétroactivité.');
  }
  return {
    configType: input.configType as RegulatoryConfigType,
    effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00.000Z`),
    effectiveTo,
    source: input.source.trim(),
    ...(supersedesRevisionId ? { supersedesRevisionId, closureNote } : {}),
    retroactiveConfirmed: input.retroactiveConfirmed === true,
  };
}

export function validateRevisionTransition(
  currentStatus: unknown,
  nextStatus: unknown,
  reviewer: unknown,
  reviewNote: unknown,
  createdBy?: unknown,
  previousReviewer?: unknown,
): { status: RegulatoryRevisionStatus; reviewer: string; reviewNote: string } {
  if (typeof currentStatus !== 'string' || !(STATUSES as readonly string[]).includes(currentStatus)) {
    throw new Error('Le statut actuel de la version est invalide.');
  }
  if (typeof nextStatus !== 'string' || !(STATUSES as readonly string[]).includes(nextStatus)) {
    throw new RegulatoryRevisionValidationError('Le statut demandé est invalide.');
  }
  const allowed: Record<RegulatoryRevisionStatus, readonly RegulatoryRevisionStatus[]> = {
    DRAFT: ['IN_REVIEW'],
    IN_REVIEW: ['REVIEWED', 'REJECTED'],
    REVIEWED: ['APPROVED', 'REJECTED'],
    APPROVED: [],
    REJECTED: [],
  };
  if (!allowed[currentStatus as RegulatoryRevisionStatus].includes(nextStatus as RegulatoryRevisionStatus)) {
    throw new RegulatoryRevisionValidationError(`Transition de statut interdite : ${currentStatus} vers ${nextStatus}.`);
  }
  if (typeof reviewer !== 'string' || !reviewer.trim()) {
    throw new RegulatoryRevisionValidationError('L’identité de l’administrateur effectuant la transition est obligatoire.');
  }
  if (
    (nextStatus === 'REVIEWED' || nextStatus === 'APPROVED')
    && typeof createdBy === 'string'
    && createdBy.trim().toLowerCase() === reviewer.trim().toLowerCase()
  ) {
    throw new RegulatoryRevisionValidationError('La préparation et la revue réglementaire doivent être effectuées par deux utilisateurs distincts.');
  }
  if (nextStatus === 'APPROVED' && (typeof previousReviewer !== 'string' || !previousReviewer.trim())) {
    throw new RegulatoryRevisionValidationError('Un réviseur distinct doit être enregistré avant l’approbation finale.');
  }
  if (
    nextStatus === 'APPROVED'
    && typeof previousReviewer === 'string'
    && previousReviewer.trim().toLowerCase() === reviewer.trim().toLowerCase()
  ) {
    throw new RegulatoryRevisionValidationError('La revue et l’approbation réglementaire doivent être effectuées par deux utilisateurs distincts.');
  }
  if (typeof reviewNote !== 'string' || reviewNote.trim().length < 3 || reviewNote.trim().length > 500) {
    throw new RegulatoryRevisionValidationError('Une note de suivi de 3 à 500 caractères est obligatoire.');
  }
  return {
    status: nextStatus as RegulatoryRevisionStatus,
    reviewer: reviewer.trim(),
    reviewNote: reviewNote.trim(),
  };
}
