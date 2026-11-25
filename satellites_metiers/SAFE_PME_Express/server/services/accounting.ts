// â”€â”€ SERVICE : comptabilitÃ© en partie double â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Couche mÃ©tier distincte (MVC : ce fichier = Service, routers = Controller,
// pages React = View). Toute Ã©criture gÃ©nÃ©rÃ©e ici est Ã©quilibrÃ©e par
// construction : dÃ©bit total = crÃ©dit total, sinon elle est refusÃ©e.
//
// Plan comptable tunisien (SYSCOHADA / norme tunisienne) utilisÃ© :
//   411  Clients                         701  Ventes de marchandises
//   401  Fournisseurs                    607  Achats de marchandises
//   436  TVA collectÃ©e                   445  TVA dÃ©ductible
//   421  Personnel â€” rÃ©munÃ©rations dues  431  CNSS
//   447  ImpÃ´ts sur les salaires (IRPP)  448  Ã‰tat â€” autres impÃ´ts
//   532  Banque                          571  Caisse
//   2231 MatÃ©riel                        681  Dotations aux amortissements
//   12   RÃ©sultat de l'exercice          101  Capital social
import { createJournalEntry } from "../db";

export type JournalLine = { accountCode: string; accountLabel: string; debit: number; credit: number };

export const ACCOUNT_LABELS: Record<string, string> = {
  "101": "Capital social",
  "106": "RÃ©serves",
  "12": "RÃ©sultat de l'exercice",
  "2231": "MatÃ©riel",
  "281": "Amortissements des immobilisations",
  "401": "Fournisseurs",
  "411": "Clients",
  "421": "Personnel â€” rÃ©munÃ©rations dues",
  "431": "CNSS",
  "436": "TVA collectÃ©e",
  "445": "TVA dÃ©ductible",
  "447": "ImpÃ´ts sur les salaires (IRPP)",
  "448": "Ã‰tat â€” autres impÃ´ts et taxes",
  "532": "Banque",
  "571": "Caisse",
  "601": "Achats de marchandises",
  "607": "Achats de marchandises",
  "641": "Charges de personnel",
  "645": "Charges sociales patronales",
  "681": "Dotations aux amortissements",
  "701": "Ventes de marchandises",
  "706": "Prestations de services",
};

export function label(code: string): string {
  return ACCOUNT_LABELS[code] ?? "";
}

/** VÃ©rifie l'Ã©quilibre d'une Ã©criture. */
export function isBalanced(lines: JournalLine[]): boolean {
  const d = lines.reduce((s, l) => s + l.debit, 0);
  const c = lines.reduce((s, l) => s + l.credit, 0);
  return d === c && d > 0;
}

/**
 * Ã‰criture d'une facture de vente validÃ©e :
 *   411 Clients (TTC)  au dÃ©bit
 *   701 Ventes (HT) + 436 TVA collectÃ©e + 448 timbre  au crÃ©dit
 */
export async function postSalesInvoice(
  ownerId: string,
  inv: {
    id: string;
    number: string;
    issueDate: string;
    partnerName: string;
    totalHt: number;
    totalVat: number;
    stampDuty: number;
    totalTtc: number;
  },
) {
  const lines: JournalLine[] = [
    { accountCode: "411", accountLabel: label("411"), debit: inv.totalTtc, credit: 0 },
    { accountCode: "701", accountLabel: label("701"), debit: 0, credit: inv.totalHt },
  ];
  if (inv.totalVat > 0) lines.push({ accountCode: "436", accountLabel: label("436"), debit: 0, credit: inv.totalVat });
  if (inv.stampDuty > 0) lines.push({ accountCode: "448", accountLabel: label("448"), debit: 0, credit: inv.stampDuty });

  if (!isBalanced(lines)) throw new Error("Ã‰criture de vente dÃ©sÃ©quilibrÃ©e.");
  return createJournalEntry(ownerId, {
    entryDate: inv.issueDate,
    journal: "VE",
    reference: inv.number,
    label: `Facture ${inv.number} â€” ${inv.partnerName}`,
    source: "facture",
    sourceId: inv.id,
    lines,
  });
}

/**
 * Ã‰criture d'une facture d'achat validÃ©e :
 *   607 Achats (HT) + 445 TVA dÃ©ductible  au dÃ©bit
 *   401 Fournisseurs (TTC)                au crÃ©dit
 */
