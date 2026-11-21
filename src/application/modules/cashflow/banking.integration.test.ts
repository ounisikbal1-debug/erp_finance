import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import { CashflowRequestError } from './errors';
import CashflowBankingService from './banking-service';
import CashflowForecastService from './forecast-service';
import FinanceService from '../finance/service';
import FxRevaluationService from '../fx/revaluation-service';
import { BCT_INTERBANK_RATES_URL, BCT_INTERBANK_SOURCE_NAME } from '../fx/bct-interbank';

let entityId = '';
let otherEntityId = '';
let countryId = '';

before(async () => {
  const country = await prisma.countryProfile.create({
    data: { code: 'BK', name: 'Banque test', currencyCode: 'TND' },
  });
  countryId = country.id;
  const entity = await prisma.entity.create({ data: { code: 'BANK-A', name: 'Banque test A', countryId: country.id } });
  const otherEntity = await prisma.entity.create({ data: { code: 'BANK-B', name: 'Banque test B', countryId: country.id } });
  entityId = entity.id;
  otherEntityId = otherEntity.id;
  await prisma.chartOfAccount.createMany({
    data: [
      { countryId: country.id, code: '5121', description: 'Banque test', classNumber: 5, type: 'Asset' },
      { countryId: country.id, code: '5122', description: 'Banque sans relevé', classNumber: 5, type: 'Asset' },
      { countryId: country.id, code: '4111', description: 'Clients test', classNumber: 4, type: 'Asset' },
      { countryId: country.id, code: '4011', description: 'Fournisseurs test', classNumber: 4, type: 'Liability' },
      { countryId: country.id, code: '6061', description: 'Charge test', classNumber: 6, type: 'Expense' },
      { countryId: country.id, code: '7661', description: 'Gain de change test', classNumber: 7, type: 'Revenue' },
      { countryId: country.id, code: '6661', description: 'Perte de change test', classNumber: 6, type: 'Expense' },
      { countryId: country.id, code: '7662', description: 'Gain latent test', classNumber: 7, type: 'Revenue' },
      { countryId: country.id, code: '6662', description: 'Perte latente test', classNumber: 6, type: 'Expense' },
      { countryId: country.id, code: '6271', description: 'Frais bancaires test', classNumber: 6, type: 'Expense' },
    ],
  });
});

