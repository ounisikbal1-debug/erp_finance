export interface ConsolidationReportSource {
  period: string;
  status: string;
  reportingCurrencyCode: string;
  diagnostics: string[];
  lines: Array<{
    groupAccountCode: string;
    debit: number;
    credit: number;
    lineType: string;
  }>;
}

export interface ConsolidationReportRow {
  period: string;
  currency: string;
  status: string;
  lineType: string;
  groupAccountCode: string;
  debit: number | '';
  credit: number | '';
  diagnostic: string;
}

function protectSpreadsheetText(value: string): string {
  return /^[\t\r ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

export function toConsolidationReportRows(run: ConsolidationReportSource): ConsolidationReportRow[] {
  const status = protectSpreadsheetText(run.status);
  const period = protectSpreadsheetText(run.period);
  const currency = protectSpreadsheetText(run.reportingCurrencyCode);
  const lines = run.lines.map((line) => ({
    period,
    currency,
    status,
    lineType: protectSpreadsheetText(line.lineType),
    groupAccountCode: protectSpreadsheetText(line.groupAccountCode),
    debit: line.debit,
    credit: line.credit,
    diagnostic: '',
  }));
  const diagnostics = run.diagnostics.map((diagnostic) => ({
    period,
    currency,
    status,
    lineType: 'DIAGNOSTIC',
    groupAccountCode: '',
    debit: '' as const,
    credit: '' as const,
    diagnostic: protectSpreadsheetText(diagnostic),
  }));
  return [...lines, ...diagnostics];
}
