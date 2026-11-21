import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import { SalesRequestError } from './errors';
import { SalesService } from './service';

describe('SalesService.createCustomer', () => {
  it('reports a duplicate customer code within an entity as a conflict', async () => {
    const original = Object.getOwnPropertyDescriptor(prisma.customer, 'create');
    Object.defineProperty(prisma.customer, 'create', {
      configurable: true,
      value: async () => { throw { code: 'P2002' }; },
    });

    try {
      await assert.rejects(
        SalesService.createCustomer({ code: 'C001', name: 'Client' }, 'entity-1'),
        (error: unknown) => error instanceof SalesRequestError
          && error.statusCode === 409
          && /code client est déjà utilisé/.test(error.message),
      );
    } finally {
      if (original) Object.defineProperty(prisma.customer, 'create', original);
      else Reflect.deleteProperty(prisma.customer, 'create');
    }
  });
});

describe('SalesService.listCustomers', () => {
  it('returns only invoice-form fields for the scoped entity', async () => {
    const original = Object.getOwnPropertyDescriptor(prisma.customer, 'findMany');
    let query: Record<string, unknown> | undefined;
    Object.defineProperty(prisma.customer, 'findMany', {
      configurable: true,
      value: async (value: Record<string, unknown>) => {
        query = value;
        return [{ id: 'customer-1', code: 'C001', name: 'Client' }];
      },
    });

    try {
      const customers = await SalesService.listCustomers('entity-1');
      assert.deepEqual(customers, [{ id: 'customer-1', code: 'C001', name: 'Client' }]);
    } finally {
      if (original) Object.defineProperty(prisma.customer, 'findMany', original);
      else Reflect.deleteProperty(prisma.customer, 'findMany');
    }

    assert.deepEqual(query, {
      where: { entityId: 'entity-1' },
      select: { id: true, code: true, name: true, fiscalId: true, email: true, phone: true, address: true },
      orderBy: { createdAt: 'desc' },
    });
  });
});

