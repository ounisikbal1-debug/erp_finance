import { FinanceRequestError } from './errors';

export interface BalanceLine {
  accountCode: string;
  debit: number;
  credit: number;
}

export function buildBalanceLineFilter(entityId?: string) {
  return {
    journalEntry: {
      status: 'POSTED',
      ...(entityId ? { entityId } : {}),
    },
  };
}

export function aggregateBalance(lines: readonly BalanceLine[]) {
  const accounts = new Map<string, { totalDebitMillimes: number; totalCreditMillimes: number }>();

  for (const line of lines) {
    const debitMillimes = toMillimes(line.debit);
    const creditMillimes = toMillimes(line.credit);
    if ((debitMillimes > 0) === (creditMillimes > 0)) {
      throw new FinanceRequestError(
        `La ligne postée du compte ${line.accountCode} doit porter un montant au débit ou au crédit, mais pas les deux`,
        422,
      );
    }
    const totals = accounts.get(line.accountCode) ?? { totalDebitMillimes: 0, totalCreditMillimes: 0 };
    totals.totalDebitMillimes += debitMillimes;
    totals.totalCreditMillimes += creditMillimes;
    if (!Number.isSafeInteger(totals.totalDebitMillimes) || !Number.isSafeInteger(totals.totalCreditMillimes)) {
      throw new Error(`Le cumul du compte ${line.accountCode} dépasse la précision prise en charge`);
    }
    accounts.set(line.accountCode, totals);
  }

  return [...accounts.entries()]
    .map(([accountCode, totals]) => ({
      accountCode,
      totalDebit: totals.totalDebitMillimes / 1000,
      totalCredit: totals.totalCreditMillimes / 1000,
      balance: (totals.totalDebitMillimes - totals.totalCreditMillimes) / 1000,
    }))
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

function toMillimes(amount: number): number {
  const millimes = Math.round(amount * 1000);
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    !Number.isSafeInteger(millimes) ||
    Math.abs(amount * 1000 - millimes) > 1e-7
  ) {
    throw new Error('Une ligne du grand livre contient un montant invalide ou non exprimé au millime');
  }
  return millimes;
}
