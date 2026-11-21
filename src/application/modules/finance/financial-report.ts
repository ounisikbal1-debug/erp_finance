import { FinanceRequestError } from './errors';

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as const;

export type FinancialReportAccountType = (typeof ACCOUNT_TYPES)[number];

export interface FinancialReportAccount {
  code: string;
  description: string;
  type: string;
  financialCategory?: string | null;
}

export interface FinancialReportJournalLine {
  accountCode: string;
  debit: number;
  credit: number;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseFinancialReportPeriod(from: unknown, to: unknown) {
  if (!isCalendarDate(from) || !isCalendarDate(to)) {
    throw new FinanceRequestError('Les dates from et to doivent être des dates calendaires valides au format AAAA-MM-JJ.', 400);
  }
  if (from > to) {
    throw new FinanceRequestError('La date de début doit précéder ou égaler la date de fin.', 400);
  }
  const endExclusive = new Date(`${to}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return {
    periodStart: from,
    periodEnd: to,
    startAt: new Date(`${from}T00:00:00.000Z`),
    endExclusive,
  };
}

function toMillimes(amount: number): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  const millimes = Math.round(amount * 1000);
  if (!Number.isSafeInteger(millimes) || Math.abs(amount * 1000 - millimes) > 1e-7) return null;
  return millimes;
}

export function calculateFinancialPeriodSummary(input: {
  entity: { name: string; countryCode: string; currencyCode: string; corporateTax?: number | null };
  accounts: readonly FinancialReportAccount[];
  journalLines: readonly FinancialReportJournalLine[];
  periodStart: string;
  periodEnd: string;
  generatedAt?: Date;
}) {
  const accountTypes = new Map<string, FinancialReportAccountType>();
  const accountBalances = new Map<string, {
    code: string;
    description: string;
    type: FinancialReportAccountType;
    financialCategory: string | null;
    millimes: number;
    invalid: boolean;
  }>();
  const accountCountByType = new Map<FinancialReportAccountType, number>();
  const invalidTypes = new Set<FinancialReportAccountType>();
  const totalsByType = new Map<FinancialReportAccountType, number>();
  for (const type of ACCOUNT_TYPES) {
    accountCountByType.set(type, 0);
    totalsByType.set(type, 0);
  }

  for (const account of input.accounts) {
    if (!ACCOUNT_TYPES.includes(account.type as FinancialReportAccountType)) continue;
    const type = account.type as FinancialReportAccountType;
    accountTypes.set(account.code, type);
    accountBalances.set(account.code, {
      code: account.code,
      description: account.description,
      type,
      financialCategory: account.financialCategory ?? null,
      millimes: 0,
      invalid: false,
    });
    accountCountByType.set(type, accountCountByType.get(type)! + 1);
  }

  const unclassifiedAccountCodes = new Set<string>();
  let unclassifiedJournalLineCount = 0;
  let invalidJournalLineCount = 0;
  for (const line of input.journalLines) {
    const type = accountTypes.get(line.accountCode);
    const balance = accountBalances.get(line.accountCode);
    if (!type || !balance) {
      unclassifiedJournalLineCount += 1;
      unclassifiedAccountCodes.add(line.accountCode);
      continue;
    }

    const debit = toMillimes(line.debit);
    const credit = toMillimes(line.credit);
    if (
      debit === null
      || credit === null
      || (debit === 0 && credit === 0)
      || (debit > 0 && credit > 0)
    ) {
      invalidJournalLineCount += 1;
      balance.invalid = true;
      invalidTypes.add(type);
      continue;
    }

    const normalBalanceMovement = type === 'Asset' || type === 'Expense'
      ? debit - credit
      : credit - debit;
    const next = balance.millimes + normalBalanceMovement;
    if (!Number.isSafeInteger(next)) {
      invalidJournalLineCount += 1;
      balance.invalid = true;
      invalidTypes.add(type);
      continue;
    }
    balance.millimes = next;
  }

  const accounts = [...accountBalances.values()]
    .sort((left, right) => left.type.localeCompare(right.type) || left.code.localeCompare(right.code))
    .map((account) => ({
      code: account.code,
      description: account.description,
      type: account.type,
      financialCategory: account.financialCategory ?? null,
      movement: account.invalid ? null : account.millimes / 1000,
    }));

  for (const account of accountBalances.values()) {
    if (account.invalid) continue;
    const next = totalsByType.get(account.type)! + account.millimes;
    if (!Number.isSafeInteger(next)) invalidTypes.add(account.type);
    else totalsByType.set(account.type, next);
  }

  const totals = ACCOUNT_TYPES.map((type) => ({
    type,
    accountCount: accountCountByType.get(type)!,
    movement: accountCountByType.get(type) === 0 || invalidTypes.has(type)
      ? null
      : totalsByType.get(type)! / 1000,
  }));

  return {
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    entity: input.entity,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    currencyPrecision: 3,
    totals,
    accounts,
    coverage: {
      postedJournalLineCount: input.journalLines.length,
      unclassifiedJournalLineCount,
      unclassifiedAccountCodes: [...unclassifiedAccountCodes].sort(),
      invalidJournalLineCount,
    },
  };
}
