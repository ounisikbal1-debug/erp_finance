export interface CashAccountOption {
  code: string;
  description: string;
  type: string;
  isPostingAllowed?: boolean;
}

export interface CashJournalLine {
  id: string;
  accountCode: string;
  debit: number;
  credit: number;
  description: string | null;
  journalEntry: {
    entryNumber: string;
    date: Date | string;
    reference: string | null;
    description: string;
  };
}

export interface CashflowInput {
  entity: { name: string; countryCode: string; currencyCode: string };
  period: string;
  startAt: Date;
  endExclusive: Date;
  accounts: CashAccountOption[];
  mappedAccountCodes: string[];
  journalLines: CashJournalLine[];
}

function toMillimes(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const millimes = Math.round(value * 1000);
  if (!Number.isSafeInteger(millimes) || Math.abs(value * 1000 - millimes) > 1e-7) return null;
  return millimes;
}

function safeAdd(left: number, right: number): number | null {
  const sum = left + right;
  return Number.isSafeInteger(sum) ? sum : null;
}

function parseLine(line: CashJournalLine) {
  const debit = toMillimes(line.debit);
  const credit = toMillimes(line.credit);
  const date = line.journalEntry.date instanceof Date
    ? new Date(line.journalEntry.date.getTime())
    : new Date(line.journalEntry.date);
  if (
    debit === null
    || credit === null
    || (debit > 0 && credit > 0)
    || !Number.isFinite(date.getTime())
    || !line.accountCode
  ) return null;
  return { debit, credit, date, movement: debit - credit };
}

export function buildCashflowReport(input: CashflowInput) {
  const mapped = new Set(input.mappedAccountCodes);
  const validAccountCodes = new Set(input.accounts
    .filter((account) => account.type === 'Asset' && account.isPostingAllowed !== false)
    .map((account) => account.code));
  const invalidMappedAccountCodes = [...mapped]
    .filter((code) => !validAccountCodes.has(code))
    .sort((left, right) => left.localeCompare(right));
  const selectedCodes = [...mapped].filter((code) => validAccountCodes.has(code));
  const selected = new Set(selectedCodes);
  let openingMillimes = 0;
  let inflowMillimes = 0;
  let outflowMillimes = 0;
  let invalidJournalLineCount = 0;
  let postedJournalLineCount = 0;
  const periodLines: Array<{
    id: string;
    date: Date;
    entryNumber: string;
    reference: string | null;
    accountCode: string;
    description: string;
    movement: number;
  }> = [];

  for (const line of input.journalLines) {
    if (!selected.has(line.accountCode)) {
      continue;
    }
    postedJournalLineCount += 1;
    const parsed = parseLine(line);
    if (!parsed) {
      invalidJournalLineCount += 1;
      continue;
    }
    if (parsed.date >= input.endExclusive) {
      invalidJournalLineCount += 1;
      continue;
    }
    if (parsed.date < input.startAt) {
      const nextOpening = safeAdd(openingMillimes, parsed.movement);
      if (nextOpening === null) invalidJournalLineCount += 1;
      else openingMillimes = nextOpening;
      continue;
    }

    if (parsed.movement > 0) {
      const next = safeAdd(inflowMillimes, parsed.movement);
      if (next === null) {
        invalidJournalLineCount += 1;
        continue;
      }
      inflowMillimes = next;
    } else if (parsed.movement < 0) {
      const next = safeAdd(outflowMillimes, -parsed.movement);
      if (next === null) {
        invalidJournalLineCount += 1;
        continue;
      }
      outflowMillimes = next;
    }
    periodLines.push({
      id: line.id,
      date: parsed.date,
      entryNumber: line.journalEntry.entryNumber,
      reference: line.journalEntry.reference,
      accountCode: line.accountCode,
      description: line.description?.trim() || line.journalEntry.description,
      movement: parsed.movement,
    });
  }

  periodLines.sort((left, right) => left.date.getTime() - right.date.getTime()
    || left.entryNumber.localeCompare(right.entryNumber)
    || left.accountCode.localeCompare(right.accountCode)
    || left.id.localeCompare(right.id));

  let runningMillimes = openingMillimes;
  const transactions = periodLines.map((line) => {
    const next = safeAdd(runningMillimes, line.movement);
    if (next === null) invalidJournalLineCount += 1;
    else runningMillimes = next;
    return {
      id: line.id,
      date: line.date.toISOString(),
      entryNumber: line.entryNumber,
      reference: line.reference,
      accountCode: line.accountCode,
      description: line.description,
      inflow: line.movement > 0 ? line.movement / 1000 : 0,
      outflow: line.movement < 0 ? -line.movement / 1000 : 0,
      balance: next === null ? null : next / 1000,
    };
  });

  const reliable = selectedCodes.length > 0
    && invalidMappedAccountCodes.length === 0
    && invalidJournalLineCount === 0;
  const afterInflows = safeAdd(openingMillimes, inflowMillimes);
  const closingMillimes = afterInflows === null ? null : safeAdd(afterInflows, -outflowMillimes);
  const totalsAvailable = reliable && closingMillimes !== null;

  return {
    entity: input.entity,
    period: input.period,
    accounts: input.accounts
      .filter((account) => account.type === 'Asset' && account.isPostingAllowed !== false)
      .map(({ code, description }) => ({ code, description, selected: mapped.has(code) })),
    totals: {
      openingBalance: totalsAvailable ? openingMillimes / 1000 : null,
      inflows: totalsAvailable ? inflowMillimes / 1000 : null,
      outflows: totalsAvailable ? outflowMillimes / 1000 : null,
      closingBalance: totalsAvailable ? closingMillimes / 1000 : null,
    },
    transactions: totalsAvailable
      ? transactions
      : transactions.map((transaction) => ({ ...transaction, balance: null })),
    diagnostics: {
      mappedAccountCount: selectedCodes.length,
      invalidMappedAccountCodes,
      postedJournalLineCount,
      invalidJournalLineCount,
      totalsAvailable,
    },
  };
}
