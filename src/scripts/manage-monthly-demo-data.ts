import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import sqlite3 from 'sqlite3';
import prisma from '../data/prisma/client';
import CashflowBankingService from '../application/modules/cashflow/banking-service';
import FinanceService from '../application/modules/finance/service';
import MaterialsService from '../application/modules/materials/service';
import PurchasesService from '../application/modules/purchases/service';
import SalesService from '../application/modules/sales/service';

const draftDirectoryName = 'SAFE_ERP-DRAFT 1';
const demoPrefix = 'DEMO-M12';
const entityCode = 'TN01';
const customerCode = `${demoPrefix}-CUST`;
const vendorCode = `${demoPrefix}-VEND`;
const materialSku = `${demoPrefix}-ITEM`;
const warehouseCodes = [`${demoPrefix}-WH-A`, `${demoPrefix}-WH-B`];
const bankAccountName = 'DEMO-M12 - Banque synthétique';
const note = 'DEMO-M12: opération synthétique de prototype, sans valeur opérationnelle.';

type DemoActor = { id: string; username: string };
type PaymentPlan = {
  direction: 'IN' | 'OUT';
  amount: number;
  date: string;
  reference: string;
  description: string;
  invoiceId?: string;
  purchaseInvoiceId?: string;
  journalLineId?: string;
};

function assertDraftDirectory() {
  if (basename(resolve(process.cwd())).toLocaleLowerCase() !== draftDirectoryName.toLocaleLowerCase()) {
    throw new Error(`Opération refusée : lancez ce script depuis le dossier ${draftDirectoryName}.`);
  }
}

function createDatabaseBackup(databasePath: string): Promise<string> {
  const backupPath = `${databasePath}.monthly-demo-backup-${new Date().toISOString().replace(/[-:.TZ]/g, '')}.sqlite`;
  return new Promise((resolveBackup, rejectBackup) => {
    const source = new sqlite3.Database(databasePath, (openError) => {
      if (openError) {
        rejectBackup(openError);
        return;
      }
      const escapedPath = backupPath.replace(/'/g, "''");
      source.exec(`VACUUM INTO '${escapedPath}'`, (backupError) => {
        source.close((closeError) => {
          if (backupError) rejectBackup(backupError);
          else if (closeError) rejectBackup(closeError);
          else resolveBackup(backupPath);
        });
      });
    });
  });
}

function makePeriod(now = new Date()) {
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1));
  return Array.from({ length: 12 }, (_, index) => {
    const month = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + index, 1));
    const key = month.toISOString().slice(0, 7);
    const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
    return { key, daysInMonth };
  });
}

