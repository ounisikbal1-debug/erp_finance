export type TenderStatus = 'TRACKING' | 'SUBMITTED' | 'WON' | 'LOST' | 'WITHDRAWN';
export type TenderDocumentStatus = 'MISSING' | 'READY' | 'SUBMITTED';
export type TenderCautionKind = 'PROVISIONAL' | 'DEFINITIVE';
export type TenderCautionStatus = 'PLANNED' | 'ISSUED' | 'RELEASED';

export class TenderRequestError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'TenderRequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, label: string, maxLength: number, optional = false): string | null {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new TenderRequestError(`${label} est invalide.`);
  }
  return value.trim();
}

function date(value: unknown, label: string, optional = false): Date | null {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TenderRequestError(`${label} doit être au format AAAA-MM-JJ.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TenderRequestError(`${label} est invalide.`);
  }
  return parsed;
}

export function validateTenderInput(value: unknown) {
  if (!isRecord(value)) throw new TenderRequestError('Données d’appel d’offres invalides.');
  return {
    tenderReference: text(value.tenderReference, 'La référence', 100)!,
    title: text(value.title, 'Le titre', 200)!,
    contractingAuthority: text(value.contractingAuthority, 'Le donneur d’ordre', 200)!,
    portalReference: text(value.portalReference, 'La référence portail', 200, true),
    submissionDeadline: date(value.submissionDeadline, 'La date limite', true),
  };
}

export function validateTenderStatus(value: unknown): TenderStatus {
  if (value !== 'TRACKING' && value !== 'SUBMITTED' && value !== 'WON'
    && value !== 'LOST' && value !== 'WITHDRAWN') {
    throw new TenderRequestError('Le statut de l’appel d’offres est invalide.');
  }
  return value;
}

export function validateTenderDocumentInput(value: unknown) {
  if (!isRecord(value)) throw new TenderRequestError('Données de pièce justificative invalides.');
  const isRequired = value.isRequired ?? true;
  if (typeof isRequired !== 'boolean') {
    throw new TenderRequestError('Le caractère obligatoire de la pièce doit être booléen.');
  }
  const status = value.status ?? 'MISSING';
  if (status !== 'MISSING' && status !== 'READY' && status !== 'SUBMITTED') {
    throw new TenderRequestError('Le statut de la pièce est invalide.');
  }
  return {
    title: text(value.title, 'Le nom de la pièce', 160)!,
    isRequired,
    status,
    reference: text(value.reference, 'La référence de la pièce', 200, true),
    validUntil: date(value.validUntil, 'La date de validité', true),
  };
}

export function validateTenderDocumentUpdate(value: unknown) {
  if (!isRecord(value)) throw new TenderRequestError('Mise à jour de pièce justificative invalide.');
  const status = value.status;
  if (status !== 'MISSING' && status !== 'READY' && status !== 'SUBMITTED') {
    throw new TenderRequestError('Le statut de la pièce est invalide.');
  }
  return {
    status,
    reference: value.reference === undefined ? undefined : text(value.reference, 'La référence de la pièce', 200, true),
    validUntil: value.validUntil === undefined ? undefined : date(value.validUntil, 'La date de validité', true),
  };
}

export function validateTenderCautionInput(value: unknown) {
  if (!isRecord(value)) throw new TenderRequestError('Données de caution invalides.');
  const kind = value.kind;
  if (kind !== 'PROVISIONAL' && kind !== 'DEFINITIVE') throw new TenderRequestError('Le type de caution est invalide.');
  const status = value.status ?? 'PLANNED';
  if (status !== 'PLANNED' && status !== 'ISSUED' && status !== 'RELEASED') {
    throw new TenderRequestError('Le statut de la caution est invalide.');
  }
  if (typeof value.amount !== 'number' || !Number.isFinite(value.amount) || value.amount <= 0) {
    throw new TenderRequestError('Le montant de caution doit être supérieur à zéro.');
  }
  if (typeof value.currencyCode !== 'string') throw new TenderRequestError('La devise doit être un code de trois lettres.');
  const currencyCode = value.currencyCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new TenderRequestError('La devise doit être un code de trois lettres.');
  return {
    kind,
    amount: value.amount,
    currencyCode,
    status,
    reference: text(value.reference, 'La référence de caution', 200, true),
    issuedAt: date(value.issuedAt, 'La date d’émission', true),
    releasedAt: date(value.releasedAt, 'La date de mainlevée', true),
  };
}

export function validateTenderCautionUpdate(value: unknown) {
  if (!isRecord(value)) throw new TenderRequestError('Mise à jour de caution invalide.');
  const status = value.status;
  if (status !== 'PLANNED' && status !== 'ISSUED' && status !== 'RELEASED') {
    throw new TenderRequestError('Le statut de la caution est invalide.');
  }
  return {
    status,
    issuedAt: value.issuedAt === undefined ? undefined : date(value.issuedAt, 'La date d’émission', true),
    releasedAt: value.releasedAt === undefined ? undefined : date(value.releasedAt, 'La date de mainlevée', true),
    reference: value.reference === undefined ? undefined : text(value.reference, 'La référence de caution', 200, true),
  };
}
