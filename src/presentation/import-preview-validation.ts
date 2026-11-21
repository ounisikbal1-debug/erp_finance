export interface ImportRowIssue {
  rowIndex: number;
  lineNumber: number;
  message: string;
}

export type ImportRowValidator = (
  row: Record<string, unknown>,
  rowIndex: number,
  allRows: Array<Record<string, unknown>>,
) => string | null;

export function collectImportRowIssues(
  rows: Array<Record<string, unknown>>,
  validateRow: ImportRowValidator,
): ImportRowIssue[] {
  const issues: ImportRowIssue[] = [];
  rows.forEach((row, rowIndex) => {
    const message = validateRow(row, rowIndex, rows);
    if (message) issues.push({ rowIndex, lineNumber: rowIndex + 2, message });
  });
  return issues;
}