describe('SalesService.listInvoices', () => {
  it('returns the first 50 invoices and a scoped total with deterministic ordering', async () => {
    const originalFindMany = Object.getOwnPropertyDescriptor(prisma.invoice, 'findMany');
    const originalCount = Object.getOwnPropertyDescriptor(prisma.invoice, 'count');
    let query: Record<string, unknown> | undefined;
    let countQuery: Record<string, unknown> | undefined;
    Object.defineProperty(prisma.invoice, 'findMany', {
      configurable: true,
      value: async (value: Record<string, unknown>) => {
        query = value;
        return [];
      },
    });
    Object.defineProperty(prisma.invoice, 'count', {
      configurable: true,
      value: async (value: Record<string, unknown>) => {
        countQuery = value;
        return 125;
      },
    });

    try {
      assert.deepEqual(await SalesService.listInvoices('entity-1'), {
        items: [],
        pagination: { page: 1, pageSize: 50, total: 125, totalPages: 3 },
      });
    } finally {
      if (originalFindMany) Object.defineProperty(prisma.invoice, 'findMany', originalFindMany);
      else Reflect.deleteProperty(prisma.invoice, 'findMany');
      if (originalCount) Object.defineProperty(prisma.invoice, 'count', originalCount);
      else Reflect.deleteProperty(prisma.invoice, 'count');
    }

    assert.deepEqual(query, {
      where: { entityId: 'entity-1' },
      skip: 0,
      take: 50,
      select: {
        id: true,
        invoiceNumber: true,
        createdAt: true,
        currencyCode: true,
        subTotal: true,
        taxAmount: true,
        totalAmount: true,
        documentCurrencyCode: true,
        documentSubTotal: true,
        documentTaxAmount: true,
        documentStampDuty: true,
        documentTotalAmount: true,
        functionalCurrencyCode: true,
        exchangeRate: true,
        exchangeRateDate: true,
        exchangeRateSource: true,
        exchangeRateImportedAt: true,
        dueDate: true,
        status: true,
        createdByUsername: true,
        approvedByUsername: true,
        approvedAt: true,
        issuedByUsername: true,
        issuedAt: true,
        postingJournalEntryId: true,
        salesOrderLink: {
          select: { salesOrder: { select: { orderNumber: true } } },
        },
        workflowEvents: {
          select: { action: true, actorUsername: true, note: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
        customer: { select: { name: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    assert.deepEqual(countQuery, { where: { entityId: 'entity-1' } });
  });

  it('uses the requested page and page size and clamps pages beyond the scoped total', async () => {
    const originalFindMany = Object.getOwnPropertyDescriptor(prisma.invoice, 'findMany');
    const originalCount = Object.getOwnPropertyDescriptor(prisma.invoice, 'count');
    const queries: Record<string, unknown>[] = [];
    Object.defineProperty(prisma.invoice, 'findMany', {
      configurable: true,
      value: async (value: Record<string, unknown>) => {
        queries.push(value);
        return [];
      },
    });
    Object.defineProperty(prisma.invoice, 'count', {
      configurable: true,
      value: async () => 45,
    });

    try {
      const secondPage = await SalesService.listInvoices('entity-1', { page: 2, pageSize: 20 });
      assert.deepEqual(secondPage.pagination, { page: 2, pageSize: 20, total: 45, totalPages: 3 });
      const lastPage = await SalesService.listInvoices('entity-1', { page: 10, pageSize: 20 });
      assert.deepEqual(lastPage.pagination, { page: 3, pageSize: 20, total: 45, totalPages: 3 });
    } finally {
      if (originalFindMany) Object.defineProperty(prisma.invoice, 'findMany', originalFindMany);
      else Reflect.deleteProperty(prisma.invoice, 'findMany');
      if (originalCount) Object.defineProperty(prisma.invoice, 'count', originalCount);
      else Reflect.deleteProperty(prisma.invoice, 'count');
    }

    assert.equal(queries[0].skip, 20);
    assert.equal(queries[0].take, 20);
    assert.equal(queries[1].skip, 40);
    assert.equal(queries[1].take, 20);
    assert.deepEqual(queries[0].where, { entityId: 'entity-1' });
    assert.deepEqual(queries[1].where, { entityId: 'entity-1' });
  });
});

describe('SalesService.listConfiguredTaxRates', () => {
  it('returns only rates configured for the requested entity country', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let entityQuery: Record<string, unknown> | undefined;
    let taxRateQuery: Record<string, unknown> | undefined;
    let accountQuery: Record<string, unknown> | undefined;
    stub(prisma.entity, 'findUnique', async (query: Record<string, unknown>) => {
      entityQuery = query;
      return {
        countryId: 'country-1',
        country: {
          code: 'TN',
          currencyCode: 'TND',
          currencySymbol: 'DT',
          stampDuty: 1,
          salesReceivableAccountCode: '411',
          salesRevenueAccountCode: '707',
          salesVatAccountCode: '4367',
          salesStampDutyAccountCode: '432',
        },
      };
    });
    stub(prisma.taxRate, 'findMany', async (query: Record<string, unknown>) => {
      taxRateQuery = query;
      return [{ code: 'vat-19', name: 'TVA', rate: 19 }];
    });
    stub(prisma.chartOfAccount, 'findMany', async (query: Record<string, unknown>) => {
      accountQuery = query;
      return [
        { code: '411', type: 'Asset' },
        { code: '707', type: 'Revenue' },
        { code: '4367', type: 'Liability' },
        { code: '432', type: 'Liability' },
      ];
    });

    try {
      const rates = await SalesService.listConfiguredTaxRates('entity-1');
      assert.deepEqual(rates, {
        countryCode: 'TN',
        currencyCode: 'TND',
        currencySymbol: 'DT',
        rates: [{ code: 'vat-19', name: 'TVA', rate: 19 }],
        missingRequirements: [],
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.deepEqual(entityQuery, {
      where: { id: 'entity-1' },
      select: {
        countryId: true,
        country: {
          select: {
            code: true,
            currencyCode: true,
            currencySymbol: true,
            stampDuty: true,
            salesReceivableAccountCode: true,
            salesRevenueAccountCode: true,
            salesVatAccountCode: true,
            salesStampDutyAccountCode: true,
          },
        },
      },
    });
    assert.deepEqual(taxRateQuery, {
      where: { countryId: 'country-1' },
      select: { code: true, name: true, rate: true },
      orderBy: { rate: 'asc' },
    });
    assert.deepEqual(accountQuery, {
      where: { countryId: 'country-1', code: { in: ['411', '707', '4367', '432'] } },
      select: { code: true, type: true },
    });
  });
});

describe('SalesService.createInvoice', () => {
  it('rejects malformed client identifiers before accessing persistence', async () => {
    await assert.rejects(
      SalesService.createInvoice({
        customerId: 42,
        entityId: 'entity-1',
        items: [],
      } as unknown as Parameters<typeof SalesService.createInvoice>[0], { id: 'TEST', username: 'TEST' }),
      (error: unknown) => error instanceof SalesRequestError
        && error.statusCode === 400
        && /client et la société sont obligatoires/.test(error.message),
    );
  });

  it('stores a sales invoice for review without issuing or creating its journal', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let invoiceData: Record<string, unknown> | undefined;
    let journalData: Record<string, unknown> | undefined;
    const transaction = {
      invoice: {
        async create({ data }: { data: Record<string, unknown> }) {
          invoiceData = data;
          return { invoiceNumber: data.invoiceNumber };
        },
      },
      journalEntry: {
        async create({ data }: { data: Record<string, unknown> }) {
          journalData = data;
          return {};
        },
      },
    };

    stub(prisma.entity, 'findUnique', async () => ({
      id: 'entity-1',
      countryId: 'country-1',
      country: {
        code: 'XY',
        currencyCode: 'XCU',
        stampDuty: 1.23456,
        salesReceivableAccountCode: 'CUST.REC',
        salesRevenueAccountCode: 'SALES.REV',
        salesVatAccountCode: 'TAX.OUT',
        salesStampDutyAccountCode: 'DUTY.PAY',
      },
    }));
    stub(prisma.customer, 'findFirst', async () => ({ name: 'Client' }));
    stub(prisma.material, 'findMany', async () => [{ id: 'material-1' }]);
    stub(prisma.taxRate, 'findMany', async () => [{ rate: 20 }]);
    stub(prisma.chartOfAccount, 'findMany', async () => (
      [
        { code: 'CUST.REC', type: 'Asset' },
        { code: 'SALES.REV', type: 'Revenue' },
        { code: 'TAX.OUT', type: 'Liability' },
        { code: 'DUTY.PAY', type: 'Liability' },
      ]
    ));
    stub(prisma, '$transaction', async (callback: (value: typeof transaction) => Promise<unknown>) => (
      callback(transaction)
    ));

    try {
      await SalesService.createInvoice({
        customerId: 'customer-1',
        entityId: 'entity-1',
        items: [{ description: 'Article', quantity: 1, unitPrice: 100, taxRate: 20, materialId: 'material-1' }],
      }, { id: 'TEST_creator', username: 'TEST_creator' });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.ok(invoiceData);
    assert.equal(journalData, undefined);
    assert.ok(invoiceData.createdAt instanceof Date);
    assert.equal(invoiceData.status, 'TO_REVIEW');
    assert.equal(invoiceData.createdByUserId, 'TEST_creator');
    assert.equal(invoiceData.currencyCode, 'XCU');
    assert.equal(invoiceData.documentCurrencyCode, 'XCU');
    assert.equal(invoiceData.functionalCurrencyCode, 'XCU');
    assert.equal(invoiceData.exchangeRate, 1);
    assert.equal(invoiceData.vatAccountCode, 'TAX.OUT');
    assert.equal(invoiceData.stampDuty, 1.235);
    assert.equal(invoiceData.dueDate, null);
    assert.deepEqual(invoiceData.items, {
      create: [{
        description: 'Article',
        quantity: 1,
        unitPrice: 100,
        taxRate: 20,
        totalAmount: 120,
        materialId: 'material-1',
      }],
    });
  });

  it('converts foreign-currency invoices to functional currency before approval without posting a journal', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let invoiceData: Record<string, unknown> | undefined;
    let journalData: Record<string, unknown> | undefined;
    const transaction = {
      invoice: {
        async create({ data }: { data: Record<string, unknown> }) {
          invoiceData = data;
          return { invoiceNumber: data.invoiceNumber };
        },
      },
      journalEntry: {
        async create({ data }: { data: Record<string, unknown> }) {
          journalData = data;
          return {};
        },
      },
    };
    stub(prisma.entity, 'findUnique', async () => ({
      id: 'entity-tn',
      countryId: 'country-tn',
      country: {
        code: 'TN',
        currencyCode: 'TND',
        stampDuty: 1.23456,
        salesReceivableAccountCode: '411',
        salesRevenueAccountCode: '707',
        salesVatAccountCode: '4367',
        salesStampDutyAccountCode: '432',
      },
    }));
    stub(prisma.customer, 'findFirst', async () => ({ name: 'Client' }));
    stub(prisma.taxRate, 'findMany', async () => [{ rate: 20 }]);
    stub(prisma.chartOfAccount, 'findMany', async () => [
      { code: '411', type: 'Asset' },
      { code: '707', type: 'Revenue' },
      { code: '4367', type: 'Liability' },
      { code: '432', type: 'Liability' },
    ]);
    stub(prisma, '$transaction', async (callback: (value: typeof transaction) => Promise<unknown>) => (
      callback(transaction)
    ));

    try {
      await SalesService.createInvoice({
        customerId: 'customer-tn',
        entityId: 'entity-tn',
        issueDate: '2026-10-29',
        dueDate: '2026-11-28',
        documentCurrencyCode: 'EUR',
        exchangeRate: 3.4,
        exchangeRateDate: '2026-10-29',
        exchangeRateSource: 'TEST: synthetic EUR/TND sample',
        exchangeRateImportedAt: '2026-10-30T06:00:00.000Z',
        items: [{ description: 'Service', quantity: 1, unitPrice: 100, taxRate: 20 }],
      }, { id: 'TEST_fx_creator', username: 'TEST_fx_creator' });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.ok(invoiceData);
    assert.equal(journalData, undefined);
    assert.equal(invoiceData.currencyCode, 'TND');
    assert.equal(invoiceData.functionalCurrencyCode, 'TND');
    assert.equal(invoiceData.documentCurrencyCode, 'EUR');
    assert.equal(invoiceData.documentSubTotal, 100);
    assert.equal(invoiceData.documentTaxAmount, 20);
    assert.equal(invoiceData.documentStampDuty, 1.235);
    assert.equal(invoiceData.documentTotalAmount, 121.235);
    assert.equal(invoiceData.subTotal, 340);
    assert.equal(invoiceData.taxAmount, 68);
    assert.equal(invoiceData.stampDuty, 4.199);
    assert.equal(invoiceData.totalAmount, 412.199);
    assert.equal(invoiceData.exchangeRate, 3.4);
    assert.equal((invoiceData.dueDate as Date).toISOString(), '2026-11-28T00:00:00.000Z');
    assert.equal(invoiceData.exchangeRateSource, 'TEST: synthetic EUR/TND sample');
    assert.equal((invoiceData.exchangeRateImportedAt as Date).toISOString(), '2026-10-30T06:00:00.000Z');
    assert.equal(invoiceData.status, 'TO_REVIEW');
  });
});
