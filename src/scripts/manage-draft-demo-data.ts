import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import sqlite3 from 'sqlite3';
import { PrismaClient } from '@prisma/client';
import FinanceService from '../application/modules/finance/service';
import MaterialsService from '../application/modules/materials/service';
import PurchasesService from '../application/modules/purchases/service';
import SalesService from '../application/modules/sales/service';
import CashflowBankingService from '../application/modules/cashflow/banking-service';

const prisma = new PrismaClient();
const draftDirectoryName = 'SAFE_ERP-DRAFT 1';
const entityCode = 'TN01';
const demoCustomerCode = 'DEMO-CLT-001';
const demoVendorCode = 'DEMO-FRN-001';
const demoMaterialSku = 'DEMO-ITEM-001';
const demoWarehouseCode = 'DEMO-WH-001';
const demoBankName = 'DEMO - Banque de test';
const demoPurchaseInvoiceNumber = 'DEMO-FRN-2026-001';
const demoJournalReference = 'DEMO-OPENING-001';

function assertDraftDirectory() {
  if (basename(resolve(process.cwd())).toLocaleLowerCase() !== draftDirectoryName.toLocaleLowerCase()) {
    throw new Error(`Opération refusée : lancez ce script depuis le dossier ${draftDirectoryName}.`);
  }
}