function dayInMonth(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, '0')}`;
}

function money(value: number): string {
  return value.toFixed(3);
}

async function getActors() {
  const users = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT', 'SALES_OFFICER'] } },
    select: { id: true, username: true, role: true },
  });
  const actorFor = (role: string): DemoActor => {
    const user = users.find((candidate) => candidate.role === role);
    if (!user) throw new Error(`Précondition DEMO non satisfaite : un compte de rôle ${role} est requis.`);
    return { id: user.id, username: user.username };
  };
  return {
    creator: actorFor('ADMIN'),
    approver: actorFor('FINANCIAL_MANAGER'),
    poster: actorFor('ACCOUNTANT'),
    salesIssuer: actorFor('SALES_OFFICER'),
    stockActor: actorFor('ADMIN'),
  };
}

async function getPrerequisites(checkForExisting = true) {
  const entity = await prisma.entity.findUnique({
    where: { code: entityCode },
    select: {
      id: true,
      countryId: true,
      country: {
        select: {
          code: true,
          currencyCode: true,
          isDefault: true,
          salesReceivableAccountCode: true,
          salesRevenueAccountCode: true,
          salesVatAccountCode: true,
          salesStampDutyAccountCode: true,
          purchaseExpenseAccountCode: true,
          purchaseVatAccountCode: true,
        },
      },
    },
  });
  if (!entity) throw new Error(`Société ${entityCode} introuvable dans la base du draft.`);
  if (!entity.country.isDefault) throw new Error('Le profil TN de TN01 n’est pas le profil pays actif du draft.');
  if (entity.country.code !== 'TN' || entity.country.currencyCode !== 'TND') {
    throw new Error('Le jeu DEMO mensuel est limité à la société tunisienne TN01 en TND.');
  }
  const [accounts, rates, cashflowMapping, existing] = await Promise.all([
    prisma.chartOfAccount.findMany({
      where: { countryId: entity.countryId, code: { in: ['411', '401', '532', '601', '701', '4367', '432'] } },
      select: { code: true, isPostingAllowed: true },
    }),
    prisma.taxRate.findMany({
      where: { countryId: entity.countryId, code: { in: ['TVA_0', 'TVA_19'] } },
      select: { id: true, code: true, rate: true, purchaseVatRecoverable: true },
    }),
    prisma.cashflowAccountingMapping.findUnique({
      where: { entityId: entity.id },
      select: { receivableAccountCode: true, payableAccountCode: true },
    }),
    checkForExisting
      ? Promise.all([
        prisma.customer.findFirst({ where: { entityId: entity.id, code: customerCode }, select: { id: true } }),
        prisma.vendor.findUnique({ where: { code: vendorCode }, select: { id: true } }),
        prisma.material.findUnique({ where: { sku: materialSku }, select: { id: true } }),
        prisma.bankAccount.findFirst({ where: { entityId: entity.id, name: bankAccountName }, select: { id: true } }),
        prisma.purchaseInvoice.findFirst({ where: { entityId: entity.id, invoiceNumber: { startsWith: `${demoPrefix}-AP-` } }, select: { id: true } }),
        prisma.journalEntry.findFirst({ where: { entityId: entity.id, reference: { startsWith: `${demoPrefix}-` } }, select: { id: true } }),
      ])
      : Promise.resolve([]),
  ]);
  if (checkForExisting && existing.some(Boolean)) {
    throw new Error('Un jeu DEMO mensuel existe déjà ou est partiel; aucune donnée n’a été écrite. Vérifiez-le puis utilisez demo:monthly:remove.');
  }
  const postingCodes = new Set(accounts.filter((account) => account.isPostingAllowed).map((account) => account.code));
  const missingAccounts = ['411', '401', '532', '601', '701', '4367', '432'].filter((code) => !postingCodes.has(code));
  const zeroRate = rates.find((rate) => rate.code === 'TVA_0' && rate.rate === 0);
  const salesRate = rates.find((rate) => rate.code === 'TVA_19' && rate.rate === 19);
  if (missingAccounts.length || !zeroRate || !salesRate || zeroRate.purchaseVatRecoverable || !salesRate.purchaseVatRecoverable) {
    throw new Error(`Préconditions fiscales/comptables DEMO non satisfaites : ${[
      missingAccounts.length ? `comptes comptabilisables manquants ${missingAccounts.join(', ')}` : '',
      !zeroRate || !salesRate ? 'taux TVA_0 et TVA_19 requis' : '',
      !zeroRate?.purchaseVatRecoverable && salesRate && !salesRate.purchaseVatRecoverable
        ? 'activez la récupération de TVA pour TVA_19 avant le jeu DEMO' : '',
    ].filter(Boolean).join('; ')}.`);
  }
  if (cashflowMapping?.receivableAccountCode !== '411' || cashflowMapping.payableAccountCode !== '401') {
    throw new Error('Les comptes de règlement 411/401 ne sont pas configurés pour TN01.');
  }
  return { entity, zeroRate, salesRate };
}

async function postManualJournal(input: {
  entryNumber: string;
  date: string;
  reference: string;
  description: string;
  lines: Array<{ accountCode: string; debit: number; credit: number; description: string }>;
}, entityId: string, actors: Awaited<ReturnType<typeof getActors>>) {
  const entry = await FinanceService.createJournalEntry({
    ...input,
    entityId,
  }, actors.creator, note);
  await FinanceService.approveJournalEntry(entry.id, entityId, actors.approver, note);
  await FinanceService.postJournalEntry(entry.id, entityId, actors.poster, note);
  return prisma.journalEntry.findUniqueOrThrow({
    where: { id: entry.id },
    include: { lines: true },
  });
}

async function setupMonthlyDemo(entity: {
  id: string;
  countryId: string;
  country: { currencyCode: string };
}, purchaseTaxRateId: string, actors: Awaited<ReturnType<typeof getActors>>) {
  const customer = await prisma.customer.create({
    data: {
      code: customerCode,
      name: 'DEMO - Client fictif SAFE (jeu 12 mois)',
      email: 'demo-monthly-client@example.invalid',
      entityId: entity.id,
    },
  });
  const vendor = await prisma.vendor.create({
    data: {
      code: vendorCode,
      name: 'DEMO - Fournisseur fictif SAFE (jeu 12 mois)',
      email: 'demo-monthly-vendor@example.invalid',
      entityId: entity.id,
    },
  });
  const material = await MaterialsService.createMaterial({
    sku: materialSku,
    name: 'DEMO - Article synthétique, stock initial non comptabilisé',
    unitCode: 'EA',
    quantity: 0,
    minimumStock: 10,
    unitPrice: 40,
    costPrice: 20,
  }, entity.id, actors.stockActor);
  const warehouses = await Promise.all(warehouseCodes.map((code, index) => MaterialsService.createWarehouse({
    code,
    name: `DEMO - Dépôt synthétique ${index === 0 ? 'A' : 'B'}`,
  }, entity.id)));
  await prisma.material.update({
    where: { id: material.id },
    data: { quantity: 10000 },
  });
  const bankAccount = await prisma.bankAccount.create({
    data: {
      entityId: entity.id,
      name: bankAccountName,
      currencyCode: entity.country.currencyCode,
      ledgerAccountCode: '532',
      isActive: true,
    },
  });

  const months = makePeriod();
  const payments: PaymentPlan[] = [];
  let stockTransferCount = 0;
  let runningBalance = 1000000;
  const bankStatementRows: Array<{ plan: PaymentPlan; balance: number }> = [];
  const firstWarehouse = warehouses[0];
  const secondWarehouse = warehouses[1];
  if (!firstWarehouse || !secondWarehouse) throw new Error('Les dépôts DEMO n’ont pas été créés.');

  for (const [monthIndex, month] of months.entries()) {
    for (let index = 0; index < 30; index += 1) {
      const serial = String(index + 1).padStart(2, '0');
      const issueDate = dayInMonth(month.key, 2 + (index % 10));
      const dueDate = dayInMonth(month.key, Math.min(28, 20 + (index % 5)));
      const paymentDate = dueDate;
      const subtotal = 1000 + monthIndex * 100 + index;

      const salesInvoice = await SalesService.createInvoice({
        customerId: customer.id,
        entityId: entity.id,
        issueDate,
        dueDate,
        documentCurrencyCode: entity.country.currencyCode,
        items: [{
          description: `${demoPrefix}: vente synthétique ${month.key} #${serial}`,
          quantity: 1,
          unitPrice: subtotal,
          taxRate: 19,
        }],
      }, actors.creator);
      await SalesService.approveInvoice(salesInvoice.id, entity.id, actors.approver, note);
      await SalesService.issueInvoice(salesInvoice.id, entity.id, actors.salesIssuer, note);
      payments.push({
        direction: 'IN',
        amount: Number(salesInvoice.totalAmount),
        date: paymentDate,
        reference: `${demoPrefix}-IN-${month.key}-${serial}`,
        description: `${demoPrefix}: encaissement de ${salesInvoice.invoiceNumber}`,
        invoiceId: salesInvoice.id,
      });

      const purchaseInvoice = await PurchasesService.createDraftInvoice({
        invoiceNumber: `${demoPrefix}-AP-${month.key}-${serial}`,
        vendorId: vendor.id,
        issueDate,
        dueDate,
        subTotal: 2000 + monthIndex * 100 + index,
        taxRateId: purchaseTaxRateId,
        documentCurrencyCode: entity.country.currencyCode,
      }, entity.id, actors.creator);
      await PurchasesService.approveInvoice(purchaseInvoice.id, entity.id, actors.approver, note);
      await PurchasesService.postInvoice(purchaseInvoice.id, entity.id, actors.poster, note);
      payments.push({
        direction: 'OUT',
        amount: Number(purchaseInvoice.totalAmount),
        date: paymentDate,
        reference: `${demoPrefix}-OUT-${month.key}-${serial}`,
        description: `${demoPrefix}: paiement fournisseur ${purchaseInvoice.invoiceNumber}`,
        purchaseInvoiceId: purchaseInvoice.id,
      });

      const transferIndex = monthIndex * 30 + index;
      const sourceWarehouseId = transferIndex === 0
        ? null
        : transferIndex % 2 === 1 ? firstWarehouse.id : secondWarehouse.id;
      const destinationWarehouseId = transferIndex % 2 === 0 ? firstWarehouse.id : secondWarehouse.id;
      await MaterialsService.transferStock({
        materialId: material.id,
        sourceWarehouseId,
        destinationWarehouseId,
        quantity: transferIndex === 0 ? 200 : 1,
        reason: `${demoPrefix}: transfert ${month.key} #${serial}`,
        idempotencyKey: `${demoPrefix}-ST-${month.key}-${serial}`,
      }, entity.id, actors.stockActor);
      stockTransferCount += 1;
    }

    for (let index = 0; index < 30; index += 1) {
      const serial = String(index + 1).padStart(2, '0');
      const date = dayInMonth(month.key, Math.min(28, 25 + (index % 3)));
      const amount = 10 + monthIndex + index;
      await postManualJournal({
        entryNumber: `${demoPrefix}-JE-${month.key}-${serial}`,
        date,
        reference: `${demoPrefix}-JE-${month.key}-${serial}`,
        description: `${demoPrefix}: charge courue autonome de démonstration`,
        lines: [
          { accountCode: '601', debit: amount, credit: 0, description: `${demoPrefix}: charge synthétique` },
          { accountCode: '401', debit: 0, credit: amount, description: `${demoPrefix}: contrepartie fournisseur synthétique` },
        ],
      }, entity.id, actors);
    }
  }

  for (const plan of payments) {
    const amount = plan.direction === 'IN' ? plan.amount : -plan.amount;
    const journal = await postManualJournal({
      entryNumber: `${demoPrefix}-BANK-${plan.reference}`,
      date: plan.date,
      reference: `${demoPrefix}-BANK-${plan.reference}`,
      description: plan.description,
      lines: plan.direction === 'IN'
        ? [
          { accountCode: '532', debit: amount, credit: 0, description: plan.description },
          { accountCode: '411', debit: 0, credit: amount, description: plan.description },
        ]
        : [
          { accountCode: '401', debit: -amount, credit: 0, description: plan.description },
          { accountCode: '532', debit: 0, credit: -amount, description: plan.description },
        ],
    }, entity.id, actors);
    const bankLine = journal.lines.find((line) => line.accountCode === '532');
    if (!bankLine) throw new Error(`L’écriture ${journal.entryNumber} ne contient pas la ligne bancaire attendue.`);
    plan.journalLineId = bankLine.id;
  }

  payments.sort((left, right) => left.date.localeCompare(right.date) || left.reference.localeCompare(right.reference));
  for (const plan of payments) {
    runningBalance += plan.direction === 'IN' ? plan.amount : -plan.amount;
    bankStatementRows.push({ plan, balance: runningBalance });
  }
  const csv = [
    'date,description,amount,reference,balance',
    ...bankStatementRows.map(({ plan, balance }) => [
      plan.date,
      `"${plan.description.replace(/"/g, '""')}"`,
      money(plan.direction === 'IN' ? plan.amount : -plan.amount),
      plan.reference,
      money(balance),
    ].join(',')),
  ].join('\r\n');
  const statement = await CashflowBankingService.importStatement({
    bankAccountId: bankAccount.id,
    csv,
    importedByUserId: actors.creator.id,
  }, entity.id);
  const statementLines = await prisma.bankStatementLine.findMany({
    where: { statementId: statement.id },
    select: { id: true, externalReference: true },
  });
  const lineByReference = new Map(statementLines.map((line) => [line.externalReference, line.id]));
  if (statementLines.length !== payments.length) {
    throw new Error(`Relevé DEMO incomplet : ${statementLines.length}/${payments.length} lignes importées.`);
  }
  for (const plan of payments) {
    const statementLineId = lineByReference.get(plan.reference);
    if (!statementLineId || !plan.journalLineId) {
      throw new Error(`Ligne de relevé ou d’écriture manquante pour ${plan.reference}.`);
    }
    await CashflowBankingService.reconcile({
      statementLineId,
      journalLineId: plan.journalLineId,
      userId: actors.approver.id,
    }, entity.id);
    await CashflowBankingService.allocatePayment({
      statementLineId,
      ...(plan.invoiceId ? { invoiceId: plan.invoiceId } : {}),
      ...(plan.purchaseInvoiceId ? { purchaseInvoiceId: plan.purchaseInvoiceId } : {}),
    }, entity.id, actors.poster.id);
  }
  return { salesCount: payments.filter((payment) => payment.direction === 'IN').length, purchaseCount: payments.filter((payment) => payment.direction === 'OUT').length, stockTransferCount };
}

