import type { BudgetAccount } from './report';

export interface BudgetForecastLine {
  period: string;
  accountCode: string;
  amount: number;
  status: string;
}

export interface BudgetForecastJournalLine {
  accountCode: string;
  debit: number;
  credit: number;
  date: Date | string;
}

function toMillimes(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const millimes = Math.round(value * 1000);
  return Number.isSafeInteger(millimes) && Math.abs(value * 1000 - millimes) <= 1e-7 ? millimes : null;
}

function toSignedMillimes(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const millimes = Math.round(value * 1000);
  return Number.isSafeInteger(millimes) && Math.abs(value * 1000 - millimes) <= 1e-7 ? millimes : null;
}

function calendarPeriod(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 7);
}

export function buildBudgetForecastReport(input: {
  entity: { name: string; countryCode: string; currencyCode: string };
  year: number;
  asOfPeriod: string;
  accounts: readonly BudgetAccount[];
  budgetLines: readonly BudgetForecastLine[];
  journalLines: readonly BudgetForecastJournalLine[];
}) {
  const elapsedMonths = Number(input.asOfPeriod.slice(5, 7));
  const accounts = input.accounts.filter((account) => account.type === 'Expense' || account.type === 'Revenue');
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));
  const budgetByAccount = new Map<string, Map<string, number | null>>();
  const actualByAccount = new Map<string, { millimes: number; invalid: boolean }>();
  const unclassifiedAccountCodes = new Set<string>();
  let invalidBudgetLineCount = 0;
  let invalidJournalLineCount = 0;
  let unclassifiedJournalLineCount = 0;

  for (const line of input.budgetLines) {
    if (line.status !== 'APPROVED') continue;
    if (!accountByCode.has(line.accountCode)) {
      unclassifiedAccountCodes.add(line.accountCode);
      continue;
    }
    const months = budgetByAccount.get(line.accountCode) ?? new Map<string, number | null>();
    const amountMillimes = toMillimes(line.amount);
    if (!/^(\d{4})-(0[1-9]|1[0-2])$/.test(line.period) || Number(line.period.slice(0, 4)) !== input.year
      || amountMillimes === null || months.has(line.period)) {
      invalidBudgetLineCount += 1;
      months.set(line.period, null);
    } else {
      months.set(line.period, amountMillimes);
    }
    budgetByAccount.set(line.accountCode, months);
  }

  for (const line of input.journalLines) {
    const account = accountByCode.get(line.accountCode);
    if (!account) {
      unclassifiedJournalLineCount += 1;
      unclassifiedAccountCodes.add(line.accountCode);
      continue;
    }
    const period = calendarPeriod(line.date);
    const debit = toMillimes(line.debit);
    const credit = toMillimes(line.credit);
    if (!period || period.slice(0, 4) !== String(input.year) || debit === null || credit === null
      || (debit === 0 && credit === 0) || (debit > 0 && credit > 0)) {
      invalidJournalLineCount += 1;
      const state = actualByAccount.get(line.accountCode) ?? { millimes: 0, invalid: false };
      state.invalid = true;
      actualByAccount.set(line.accountCode, state);
      continue;
    }
    const state = actualByAccount.get(line.accountCode) ?? { millimes: 0, invalid: false };
    const movement = account.type === 'Expense' ? debit - credit : credit - debit;
    if (period <= input.asOfPeriod) {
      const next = state.millimes + movement;
      if (!Number.isSafeInteger(next)) {
        state.invalid = true;
        invalidJournalLineCount += 1;
      } else {
        state.millimes = next;
      }
    }
    actualByAccount.set(line.accountCode, state);
  }

  const lines = accounts.map((account) => {
    const monthlyBudget = budgetByAccount.get(account.code) ?? new Map<string, number | null>();
    let annualBudgetMillimes = 0;
    let budgetValid = true;
    for (const value of monthlyBudget.values()) {
      if (value === null || !Number.isSafeInteger(annualBudgetMillimes + value)) budgetValid = false;
      else annualBudgetMillimes += value;
    }
    const actual = actualByAccount.get(account.code);
    const actualYtd = actual?.invalid ? null : (actual?.millimes ?? 0) / 1000;
    const futureMonths = Array.from({ length: 12 - elapsedMonths }, (_, index) => (
      `${input.year}-${String(elapsedMonths + index + 1).padStart(2, '0')}`
    ));
    const remainingBudgetValues = futureMonths.map((period) => monthlyBudget.get(period));
    const remainingBudgetComplete = remainingBudgetValues.every((value) => value !== undefined && value !== null);
    let remainingBudgetMillimes = 0;
    for (const value of remainingBudgetValues) {
      if (value === undefined || value === null || !Number.isSafeInteger(remainingBudgetMillimes + value)) {
        remainingBudgetMillimes = Number.NaN;
        break;
      }
      remainingBudgetMillimes += value;
    }
    const forecast = actualYtd !== null && remainingBudgetComplete && Number.isSafeInteger(remainingBudgetMillimes)
      ? actualYtd + remainingBudgetMillimes / 1000
      : null;
    const runRate = actualYtd === null ? null : actualYtd / elapsedMonths * 12;
    const annualBudget = budgetValid && monthlyBudget.size > 0 ? annualBudgetMillimes / 1000 : null;
    const approvedBudgetMonths = [...monthlyBudget.values()].filter((value) => value !== null).length;
    const variance = annualBudget !== null && approvedBudgetMonths === 12 && forecast !== null
      ? account.type === 'Expense' ? annualBudget - forecast : forecast - annualBudget
      : null;
    return {
      accountCode: account.code,
      description: account.description,
      accountType: account.type,
      annualBudget,
      approvedBudgetMonths,
      actualYtd,
      forecast,
      forecastMethod: forecast === null ? 'UNAVAILABLE' as const : 'ACTUAL_PLUS_REMAINING_APPROVED_BUDGET' as const,
      linearRunRate: runRate,
      remainingBudgetMonths: remainingBudgetValues.filter((value) => value !== undefined && value !== null).length,
      variance,
    };
  });

  const totalFor = (type: 'Expense' | 'Revenue') => {
    const typedLines = lines.filter((line) => line.accountType === type && line.annualBudget !== null);
    const sum = (values: Array<number | null>): number | null => {
      if (values.some((value) => value === null)) return null;
      let totalMillimes = 0;
      for (const value of values) {
        const millimes = toSignedMillimes(value as number);
        if (millimes === null || !Number.isSafeInteger(totalMillimes + millimes)) return null;
        totalMillimes += millimes;
      }
      return totalMillimes / 1000;
    };
    return {
      annualBudget: sum(typedLines.map((line) => line.annualBudget)),
      actualYtd: sum(typedLines.map((line) => line.actualYtd)),
      forecast: sum(typedLines.map((line) => line.forecast)),
      variance: sum(typedLines.map((line) => line.variance)),
    };
  };

  return {
    entity: input.entity,
    year: input.year,
    asOfPeriod: input.asOfPeriod,
    elapsedMonths,
    accounts: [...accounts].sort((left, right) => left.code.localeCompare(right.code)),
    lines,
    totals: {
      Expense: totalFor('Expense'),
      Revenue: totalFor('Revenue'),
    },
    diagnostics: {
      budgetLineCount: input.budgetLines.length,
      approvedBudgetLineCount: input.budgetLines.filter((line) => line.status === 'APPROVED').length,
      invalidBudgetLineCount,
      postedJournalLineCount: input.journalLines.length,
      invalidJournalLineCount,
      unclassifiedJournalLineCount,
      unclassifiedAccountCodes: [...unclassifiedAccountCodes].sort(),
      unavailableForecastAccountCodes: lines.filter((line) => line.forecast === null).map((line) => line.accountCode),
      method: 'Réalisé comptabilisé jusqu’au mois de référence + budgets approuvés des mois suivants; tendance linéaire affichée séparément.',
    },
  };
}
