import { HrRequestError } from './errors';

export type EmployeeDocumentCategory = 'CONTRACT' | 'CERTIFICATE' | 'OTHER';

export interface EmployeeDocumentInput {
  employeeId: string;
  category: EmployeeDocumentCategory;
  title: string;
  validFrom: Date | null;
  validUntil: Date | null;
}

export interface EmployeeDocumentUpdateInput {
  category: EmployeeDocumentCategory;
  title: string;
  validFrom: Date | null;
  validUntil: Date | null;
  reason: string;
}

function requiredText(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maximumLength) {
    throw new HrRequestError(`${label} est obligatoire et limité à ${maximumLength} caractères.`, 400);
  }
  return value.trim();
}

function looksLikeFileSystemPath(value: string): boolean {
  return /(?:^|[\s])(?:[A-Za-z]:[\\/]|\\\\|\/(?:[^/\s]+[\\/]|[^/\s]+$)|\.{1,2}[\\/])/.test(value);
}

function optionalDate(value: unknown, label: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HrRequestError(`${label} doit respecter le format AAAA-MM-JJ.`, 400);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HrRequestError(`${label} est invalide.`, 400);
  }
  return date;
}

export function validateEmployeeDocumentInput(value: unknown): EmployeeDocumentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HrRequestError('Métadonnées de document invalides.', 400);
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((field) => /file|content|path|attachment|binary|documenturl/i.test(field))) {
    throw new HrRequestError('SAFE conserve uniquement les métadonnées et ne stocke pas de fichiers.', 400);
  }
  const employeeId = requiredText(input.employeeId, 'Le salarié', 100);
  if (!['CONTRACT', 'CERTIFICATE', 'OTHER'].includes(String(input.category))) {
    throw new HrRequestError('La catégorie de document est invalide.', 400);
  }
  const title = requiredText(input.title, 'Le titre du document', 120);
  if (looksLikeFileSystemPath(title)) {
    throw new HrRequestError('Le titre ne peut pas contenir un chemin de fichier.', 400);
  }
  const validFrom = optionalDate(input.validFrom, 'La date de début');
  const validUntil = optionalDate(input.validUntil, 'La date de fin');
  if (validFrom && validUntil && validUntil < validFrom) {
    throw new HrRequestError('La date de fin doit être égale ou postérieure à la date de début.', 400);
  }
  return {
    employeeId,
    category: input.category as EmployeeDocumentCategory,
    title,
    validFrom,
    validUntil,
  };
}

export function validateEmployeeDocumentUpdate(value: unknown): EmployeeDocumentUpdateInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HrRequestError('Modification de métadonnées invalide.', 400);
  }
  const input = value as Record<string, unknown>;
  const allowedFields = new Set(['category', 'title', 'validFrom', 'validUntil', 'reason']);
  if (Object.keys(input).some((field) => !allowedFields.has(field))) {
    throw new HrRequestError('La correction accepte uniquement la catégorie, le titre, les dates de validité et un motif.', 400);
  }
  if (Object.keys(input).some((field) => /file|content|path|attachment|binary|documenturl/i.test(field))) {
    throw new HrRequestError('SAFE conserve uniquement les métadonnées et ne stocke pas de fichiers.', 400);
  }
  if (!['CONTRACT', 'CERTIFICATE', 'OTHER'].includes(String(input.category))) {
    throw new HrRequestError('La catégorie de document est invalide.', 400);
  }
  const title = requiredText(input.title, 'Le titre du document', 120);
  if (looksLikeFileSystemPath(title)) {
    throw new HrRequestError('Le titre ne peut pas contenir un chemin de fichier.', 400);
  }
  const validFrom = optionalDate(input.validFrom, 'La date de début');
  const validUntil = optionalDate(input.validUntil, 'La date de fin');
  if (validFrom && validUntil && validUntil < validFrom) {
    throw new HrRequestError('La date de fin doit être égale ou postérieure à la date de début.', 400);
  }
  return {
    category: input.category as EmployeeDocumentCategory,
    title,
    validFrom,
    validUntil,
    reason: validateEmployeeDocumentArchiveNote(input.reason),
  };
}

export function validateEmployeeDocumentArchiveNote(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 5 || value.trim().length > 500) {
    throw new HrRequestError('Le motif d’archivage doit contenir entre 5 et 500 caractères.', 400);
  }
  return value.trim();
}
