import {
  FINANCIAL_ACCOUNT_CATEGORIES,
  financialCategoryMatchesAccountType,
  isFinancialAccountCategory,
  type FinancialAccountCategory,
} from './financial-categories';

type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

export interface AdvancedFinanceInputs {
  countryCode: string;
  currency: string;
  accounts: Array<{
    code: string;
    description?: string;
    type: string;
    financialCategory: string | null;
    isPostingAllowed?: boolean;
  }>;
  journalLines: Array<{
    accountCode: string;
    debit: number;
    credit: number;
    date: Date;
  }>;
  asOf?: Date;
}

type CategoryTotals = Record<FinancialAccountCategory, number>;
const CATEGORIES = Object.keys(FINANCIAL_ACCOUNT_CATEGORIES) as FinancialAccountCategory[];
const BALANCE_TYPES = new Set<AccountType>(['Asset', 'Liability', 'Equity']);
const INCOME_TYPES = new Set<AccountType>(['Revenue', 'Expense']);
const CURRENT_ASSET_CATEGORIES: FinancialAccountCategory[] = [
  'CASH_EQUIVALENT',
  'TRADE_RECEIVABLE',
  'INVENTORY',
  'OTHER_CURRENT_ASSET',
];
const CURRENT_LIABILITY_CATEGORIES: FinancialAccountCategory[] = [
  'TRADE_PAYABLE',
  'OTHER_CURRENT_LIABILITY',
];
const OPERATING_EXPENSE_CATEGORIES: FinancialAccountCategory[] = [
  'COST_OF_GOODS_SOLD',
  'PURCHASES',
  'OPERATING_EXPENSE',
];

function emptyTotals(): CategoryTotals {
  return Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as CategoryTotals;
}

function addSafe(target: CategoryTotals, category: FinancialAccountCategory, amount: number): boolean {
  const next = target[category] + amount;
  if (!Number.isSafeInteger(next)) return false;
  target[category] = next;
  return true;
}

function toMillimes(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const millimes = Math.round(value * 1000);
  return Number.isSafeInteger(millimes) && Math.abs(value * 1000 - millimes) <= 1e-7
    ? millimes
    : null;
}

function total(values: CategoryTotals, categories: readonly FinancialAccountCategory[]): number | null {
  let sum = 0;
  for (const category of categories) {
    sum += values[category];
    if (!Number.isSafeInteger(sum)) return null;
  }
  return sum;
}

function money(millimes: number | null): number | null {
  return millimes === null ? null : millimes / 1000;
}

function ratio(numerator: number | null, denominator: number | null, scale = 10_000): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return Math.round((numerator / denominator) * scale) / scale;
}

function daysRatio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || numerator < 0 || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 365);
}

function sumCategories(values: CategoryTotals, categories: readonly FinancialAccountCategory[]): number | null {
  return total(values, categories);
}

function combine(...values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) return null;
  const sum = (values as number[]).reduce((result, value) => result + value, 0);
  return Number.isSafeInteger(sum) ? sum : null;
}

function subtract(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null;
  const difference = left - right;
  return Number.isSafeInteger(difference) ? difference : null;
}

function ratioOfBalances(opening: number | null, closing: number | null): number | null {
  const total = combine(opening, closing);
  return total === null ? null : Math.round(total / 2);
}

