export interface JournalLineInput {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
  costCenterCode?: string;
}

export interface JournalEntryInput {
  entryNumber: string;
  entityId: string;
  date?: string;
  reference?: string;
  description: string;
  lines: JournalLineInput[];
}

export function validateJournalReversalDate(originalDate: Date, value: unknown): string {
  const reversalDate = value === undefined ? new Date().toISOString().slice(0, 10) : value;
  if (typeof reversalDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(reversalDate)) {
    throw new FinanceRequestError('La date de contrepassation doit respecter le format AAAA-MM-JJ.', 400);
  }
  const parsedReversalDate = new Date(`${reversalDate}T00:00:00.000Z`);
  if (Number.isNaN(parsedReversalDate.getTime()) || parsedReversalDate.toISOString().slice(0, 10) !== reversalDate) {
    throw new FinanceRequestError('La date de contrepassation est invalide.', 400);
  }
  if (!(originalDate instanceof Date) || Number.isNaN(originalDate.getTime())) {
    throw new FinanceRequestError('La date de l’écriture d’origine est invalide.', 422);
  }

  const originalMonth = originalDate.getUTCFullYear() * 12 + originalDate.getUTCMonth();
  const reversalMonth = parsedReversalDate.getUTCFullYear() * 12 + parsedReversalDate.getUTCMonth();
  if (reversalMonth !== originalMonth + 1) {
    throw new FinanceRequestError('La contrepassation doit être datée dans le mois civil suivant l’écriture d’origine.', 400);
  }
  return reversalDate;
}

export function validateJournalEntry(data: JournalEntryInput): JournalEntryInput {
  if (!data || typeof data !== 'object') {
    throw new FinanceRequestError('Données d’écriture comptable invalides', 400);
  }
  if (!data.entryNumber?.trim() || !data.entityId?.trim() || !data.description?.trim()) {
    throw new FinanceRequestError('Le numéro, la société et le libellé de l’écriture sont obligatoires', 400);
  }
  if (data.date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      throw new FinanceRequestError('La date doit respecter le format AAAA-MM-JJ', 400);
    }
    const parsedDate = new Date(`${data.date}T00:00:00.000Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== data.date) {
      throw new FinanceRequestError('La date de l’écriture est invalide', 400);
    }
  }
  if (!Array.isArray(data.lines) || data.lines.length < 2) {
    throw new FinanceRequestError('Une écriture comptable doit contenir au moins deux lignes', 400);
  }

  const lines = data.lines.map((line, index) => {
    if (!line || typeof line !== 'object' || !line.accountCode?.trim()) {
      throw new FinanceRequestError(`Le compte comptable est obligatoire à la ligne ${index + 1}`, 400);
    }
    if (
      typeof line.debit !== 'number' ||
      !Number.isFinite(line.debit) ||
      typeof line.credit !== 'number' ||
      !Number.isFinite(line.credit) ||
      line.debit < 0 ||
      line.credit < 0
    ) {
      throw new FinanceRequestError(`Les montants débit/crédit doivent être finis et positifs ou nuls à la ligne ${index + 1}`, 400);
    }
    if ((line.debit > 0) === (line.credit > 0)) {
      throw new FinanceRequestError(`Une ligne doit porter un montant positif au débit ou au crédit, mais pas les deux (ligne ${index + 1})`, 400);
    }

    return { ...line, accountCode: line.accountCode.trim() };
  });

  let totalDebitMillimes = 0;
  let totalCreditMillimes = 0;
  for (const [index, line] of lines.entries()) {
    const debitMillimes = Math.round(line.debit * 1000);
    const creditMillimes = Math.round(line.credit * 1000);
    if (
      Math.abs(line.debit * 1000 - debitMillimes) > 1e-7 ||
      Math.abs(line.credit * 1000 - creditMillimes) > 1e-7
    ) {
      throw new FinanceRequestError(`Les montants doivent être exprimés au millime près (ligne ${index + 1})`, 400);
    }
    totalDebitMillimes += debitMillimes;
    totalCreditMillimes += creditMillimes;
  }
  if (!Number.isSafeInteger(totalDebitMillimes) || !Number.isSafeInteger(totalCreditMillimes) || totalDebitMillimes <= 0) {
    throw new FinanceRequestError('Le total de l’écriture doit être fini et strictement positif', 400);
  }
  if (totalDebitMillimes !== totalCreditMillimes) {
    throw new FinanceRequestError(`Pièce comptable déséquilibrée ! Total Débit (${(totalDebitMillimes / 1000).toFixed(3)}) != Total Crédit (${(totalCreditMillimes / 1000).toFixed(3)})`, 400);
  }

  return { ...data, entryNumber: data.entryNumber.trim(), entityId: data.entityId.trim(), description: data.description.trim(), lines };
}
import { FinanceRequestError } from './errors';
