import { validateTaxPeriod } from './declaration';

export type TaxDeclarationWorkpaperSection = 'G50' | 'RS' | 'IS';

export interface TaxDeclarationWorkpaperInput {
  period: string;
  section: TaxDeclarationWorkpaperSection;
  sourceReference: string;
  reviewNote: string;
  confirmed: true;
  amount?: number;
  taxableBase?: number;
}

export class TaxDeclarationWorkpaperError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'TaxDeclarationWorkpaperError';
  }
}

function getRequiredText(input: Record<string, unknown>, field: string, maxLength: number): string {
  const value = input[field];
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new TaxDeclarationWorkpaperError(`${field} doit être un texte non vide de ${maxLength} caractères maximum.`, 400);
  }
  return value.trim();
}

function getMillimeAmount(value: unknown, field: string): number {
  if (typeof value !== 'number') {
    throw new TaxDeclarationWorkpaperError(`${field} doit être un montant numérique exprimé au millime.`, 400);
  }
  const millimes = Math.round(value * 1000);
  if (!Number.isFinite(value)
    || value < 0
    || !Number.isSafeInteger(millimes)
    || Math.abs(value * 1000 - millimes) > 1e-7) {
    throw new TaxDeclarationWorkpaperError(`${field} doit être positif ou nul, fini et exprimé au millime.`, 400);
  }
  return millimes / 1000;
}

export function parseTaxDeclarationWorkpaperInput(value: unknown): TaxDeclarationWorkpaperInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TaxDeclarationWorkpaperError('Les paramètres du dossier fiscal doivent former un objet.', 400);
  }
  const input = value as Record<string, unknown>;
  const allowedFields = ['period', 'section', 'sourceReference', 'reviewNote', 'confirmed', 'amount', 'taxableBase'];
  const unknownFields = Object.keys(input).filter((field) => !allowedFields.includes(field));
  if (unknownFields.length > 0) {
    throw new TaxDeclarationWorkpaperError(`Paramètres inconnus : ${unknownFields.join(', ')}.`, 400);
  }
  const period = validateTaxPeriod(input.period);
  if (input.section !== 'G50' && input.section !== 'RS' && input.section !== 'IS') {
    throw new TaxDeclarationWorkpaperError('La rubrique doit être G50, RS ou IS.', 400);
  }
  if (input.confirmed !== true) {
    throw new TaxDeclarationWorkpaperError('Une confirmation explicite de la revue du justificatif est requise.', 400);
  }
  const sourceReference = getRequiredText(input, 'sourceReference', 200);
  const reviewNote = getRequiredText(input, 'reviewNote', 500);
  if (reviewNote.length < 10) {
    throw new TaxDeclarationWorkpaperError('La note de revue doit comporter au moins 10 caractères.', 400);
  }

  if (input.section === 'G50' || input.section === 'RS') {
    if (input.amount !== undefined || input.taxableBase !== undefined) {
      throw new TaxDeclarationWorkpaperError(
        input.section === 'G50'
          ? 'Le composant TVA G50 est calculé depuis les pièces rapprochées et ne peut pas être saisi.'
          : 'Le total RS est calculé depuis les certificats émis et ne peut pas être saisi.',
        400,
      );
    }
    return { period, section: input.section, sourceReference, reviewNote, confirmed: true };
  }

  if (input.amount === undefined || input.taxableBase === undefined) {
    throw new TaxDeclarationWorkpaperError('Le montant IS et la base issue du dossier fiscal validé sont obligatoires.', 400);
  }
  return {
    period,
    section: 'IS',
    sourceReference,
    reviewNote,
    confirmed: true,
    amount: getMillimeAmount(input.amount, 'Montant IS'),
    taxableBase: getMillimeAmount(input.taxableBase, 'Base imposable IS'),
  };
}
