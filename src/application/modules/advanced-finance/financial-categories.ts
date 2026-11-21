export const FINANCIAL_ACCOUNT_CATEGORIES = {
  CASH_EQUIVALENT: { accountType: 'Asset', label: 'Trésorerie et équivalents' },
  TRADE_RECEIVABLE: { accountType: 'Asset', label: 'Créances clients' },
  INVENTORY: { accountType: 'Asset', label: 'Stocks' },
  OTHER_CURRENT_ASSET: { accountType: 'Asset', label: 'Autres actifs courants' },
  NONCURRENT_ASSET: { accountType: 'Asset', label: 'Actifs non courants' },
  TRADE_PAYABLE: { accountType: 'Liability', label: 'Dettes fournisseurs' },
  OTHER_CURRENT_LIABILITY: { accountType: 'Liability', label: 'Autres passifs courants' },
  NONCURRENT_LIABILITY: { accountType: 'Liability', label: 'Passifs non courants' },
  EQUITY: { accountType: 'Equity', label: 'Capitaux propres' },
  REVENUE: { accountType: 'Revenue', label: 'Produits d’exploitation' },
  OTHER_OPERATING_INCOME: { accountType: 'Revenue', label: 'Autres produits d’exploitation' },
  OTHER_INCOME: { accountType: 'Revenue', label: 'Autres produits' },
  FINANCIAL_INCOME: { accountType: 'Revenue', label: 'Produits financiers' },
  EXCEPTIONAL_INCOME: { accountType: 'Revenue', label: 'Produits exceptionnels' },
  COST_OF_GOODS_SOLD: { accountType: 'Expense', label: 'Coût des ventes' },
  PURCHASES: { accountType: 'Expense', label: 'Achats utilisés pour le délai fournisseurs' },
  OPERATING_EXPENSE: { accountType: 'Expense', label: 'Charges d’exploitation' },
  DEPRECIATION_AMORTIZATION: { accountType: 'Expense', label: 'Dotations aux amortissements' },
  INTEREST_EXPENSE: { accountType: 'Expense', label: 'Charges financières' },
  INCOME_TAX_EXPENSE: { accountType: 'Expense', label: 'Impôts sur le résultat' },
  EXCEPTIONAL_EXPENSE: { accountType: 'Expense', label: 'Charges exceptionnelles' },
  OTHER_EXPENSE: { accountType: 'Expense', label: 'Autres charges' },
} as const;

export type FinancialAccountCategory = keyof typeof FINANCIAL_ACCOUNT_CATEGORIES;
export type FinancialAccountType = (typeof FINANCIAL_ACCOUNT_CATEGORIES)[FinancialAccountCategory]['accountType'];

export const TUNISIAN_ACCOUNT_FINANCIAL_CATEGORIES: Readonly<Record<string, FinancialAccountCategory>> = {
  '101': 'EQUITY',
  '111': 'EQUITY',
  '120': 'EQUITY',
  '218': 'NONCURRENT_ASSET',
  '221': 'NONCURRENT_ASSET',
  '281': 'NONCURRENT_ASSET',
  '311': 'INVENTORY',
  '370': 'INVENTORY',
  '401': 'TRADE_PAYABLE',
  '411': 'TRADE_RECEIVABLE',
  '432': 'OTHER_CURRENT_LIABILITY',
  '434': 'OTHER_CURRENT_LIABILITY',
  '4366': 'OTHER_CURRENT_ASSET',
  '4367': 'OTHER_CURRENT_LIABILITY',
  '438': 'OTHER_CURRENT_LIABILITY',
  '532': 'CASH_EQUIVALENT',
  '540': 'CASH_EQUIVALENT',
  '601': 'PURCHASES',
  '607': 'PURCHASES',
  '640': 'OPERATING_EXPENSE',
  '647': 'OPERATING_EXPENSE',
  '661': 'INTEREST_EXPENSE',
  '701': 'REVENUE',
  '707': 'REVENUE',
  '716': 'REVENUE',
};

export const TUNISIAN_ACCOUNT_CLASSIFICATION_REVIEW: Readonly<Record<string, string>> = {
  '33': 'En-cours de production : confirmer le traitement du compte de développement avant classement.',
  '603': 'Variation des stocks : confirmer son traitement dans le coût des ventes avant classement.',
};

export function isFinancialAccountCategory(value: unknown): value is FinancialAccountCategory {
  return typeof value === 'string' && Object.hasOwn(FINANCIAL_ACCOUNT_CATEGORIES, value);
}

export function financialCategoryMatchesAccountType(
  category: FinancialAccountCategory,
  accountType: string,
): boolean {
  const normType = (accountType || '').toLowerCase();
  const catType = FINANCIAL_ACCOUNT_CATEGORIES[category].accountType.toLowerCase();
  if (catType === normType) return true;
  // Contra-assets, amortissements, provisions and partner advances
  if ((category === 'NONCURRENT_ASSET' || category === 'INVENTORY') && normType === 'liability') return true;
  if ((category === 'TRADE_PAYABLE' || category === 'OTHER_CURRENT_LIABILITY') && normType === 'asset') return true;
  if (category === 'TRADE_RECEIVABLE' && normType === 'liability') return true;
  return false;
}
