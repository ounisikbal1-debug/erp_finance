import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import { SalesRequestError } from './errors';
import { SalesService } from './service';

describe('SalesService.listQuotes', () => {
  it('lists quotes for the requested entity with both conversion states', async () => {
    const original = Object.getOwnPropertyDescriptor(prisma.salesQuote, 'findMany');
    let query: Record<string, unknown> | undefined;
    Object.defineProperty(prisma.salesQuote, 'findMany', {
      configurable: true,
      value: async (value: Record<string, unknown>) => {
        query = value;
        return [];
      },
    });

    try {
      assert.deepEqual(await SalesService.listQuotes('entity-a'), []);
    } finally {
      if (original) Object.defineProperty(prisma.salesQuote, 'findMany', original);
      else Reflect.deleteProperty(prisma.salesQuote, 'findMany');
    }

    assert.deepEqual(query, {
      where: { entityId: 'entity-a', status: { in: ['DRAFT', 'CONVERTED', 'ORDERED'] } },
      select: {
        id: true,
        quoteNumber: true,
        customerId: true,
        currencyCode: true,
        subTotal: true,
        taxAmount: true,
        totalAmount: true,
        status: true,
        createdByUsername: true,
        createdAt: true,
        customer: { select: { name: true } },
        items: {
          select: {
            position: true,
            description: true,
            quantity: true,
            unitPrice: true,
            taxRate: true,
            totalAmount: true,
          },
          orderBy: { position: 'asc' },
        },
        conversion: {
          select: {
            acceptanceNote: true,
            invoice: { select: { id: true, invoiceNumber: true, status: true } },
          },
        },
        orderConversion: {
          select: {
            acceptanceNote: true,
            salesOrder: { select: { id: true, orderNumber: true, status: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });
});

describe('SalesService.convertQuoteToOrder', () => {
  it('creates an entity-scoped order with explicit product mappings and acceptance evidence', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    const calls: Array<{ operation: string; args?: unknown }> = [];
    const quote = {
      id: 'quote-a',
      status: 'DRAFT',
      customerId: 'customer-a',
      items: [
        { position: 0, quantity: 2, unitPrice: 15 },
        { position: 1, quantity: 1, unitPrice: 100 },
      ],
      conversion: null,
      orderConversion: null,
    };
    const order = { id: 'order-a', orderNumber: 'CMD-2026-TEST', status: 'OPEN' };
    const transaction = {
      salesQuote: {
        async findFirst() { calls.push({ operation: 'findQuote' }); return quote; },
        async updateMany(args: unknown) { calls.push({ operation: 'updateQuote', args }); return { count: 1 }; },
      },
      salesQuoteOrderConversion: {
        async create(args: unknown) { calls.push({ operation: 'createConversion', args }); return args; },
      },
    };
    stub(prisma, '$transaction', async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));
    stub(SalesService, 'createSalesOrder', async (...args: unknown[]) => {
      calls.push({ operation: 'createOrder', args });
      return order;
    });

    try {
      const result = await SalesService.convertQuoteToOrder('quote-a', {
        acceptanceConfirmed: true,
        acceptanceNote: 'Bon de commande BC-42',
        itemMappings: [
          { position: 0, materialId: 'material-a' },
          { position: 1, materialId: 'material-b' },
        ],
      }, 'entity-a', { id: 'sales-user', username: 'sales' });
      assert.equal(result, order);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.deepEqual(calls[1], {
      operation: 'createOrder',
      args: [{
        customerId: 'customer-a',
        lines: [
          { materialId: 'material-a', quantity: 2, unitPrice: 15 },
          { materialId: 'material-b', quantity: 1, unitPrice: 100 },
        ],
      }, 'entity-a', { id: 'sales-user', username: 'sales' }, transaction],
    });
    assert.deepEqual(calls[2], {
      operation: 'updateQuote',
      args: { where: { id: 'quote-a', entityId: 'entity-a', status: 'DRAFT' }, data: { status: 'ORDERED' } },
    });
    assert.deepEqual(calls[3], {
      operation: 'createConversion',
      args: {
        data: {
          quoteId: 'quote-a',
          salesOrderId: 'order-a',
          entityId: 'entity-a',
          convertedByUserId: 'sales-user',
          convertedByUsername: 'sales',
          acceptanceNote: 'Bon de commande BC-42',
        },
      },
    });
  });

  it('requires explicit acceptance and an exact one-to-one mapping for all quote lines', async () => {
    let transactions = 0;
    const originalTransaction = Object.getOwnPropertyDescriptor(prisma, '$transaction');
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: async (callback: (tx: unknown) => Promise<unknown>) => {
        transactions += 1;
        return callback({
          salesQuote: {
            async findFirst() {
              return {
                id: 'quote-a',
                status: 'DRAFT',
                items: [{ position: 0, quantity: 1, unitPrice: 2 }],
                conversion: null,
                orderConversion: null,
              };
            },
          },
        });
      },
    });
    try {
      await assert.rejects(SalesService.convertQuoteToOrder('quote-a', {
        acceptanceConfirmed: false,
        acceptanceNote: 'Confirmation client',
        itemMappings: [{ position: 0, materialId: 'material-a' }],
      }, 'entity-a', { id: 'user-a', username: 'sales' }), /Confirmez l’acceptation/);
      await assert.rejects(SalesService.convertQuoteToOrder('quote-a', {
        acceptanceConfirmed: true,
        acceptanceNote: 'Confirmation client',
        itemMappings: [],
      }, 'entity-a', { id: 'user-a', username: 'sales' }), /Associez exactement chaque ligne/);
      await assert.rejects(SalesService.convertQuoteToOrder('quote-a', {
        acceptanceConfirmed: true,
        acceptanceNote: 'Confirmation client',
        itemMappings: [
          { position: 0, materialId: 'material-a' },
          { position: 0, materialId: 'material-b' },
        ],
      }, 'entity-a', { id: 'user-a', username: 'sales' }), /une seule fois/);
      assert.equal(transactions, 1);
    } finally {
      if (originalTransaction) Object.defineProperty(prisma, '$transaction', originalTransaction);
      else Reflect.deleteProperty(prisma, '$transaction');
    }
  });

  it('returns the linked order on an accepted conversion retry without creating another order', async () => {
    const originalTransaction = Object.getOwnPropertyDescriptor(prisma, '$transaction');
    const originalCreateOrder = Object.getOwnPropertyDescriptor(SalesService, 'createSalesOrder');
    const existingOrder = { id: 'order-existing', orderNumber: 'CMD-2026-EXISTING' };
    let orderWrites = 0;
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: async (callback: (tx: unknown) => Promise<unknown>) => callback({
        salesQuote: {
          async findFirst() {
            return {
              status: 'ORDERED',
              conversion: null,
              orderConversion: { salesOrder: existingOrder },
            };
          },
        },
      }),
    });
    Object.defineProperty(SalesService, 'createSalesOrder', {
      configurable: true,
      value: async () => { orderWrites += 1; },
    });
    try {
      assert.deepEqual(await SalesService.convertQuoteToOrder('quote-a', {
        acceptanceConfirmed: true,
        acceptanceNote: 'Confirmation client',
        itemMappings: [{ position: 0, materialId: 'material-a' }],
      }, 'entity-a', { id: 'user-a', username: 'sales' }), existingOrder);
      assert.equal(orderWrites, 0);
    } finally {
      if (originalTransaction) Object.defineProperty(prisma, '$transaction', originalTransaction);
      else Reflect.deleteProperty(prisma, '$transaction');
      if (originalCreateOrder) Object.defineProperty(SalesService, 'createSalesOrder', originalCreateOrder);
      else Reflect.deleteProperty(SalesService, 'createSalesOrder');
    }
  });
});

describe('SalesService.convertQuoteToInvoice', () => {
  it('creates a reviewable invoice and records client acceptance atomically', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    const calls: Array<{ operation: string; args?: unknown }> = [];
    const quote = {
      id: 'quote-a',
      status: 'DRAFT',
      customerId: 'customer-a',
      currencyCode: 'TND',
      items: [{ description: 'Service', quantity: 2, unitPrice: 50, taxRate: 19 }],
      conversion: null,
    };
    const invoice = { id: 'invoice-a', invoiceNumber: 'FAC-2026-TEST', status: 'TO_REVIEW' };
    const transaction = {
      salesQuote: {
        async findFirst() { calls.push({ operation: 'findQuote' }); return quote; },
        async updateMany(args: unknown) { calls.push({ operation: 'updateQuote', args }); return { count: 1 }; },
      },
      salesQuoteConversion: {
        async create(args: unknown) { calls.push({ operation: 'createConversion', args }); return args; },
      },
    };
    const originalCreateInvoice = Object.getOwnPropertyDescriptor(SalesService, 'createInvoice');
    let invoiceInput: unknown;
    stub(prisma, '$transaction', async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));
    stub(SalesService, 'createInvoice', async (...args: unknown[]) => {
      invoiceInput = args;
      return invoice;
    });

    try {
      const result = await SalesService.convertQuoteToInvoice('quote-a', {
        acceptanceConfirmed: true,
        acceptanceNote: 'Bon de commande BC-42',
        dueDate: '2026-12-06',
      }, 'entity-a', { id: 'sales-user', username: 'sales' });
      assert.equal(result, invoice);
    } finally {
      restorers.reverse().forEach((restore) => restore());
      if (originalCreateInvoice) Object.defineProperty(SalesService, 'createInvoice', originalCreateInvoice);
      else Reflect.deleteProperty(SalesService, 'createInvoice');
    }

    assert.deepEqual(invoiceInput, [{
      entityId: 'entity-a',
      customerId: 'customer-a',
      documentCurrencyCode: 'TND',
      dueDate: '2026-12-06',
      items: [{ description: 'Service', quantity: 2, unitPrice: 50, taxRate: 19 }],
    }, { id: 'sales-user', username: 'sales' }, transaction]);
    assert.deepEqual(calls[1], {
      operation: 'updateQuote',
      args: { where: { id: 'quote-a', entityId: 'entity-a', status: 'DRAFT' }, data: { status: 'CONVERTED' } },
    });
    assert.deepEqual(calls[2], {
      operation: 'createConversion',
      args: {
        data: {
          quoteId: 'quote-a',
          invoiceId: 'invoice-a',
          entityId: 'entity-a',
          convertedByUserId: 'sales-user',
          convertedByUsername: 'sales',
          acceptanceNote: 'Bon de commande BC-42',
        },
      },
    });
  });

  it('returns the existing invoice on a retry and requires explicit client acceptance', async () => {
    const originalTransaction = Object.getOwnPropertyDescriptor(prisma, '$transaction');
    const originalCreateInvoice = Object.getOwnPropertyDescriptor(SalesService, 'createInvoice');
    let invoiceWrites = 0;
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: async (callback: (tx: unknown) => Promise<unknown>) => callback({
        salesQuote: {
          async findFirst() {
            return {
              status: 'CONVERTED',
              conversion: { invoice: { id: 'invoice-existing', status: 'TO_REVIEW' } },
            };
          },
        },
      }),
    });
    Object.defineProperty(SalesService, 'createInvoice', {
      configurable: true,
      value: async () => { invoiceWrites += 1; },
    });
    try {
      await assert.rejects(
        SalesService.convertQuoteToInvoice('quote-a', {
          acceptanceConfirmed: false,
          acceptanceNote: 'Commande confirmée',
        }, 'entity-a', { id: 'user-a', username: 'sales' }),
        /Confirmez l’acceptation/,
      );
      assert.deepEqual(await SalesService.convertQuoteToInvoice('quote-a', {
        acceptanceConfirmed: true,
        acceptanceNote: 'Commande confirmée',
      }, 'entity-a', { id: 'user-a', username: 'sales' }), {
        id: 'invoice-existing',
        status: 'TO_REVIEW',
      });
      assert.equal(invoiceWrites, 0);
    } finally {
      if (originalTransaction) Object.defineProperty(prisma, '$transaction', originalTransaction);
      else Reflect.deleteProperty(prisma, '$transaction');
      if (originalCreateInvoice) Object.defineProperty(SalesService, 'createInvoice', originalCreateInvoice);
      else Reflect.deleteProperty(SalesService, 'createInvoice');
    }
  });
});

