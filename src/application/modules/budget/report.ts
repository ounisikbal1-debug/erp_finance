export interface BudgetAccount {
  code: string;
  description: string;
  type: string;
}

export interface BudgetEntry {
  id: string;
  period: string;
  accountCode: string;
  amount: number;
  status: string;
  revisionNumber?: number;
  supersedesLineId?: string | null;
  revisionReason?: string | null;
  createdByUserId: string;
  createdBy: { username: string };
  approvedByUserId: string | null;
  approvedBy: { username: string } | null;
  createdAt: Date | string;
  approvedAt: Date | string | null;
}

export interface BudgetJournalLine {
  accountCode: string;
  debit: number;
  credit: number;
}

function toMillimes(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const millimes = Math.round(value * 1000);
  return Number.isSafeInteger(millimes) && Math.abs(value * 1000 - millimes) <= 1e-7
    ? millimes
    : null;
}

export function buildBudgetReport(input: {
  entity: { name: string; countryCode: string; currencyCode: string };
  period: string;
  accounts: readonly BudgetAccount[];
  budgetLines: readonly BudgetEntry[];
  journalLines: readonly BudgetJournalLine[];
}) {
  const allAccounts = new Map(input.accounts.map((account) => [account.code, account]));
  const accounts = new Map([...allAccounts].filter(([, account]) => account.type === 'Expense' || account.type === 'Revenue'));
  const actuals = new Map<string, { millimes: number; invalid: boolean }>();
  const unclassifiedAccountCodes = new Set<string>();
  let invalidJournalLineCount = 0;
  let unclassifiedJournalLineCount = 0;

  for (const line of input.journalLines) {
    const account = allAccounts.get(line.accountCode);
    if (!account) {
      unclassifiedJournalLineCount += 1;
      unclassifiedAccountCodes.add(line.accountCode);
      continue;
    }
    if (account.type !== 'Expense' && account.type !== 'Revenue') continue;

    const debit = toMillimes(line.debit);
    const credit = toMillimes(line.credit);
    if (debit === null || credit === null || (debit === 0 && credit === 0) || (debit > 0 && credit > 0)) {
      invalidJournalLineCount += 1;
      const state = actuals.get(line.accountCode) ?? { millimes: 0, invalid: false };
      state.invalid = true;
      actuals.set(line.accountCode, state);
      continue;
    }

    const movement = account.type === 'Expense' ? debit - credit : credit - debit;
    const state = actuals.get(line.accountCode) ?? { millimes: 0, invalid: false };
    const next = state.millimes + movement;
    if (!Number.isSafeInteger(next)) {
      invalidJournalLineCount += 1;
      state.invalid = true;
    } else {
      state.millimes = next;
    }
    actuals.set(line.accountCode, state);
  }

  const totalsByType = {
    Expense: { budget: 0, actual: 0, variance: 0, budgetValid: true, actualValid: true, varianceValid: true, hasLines: false },
    Revenue: { budget: 0, actual: 0, variance: 0, budgetValid: true, actualValid: true, varianceValid: true, hasLines: false },
  };
  let hasApprovedLines = false;
  const lines = input.budgetLines.map((line) => {
    const account = accounts.get(line.accountCode);
    const budgetMillimes = toMillimes(line.amount);
    const actual = actuals.get(line.accountCode);
    const actualAmount = actual?.invalid ? null : (actual?.millimes ?? 0) / 1000;
    const approved = line.status === 'APPROVED';
    const variance = approved
      && (account?.type === 'Expense' || account?.type === 'Revenue')
      && actualAmount !== null
      && budgetMillimes !== null
      ? (account?.type === 'Expense'
        ? (budgetMillimes - Math.round(actualAmount * 1000)) / 1000
        : (Math.round(actualAmount * 1000) - budgetMillimes) / 1000)
      : null;
    const variancePercent = variance !== null && budgetMillimes !== null && budgetMillimes > 0
      ? variance / (budgetMillimes / 1000) * 100
      : null;

    if (approved) {
      hasApprovedLines = true;
      if (account?.type === 'Expense' || account?.type === 'Revenue') {
        const totals = totalsByType[account.type];
        totals.hasLines = true;
        if (budgetMillimes === null || !Number.isSafeInteger(totals.budget + budgetMillimes)) {
          totals.budgetValid = false;
        } else {
          totals.budget += budgetMillimes;
        }
        if (actualAmount === null) {
          totals.actualValid = false;
        } else {
          const actualMillimes = Math.round(actualAmount * 1000);
          if (!Number.isSafeInteger(totals.actual + actualMillimes)) {
            totals.actualValid = false;
          } else {
            totals.actual += actualMillimes;
          }
        }
        if (variance === null) {
          totals.varianceValid = false;
        } else {
          const varianceMillimes = Math.round(variance * 1000);
          if (!Number.isSafeInteger(totals.variance + varianceMillimes)) {
            totals.varianceValid = false;
          } else {
            totals.variance += varianceMillimes;
          }
        }
      }
    }

    return {
      id: line.id,
      accountCode: line.accountCode,
      description: account?.description ?? 'Compte absent du plan comptable courant',
      accountType: account?.type ?? null,
      amount: budgetMillimes === null ? null : budgetMillimes / 1000,
      actual: actualAmount,
      variance,
      variancePercent,
      status: line.status,
      revisionNumber: line.revisionNumber ?? 1,
      supersedesLineId: line.supersedesLineId ?? null,
      revisionReason: line.revisionReason ?? null,
      createdByUserId: line.createdByUserId,
      createdBy: line.createdBy.username,
      approvedByUserId: line.approvedByUserId,
      approvedBy: line.approvedBy?.username ?? null,
      createdAt: new Date(line.createdAt).toISOString(),
      approvedAt: line.approvedAt ? new Date(line.approvedAt).toISOString() : null,
    };
  });

  return {
    entity: input.entity,
    period: input.period,
    accounts: [...accounts.values()].sort((left, right) => left.code.localeCompare(right.code)),
    lines,
    totals: {
      expenseBudget: hasApprovedLines && totalsByType.Expense.hasLines && totalsByType.Expense.budgetValid
        ? totalsByType.Expense.budget / 1000 : null,
      expenseActual: hasApprovedLines && totalsByType.Expense.hasLines && totalsByType.Expense.actualValid
        ? totalsByType.Expense.actual / 1000 : null,
      expenseVariance: hasApprovedLines && totalsByType.Expense.hasLines && totalsByType.Expense.varianceValid
        ? totalsByType.Expense.variance / 1000 : null,
      revenueBudget: hasApprovedLines && totalsByType.Revenue.hasLines && totalsByType.Revenue.budgetValid
        ? totalsByType.Revenue.budget / 1000 : null,
      revenueActual: hasApprovedLines && totalsByType.Revenue.hasLines && totalsByType.Revenue.actualValid
        ? totalsByType.Revenue.actual / 1000 : null,
      revenueVariance: hasApprovedLines && totalsByType.Revenue.hasLines && totalsByType.Revenue.varianceValid
        ? totalsByType.Revenue.variance / 1000 : null,
    },
    diagnostics: {
      postedJournalLineCount: input.journalLines.length,
      unclassifiedJournalLineCount,
      unclassifiedAccountCodes: [...unclassifiedAccountCodes].sort(),
      invalidJournalLineCount,
    },
  };
}
