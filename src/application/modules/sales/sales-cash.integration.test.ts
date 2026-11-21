import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import CashflowBankingService from '../cashflow/banking-service';
import { CashflowRequestError } from '../cashflow/errors';
import { SalesRequestError } from './errors';
import SalesService from './service';

let entityId = '';
let customerId = '';
let materialId = '';
let bankAccountId = '';
let orderId = '';
let invoiceId = '';

before(async () => {
  const country = await prisma.countryProfile.create({
    data: {
      code: 'SC',
      name: 'Synthetic sales-to-cash test',
      currencyCode: 'TND',
      stampDuty: 0,
      salesReceivableAccountCode: '4111',
      salesRevenueAccountCode: '7071',
      salesVatAccountCode: '4457',
    },
  });
  const entity = await prisma.entity.create({
    data: { code: 'SALES-CASH-TEST', name: 'Synthetic sales-to-cash test', countryId: country.id },
  });
  entityId = entity.id;
  await prisma.chartOfAccount.createMany({
    data: [
      { countryId: country.id, code: '4111', description: 'Synthetic receivable', classNumber: 4, type: 'Asset' },
      { countryId: country.id, code: '7071', description: 'Synthetic revenue', classNumber: 7, type: 'Revenue' },
      { countryId: country.id, code: '4457', description: 'Synthetic VAT', classNumber: 4, type: 'Liability' },
      { countryId: country.id, code: '5121', description: 'Synthetic bank', classNumber: 5, type: 'Asset' },
    ],
  });
  await prisma.taxRate.create({
    data: { countryId: country.id, code: 'SYNTH-19', name: 'Synthetic configured rate', rate: 19 },
  });
  const customer = await prisma.customer.create({
    data: { entityId, code: 'SYNTH-CUSTOMER', name: 'Synthetic customer' },
  });
  customerId = customer.id;
  const material = await prisma.material.create({
    data: { entityId, sku: 'SYNTH-SALES-ITEM', name: 'Synthetic sales item', unitPrice: 100 },
  });
  materialId = material.id;
  const bankAccount = await CashflowBankingService.createBankAccount({
    name: 'Synthetic sales receipt account',
    currencyCode: 'TND',
    ledgerAccountCode: '5121',
  }, entityId);
  bankAccountId = bankAccount.id;
  await CashflowBankingService.setAccountingMapping({
    receivableAccountCode: '4111',
    payableAccountCode: null,
  }, entityId);

  const order = await prisma.salesOrder.create({
    data: {
      orderNumber: 'CMD-SYNTH-SALES-CASH',
      entityId,
      customerId,
      currencyCode: 'TND',
      totalAmount: 100,
      status: 'DISPATCHED',
      createdByUserId: 'sales-creator',
      createdByUsername: 'sales-creator',
      lines: {
        create: [{
          materialId,
          description: 'Synthetic sales item',
          quantity: 1,
          unitPrice: 100,
          totalAmount: 100,
        }],
      },
    },
    include: { lines: true },
  });
  orderId = order.id;
  const pick = await prisma.stockPick.create({
    data: {
      entityId,
      reference: 'PICK-SYNTH-SALES-CASH',
      reason: 'Synthetic previously dispatched order',
      idempotencyKey: 'pick-synth-sales-cash',
      createdByUserId: 'sales-creator',
      createdByUsername: 'sales-creator',
      lines: {
        create: [{
          materialId,
          warehouseId: (await prisma.warehouse.create({
            data: { entityId, code: 'SYNTH-WH', name: 'Synthetic warehouse' },
          })).id,
          quantity: 1,
        }],
      },
      dispatch: {
        create: {
          idempotencyKey: 'dispatch-synth-sales-cash',
          confirmedByUserId: 'sales-dispatcher',
          confirmedByUsername: 'sales-dispatcher',
        },
      },
    },
  });
  await prisma.salesOrderStockPickLink.create({
    data: { entityId, salesOrderId: orderId, stockPickId: pick.id },
  });
});

after(async () => {
  await prisma.$disconnect();
});