async function auditMonthlyDemo(entityId: string) {
  const [sales, purchases, transfers, journals, material, bankAccount] = await Promise.all([
    prisma.invoice.findMany({
      where: { entityId, customer: { code: customerCode } },
      select: { status: true, postingJournalEntryId: true, items: { select: { description: true } } },
    }),
    prisma.purchaseInvoice.findMany({
      where: { entityId, invoiceNumber: { startsWith: `${demoPrefix}-AP-` } },
      select: { invoiceNumber: true, taxRate: true, taxRateCode: true, status: true, postingJournalEntryId: true },
    }),
    prisma.stockTransfer.findMany({
      where: { entityId, idempotencyKey: { startsWith: `${demoPrefix}-ST-` } },
      select: { id: true, idempotencyKey: true },
    }),
    prisma.journalEntry.findMany({
      where: { entityId, reference: { startsWith: `${demoPrefix}-JE-` } },
      select: { reference: true, status: true, reversesEntryId: true },
    }),
    prisma.material.findUnique({ where: { sku: materialSku }, select: { id: true } }),
    prisma.bankAccount.findFirst({ where: { entityId, name: bankAccountName }, select: { id: true } }),
  ]);
  const [bankLines, stockMovements, taggedJournals] = await Promise.all([
    bankAccount
      ? prisma.bankStatementLine.findMany({
        where: {
          entityId,
          bankAccountId: bankAccount.id,
          externalReference: { startsWith: `${demoPrefix}-` },
        },
        select: {
          externalReference: true,
          reconciliation: {
            select: {
              journalLine: {
                select: {
                  journalEntry: { select: { reference: true, status: true } },
                },
              },
            },
          },
          cashflowPayment: { select: { invoiceId: true, purchaseInvoiceId: true, direction: true } },
        },
      })
      : Promise.resolve([]),
    material && transfers.length
      ? prisma.stockMovement.findMany({
        where: { entityId, materialId: material.id, transferId: { in: transfers.map(({ id }) => id) } },
        select: { transferId: true, reason: true },
      })
      : Promise.resolve([]),
    prisma.journalEntry.findMany({
      where: { entityId, reference: { startsWith: `${demoPrefix}-` } },
      select: { status: true, reversesEntryId: true, lines: { select: { debit: true, credit: true } } },
    }),
  ]);
  const movementsByTransfer = new Map<string, number>();
  for (const movement of stockMovements) {
    if (movement.transferId) movementsByTransfer.set(movement.transferId, (movementsByTransfer.get(movement.transferId) ?? 0) + 1);
  }
  const reconciledBankLines = bankLines.filter((line) => {
    const journal = line.reconciliation?.journalLine.journalEntry;
    return journal?.status === 'POSTED' && journal.reference?.startsWith(`${demoPrefix}-BANK-`);
  }).length;
  const allocatedPayments = bankLines.filter((line) => {
    const payment = line.cashflowPayment;
    if (!payment) return false;
    return payment.invoiceId !== null && payment.purchaseInvoiceId === null && payment.direction === 'CUSTOMER_RECEIPT'
      || payment.invoiceId === null && payment.purchaseInvoiceId !== null && payment.direction === 'SUPPLIER_PAYMENT';
  });
  const unbalancedDemoJournals = taggedJournals.filter((journal) => {
    const debitMillimes = Math.round(journal.lines.reduce((sum, line) => sum + Number(line.debit), 0) * 1000);
    const creditMillimes = Math.round(journal.lines.reduce((sum, line) => sum + Number(line.credit), 0) * 1000);
    return journal.lines.length === 0 || debitMillimes !== creditMillimes;
  }).length;
  const monthly = new Map<string, { sales: number; purchases: number; transfers: number; journals: number }>();
  const increment = (month: string | undefined, key: 'sales' | 'purchases' | 'transfers' | 'journals') => {
    if (!month) return;
    const counts = monthly.get(month) ?? { sales: 0, purchases: 0, transfers: 0, journals: 0 };
    counts[key] += 1;
    monthly.set(month, counts);
  };
  for (const invoice of sales) {
    const description = invoice.items.find((item) => item.description.startsWith(`${demoPrefix}: vente synthétique `))?.description;
    increment(description?.match(/20\d{2}-\d{2}/)?.[0], 'sales');
  }
  for (const invoice of purchases) increment(invoice.invoiceNumber.match(/20\d{2}-\d{2}/)?.[0], 'purchases');
  for (const transfer of transfers) increment(transfer.idempotencyKey.match(/20\d{2}-\d{2}/)?.[0], 'transfers');
  for (const journal of journals) increment(journal.reference?.match(/20\d{2}-\d{2}/)?.[0], 'journals');
  return {
    totals: {
      sales: sales.length,
      purchases: purchases.length,
      transfers: transfers.length,
      independentJournals: journals.length,
      bankStatementLines: bankLines.length,
      reconciledBankLines,
      allocatedPayments: allocatedPayments.length,
      allocatedSales: allocatedPayments.filter((line) => line.cashflowPayment?.invoiceId !== null).length,
      allocatedPurchases: allocatedPayments.filter((line) => line.cashflowPayment?.purchaseInvoiceId !== null).length,
      stockMovements: stockMovements.length,
      invalidStockTransferMovementCount: transfers.filter(({ id }) => movementsByTransfer.get(id) !== 2).length,
      invalidStockMovementReasonCount: stockMovements.filter((movement) => !movement.reason.startsWith(`${demoPrefix}:`)).length,
      taggedJournals: taggedJournals.length,
      unbalancedDemoJournals,
      nonPostedDemoJournals: taggedJournals.filter((journal) => journal.status !== 'POSTED' || journal.reversesEntryId !== null).length,
    },
    months: [...monthly.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([month, counts]) => ({ month, ...counts })),
    nonIssuedSales: sales.filter((invoice) => (invoice.status !== 'ISSUED' && invoice.status !== 'PAID')
      || !invoice.postingJournalEntryId).length,
    nonPostedJournals: journals.filter((journal) => journal.status !== 'POSTED' || journal.reversesEntryId !== null).length,
    nonPostedPurchases: purchases.filter((invoice) => invoice.status !== 'POSTED' || !invoice.postingJournalEntryId).length,
    purchaseVatRates: [...new Set(purchases.map((invoice) => `${invoice.taxRateCode} (${invoice.taxRate}%)`))].sort(),
  };
}

