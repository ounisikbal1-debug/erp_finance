export interface IncomeStatementAccount {
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  movement: number | null;
  financialCategory?: string | null;
}

export interface IncomeStatementLine {
  section: string;
  label: string;
  amount: number | null;
  percentageOfRevenue: number | null;
  notes: string;
}

function sumCategory(
  accounts: readonly IncomeStatementAccount[],
  category: string,
): number | null {
  const categorized = accounts.filter((account) => account.financialCategory === category);
  if (categorized.some((account) => account.movement === null)) return null;
  return categorized.reduce((sum, account) => sum + (account.movement ?? 0), 0);
}

function percentOfRevenue(amount: number | null, revenue: number | null): number | null {
  return amount === null || revenue === null || revenue === 0 ? null : (amount / revenue) * 100;
}

export function buildIncomeStatementLines(input: {
  accounts: readonly IncomeStatementAccount[];
  revenue: number | null;
  expenses: number | null;
  taxRatePercent: number | null;
}): IncomeStatementLine[] {
  const { accounts, revenue, expenses, taxRatePercent } = input;
  const financeIncome = sumCategory(accounts, 'FINANCIAL_INCOME');
  const exceptionalIncome = sumCategory(accounts, 'EXCEPTIONAL_INCOME');
  const interestExpense = sumCategory(accounts, 'INTEREST_EXPENSE');
  const exceptionalExpense = sumCategory(accounts, 'EXCEPTIONAL_EXPENSE');
  const incomeTaxExpense = sumCategory(accounts, 'INCOME_TAX_EXPENSE');
  const operatingRevenue = revenue === null || financeIncome === null || exceptionalIncome === null
    ? null
    : revenue - financeIncome - exceptionalIncome;
  const operatingExpenses = expenses === null
    ? null
    : interestExpense === null || exceptionalExpense === null || incomeTaxExpense === null
      ? null
      : expenses - interestExpense - exceptionalExpense - incomeTaxExpense;
  const operatingResult = operatingRevenue === null || operatingExpenses === null
    ? null
    : operatingRevenue - operatingExpenses;
  const financialResult = financeIncome === null || interestExpense === null ? null : financeIncome - interestExpense;
  const currentResult = operatingResult === null ? null : operatingResult + financialResult;
  const exceptionalResult = exceptionalIncome === null || exceptionalExpense === null
    ? null
    : exceptionalIncome - exceptionalExpense;
  const resultBeforeTax = currentResult === null ? null : currentResult + exceptionalResult;
  const postedTaxAccounts = accounts.filter((account) => account.financialCategory === 'INCOME_TAX_EXPENSE');
  const postedTaxAmount = postedTaxAccounts.some((account) => account.movement !== 0)
    ? incomeTaxExpense
    : null;
  const taxAmount = postedTaxAmount !== null
    ? postedTaxAmount
    : resultBeforeTax === null || taxRatePercent === null
    ? null
    : Math.max(resultBeforeTax, 0) * taxRatePercent / 100;
  const netResult = resultBeforeTax === null || taxAmount === null ? null : resultBeforeTax - taxAmount;
  const periodResult = revenue === null || expenses === null ? null : revenue - expenses;
  const unclassifiedRevenueCount = accounts.filter((account) =>
    account.type === 'Revenue' && !account.financialCategory && account.movement !== 0).length;
  const unclassifiedExpenseCount = accounts.filter((account) =>
    account.type === 'Expense' && !account.financialCategory && account.movement !== 0).length;
  const categoryNote = (category: string, unclassifiedCount: number) =>
    `Aucun mouvement POSTED classé ${category}.${unclassifiedCount > 0
      ? ` ${unclassifiedCount} compte(s) du type concerné sans rubrique explicite sont à vérifier dans la configuration du plan comptable SAFE.`
      : ''}`;
  const lines: IncomeStatementLine[] = [
    { section: 'Produits d’exploitation', label: 'Produits comptabilisés (type Revenue)', amount: revenue, percentageOfRevenue: percentOfRevenue(revenue, revenue), notes: 'Total des mouvements nets POSTED des comptes SAFE de type Revenue.' },
    { section: 'Produits d’exploitation', label: 'Total produits d’exploitation', amount: operatingRevenue, percentageOfRevenue: percentOfRevenue(operatingRevenue, revenue), notes: `Produits Revenue, hors comptes explicitement classés financiers ou exceptionnels.${unclassifiedRevenueCount > 0 ? ` ${unclassifiedRevenueCount} compte(s) non classé(s) restent inclus dans le résiduel d’exploitation; à vérifier.` : ''}` },
    { section: 'Charges d’exploitation', label: 'Total charges d’exploitation', amount: operatingExpenses, percentageOfRevenue: percentOfRevenue(operatingExpenses, revenue), notes: `Charges Expense, hors comptes explicitement classés financiers, exceptionnels ou impôt sur le résultat.${unclassifiedExpenseCount > 0 ? ` ${unclassifiedExpenseCount} compte(s) non classé(s) restent inclus dans le résiduel d’exploitation; à vérifier.` : ''}` },
    { section: 'Résultat d’exploitation', label: 'Résultat d’exploitation', amount: operatingResult, percentageOfRevenue: percentOfRevenue(operatingResult, revenue), notes: 'Produits d’exploitation moins charges d’exploitation.' },
    { section: 'Produits financiers', label: 'Produits financiers', amount: financeIncome, percentageOfRevenue: percentOfRevenue(financeIncome, revenue), notes: financeIncome === 0 ? categoryNote('FINANCIAL_INCOME', unclassifiedRevenueCount) : 'Somme des comptes Revenue classés FINANCIAL_INCOME.' },
    { section: 'Charges financières', label: 'Intérêts et charges assimilées', amount: interestExpense, percentageOfRevenue: percentOfRevenue(interestExpense, revenue), notes: interestExpense === 0 ? categoryNote('INTEREST_EXPENSE', unclassifiedExpenseCount) : 'Somme des comptes Expense classés INTEREST_EXPENSE.' },
    { section: 'Résultat financier', label: 'Résultat financier', amount: financialResult, percentageOfRevenue: percentOfRevenue(financialResult, revenue), notes: 'Produits financiers moins charges financières.' },
    { section: 'Résultat courant avant impôts', label: 'Résultat courant avant impôts', amount: currentResult, percentageOfRevenue: percentOfRevenue(currentResult, revenue), notes: 'Résultat d’exploitation plus résultat financier.' },
    { section: 'Résultat exceptionnel', label: 'Produits exceptionnels', amount: exceptionalIncome, percentageOfRevenue: percentOfRevenue(exceptionalIncome, revenue), notes: exceptionalIncome === 0 ? categoryNote('EXCEPTIONAL_INCOME', unclassifiedRevenueCount) : 'Somme des comptes Revenue classés EXCEPTIONAL_INCOME.' },
    { section: 'Résultat exceptionnel', label: 'Charges exceptionnelles', amount: exceptionalExpense, percentageOfRevenue: percentOfRevenue(exceptionalExpense, revenue), notes: exceptionalExpense === 0 ? categoryNote('EXCEPTIONAL_EXPENSE', unclassifiedExpenseCount) : 'Somme des comptes Expense classés EXCEPTIONAL_EXPENSE.' },
    { section: 'Résultat exceptionnel', label: 'Résultat exceptionnel', amount: exceptionalResult, percentageOfRevenue: percentOfRevenue(exceptionalResult, revenue), notes: 'Produits exceptionnels moins charges exceptionnelles.' },
    { section: 'Impôt sur les bénéfices', label: 'Impôt sur le résultat', amount: taxAmount, percentageOfRevenue: percentOfRevenue(taxAmount, revenue), notes: postedTaxAmount !== null ? 'Montant POSTED des comptes Expense classés INCOME_TAX_EXPENSE.' : taxRatePercent === null ? 'Taux fiscal du pays indisponible; montant non calculé.' : `Estimation indicative au taux société configuré de ${taxRatePercent} %; non certifiée.` },
    { section: 'Résultat net', label: 'Résultat net estimatif', amount: netResult, percentageOfRevenue: percentOfRevenue(netResult, revenue), notes: 'Résultat courant avant impôts, résultat exceptionnel et impôt estimatif.' },
    { section: 'Repère SAFE', label: 'Résultat comptable de période (produits − charges)', amount: periodResult, percentageOfRevenue: percentOfRevenue(periodResult, revenue), notes: 'Calcul direct des totaux Revenue moins Expense; ne remplace pas le résultat net estimatif ci-dessus.' },
  ];
  return lines;
}
