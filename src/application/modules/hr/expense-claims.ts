import { HrRequestError } from './errors';

export type ExpenseClaimCategory = 'TRAVEL' | 'MEALS' | 'TRANSPORT' | 'SUPPLIES' | 'OTHER';
export type ExpenseClaimStatus = 'TO_REVIEW' | 'APPROVED' | 'REJECTED';

export interface ExpenseClaimInput {
  employeeId: string;
  category: ExpenseClaimCategory;
  expenseDate: Date;
  amount: number;
  currency: string;
}

function requiredText(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maximumLength) {
    throw new HrRequestError(`${label} est obligatoire et limité à ${maximumLength} caractères.`, 400);
  }
  return value.trim();
}

function parseExpenseDate(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HrRequestError('La date de dépense doit respecter le format AAAA-MM-JJ.', 400);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HrRequestError('La date de dépense est invalide.', 400);
  }
  return date;
}

export function validateExpenseClaimInput(value: unknown): ExpenseClaimInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HrRequestError('Demande de remboursement invalide.', 400);
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((field) => /file|content|path|attachment|receipt|note|description/i.test(field))) {
    throw new HrRequestError('Les notes de frais ne conservent ni pièce jointe ni description libre.', 400);
  }
  const employeeId = requiredText(input.employeeId, 'Le salarié', 100);
  if (!['TRAVEL', 'MEALS', 'TRANSPORT', 'SUPPLIES', 'OTHER'].includes(String(input.category))) {
    throw new HrRequestError('La catégorie de dépense est invalide.', 400);
  }
  const expenseDate = parseExpenseDate(input.expenseDate);
  const amountText = typeof input.amount === 'number' ? input.amount.toString() : '';
  const decimals = amountText.includes('.') ? amountText.split('.')[1].length : 0;
  if (
    typeof input.amount !== 'number'
    || !Number.isFinite(input.amount)
    || input.amount < 0.001
    || input.amount > 1_000_000_000
    || decimals > 3
  ) {
    throw new HrRequestError('Le montant doit être positif, limité à 1 milliard et précis à 3 décimales au plus.', 400);
  }
  const currency = requiredText(input.currency, 'La devise', 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new HrRequestError('La devise doit être un code de trois lettres.', 400);
  }
  return {
    employeeId,
    category: input.category as ExpenseClaimCategory,
    expenseDate,
    amount: input.amount,
    currency,
  };
}

export function validateExpenseClaimDecision(value: unknown): Exclude<ExpenseClaimStatus, 'TO_REVIEW'> {
  if (value !== 'APPROVED' && value !== 'REJECTED') {
    throw new HrRequestError('La décision doit être une approbation ou un rejet.', 400);
  }
  return value;
}
