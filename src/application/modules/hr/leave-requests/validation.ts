import { HrRequestError } from '../errors';

export const HR_LEAVE_TYPES = ['ANNUAL', 'SICK', 'UNPAID', 'OTHER'] as const;
export type HrLeaveType = (typeof HR_LEAVE_TYPES)[number];
export type HrLeaveDecision = 'APPROVED' | 'REJECTED';

export interface HrLeaveRequestInput {
  employeeId: string;
  leaveType: HrLeaveType;
  startAt: Date;
  endAt: Date;
  reason: string;
}

export interface HrLeaveEntitlementInput {
  employeeId: string;
  year: number;
  entitlementDays: number;
  policySource: string;
  effectiveFrom: Date;
  reason: string;
}

function parseDate(value: unknown, label: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HrRequestError(`${label} doit être une date au format AAAA-MM-JJ.`, 400);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new HrRequestError(`${label} n’est pas une date valide.`, 400);
  }
  return date;
}

export function validateHrLeaveRequest(value: unknown): HrLeaveRequestInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HrRequestError('Données de demande de congé invalides.', 400);
  }
  const input = value as Record<string, unknown>;
  if (typeof input.employeeId !== 'string' || !input.employeeId.trim() || input.employeeId.length > 100) {
    throw new HrRequestError('Un salarié valide est obligatoire.', 400);
  }
  if (typeof input.leaveType !== 'string' || !HR_LEAVE_TYPES.includes(input.leaveType as HrLeaveType)) {
    throw new HrRequestError('Le type de congé est invalide.', 400);
  }
  const startAt = parseDate(input.startAt, 'La date de début');
  const endAt = parseDate(input.endAt, 'La date de fin');
  if (endAt < startAt) {
    throw new HrRequestError('La date de fin doit être égale ou postérieure à la date de début.', 400);
  }
  if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 1000) {
    throw new HrRequestError('Le motif est obligatoire et limité à 1 000 caractères.', 400);
  }
  return {
    employeeId: input.employeeId.trim(),
    leaveType: input.leaveType as HrLeaveType,
    startAt,
    endAt,
    reason: input.reason.trim(),
  };
}

export function validateHrLeaveEntitlement(value: unknown): HrLeaveEntitlementInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HrRequestError('Données de solde de congé invalides.', 400);
  }
  const input = value as Record<string, unknown>;
  if (typeof input.employeeId !== 'string' || !input.employeeId.trim() || input.employeeId.length > 100) {
    throw new HrRequestError('Un salarié valide est obligatoire.', 400);
  }
  if (typeof input.year !== 'number' || !Number.isSafeInteger(input.year) || input.year < 1900 || input.year > 2200) {
    throw new HrRequestError('L’année du solde doit être un entier compris entre 1900 et 2200.', 400);
  }
  if (typeof input.entitlementDays !== 'number' || !Number.isSafeInteger(input.entitlementDays)
    || input.entitlementDays < 0 || input.entitlementDays > 366) {
    throw new HrRequestError('Le droit annuel doit être un nombre entier de jours calendaires entre 0 et 366.', 400);
  }
  if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 1000) {
    throw new HrRequestError('Le motif de paramétrage est obligatoire et limité à 1 000 caractères.', 400);
  }
  if (typeof input.policySource !== 'string' || !input.policySource.trim() || input.policySource.trim().length > 300) {
    throw new HrRequestError('La source ou référence de la politique est obligatoire et limitée à 300 caractères.', 400);
  }
  const effectiveFrom = parseDate(input.effectiveFrom, 'La date d’effet');
  if (effectiveFrom.getUTCFullYear() !== input.year) {
    throw new HrRequestError('La date d’effet doit appartenir à l’année configurée.', 400);
  }
  return {
    employeeId: input.employeeId.trim(),
    year: input.year,
    entitlementDays: input.entitlementDays,
    policySource: input.policySource.trim(),
    effectiveFrom,
    reason: input.reason.trim(),
  };
}

export function validateHrLeaveYear(value: unknown): number {
  const year = typeof value === 'string' && /^\d{4}$/.test(value) ? Number(value) : value;
  if (typeof year !== 'number' || !Number.isSafeInteger(year) || year < 1900 || year > 2200) {
    throw new HrRequestError('L’année doit être un entier compris entre 1900 et 2200.', 400);
  }
  return year;
}

export function calendarDaysInYearRange(startAt: Date, endAt: Date, year: number): number {
  const firstDay = new Date(Date.UTC(year, 0, 1));
  const lastDay = new Date(Date.UTC(year + 1, 0, 1) - 1);
  const overlapStart = startAt > firstDay ? startAt : firstDay;
  const overlapEnd = endAt < lastDay ? endAt : lastDay;
  if (overlapEnd < overlapStart) return 0;
  return Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86_400_000) + 1;
}

export function validateHrLeaveDecision(decision: unknown, note: unknown): {
  decision: HrLeaveDecision;
  note: string | null;
} {
  if (decision !== 'APPROVED' && decision !== 'REJECTED') {
    throw new HrRequestError('La décision de revue est invalide.', 400);
  }
  if (note !== undefined && note !== null && (typeof note !== 'string' || note.trim().length > 1000)) {
    throw new HrRequestError('La note de revue est limitée à 1 000 caractères.', 400);
  }
  const normalizedNote = typeof note === 'string' ? note.trim() : '';
  if (decision === 'REJECTED' && !normalizedNote) {
    throw new HrRequestError('Un motif est obligatoire pour rejeter une demande.', 400);
  }
  return { decision, note: normalizedNote || null };
}
