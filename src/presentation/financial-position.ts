export interface FinancialPositionSummary {
  dateImputation: string;
  countryCode: string;
  currency: string;
  balanceSheet: {
    available: boolean;
    categories: {
      cash: number | null;
      tradeReceivables: number | null;
      inventory: number | null;
      otherCurrentAssets: number | null;
      noncurrentAssets: number | null;
      tradePayables: number | null;
      otherCurrentLiabilities: number | null;
      noncurrentLiabilities: number | null;
      equity: number | null;
    };
    accounts?: Array<{
      code: string;
      description: string;
      type: 'Asset' | 'Liability' | 'Equity';
      financialCategory: string | null;
      balance: number | null;
    }>;
    currentAssets: number | null;
    noncurrentAssets: number | null;
    totalAssets: number | null;
    currentLiabilities: number | null;
    noncurrentLiabilities: number | null;
    totalLiabilities: number | null;
    equity: number | null;
    liabilitiesAndEquity: number | null;
    balanceDifference: number | null;
    isBalanced: boolean;
  };
  incomeStatement?: {
    available: boolean;
    netIncome: number | null;
  };
  equityStatement?: {
    available: boolean;
    periodStart: string;
    periodEnd: string;
    openingEquity: number | null;
    creditMovements: number | null;
    debitMovements: number | null;
    netIncome: number | null;
    closingEquity: number | null;
    note: string;
  };
  cashFlowStatement: {
    available: boolean;
    periodStart: string;
    periodEnd: string;
    openingCash: number | null;
    cashInflows: number | null;
    cashOutflows: number | null;
    netCashChange: number | null;
    closingCash: number | null;
    operatingFlows: number | null;
    investingFlows: number | null;
    financingFlows: number | null;
    classificationNote: string;
  };
}

