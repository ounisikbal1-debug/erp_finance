import { randomUUID } from 'node:crypto';
import { validateJournalEntry } from '../finance/journal-validation';
import { toStockQuantityMilliUnits } from './quantity';

export interface StockAccountMapping {
  stockAssetAccountCode: string | null;
  stockAdjustmentAccountCode: string | null;
  productionWipAccountCode: string | null;
  productionLaborAccountCode?: string | null;
  productionOverheadAccountCode?: string | null;
}

export interface StockAccount {
  code: string;
  type: string;
  isPostingAllowed?: boolean;
}

export type StockPostingPurpose = 'adjustment' | 'production';

export function getStockPostingConfigurationIssues(
  countryCode: string,
  mapping: StockAccountMapping,
  accounts: readonly StockAccount[],
  purpose: StockPostingPurpose,
  productionCosts: { labor: boolean; overhead: boolean } = { labor: false, overhead: false },
): string[] {
  const issues: string[] = [];
  if (!countryCode.trim()) issues.push('code pays');

  const expectedAccounts: Array<[string, string, string | null]> = purpose === 'adjustment'
    ? [
      ['compte de stock', 'Asset', mapping.stockAssetAccountCode],
      ['compte d’ajustement de stock', 'Expense', mapping.stockAdjustmentAccountCode],
    ]
    : [
      ['compte de stock', 'Asset', mapping.stockAssetAccountCode],
      ['compte de production en cours', 'Asset', mapping.productionWipAccountCode],
      ...(productionCosts.labor
        ? [['compte de contrepartie de main-d’Å“uvre', 'Expense', mapping.productionLaborAccountCode ?? null] as [string, string, string | null]]
        : []),
      ...(productionCosts.overhead
        ? [['compte de contrepartie des frais indirects', 'Expense', mapping.productionOverheadAccountCode ?? null] as [string, string, string | null]]
        : []),
    ];
  const accountsByCode = new Map(accounts.map((account) => [account.code, account]));
  const invalidAccounts = expectedAccounts
    .filter(([, expectedType, code]) => {
      if (!code?.trim()) return true;
      const account = accountsByCode.get(code.trim());
      return account?.type !== expectedType || account.isPostingAllowed === false;
    })
    .map(([role, expectedType, code]) => `${role}${code ? ` ${code}` : ''} (${expectedType})`);
  if (invalidAccounts.length > 0) {
    issues.push(`comptes de ${purpose === 'adjustment' ? 'mouvement' : 'production'} configurés dans le plan comptable du pays (${invalidAccounts.join(', ')})`);
  }
  const resolvedCodes = expectedAccounts.map(([, , code]) => code?.trim()).filter((code): code is string => Boolean(code));
  if (new Set(resolvedCodes).size !== resolvedCodes.length) {
    issues.push('comptes distincts pour le stock et sa contrepartie');
  }
  return issues;
}

export function stockValueMillimes(quantity: number, unitCost: number): number {
  const millimes = stockInventoryValueMillimes(quantity, unitCost);
  if (millimes <= 0) {
    throw new Error('Un coût de revient positif et représentable à la précision comptable au millime est requis pour comptabiliser un mouvement de stock.');
  }
  return millimes;
}

export function stockInventoryValueMillimes(quantity: number, unitCost: number): number {
  const quantityMilliUnits = toStockQuantityMilliUnits(quantity);
  if (quantityMilliUnits === null || !Number.isFinite(unitCost) || unitCost < 0) {
    throw new Error('La quantité et le coût doivent permettre un calcul de stock valide.');
  }
  const unroundedValueMillimes = quantityMilliUnits * unitCost;
  const millimes = Math.round(unroundedValueMillimes);
  if (!Number.isSafeInteger(millimes)) {
    throw new Error('La valeur du stock dépasse la précision comptable au millime.');
  }
  return millimes;
}

export function buildStockJournalEntryData(input: {
  entityId: string;
  date: Date;
  reference: string;
  description: string;
  lines: Array<{
    accountCode: string;
    debit: number;
    credit: number;
    description: string;
  }>;
}) {
  const validated = validateJournalEntry({
    entryNumber: `STK-${randomUUID()}`,
    entityId: input.entityId,
    date: input.date.toISOString().slice(0, 10),
    reference: input.reference,
    description: input.description,
    lines: input.lines,
  });
  return {
    entryNumber: validated.entryNumber,
    entityId: validated.entityId,
    date: input.date,
    reference: validated.reference,
    description: validated.description,
    status: 'POSTED',
    lines: {
      create: validated.lines.map(({ accountCode, debit, credit, description }) => ({
        accountCode,
        debit,
        credit,
        description,
      })),
    },
  };
}
