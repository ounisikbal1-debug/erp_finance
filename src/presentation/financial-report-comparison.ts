type FinancialReportTotal = {
  type: 'Revenue' | 'Expense' | 'Asset' | 'Liability' | 'Equity';
  movement: number | null;
};

export interface PriorYearPeriod {
  from: string;
  to: string;
}

export interface FinancialBudgetMonth {
  period: string;
  entity: { name: string; countryCode: string; currencyCode: string };
  lines: Array<{
    accountCode: string;
    description: string;
    accountType: 'Revenue' | 'Expense' | null;
    amount: number | null;
    actual: number | null;
    variance: number | null;
    status: string;
  }>;
  diagnostics: {
    unclassifiedJournalLineCount: number;
    invalidJournalLineCount: number;
  };
}

export interface FinancialComparisonLine {
  label: string;
  current: number | null;
  priorYear: number | null;
  difference: number | null;
  percentChange: number | null;
}

function shiftOneYearBack(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;

  const year = date.getUTCFullYear() - 1;
  if (year < 1) return null;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const lastDayInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDayInMonth))).toISOString().slice(0, 10);
}

export function getPriorYearPeriod(from: string, to: string): PriorYearPeriod | null {
  const priorFrom = shiftOneYearBack(from);
  const priorTo = shiftOneYearBack(to);
  if (!priorFrom || !priorTo || priorFrom > priorTo) return null;
  return { from: priorFrom, to: priorTo };
}

function parseCalendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function getFullMonthsInPeriod(from: string, to: string): string[] {
  const start = parseCalendarDate(from);
  const end = parseCalendarDate(to);
  if (!start || !end || start > end) return [];

  const months: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= end) {
    const monthStart = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    if (monthStart >= start && monthEnd <= end) {
      months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function getMovement(totals: readonly FinancialReportTotal[], type: 'Revenue' | 'Expense'): number | null {
  const movement = totals.find((total) => total.type === type)?.movement;
  return typeof movement === 'number' && Number.isFinite(movement) ? movement : null;
}

function compare(label: string, current: number | null, priorYear: number | null): FinancialComparisonLine {
  if (current === null || priorYear === null) {
    return { label, current, priorYear, difference: null, percentChange: null };
  }
  const difference = current - priorYear;
  if (!Number.isFinite(difference)) {
    return { label, current, priorYear, difference: null, percentChange: null };
  }
  return {
    label,
    current,
    priorYear,
    difference,
    percentChange: priorYear === 0 ? null : (difference / Math.abs(priorYear)) * 100,
  };
}

export function compareFinancialPeriods(
  currentTotals: readonly FinancialReportTotal[],
  priorYearTotals: readonly FinancialReportTotal[],
): FinancialComparisonLine[] {
  const currentRevenue = getMovement(currentTotals, 'Revenue');
  const priorRevenue = getMovement(priorYearTotals, 'Revenue');
  const currentExpenses = getMovement(currentTotals, 'Expense');
  const priorExpenses = getMovement(priorYearTotals, 'Expense');
  const currentResult = currentRevenue === null || currentExpenses === null ? null : currentRevenue - currentExpenses;
  const priorResult = priorRevenue === null || priorExpenses === null ? null : priorRevenue - priorExpenses;

  return [
    compare('Produits', currentRevenue, priorRevenue),
    compare('Charges', currentExpenses, priorExpenses),
    compare('Résultat de période', currentResult, priorResult),
  ];
}