export async function postPurchaseBill(
  ownerId: string,
  bill: {
    id: string;
    number: string;
    issueDate: string;
    partnerName: string;
    totalHt: number;
    totalVat: number;
    totalTtc: number;
  },
) {
  const lines: JournalLine[] = [
    { accountCode: "607", accountLabel: label("607"), debit: bill.totalHt, credit: 0 },
  ];
  if (bill.totalVat > 0) lines.push({ accountCode: "445", accountLabel: label("445"), debit: bill.totalVat, credit: 0 });
  lines.push({ accountCode: "401", accountLabel: label("401"), debit: 0, credit: bill.totalTtc });

  if (!isBalanced(lines)) throw new Error("Ã‰criture d'achat dÃ©sÃ©quilibrÃ©e.");
  return createJournalEntry(ownerId, {
    entryDate: bill.issueDate,
    journal: "AC",
    reference: bill.number,
    label: `Achat ${bill.number} â€” ${bill.partnerName}`,
    source: "achat",
    sourceId: bill.id,
    lines,
  });
}

/**
 * Ã‰criture de paie d'un cycle :
 *   641 Charges de personnel (brut) + 645 Charges patronales  au dÃ©bit
 *   421 Net Ã  payer + 431 CNSS (salariÃ© + employeur) + 447 IRPP + 448 CSS  au crÃ©dit
 */
export async function postPayrollRun(
  ownerId: string,
  run: {
    id: string;
    period: string;
    totalGross: number;
    totalCnssEmployee: number;
    totalCnssEmployer: number;
    totalCss: number;
    totalIrpp: number;
    totalNet: number;
  },
) {
  const employerCharges = run.totalCnssEmployer;
  const lines: JournalLine[] = [
    { accountCode: "641", accountLabel: label("641"), debit: run.totalGross, credit: 0 },
  ];
  if (employerCharges > 0) lines.push({ accountCode: "645", accountLabel: label("645"), debit: employerCharges, credit: 0 });
  lines.push({ accountCode: "421", accountLabel: label("421"), debit: 0, credit: run.totalNet });
  const cnssTotal = run.totalCnssEmployee + run.totalCnssEmployer;
  if (cnssTotal > 0) lines.push({ accountCode: "431", accountLabel: label("431"), debit: 0, credit: cnssTotal });
  if (run.totalIrpp > 0) lines.push({ accountCode: "447", accountLabel: label("447"), debit: 0, credit: run.totalIrpp });
  if (run.totalCss > 0) lines.push({ accountCode: "448", accountLabel: label("448"), debit: 0, credit: run.totalCss });

  if (!isBalanced(lines)) throw new Error("Ã‰criture de paie dÃ©sÃ©quilibrÃ©e.");
  return createJournalEntry(ownerId, {
    entryDate: `${run.period}-28`,
    journal: "PA",
    reference: run.period,
    label: `Paie ${run.period}`,
    source: "paie",
    sourceId: run.id,
    lines,
  });
}

/** Ã‰criture d'un encaissement client (banque). */
export async function postReceipt(
  ownerId: string,
  input: { date: string; reference: string; label: string; amount: number; accountCode?: string },
) {
  const lines: JournalLine[] = [
    { accountCode: input.accountCode ?? "532", accountLabel: label(input.accountCode ?? "532"), debit: input.amount, credit: 0 },
    { accountCode: "411", accountLabel: label("411"), debit: 0, credit: input.amount },
  ];
  if (!isBalanced(lines)) throw new Error("Ã‰criture d'encaissement dÃ©sÃ©quilibrÃ©e.");
  return createJournalEntry(ownerId, {
    entryDate: input.date,
    journal: "BQ",
    reference: input.reference,
    label: input.label,
    source: "manuel",
    lines,
  });
}

/** Ã‰criture d'un dÃ©caissement fournisseur. */
export async function postPayment(
  ownerId: string,
  input: { date: string; reference: string; label: string; amount: number; accountCode?: string },
) {
  const lines: JournalLine[] = [
    { accountCode: "401", accountLabel: label("401"), debit: input.amount, credit: 0 },
    { accountCode: input.accountCode ?? "532", accountLabel: label(input.accountCode ?? "532"), debit: 0, credit: input.amount },
  ];
  if (!isBalanced(lines)) throw new Error("Ã‰criture de dÃ©caissement dÃ©sÃ©quilibrÃ©e.");
  return createJournalEntry(ownerId, {
    entryDate: input.date,
    journal: "BQ",
    reference: input.reference,
    label: input.label,
    source: "manuel",
    lines,
  });
}
