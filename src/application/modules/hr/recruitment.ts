import { HrRequestError } from './errors';

export type CandidateStatus = 'RECEIVED' | 'IN_REVIEW' | 'INTERVIEW' | 'CLOSED';

export interface RecruitmentPositionInput {
  title: string;
}

export interface CandidateApplicationInput {
  positionId: string;
  firstName: string;
  lastName: string;
  email: string;
}

function requiredText(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maximumLength) {
    throw new HrRequestError(`${label} est obligatoire et limité à ${maximumLength} caractères.`, 400);
  }
  return value.trim();
}

export function validateRecruitmentPositionInput(value: unknown): RecruitmentPositionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HrRequestError('Données de poste invalides.', 400);
  }
  return { title: requiredText((value as Record<string, unknown>).title, 'Le titre du poste', 120) };
}

export function validateCandidateApplicationInput(value: unknown): CandidateApplicationInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HrRequestError('Données de candidature invalides.', 400);
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((field) => (
    /file|cv|resume|note|coverletter|attachment|storagepath|comment|description/i.test(field)
  ))) {
    throw new HrRequestError('SAFE ne stocke ni CV, ni pièce jointe, ni note libre de candidature.', 400);
  }
  const positionId = requiredText(input.positionId, 'Le poste', 100);
  const firstName = requiredText(input.firstName, 'Le prénom du candidat', 80);
  const lastName = requiredText(input.lastName, 'Le nom du candidat', 80);
  const email = requiredText(input.email, 'L’adresse e-mail du candidat', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HrRequestError('L’adresse e-mail du candidat est invalide.', 400);
  }
  return { positionId, firstName, lastName, email };
}

export function validateCandidateStatus(value: unknown): CandidateStatus {
  if (value !== 'RECEIVED' && value !== 'IN_REVIEW' && value !== 'INTERVIEW' && value !== 'CLOSED') {
    throw new HrRequestError('Le statut de candidature est invalide.', 400);
  }
  return value;
}
