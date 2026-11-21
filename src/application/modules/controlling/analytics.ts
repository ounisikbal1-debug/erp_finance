export interface CostCenterSource {
  code: string;
  [key: string]: unknown;
}

export interface CostCenterJournalLine {
  costCenterCode: string | null;
  accountCode: string;
  debit: number;
  credit: number;
}

export interface CostCenterAccount {
  code: string;
  type: string;
}

export function calculateCostCenterAnalytics<T extends CostCenterSource>(
  costCenters: readonly T[],
  lines: readonly CostCenterJournalLine[],
  accounts: readonly CostCenterAccount[],
) {
  const accountTypes = new Map(accounts.map((account) => [account.code, account.type]));
  const totalsByCostCenter = new Map<string, {
    expenses: number;
    revenues: number;
    unmappedAccountCodes: Set<string>;
  }>();

  for (const line of lines) {
    if (!line.costCenterCode) continue;
    const accountType = accountTypes.get(line.accountCode);
    const totals = totalsByCostCenter.get(line.costCenterCode) ?? {
      expenses: 0,
      revenues: 0,
      unmappedAccountCodes: new Set<string>(),
    };
    if (accountType === 'Expense') totals.expenses += line.debit - line.credit;
    else if (accountType === 'Revenue') totals.revenues += line.credit - line.debit;
    else if (accountType === undefined) totals.unmappedAccountCodes.add(line.accountCode);
    totalsByCostCenter.set(line.costCenterCode, totals);
  }

  return costCenters.map((costCenter) => {
    const totals = totalsByCostCenter.get(costCenter.code);
    const totalExpenses = totals?.expenses ?? 0;
    const totalRevenues = totals?.revenues ?? 0;
    return {
      ...costCenter,
      totalExpenses: Math.round(totalExpenses * 1000) / 1000,
      totalRevenues: Math.round(totalRevenues * 1000) / 1000,
      netBalance: Math.round((totalRevenues - totalExpenses) * 1000) / 1000,
      unmappedAccountCodes: [...(totals?.unmappedAccountCodes ?? [])].sort(),
    };
  });
}
