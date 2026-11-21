import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import { FinanceService } from '../finance/service';
import { MaterialsService } from '../materials/service';
import { PurchasesService } from './service';
import { SalesService } from '../sales/service';
import CashflowBankingService from '../cashflow/banking-service';

const suffix = randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
let entityId = '';
let taxRateId = '';
let vendorId = '';
let customerId = '';
let creator = { id: '', username: '' };
let reviewer = { id: '', username: '' };
let poster = { id: '', username: '' };

before(async () => {
  const country = await prisma.countryProfile.create({
    data: {
      code: `T${suffix}`,
      name: `TEST workflow ${suffix}`,
      currencyCode: 'TND',
      currencySymbol: 'TEST',
      stampDuty: 0,
      corporateTax: 0,
      salesReceivableAccountCode: 'TEST-AR',
      salesRevenueAccountCode: 'TEST-SALES',
      salesVatAccountCode: 'TEST-SALES-VAT',
      purchaseExpenseAccountCode: 'TEST-PURCHASE-EXP',
      purchaseVatAccountCode: 'TEST-PURCHASE-VAT',
      stockAssetAccountCode: 'TEST-STOCK',
      stockAdjustmentAccountCode: 'TEST-STOCK-ADJ',
      taxRates: {
        create: [{
          code: 'TEST-VAT',
          name: 'TEST synthetic VAT',
          rate: 19,
          isDefault: true,
          purchaseVatRecoverable: true,
        }],
      },
      accounts: {
        create: [
          { code: 'TEST-AR', description: 'TEST receivable', classNumber: 4, type: 'Asset' },
          { code: 'TEST-SALES', description: 'TEST revenue', classNumber: 7, type: 'Revenue' },
          { code: 'TEST-SALES-VAT', description: 'TEST sales VAT', classNumber: 4, type: 'Liability' },
          { code: 'TEST-PURCHASE-EXP', description: 'TEST purchase expense', classNumber: 6, type: 'Expense' },
          { code: 'TEST-OD-EXP', description: 'TEST manual journal expense', classNumber: 6, type: 'Expense' },
          { code: 'TEST-PURCHASE-VAT', description: 'TEST recoverable VAT', classNumber: 4, type: 'Asset' },
          { code: 'TEST-PAYABLE', description: 'TEST payable', classNumber: 4, type: 'Liability' },
          { code: 'TEST-BANK', description: 'TEST bank', classNumber: 5, type: 'Asset' },
          { code: 'TEST-STOCK', description: 'TEST stock', classNumber: 3, type: 'Asset' },
          { code: 'TEST-STOCK-ADJ', description: 'TEST stock adjustment', classNumber: 6, type: 'Expense' },
        ],
      },
    },
  });
  const entity = await prisma.entity.create({
    data: { code: `TEST-${suffix}`, name: `TEST entity ${suffix}`, countryId: country.id },
  });
  entityId = entity.id;
  taxRateId = (await prisma.taxRate.findFirstOrThrow({
    where: { countryId: country.id },
    select: { id: true },
  })).id;
  await prisma.cashflowAccountingMapping.create({
    data: { entityId, payableAccountCode: 'TEST-PAYABLE' },
  });
  const vendor = await prisma.vendor.create({
    data: { code: `TEST-V-${suffix}`, name: `TEST vendor ${suffix}`, entityId },
  });
  const customer = await prisma.customer.create({
    data: { code: `TEST-C-${suffix}`, name: `TEST customer ${suffix}`, entityId },
  });
  vendorId = vendor.id;
  customerId = customer.id;
  const actors = await Promise.all([
    prisma.user.create({
      data: { username: `TEST_creator_${suffix}`, passwordHash: 'TEST-not-a-login-hash', role: 'FINANCIAL_MANAGER', entityId },
    }),
    prisma.user.create({
      data: { username: `TEST_reviewer_${suffix}`, passwordHash: 'TEST-not-a-login-hash', role: 'FINANCIAL_MANAGER', entityId },
    }),
    prisma.user.create({
      data: { username: `TEST_poster_${suffix}`, passwordHash: 'TEST-not-a-login-hash', role: 'ADMIN', entityId },
    }),
  ]);
  [creator, reviewer, poster] = actors.map(({ id, username }) => ({ id, username }));
});

after(async () => {
  await prisma.$disconnect();
});

