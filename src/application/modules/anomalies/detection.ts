import type { AnomalyReport, DetectedAnomaly } from './types';

export interface JournalLineSource {
  accountCode: string;
  debit: number;
  credit: number;
}

export interface JournalEntrySource {
  entryNumber: string;
  reference: string | null;
  date: Date;
  lines: JournalLineSource[];
}

export interface InvoiceSource {
  invoiceNumber: string;
  createdAt: Date;
  vatAccountCode?: string | null;
  taxAmount: number;
  items: Array<{ quantity: number; unitPrice: number; taxRate: number }>;
}

export interface PayslipSource {
  employeeId: string;
  period: string;
  createdAt: Date;
  employee: { firstName: string; lastName: string };
}

const millimes = (amount: number) => Math.round(amount * 1000);
const roundToMillimes = (amount: number) => Math.round(amount * 1000) / 1000;

export function detectAnomalies(input: {
  entityId: string;
  periodFrom: string;
  periodTo: string;
  generatedAt: Date;
  journalEntries: readonly JournalEntrySource[];
  invoices: readonly InvoiceSource[];
  payslips: readonly PayslipSource[];
  limitedSources?: readonly string[];
}): AnomalyReport {
  const anomalies: DetectedAnomaly[] = [];
  const entriesByReference = new Map<string, JournalEntrySource[]>();

  for (const entry of input.journalEntries) {
    if (entry.reference) {
      const entries = entriesByReference.get(entry.reference) ?? [];
      entries.push(entry);
      entriesByReference.set(entry.reference, entries);
    }

    const debit = entry.lines.reduce((sum, line) => sum + millimes(line.debit), 0);
    const credit = entry.lines.reduce((sum, line) => sum + millimes(line.credit), 0);
    const invalidLine = entry.lines.some((line) => (
      !Number.isFinite(line.debit)
      || !Number.isFinite(line.credit)
      || line.debit < 0
      || line.credit < 0
      || (line.debit > 0) === (line.credit > 0)
      || Math.abs(line.debit * 1000 - millimes(line.debit)) > 1e-7
      || Math.abs(line.credit * 1000 - millimes(line.credit)) > 1e-7
    ));
    if (entry.lines.length < 2 || invalidLine || !Number.isSafeInteger(debit) || !Number.isSafeInteger(credit) || debit <= 0 || debit !== credit) {
      anomalies.push({
        id: `journal:${entry.entryNumber}`,
        severity: 'CRITICAL',
        category: 'ACCOUNTING',
        reference: entry.entryNumber,
        reason: `Écriture postée déséquilibrée, invalide ou incomplète (débit ${roundToMillimes(debit / 1000).toFixed(3)}, crédit ${roundToMillimes(credit / 1000).toFixed(3)}).`,
        date: entry.date.toISOString(),
      });
    }
  }

  for (const invoice of input.invoices) {
    const entries = entriesByReference.get(invoice.invoiceNumber) ?? [];
    if (entries.length === 0) {
      anomalies.push({
        id: `invoice-missing-entry:${invoice.invoiceNumber}`,
        severity: 'HIGH',
        category: 'SALES',
        reference: invoice.invoiceNumber,
        reason: 'Aucune écriture comptable postée ne référence cette facture.',
        date: invoice.createdAt.toISOString(),
      });
      continue;
    }
    if (entries.length > 1) {
      anomalies.push({
        id: `invoice-multiple-entries:${invoice.invoiceNumber}`,
        severity: 'HIGH',
        category: 'SALES',
        reference: invoice.invoiceNumber,
        reason: `${entries.length} écritures postées référencent cette facture; vérifier l’absence de double comptabilisation.`,
        date: invoice.createdAt.toISOString(),
      });
    }

    const vatByItem = invoice.items.reduce((sum, item) => {
      const baseHT = roundToMillimes(item.quantity * item.unitPrice);
      return sum + roundToMillimes(baseHT * item.taxRate / 100);
    }, 0);
    const vatByLedger = invoice.vatAccountCode
      ? entries.flatMap((entry) => entry.lines)
        .filter((line) => line.accountCode === invoice.vatAccountCode)
        .reduce((sum, line) => sum + line.credit - line.debit, 0)
      : null;
    if (millimes(vatByItem) !== millimes(invoice.taxAmount)
      || (vatByLedger !== null && millimes(invoice.taxAmount) !== millimes(vatByLedger))) {
      const ledgerDescription = vatByLedger === null
        ? 'compte TVA non historisé'
        : `compte ${invoice.vatAccountCode}`;
      anomalies.push({
        id: `invoice-vat:${invoice.invoiceNumber}`,
        severity: 'HIGH',
        category: 'SALES',
        reference: invoice.invoiceNumber,
        reason: `TVA facture/lignes/${ledgerDescription} non rapprochée (facture ${roundToMillimes(invoice.taxAmount).toFixed(3)}, lignes ${roundToMillimes(vatByItem).toFixed(3)}${vatByLedger === null ? '' : `, grand livre ${roundToMillimes(vatByLedger).toFixed(3)}`}).`,
        date: invoice.createdAt.toISOString(),
      });
    }
  }

  const payslipsByEmployeePeriod = new Map<string, PayslipSource[]>();
  for (const payslip of input.payslips) {
    const key = `${payslip.employeeId}:${payslip.period}`;
    const matching = payslipsByEmployeePeriod.get(key) ?? [];
    matching.push(payslip);
    payslipsByEmployeePeriod.set(key, matching);
  }
  for (const payslips of payslipsByEmployeePeriod.values()) {
    if (payslips.length < 2) continue;
    const employee = payslips[0].employee;
    anomalies.push({
      id: `duplicate-payslip:${payslips[0].employeeId}:${payslips[0].period}`,
      severity: 'HIGH',
      category: 'PAYROLL',
      reference: `${employee.firstName} ${employee.lastName} — ${payslips[0].period}`,
      reason: `${payslips.length} fiches de paie existent pour ce salarié et cette période.`,
      date: payslips.map((slip) => slip.createdAt).sort((a, b) => a.getTime() - b.getTime())[0].toISOString(),
    });
  }

  anomalies.sort((a, b) => {
    const severity = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
    return severity[a.severity] - severity[b.severity] || (a.date ?? '').localeCompare(b.date ?? '');
  });

  return {
    generatedAt: input.generatedAt.toISOString(),
    entityId: input.entityId,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    result: anomalies.length > 0 ? 'anomalies_found' : 'no_detected_anomalies',
    checkedAreas: [
      'Équilibre des écritures comptables postées',
      'Présence et multiplicité des écritures postées pour les factures émises/payées',
      'Rapprochement de la TVA facture/lignes/compte comptable enregistré sur la facture',
      'Doublons de fiches de paie salarié/période',
    ],
    unavailableChecks: [
      ...(input.limitedSources ?? []).map((source) => `${source} : scan limité à 10 000 enregistrements; une partie du périmètre n’a pas été vérifiée.`),
      ...(input.invoices.some((invoice) => !invoice.vatAccountCode)
        ? ['Rapprochement du grand livre TVA indisponible pour les factures historiques sans code de compte TVA enregistré.']
        : []),
      'Factures fournisseurs et justificatifs de TVA déductible : module/relations non disponibles dans les données actuelles.',
      'Rapprochement bancaire, encaissements et paiements effectifs : mouvements de trésorerie non persistés dans le schéma.',
      'Historique antérieur à la période affichée : non inclus dans ce contrôle.',
    ],
    anomalies,
  };
}
