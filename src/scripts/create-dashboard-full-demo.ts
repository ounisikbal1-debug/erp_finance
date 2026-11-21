import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import prisma from '../core/models/prisma';
import { calculateAdvancedFinancialAnalysis } from '../application/modules/advanced-finance/analysis';
import { calculateDashboardSummary } from '../application/modules/advanced-finance/dashboard';
import { calculateFinancialPeriodSummary } from '../application/modules/finance/financial-report';
import { calculateReceivablesAging } from '../application/modules/receivables/aging';
import { calculatePayablesAging } from '../application/modules/purchases/payables-aging';
import { buildFinancialDashboardSheets } from '../presentation/financial-dashboard-export';
import { buildIncomeStatementLines } from '../presentation/income-statement-layout';
import { buildCashFlowLines, buildFinancialPositionLines } from '../presentation/financial-position';

const DEMO_DATABASE_URL = 'file:../dashboard-demo-synthetic.db';
const DEMO_ENTITY_CODE = 'SAFE-DEMO-001';

function isBalanceSheetAccount<T extends { type: string }>(
  account: T,
): account is T & { type: 'Asset' | 'Liability' | 'Equity' } {
  return account.type === 'Asset' || account.type === 'Liability' || account.type === 'Equity';
}

async function main(): Promise<void> {
  if (process.env.SAFE_ERP_DATABASE_URL !== DEMO_DATABASE_URL
    || process.env.SAFE_ERP_DASHBOARD_DEMO_CONFIRM !== 'YES') {
    throw new Error('Export refusé : seule la base dédiée de démonstration explicitement confirmée est autorisée.');
  }

  const entity = await prisma.entity.findUnique({
    where: { code: DEMO_ENTITY_CODE },
    include: { country: true },
  });
  if (!entity || entity.country.code !== 'ZZ' || !/synthétique|fictive/i.test(entity.name)) {
    throw new Error('Entité synthétique fictive introuvable ou non vérifiable.');
  }

  const asOf = new Date('2026-11-09T23:59:59.999Z');
  const periodStart = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 11, 1));
  const [accounts, entries, materials, invoices, purchaseInvoices, intercompanyTransactions] = await Promise.all([
    prisma.chartOfAccount.findMany({ where: { countryId: entity.countryId } }),
    prisma.journalEntry.findMany({
      where: { entityId: entity.id, status: 'POSTED', date: { lte: asOf } },
      include: { lines: true },
      orderBy: { date: 'asc' },
    }),
    prisma.material.findMany({ where: { entityId: entity.id } }),
    prisma.invoice.findMany({
      where: { entityId: entity.id },
      include: {
        customer: { select: { code: true, name: true } },
        cashflowPayments: true,
      },
    }),
    prisma.purchaseInvoice.findMany({
      where: { entityId: entity.id },
      include: {
        vendor: { select: { code: true, name: true } },
        cashflowPayments: true,
        supplierCreditNotes: true,
        supplierCreditApplications: true,
      },
    }),
    prisma.intercompanyTransaction.findMany({
      where: { transactionDate: { lte: asOf } },
      include: {
        sellerEntity: { select: { code: true, country: { select: { currencyCode: true } } } },
        buyerEntity: { select: { code: true, country: { select: { currencyCode: true } } } },
        sellerJournalEntry: { select: { entryNumber: true, status: true } },
        buyerJournalEntry: { select: { entryNumber: true, status: true } },
      },
      orderBy: [{ transactionDate: 'asc' }, { reference: 'asc' }],
    }),
  ]);
  const postingAccounts = accounts.filter((account) => account.isPostingAllowed);
  const unclassified = postingAccounts.filter((account) => !account.financialCategory);
  if (unclassified.length > 0) {
    throw new Error(`Le jeu de démonstration contient des comptes comptabilisables non classés : ${unclassified.map((account) => account.code).join(', ')}`);
  }
  const journalLines = entries.flatMap((entry) => entry.lines.map((line) => ({
    date: entry.date,
    entryNumber: entry.entryNumber,
    accountCode: line.accountCode,
    debit: line.debit,
    credit: line.credit,
  })));
  const reportEntity = {
    name: entity.name,
    countryCode: entity.country.code,
    currencyCode: entity.country.currencyCode,
    corporateTax: entity.country.corporateTax,
  };
  const summary = calculateDashboardSummary({
    entity: reportEntity,
    materials,
    invoices: invoices.map((invoice) => ({
      status: invoice.status,
      totalAmount: invoice.totalAmount,
      currencyCode: invoice.functionalCurrencyCode ?? invoice.currencyCode,
    })),
    journalLines,
    accounts: postingAccounts.map(({ code, type }) => ({ code, type })),
    asOf,
  });
  const endOfPeriod = new Date(`${summary.periodEnd}T23:59:59.999Z`);
  const periodLines = journalLines.filter((line) => line.date >= periodStart && line.date <= endOfPeriod);
  const financialReport = calculateFinancialPeriodSummary({
    entity: reportEntity,
    accounts: postingAccounts.map(({ code, description, type, financialCategory }) => ({
      code, description, type, financialCategory,
    })),
    journalLines: periodLines,
    periodStart: summary.periodStart,
    periodEnd: summary.periodEnd,
    generatedAt: asOf,
  });
  const advancedFinancialAnalysis = calculateAdvancedFinancialAnalysis({
    countryCode: entity.country.code,
    currency: entity.country.currencyCode,
    accounts: postingAccounts.map(({ code, type, financialCategory, isPostingAllowed }) => ({
      code,
      type,
      financialCategory,
      isPostingAllowed,
    })),
    journalLines,
    asOf,
  });
  const incomeStatementLines = buildIncomeStatementLines({
    accounts: financialReport.accounts,
    revenue: financialReport.totals.find(({ type }) => type === 'Revenue')?.movement ?? null,
    expenses: financialReport.totals.find(({ type }) => type === 'Expense')?.movement ?? null,
    taxRatePercent: entity.country.corporateTax,
  });
  const balanceSheetLines = buildFinancialPositionLines({
    ...advancedFinancialAnalysis,
    balanceSheet: {
      ...advancedFinancialAnalysis.balanceSheet,
      categories: advancedFinancialAnalysis.balanceSheet.categories,
      accounts: advancedFinancialAnalysis.balanceSheet.accounts.filter(isBalanceSheetAccount),
    },
  });
  const agingEntity = { name: entity.name, currencyCode: entity.country.currencyCode };
  const receivables = calculateReceivablesAging({
    entity: agingEntity,
    asOf: '2026-11-09',
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      createdAt: invoice.createdAt,
      dueDate: invoice.dueDate,
      status: invoice.status,
      totalAmount: invoice.totalAmount,
      currencyCode: invoice.currencyCode,
      functionalCurrencyCode: invoice.functionalCurrencyCode,
      customer: invoice.customer,
      cashflowPayments: invoice.cashflowPayments.map((payment) => ({
        amount: payment.amount,
        carryingAmount: payment.carryingAmount,
        currencyCode: payment.currencyCode,
        direction: payment.direction,
        paidAt: payment.paidAt,
      })),
    })),
  });
  const payables = calculatePayablesAging({
    entity: agingEntity,
    asOf: '2026-11-09',
    invoices: purchaseInvoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      postedAt: invoice.postedAt,
      dueDate: invoice.dueDate,
      status: invoice.status,
      totalAmount: invoice.totalAmount,
      currencyCode: invoice.currencyCode,
      functionalCurrencyCode: invoice.functionalCurrencyCode,
      vendor: invoice.vendor,
      cashflowPayments: invoice.cashflowPayments.map((payment) => ({
        amount: payment.amount,
        currencyCode: payment.currencyCode,
        direction: payment.direction,
        paidAt: payment.paidAt,
      })),
      supplierCreditNotes: invoice.supplierCreditNotes.map((credit) => ({
        totalAmount: credit.totalAmount,
        currencyCode: credit.currencyCode,
        status: credit.status,
        postedAt: credit.postedAt,
      })),
      supplierCreditApplications: invoice.supplierCreditApplications.map((application) => ({
        functionalAmount: application.functionalAmount,
        createdAt: application.createdAt,
      })),
    })),
  });

  const totals = new Map(postingAccounts.map((account) => [account.code, {
    accountCode: account.code,
    totalDebit: 0,
    totalCredit: 0,
    balance: 0,
  }]));
  for (const line of journalLines) {
    const balance = totals.get(line.accountCode);
    if (!balance) throw new Error(`Écriture vers un compte absent : ${line.accountCode}`);
    balance.totalDebit += line.debit;
    balance.totalCredit += line.credit;
    balance.balance += line.debit - line.credit;
  }
  const sources = {
    summary,
    balance: [...totals.values()],
    chartOfAccounts: postingAccounts.map(({ code, description, type }) => ({ code, description, type })),
    financialReport,
    advancedFinancialAnalysis,
    receivables,
    payables: {
      ...payables,
      totals: { ...payables.totals, unknownDueDate: 0 },
      coverage: { ...payables.coverage, dueDateMissingCount: 0 },
      invoices: payables.invoices.map((invoice) => ({
        ...invoice,
        issueDate: invoice.postedAt,
        status: 'POSTED',
      })),
    },
    asOf: '2026-11-09',
    generatedAt: new Date().toISOString(),
  };
  const sheets = buildFinancialDashboardSheets(sources);
  const normalBalance = new Map(postingAccounts.map((account) => {
    const balance = totals.get(account.code)!;
    return [account.code, account.type === 'Asset' || account.type === 'Expense'
      ? balance.balance
      : -balance.balance] as const;
  }));
  const balanceRows: Array<Record<string, string | number | null>> = postingAccounts
    .filter((account) => ['Asset', 'Liability', 'Equity'].includes(account.type))
    .map((account) => ({
      Rubrique: account.type,
      Compte: account.code,
      Intitulé: account.description,
      Solde: normalBalance.get(account.code)!,
      Devise: entity.country.currencyCode,
      Classement: account.financialCategory ?? 'À examiner',
    }));
  const currentPeriodResult = advancedFinancialAnalysis.incomeStatement.netIncome;
  if (currentPeriodResult !== null) {
    balanceRows.push({
      Rubrique: 'Résultat non clôturé',
      Compte: '',
      Intitulé: 'Résultat de la période inclus dans les capitaux propres du bilan',
      Solde: currentPeriodResult,
      Devise: entity.country.currencyCode,
      Classement: 'À rapprocher avant clôture',
    });
  }
  for (const type of ['Asset', 'Liability', 'Equity']) {
    balanceRows.push({
      Rubrique: `TOTAL ${type}`,
      Compte: '',
      Intitulé: `Somme des comptes ${type}; non certifiée`,
      Solde: postingAccounts
        .filter((account) => account.type === type)
        .reduce((sum, account) => sum + (normalBalance.get(account.code) ?? 0), 0)
        + (type === 'Equity' ? currentPeriodResult ?? 0 : 0),
      Devise: entity.country.currencyCode,
      Classement: 'À rapprocher',
    });
  }
  const detailedIncomeStatement = {
    sheetName: 'Compte de résultat',
    columns: [
      { header: 'Section', key: 'section' },
      { header: 'Poste', key: 'label' },
      { header: `Montant (${entity.country.currencyCode})`, key: 'amount' },
      { header: '% du chiffre d’affaires', key: 'percentageOfRevenue' },
      { header: 'Notes / méthode', key: 'notes' },
    ],
    data: incomeStatementLines.map((line) => ({
      ...line,
      amount: line.amount ?? 'Indisponible',
      percentageOfRevenue: line.percentageOfRevenue === null ? 'Indisponible' : `${line.percentageOfRevenue.toFixed(2)} %`,
    })),
  };
  const existingIncomeStatementIndex = sheets.findIndex((sheet) => sheet.sheetName === 'Compte de résultat');
  if (existingIncomeStatementIndex >= 0) sheets[existingIncomeStatementIndex] = detailedIncomeStatement;
  else sheets.push(detailedIncomeStatement);
  sheets.push({
    sheetName: 'Bilan',
    columns: [
      { header: 'Section', key: 'section' },
      { header: 'Poste', key: 'label' },
      { header: `Montant (${entity.country.currencyCode})`, key: 'amount' },
      { header: 'Notes / méthode', key: 'notes' },
    ],
    data: balanceSheetLines.map((line) => ({
      ...line,
      amount: line.amount ?? 'Indisponible',
    })),
  });
  sheets.push({
    sheetName: 'Flux de trésorerie',
    columns: [
      { header: 'Section', key: 'section' },
      { header: 'Poste', key: 'label' },
      { header: `Montant (${entity.country.currencyCode})`, key: 'amount' },
      { header: 'Notes / méthode', key: 'notes' },
    ],
    data: buildCashFlowLines({
      ...advancedFinancialAnalysis,
      balanceSheet: {
        ...advancedFinancialAnalysis.balanceSheet,
        categories: advancedFinancialAnalysis.balanceSheet.categories,
        accounts: advancedFinancialAnalysis.balanceSheet.accounts.filter(isBalanceSheetAccount),
      },
    }).map((line) => ({
      ...line,
      amount: line.amount ?? 'Indisponible',
    })),
  });
  sheets.push({
    sheetName: 'Bilan détaillé',
    columns: Object.keys(balanceRows[0]).map((key) => ({ header: key, key })),
    data: balanceRows,
  });
  sheets.push({
    sheetName: 'Données et couverture',
    columns: [{ header: 'Contrôle', key: 'contrôle' }, { header: 'Valeur', key: 'valeur' }],
    data: [
      { contrôle: 'Nature', valeur: 'Exemple intégralement synthétique et fictif — aucune donnée client.' },
      { contrôle: 'Entité', valeur: `${entity.code} · ${entity.name}` },
      { contrôle: 'Période', valeur: `${summary.periodStart} au ${summary.periodEnd}` },
      { contrôle: 'Comptes comptabilisables classés', valeur: `${postingAccounts.length} / ${postingAccounts.length}` },
      { contrôle: 'Lignes de journal POSTED', valeur: journalLines.length },
      { contrôle: 'Factures clients', valeur: invoices.length },
      { contrôle: 'Factures fournisseurs POSTED', valeur: purchaseInvoices.filter((invoice) => invoice.status === 'POSTED').length },
      { contrôle: 'Transactions intercompagnies', valeur: intercompanyTransactions.length },
      { contrôle: 'Paires interco rapprochées des deux côtés', valeur: intercompanyTransactions.filter((transaction) => transaction.status === 'RECONCILED' && transaction.sellerReconciledAt && transaction.buyerReconciledAt).length },
      { contrôle: 'Créances ouvertes', valeur: receivables.totals.outstanding ?? 'Indisponible' },
      { contrôle: 'Dettes fournisseurs ouvertes', valeur: payables.totals.outstanding ?? 'Indisponible' },
      { contrôle: 'Écart bilan', valeur: advancedFinancialAnalysis.balanceSheet.balanceDifference ?? 'Indisponible' },
      { contrôle: 'Ratios', valeur: advancedFinancialAnalysis.coverage.ratiosAvailable ? 'Calculés — à rapprocher' : advancedFinancialAnalysis.evaluation.diagnostic },
      { contrôle: 'Prudence', valeur: 'Exemple pédagogique; classement et décisions à valider par un professionnel.' },
    ],
  });
  sheets.push({
    sheetName: 'Transactions interco',
    columns: [
      { header: 'Référence', key: 'reference' },
      { header: 'Date', key: 'date' },
      { header: 'Vendeur', key: 'seller' },
      { header: 'Acheteur', key: 'buyer' },
      { header: 'Libellé', key: 'description' },
      { header: 'Montant vendeur', key: 'sellerAmount' },
      { header: 'Devise vendeur', key: 'sellerCurrency' },
      { header: 'Taux vendeur → acheteur', key: 'exchangeRate' },
      { header: 'Montant acheteur', key: 'buyerAmount' },
      { header: 'Devise acheteur', key: 'buyerCurrency' },
      { header: 'Statut', key: 'status' },
      { header: 'Pièce vendeur', key: 'sellerJournal' },
      { header: 'Pièce acheteur', key: 'buyerJournal' },
      { header: 'Confirmation vendeur', key: 'sellerReconciled' },
      { header: 'Confirmation acheteur', key: 'buyerReconciled' },
    ],
    data: intercompanyTransactions.map((transaction) => ({
      reference: transaction.reference,
      date: transaction.transactionDate.toISOString().slice(0, 10),
      seller: `${transaction.sellerEntity.code} · ${transaction.sellerEntity.country.currencyCode}`,
      buyer: `${transaction.buyerEntity.code} · ${transaction.buyerEntity.country.currencyCode}`,
      description: transaction.description,
      sellerAmount: transaction.sellerAmount,
      sellerCurrency: transaction.currencyCode,
      exchangeRate: transaction.exchangeRate,
      buyerAmount: transaction.buyerAmount,
      buyerCurrency: transaction.buyerEntity.country.currencyCode,
      status: transaction.status,
      sellerJournal: `${transaction.sellerJournalEntry.entryNumber} · ${transaction.sellerJournalEntry.status}`,
      buyerJournal: `${transaction.buyerJournalEntry.entryNumber} · ${transaction.buyerJournalEntry.status}`,
      sellerReconciled: transaction.sellerReconciledAt ? 'Confirmé' : 'À confirmer',
      buyerReconciled: transaction.buyerReconciledAt ? 'Confirmé' : 'À confirmer',
    })),
  });

  const outputDirectory = path.resolve(__dirname, '../data/demo-output');
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, 'SAFE-Tableau-Financier-EXEMPLE-SYNTHETIQUE-COMPLET.xlsx');
  const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SAFE ERP';
  workbook.title = 'SAFE — Tableau financier — exemple synthétique complet';
  workbook.subject = 'Données fictives de démonstration uniquement';
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.sheetName.slice(0, 31));
    worksheet.addRow([`SAFE — ${sheet.sheetName} — EXEMPLE SYNTHÉTIQUE FICTIF`]);
    worksheet.addRow([`${entity.name} · ${entity.country.code} · ${entity.country.currencyCode} · Arrêté ${sources.asOf}`]);
    worksheet.addRow(sheet.columns.map((column) => column.header));
    worksheet.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF183B63' } };
    worksheet.views = [{ state: 'frozen', ySplit: 3 }];
    for (const row of sheet.data) {
      worksheet.addRow(sheet.columns.map((column) => {
        const value = row[column.key];
        return value === null || value === undefined || value === '' ? 'Indisponible' : value;
      }));
    }
    worksheet.columns.forEach((column, index) => {
      const max = Math.max(
        sheet.columns[index]?.header.length ?? 12,
        ...sheet.data.slice(0, 100).map((row) => String(row[sheet.columns[index]?.key] ?? '').length),
      );
      column.width = Math.min(48, Math.max(14, max + 2));
    });
    if (sheet.columns.length) {
      worksheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: sheet.columns.length } };
    }
  }
  try {
    await workbook.xlsx.writeFile(temporaryPath);
    await rename(temporaryPath, outputPath);
  } catch (error) {
    try { await unlink(temporaryPath); } catch { /* Leave the original workbook intact. */ }
    throw error;
  }
  console.log(JSON.stringify({
    outputPath,
    worksheets: workbook.worksheets.map((sheet) => sheet.name),
    classifiedPostingAccounts: postingAccounts.length,
    journalLines: journalLines.length,
    balanceDifference: advancedFinancialAnalysis.balanceSheet.balanceDifference,
    receivablesOutstanding: receivables.totals.outstanding,
    payablesOutstanding: payables.totals.outstanding,
    ratiosAvailable: advancedFinancialAnalysis.coverage.ratiosAvailable,
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error('Échec de création du classeur synthétique complet :', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