it('allocates foreign receipts and payments from bank amounts, posts realized FX, and protects reversals', async () => {
  await CashflowBankingService.setAccountingMapping({
    receivableAccountCode: '4111',
    payableAccountCode: '4011',
  }, entityId);
  const bankAccount = await CashflowBankingService.createBankAccount({
    name: 'Banque FX',
    currencyCode: 'TND',
    ledgerAccountCode: '5121',
  }, entityId);
  const statement = await CashflowBankingService.importStatement({
    bankAccountId: bankAccount.id,
    csv: [
      'date,description,amount,reference',
      '2026-03-07,Encaissement partiel USD,140.000,FX-AR-1',
      '2026-03-08,Encaissement solde USD,150.000,FX-AR-2',
      '2026-03-09,Frais bancaires,-3.000,FX-FEE',
      '2026-03-10,Paiement facture EUR,-310.000,FX-AP-1',
    ].join('\n'),
  }, entityId);
  const lines = await CashflowBankingService.listStatementLines(statement.id, entityId);
  const lineFor = (reference: string) => {
    const line = lines.find((candidate) => candidate.externalReference === reference);
    assert.ok(line, `relevé ${reference} manquant`);
    return line;
  };
  const customer = await prisma.customer.create({
    data: { code: 'BANK-FX-CUSTOMER', name: 'Client FX fictif', entityId },
  });
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: 'BANK-FX-INVOICE',
      entityId,
      customerId: customer.id,
      currencyCode: 'TND',
      documentCurrencyCode: 'USD',
      documentTotalAmount: 100,
      functionalCurrencyCode: 'TND',
      totalAmount: 285,
      dueDate: new Date('2026-03-20T00:00:00.000Z'),
      subTotal: 285,
      taxAmount: 0,
      stampDuty: 0,
      status: 'ISSUED',
    },
  });
  const firstEntry = await prisma.journalEntry.create({
    data: {
      entryNumber: 'FX-AR-1',
      entityId,
      date: new Date('2026-03-07T00:00:00.000Z'),
      description: 'Encaissement partiel USD',
      status: 'POSTED',
      lines: { create: [
        { accountCode: '5121', debit: 140, credit: 0 },
        { accountCode: '6661', debit: 2.5, credit: 0 },
        { accountCode: '4111', debit: 0, credit: 142.5 },
      ] },
    },
    include: { lines: true },
  });
  await CashflowBankingService.reconcile({
    statementLineId: lineFor('FX-AR-1').id,
    journalLineId: firstEntry.lines.find((entryLine) => entryLine.accountCode === '5121')!.id,
  }, entityId);
  await assert.rejects(
    CashflowBankingService.allocatePayment({
      statementLineId: lineFor('FX-AR-1').id,
      invoiceId: invoice.id,
      documentAmount: 50,
    }, entityId),
    (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 409,
  );
  await prisma.countryProfile.update({
    where: { id: countryId },
    data: {
      realizedFxGainAccountCode: '7661',
      realizedFxLossAccountCode: '6661',
    },
  });
  const firstPayment = await CashflowBankingService.allocatePayment({
    statementLineId: lineFor('FX-AR-1').id,
    invoiceId: invoice.id,
    documentAmount: 50,
  }, entityId);
  assert.equal(firstPayment.amount, 140);
  assert.equal(firstPayment.settledDocumentAmount, 50);
  assert.equal(firstPayment.carryingAmount, 142.5);
  assert.equal(firstPayment.settlementExchangeRate, 2.8);
  assert.equal(firstPayment.settlementRateSource, 'BANK_STATEMENT');
  assert.equal(firstPayment.realizedFxLoss, 2.5);
  assert.equal(firstPayment.remainingAmount, 50);
  const targetsAfterFirstPayment = await CashflowBankingService.listPaymentTargets(entityId);
  assert.equal(targetsAfterFirstPayment.find((target) => target.id === invoice.id)?.remainingAmount, 50);
  const forecastScenario = await CashflowForecastService.createScenario({
    name: 'Prévision après règlement FX partiel',
    bankAccountId: bankAccount.id,
  }, entityId);
  const forecastSources = await CashflowForecastService.listSources(forecastScenario.id, entityId);
  assert.equal(forecastSources.find((source) => source.sourceId === invoice.id)?.amount, 142.5);
  await assert.rejects(
    CashflowBankingService.removePayment(firstPayment.id, entityId),
    (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 409,
  );

  const secondEntry = await prisma.journalEntry.create({
    data: {
      entryNumber: 'FX-AR-2',
      entityId,
      date: new Date('2026-03-08T00:00:00.000Z'),
      description: 'Encaissement solde USD',
      status: 'POSTED',
      lines: { create: [
        { accountCode: '5121', debit: 150, credit: 0 },
        { accountCode: '4111', debit: 0, credit: 142.5 },
        { accountCode: '7661', debit: 0, credit: 7.5 },
      ] },
    },
    include: { lines: true },
  });
  await CashflowBankingService.reconcile({
    statementLineId: lineFor('FX-AR-2').id,
    journalLineId: secondEntry.lines.find((entryLine) => entryLine.accountCode === '5121')!.id,
  }, entityId);
  const secondPayment = await CashflowBankingService.allocatePayment({
    statementLineId: lineFor('FX-AR-2').id,
    invoiceId: invoice.id,
    documentAmount: 50,
  }, entityId);
  assert.equal(secondPayment.realizedFxGain, 7.5);
  assert.equal(secondPayment.realizedFxLoss, 0);
  assert.equal(secondPayment.remainingAmount, 0);
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } }))?.status, 'PAID');

  const feeEntry = await prisma.journalEntry.create({
    data: {
      entryNumber: 'FX-FEE',
      entityId,
      date: new Date('2026-03-09T00:00:00.000Z'),
      description: 'Frais bancaires séparés',
      status: 'POSTED',
      lines: { create: [
        { accountCode: '6271', debit: 3, credit: 0 },
        { accountCode: '5121', debit: 0, credit: 3 },
      ] },
    },
    include: { lines: true },
  });
  await CashflowBankingService.reconcile({
    statementLineId: lineFor('FX-FEE').id,
    journalLineId: feeEntry.lines.find((entryLine) => entryLine.accountCode === '5121')!.id,
  }, entityId);
  assert.equal((await CashflowBankingService.listStatementLines(statement.id, entityId))
    .find((line) => line.externalReference === 'FX-FEE')?.cashflowPayment, null);

  const vendor = await prisma.vendor.create({
    data: { code: 'BANK-FX-VENDOR', name: 'Fournisseur FX fictif', entityId },
  });
  const purchaseInvoice = await prisma.purchaseInvoice.create({
    data: {
      invoiceNumber: 'BANK-FX-PURCHASE',
      entityId,
      vendorId: vendor.id,
      issueDate: new Date('2026-03-06T00:00:00.000Z'),
      dueDate: new Date('2026-03-10T00:00:00.000Z'),
      currencyCode: 'TND',
      documentCurrencyCode: 'EUR',
      documentTotalAmount: 100,
      functionalCurrencyCode: 'TND',
      totalAmount: 300,
      subTotal: 300,
      taxRateId: 'fx-test-tax',
      taxRateCode: 'FXTEST',
      taxRate: 0,
      taxAmount: 0,
      status: 'POSTED',
    },
  });
  const supplierEntry = await prisma.journalEntry.create({
    data: {
      entryNumber: 'FX-AP-1',
      entityId,
      date: new Date('2026-03-10T00:00:00.000Z'),
      description: 'Paiement facture EUR',
      status: 'POSTED',
      lines: { create: [
        { accountCode: '4011', debit: 300, credit: 0 },
        { accountCode: '6661', debit: 10, credit: 0 },
        { accountCode: '5121', debit: 0, credit: 310 },
      ] },
    },
    include: { lines: true },
  });
  await CashflowBankingService.reconcile({
    statementLineId: lineFor('FX-AP-1').id,
    journalLineId: supplierEntry.lines.find((entryLine) => entryLine.accountCode === '5121')!.id,
  }, entityId);
  const supplierPayment = await CashflowBankingService.allocatePayment({
    statementLineId: lineFor('FX-AP-1').id,
    purchaseInvoiceId: purchaseInvoice.id,
    documentAmount: 100,
  }, entityId);
  assert.equal(supplierPayment.realizedFxLoss, 10);
  assert.equal(supplierPayment.settlementExchangeRate, 3.1);
  assert.equal(supplierPayment.remainingAmount, 0);

  const reversal = await FinanceService.createJournalReversal(
    firstEntry.id,
    entityId,
    { id: 'fx-preparer', username: 'FX preparer' },
    'Annulation de test FX',
    '2026-04-01',
  );
  assert.ok(reversal);
  await FinanceService.approveJournalEntry(
    reversal!.id,
    entityId,
    { id: 'fx-reviewer', username: 'FX reviewer' },
    'Contrôle de test FX',
  );
  await FinanceService.postJournalEntry(
    reversal!.id,
    entityId,
    { id: 'fx-poster', username: 'FX poster' },
    'Comptabilisation de test FX',
  );
  await CashflowBankingService.removePayment(firstPayment.id, entityId);
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } }))?.status, 'ISSUED');
  assert.equal((await CashflowBankingService.listPaymentTargets(entityId))
    .find((target) => target.id === invoice.id)?.remainingAmount, 50);
  await assert.rejects(
    CashflowBankingService.allocatePayment({
      statementLineId: lineFor('FX-AR-1').id,
      invoiceId: invoice.id,
      documentAmount: 50,
    }, entityId),
    (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 409,
  );
  await prisma.cashflowPayment.deleteMany({
    where: { id: { in: [secondPayment.id, supplierPayment.id] } },
  });
  await prisma.bankReconciliation.deleteMany({ where: { statementLineId: { in: lines.map((line) => line.id) } } });
  await prisma.bankStatementLine.deleteMany({ where: { statementId: statement.id } });
  await prisma.bankStatement.delete({ where: { id: statement.id } });
  await prisma.invoice.delete({ where: { id: invoice.id } });
  await prisma.purchaseInvoice.delete({ where: { id: purchaseInvoice.id } });
  await prisma.cashflowAccountingMapping.deleteMany({ where: { entityId } });
  await prisma.countryProfile.update({
    where: { id: countryId },
    data: { realizedFxGainAccountCode: null, realizedFxLossAccountCode: null },
  });
});