describe('isolated fictitious sales and purchase invoice workflow', () => {
  it('runs test-only invoices through persisted workflow and verifies one financial statement result', async () => {
    const manualEntry = await FinanceService.createJournalEntry({
      entryNumber: `TEST-OD-${suffix}`,
      entityId,
      date: '2026-10-29',
      description: `TEST manual journal ${suffix}`,
      reference: `TEST-${suffix}`,
      lines: [
        { accountCode: 'TEST-OD-EXP', debit: 25, credit: 0, description: 'TEST manual debit' },
        { accountCode: 'TEST-PAYABLE', debit: 0, credit: 25, description: 'TEST manual credit' },
      ],
    }, creator, `TEST: préparation écriture OD ${suffix}`);
    assert.equal(manualEntry.status, 'TO_REVIEW');
    assert.equal(await prisma.journalEntry.count({ where: { entityId, entryNumber: manualEntry.entryNumber, status: 'POSTED' } }), 0);

    await assert.rejects(
      FinanceService.approveJournalEntry(manualEntry.id, entityId, creator, `TEST: auto-approbation ${suffix}`),
      /personne différente/,
    );
    await FinanceService.approveJournalEntry(
      manualEntry.id,
      entityId,
      reviewer,
      `TEST: contrôle des comptes et de l'équilibre ${suffix}`,
    );
    await assert.rejects(
      FinanceService.postJournalEntry(manualEntry.id, entityId, reviewer, `TEST: auto-posting ${suffix}`),
      /identité distincte/,
    );
    const reportBeforeManualPosting = await FinanceService.getFinancialPeriodSummary(
      entityId,
      '2026-10-29',
      '2026-10-29',
      new Date('2026-10-30T00:00:00.000Z'),
    );
    assert.equal(reportBeforeManualPosting.totals.find(({ type }) => type === 'Revenue')?.movement, 0);
    assert.equal(reportBeforeManualPosting.totals.find(({ type }) => type === 'Expense')?.movement, 0);
    assert.equal(reportBeforeManualPosting.coverage.invalidJournalLineCount, 0);

    const postedManualEntry = await FinanceService.postJournalEntry(
      manualEntry.id,
      entityId,
      poster,
      `TEST: comptabilisation après approbation ${suffix}`,
    );
    assert.equal(postedManualEntry?.status, 'POSTED');
    const repeatedPost = await FinanceService.postJournalEntry(
      manualEntry.id,
      entityId,
      poster,
      `TEST: retry idempotent ${suffix}`,
    );
    assert.equal(repeatedPost?.id, postedManualEntry?.id);
    assert.equal(await prisma.journalEntry.count({ where: { entityId, entryNumber: manualEntry.entryNumber } }), 1);
    const reportAfterManualPosting = await FinanceService.getFinancialPeriodSummary(
      entityId,
      '2026-10-29',
      '2026-10-29',
      new Date('2026-10-30T00:00:00.000Z'),
    );
    assert.equal(reportAfterManualPosting.totals.find(({ type }) => type === 'Expense')?.movement, 25);
    const originalDebit = await prisma.journalLine.findFirstOrThrow({
      where: { journalEntryId: manualEntry.id, accountCode: 'TEST-OD-EXP' },
      select: { debit: true, credit: true },
    });
    const reversal = await FinanceService.createJournalReversal(
      manualEntry.id,
      entityId,
      creator,
      `TEST: correction de la pièce initiale ${suffix}`,
      '2026-11-01',
    );
    assert.ok(reversal);
    assert.equal(reversal?.status, 'TO_REVIEW');
    assert.equal(reversal?.reversesEntryId, manualEntry.id);
    const reversalDebit = reversal?.lines.find(({ accountCode }) => accountCode === 'TEST-OD-EXP');
    assert.deepEqual(
      { debit: reversalDebit?.debit, credit: reversalDebit?.credit },
      { debit: originalDebit.credit, credit: originalDebit.debit },
    );
    const retryReversal = await FinanceService.createJournalReversal(
      manualEntry.id,
      entityId,
      reviewer,
      `TEST: retry idempotent ${suffix}`,
      '2026-11-01',
    );
    assert.equal(retryReversal?.id, reversal?.id);
    assert.equal(await prisma.journalEntry.count({ where: { reversesEntryId: manualEntry.id } }), 1);
    const reportBeforeReversalPosting = await FinanceService.getFinancialPeriodSummary(
      entityId,
      '2026-10-29',
      '2026-10-30',
      new Date('2026-10-31T00:00:00.000Z'),
    );
    assert.equal(reportBeforeReversalPosting.totals.find(({ type }) => type === 'Expense')?.movement, 25);
    await FinanceService.approveJournalEntry(
      reversal.id,
      entityId,
      reviewer,
      `TEST: validation de la contrepassation ${suffix}`,
    );
    const reportAfterReversalApproval = await FinanceService.getFinancialPeriodSummary(
      entityId,
      '2026-10-29',
      '2026-10-30',
      new Date('2026-10-31T00:00:00.000Z'),
    );
    assert.equal(reportAfterReversalApproval.totals.find(({ type }) => type === 'Expense')?.movement, 25);
    const postedReversal = await FinanceService.postJournalEntry(
      reversal.id,
      entityId,
      poster,
      `TEST: posting de la contrepassation ${suffix}`,
    );
    assert.equal(postedReversal?.status, 'POSTED');
    const retryReversalPosting = await FinanceService.postJournalEntry(
      reversal.id,
      entityId,
      poster,
      `TEST: retry posting de la contrepassation ${suffix}`,
    );
    assert.equal(retryReversalPosting?.id, postedReversal?.id);
    assert.equal(await prisma.journalEntry.count({ where: { reversesEntryId: manualEntry.id } }), 1);
    const reportAfterReversalPosting = await FinanceService.getFinancialPeriodSummary(
      entityId,
      '2026-10-29',
      '2026-10-30',
      new Date('2026-10-31T00:00:00.000Z'),
    );
    assert.equal(reportAfterReversalPosting.totals.find(({ type }) => type === 'Expense')?.movement, 25);
    const reportInReversalPeriod = await FinanceService.getFinancialPeriodSummary(
      entityId,
      '2026-11-01',
      '2026-11-01',
      new Date('2026-11-02T00:00:00.000Z'),
    );
    assert.equal(reportInReversalPeriod.totals.find(({ type }) => type === 'Expense')?.movement, -25);
    const originalAfterReversal = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: manualEntry.id },
      select: { status: true, lines: { select: { debit: true, credit: true } } },
    });
    assert.equal(originalAfterReversal.status, 'POSTED');
    assert.equal(originalAfterReversal.lines.find(({ debit }) => debit === 25)?.debit, 25);
    const reversalAudit = await prisma.journalEntryWorkflowEvent.findMany({
      where: { journalEntryId: reversal.id },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });
    assert.deepEqual(reversalAudit.map(({ action }) => action), ['SUBMITTED', 'APPROVED', 'POSTED']);
    const manualAudit = await prisma.journalEntryWorkflowEvent.findMany({
      where: { journalEntryId: manualEntry.id },
      orderBy: { createdAt: 'asc' },
      select: { action: true, actorUsername: true },
    });
    assert.deepEqual(manualAudit.map(({ action }) => action), ['SUBMITTED', 'APPROVED', 'POSTED', 'REVERSAL_REQUESTED']);
    assert.deepEqual(manualAudit.map(({ actorUsername }) => actorUsername), [
      creator.username,
      reviewer.username,
      poster.username,
      creator.username,
    ]);

    const rejectedEntry = await FinanceService.createJournalEntry({
      entryNumber: `TEST-OD-REJECT-${suffix}`,
      entityId,
      date: '2026-10-29',
      description: `TEST rejected manual journal ${suffix}`,
      lines: [
        { accountCode: 'TEST-AR', debit: 1, credit: 0 },
        { accountCode: 'TEST-PAYABLE', debit: 0, credit: 1 },
      ],
    }, creator, `TEST: préparation à rejeter ${suffix}`);
    const rejection = await FinanceService.rejectJournalEntry(
      rejectedEntry.id,
      entityId,
      reviewer,
      `TEST: justificatif synthétique absent ${suffix}`,
    );
    assert.equal(rejection?.status, 'REJECTED');
    assert.equal(await prisma.journalEntry.count({ where: { entityId, entryNumber: rejectedEntry.entryNumber, status: 'POSTED' } }), 0);

    const purchase = await PurchasesService.createDraftInvoice({
      invoiceNumber: `TEST-SUP-${suffix}`,
      vendorId,
      issueDate: '2026-10-29',
      dueDate: '2026-11-28',
      subTotal: 100,
      taxRateId,
      documentCurrencyCode: 'TND',
    }, entityId, creator);
    assert.equal(purchase.status, 'TO_REVIEW');

    await PurchasesService.approveInvoice(
      purchase.id,
      entityId,
      reviewer,
      `TEST: contrôle synthétique ${suffix}; paramètres et comptes vérifiés`,
    );
    const purchaseJournal = await PurchasesService.postInvoice(
      purchase.id,
      entityId,
      poster,
      `TEST: comptabilisation synthétique ${suffix}`,
    );
    assert.ok(purchaseJournal);
    const repeatedPurchaseJournal = await PurchasesService.postInvoice(
      purchase.id,
      entityId,
      poster,
      `TEST: nouvelle demande idempotente ${suffix}`,
    );
    assert.equal(repeatedPurchaseJournal?.id, purchaseJournal?.id);

    const salesInvoice = await SalesService.createInvoice({
      customerId,
      entityId,
      issueDate: '2026-10-29',
      dueDate: '2026-11-28',
      items: [{ description: 'TEST synthetic service', quantity: 1, unitPrice: 50, taxRate: 19 }],
    }, creator);
    assert.equal(salesInvoice.status, 'TO_REVIEW');
    await SalesService.approveInvoice(
      salesInvoice.id,
      entityId,
      reviewer,
      `TEST: contrôle synthétique facture vente ${suffix}`,
    );
    const salesJournal = await SalesService.issueInvoice(
      salesInvoice.id,
      entityId,
      poster,
      `TEST: émission et comptabilisation synthétiques ${suffix}`,
    );
    const repeatedSalesJournal = await SalesService.issueInvoice(
      salesInvoice.id,
      entityId,
      poster,
      `TEST: demande répétée ${suffix}`,
    );
    assert.equal(repeatedSalesJournal.id, salesJournal.id);
    const salesJournals = await prisma.journalEntry.findMany({
      where: { entityId, reference: salesInvoice.invoiceNumber, status: 'POSTED' },
      include: { lines: true },
    });
    assert.equal(salesJournals.length, 1);
    assert.equal(salesJournals[0].lines.reduce((sum, line) => sum + line.debit, 0), 59.5);
    assert.equal(salesJournals[0].lines.reduce((sum, line) => sum + line.credit, 0), 59.5);

    const purchaseRecord = await prisma.purchaseInvoice.findUniqueOrThrow({
      where: { id: purchase.id },
      include: { workflowEvents: { orderBy: { createdAt: 'asc' } } },
    });
    assert.equal(purchaseRecord.status, 'POSTED');
    assert.deepEqual(purchaseRecord.workflowEvents.map(({ action }) => action), ['APPROVED', 'POSTED']);
    assert.equal(purchaseRecord.postingJournalEntryId, purchaseJournal?.id);
    assert.equal(await prisma.journalEntry.count({ where: { entityId, reference: purchase.invoiceNumber } }), 1);
    const salesRecord = await prisma.invoice.findUniqueOrThrow({
      where: { id: salesInvoice.id },
      include: { workflowEvents: { orderBy: { createdAt: 'asc' } } },
    });
    assert.equal(salesRecord.status, 'ISSUED');
    assert.equal(salesRecord.postingJournalEntryId, salesJournal.id);
    assert.deepEqual(salesRecord.workflowEvents.map(({ action }) => action), ['APPROVED', 'ISSUED']);

    const report = await FinanceService.getFinancialPeriodSummary(
      entityId,
      '2026-10-29',
      '2026-10-29',
      new Date('2026-10-30T00:00:00.000Z'),
    );
    assert.equal(report.entity.name, `TEST entity ${suffix}`);
    assert.equal(report.coverage.invalidJournalLineCount, 0);
    assert.equal(report.coverage.unclassifiedJournalLineCount, 0);
    assert.equal(report.totals.find(({ type }) => type === 'Revenue')?.movement, 50);
    assert.equal(report.totals.find(({ type }) => type === 'Expense')?.movement, 125);
  });

  it('receives an approved order before invoicing, posts once, pays, and reconciles the bank line', async () => {
    const material = await prisma.material.create({
      data: {
        sku: `TEST-STOCK-${suffix}`,
        name: `TEST stock material ${suffix}`,
        unitCode: 'EA',
        quantity: 0,
        unitPrice: 10,
        costPrice: 10,
        entityId,
      },
    });
    const warehouse = await prisma.warehouse.create({
      data: {
        code: `TEST-WH-${suffix}`,
        name: `TEST warehouse ${suffix}`,
        entityId,
      },
    });
    const order = await PurchasesService.createPurchaseOrder({
      orderNumber: `TEST-PO-${suffix}`,
      vendorId,
      currencyCode: 'TND',
      lines: [{
        description: `TEST stock material ${suffix}`,
        materialId: material.id,
        quantity: 2,
        unitPrice: 10,
      }],
    }, entityId, creator);
    await PurchasesService.approvePurchaseOrder(
      order.id,
      entityId,
      reviewer,
      `TEST: contrôle synthétique de commande ${suffix}`,
    );
    const journalCountBeforeReceipt = await prisma.journalEntry.count({ where: { entityId } });
    const receiptInput = {
      materialId: material.id,
      purchaseOrderLineId: order.lines[0].id,
      warehouseId: warehouse.id,
      quantity: 2,
      unitCost: 10,
      reason: `TEST receipt ${suffix}`,
      idempotencyKey: `TEST-receipt-${suffix}`,
    };
    const receiptResult = await MaterialsService.receiveStock(receiptInput, entityId, creator);
    assert.equal(receiptResult.material.quantity, 2);
    assert.equal(receiptResult.receipt.purchaseInvoiceId, null);
    assert.equal(await prisma.journalEntry.count({ where: { entityId } }), journalCountBeforeReceipt);
    const receiptRetry = await MaterialsService.receiveStock(receiptInput, entityId, creator);
    assert.equal(receiptRetry.receipt.id, receiptResult.receipt.id);
    assert.equal(await prisma.stockReceipt.count({ where: { entityId, idempotencyKey: receiptInput.idempotencyKey } }), 1);

    const purchase = await PurchasesService.createDraftInvoice({
      invoiceNumber: `TEST-SUP-STOCK-${suffix}`,
      vendorId,
      issueDate: '2026-10-29',
      dueDate: '2026-11-28',
      subTotal: 20,
      taxRateId,
      lines: [{
        description: `TEST stock material ${suffix}`,
        materialId: material.id,
        purchaseOrderLineId: order.lines[0].id,
        quantity: 2,
        unitPrice: 10,
      }],
    }, entityId, creator);
    const invoiceLine = await prisma.purchaseInvoiceLine.findFirstOrThrow({
      where: { entityId, purchaseInvoiceId: purchase.id },
    });
    await PurchasesService.approveInvoice(
      purchase.id,
      entityId,
      reviewer,
      `TEST: approbation avant réception ${suffix}`,
    );
    const receiptAfterMatching = await prisma.stockReceipt.findUniqueOrThrow({
      where: { id: receiptResult.receipt.id },
      include: { invoiceLineMatch: { select: { lineId: true } } },
    });
    assert.equal(receiptAfterMatching.purchaseInvoiceId, purchase.id);
    assert.equal(receiptAfterMatching.invoiceLineMatch?.lineId, invoiceLine.id);
    const approvedInvoice = await prisma.purchaseInvoice.findUniqueOrThrow({
      where: { id: purchase.id },
      include: { workflowEvents: { orderBy: { createdAt: 'asc' } } },
    });
    assert.deepEqual(approvedInvoice.workflowEvents.map(({ action }) => action), ['APPROVED']);
    const receiptRetryAfterInvoiceMatch = await MaterialsService.receiveStock(receiptInput, entityId, creator);
    assert.equal(receiptRetryAfterInvoiceMatch.receipt.id, receiptResult.receipt.id);

    const journal = await PurchasesService.postInvoice(
      purchase.id,
      entityId,
      poster,
      `TEST: posting après réception complète ${suffix}`,
    );
    assert.ok(journal);
    assert.equal(await prisma.journalEntry.count({ where: { entityId } }), journalCountBeforeReceipt + 1);

    const returnInput = {
      sourceReceiptId: receiptResult.receipt.id,
      quantity: 1,
      reason: `TEST supplier return ${suffix}`,
      idempotencyKey: `TEST-return-${suffix}`,
    };
    const returned = await MaterialsService.returnStockToSupplier(returnInput, entityId, creator);
    assert.equal(returned.quantity, 1);
    assert.equal((await prisma.stockReceipt.findUniqueOrThrow({
      where: { id: receiptResult.receipt.id },
    })).returnedQuantity, 1);
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: material.id } })).quantity, 1);
    assert.equal((await prisma.materialWarehouseStock.findUniqueOrThrow({
      where: { materialId_warehouseId: { materialId: material.id, warehouseId: warehouse.id } },
    })).quantity, 1);
    const stockReturnJournal = await prisma.journalEntry.findFirstOrThrow({
      where: { entityId, reference: `STK-RET-${returned.id}` },
      include: { lines: true },
    });
    assert.deepEqual(stockReturnJournal.lines.map(({ accountCode, debit, credit }) => [accountCode, debit, credit]), [
      ['TEST-STOCK-ADJ', 10, 0],
      ['TEST-STOCK', 0, 10],
    ]);
    assert.equal((await MaterialsService.returnStockToSupplier(returnInput, entityId, creator)).id, returned.id);
    await assert.rejects(
      MaterialsService.returnStockToSupplier({
        ...returnInput,
        reason: `TEST different return ${suffix}`,
      }, entityId, creator),
      /clé a déjà été utilisée/,
    );
    await assert.rejects(
      MaterialsService.returnStockToSupplier({
        ...returnInput,
        quantity: 2,
        idempotencyKey: `TEST-return-over-limit-${suffix}`,
      }, entityId, creator),
      /dépasserait le solde de la réception/,
    );
    assert.equal(await prisma.stockSupplierReturn.count({ where: { entityId, sourceReceiptId: receiptResult.receipt.id } }), 1);

    const generatedCredit = await prisma.supplierCreditNote.findUniqueOrThrow({
      where: { sourceReturnId: returned.id },
    });
    assert.equal(generatedCredit.status, 'AWAITING_SUPPLIER_DOCUMENT');
    assert.equal(generatedCredit.documentTotalAmount, 11.9);
    const today = new Date().toISOString().slice(0, 10);
    await assert.rejects(
      PurchasesService.recordSupplierCreditNoteDocument(
        generatedCredit.id,
        entityId,
        creator,
        {
          supplierDocumentNumber: `TEST-AV-BAD-${suffix}`,
          creditDate: today,
          documentSubTotal: 10.001,
          documentTaxAmount: 1.9,
          documentTotalAmount: 11.901,
          note: `TEST incorrect credit amount ${suffix}`,
        },
      ),
      /diffèrent du rapprochement calculé/,
    );
    await PurchasesService.recordSupplierCreditNoteDocument(
      generatedCredit.id,
      entityId,
      creator,
      {
        supplierDocumentNumber: `TEST-AV-${suffix}`,
        creditDate: today,
        documentSubTotal: 10,
        documentTaxAmount: 1.9,
        documentTotalAmount: 11.9,
        note: `TEST supplier document reconciled ${suffix}`,
      },
    );
    await assert.rejects(
      PurchasesService.approveSupplierCreditNote(
        generatedCredit.id,
        entityId,
        creator,
        `TEST self-approval refusal ${suffix}`,
      ),
      /distincte de son préparateur/,
    );
    await PurchasesService.approveSupplierCreditNote(
      generatedCredit.id,
      entityId,
      reviewer,
      `TEST independent credit review ${suffix}`,
    );
    await assert.rejects(
      PurchasesService.postSupplierCreditNote(
        generatedCredit.id,
        entityId,
        reviewer,
        `TEST same reviewer posting refusal ${suffix}`,
      ),
      /ne peut pas le comptabiliser/,
    );
    const creditJournal = await PurchasesService.postSupplierCreditNote(
      generatedCredit.id,
      entityId,
      poster,
      `TEST supplier credit posted ${suffix}`,
    );
    assert.equal((await PurchasesService.postSupplierCreditNote(
      generatedCredit.id,
      entityId,
      poster,
      `TEST idempotent credit post ${suffix}`,
    )).id, creditJournal.id);
    assert.equal(await prisma.journalEntry.count({
      where: { entityId, entryNumber: `PURCHASE-CREDIT-${generatedCredit.id}` },
    }), 1);
    const creditAudit = await prisma.supplierCreditNote.findUniqueOrThrow({
      where: { id: generatedCredit.id },
      include: { workflowEvents: { orderBy: { createdAt: 'asc' } } },
    });
    assert.equal(creditAudit.status, 'POSTED');
    assert.deepEqual(creditAudit.workflowEvents.map(({ action }) => action), [
      'RETURN_LINKED', 'DOCUMENT_RECORDED', 'APPROVED', 'POSTED',
    ]);

    const bankAccount = await CashflowBankingService.createBankAccount({
      name: `TEST bank ${suffix}`,
      currencyCode: 'TND',
      ledgerAccountCode: 'TEST-BANK',
    }, entityId);
    const statement = await CashflowBankingService.importStatement({
      bankAccountId: bankAccount.id,
      importedByUserId: poster.id,
      csv: [
        'date,description,amount,reference',
        `${today},Paiement facture fournisseur,-11.900,TEST-AP-${suffix}`,
      ].join('\n'),
    }, entityId);
    const statementLine = (await CashflowBankingService.listStatementLines(statement.id, entityId))[0];
    const paymentEntry = await FinanceService.createJournalEntry({
      entryNumber: `TEST-AP-PAY-${suffix}`,
      entityId,
      date: today,
      description: `TEST supplier payment ${suffix}`,
      reference: `TEST-AP-${suffix}`,
      lines: [
        { accountCode: 'TEST-PAYABLE', debit: 11.9, credit: 0, description: 'TEST payable cleared' },
        { accountCode: 'TEST-BANK', debit: 0, credit: 11.9, description: 'TEST bank outflow' },
      ],
    }, creator, `TEST: préparation paiement fournisseur ${suffix}`);
    await FinanceService.approveJournalEntry(
      paymentEntry.id,
      entityId,
      reviewer,
      `TEST: contrôle du paiement fournisseur ${suffix}`,
    );
    const postedPaymentEntry = await FinanceService.postJournalEntry(
      paymentEntry.id,
      entityId,
      poster,
      `TEST: comptabilisation du paiement fournisseur ${suffix}`,
    );
    assert.equal(postedPaymentEntry?.status, 'POSTED');
    const paymentJournalAudit = await prisma.journalEntryWorkflowEvent.findMany({
      where: { journalEntryId: paymentEntry.id },
      orderBy: { createdAt: 'asc' },
      select: { action: true, actorUserId: true },
    });
    assert.deepEqual(paymentJournalAudit.map(({ action }) => action), ['SUBMITTED', 'APPROVED', 'POSTED']);
    assert.deepEqual(paymentJournalAudit.map(({ actorUserId }) => actorUserId), [creator.id, reviewer.id, poster.id]);
    const paymentBankLine = postedPaymentEntry?.lines.find(({ accountCode }) => accountCode === 'TEST-BANK');
    assert.ok(paymentBankLine);
    const candidates = await CashflowBankingService.getReconciliationCandidates(statementLine.id, entityId);
    assert.deepEqual(candidates.candidates.map(({ id }) => id), [paymentBankLine?.id]);
    const targetAfterCredit = (await CashflowBankingService.listPaymentTargets(entityId))
      .find((target) => target.id === purchase.id);
    assert.equal(targetAfterCredit?.creditedAmount, 11.9);
    assert.equal(targetAfterCredit?.remainingAmount, 11.9);
    const reconciliation = await CashflowBankingService.reconcile({
      statementLineId: statementLine.id,
      journalLineId: paymentBankLine!.id,
      userId: poster.id,
    }, entityId);
    const reconciliationAudit = await prisma.bankReconciliation.findUniqueOrThrow({
      where: { id: reconciliation.id },
      select: { reconciledByUserId: true, statementLineId: true, journalLineId: true },
    });
    assert.deepEqual(reconciliationAudit, {
      reconciledByUserId: poster.id,
      statementLineId: statementLine.id,
      journalLineId: paymentBankLine!.id,
    });
    await assert.rejects(
      CashflowBankingService.reconcile({
        statementLineId: statementLine.id,
        journalLineId: paymentBankLine!.id,
        userId: poster.id,
      }, entityId),
      /déjà rapprochée/,
    );
    const supplierPayment = await CashflowBankingService.allocatePayment({
      statementLineId: statementLine.id,
      purchaseInvoiceId: purchase.id,
    }, entityId, creator.id);
    assert.equal(supplierPayment.direction, 'SUPPLIER_PAYMENT');
    assert.equal(supplierPayment.amount, 11.9);
    assert.equal(supplierPayment.remainingAmount, 0);
    const paymentAudit = await prisma.cashflowPayment.findFirstOrThrow({
      where: { entityId, purchaseInvoiceId: purchase.id },
      select: { recordedByUserId: true, direction: true, amount: true },
    });
    assert.deepEqual(paymentAudit, {
      recordedByUserId: creator.id,
      direction: 'SUPPLIER_PAYMENT',
      amount: 11.9,
    });
    await assert.rejects(
      CashflowBankingService.allocatePayment({
        statementLineId: statementLine.id,
        purchaseInvoiceId: purchase.id,
      }, entityId, creator.id),
      /déjà été allouée/,
    );
    assert.equal(await prisma.cashflowPayment.count({ where: { entityId, purchaseInvoiceId: purchase.id } }), 1);
    const postedInvoiceAudit = await prisma.purchaseInvoice.findUniqueOrThrow({
      where: { id: purchase.id },
      include: { workflowEvents: { orderBy: { createdAt: 'asc' } } },
    });
    assert.equal(postedInvoiceAudit.status, 'POSTED');
    assert.deepEqual(postedInvoiceAudit.workflowEvents.map(({ action }) => action), ['APPROVED', 'POSTED']);
    assert.equal(await prisma.journalEntry.count({ where: { entityId, reference: purchase.invoiceNumber } }), 1);
    assert.equal((await CashflowBankingService.listPaymentTargets(entityId))
      .some((target) => target.id === purchase.id), false);
    const reconciledLine = (await CashflowBankingService.listStatementLines(statement.id, entityId))[0];
    assert.equal(reconciledLine.reconciliation?.id, reconciliation.id);
    assert.equal(reconciledLine.cashflowPayment?.purchaseInvoice?.invoiceNumber, purchase.invoiceNumber);

    const excessReturn = await MaterialsService.returnStockToSupplier({
      sourceReceiptId: receiptResult.receipt.id,
      quantity: 1,
      reason: `TEST excess supplier return ${suffix}`,
      idempotencyKey: `TEST-return-excess-${suffix}`,
    }, entityId, creator);
    const excessCredit = await prisma.supplierCreditNote.findUniqueOrThrow({
      where: { sourceReturnId: excessReturn.id },
    });
    await PurchasesService.recordSupplierCreditNoteDocument(
      excessCredit.id,
      entityId,
      creator,
      {
        supplierDocumentNumber: `TEST-AV-EXCESS-${suffix}`,
        creditDate: today,
        documentSubTotal: 10,
        documentTaxAmount: 1.9,
        documentTotalAmount: 11.9,
        note: `TEST excess credit documented ${suffix}`,
      },
    );
    await PurchasesService.approveSupplierCreditNote(
      excessCredit.id,
      entityId,
      reviewer,
      `TEST excess credit approved ${suffix}`,
    );
    await PurchasesService.postSupplierCreditNote(
      excessCredit.id,
      entityId,
      poster,
      `TEST excess credit posted ${suffix}`,
    );

    const targetInvoice = await PurchasesService.createDraftInvoice({
      invoiceNumber: `TEST-SUP-TARGET-${suffix}`,
      vendorId,
      issueDate: today,
      dueDate: new Date(Date.parse(`${today}T00:00:00.000Z`) + 30 * 86_400_000).toISOString().slice(0, 10),
      subTotal: 10,
      taxRateId,
      lines: [{ description: `TEST service payable target ${suffix}`, quantity: 1, unitPrice: 10 }],
    }, entityId, creator);
    await PurchasesService.approveInvoice(
      targetInvoice.id,
      entityId,
      reviewer,
      `TEST target payable approved ${suffix}`,
    );
    await PurchasesService.postInvoice(
      targetInvoice.id,
      entityId,
      poster,
      `TEST target payable posted ${suffix}`,
    );
    const applicationInput = {
      targetPurchaseInvoiceId: targetInvoice.id,
      documentAmount: 5,
      idempotencyKey: `TEST-credit-application-${suffix}`,
      note: `TEST apply excess supplier credit ${suffix}`,
    };
    const application = await PurchasesService.applySupplierCreditNote(
      excessCredit.id,
      entityId,
      creator,
      applicationInput,
    );
    assert.equal(application.documentAmount, 5);
    assert.equal(application.functionalAmount, 5);
    assert.equal((await PurchasesService.applySupplierCreditNote(
      excessCredit.id,
      entityId,
      creator,
      applicationInput,
    )).id, application.id);
    await assert.rejects(
      PurchasesService.applySupplierCreditNote(
        excessCredit.id,
        entityId,
        creator,
        { ...applicationInput, documentAmount: 4 },
      ),
      /clé d’idempotence a déjà été utilisée/,
    );
    await assert.rejects(
      PurchasesService.applySupplierCreditNote(
        excessCredit.id,
        entityId,
        creator,
        {
          ...applicationInput,
          idempotencyKey: `TEST-credit-application-over-${suffix}`,
          documentAmount: 7,
        },
      ),
      /dépasse le solde d’avoir disponible ou sa conversion figée/,
    );
    const partiallyAppliedTarget = (await CashflowBankingService.listPaymentTargets(entityId))
      .find((target) => target.id === targetInvoice.id);
    assert.equal(partiallyAppliedTarget?.creditedAmount, 5);
    assert.equal(partiallyAppliedTarget?.remainingAmount, 6.9);
    const finalApplication = await PurchasesService.applySupplierCreditNote(
      excessCredit.id,
      entityId,
      reviewer,
      {
        targetPurchaseInvoiceId: targetInvoice.id,
        documentAmount: 6.9,
        idempotencyKey: `TEST-credit-application-final-${suffix}`,
        note: `TEST use remaining credit ${suffix}`,
      },
    );
    assert.equal(finalApplication.documentAmount, 6.9);
    assert.equal((await PurchasesService.applySupplierCreditNote(
      excessCredit.id,
      entityId,
      reviewer,
      {
        targetPurchaseInvoiceId: targetInvoice.id,
        documentAmount: 6.9,
        idempotencyKey: `TEST-credit-application-final-${suffix}`,
        note: `TEST use remaining credit ${suffix}`,
      },
    )).id, finalApplication.id);
    const targetAfterApplication = (await CashflowBankingService.listPaymentTargets(entityId))
      .find((target) => target.id === targetInvoice.id);
    assert.equal(targetAfterApplication, undefined);
    const listedExcessCredit = (await PurchasesService.getSupplierCreditNotes(entityId))
      .find(({ id }) => id === excessCredit.id);
    assert.equal(listedExcessCredit?.unappliedDocumentAmount, 0);
    assert.deepEqual(listedExcessCredit?.applications.map(({ targetPurchaseInvoice, documentAmount }) => [
      targetPurchaseInvoice.invoiceNumber,
      documentAmount,
    ]), [[targetInvoice.invoiceNumber, 5], [targetInvoice.invoiceNumber, 6.9]]);

    const aging = await PurchasesService.getPayablesAging(entityId, today);
    assert.equal(aging.invoices.some(({ id }) => id === purchase.id), false);
    const targetAging = aging.invoices.find(({ id }) => id === targetInvoice.id);
    assert.equal(targetAging, undefined);
    const receiptAudit = await prisma.stockMovement.findMany({
      where: { entityId, materialId: material.id, movementType: 'RECEIPT' },
      select: { createdByUserId: true, reason: true },
    });
    assert.deepEqual(receiptAudit, [{ createdByUserId: creator.id, reason: receiptInput.reason }]);
  });
});
