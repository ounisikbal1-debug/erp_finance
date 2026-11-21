import { CashflowRequestError } from './errors';
import { toMillimes } from './banking';

export interface CashForecastSourceItem {
  id: string;
  expectedDate: Date | string;
  description: string;
  direction: string;
  amount: number;
  category: string;
  status: string;
}

function safeAdd(left: number, right: number): number | null {
  const result = left + right;
  return Number.isSafeInteger(result) ? result : null;
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export function validateForecastHorizon(value: unknown): number {
  if (value === undefined) return 30;
  const horizon = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof horizon !== 'number' || !Number.isSafeInteger(horizon) || horizon < 1 || horizon > 365) {
    throw new CashflowRequestError('L’horizon de prévision doit être un nombre entier de 1 à 365 jours.', 400);
  }
  return horizon;
}

export function buildCashForecast(input: {
  asOfDate: Date | null;
  openingBalance: number | null;
  openingBalanceSource: string | null;
  currencyCode: string;
  horizonDays: number;
  items: CashForecastSourceItem[];
}) {
  const asOfDate = input.asOfDate && Number.isFinite(input.asOfDate.getTime())
    ? new Date(Date.UTC(input.asOfDate.getUTCFullYear(), input.asOfDate.getUTCMonth(), input.asOfDate.getUTCDate()))
    : null;
  const openingMillimes = input.openingBalance === null ? null : toMillimes(input.openingBalance);
  const validOpening = asOfDate !== null && openingMillimes !== null;
  const endExclusive = validOpening
    ? new Date(asOfDate.getTime() + (input.horizonDays + 1) * 24 * 60 * 60 * 1000)
    : null;
  const flows = new Map<string, { inflows: number; outflows: number }>();
  const visibleItems: CashForecastSourceItem[] = [];
  let invalidItemCount = 0;

  for (const item of input.items) {
    const expectedDate = item.expectedDate instanceof Date ? item.expectedDate : new Date(item.expectedDate);
    const amount = toMillimes(item.amount);
    if (
      !Number.isFinite(expectedDate.getTime())
      || amount === null
      || amount <= 0
      || (item.direction !== 'INFLOW' && item.direction !== 'OUTFLOW')
      || item.status !== 'PLANNED'
    ) {
      invalidItemCount += 1;
      continue;
    }
    if (!validOpening || !endExclusive || expectedDate < new Date(asOfDate.getTime() + 24 * 60 * 60 * 1000) || expectedDate >= endExclusive) {
      continue;
    }
    const day = expectedDate.toISOString().slice(0, 10);
    const flow = flows.get(day) ?? { inflows: 0, outflows: 0 };
    const next = item.direction === 'INFLOW'
      ? safeAdd(flow.inflows, amount)
      : safeAdd(flow.outflows, amount);
    if (next === null) {
      invalidItemCount += 1;
      continue;
    }
    if (item.direction === 'INFLOW') flow.inflows = next;
    else flow.outflows = next;
    flows.set(day, flow);
    visibleItems.push(item);
  }

  const days: Array<{
    date: string;
    inflows: number;
    outflows: number;
    closingBalance: number | null;
  }> = [];
  let runningMillimes = openingMillimes;
  let overflow = false;
  if (validOpening && endExclusive) {
    for (let offset = 1; offset <= input.horizonDays; offset += 1) {
      const date = new Date(asOfDate.getTime() + offset * 24 * 60 * 60 * 1000);
      const dayFlow = flows.get(date.toISOString().slice(0, 10)) ?? { inflows: 0, outflows: 0 };
      const withInflows = runningMillimes === null ? null : safeAdd(runningMillimes, dayFlow.inflows);
      const closing = withInflows === null ? null : safeAdd(withInflows, -dayFlow.outflows);
      if (closing === null) overflow = true;
      runningMillimes = closing;
      days.push({
        date: date.toISOString().slice(0, 10),
        inflows: dayFlow.inflows / 1000,
        outflows: dayFlow.outflows / 1000,
        closingBalance: closing === null ? null : closing / 1000,
      });
    }
  }

  return {
    currencyCode: input.currencyCode,
    asOfDate: validOpening ? asOfDate.toISOString() : null,
    openingBalance: validOpening && openingMillimes !== null ? openingMillimes / 1000 : null,
    openingBalanceSource: validOpening ? input.openingBalanceSource : null,
    horizonDays: input.horizonDays,
    days,
    items: visibleItems,
    diagnostics: {
      hasOpeningBalance: validOpening,
      invalidItemCount,
      totalsAvailable: validOpening && invalidItemCount === 0 && !overflow,
    },
  };
}

export function parseForecastDate(value: unknown): Date {
  const date = parseIsoDate(value);
  if (!date) throw new CashflowRequestError('La date doit respecter le format AAAA-MM-JJ.', 400);
  return date;
}
