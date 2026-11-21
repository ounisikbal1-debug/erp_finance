import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import { TaxationService } from './service';

describe('TaxationService.getMonthlyTaxDeclaration', () => {
  it('uses only current RS certificate snapshots and externally reviewed IS workpapers', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let certificateAmount = 12.345;
    stub(prisma.entity, 'findUnique', async () => ({
      country: {
        code: 'TN',
        currencyCode: 'TND',
        corporateTax: 20,
        purchaseVatAccountCode: '4366',
        salesVatAccountCode: '4367',
        taxRates: [],
      },
    }));
    stub(prisma.invoice, 'findMany', async () => []);
    stub(prisma.journalLine, 'findMany', async () => []);
    stub(prisma.purchaseInvoice, 'findMany', async () => []);
    stub(prisma.supplierCreditNote, 'findMany', async () => []);
    stub(prisma.taxDeclarationWorkpaper, 'findMany', async () => [
      { section: 'RS', amount: 12.345, taxableBase: null, taxRateSnapshot: null, certificateCount: 1 },
      { section: 'IS', amount: 173.456, taxableBase: 1000, taxRateSnapshot: 20, certificateCount: null },
    ]);
    stub(prisma.withholdingCertificate, 'findMany', async () => [
      {
        status: 'ISSUED',
        category: 'achats',
        grossAmountTtc: 1234.5,
        withholdingRate: 1,
        withholdingAmount: certificateAmount,
        currencyCode: 'TND',
        sourceReference: 'PURCHASE-01',
      },
    ]);

    try {
      const declaration = await TaxationService.getMonthlyTaxDeclaration('2026-10', 'entity-1');
      assert.equal(declaration.rsWithholdingGlobal, 12.345);
      assert.deepEqual(declaration.rsDetails, [{
        category: 'achats',
        sourceReference: 'PURCHASE-01',
        baseTtc: 1234.5,
        rate: 1,
        amount: 12.345,
      }]);
      assert.equal(declaration.isCorporateTaxGlobal, 173.456);
      assert.equal(declaration.totalTaxToPay, null);

      certificateAmount = 13;
      const staleDeclaration = await TaxationService.getMonthlyTaxDeclaration('2026-10', 'entity-1');
      assert.equal(staleDeclaration.rsWithholdingGlobal, null);
      assert.deepEqual(staleDeclaration.rsDetails, []);
      assert.equal(staleDeclaration.isCorporateTaxGlobal, 173.456);
      assert.ok(staleDeclaration.unavailableSections.some((section) => section.startsWith('Retenues à la source G50 :')));
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('loads invoices and both VAT ledger sections concurrently', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    const queries: unknown[] = [];
    let invoiceQuery: unknown;
    let purchaseInvoiceQuery: unknown;
    let creditNoteQuery: unknown;
    let releaseQueries: () => void = () => {};
    const queryGate = new Promise<void>((resolve) => {
      releaseQueries = resolve;
    });
    stub(prisma.entity, 'findUnique', async () => ({
      country: {
        code: 'TN',
        currencyCode: 'TND',
        corporateTax: 20,
        purchaseVatAccountCode: '4366',
        salesVatAccountCode: '4367',
        taxRates: [{ id: 'tax-rate-19', purchaseVatRecoverable: true }],
      },
    }));
    stub(prisma.invoice, 'findMany', (query: unknown) => {
      invoiceQuery = query;
      queries.push(query);
      return queryGate.then(() => []);
    });
    stub(prisma.journalLine, 'findMany', (query: unknown) => {
      queries.push(query);
      return queryGate.then(() => []);
    });
    stub(prisma.purchaseInvoice, 'findMany', (query: unknown) => {
      queries.push(query);
      purchaseInvoiceQuery = query;
      return queryGate.then(() => []);
    });
    stub(prisma.supplierCreditNote, 'findMany', (query: unknown) => {
      queries.push(query);
      creditNoteQuery = query;
      return queryGate.then(() => []);
    });
    stub(prisma.taxDeclarationWorkpaper, 'findMany', async () => []);
    stub(prisma.withholdingCertificate, 'findMany', async () => []);

    const declarationPromise = TaxationService.getMonthlyTaxDeclaration('2026-10', 'entity-1');
    let allQueriesStarted = false;
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      allQueriesStarted = queries.length === 5;
    } finally {
      releaseQueries();
      await declarationPromise;
      restorers.reverse().forEach((restore) => restore());
    }

    assert.equal(allQueriesStarted, true);
    assert.deepEqual(queries.slice(1, 3).map((query) => (query as {
      where: { accountCode: string };
    }).where.accountCode).sort(), ['4366', '4367']);
    assert.deepEqual(purchaseInvoiceQuery, {
      where: {
        entityId: 'entity-1',
        status: 'POSTED',
        issueDate: {
          gte: new Date('2026-10-01T00:00:00.000Z'),
          lt: new Date('2026-11-01T00:00:00.000Z'),
        },
      },
      select: {
        invoiceNumber: true,
        taxRateId: true,
        subTotal: true,
        taxAmount: true,
        taxRate: true,
      },
    });
    assert.deepEqual(creditNoteQuery, {
      where: {
        entityId: 'entity-1',
        status: 'POSTED',
        OR: [
          { creditDate: { gte: new Date('2026-10-01T00:00:00.000Z'), lt: new Date('2026-11-01T00:00:00.000Z') } },
          { creditDate: null, postedAt: { gte: new Date('2026-10-01T00:00:00.000Z'), lt: new Date('2026-11-01T00:00:00.000Z') } },
        ],
      },
      select: {
        supplierDocumentNumber: true,
        taxRateId: true,
        creditDate: true,
        subTotal: true,
        taxAmount: true,
        taxRate: true,
      },
    });
    assert.deepEqual(invoiceQuery, {
      where: {
        entityId: 'entity-1',
        status: { in: ['ISSUED', 'PAID'] },
        createdAt: {
          gte: new Date('2026-10-01T00:00:00.000Z'),
          lt: new Date('2026-11-01T00:00:00.000Z'),
        },
      },
      select: {
        invoiceNumber: true,
        subTotal: true,
        taxAmount: true,
        currencyCode: true,
        documentCurrencyCode: true,
        functionalCurrencyCode: true,
        exchangeRate: true,
        exchangeRateDate: true,
        exchangeRateSource: true,
        items: { select: { quantity: true, unitPrice: true, taxRate: true } },
      },
    });
  });

  describe('TaxationService withholding preview', () => {
    it('scopes the user-provided preview to a Tunisian entity without writing data', async () => {
      const original = Object.getOwnPropertyDescriptor(prisma.entity, 'findUnique');
      let queryCount = 0;
      Object.defineProperty(prisma.entity, 'findUnique', {
        configurable: true,
        value: async (query: unknown) => {
          queryCount += 1;
          assert.deepEqual(query, {
            where: { id: 'entity-tn' },
            select: { country: { select: { code: true } } },
          });
          return { country: { code: 'TN' } };
        },
      });

      try {
        const catalog = await TaxationService.getWithholdingRuleCatalog('entity-tn');
        const preview = await TaxationService.calculateWithholdingPreview({
          period: '2026-10',
          category: 'achats',
          amountTtc: 1000,
          supplierFiscalIdPresent: true,
          selectedRate: 1,
        }, 'entity-tn');

        assert.equal(queryCount, 2);
        assert.equal(catalog.base, 'TTC');
        assert.equal(catalog.certificate.workflow, 'PREPARED_ISSUED_CANCELLED_REVOKED');
        assert.equal(catalog.certificate.regulatoryCertification, false);
        assert.ok(catalog.rules.some((rule) => rule.category === 'achats'));
        assert.equal(preview.status, 'CALCULATED');
        assert.equal(preview.amount, 10);
        assert.equal(preview.ruleBasis, 'USER_REPORTED_EXPERT_VALIDATION_IMPLEMENTATION_UNVERIFIED');
      } finally {
        if (original) Object.defineProperty(prisma.entity, 'findUnique', original);
        else Reflect.deleteProperty(prisma.entity, 'findUnique');
      }
    });
  });
});