after(async () => {
  await prisma.$disconnect();
});

describe('persisted bank statement and reconciliation flow', () => {
  it('imports idempotently, scopes rows, finds exact ledger candidates, and reconciles atomically', async () => {
    const bankAccount = await CashflowBankingService.createBankAccount({
      name: 'Banque TND',
      currencyCode: 'TND',
      ledgerAccountCode: '5121',
    }, entityId);
    await assert.rejects(
      CashflowBankingService.createBankAccount({
        name: 'Compte de charge',
        currencyCode: 'TND',
        ledgerAccountCode: '6061',
      }, entityId),
      (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 400,
    );

    const csv = [
      'date,description,amount,reference,balance',
      '2026-03-04,Encaissement client,100.500,REF-100,500.000',
      '2026-03-05,Frais sortant,-7.250,REF-101,492.750',
    ].join('\n');
    const statement = await CashflowBankingService.importStatement({
      bankAccountId: bankAccount.id,
      csv,
      importedByUserId: 'test-user',
    }, entityId);
    assert.equal(statement.lineCount, 2);
    await assert.rejects(
      CashflowBankingService.importStatement({ bankAccountId: bankAccount.id, csv }, entityId),
      (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 409,
    );
    const lines = await CashflowBankingService.listStatementLines(statement.id, entityId);
    assert.equal(lines.length, 2);
    await assert.rejects(
      CashflowBankingService.listStatementLines(statement.id, otherEntityId),
      (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 404,
    );

    const duplicateReferenceCsv = [
      'date,description,amount,reference',
      '2026-03-04,Encaissement importé deux fois,100.500,REF-100',
    ].join('\n');
    await assert.rejects(
      CashflowBankingService.importStatement({
        bankAccountId: bankAccount.id,
        csv: duplicateReferenceCsv,
      }, entityId),
      (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 409,
    );
    assert.equal(await prisma.bankStatement.count({ where: { entityId } }), 1);

    const entry = await prisma.journalEntry.create({
      data: {
        entryNumber: 'BANK-TEST-1',
        entityId,
        date: new Date('2026-03-04T00:00:00.000Z'),
        description: 'Encaissement comptable test',
        status: 'POSTED',
        lines: {
          create: [
            { accountCode: '5121', debit: 100.5, credit: 0 },
            { accountCode: '4111', debit: 0, credit: 100.5 },
          ],
        },
      },
      include: { lines: true },
    });
    const candidateSet = await CashflowBankingService.getReconciliationCandidates(lines[0].id, entityId);
    assert.deepEqual(candidateSet.candidates.map((candidate) => candidate.id), [entry.lines[0].id]);
    await assert.rejects(
      CashflowBankingService.getReconciliationCandidates(lines[0].id, otherEntityId),
      (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 404,
    );

    await assert.rejects(
      CashflowBankingService.reconcile({
        statementLineId: lines[0].id,
        journalLineId: entry.lines[1].id,
      }, entityId),
      (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 409,
    );
    assert.equal(await prisma.bankReconciliation.count({ where: { entityId } }), 0);

    const reconciliation = await CashflowBankingService.reconcile({
      statementLineId: lines[0].id,
      journalLineId: entry.lines[0].id,
      userId: 'test-user',
    }, entityId);
    assert.equal(await prisma.bankReconciliation.count({ where: { entityId } }), 1);
    await assert.rejects(
      CashflowBankingService.allocatePayment({ statementLineId: lines[0].id, invoiceId: 'missing' }, entityId),
      (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 409,
    );
    const mapping = await CashflowBankingService.setAccountingMapping({
      receivableAccountCode: '4111',
      payableAccountCode: '4011',
    }, entityId);
    assert.equal(mapping.receivableAccountCode, '4111');
    assert.equal(mapping.payableAccountCode, '4011');
    const paymentCustomer = await prisma.customer.create({
      data: { code: 'BANK-PAYMENT-CUSTOMER', name: 'Client règlement fictif', entityId },
    });
    const paymentInvoice = await prisma.invoice.create({
      data: {
        invoiceNumber: 'BANK-PAYMENT-INVOICE',
        entityId,
        customerId: paymentCustomer.id,
        currencyCode: 'TND',
        functionalCurrencyCode: 'TND',
        totalAmount: 125.625,
        subTotal: 125.625,
        taxAmount: 0,
        stampDuty: 0,
        status: 'ISSUED',
      },
    });
    const customerPayment = await CashflowBankingService.allocatePayment({
      statementLineId: lines[0].id,
      invoiceId: paymentInvoice.id,
    }, entityId, 'test-user');
    assert.equal(customerPayment.amount, 100.5);
    assert.equal(customerPayment.remainingAmount, 25.125);
    assert.equal((await prisma.invoice.findUnique({ where: { id: paymentInvoice.id } }))?.status, 'ISSUED');
    assert.equal((await CashflowBankingService.listPaymentTargets(entityId))
      .find((target) => target.id === paymentInvoice.id)?.remainingAmount, 25.125);
    await assert.rejects(
      CashflowBankingService.allocatePayment({ statementLineId: lines[0].id, invoiceId: paymentInvoice.id }, entityId),
      (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 409,
    );
    const additionalStatement = await CashflowBankingService.importStatement({
      bankAccountId: bankAccount.id,
      csv: 'date,description,amount,reference\n2026-03-06,Encaissement partiel complémentaire,25.125,REF-102',
    }, entityId);
    const additionalLine = (await CashflowBankingService.listStatementLines(additionalStatement.id, entityId))[0];
    const additionalEntry = await prisma.journalEntry.create({
      data: {
        entryNumber: 'BANK-TEST-3',
        entityId,
        date: new Date('2026-03-06T00:00:00.000Z'),
        description: 'Encaissement partiel complémentaire',
        status: 'POSTED',
        lines: { create: [
          { accountCode: '5121', debit: 25.125, credit: 0 },
          { accountCode: '4111', debit: 0, credit: 25.125 },
        ] },
      },
      include: { lines: true },
    });
    const additionalReconciliation = await CashflowBankingService.reconcile({
      statementLineId: additionalLine.id,
      journalLineId: additionalEntry.lines[0].id,
    }, entityId);
    const finalCustomerPayment = await CashflowBankingService.allocatePayment({
      statementLineId: additionalLine.id,
      invoiceId: paymentInvoice.id,
    }, entityId);
    assert.equal(finalCustomerPayment.remainingAmount, 0);
    assert.equal((await prisma.invoice.findUnique({ where: { id: paymentInvoice.id } }))?.status, 'PAID');
    const supplier = await prisma.vendor.create({
      data: { code: 'BANK-PAYMENT-VENDOR', name: 'Fournisseur fictif', entityId },
    });
    const purchaseInvoice = await prisma.purchaseInvoice.create({
      data: {
        invoiceNumber: 'BANK-PURCHASE-INVOICE',
        entityId,
        vendorId: supplier.id,
        issueDate: new Date('2026-03-05T00:00:00.000Z'),
        dueDate: new Date('2026-03-05T00:00:00.000Z'),
        currencyCode: 'TND',
        functionalCurrencyCode: 'TND',
        totalAmount: 7.25,
        subTotal: 7.25,
        taxRateId: 'synthetic-test-tax',
        taxRateCode: 'TEST',
        taxRate: 0,
        taxAmount: 0,
      },
    });
    const supplierEntry = await prisma.journalEntry.create({
      data: {
        entryNumber: 'BANK-TEST-2',
        entityId,
        date: new Date('2026-03-05T00:00:00.000Z'),
        description: 'Paiement fournisseur test',
        status: 'POSTED',
        lines: { create: [
          { accountCode: '4011', debit: 7.25, credit: 0 },
          { accountCode: '5121', debit: 0, credit: 7.25 },
        ] },
      },
      include: { lines: true },
    });
    const supplierReconciliation = await CashflowBankingService.reconcile({
      statementLineId: lines[1].id,
      journalLineId: supplierEntry.lines[1].id,
    }, entityId);
    await assert.rejects(
      CashflowBankingService.allocatePayment({
        statementLineId: lines[1].id,
        purchaseInvoiceId: purchaseInvoice.id,
      }, entityId),
      (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 404,
    );
    await prisma.purchaseInvoice.update({
      where: { id: purchaseInvoice.id },
      data: { status: 'POSTED' },
    });
    assert.ok((await CashflowBankingService.listPaymentTargets(entityId))
      .some((target) => target.id === purchaseInvoice.id && target.type === 'PURCHASE_INVOICE'));
    const supplierPayment = await CashflowBankingService.allocatePayment({
      statementLineId: lines[1].id,
      purchaseInvoiceId: purchaseInvoice.id,
    }, entityId);
    assert.equal(supplierPayment.remainingAmount, 0);
    assert.equal((await prisma.purchaseInvoice.findUnique({ where: { id: purchaseInvoice.id } }))?.status, 'POSTED');
    assert.equal((await CashflowBankingService.listPayments(entityId)).length, 3);
    assert.equal((await CashflowBankingService.listPayments(otherEntityId)).length, 0);
    await CashflowBankingService.removePayment(supplierPayment.id, entityId);
    await CashflowBankingService.removeReconciliation(supplierReconciliation.id, entityId);
    await CashflowBankingService.removePayment(finalCustomerPayment.id, entityId);
    await CashflowBankingService.removeReconciliation(additionalReconciliation.id, entityId);
    await assert.rejects(
      CashflowBankingService.reconcile({
        statementLineId: lines[0].id,
        journalLineId: entry.lines[0].id,
      }, entityId),
      (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 409,
    );
    await CashflowBankingService.removePayment(customerPayment.id, entityId);
    assert.equal((await prisma.invoice.findUnique({ where: { id: paymentInvoice.id } }))?.status, 'ISSUED');
    await CashflowBankingService.removeReconciliation(reconciliation.id, entityId);
    assert.equal(await prisma.bankReconciliation.count({ where: { entityId } }), 0);
    assert.equal((await CashflowBankingService.listStatementLines(statement.id, entityId))[0].reconciliation, null);

    const scenario = await CashflowForecastService.createScenario({
      name: 'Prévision de test',
      bankAccountId: bankAccount.id,
    }, entityId);
    const customer = await prisma.customer.create({
      data: { code: 'BANK-CUSTOMER', name: 'Client fictif', entityId },
    });
    const dueInvoice = await prisma.invoice.create({
      data: {
        invoiceNumber: 'BANK-INVOICE-1',
        entityId,
        customerId: customer.id,
        currencyCode: 'TND',
        functionalCurrencyCode: 'TND',
        documentCurrencyCode: 'TND',
        subTotal: 100,
        taxAmount: 0,
        stampDuty: 0,
        totalAmount: 100,
        createdAt: new Date('2026-03-04T00:00:00.000Z'),
        dueDate: new Date('2026-03-06T00:00:00.000Z'),
        status: 'ISSUED',
      },
    });
    const reviewPurchaseInvoice = await prisma.purchaseInvoice.create({
      data: {
        invoiceNumber: 'BANK-PURCHASE-NO-DUE-DATE',
        entityId,
        vendorId: supplier.id,
        issueDate: new Date('2026-03-05T00:00:00.000Z'),
        dueDate: new Date('2026-03-07T00:00:00.000Z'),
        currencyCode: 'TND',
        functionalCurrencyCode: 'TND',
        totalAmount: 4,
        subTotal: 4,
        taxRateId: 'synthetic-test-tax',
        taxRateCode: 'TEST',
        taxRate: 0,
        taxAmount: 0,
      },
    });
    const sources = await CashflowForecastService.listSources(scenario.id, entityId);
    assert.deepEqual(sources.map((source) => ({
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      amount: source.amount,
      category: source.category,
      status: source.status,
    })), [
      {
        sourceType: 'PURCHASE_INVOICE',
        sourceId: purchaseInvoice.id,
        amount: 7.25,
        category: 'Facture fournisseur comptabilisée',
        status: 'POSTED',
      },
      {
        sourceType: 'SALES_INVOICE',
        sourceId: dueInvoice.id,
        amount: 100,
        category: 'Facture client émise',
        status: 'ISSUED',
      },
      {
        sourceType: 'PURCHASE_INVOICE',
        sourceId: reviewPurchaseInvoice.id,
        amount: 4,
        category: 'Facture fournisseur à contrôler',
        status: 'TO_REVIEW',
      },
    ]);
    await CashflowForecastService.createItem({
      sourceType: 'SALES_INVOICE',
      sourceId: dueInvoice.id,
    }, scenario.id, entityId);
    await assert.rejects(
      CashflowForecastService.createItem({
        expectedDate: '2026-03-06',
        description: 'Encaissement confirmé',
        direction: 'INFLOW',
        amount: 25.125,
        category: 'Client',
        status: 'CONFIRMED',
      }, scenario.id, entityId),
      (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 400,
    );
    await CashflowForecastService.createItem({
      expectedDate: '2026-03-06',
      description: 'Encaissement attendu',
      direction: 'INFLOW',
      amount: 25.125,
      category: 'Client',
    }, scenario.id, entityId);
    const forecast = await CashflowForecastService.getScenarioData(scenario.id, entityId, '2');
    assert.equal(forecast.openingBalance, 492.75);
    assert.equal(forecast.openingBalanceSource, 'STATEMENT');
    assert.equal(forecast.scenario.openingBalance, 492.75);
    assert.equal(forecast.scenario.openingBalanceSource, 'STATEMENT');
    assert.deepEqual(forecast.days, [
      { date: '2026-03-06', inflows: 125.125, outflows: 0, closingBalance: 617.875 },
      { date: '2026-03-07', inflows: 0, outflows: 0, closingBalance: 617.875 },
    ]);
    assert.equal(forecast.items.length, 2);
    await assert.rejects(
      CashflowForecastService.createItem({
        expectedDate: 'date-invalide',
        description: 'Date invalide',
        direction: 'INFLOW',
        amount: 1,
        category: 'Test',
      }, scenario.id, entityId),
      (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 400,
    );
    await assert.rejects(
      CashflowForecastService.getScenarioData(scenario.id, otherEntityId, 2),
      (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 404,
    );

    const emptyBankAccount = await CashflowBankingService.createBankAccount({
      name: 'Banque sans relevé',
      currencyCode: 'TND',
      ledgerAccountCode: '5122',
    }, entityId);
    const noOpeningScenario = await CashflowForecastService.createScenario({
      name: 'Sans solde initial',
      bankAccountId: emptyBankAccount.id,
    }, entityId);
    await CashflowForecastService.createItem({
      expectedDate: '2026-03-06',
      description: 'Flux à dater',
      direction: 'OUTFLOW',
      amount: 2,
      category: 'Test',
    }, noOpeningScenario.id, entityId);
    const noOpeningForecast = await CashflowForecastService.getScenarioData(noOpeningScenario.id, entityId, 2);
    assert.equal(noOpeningForecast.diagnostics.hasOpeningBalance, false);
    assert.deepEqual(noOpeningForecast.days, []);
    assert.equal(noOpeningForecast.items.length, 1);
  });
});

describe('persisted internal bank transfer flow', () => {
  it('posts once, records both accounts, and reconciles each signed bank movement', async () => {
    const source = await CashflowBankingService.createBankAccount({
      name: 'Banque source virement',
      currencyCode: 'TND',
      ledgerAccountCode: '5121',
    }, entityId);
    const destination = await CashflowBankingService.createBankAccount({
      name: 'Banque destination virement',
      currencyCode: 'TND',
      ledgerAccountCode: '5121',
    }, entityId);
    const request = {
      sourceBankAccountId: source.id,
      destinationBankAccountId: destination.id,
      amount: 42.375,
      transferredAt: '2026-03-11',
      reference: 'VIR-TEST-1',
      description: 'Transfert entre comptes de test',
      idempotencyKey: 'bank-transfer-integration-1',
    };
    const transfer = await CashflowBankingService.createBankTransfer(
      request,
      entityId,
      { id: 'bank-transfer-user', username: 'test-finance' },
    );
    assert.equal(transfer.postingJournalEntry.status, 'POSTED');
    assert.equal(transfer.amount, request.amount);
    assert.equal(transfer.currencyCode, 'TND');
    assert.equal(transfer.sourceBankAccount.id, source.id);
    assert.equal(transfer.destinationBankAccount.id, destination.id);
    const replay = await CashflowBankingService.createBankTransfer(
      request,
      entityId,
      { id: 'bank-transfer-user', username: 'test-finance' },
    );
    assert.equal(replay.id, transfer.id);
    assert.equal(await prisma.bankTransfer.count({ where: { entityId } }), 1);

    const journal = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: transfer.postingJournalEntryId },
      include: { lines: true },
    });
    const sourceJournalLine = journal.lines.find((line) => line.accountCode === '5121' && line.credit === request.amount);
    const destinationJournalLine = journal.lines.find((line) => line.accountCode === '5121' && line.debit === request.amount);
    assert.ok(sourceJournalLine);
    assert.ok(destinationJournalLine);

    const sourceStatement = await CashflowBankingService.importStatement({
      bankAccountId: source.id,
      csv: 'date,description,amount,reference\n2026-03-11,Virement émis,-42.375,VIR-TEST-1-S',
    }, entityId);
    const destinationStatement = await CashflowBankingService.importStatement({
      bankAccountId: destination.id,
      csv: 'date,description,amount,reference\n2026-03-11,Virement reçu,42.375,VIR-TEST-1-D',
    }, entityId);
    const [sourceLine] = await CashflowBankingService.listStatementLines(sourceStatement.id, entityId);
    const [destinationLine] = await CashflowBankingService.listStatementLines(destinationStatement.id, entityId);
    const sourceCandidates = await CashflowBankingService.getReconciliationCandidates(sourceLine.id, entityId);
    const destinationCandidates = await CashflowBankingService.getReconciliationCandidates(destinationLine.id, entityId);
    assert.ok(sourceCandidates.candidates.some((candidate) => candidate.id === sourceJournalLine.id));
    assert.ok(destinationCandidates.candidates.some((candidate) => candidate.id === destinationJournalLine.id));
    await CashflowBankingService.reconcile({
      statementLineId: sourceLine.id,
      journalLineId: sourceJournalLine.id,
    }, entityId);
    await CashflowBankingService.reconcile({
      statementLineId: destinationLine.id,
      journalLineId: destinationJournalLine.id,
    }, entityId);
    assert.equal(await prisma.bankReconciliation.count({ where: { entityId } }), 2);
  });
});

it('revalues open foreign receivables and payables, then auto-posts the next-period reversal', async () => {
  await CashflowBankingService.setAccountingMapping({
    receivableAccountCode: '4111',
    payableAccountCode: '4011',
  }, entityId);
  await prisma.countryProfile.update({
    where: { id: countryId },
    data: {
      unrealizedFxGainAccountCode: '7662',
      unrealizedFxLossAccountCode: '6662',
    },
  });
  const customer = await prisma.customer.create({
    data: { code: 'REVAL-CUSTOMER', name: 'Client réévaluation fictif', entityId },
  });
  await prisma.invoice.create({
    data: {
      invoiceNumber: 'REVAL-SALES-INV',
      entityId,
      customerId: customer.id,
      currencyCode: 'TND',
      documentCurrencyCode: 'USD',
      documentTotalAmount: 100,
      functionalCurrencyCode: 'TND',
      totalAmount: 285,
      subTotal: 285,
      taxAmount: 0,
      stampDuty: 0,
      status: 'ISSUED',
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
    },
  });
  const vendor = await prisma.vendor.create({
    data: { code: 'REVAL-VENDOR', name: 'Fournisseur réévaluation fictif', entityId },
  });
  await prisma.purchaseInvoice.create({
    data: {
      invoiceNumber: 'REVAL-PURCHASE-INV',
      entityId,
      vendorId: vendor.id,
      issueDate: new Date('2026-03-10T00:00:00.000Z'),
      dueDate: new Date('2026-04-10T00:00:00.000Z'),
      currencyCode: 'TND',
      documentCurrencyCode: 'USD',
      documentTotalAmount: 100,
      functionalCurrencyCode: 'TND',
      totalAmount: 285,
      subTotal: 285,
      taxRateId: 'fx-revaluation-test-tax',
      taxRateCode: 'FXREVAL',
      taxRate: 0,
      taxAmount: 0,
      status: 'POSTED',
    },
  });
  await assert.rejects(
    FxRevaluationService.createRun({
      effectiveDate: '2026-03-31',
      note: 'Taux manquant',
    }, entityId, { id: 'fx-reval-preparer', username: 'Préparateur test' }),
    /Aucun cours BCT interbancaire commun/,
  );
  assert.equal(await prisma.fxRevaluationRun.count({ where: { entityId } }), 0);
  await prisma.exchangeRate.create({
    data: {
      baseCurrency: 'USD',
      quoteCurrency: 'TND',
      rate: 3.1,
      sourceName: BCT_INTERBANK_SOURCE_NAME,
      sourceUrl: BCT_INTERBANK_RATES_URL,
      rateType: 'INTERBANK',
      sourceUnit: 1,
      sourceValue: 3.1,
      effectiveDate: new Date('2026-03-31T00:00:00.000Z'),
      importedAt: new Date('2026-04-01T06:00:00.000Z'),
    },
  });
  await prisma.cashflowAccountingMapping.deleteMany({ where: { entityId } });
  await assert.rejects(
    FxRevaluationService.createRun({
      effectiveDate: '2026-03-31',
      note: 'Mapping manquant',
    }, entityId, { id: 'fx-reval-preparer', username: 'Préparateur test' }),
    /mapping de trésorerie est requis/,
  );
  assert.equal(await prisma.fxRevaluationRun.count({ where: { entityId } }), 0);
  await CashflowBankingService.setAccountingMapping({
    receivableAccountCode: '4111',
    payableAccountCode: '4011',
  }, entityId);
  const run = await FxRevaluationService.createRun({
    effectiveDate: '2026-03-31',
    note: 'Clôture mensuelle test',
  }, entityId, { id: 'fx-reval-preparer', username: 'Préparateur test' });
  assert.equal(run.status, 'TO_REVIEW');
  assert.equal(run.items.length, 2);
  assert.equal((await FxRevaluationService.createRun({
    effectiveDate: '2026-03-31',
    note: 'Nouvelle demande idempotente',
  }, entityId, { id: 'autre-acteur', username: 'Autre acteur' })).id, run.id);
  assert.equal((await FxRevaluationService.listRuns(otherEntityId)).length, 0);
  assert.equal(run.reversalDate.toISOString().slice(0, 10), '2026-04-01');
  const journal = run.revaluationJournalEntry;
  assert.equal(journal.lines.reduce((sum, line) => sum + line.debit, 0), 50);
  assert.equal(journal.lines.reduce((sum, line) => sum + line.credit, 0), 50);
  assert.ok(journal.lines.some((line) => line.accountCode === '7662' && line.credit === 25));
  assert.ok(journal.lines.some((line) => line.accountCode === '6662' && line.debit === 25));
  await FinanceService.approveJournalEntry(
    journal.id,
    entityId,
    { id: 'fx-reval-reviewer', username: 'Contrôleur test' },
    'Taux et soldes vérifiés',
  );
  await FinanceService.postJournalEntry(
    journal.id,
    entityId,
    { id: 'fx-reval-poster', username: 'Comptable test' },
    'Réévaluation comptabilisée',
  );
  assert.equal((await prisma.fxRevaluationRun.findUnique({ where: { id: run.id } }))?.status, 'POSTED');
  const reversalResult = await FxRevaluationService.processDueReversals(new Date('2026-04-01T00:05:00.000Z'));
  assert.equal(reversalResult.processed, 1);
  const afterReversal = await prisma.fxRevaluationRun.findUnique({
    where: { id: run.id },
    include: { reversalJournalEntry: { include: { lines: true } } },
  });
  assert.ok(afterReversal?.reversalJournalEntry);
  assert.equal(afterReversal.reversalJournalEntry.status, 'POSTED');
  assert.equal(afterReversal.reversalJournalEntry.reversesEntryId, journal.id);
  assert.equal(afterReversal.reversalJournalEntry.date.toISOString().slice(0, 10), '2026-04-01');
  assert.equal(
    afterReversal.reversalJournalEntry.lines.reduce((sum, line) => sum + line.debit, 0),
    50,
  );
  assert.equal((await FxRevaluationService.processDueReversals(new Date('2026-04-01T00:05:00.000Z'))).processed, 0);
});
