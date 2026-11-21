export interface BankStatementImportIssue {
  rowIndex: number;
  lineNumber: number;
  message: string;
}

export function normalizeBankStatementDate(value: unknown): string {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : '';
  }
  return String(value ?? '');
}

export function validateBankStatementRows(
  rows: Array<Record<string, unknown>>,
): BankStatementImportIssue[] {
  const issues: BankStatementImportIssue[] = [];
  rows.forEach((row, rowIndex) => {
    const lineNumber = rowIndex + 2;
    const date = normalizeBankStatementDate(row.date);
    const parsedDate = new Date(`${date}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime())
      || parsedDate.toISOString().slice(0, 10) !== date) {
      issues.push({ rowIndex, lineNumber, message: 'Date invalide; utilisez AAAA-MM-JJ.' });
    }

    if (!String(row.description ?? '').trim()) {
      issues.push({ rowIndex, lineNumber, message: 'Description manquante.' });
    }

    const amount = String(row.amount ?? '').trim();
    if (!/^-?\d+(?:\.\d{1,3})?$/.test(amount) || !Number.isFinite(Number(amount)) || Number(amount) === 0) {
      issues.push({ rowIndex, lineNumber, message: 'Montant invalide; utilisez un montant signé avec au plus trois décimales.' });
    }

    const balance = String(row.balance ?? '').trim();
    if (balance && (!/^\d+(?:\.\d{1,3})?$/.test(balance) || !Number.isFinite(Number(balance)))) {
      issues.push({ rowIndex, lineNumber, message: 'Solde invalide; utilisez un solde positif avec au plus trois décimales.' });
    }
  });
  return issues;
}