describe('SalesService.createQuote', () => {
  it('stores a scoped draft without writing an invoice or journal', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let quoteData: Record<string, unknown> | undefined;
    let invoiceWrites = 0;
    let journalWrites = 0;
    const transaction = {
      salesQuote: {
        async create({ data }: { data: Record<string, unknown> }) {
          quoteData = data;
          return { id: 'quote-a', ...data };
        },
      },
      invoice: {
        async create() { invoiceWrites += 1; throw new Error('Quotes must not create invoices'); },
      },
      journalEntry: {
        async create() { journalWrites += 1; throw new Error('Quotes must not create journal entries'); },
      },
    };
    stub(prisma.entity, 'findUnique', async () => ({
      countryId: 'country-a',
      country: { currencyCode: 'TND' },
    }));
    stub(prisma.customer, 'findFirst', async ({ where }: { where: Record<string, unknown> }) => (
      where.entityId === 'entity-a' && where.id === 'customer-a' ? { id: 'customer-a' } : null
    ));
    stub(prisma.taxRate, 'findMany', async () => [{ rate: 19 }]);
    stub(prisma, '$transaction', async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));

    try {
      await SalesService.createQuote({
        customerId: ' customer-a ',
        entityId: ' entity-a ',
        items: [{ description: 'Service', quantity: 1, unitPrice: 100, taxRate: 19 }],
      }, { id: 'user-a', username: 'sales-a' });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.ok(quoteData);
    assert.match(String(quoteData.quoteNumber), /^DEV-\d{4}-[A-F0-9]{12}$/);
    assert.equal(quoteData.entityId, 'entity-a');
    assert.equal(quoteData.customerId, 'customer-a');
    assert.equal(quoteData.currencyCode, 'TND');
    assert.equal(quoteData.subTotal, 100);
    assert.equal(quoteData.taxAmount, 19);
    assert.equal(quoteData.totalAmount, 119);
    assert.equal(quoteData.status, 'DRAFT');
    assert.deepEqual(quoteData.items, {
      create: [{
        description: 'Service',
        quantity: 1,
        unitPrice: 100,
        taxRate: 19,
        totalAmount: 119,
        position: 0,
      }],
    });
    assert.equal(invoiceWrites, 0);
    assert.equal(journalWrites, 0);
  });

  it('rejects a customer that belongs to another entity', async () => {
    const originalEntity = Object.getOwnPropertyDescriptor(prisma.entity, 'findUnique');
    const originalCustomer = Object.getOwnPropertyDescriptor(prisma.customer, 'findFirst');
    const originalRates = Object.getOwnPropertyDescriptor(prisma.taxRate, 'findMany');
    Object.defineProperty(prisma.entity, 'findUnique', {
      configurable: true,
      value: async () => ({ countryId: 'country-a', country: { currencyCode: 'TND' } }),
    });
    Object.defineProperty(prisma.customer, 'findFirst', { configurable: true, value: async () => null });
    Object.defineProperty(prisma.taxRate, 'findMany', { configurable: true, value: async () => [{ rate: 19 }] });
    try {
      await assert.rejects(
        SalesService.createQuote({
          customerId: 'customer-b',
          entityId: 'entity-a',
          items: [{ description: 'Service', quantity: 1, unitPrice: 100, taxRate: 19 }],
        }, { id: 'user-a', username: 'sales-a' }),
        (error: unknown) => error instanceof SalesRequestError && error.statusCode === 404,
      );
    } finally {
      if (originalEntity) Object.defineProperty(prisma.entity, 'findUnique', originalEntity);
      else Reflect.deleteProperty(prisma.entity, 'findUnique');
      if (originalCustomer) Object.defineProperty(prisma.customer, 'findFirst', originalCustomer);
      else Reflect.deleteProperty(prisma.customer, 'findFirst');
      if (originalRates) Object.defineProperty(prisma.taxRate, 'findMany', originalRates);
      else Reflect.deleteProperty(prisma.taxRate, 'findMany');
    }
  });
});

