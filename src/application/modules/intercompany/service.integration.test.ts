import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import { FinanceRequestError } from '../finance/errors';
import FinanceService from '../finance/service';
import { IntercompanyRequestError } from './errors';
import IntercompanyService from './service';

let sellerEntityId = '';
let buyerEntityId = '';
let outsiderEntityId = '';

before(async () => {
  const [tnd, eur] = await Promise.all([
    prisma.countryProfile.create({ data: { code: 'ICT', name: 'Interco synthetic TND', currencyCode: 'TND' } }),
    prisma.countryProfile.create({ data: { code: 'ICE', name: 'Interco synthetic EUR', currencyCode: 'EUR' } }),
  ]);
  const [seller, buyer, outsider] = await Promise.all([
    prisma.entity.create({ data: { code: 'IC-SELLER', name: 'Interco synthetic seller', countryId: tnd.id } }),
    prisma.entity.create({ data: { code: 'IC-BUYER', name: 'Interco synthetic buyer', countryId: eur.id } }),
    prisma.entity.create({ data: { code: 'IC-OUTSIDER', name: 'Interco synthetic outsider', countryId: eur.id } }),
  ]);
  sellerEntityId = seller.id;
  buyerEntityId = buyer.id;
  outsiderEntityId = outsider.id;
  await prisma.chartOfAccount.createMany({
    data: [
      { countryId: tnd.id, code: 'IC-AR', description: 'Interco receivable', classNumber: 4, type: 'Asset', financialCategory: 'TRADE_RECEIVABLE' },
      { countryId: tnd.id, code: 'IC-REV', description: 'Interco revenue', classNumber: 7, type: 'Revenue', financialCategory: 'REVENUE' },
      { countryId: eur.id, code: 'IC-STOCK', description: 'Interco inventory', classNumber: 3, type: 'Asset', financialCategory: 'INVENTORY' },
      { countryId: eur.id, code: 'IC-AP', description: 'Interco payable', classNumber: 4, type: 'Liability', financialCategory: 'TRADE_PAYABLE' },
    ],
  });
  const group = await prisma.consolidationGroup.create({
    data: {
      ownerEntityId: seller.id,
      name: 'Interco synthetic group',
      reportingCurrencyCode: 'TND',
      entities: {
        create: [
          { entityId: seller.id, ownershipPercentage: 100, consolidationMethod: 'FULL' },
          { entityId: buyer.id, ownershipPercentage: 100, consolidationMethod: 'FULL' },
        ],
      },
    },
  });
  assert.ok(group.id);
});

after(async () => {
  await prisma.$disconnect();
});

describe('native intercompany transactions', () => {
  it('creates balanced reciprocal entries, gates workflow atomically and requires both entities to reconcile', async () => {
    const input = {
      buyerEntityId,
      reference: 'IC-TEST-2026-01',
      description: 'Synthetic intercompany goods sale',
      date: '2026-03-15',
      currencyCode: 'TND',
      sellerAmount: 1000,
      buyerAmount: 300,
      exchangeRate: 0.3,
      sellerReceivableAccountCode: 'IC-AR',
      sellerRevenueAccountCode: 'IC-REV',
      buyerInventoryAccountCode: 'IC-STOCK',
      buyerPayableAccountCode: 'IC-AP',
    };
    await assert.rejects(
      IntercompanyService.create({ ...input, buyerAmount: 301 }, sellerEntityId, { id: 'maker', username: 'maker' }),
      (error: unknown) => error instanceof IntercompanyRequestError && error.statusCode === 422,
    );
    const created = await IntercompanyService.create(input, sellerEntityId, { id: 'maker', username: 'maker' });
    assert.equal(created.status, 'PENDING_APPROVAL');
    assert.equal(created.sellerJournalEntry.status, 'TO_REVIEW');
    assert.equal(created.buyerJournalEntry.status, 'TO_REVIEW');
    assert.equal(created.sellerJournalEntry.lines.reduce((sum, line) => sum + line.debit, 0), 1000);
    assert.equal(created.sellerJournalEntry.lines.reduce((sum, line) => sum + line.credit, 0), 1000);
    assert.equal(created.buyerJournalEntry.lines.reduce((sum, line) => sum + line.debit, 0), 300);
    assert.equal(created.buyerJournalEntry.lines.reduce((sum, line) => sum + line.credit, 0), 300);
    assert.deepEqual((await IntercompanyService.list(outsiderEntityId)), []);

    const sellerRevenueLine = created.sellerJournalEntry.lines.find((line) => line.credit > 0);
    assert.ok(sellerRevenueLine);
    await prisma.journalLine.update({ where: { id: sellerRevenueLine.id }, data: { accountCode: 'IC-AR' } });
    await assert.rejects(
      IntercompanyService.approve(created.id, sellerEntityId, { id: 'reviewer', username: 'reviewer' }),
      (error: unknown) => error instanceof IntercompanyRequestError && error.statusCode === 422,
    );
    await prisma.journalLine.update({ where: { id: sellerRevenueLine.id }, data: { accountCode: 'IC-REV' } });
    await assert.rejects(
      IntercompanyService.approve(created.id, sellerEntityId, { id: 'maker', username: 'maker' }),
      (error: unknown) => error instanceof IntercompanyRequestError && error.statusCode === 403,
    );
    await assert.rejects(
      FinanceService.approveJournalEntry(created.sellerJournalEntryId, sellerEntityId, { id: 'reviewer', username: 'reviewer' }, 'Contrôle standard'),
      (error: unknown) => error instanceof FinanceRequestError && error.statusCode === 409,
    );
    const approved = await IntercompanyService.approve(created.id, buyerEntityId, { id: 'reviewer', username: 'reviewer' });
    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.sellerJournalEntry.status, 'APPROVED');
    assert.equal(approved.buyerJournalEntry.status, 'APPROVED');

    await assert.rejects(
      IntercompanyService.post(created.id, sellerEntityId, { id: 'reviewer', username: 'reviewer' }),
      (error: unknown) => error instanceof IntercompanyRequestError && error.statusCode === 403,
    );
    const posted = await IntercompanyService.post(created.id, sellerEntityId, { id: 'poster', username: 'poster' });
    assert.equal(posted.status, 'POSTED');
    assert.equal(posted.sellerJournalEntry.status, 'POSTED');
    assert.equal(posted.buyerJournalEntry.status, 'POSTED');

    const sellerConfirmation = await IntercompanyService.reconcile(created.id, sellerEntityId, { id: 'seller-controller', username: 'seller-controller' });
    assert.equal(sellerConfirmation.status, 'POSTED');
    const reconciled = await IntercompanyService.reconcile(created.id, buyerEntityId, { id: 'buyer-controller', username: 'buyer-controller' });
    assert.equal(reconciled.status, 'RECONCILED');
    assert.equal((await IntercompanyService.list(sellerEntityId)).length, 1);
    assert.equal((await IntercompanyService.list(outsiderEntityId)).length, 0);
  });
});