export interface FinancialPositionLine {
  section: string;
  label: string;
  amount: number | null;
  notes: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAmount(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

export function isFinancialPositionSummary(value: unknown): value is FinancialPositionSummary {
  if (!isRecord(value) || !isRecord(value.balanceSheet) || !isRecord(value.balanceSheet.categories)
    || !isRecord(value.cashFlowStatement)) return false;
  const balanceSheet = value.balanceSheet;
  const categories = balanceSheet.categories;
  const cashFlow = value.cashFlowStatement;
  const accountDetailsAreValid = balanceSheet.accounts === undefined
    || (Array.isArray(balanceSheet.accounts) && balanceSheet.accounts.every((account) =>
      isRecord(account)
      && typeof account.code === 'string'
      && typeof account.description === 'string'
      && ['Asset', 'Liability', 'Equity'].includes(String(account.type))
      && (account.financialCategory === null || typeof account.financialCategory === 'string')
      && isAmount(account.balance)));
  const incomeStatementIsValid = value.incomeStatement === undefined
    || (isRecord(value.incomeStatement)
      && typeof value.incomeStatement.available === 'boolean'
      && isAmount(value.incomeStatement.netIncome));
  const equityStatementIsValid = value.equityStatement === undefined
    || (isRecord(value.equityStatement)
      && typeof value.equityStatement.available === 'boolean'
      && typeof value.equityStatement.periodStart === 'string'
      && typeof value.equityStatement.periodEnd === 'string'
      && typeof value.equityStatement.note === 'string'
      && ['openingEquity', 'creditMovements', 'debitMovements', 'netIncome', 'closingEquity']
        .every((key) => isAmount(value.equityStatement[key])));
  return typeof value.dateImputation === 'string'
    && typeof value.countryCode === 'string'
    && typeof value.currency === 'string'
    && typeof balanceSheet.available === 'boolean'
    && typeof balanceSheet.isBalanced === 'boolean'
    && typeof cashFlow.available === 'boolean'
    && typeof cashFlow.periodStart === 'string'
    && typeof cashFlow.periodEnd === 'string'
    && typeof cashFlow.classificationNote === 'string'
    && accountDetailsAreValid
    && incomeStatementIsValid
    && equityStatementIsValid
    && ['openingCash', 'cashInflows', 'cashOutflows', 'netCashChange', 'closingCash', 'operatingFlows', 'investingFlows', 'financingFlows']
      .every((key) => isAmount(cashFlow[key]))
    && [
      'cash', 'tradeReceivables', 'inventory', 'otherCurrentAssets', 'noncurrentAssets',
      'tradePayables', 'otherCurrentLiabilities', 'noncurrentLiabilities', 'equity',
    ].every((key) => isAmount(categories[key]))
    && [
      'currentAssets', 'noncurrentAssets', 'totalAssets', 'currentLiabilities',
      'noncurrentLiabilities', 'totalLiabilities', 'equity', 'liabilitiesAndEquity',
      'balanceDifference',
    ].every((key) => isAmount(balanceSheet[key]));
}

export function buildFinancialPositionLines(
  summary: FinancialPositionSummary | null,
): FinancialPositionLine[] {
  const categories = summary?.balanceSheet.categories;
  const available = summary?.balanceSheet.available ?? false;
  const sum = (...values: Array<number | null | undefined>): number | null =>
    values.every((value): value is number => typeof value === 'number')
      ? values.reduce((total, value) => total + value, 0)
      : null;
  const amount = (value: number | null | undefined) => available ? value ?? null : null;
  const notes = available
    ? 'Solde des comptes POSTED à la date d’arrêté; soldes d’ouverture à confirmer.'
    : 'Indisponible: couverture/classification du plan comptable incomplète ou données POSTED insuffisantes.';
  return [
    { section: 'Actif', label: 'Trésorerie et équivalents', amount: amount(categories?.cash), notes },
    { section: 'Actif', label: 'Créances clients', amount: amount(categories?.tradeReceivables), notes },
    { section: 'Actif', label: 'Stocks', amount: amount(categories?.inventory), notes },
    { section: 'Actif', label: 'Autres actifs courants', amount: amount(categories?.otherCurrentAssets), notes },
    { section: 'Actif', label: 'Total actif courant', amount: amount(summary?.balanceSheet.currentAssets), notes },
    { section: 'Actif', label: 'Actifs non courants', amount: amount(categories?.noncurrentAssets), notes },
    { section: 'Actif', label: 'TOTAL ACTIF', amount: amount(summary?.balanceSheet.totalAssets), notes },
    { section: 'Passif', label: 'Dettes fournisseurs', amount: amount(categories?.tradePayables), notes },
    { section: 'Passif', label: 'Autres passifs courants', amount: amount(categories?.otherCurrentLiabilities), notes },
    { section: 'Passif', label: 'Total passif courant', amount: amount(summary?.balanceSheet.currentLiabilities), notes },
    { section: 'Passif', label: 'Passifs non courants', amount: amount(categories?.noncurrentLiabilities), notes },
    { section: 'Passif', label: 'TOTAL DETTES', amount: amount(summary?.balanceSheet.totalLiabilities), notes },
    { section: 'Capitaux propres', label: 'Capitaux propres, résultat inclus', amount: amount(categories?.equity), notes },
    { section: 'Passif et capitaux propres', label: 'TOTAL PASSIF ET CAPITAUX PROPRES', amount: amount(summary?.balanceSheet.liabilitiesAndEquity), notes },
    { section: 'Contrôle', label: 'Écart actif − passif et capitaux propres', amount: amount(summary?.balanceSheet.balanceDifference), notes: available ? summary.balanceSheet.isBalanced ? 'Équilibre arithmétique; rapprochement comptable non certifié.' : 'Écart à rapprocher; vérifier les soldes et écritures.' : notes },
  ];
}

export function buildCashFlowLines(summary: FinancialPositionSummary | null): FinancialPositionLine[] {
  const cashFlow = summary?.cashFlowStatement;
  const amount = (value: number | null | undefined) => cashFlow?.available ? value ?? null : null;
  const availabilityNote = cashFlow?.available
    ? 'Mouvements des comptes de trésorerie classés, depuis le journal POSTED; solde initial à confirmer.'
    : 'Indisponible: compte de trésorerie non classé, source incomplète ou écriture invalide.';
  return [
    { section: 'Trésorerie', label: 'Trésorerie à l’ouverture de la période', amount: amount(cashFlow?.openingCash), notes: availabilityNote },
    { section: 'Flux classifiés', label: 'Flux des activités opérationnelles', amount: amount(cashFlow?.operatingFlows), notes: cashFlow?.classificationNote ?? availabilityNote },
    { section: 'Flux classifiés', label: 'Flux des activités d’investissement', amount: amount(cashFlow?.investingFlows), notes: cashFlow?.classificationNote ?? availabilityNote },
    { section: 'Flux classifiés', label: 'Flux des activités de financement', amount: amount(cashFlow?.financingFlows), notes: cashFlow?.classificationNote ?? availabilityNote },
    { section: 'Mouvements de trésorerie', label: 'Entrées sur comptes de trésorerie', amount: amount(cashFlow?.cashInflows), notes: availabilityNote },
    { section: 'Mouvements de trésorerie', label: 'Sorties sur comptes de trésorerie', amount: amount(cashFlow?.cashOutflows), notes: availabilityNote },
    { section: 'Mouvements de trésorerie', label: 'Variation nette de trésorerie calculée', amount: amount(cashFlow?.netCashChange), notes: availabilityNote },
    { section: 'Trésorerie', label: 'Trésorerie à la clôture de la période', amount: amount(cashFlow?.closingCash), notes: availabilityNote },
  ];
}

export function buildDetailedBalanceLines(summary: FinancialPositionSummary | null): Array<FinancialPositionLine & {
  accountCode: string;
  category: string;
}> {
  const unavailable = (notes: string) => [{
    section: 'Bilan détaillé',
    label: 'Détail des comptes',
    accountCode: '',
    category: 'Indisponible',
    amount: null,
    notes,
  }];
  const accounts = summary?.balanceSheet.accounts;
  if (!accounts) {
    return unavailable('Indisponible: le service de bilan ne fournit pas le détail par compte.');
  }
  if (accounts.length === 0) {
    return unavailable('Aucun compte comptabilisable d’actif, de passif ou de capitaux propres n’est configuré.');
  }

  const lines = accounts.map((account) => ({
    section: account.type === 'Asset' ? 'Actif' : account.type === 'Liability' ? 'Passif' : 'Capitaux propres',
    label: account.description,
    accountCode: account.code,
    category: account.financialCategory ?? 'Classement indisponible',
    amount: account.balance,
    notes: account.balance === null
      ? 'Indisponible: compte non classé ou écriture invalide.'
      : 'Solde naturel cumulé des écritures POSTED à la date d’arrêté; soldes d’ouverture à confirmer.',
  }));
  const { balanceSheet, incomeStatement } = summary;
  lines.push({
    section: 'Capitaux propres',
    label: 'Résultat de la période non clôturé',
    accountCode: '',
    category: 'À rapprocher avant clôture',
    amount: balanceSheet.available && incomeStatement?.available ? incomeStatement.netIncome : null,
    notes: 'Résultat calculé sur la période de 365 jours; inclus dans le total des capitaux propres du bilan.',
  });
  lines.push(
    {
      section: 'Actif',
      label: 'TOTAL ACTIF',
      accountCode: '',
      category: 'Total des catégories classées',
      amount: balanceSheet.available ? balanceSheet.totalAssets : null,
      notes: 'Total du bilan; indisponible si le classement ou la couverture est incomplet.',
    },
    {
      section: 'Passif',
      label: 'TOTAL PASSIF',
      accountCode: '',
      category: 'Total des catégories classées',
      amount: balanceSheet.available ? balanceSheet.totalLiabilities : null,
      notes: 'Total du bilan; indisponible si le classement ou la couverture est incomplet.',
    },
    {
      section: 'Capitaux propres',
      label: 'TOTAL CAPITAUX PROPRES, résultat inclus',
      accountCode: '',
      category: 'Total des catégories classées',
      amount: balanceSheet.available ? balanceSheet.equity : null,
      notes: 'Inclut le résultat non clôturé présenté séparément ci-dessus.',
    },
  );
  return lines;
}

export function buildEquityChangesLines(summary: FinancialPositionSummary | null): FinancialPositionLine[] {
  const statement = summary?.equityStatement;
  const available = statement?.available ?? false;
  const amount = (value: number | null | undefined) => available ? value ?? null : null;
  const note = statement?.note ?? 'Indisponible: le service financier ne fournit pas les mouvements de capitaux propres.';
  return [
    {
      section: 'Capitaux propres',
      label: 'Solde d’ouverture des comptes de capitaux propres',
      amount: amount(statement?.openingEquity),
      notes: available
        ? `Solde cumulé des écritures POSTED antérieures au ${statement.periodStart}; soldes d’ouverture à confirmer.`
        : note,
    },
    { section: 'Mouvements comptabilisés', label: 'Mouvements au crédit des comptes de capitaux propres', amount: amount(statement?.creditMovements), notes: note },
    { section: 'Mouvements comptabilisés', label: 'Mouvements au débit des comptes de capitaux propres', amount: amount(statement?.debitMovements), notes: note },
    {
      section: 'Résultat',
      label: 'Résultat net calculé sur la période',
      amount: amount(statement?.netIncome),
      notes: 'Calcul issu des écritures POSTED de la période; aucun transfert en capitaux propres n’est présumé.',
    },
    {
      section: 'Capitaux propres',
      label: 'Solde de clôture des capitaux propres, résultat inclus',
      amount: amount(statement?.closingEquity),
      notes: available
        ? 'Comptes de capitaux propres POSTED à la date d’arrêté, plus le résultat de la période non clôturé.'
        : note,
    },
    {
      section: 'Contrôle',
      label: 'Écart de rapprochement',
      amount: available && statement?.openingEquity !== null
        && statement?.creditMovements !== null
        && statement?.debitMovements !== null
        && statement?.netIncome !== null
        && statement?.closingEquity !== null
        ? statement.closingEquity - statement.openingEquity
          - statement.creditMovements + statement.debitMovements - statement.netIncome
        : null,
      notes: 'Doit être nul sous réserve des soldes d’ouverture et de l’exhaustivité du grand livre; rapprochement non certifié.',
    },
  ];
}
