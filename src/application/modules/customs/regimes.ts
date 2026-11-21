export type CustomsRegimeType = 'AT' | 'ACT';
export type CustomsRegimeStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';
export type CustomsStockDirection = 'INBOUND' | 'OUTBOUND';

export class CustomsRegimeError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'CustomsRegimeError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new CustomsRegimeError(`${label} est invalide.`);
  return value;
}

function requireText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new CustomsRegimeError(`${label} doit contenir entre 1 et ${maxLength} caractères.`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  return requireText(value, label, maxLength);
}

function date(value: unknown, label: string, optional = false): Date | null {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new CustomsRegimeError(`${label} doit être au format AAAA-MM-JJ.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new CustomsRegimeError(`${label} est invalide.`);
  }
  return parsed;
}

export function validateCustomsRegimeInput(value: unknown) {
  const input = requireRecord(value, 'Le régime douanier');
  if (input.regimeType !== 'AT' && input.regimeType !== 'ACT') {
    throw new CustomsRegimeError('Le type de régime doit être AT ou ACT.');
  }
  const startsAt = date(input.startsAt, 'La date de début', true);
  const endsAt = date(input.endsAt, 'La date de fin', true);
  if (startsAt && endsAt && endsAt < startsAt) {
    throw new CustomsRegimeError('La date de fin ne peut pas précéder la date de début.');
  }
  return {
    regimeType: input.regimeType,
    regimeReference: requireText(input.regimeReference, 'La référence du régime', 100),
    title: requireText(input.title, 'Le nom du régime', 200),
    description: optionalText(input.description, 'La description', 2_000),
    startsAt,
    endsAt,
    reference: optionalText(input.reference, 'La référence justificative', 300),
  };
}

export function validateCustomsRegimeStatus(value: unknown): CustomsRegimeStatus {
  if (value !== 'DRAFT' && value !== 'ACTIVE' && value !== 'CLOSED') {
    throw new CustomsRegimeError('Le statut du régime douanier est invalide.');
  }
  return value;
}

export function validateCustomsStockSheetInput(value: unknown) {
  const input = requireRecord(value, 'La fiche de stock douanière');
  const tariffCode = optionalText(input.tariffCode, 'Le code NGP', 10);
  if (tariffCode && !/^\d{10}$/.test(tariffCode)) {
    throw new CustomsRegimeError('Le code NGP doit contenir exactement 10 chiffres.');
  }
  return {
    sheetReference: requireText(input.sheetReference, 'La référence de fiche', 100),
    tariffCode,
    itemDescription: requireText(input.itemDescription, 'La désignation', 300),
    unitCode: requireText(input.unitCode, 'L’unité de mesure', 20).toUpperCase(),
  };
}

export function validateCustomsStockMovementInput(value: unknown) {
  const input = requireRecord(value, 'Le mouvement de stock douanier');
  if (input.direction !== 'INBOUND' && input.direction !== 'OUTBOUND') {
    throw new CustomsRegimeError('Le sens du mouvement doit être entrant ou sortant.');
  }
  if (typeof input.quantity !== 'number' || !Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new CustomsRegimeError('La quantité doit être supérieure à zéro.');
  }
  return {
    direction: input.direction,
    quantity: input.quantity,
    occurredAt: date(input.occurredAt, 'La date du mouvement')!,
    reference: requireText(input.reference, 'La référence du mouvement', 300),
    note: optionalText(input.note, 'La note', 1_000),
  };
}

export function validateCustomsBondInput(value: unknown) {
  const input = requireRecord(value, 'La caution douanière');
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0) {
    throw new CustomsRegimeError('Le montant de caution doit être supérieur à zéro.');
  }
  if (typeof input.currencyCode !== 'string') {
    throw new CustomsRegimeError('La devise doit être un code de trois lettres.');
  }
  const currencyCode = input.currencyCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new CustomsRegimeError('La devise doit être un code de trois lettres.');
  }
  return {
    bondReference: requireText(input.bondReference, 'La référence de caution', 100),
    amount: input.amount,
    currencyCode,
    issuedAt: date(input.issuedAt, 'La date d’émission', true),
  };
}

export function validateCustomsBondReleaseInput(value: unknown) {
  const input = requireRecord(value, 'La mainlevée de caution');
  return {
    releasedAt: date(input.releasedAt, 'La date de mainlevée')!,
    releaseReference: requireText(input.releaseReference, 'La référence de mainlevée', 300),
  };
}