it('converts a dispatched order to a reviewable invoice, issues it, and allocates partial then full customer receipts', async () => {
  const creator = { id: 'sales-creator', username: 'sales-creator' };
  const reviewer = { id: 'sales-reviewer', username: 'sales-reviewer' };
  const issuer = { id: 'sales-issuer', username: 'sales-issuer' };
  const firstConversion = await SalesService.convertSalesOrderToInvoice(orderId, {
    lines: [{ salesOrderLineId: (await prisma.salesOrderLine.findFirstOrThrow({ where: { orderId } })).id, taxRate: 19 }],
  }, entityId, creator);
  assert.equal(firstConversion.created, true);
  assert.equal(firstConversion.invoice.status, 'TO_REVIEW');
  invoiceId = firstConversion.invoice.id;
  assert.equal(firstConversion.invoice.documentTotalAmount, 119);
  const retryConversion = await SalesService.convertSalesOrderToInvoice(orderId, null, entityId, creator);
  assert.equal(retryConversion.created, false);
  assert.equal(retryConversion.invoice.id, invoiceId);
  assert.equal(await prisma.invoice.count({ where: { entityId, salesOrderLink: { salesOrderId: orderId } } }), 1);
  assert.deepEqual((await prisma.salesInvoiceWorkflowEvent.findMany({
    where: { invoiceId },
    select: { action: true, actorUserId: true },
  })).map(({ action, actorUserId }) => ({ action, actorUserId })), [
    { action: 'CREATED_FROM_ORDER', actorUserId: creator.id },
  ]);

  await assert.rejects(
    SalesService.approveInvoice(invoiceId, entityId, creator, 'Synthetic approval attempt'),
    (error: unknown) => error instanceof SalesRequestError && error.statusCode === 422,
  );
  await SalesService.approveInvoice(invoiceId, entityId, reviewer, 'Synthetic independent review');
  await assert.rejects(
    SalesService.approveInvoice(invoiceId, entityId, reviewer, 'Synthetic duplicate review'),
    (error: unknown) => error instanceof SalesRequestError && error.statusCode === 409,
  );
  await assert.rejects(
    SalesService.issueInvoice(invoiceId, entityId, reviewer, 'Synthetic issuer attempt'),
    (error: unknown) => error instanceof SalesRequestError && error.statusCode === 422,
  );
  const issuedJournal = await SalesService.issueInvoice(invoiceId, entityId, issuer, 'Synthetic invoice issue');
  const issueRetry = await SalesService.issueInvoice(invoiceId, entityId, issuer, 'Synthetic issue retry');
  assert.equal(issueRetry.id, issuedJournal.id);
  assert.equal(await prisma.journalEntry.count({ where: { entityId, reference: firstConversion.invoice.invoiceNumber } }), 1);
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status, 'ISSUED');
  assert.deepEqual((await prisma.salesInvoiceWorkflowEvent.findMany({
    where: { invoiceId },
    select: { action: true, actorUserId: true },
    orderBy: { createdAt: 'asc' },
  })).map(({ action, actorUserId }) => ({ action, actorUserId })), [
    { action: 'CREATED_FROM_ORDER', actorUserId: creator.id },
    { action: 'APPROVED', actorUserId: reviewer.id },
    { action: 'ISSUED', actorUserId: issuer.id },
  ]);
  assert.equal((await CashflowBankingService.listPaymentTargets(entityId))
    .find((target) => target.id === invoiceId)?.remainingAmount, 119);

  const statement = await CashflowBankingService.importStatement({
    bankAccountId,
    importedByUserId: 'finance-user',
    csv: [
      'date,description,amount,reference',
      '2026-11-09,Synthetic partial customer receipt,60.000,SYNTH-AR-1',
      '2026-11-09,Synthetic remaining customer receipt,59.000,SYNTH-AR-2',
    ].join('\n'),
  }, entityId);
  const statementLines = await CashflowBankingService.listStatementLines(statement.id, entityId);
  for (const [index, amount] of [60, 59].entries()) {
    const journal = await prisma.journalEntry.create({
      data: {
        entryNumber: `JE-SYNTH-SALES-CASH-${index + 1}`,
        entityId,
        date: new Date('2026-11-09T00:00:00.000Z'),
        description: `Synthetic customer receipt ${index + 1}`,
        status: 'POSTED',
        lines: { create: [
          { accountCode: '5121', debit: amount, credit: 0 },
          { accountCode: '4111', debit: 0, credit: amount },
        ] },
      },
      include: { lines: true },
    });
    const bankLine = journal.lines.find(({ accountCode }) => accountCode === '5121');
    const statementLine = statementLines.find(({ externalReference }) => externalReference === `SYNTH-AR-${index + 1}`);
    assert.ok(bankLine && statementLine);
    await CashflowBankingService.reconcile({
      statementLineId: statementLine.id,
      journalLineId: bankLine.id,
      userId: 'finance-reviewer',
    }, entityId);
    const payment = await CashflowBankingService.allocatePayment({
      statementLineId: statementLine.id,
      invoiceId,
    }, entityId, 'finance-allocator');
    assert.equal(payment.amount, amount);
    assert.equal((await prisma.cashflowPayment.findUniqueOrThrow({
      where: { id: payment.id },
    })).recordedByUserId, 'finance-allocator');
    assert.equal(payment.remainingAmount, index === 0 ? 59 : 0);
    if (index === 0) {
      assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status, 'ISSUED');
    }
    if (index === 1) {
      assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status, 'PAID');
      await assert.rejects(
        CashflowBankingService.allocatePayment({ statementLineId: statementLine.id, invoiceId }, entityId),
        (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 409,
      );
    }
  }
  assert.equal((await CashflowBankingService.listPaymentTargets(entityId))
    .some((target) => target.id === invoiceId), false);
  assert.equal(await prisma.cashflowPayment.count({ where: { entityId, invoiceId } }), 2);
});
