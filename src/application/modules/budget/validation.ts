import { BudgetRequestError } from './errors';

export interface BudgetDraftInput {
  period: string;
  accountCode: string;
  amount: number;
}

export function validateBudgetDraftAmount(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BudgetRequestError('Données budgétaires invalides.', 400);
  }
  const amount = (value as Record<string, unknown>).amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    throw new BudgetRequestError('Le montant budgétaire doit être positif ou nul.', 400);
  }
  const millimes = Math.round(amount * 1000);
  if (!Number.isSafeInteger(millimes) || Math.abs(amount * 1000 - millimes) > 1e-7) {
    throw new BudgetRequestError('Le montant budgétaire doit respecter la précision du millime.', 400);
  }
  return millimes / 1000;
}

export function validateBudgetRevisionInput(value: unknown): { amount: number; reason: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BudgetRequestError('Données de révision budgétaire invalides.', 400);
  }
  const input = value as Record<string, unknown>;
  if (typeof input.reason !== 'string' || input.reason.trim().length < 5 || input.reason.trim().length > 500) {
    throw new BudgetRequestError('Le motif de révision doit contenir entre 5 et 500 caractères.', 400);
  }
  return { amount: validateBudgetDraftAmount(input), reason: input.reason.trim() };
}

export function parseBudgetPeriod(value: unknown): {
  period: string;
  startAt: Date;
  endExclusive: Date;
} {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new BudgetRequestError('La période budgétaire doit être au format AAAA-MM.', 400);
  }
  const [year, month] = value.split('-').map(Number);
  if (year < 1900 || year > 9999) {
    throw new BudgetRequestError('L’année de la période budgétaire est invalide.', 400);
  }
  return {
    period: value,
    startAt: new Date(Date.UTC(year, month - 1, 1)),
    endExclusive: new Date(Date.UTC(year, month, 1)),
  };
}

export function parseBudgetForecastPeriod(value: unknown): {
  year: number;
  asOfPeriod: string;
  yearStart: Date;
  nextYearStart: Date;
} {
  const { period } = parseBudgetPeriod(value);
  const year = Number(period.slice(0, 4));
  return {
    year,
    asOfPeriod: period,
    yearStart: new Date(Date.UTC(year, 0, 1)),
    nextYearStart: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

export function validateBudgetDraftInput(value: unknown): BudgetDraftInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BudgetRequestError('Données budgétaires invalides.', 400);
  }
  const input = value as Record<string, unknown>;
  const { period } = parseBudgetPeriod(input.period);
  if (typeof input.accountCode !== 'string' || !input.accountCode.trim() || input.accountCode.trim().length > 50) {
    throw new BudgetRequestError('Un code de compte valide est obligatoire.', 400);
  }
  return { period, accountCode: input.accountCode.trim(), amount: validateBudgetDraftAmount(input) };
}
