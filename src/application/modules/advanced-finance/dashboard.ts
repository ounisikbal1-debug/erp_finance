export interface DashboardJournalLine {
  date: Date;
  accountCode: string;
  debit: number;
  credit: number;
}

export interface DashboardAccount {
  code: string;
  type: string;
}

function toMillimes(amount: number): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  const millimes = Math.round(amount * 1000);
  return Number.isSafeInteger(millimes) ? millimes : null;
}

export function calculateDashboardSummary(input: {
  entity: { name: string; countryCode: string; currencyCode: string };
  materials: readonly { quantity: number; costPrice: number }[];
  invoices: readonly { status: string; totalAmount: number; currencyCode: string | null }[];
  journalLines: readonly DashboardJournalLine[];
  accounts: readonly DashboardAccount[];
  asOf?: Date;
}) {
  const asOf = input.asOf ?? new Date();
  const periodStart = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 11, 1));
  const periodEnd = new Date(asOf);
  const monthKeys = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + index, 1));
    return date.toISOString().slice(0, 7);
  });
  const monthlyTotals = new Map(monthKeys.map((month) => [month, {
    revenueMillimes: 0,
    expenseMillimes: 0,
    invalidRevenue: false,
    invalidExpense: false,
  }]));
  const accountTypes = new Map(input.accounts.map((account) => [account.code, account.type]));
  const revenueAccountCount = input.accounts.filter((account) => account.type === 'Revenue').length;
  const expenseAccountCount = input.accounts.filter((account) => account.type === 'Expense').length;
  const unclassifiedAccountCodes = new Set<string>();
  let unclassifiedJournalLineCount = 0;
  let invalidJournalLineCount = 0;

  for (const line of input.journalLines) {
    const accountType = accountTypes.get(line.accountCode);
    if (accountType !== 'Revenue' && accountType !== 'Expense') {
      if (!accountType) {
        unclassifiedJournalLineCount += 1;
        unclassifiedAccountCodes.add(line.accountCode);
      }
      continue;
    }

    const debit = toMillimes(line.debit);
    const credit = toMillimes(line.credit);
    if (
      debit === null
      || credit === null
      || Math.abs(line.debit * 1000 - Math.round(line.debit * 1000)) > 1e-7
      || Math.abs(line.credit * 1000 - Math.round(line.credit * 1000)) > 1e-7
    ) {
      invalidJournalLineCount += 1;
      const month = monthlyTotals.get(line.date.toISOString().slice(0, 7));
      if (month) {
        if (accountType === 'Revenue') month.invalidRevenue = true;
        else month.invalidExpense = true;
      }
      continue;
    }
    const month = line.date.toISOString().slice(0, 7);
    const totals = monthlyTotals.get(month);
    if (!totals) continue;

    if (accountType === 'Revenue') {
      totals.revenueMillimes += credit - debit;
      if (!Number.isSafeInteger(totals.revenueMillimes)) {
        totals.invalidRevenue = true;
        totals.revenueMillimes = 0;
        invalidJournalLineCount += 1;
      }
    } else {
      totals.expenseMillimes += debit - credit;
      if (!Number.isSafeInteger(totals.expenseMillimes)) {
        totals.invalidExpense = true;
        totals.expenseMillimes = 0;
        invalidJournalLineCount += 1;
      }
    }
    if (!Number.isSafeInteger(totals.revenueMillimes) || !Number.isSafeInteger(totals.expenseMillimes)) {
      invalidJournalLineCount += 1;
    }
  }

  let stockMillimes = 0;
  let invalidMaterialCount = 0;
  for (const material of input.materials) {
    if (
      !Number.isFinite(material.quantity)
      || material.quantity < 0
      || toMillimes(material.costPrice) === null
    ) {
      invalidMaterialCount += 1;
      continue;
    }
    const amountMillimes = toMillimes(material.quantity * material.costPrice);
    if (amountMillimes === null || !Number.isSafeInteger(stockMillimes + amountMillimes)) {
      invalidMaterialCount += 1;
      continue;
    }
    stockMillimes += amountMillimes;
  }

  let issuedInvoiceMillimes = 0;
  let invalidInvoiceCount = 0;
  let issuedInvoiceCount = 0;
  for (const invoice of input.invoices) {
    if (invoice.status !== 'ISSUED') continue;
    issuedInvoiceCount += 1;
    const total = toMillimes(invoice.totalAmount);
    if (
      invoice.currencyCode !== input.entity.currencyCode
      || total === null
      || !Number.isSafeInteger(issuedInvoiceMillimes + total)
    ) {
      invalidInvoiceCount += 1;
      continue;
    }
    issuedInvoiceMillimes += total;
  }

  const monthly = monthKeys.map((month) => {
    const totals = monthlyTotals.get(month);
    return {
      month,
      revenue: revenueAccountCount > 0 && !totals!.invalidRevenue ? totals!.revenueMillimes / 1000 : null,
      expenses: expenseAccountCount > 0 && !totals!.invalidExpense ? totals!.expenseMillimes / 1000 : null,
    };
  });
  const revenueTotals = [...monthlyTotals.values()];
  const revenueMillimes = revenueTotals.reduce((sum, totals) => sum + totals.revenueMillimes, 0);
  const expenseMillimes = revenueTotals.reduce((sum, totals) => sum + totals.expenseMillimes, 0);
  const revenue = Number.isSafeInteger(revenueMillimes)
    && revenueAccountCount > 0 && revenueTotals.every((totals) => !totals.invalidRevenue)
    ? revenueMillimes / 1000
    : null;
  const expenses = Number.isSafeInteger(expenseMillimes)
    && expenseAccountCount > 0 && revenueTotals.every((totals) => !totals.invalidExpense)
    ? expenseMillimes / 1000
    : null;
  const differenceMillimes = revenue !== null && expenses !== null
    ? revenueMillimes - expenseMillimes
    : null;

  return {
    generatedAt: asOf.toISOString(),
    entity: input.entity,
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
    kpis: {
      postedRevenue: revenue,
      postedExpenses: expenses,
      operatingDifference: differenceMillimes !== null && Number.isSafeInteger(differenceMillimes)
        ? differenceMillimes / 1000
        : null,
      issuedInvoiceAmount: invalidInvoiceCount === 0 ? issuedInvoiceMillimes / 1000 : null,
      issuedInvoiceCount,
      inventoryAtCost: input.materials.length > 0 && invalidMaterialCount === 0 ? stockMillimes / 1000 : null,
    },
    monthly,
    coverage: {
      revenueAccountCount,
      expenseAccountCount,
      unclassifiedJournalLineCount,
      unclassifiedAccountCodes: [...unclassifiedAccountCodes].sort(),
      invalidJournalLineCount,
      invalidInvoiceCount,
      invalidMaterialCount,
      postedJournalLineCount: input.journalLines.length,
      materialCount: input.materials.length,
    },
  };
}