async function removeMonthlyDemo(entityId: string) {
  const customer = await prisma.customer.findFirst({ where: { entityId, code: customerCode }, select: { id: true } });
  const vendor = await prisma.vendor.findUnique({ where: { code: vendorCode }, select: { id: true } });
  const material = await prisma.material.findUnique({ where: { sku: materialSku }, select: { id: true } });
  const bankAccount = await prisma.bankAccount.findFirst({
    where: { entityId, name: bankAccountName },
    select: { id: true },
  });
  const invoices = customer
    ? await prisma.invoice.findMany({
      where: { entityId, customerId: customer.id },
      select: { id: true, postingJournalEntryId: true, items: { select: { description: true } } },
    })
    : [];
  const purchaseInvoices = vendor
    ? await prisma.purchaseInvoice.findMany({
      where: { entityId, vendorId: vendor.id },
      select: { id: true, invoiceNumber: true, postingJournalEntryId: true },
    })
    : [];
  if (invoices.some((invoice) => invoice.items.length === 0 || invoice.items.some((item) => !item.description.startsWith(`${demoPrefix}:`)))) {
    throw new Error('Nettoyage interrompu : le client DEMO est lié à une facture non-DEMO.');
  }
  if (purchaseInvoices.some((invoice) => !invoice.invoiceNumber.startsWith(`${demoPrefix}-AP-`))) {
    throw new Error('Nettoyage interrompu : le fournisseur DEMO est lié à une facture non-DEMO.');
  }

  const transfers = material
    ? await prisma.stockTransfer.findMany({
      where: { entityId, materialId: material.id },
      select: { id: true, idempotencyKey: true, reason: true },
    })
    : [];
  const movements = material
    ? await prisma.stockMovement.findMany({
      where: { entityId, materialId: material.id },
      select: { reason: true },
    })
    : [];
  if (transfers.some((transfer) => !transfer.idempotencyKey.startsWith(`${demoPrefix}-ST-`) || !transfer.reason.startsWith(`${demoPrefix}:`))
    || movements.some((movement) => !movement.reason.startsWith(`${demoPrefix}:`))) {
    throw new Error('Nettoyage interrompu : l’article DEMO comporte des mouvements hors de ce jeu.');
  }

  const statements = bankAccount
    ? await prisma.bankStatement.findMany({ where: { entityId, bankAccountId: bankAccount.id }, select: { id: true } })
    : [];
  const statementIds = statements.map((statement) => statement.id);
  const statementLines = statementIds.length
    ? await prisma.bankStatementLine.findMany({
      where: { statementId: { in: statementIds } },
      select: { id: true, externalReference: true },
    })
    : [];
  if (statementLines.some((line) => !line.externalReference?.startsWith(`${demoPrefix}-`))) {
    throw new Error('Nettoyage interrompu : le compte bancaire DEMO contient des lignes hors de ce jeu.');
  }
  const statementLineIds = statementLines.map((line) => line.id);
  const linkedPayments = await prisma.cashflowPayment.findMany({
    where: {
      OR: [
        { statementLineId: { in: statementLineIds } },
        { invoiceId: { in: invoices.map((invoice) => invoice.id) } },
        { purchaseInvoiceId: { in: purchaseInvoices.map((invoice) => invoice.id) } },
      ],
    },
    select: { id: true, statementLineId: true },
  });
  if (linkedPayments.some((payment) => !statementLineIds.includes(payment.statementLineId))) {
    throw new Error('Nettoyage interrompu : une facture DEMO a un règlement externe au relevé DEMO.');
  }

  const journalIds = new Set([
    ...invoices.flatMap((invoice) => invoice.postingJournalEntryId ? [invoice.postingJournalEntryId] : []),
    ...purchaseInvoices.flatMap((invoice) => invoice.postingJournalEntryId ? [invoice.postingJournalEntryId] : []),
    ...((await prisma.journalEntry.findMany({
      where: { entityId, reference: { startsWith: `${demoPrefix}-` } },
      select: { id: true },
    })).map((entry) => entry.id)),
  ]);
  const journalIdList = [...journalIds];
  const journalRecords = journalIdList.length
    ? await prisma.journalEntry.findMany({
      where: { id: { in: journalIdList } },
      select: { id: true, reversesEntryId: true },
    })
    : [];
  if (journalRecords.some((entry) => entry.reversesEntryId)) {
    throw new Error('Nettoyage interrompu : une écriture DEMO a une contrepassation; préservez l’historique.');
  }
  const reversedDemoEntry = journalIdList.length
    ? await prisma.journalEntry.findFirst({
      where: { reversesEntryId: { in: journalIdList }, entityId },
      select: { id: true },
    })
    : null;
  if (reversedDemoEntry) throw new Error('Nettoyage interrompu : une écriture DEMO a été contrepassée; préservez l’historique.');
  const journalLines = journalIdList.length
    ? await prisma.journalLine.findMany({ where: { journalEntryId: { in: journalIdList } }, select: { id: true } })
    : [];
  const journalLineIds = journalLines.map((line) => line.id);

  await prisma.$transaction(async (transaction) => {
    if (statementLineIds.length) {
      await transaction.bankReconciliation.deleteMany({ where: { statementLineId: { in: statementLineIds } } });
    }
    if (journalLineIds.length) {
      await transaction.bankReconciliation.deleteMany({ where: { journalLineId: { in: journalLineIds } } });
    }
    if (linkedPayments.length) await transaction.cashflowPayment.deleteMany({ where: { id: { in: linkedPayments.map((payment) => payment.id) } } });
    if (statementLineIds.length) await transaction.bankStatementLine.deleteMany({ where: { id: { in: statementLineIds } } });
    if (statementIds.length) await transaction.bankStatement.deleteMany({ where: { id: { in: statementIds } } });
    if (invoices.length) {
      const invoiceIds = invoices.map((invoice) => invoice.id);
      await transaction.salesInvoiceWorkflowEvent.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await transaction.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await transaction.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    }
    if (purchaseInvoices.length) {
      const purchaseInvoiceIds = purchaseInvoices.map((invoice) => invoice.id);
      await transaction.purchaseInvoiceWorkflowEvent.deleteMany({ where: { purchaseInvoiceId: { in: purchaseInvoiceIds } } });
      await transaction.purchaseInvoice.deleteMany({ where: { id: { in: purchaseInvoiceIds } } });
    }
    if (material) {
      await transaction.stockMovement.deleteMany({ where: { entityId, materialId: material.id } });
      await transaction.stockTransfer.deleteMany({ where: { entityId, materialId: material.id } });
      await transaction.materialWarehouseStock.deleteMany({ where: { entityId, materialId: material.id } });
      await transaction.material.delete({ where: { id: material.id } });
    }
    await transaction.warehouse.deleteMany({ where: { entityId, code: { in: warehouseCodes } } });
    if (journalIdList.length) {
      await transaction.journalEntryWorkflowEvent.deleteMany({ where: { journalEntryId: { in: journalIdList } } });
      await transaction.journalLine.deleteMany({ where: { journalEntryId: { in: journalIdList } } });
      await transaction.journalEntry.deleteMany({ where: { id: { in: journalIdList } } });
    }
    if (customer) await transaction.customer.delete({ where: { id: customer.id } });
    if (vendor) await transaction.vendor.delete({ where: { id: vendor.id } });
    if (bankAccount) await transaction.bankAccount.delete({ where: { id: bankAccount.id } });
  });
}

