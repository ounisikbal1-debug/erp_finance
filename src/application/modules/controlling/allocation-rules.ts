import type { Prisma } from "@prisma/client";

export interface AnalyticalPostingLine {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
  costCenterCode?: string | null;
}

export class AnalyticalAllocationError extends Error {
  constructor(message: string) { super(message); this.name = "AnalyticalAllocationError"; }
}

/** Splits only configured P&L lines; balances, tax and third-party lines remain unchanged. */
export async function applyAnalyticalAllocationRules<T extends AnalyticalPostingLine>(
  tx: Prisma.TransactionClient,
  entityId: string,
  countryCode: string,
  documentType: "PURCHASE" | "SALE",
  invoiceNature: string,
  lines: readonly T[],
): Promise<T[]> {
  const accountCodes = [...new Set(lines.filter((line) => line.debit > 0 || line.credit > 0).map((line) => line.accountCode))];
  if (accountCodes.length === 0 || !tx.analyticalAllocationRule?.findMany) return [...lines];
  const rules = await tx.analyticalAllocationRule.findMany({
    where: { entityId, countryCode, documentType, accountCode: { in: accountCodes }, isActive: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  if (rules.length === 0) return [...lines];
  const normalizedNature = invoiceNature.normalize("NFKC").toLocaleLowerCase("fr-FR");
  const output: T[] = [];
  for (const line of lines) {
    if (line.costCenterCode || (line.debit <= 0 && line.credit <= 0)) { output.push(line); continue; }
    const matches = rules.filter((rule) => rule.accountCode === line.accountCode
      && (rule.naturePattern.trim() === "*" || normalizedNature.includes(rule.naturePattern.normalize("NFKC").toLocaleLowerCase("fr-FR"))));
    if (matches.length === 0) { output.push(line); continue; }
    const priority = matches[0].priority;
    const selected = matches.filter((rule) => rule.priority === priority);
    const totalPct = selected.reduce((sum, rule) => sum + rule.percentage, 0);
    if (totalPct > 100.000001) throw new AnalyticalAllocationError(`Les règles analytiques actives pour le compte ${line.accountCode} dépassent 100 %.`);
    const amount = line.debit > 0 ? line.debit : line.credit;
    let allocated = 0;
    selected.forEach((rule, index) => {
      const share = index === selected.length - 1 && Math.abs(totalPct - 100) < 0.000001
        ? Math.round((amount - allocated) * 1000) / 1000
        : Math.round(amount * rule.percentage / 100 * 1000) / 1000;
      allocated += share;
      output.push({ ...line, debit: line.debit > 0 ? share : 0, credit: line.credit > 0 ? share : 0, costCenterCode: rule.costCenterCode });
    });
    const residual = Math.round((amount - allocated) * 1000) / 1000;
    if (residual > 0) output.push({ ...line, debit: line.debit > 0 ? residual : 0, credit: line.credit > 0 ? residual : 0, costCenterCode: null });
  }
  return output;
}
