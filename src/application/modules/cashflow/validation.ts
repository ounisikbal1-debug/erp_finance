import { CashflowRequestError } from './errors';

export function parseCashflowPeriod(value: unknown): {
  period: string;
  startAt: Date;
  endExclusive: Date;
} {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new CashflowRequestError('La période doit être au format AAAA-MM.', 400);
  }
  const [year, month] = value.split('-').map(Number);
  if (year < 1900 || year > 9999) {
    throw new CashflowRequestError('L’année de la période est invalide.', 400);
  }
  return {
    period: value,
    startAt: new Date(Date.UTC(year, month - 1, 1)),
    endExclusive: new Date(Date.UTC(year, month, 1)),
  };
}

export function validateCashAccountCodes(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 500) {
    throw new CashflowRequestError('La liste des comptes de trésorerie est invalide.', 400);
  }
  const codes = value.map((code) => {
    if (typeof code !== 'string' || !code.trim() || code.trim().length > 50) {
      throw new CashflowRequestError('Chaque code de compte doit être une chaîne valide.', 400);
    }
    return code.trim();
  });
  if (new Set(codes).size !== codes.length) {
    throw new CashflowRequestError('Un même compte ne peut pas être sélectionné plusieurs fois.', 400);
  }
  return codes.sort((left, right) => left.localeCompare(right));
}