async function main() {
  assertDraftDirectory();
  const databasePath = resolve(__dirname, '../data/data.db');
  if (!existsSync(databasePath)) throw new Error('Base de données du draft introuvable; aucune donnée n’a été créée.');
  const removing = process.argv.includes('--remove');
  const dryRun = process.argv.includes('--dry-run');
  const { entity, zeroRate, salesRate } = await getPrerequisites(!removing && !dryRun);
  if (removing) {
    const backupPath = await createDatabaseBackup(databasePath);
    await removeMonthlyDemo(entity.id);
    console.log(`Jeu DEMO mensuel supprimé sans toucher aux autres données. Sauvegarde : ${backupPath}`);
    return;
  }
  const actors = await getActors();
  if (dryRun) {
    const audit = await auditMonthlyDemo(entity.id);
    const expectedMonths = makePeriod().map((month) => month.key);
    const complete = audit.totals.sales === 360
      && audit.totals.purchases === 360
      && audit.totals.transfers === 360
      && audit.totals.independentJournals === 360
      && audit.totals.bankStatementLines === 720
      && audit.totals.reconciledBankLines === 720
      && audit.totals.allocatedPayments === 720
      && audit.totals.allocatedSales === 360
      && audit.totals.allocatedPurchases === 360
      && audit.totals.stockMovements === 720
      && audit.totals.invalidStockTransferMovementCount === 0
      && audit.totals.invalidStockMovementReasonCount === 0
      && audit.totals.taggedJournals === 1440
      && audit.totals.unbalancedDemoJournals === 0
      && audit.totals.nonPostedDemoJournals === 0
      && audit.purchaseVatRates.length === 1
      && audit.purchaseVatRates[0] === 'TVA_19 (19%)'
      && expectedMonths.every((month) => {
        const counts = audit.months.find((entry) => entry.month === month);
        return counts?.sales === 30 && counts.purchases === 30 && counts.transfers === 30 && counts.journals === 30;
      })
      && audit.nonIssuedSales === 0
      && audit.nonPostedPurchases === 0
      && audit.nonPostedJournals === 0;
    console.log([
      `Audit DEMO en lecture seule : ${complete ? 'jeu complet' : 'jeu absent ou incomplet'}.`,
      `Période attendue : ${expectedMonths[0]} → ${expectedMonths[expectedMonths.length - 1]}.`,
      `Opérations primaires : ${audit.totals.sales} ventes, ${audit.totals.purchases} achats, ${audit.totals.transfers} transferts de stock, ${audit.totals.independentJournals} écritures indépendantes.`,
      `Liens contrôlés : ${audit.totals.bankStatementLines} lignes bancaires, ${audit.totals.reconciledBankLines} rapprochements, ${audit.totals.allocatedPayments} règlements (${audit.totals.allocatedSales} ventes / ${audit.totals.allocatedPurchases} achats), ${audit.totals.stockMovements} mouvements de stock.`,
      `Journaux DEMO : ${audit.totals.taggedJournals}, non équilibrés ${audit.totals.unbalancedDemoJournals}, non comptabilisés/contrepassés ${audit.totals.nonPostedDemoJournals}.`,
      `Taux TVA achats réellement présents : ${audit.purchaseVatRates.join(', ') || 'aucun'}. Le taux configuré pour une nouvelle génération est ${salesRate.rate}%.`,
      `Statuts non finalisés : ventes ${audit.nonIssuedSales}, achats ${audit.nonPostedPurchases}, écritures ${audit.nonPostedJournals}.`,
      ...audit.months.map((month) => `${month.month} : ventes ${month.sales}, achats ${month.purchases}, transferts ${month.transfers}, écritures ${month.journals}.`),
      'Aucune donnée n’a été créée, modifiée ou supprimée.',
    ].join('\n'));
    if (!complete) process.exitCode = 2;
    return;
  }
  const backupPath = await createDatabaseBackup(databasePath);
  try {
    const result = await setupMonthlyDemo(entity, salesRate.id, actors);
    console.log([
      'Jeu synthétique DEMO créé dans SAFE_ERP-DRAFT 1.',
      `Période : ${makePeriod().map((month) => month.key).join(' → ')}.`,
      `Opérations primaires : ${result.salesCount} ventes, ${result.purchaseCount} achats, ${result.stockTransferCount} transferts de stock et 360 écritures comptables indépendantes.`,
      'Encaissements/paiements, relevé, rapprochements et journaux générés sont des éléments dérivés liés. Aucun prélèvement de stock ni écriture de picking n’a été créé.',
      'Les achats DEMO utilisent la TVA tunisienne à 19% et le compte déductible 4366. Le stock d’ouverture DEMO est non comptabilisé, car les comptes de stock historiques ne sont pas validés.',
      `Sauvegarde préalable : ${backupPath}`,
    ].join('\n'));
  } catch (error) {
    console.error(`Échec de la génération. La sauvegarde antérieure est conservée à ${backupPath}.`);
    console.error(`Si des lignes DEMO partielles ont été créées, vérifiez-les puis lancez npm run demo:monthly:remove.`);
    throw error;
  }
}

main()
  .catch((error: unknown) => {
    console.error('Erreur de gestion du jeu DEMO mensuel:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