describe('SalesService.updateQuote', () => {
  it('updates only a draft in its entity and replaces its validated item set atomically', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    const calls: Array<{ operation: string; args?: unknown }> = [];
    const transaction = {
      entity: { async findUnique() { return { countryId: 'country-a', country: { currencyCode: 'TND' } }; } },
      customer: { async findFirst() { return { id: 'customer-a' }; } },
      taxRate: { async findMany() { return [{ rate: 19 }]; } },
      salesQuote: {
        async findFirst({ where }: { where: Record<string, unknown> }) {
          calls.push({ operation: 'findQuote', args: where });
          return where.status === 'DRAFT'
            ? { id: 'quote-a' }
            : { id: 'quote-a', status: 'DRAFT', customer: { name: 'Client' }, items: [] };
        },
        async updateMany(args: unknown) { calls.push({ operation: 'updateQuote', args }); return { count: 1 }; },
      },
      salesQuoteItem: {
        async deleteMany(args: unknown) { calls.push({ operation: 'deleteItems', args }); return { count: 1 }; },
        async createMany(args: unknown) { calls.push({ operation: 'createItems', args }); return { count: 1 }; },
      },
    };
    stub(prisma, '$transaction', async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));
    try {
      const updated = await SalesService.updateQuote('quote-a', {
        customerId: 'customer-a',
        items: [{ description: 'Updated service', quantity: 2, unitPrice: 50, taxRate: 19 }],
      }, 'entity-a');
      assert.equal((updated as { id: string }).id, 'quote-a');
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.deepEqual(calls.find((call) => call.operation === 'updateQuote')?.args, {
      where: { id: 'quote-a', entityId: 'entity-a', status: 'DRAFT' },
      data: {
        customerId: 'customer-a',
        currencyCode: 'TND',
        subTotal: 100,
        taxAmount: 19,
        totalAmount: 119,
      },
    });
    assert.deepEqual(calls.find((call) => call.operation === 'deleteItems')?.args, { where: { quoteId: 'quote-a' } });
    assert.deepEqual(calls.find((call) => call.operation === 'createItems')?.args, {
      data: [{
        description: 'Updated service',
        quantity: 2,
        unitPrice: 50,
        taxRate: 19,
        totalAmount: 119,
        position: 0,
        quoteId: 'quote-a',
      }],
    });
  });

  it('rejects quotes outside the entity and non-draft statuses', async () => {
    const originalTransaction = Object.getOwnPropertyDescriptor(prisma, '$transaction');
    const originalEntity = Object.getOwnPropertyDescriptor(prisma.entity, 'findUnique');
    const originalCustomer = Object.getOwnPropertyDescriptor(prisma.customer, 'findFirst');
    const originalRates = Object.getOwnPropertyDescriptor(prisma.taxRate, 'findMany');
    const originalFind = Object.getOwnPropertyDescriptor(prisma.salesQuote, 'findFirst');
    const existing = { id: 'quote-a', status: 'APPROVED' };
    Object.defineProperty(prisma.entity, 'findUnique', {
      configurable: true,
      value: async () => ({ countryId: 'country-a', country: { currencyCode: 'TND' } }),
    });
    Object.defineProperty(prisma.customer, 'findFirst', { configurable: true, value: async () => ({ id: 'customer-a' }) });
    Object.defineProperty(prisma.taxRate, 'findMany', { configurable: true, value: async () => [{ rate: 19 }] });
    Object.defineProperty(prisma.salesQuote, 'findFirst', {
      configurable: true,
      value: async ({ where }: { where: Record<string, unknown> }) => where.status === 'DRAFT' ? null : existing,
    });
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
    });
    try {
      await assert.rejects(SalesService.updateQuote('quote-a', {
        customerId: 'customer-a',
        items: [{ description: 'Service', quantity: 1, unitPrice: 1, taxRate: 19 }],
      }, 'entity-a'), /brouillon/);
    } finally {
      for (const [target, property, descriptor] of [
        [prisma, '$transaction', originalTransaction],
        [prisma.entity, 'findUnique', originalEntity],
        [prisma.customer, 'findFirst', originalCustomer],
        [prisma.taxRate, 'findMany', originalRates],
        [prisma.salesQuote, 'findFirst', originalFind],
      ] as const) {
        if (descriptor) Object.defineProperty(target, property, descriptor);
        else Reflect.deleteProperty(target, property);
      }
    }
  });
});
