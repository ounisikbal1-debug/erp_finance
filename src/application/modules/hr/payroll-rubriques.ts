import { HrRequestError } from './errors';
import { MAX_PAYROLL_AMOUNT } from './payroll-amount';

const CATEGORIES = ['PRIME', 'PRIME_NON_COTISABLE', 'AVANTAGE_FISCAL', 'RETENUE'] as const;

export interface PayrollRubriqueInput {
  code: string;
  label: string;
  category: (typeof CATEGORIES)[number];
  defaultAmount: number;
}

export function validatePayrollRubriqueInput(data: unknown): PayrollRubriqueInput {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HrRequestError('Données de rubrique de paie invalides.', 400);
  }
  const input = data as Record<string, unknown>;
  if (
    typeof input.code !== 'string'
    || !/^[A-Za-z0-9_]{2,40}$/.test(input.code.trim())
  ) {
    throw new HrRequestError('Le code de rubrique doit contenir 2 à 40 caractères alphanumériques ou soulignés.', 400);
  }
  if (
    typeof input.label !== 'string'
    || !input.label.trim()
    || input.label.trim().length > 120
  ) {
    throw new HrRequestError('Le libellé de rubrique est obligatoire et limité à 120 caractères.', 400);
  }
  if (!(CATEGORIES as readonly unknown[]).includes(input.category)) {
    throw new HrRequestError('La catégorie de rubrique est invalide.', 400);
  }
  if (
    typeof input.defaultAmount !== 'number'
    || !Number.isFinite(input.defaultAmount)
    || input.defaultAmount < 0
    || input.defaultAmount > MAX_PAYROLL_AMOUNT
    || !Number.isSafeInteger(Math.round(input.defaultAmount * 1000))
  ) {
    throw new HrRequestError('Le montant par défaut doit être positif ou nul et exprimable au millime.', 400);
  }

  return {
    code: input.code.trim().toUpperCase(),
    label: input.label.trim(),
    category: input.category as PayrollRubriqueInput['category'],
    defaultAmount: input.defaultAmount,
  };
}

export function validatePayrollRubriqueList(data: unknown): PayrollRubriqueInput[] {
  if (!Array.isArray(data) || data.length === 0) {
    throw new HrRequestError('Fournissez au moins une rubrique; les rubriques existantes ne sont pas supprimées.', 400);
  }
  const rubriques = data.map((item) => validatePayrollRubriqueInput(item));
  if (new Set(rubriques.map((item) => item.code)).size !== rubriques.length) {
    throw new HrRequestError('Les codes de rubrique doivent être uniques.', 400);
  }
  return rubriques;
}

export function assertCanManagePayrollRubriques(role: unknown): void {
  if (role !== 'ADMIN') {
    throw new HrRequestError('Seul un administrateur peut modifier les rubriques réglementaires de paie.', 403);
  }
}