function createDatabaseBackup(databasePath: string): Promise<string> {
  const backupPath = `${databasePath}.demo-backup-${new Date().toISOString().replace(/[-:.TZ]/g, '')}.sqlite`;
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

async function removeDemoRecords(entityId: string) {
  const bankAccount = await prisma.bankAccount.findFirst({
    where: { entityId, name: demoBankName },
    select: { id: true },
  });
  if (bankAccount) {
    const statements = await prisma.bankStatement.findMany({
      where: { entityId, bankAccountId: bankAccount.id },
      select: { id: true },
    });
    const statementIds = statements.map(({ id }) => id);
    if (statementIds.length) {
      const statementLines = await prisma.bankStatementLine.findMany({
        where: { statementId: { in: statementIds } },
        select: { id: true, reconciliation: { select: { id: true } }, cashflowPayment: { select: { id: true } } },
      });
      if (statementLines.some((line) => line.reconciliation || line.cashflowPayment)) {
        throw new Error('Nettoyage interrompu : une opération DEMO est rapprochée ou allouée; conservez les traces et annulez d’abord ces liens via les parcours métier.');
      }
      await prisma.bankStatementLine.deleteMany({ where: { statementId: { in: statementIds } } });
      await prisma.bankStatement.deleteMany({ where: { id: { in: statementIds } } });
    }
    await prisma.bankAccount.delete({ where: { id: bankAccount.id } });
  }

  const demoCustomer = await prisma.customer.findFirst({
    where: { entityId, code: demoCustomerCode },
    select: { id: true },
  });
  if (demoCustomer) {
    const quotes = await prisma.salesQuote.findMany({
      where: { entityId, customerId: demoCustomer.id, items: { some: { description: { startsWith: 'DEMO:' } } } },
      select: { id: true },
    });
    const quoteIds = quotes.map(({ id }) => id);
    if (quoteIds.length) await prisma.salesQuoteItem.deleteMany({ where: { quoteId: { in: quoteIds } } });
    await prisma.salesQuote.deleteMany({ where: { id: { in: quoteIds } } });
    await prisma.customer.delete({ where: { id: demoCustomer.id } });
  }

  const purchase = await prisma.purchaseInvoice.findFirst({
    where: { entityId, invoiceNumber: demoPurchaseInvoiceNumber },
    select: { id: true, status: true, postingJournalEntryId: true },
  });
  if (purchase && (purchase.postingJournalEntryId || purchase.status !== 'TO_REVIEW')) {
    throw new Error('Nettoyage interrompu : la facture DEMO a avancé dans son circuit de validation/comptabilisation. Préservez son historique.');
  }
  if (purchase) {
    await prisma.purchaseInvoiceWorkflowEvent.deleteMany({ where: { purchaseInvoiceId: purchase.id } });
    await prisma.purchaseInvoice.delete({ where: { id: purchase.id } });
  }
  const vendor = await prisma.vendor.findUnique({ where: { code: demoVendorCode }, select: { id: true } });
  if (vendor) await prisma.vendor.delete({ where: { id: vendor.id } });

  const material = await prisma.material.findUnique({
    where: { sku: demoMaterialSku },
    select: { id: true, entityId: true, quantity: true },
  });
  if (material) {
    const movements = await prisma.stockMovement.findMany({
      where: { entityId, materialId: material.id },
      select: { id: true, deltaQuantity: true, reason: true },
    });
    if (material.quantity !== 5 || movements.some((movement) => !movement.reason.startsWith('DEMO:'))) {
      throw new Error('Nettoyage interrompu : l’article DEMO a été modifié; vérifiez son stock et ses mouvements avant suppression.');
    }
    await prisma.materialWarehouseStock.deleteMany({ where: { materialId: material.id, entityId } });
    await prisma.stockMovement.deleteMany({ where: { materialId: material.id, entityId } });
    const stockJournalEntries = await prisma.journalEntry.findMany({
      where: { entityId, reference: { startsWith: `STOCK-${demoMaterialSku}-` } },
      select: { id: true, reversesEntryId: true },
    });
    if (stockJournalEntries.some((entry) => entry.reversesEntryId)) {
      throw new Error('Nettoyage interrompu : le journal de stock DEMO a une contrepassation; préservez l’historique comptable.');
    }
    const journalIds = stockJournalEntries.map(({ id }) => id);
    if (journalIds.length) {
      const reconciliation = await prisma.bankReconciliation.findFirst({
        where: { journalLine: { journalEntryId: { in: journalIds } } },
        select: { id: true },
      });
      if (reconciliation) throw new Error('Nettoyage interrompu : le journal DEMO de stock est rapproché.');
      await prisma.journalEntryWorkflowEvent.deleteMany({ where: { journalEntryId: { in: journalIds } } });
      await prisma.journalLine.deleteMany({ where: { journalEntryId: { in: journalIds } } });
      await prisma.journalEntry.deleteMany({ where: { id: { in: journalIds } } });
    }
    await prisma.material.delete({ where: { id: material.id } });
  }
  const warehouse = await prisma.warehouse.findFirst({ where: { entityId, code: demoWarehouseCode } });
  if (warehouse) await prisma.warehouse.delete({ where: { id: warehouse.id } });

  const draftJournal = await prisma.journalEntry.findFirst({
    where: { entityId, reference: demoJournalReference },
    select: { id: true, status: true, reversesEntryId: true },
  });
  if (draftJournal && (draftJournal.status !== 'TO_REVIEW' || draftJournal.reversesEntryId)) {
    throw new Error('Nettoyage interrompu : l’écriture DEMO a avancé dans le circuit comptable; préservez son historique.');
  }
  if (draftJournal) {
    await prisma.journalEntryWorkflowEvent.deleteMany({ where: { journalEntryId: draftJournal.id } });
    await prisma.journalLine.deleteMany({ where: { journalEntryId: draftJournal.id } });
    await prisma.journalEntry.delete({ where: { id: draftJournal.id } });
  }
}

async function main() {
  assertDraftDirectory();
  const databasePath = resolve(__dirname, '../data/data.db');
  if (!existsSync(databasePath)) throw new Error('Base de données du draft introuvable; aucune donnée n’a été créée.');
  const entity = await prisma.entity.findUnique({
    where: { code: entityCode },
    select: { id: true, countryId: true, country: { select: { currencyCode: true, stockAssetAccountCode: true, stockAdjustmentAccountCode: true } } },
  });
  if (!entity) throw new Error(`Société ${entityCode} introuvable dans la base du draft.`);
  const actor = await prisma.user.findUnique({ where: { username: 'admin' }, select: { id: true, username: true } });
  if (!actor) throw new Error('Compte administrateur du draft introuvable.');

  if (process.argv.includes('--remove')) {
    const backupPath = await createDatabaseBackup(databasePath);
    try {
      await removeDemoRecords(entity.id);
      console.log(`Données DEMO supprimées de la base draft. Sauvegarde créée : ${backupPath}`);
    } catch (error) {
      console.error(`Nettoyage non effectué; la sauvegarde est conservée à ${backupPath}.`);
      throw error;
    }
    return;
  }

  const [existingCustomer, existingVendor, existingMaterial, existingPurchase, existingJournal, existingBank] = await Promise.all([
    prisma.customer.findFirst({ where: { entityId: entity.id, code: demoCustomerCode }, select: { id: true } }),
    prisma.vendor.findUnique({ where: { code: demoVendorCode }, select: { id: true } }),
    prisma.material.findUnique({ where: { sku: demoMaterialSku }, select: { id: true } }),
    prisma.purchaseInvoice.findFirst({ where: { entityId: entity.id, invoiceNumber: demoPurchaseInvoiceNumber }, select: { id: true } }),
    prisma.journalEntry.findFirst({ where: { entityId: entity.id, reference: demoJournalReference }, select: { id: true } }),
    prisma.bankAccount.findFirst({ where: { entityId: entity.id, name: demoBankName }, select: { id: true } }),
  ]);
  if (existingCustomer || existingVendor || existingMaterial || existingPurchase || existingJournal || existingBank) {
    throw new Error('Un jeu DEMO existe déjà ou est partiel. Aucune donnée n’a été écrite; vérifiez puis utilisez --remove avant une nouvelle installation.');
  }

  const userNote = 'DEMO: données synthétiques de prototype, sans valeur opérationnelle.';
  const [rate, accounts] = await Promise.all([
    prisma.taxRate.findFirst({ where: { countryId: entity.countryId, code: 'TVA_19' }, select: { id: true } }),
    prisma.chartOfAccount.findMany({
      where: { countryId: entity.countryId, code: { in: ['101', '532', entity.country.stockAssetAccountCode ?? '', entity.country.stockAdjustmentAccountCode ?? ''] } },
      select: { code: true, isPostingAllowed: true },
    }),
  ]);
  const requiredAccounts = ['101', '532', entity.country.stockAssetAccountCode, entity.country.stockAdjustmentAccountCode].filter(
    (code): code is string => Boolean(code),
  );
  const postingCodes = new Set(accounts.filter((account) => account.isPostingAllowed).map((account) => account.code));
  const missingAccounts = [...new Set(requiredAccounts)].filter((code) => !postingCodes.has(code));
  if (!rate || missingAccounts.length) {
    throw new Error(`Préconditions DEMO manquantes : ${[
      !rate ? 'taux TVA_19 configuré' : '',
      missingAccounts.length ? `comptes comptabilisables ${missingAccounts.join(', ')}` : '',
    ].filter(Boolean).join('; ')}. Aucun paramètre métier n’a été modifié.`);
  }

  const backupPath = await createDatabaseBackup(databasePath);
  try {
    const customer = await prisma.customer.create({
      data: {
        code: demoCustomerCode,
        name: 'Client de démonstration SAFE',
        email: 'demo-client@example.invalid',
        entityId: entity.id,
      },
    });
    const vendor = await prisma.vendor.create({
      data: {
        code: demoVendorCode,
        name: 'Fournisseur de démonstration SAFE',
        email: 'demo-vendor@example.invalid',
        entityId: entity.id,
      },
    });

    await SalesService.createQuote({
      customerId: customer.id,
      entityId: entity.id,
      items: [{ description: 'DEMO: lot de composants synthétiques', quantity: 2, unitPrice: 125, taxRate: 19 }],
    }, actor);
    await PurchasesService.createDraftInvoice({
      invoiceNumber: demoPurchaseInvoiceNumber,
      vendorId: vendor.id,
      issueDate: '2026-11-01',
      dueDate: '2026-11-30',
      subTotal: 250,
      taxRateId: rate.id,
      documentCurrencyCode: entity.country.currencyCode,
    }, entity.id, actor);

    const material = await MaterialsService.createMaterial({
      sku: demoMaterialSku,
      name: 'Article de démonstration SAFE',
      unitCode: 'EA',
      quantity: 0,
      minimumStock: 2,
      unitPrice: 50,
      costPrice: 25,
    }, entity.id, actor);
    const warehouse = await MaterialsService.createWarehouse({
      code: demoWarehouseCode,
      name: 'Dépôt de démonstration SAFE',
    }, entity.id);
    await MaterialsService.updateStock(material.id, entity.id, 5, userNote, actor);
    await prisma.materialWarehouseStock.create({
      data: { entityId: entity.id, materialId: material.id, warehouseId: warehouse.id, quantity: 5 },
    });

    const bankAccount = await prisma.bankAccount.create({
      data: {
        entityId: entity.id,
        name: demoBankName,
        currencyCode: entity.country.currencyCode,
        ledgerAccountCode: '532',
        isActive: true,
      },
    });
    const csv = [
      'date,description,amount,reference,balance',
      '2026-11-03,"DEMO: virement client à rapprocher",250.000,DEMO-BANK-IN-001,250.000',
      '2026-11-04,"DEMO: règlement fournisseur à rapprocher",-75.000,DEMO-BANK-OUT-001,175.000',
    ].join('\r\n');
    await CashflowBankingService.importStatement({
      bankAccountId: bankAccount.id,
      csv,
      importedByUserId: actor.id,
    }, entity.id);

    await FinanceService.createJournalEntry({
      entryNumber: 'DEMO-JE-2026-001',
      entityId: entity.id,
      date: '2026-11-01',
      reference: demoJournalReference,
      description: 'DEMO: écriture équilibrée à contrôler, non comptabilisée',
      lines: [
        { accountCode: '532', debit: 1000, credit: 0, description: 'DEMO: solde bancaire synthétique' },
        { accountCode: '101', debit: 0, credit: 1000, description: 'DEMO: contrepartie synthétique' },
      ],
    }, actor, userNote);
  } catch (error) {
    console.error('Échec de préparation du jeu DEMO; tentative de nettoyage des seules références DEMO créées.');
    try {
      await removeDemoRecords(entity.id);
    } catch (cleanupError) {
      console.error('Nettoyage automatique incomplet; la sauvegarde permet de revenir à l’état antérieur.', cleanupError);
    }
    throw error;
  }

  console.log([
    'Jeu synthétique DEMO créé dans SAFE_ERP-DRAFT 1.',
    'Éléments : devis client; facture fournisseur à contrôler; article et dépôt avec ajustement de stock et journal synthétique; relevé bancaire non rapproché; écriture équilibrée à contrôler.',
    'Aucun paiement n’est alloué et aucun encaissement bancaire n’est rapproché. Les factures de vente restent bloquées tant que les comptes pays de vente ne sont pas configurés; aucune règle n’a été inventée.',
    `Sauvegarde préalable : ${backupPath}`,
  ].join('\n'));
}

main()
  .catch((error: unknown) => {
    console.error('Erreur de gestion des données de démonstration:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