export function calculateAdvancedFinancialAnalysis(input: AdvancedFinanceInputs) {
  const asOf = input.asOf ?? new Date();
  const periodStart = new Date(asOf);
  periodStart.setUTCDate(periodStart.getUTCDate() - 365);

  const accountByCode = new Map<string, {
    type: AccountType;
    category: FinancialAccountCategory | null;
    description: string;
  }>();
  const accountBalances = new Map<string, number>();
  const invalidBalanceAccountCodes = new Set<string>();
  const unclassifiedAccountCodes = new Set<string>();
  const invalidCategoryAccountCodes = new Set<string>();
  let postingAccountCount = 0;
  for (const account of input.accounts) {
    if (account.isPostingAllowed === false) continue;
    postingAccountCount += 1;
    const type = account.type as AccountType;
    const category = isFinancialAccountCategory(account.financialCategory)
      ? account.financialCategory
      : null;
    const categoryMatches = category !== null
      && financialCategoryMatchesAccountType(category, type);
    accountByCode.set(account.code, {
      type,
      category: categoryMatches ? category : null,
      description: account.description ?? account.code,
    });
    accountBalances.set(account.code, 0);
    if (!categoryMatches) {
      unclassifiedAccountCodes.add(account.code);
      if (category !== null) invalidCategoryAccountCodes.add(account.code);
    }
  }

  const closing = emptyTotals();
  const opening = emptyTotals();
  const period = emptyTotals();
  let cashInflowsMillimes = 0;
  let cashOutflowsMillimes = 0;
  let cashOpeningMillimes = 0;
  let cashFlowInvalid = false;
  let openingEquityMillimes = 0;
  let equityDebitMovementsMillimes = 0;
  let equityCreditMovementsMillimes = 0;
  let equityMovementsInvalid = false;
  let unclassifiedJournalLineCount = 0;
  let invalidJournalLineCount = 0;
  let datedJournalLineCount = 0;

  for (const line of input.journalLines) {
    const date = new Date(line.date.getTime());
    if (!Number.isFinite(date.getTime())) {
      invalidJournalLineCount += 1;
      continue;
    }
    if (date > asOf) continue;
    datedJournalLineCount += 1;

    const account = accountByCode.get(line.accountCode);
    if (!account || !account.category) {
      unclassifiedJournalLineCount += 1;
      continue;
    }
    const debit = toMillimes(line.debit);
    const credit = toMillimes(line.credit);
    if (debit === null || credit === null || (debit === 0 && credit === 0) || (debit > 0 && credit > 0)) {
      invalidJournalLineCount += 1;
      if (BALANCE_TYPES.has(account.type)) invalidBalanceAccountCodes.add(line.accountCode);
      if (account.category === 'CASH_EQUIVALENT') cashFlowInvalid = true;
      continue;
    }

    const isDebitNormal = account.type === 'Asset' || account.type === 'Expense';
    const movement = isDebitNormal ? debit - credit : credit - debit;
    if (!addSafe(closing, account.category, movement)) {
      invalidJournalLineCount += 1;
      if (BALANCE_TYPES.has(account.type)) invalidBalanceAccountCodes.add(line.accountCode);
      if (account.category === 'CASH_EQUIVALENT') cashFlowInvalid = true;
      continue;
    }
    if (BALANCE_TYPES.has(account.type)) {
      const accountBalance = accountBalances.get(line.accountCode)! + movement;
      if (Number.isSafeInteger(accountBalance)) accountBalances.set(line.accountCode, accountBalance);
      else {
        invalidJournalLineCount += 1;
        invalidBalanceAccountCodes.add(line.accountCode);
        if (account.category === 'CASH_EQUIVALENT') cashFlowInvalid = true;
        continue;
      }
    }
    if (date < periodStart) {
      if (!addSafe(opening, account.category, movement)) {
        invalidJournalLineCount += 1;
        if (account.category === 'CASH_EQUIVALENT') cashFlowInvalid = true;
        continue;
      }
      if (account.category === 'CASH_EQUIVALENT') {
        cashOpeningMillimes += debit - credit;
        if (!Number.isSafeInteger(cashOpeningMillimes)) cashFlowInvalid = true;
      }
      if (account.type === 'Equity') {
        openingEquityMillimes += credit - debit;
        if (!Number.isSafeInteger(openingEquityMillimes) && !equityMovementsInvalid) {
          equityMovementsInvalid = true;
          invalidJournalLineCount += 1;
          invalidBalanceAccountCodes.add(line.accountCode);
        }
      }
    } else {
      if (!addSafe(period, account.category, movement)) {
        invalidJournalLineCount += 1;
        if (account.category === 'CASH_EQUIVALENT') cashFlowInvalid = true;
        continue;
      }
      if (account.category === 'CASH_EQUIVALENT') {
        cashInflowsMillimes += debit;
        cashOutflowsMillimes += credit;
        if (!Number.isSafeInteger(cashInflowsMillimes) || !Number.isSafeInteger(cashOutflowsMillimes)) {
          cashFlowInvalid = true;
        }
      }
      if (account.type === 'Equity') {
        equityDebitMovementsMillimes += debit;
        equityCreditMovementsMillimes += credit;
        if (!Number.isSafeInteger(equityDebitMovementsMillimes)
          || !Number.isSafeInteger(equityCreditMovementsMillimes)) {
          if (!equityMovementsInvalid) {
            equityMovementsInvalid = true;
            invalidJournalLineCount += 1;
            invalidBalanceAccountCodes.add(line.accountCode);
          }
        }
      }
    }
  }

  const hasBalanceAccounts = input.accounts.some((account) =>
    account.isPostingAllowed !== false && BALANCE_TYPES.has(account.type as AccountType));
  const hasEquityAccounts = input.accounts.some((account) =>
    account.isPostingAllowed !== false && account.type === 'Equity');
  const hasIncomeAccounts = input.accounts.some((account) =>
    account.isPostingAllowed !== false && INCOME_TYPES.has(account.type as AccountType));
  const hasUnclassifiedBalanceAccount = input.accounts.some((account) =>
    account.isPostingAllowed !== false
    && BALANCE_TYPES.has(account.type as AccountType)
    && unclassifiedAccountCodes.has(account.code));
  const cashAccounts = input.accounts.filter((account) => account.isPostingAllowed !== false
    && account.financialCategory === 'CASH_EQUIVALENT');
  const hasUnclassifiedCashAccount = input.accounts.some((account) =>
    account.isPostingAllowed !== false
    && account.type === 'Asset'
    && unclassifiedAccountCodes.has(account.code));
  const hasUnclassifiedIncomeAccount = input.accounts.some((account) =>
    account.isPostingAllowed !== false
    && INCOME_TYPES.has(account.type as AccountType)
    && unclassifiedAccountCodes.has(account.code));
  const commonDataValid = invalidJournalLineCount === 0 && unclassifiedJournalLineCount === 0;
  const hasDatedSource = datedJournalLineCount > 0;
  const balanceSheetCoverageComplete = hasBalanceAccounts
    && !hasUnclassifiedBalanceAccount
    && commonDataValid
    && hasDatedSource;
  const incomeStatementAvailable = hasIncomeAccounts
    && !hasUnclassifiedIncomeAccount
    && commonDataValid
    && hasDatedSource;

  const revenue = period.REVENUE;
  const operatingRevenue = combine(period.REVENUE, period.OTHER_OPERATING_INCOME);
  const costOfGoodsSold = period.COST_OF_GOODS_SOLD;
  const grossProfit = subtract(revenue, costOfGoodsSold);
  const operatingCosts = sumCategories(period, OPERATING_EXPENSE_CATEGORIES);
  const ebitda = subtract(operatingRevenue, operatingCosts);
  const nonOperatingCosts = sumCategories(period, [
    'DEPRECIATION_AMORTIZATION',
    'INTEREST_EXPENSE',
    'INCOME_TAX_EXPENSE',
    'OTHER_EXPENSE',
  ]);
  const netIncome = nonOperatingCosts === null
    ? null
    : combine(ebitda, period.OTHER_INCOME, -nonOperatingCosts);

  const currentAssets = sumCategories(closing, CURRENT_ASSET_CATEGORIES);
  const currentLiabilities = sumCategories(closing, CURRENT_LIABILITY_CATEGORIES);
  const noncurrentAssets = closing.NONCURRENT_ASSET;
  const noncurrentLiabilities = closing.NONCURRENT_LIABILITY;
  const equity = incomeStatementAvailable ? combine(closing.EQUITY, netIncome) : closing.EQUITY;
  const equityStatementAvailable = hasEquityAccounts
    && balanceSheetCoverageComplete
    && incomeStatementAvailable
    && !equityMovementsInvalid;
  const totalAssets = combine(currentAssets, noncurrentAssets);
  const totalLiabilities = combine(currentLiabilities, noncurrentLiabilities);
  const liabilitiesAndEquity = combine(totalLiabilities, equity);
  const balanceDifference = subtract(totalAssets, liabilitiesAndEquity);
  const balanceSheetAvailable = balanceSheetCoverageComplete
    && totalAssets !== null
    && liabilitiesAndEquity !== null;
  const totalCurrentAssets = currentAssets;
  const totalCurrentLiabilities = currentLiabilities;
  const quickAssets = sumCategories(closing, [
    'CASH_EQUIVALENT',
    'TRADE_RECEIVABLE',
    'OTHER_CURRENT_ASSET',
  ]);
  const bfr = combine(
    closing.TRADE_RECEIVABLE,
    closing.INVENTORY,
    closing.OTHER_CURRENT_ASSET,
    -closing.TRADE_PAYABLE,
    -closing.OTHER_CURRENT_LIABILITY,
  );
  const permanentCapital = combine(equity, noncurrentLiabilities);
  const frng = subtract(permanentCapital, noncurrentAssets);
  const netTreasury = subtract(frng, bfr);
  const cashFlowAvailable = cashAccounts.length > 0
    && !hasUnclassifiedCashAccount
    && !cashFlowInvalid
    && unclassifiedJournalLineCount === 0
    && invalidJournalLineCount === 0
    && hasDatedSource;
  const netCashChange = cashInflowsMillimes - cashOutflowsMillimes;
  const closingCashMillimes = cashOpeningMillimes + netCashChange;

  const openingReceivables = opening.TRADE_RECEIVABLE;
  const closingReceivables = closing.TRADE_RECEIVABLE;
  const averageReceivables = ratioOfBalances(openingReceivables, closingReceivables);
  const trailingRevenue = period.REVENUE;
  const averageInventory = ratioOfBalances(opening.INVENTORY, closing.INVENTORY);
  const averagePayables = ratioOfBalances(opening.TRADE_PAYABLE, closing.TRADE_PAYABLE);
  const trailingCogs = period.COST_OF_GOODS_SOLD;
  const trailingPurchases = period.PURCHASES;
  const averageAssets = ratioOfBalances(
    combine(opening.NONCURRENT_ASSET, sumCategories(opening, CURRENT_ASSET_CATEGORIES)),
    totalAssets,
  );
  const averageEquity = ratioOfBalances(opening.EQUITY, equity);
  const ratiosAvailable = balanceSheetAvailable && incomeStatementAvailable && hasDatedSource;
  const balanceRatiosAvailable = balanceSheetAvailable && hasDatedSource;
  const profitabilityAvailable = incomeStatementAvailable && hasDatedSource;
  const availableBalanceSheet = balanceSheetAvailable;
  const availableIncomeStatement = incomeStatementAvailable;
  return {
    dateImputation: asOf.toISOString().slice(0, 10),
    countryCode: input.countryCode,
    currency: input.currency,
    periods: { start: periodStart.toISOString().slice(0, 10), end: asOf.toISOString().slice(0, 10), days: 365 },
    balanceSheet: {
      available: availableBalanceSheet,
      categories: {
        cash: money(hasUnclassifiedBalanceAccount ? null : closing.CASH_EQUIVALENT),
        tradeReceivables: money(hasUnclassifiedBalanceAccount ? null : closing.TRADE_RECEIVABLE),
        inventory: money(hasUnclassifiedBalanceAccount ? null : closing.INVENTORY),
        otherCurrentAssets: money(hasUnclassifiedBalanceAccount ? null : closing.OTHER_CURRENT_ASSET),
        noncurrentAssets: money(hasUnclassifiedBalanceAccount ? null : closing.NONCURRENT_ASSET),
        tradePayables: money(hasUnclassifiedBalanceAccount ? null : closing.TRADE_PAYABLE),
        otherCurrentLiabilities: money(hasUnclassifiedBalanceAccount ? null : closing.OTHER_CURRENT_LIABILITY),
        noncurrentLiabilities: money(hasUnclassifiedBalanceAccount ? null : closing.NONCURRENT_LIABILITY),
        equity: money(hasUnclassifiedBalanceAccount ? null : equity),
      },
      accounts: [...accountByCode.entries()]
        .filter(([, account]) => BALANCE_TYPES.has(account.type))
        .map(([code, account]) => ({
          code,
          description: account.description,
          type: account.type,
          financialCategory: account.category,
          balance: account.category === null || invalidBalanceAccountCodes.has(code)
            ? null
            : money(accountBalances.get(code) ?? 0),
        }))
        .sort((left, right) => left.type.localeCompare(right.type) || left.code.localeCompare(right.code)),
      currentAssets: money(availableBalanceSheet ? currentAssets : null),
      noncurrentAssets: money(availableBalanceSheet ? noncurrentAssets : null),
      totalAssets: money(availableBalanceSheet ? totalAssets : null),
      currentLiabilities: money(availableBalanceSheet ? currentLiabilities : null),
      noncurrentLiabilities: money(availableBalanceSheet ? noncurrentLiabilities : null),
      totalLiabilities: money(availableBalanceSheet ? totalLiabilities : null),
      equity: money(availableBalanceSheet ? equity : null),
      liabilitiesAndEquity: money(availableBalanceSheet ? liabilitiesAndEquity : null),
      balanceDifference: money(availableBalanceSheet ? balanceDifference : null),
      isBalanced: availableBalanceSheet && balanceDifference === 0,
    },
    cashFlowStatement: {
      available: cashFlowAvailable,
      periodStart: periodStart.toISOString().slice(0, 10),
      periodEnd: asOf.toISOString().slice(0, 10),
      openingCash: money(cashFlowAvailable ? cashOpeningMillimes : null),
      cashInflows: money(cashFlowAvailable ? cashInflowsMillimes : null),
      cashOutflows: money(cashFlowAvailable ? cashOutflowsMillimes : null),
      netCashChange: money(cashFlowAvailable ? netCashChange : null),
      closingCash: money(cashFlowAvailable ? closingCashMillimes : null),
      operatingFlows: null,
      investingFlows: null,
      financingFlows: null,
      classificationNote: 'La ventilation opérationnel / investissement / financement nécessite une classification vérifiée des contreparties; seuls les mouvements des comptes de trésorerie sont calculés.',
    },
    incomeStatement: {
      available: availableIncomeStatement,
      revenue: money(availableIncomeStatement ? revenue : null),
      costOfGoodsSold: money(availableIncomeStatement ? costOfGoodsSold : null),
      grossProfit: money(availableIncomeStatement ? grossProfit : null),
      ebitda: money(availableIncomeStatement ? ebitda : null),
      netIncome: money(availableIncomeStatement ? netIncome : null),
    },
    equityStatement: {
      available: equityStatementAvailable,
      periodStart: periodStart.toISOString().slice(0, 10),
      periodEnd: asOf.toISOString().slice(0, 10),
      openingEquity: money(equityStatementAvailable ? openingEquityMillimes : null),
      creditMovements: money(equityStatementAvailable ? equityCreditMovementsMillimes : null),
      debitMovements: money(equityStatementAvailable ? equityDebitMovementsMillimes : null),
      netIncome: money(equityStatementAvailable ? netIncome : null),
      closingEquity: money(equityStatementAvailable ? equity : null),
      note: 'Les mouvements au crédit et au débit sont des variations comptables nettes sur comptes de capitaux propres; leur nature (apport, distribution, reclassement) n’est pas inférée.',
    },
    aggregates: {
      stockValue: money(availableBalanceSheet ? closing.INVENTORY : null),
      clientReceivables: money(availableBalanceSheet ? closing.TRADE_RECEIVABLE : null),
      vendorDebts: money(availableBalanceSheet ? closing.TRADE_PAYABLE : null),
      bfr: money(availableBalanceSheet ? bfr : null),
      fixedAssets: money(availableBalanceSheet ? noncurrentAssets : null),
      permanentCapital: money(availableBalanceSheet ? permanentCapital : null),
      frng: money(availableBalanceSheet ? frng : null),
      netTreasury: money(availableBalanceSheet ? netTreasury : null),
    },
    ratios: {
      currentRatio: balanceRatiosAvailable ? ratio(totalCurrentAssets, totalCurrentLiabilities) : null,
      quickRatio: balanceRatiosAvailable ? ratio(quickAssets, totalCurrentLiabilities) : null,
      cashRatio: balanceRatiosAvailable ? ratio(closing.CASH_EQUIVALENT, totalCurrentLiabilities) : null,
      equityRatio: balanceRatiosAvailable ? ratio(equity, totalAssets) : null,
      debtRatio: balanceRatiosAvailable ? ratio(totalLiabilities, totalAssets) : null,
      grossMarginRate: profitabilityAvailable ? ratio(grossProfit, revenue) : null,
      netMarginRate: profitabilityAvailable ? ratio(netIncome, revenue) : null,
      roe: ratiosAvailable ? ratio(netIncome, averageEquity) : null,
      roa: ratiosAvailable ? ratio(netIncome, averageAssets) : null,
      dsoDays: ratiosAvailable
        ? daysRatio(averageReceivables, trailingRevenue)
        : null,
      dioDays: ratiosAvailable
        ? daysRatio(averageInventory, trailingCogs)
        : null,
      dpoDays: ratiosAvailable
        ? daysRatio(averagePayables, trailingPurchases)
        : null,
      cashConversionCycle: ratiosAvailable
        ? (() => {
          const dio = daysRatio(averageInventory, trailingCogs);
          const dso = daysRatio(averageReceivables, trailingRevenue);
          const dpo = daysRatio(averagePayables, trailingPurchases);
          return dio === null || dso === null || dpo === null ? null : dio + dso - dpo;
        })()
        : null,
      ebitda: availableIncomeStatement ? money(ebitda) : null,
    },
    evaluation: {
      healthStatus: balanceSheetAvailable && incomeStatementAvailable ? 'UNVERIFIED' : 'INSUFFICIENT_DATA',
      diagnostic: !postingAccountCount
        ? 'Aucun compte comptabilisable n’est disponible pour l’analyse.'
        : !hasDatedSource
          ? 'Aucune écriture POSTED n’est disponible à la date d’arrêté.'
        : unclassifiedAccountCodes.size
          ? 'Les états et ratios restent indisponibles tant que les comptes comptabilisables ne sont pas classés.'
          : invalidJournalLineCount || unclassifiedJournalLineCount
            ? 'Les états et ratios sont indisponibles en raison d’écritures invalides ou de comptes non reconnus.'
              : balanceDifference !== 0
                ? `La balance actifs/passifs/capitaux propres présente un écart de ${(balanceDifference ?? 0) / 1000}; rapprocher les écritures avant d’interpréter les ratios provisoires.`
                : 'Calculs issus du grand livre POSTED; la présence des soldes d’ouverture et le rapprochement de clôture restent à confirmer.',
      recommendations: !postingAccountCount
        ? ['Configurer le plan comptable avant de lancer une analyse.']
        : unclassifiedAccountCodes.size
          ? ['Attribuer une catégorie financière vérifiée à chaque compte comptabilisable dans la configuration du plan comptable.']
          : ['Rapprocher le grand livre et confirmer les soldes d’ouverture/clôture avant de prendre une décision.'],
    },
    coverage: {
      postingAccountCount,
      classifiedPostingAccountCount: postingAccountCount - unclassifiedAccountCodes.size,
      unclassifiedAccountCodes: [...unclassifiedAccountCodes].sort(),
      invalidCategoryAccountCodes: [...invalidCategoryAccountCodes].sort(),
      unclassifiedJournalLineCount,
      invalidJournalLineCount,
      postedJournalLineCount: input.journalLines.length,
      datedJournalLineCount,
      balanceSheetAvailable,
      incomeStatementAvailable,
      ratiosAvailable,
      balanceDifference: money(balanceSheetAvailable ? balanceDifference : null),
    },
    limitations: [
      'Les catégories financières doivent être affectées et vérifiées par un responsable comptable; elles ne sont jamais déduites des codes de compte.',
      'Les ratios supposent que le grand livre contient les soldes d’ouverture ou tout l’historique, et que les écritures sont rapprochées; SAFE ne certifie pas ces prérequis.',
      'DSO/DIO/DPO utilisent des soldes moyens entre le début et la fin des 365 jours, en devise fonctionnelle; DPO requiert une catégorie Achats distincte.',
      'Les états sont des agrégats comptables généraux et ne constituent pas une liasse réglementaire ni un avis professionnel.',
      'Les montants sont stockés en Float dans le schéma actuel; le calcul arrondit et contrôle le millime, mais cela ne remplace pas une migration complète vers des types décimaux.',
    ],
  };
}
