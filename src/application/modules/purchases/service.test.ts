import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import { PurchaseRequestError } from './errors';
import { PurchasesService } from './service';

describe('PurchasesService', () => {
  it('loads vendors, current country tax rates, and invoices only for the authenticated entity', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    const queries: Record<string, Record<string, unknown> | undefined> = {};
    stub(prisma.entity, 'findUnique', async (query: Record<string, unknown>) => {
      queries.entity = query;
      return {
        name: 'SAFE FR',
        countryId: 'country-fr',
        country: {
          code: 'FR',
          currencyCode: 'EUR',
          taxRates: [{ id: 'rate-fr', code: 'VAT', name: 'Configured VAT', rate: 20, purchaseVatRecoverable: false }],
        },
      };
    });
    stub(prisma.vendor, 'findMany', async (query: Record<string, unknown>) => {
      queries.vendors = query;
      return [];
    });
    stub(prisma.material, 'findMany', async (query: Record<string, unknown>) => {
      queries.materials = query;
      return [];
    });
    stub(prisma.warehouse, 'findMany', async (query: Record<string, unknown>) => {
      queries.warehouses = query;
      return [];
    });
    stub(prisma.purchaseInvoice, 'findMany', async (query: Record<string, unknown>) => {
      queries.invoices = query;
      return [];
    });

    try {
      const data = await PurchasesService.getModuleData('entity-fr');
      assert.equal(data.entity.currencyCode, 'EUR');
      assert.deepEqual(data.taxRates, [{
        id: 'rate-fr', code: 'VAT', name: 'Configured VAT', rate: 20, purchaseVatRecoverable: false,
      }]);
      assert.deepEqual(queries.entity, {
        where: { id: 'entity-fr' },
        select: {
          name: true,
          countryId: true,
          country: {
            select: {
              code: true,
              currencyCode: true,
              taxRates: {
                select: { id: true, code: true, name: true, rate: true, purchaseVatRecoverable: true },
                orderBy: { rate: 'asc' },
              },
            },
          },
        },
      });
      assert.deepEqual(queries.vendors, {
        where: { entityId: 'entity-fr' },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      });
      assert.deepEqual(queries.materials, {
        where: { entityId: 'entity-fr' },
        select: { id: true, sku: true, name: true, unitCode: true },
        orderBy: { sku: 'asc' },
      });
      assert.deepEqual(queries.warehouses, {
        where: { entityId: 'entity-fr' },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      });
      assert.deepEqual(queries.invoices, {
        where: { entityId: 'entity-fr' },
        select: {
          id: true,
          invoiceNumber: true,
          issueDate: true,
          dueDate: true,
          currencyCode: true,
          subTotal: true,
          taxRateCode: true,
          taxRate: true,
          taxAmount: true,
          totalAmount: true,
          documentCurrencyCode: true,
          documentSubTotal: true,
          documentTaxAmount: true,
          documentTotalAmount: true,
          functionalCurrencyCode: true,
          exchangeRate: true,
          exchangeRateDate: true,
          exchangeRateSource: true,
          exchangeRateImportedAt: true,
          status: true,
          createdByUsername: true,
          approvedByUsername: true,
          approvedAt: true,
          postedByUsername: true,
          postedAt: true,
          workflowEvents: {
            select: { action: true, actorUsername: true, note: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
          postingJournalEntryId: true,
          vendor: { select: { id: true, code: true, name: true } },
          lines: {
            select: { id: true, description: true, materialId: true, purchaseOrderLineId: true, quantity: true, unitPrice: true },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('creates an unposted review record using the entity country rate and currency', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    const lookups: Array<Record<string, unknown>> = [];
    let createData: Record<string, unknown> | undefined;
    stub(prisma.entity, 'findUnique', async () => ({
      countryId: 'country-fr',
      country: { currencyCode: 'EUR' },
    }));
    stub(prisma.vendor, 'findFirst', async (query: Record<string, unknown>) => {
      lookups.push(query);
      return { id: 'vendor-fr' };
    });
    stub(prisma.taxRate, 'findFirst', async (query: Record<string, unknown>) => {
      lookups.push(query);
      return { id: 'rate-fr', countryId: 'country-fr', code: 'VAT', rate: 20 };
    });
    stub(prisma.purchaseInvoice, 'create', async (query: Record<string, unknown>) => {
      createData = query.data as Record<string, unknown>;
      return { id: 'purchase-invoice-1', ...createData, vendor: { id: 'vendor-fr', code: 'V1', name: 'Vendor' } };
    });

    try {
      const result = await PurchasesService.createDraftInvoice({
        invoiceNumber: 'SUP-2026-001',
        vendorId: 'vendor-fr',
        issueDate: '2026-10-01',
        dueDate: '2026-11-01',
        subTotal: 100,
        taxRateId: 'rate-fr',
        lines: [{ description: 'Matière A', materialId: null, quantity: 2, unitPrice: 50 }],
      }, 'entity-fr', { id: 'creator-1', username: 'test-creator' });
      assert.deepEqual(lookups, [
        { where: { id: 'vendor-fr', entityId: 'entity-fr' }, select: { id: true } },
        { where: { id: 'rate-fr' }, select: { id: true, countryId: true, code: true, rate: true } },
      ]);
      assert.equal(createData?.entityId, 'entity-fr');
      assert.equal(createData?.currencyCode, 'EUR');
      assert.equal(createData?.documentCurrencyCode, 'EUR');
      assert.equal(createData?.functionalCurrencyCode, 'EUR');
      assert.equal(createData?.exchangeRate, 1);
      assert.equal(createData?.taxRate, 20);
      assert.equal(createData?.taxAmount, 20);
      assert.equal(createData?.totalAmount, 120);
      assert.equal(createData?.documentTotalAmount, 120);
      assert.equal(createData?.status, 'TO_REVIEW');
      assert.equal(createData?.createdByUserId, 'creator-1');
      assert.equal(createData?.createdByUsername, 'test-creator');
      assert.deepEqual(createData?.lines, {
        create: [{ description: 'Matière A', materialId: null, purchaseOrderLineId: null, quantity: 2, unitPrice: 50 }],
      });
      assert.equal(result.status, 'TO_REVIEW');
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('creates an order-linked invoice draft before stock is received', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let createData: Record<string, unknown> | undefined;
    let receiptLookupAttempted = false;
    stub(prisma.entity, 'findUnique', async () => ({
      countryId: 'country-fr',
      country: { currencyCode: 'EUR' },
    }));
    stub(prisma.vendor, 'findFirst', async () => ({ id: 'vendor-fr' }));
    stub(prisma.taxRate, 'findFirst', async () => ({
      id: 'rate-fr',
      countryId: 'country-fr',
      code: 'VAT',
      rate: 20,
    }));
    stub(prisma.material, 'findMany', async () => [{ id: 'material-1', unitCode: 'EA' }]);
    stub(prisma.purchaseOrderLine, 'findMany', async () => [{
      id: 'order-line-1',
      materialId: 'material-1',
      quantity: 2,
      unitPrice: 10,
      order: { status: 'APPROVED', vendorId: 'vendor-fr', currencyCode: 'EUR' },
    }]);
    stub(prisma.purchaseInvoiceLine, 'findMany', async () => []);
    stub(prisma.stockReceipt, 'findMany', async () => {
      receiptLookupAttempted = true;
      return [];
    });
    stub(prisma.purchaseInvoice, 'create', async (query: Record<string, unknown>) => {
      createData = query.data as Record<string, unknown>;
      return { id: 'purchase-invoice-3', ...createData, vendor: { id: 'vendor-fr', code: 'V3', name: 'Vendor' } };
    });

    try {
      const result = await PurchasesService.createDraftInvoice({
        invoiceNumber: 'SUP-2026-004',
        vendorId: 'vendor-fr',
        issueDate: '2026-10-29',
        dueDate: '2026-11-30',
        subTotal: 10,
        taxRateId: 'rate-fr',
        lines: [{
          description: 'Matière A',
          materialId: 'material-1',
          purchaseOrderLineId: 'order-line-1',
          quantity: 1,
          unitPrice: 10,
        }],
      }, 'entity-fr', { id: 'creator-3', username: 'test-creator' });

      assert.equal(result.status, 'TO_REVIEW');
      assert.equal(createData?.status, 'TO_REVIEW');
      assert.equal(receiptLookupAttempted, false);
      assert.deepEqual(createData?.lines, {
        create: [{
          description: 'Matière A',
          materialId: 'material-1',
          purchaseOrderLineId: 'order-line-1',
          quantity: 1,
          unitPrice: 10,
        }],
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('converts an imported foreign-currency draft to functional currency and preserves its source snapshot', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let createData: Record<string, unknown> | undefined;
    stub(prisma.entity, 'findUnique', async () => ({
      countryId: 'country-tn',
      country: { currencyCode: 'TND' },
    }));
    stub(prisma.vendor, 'findFirst', async () => ({ id: 'vendor-tn' }));
    stub(prisma.taxRate, 'findFirst', async () => ({
      id: 'rate-tn',
      countryId: 'country-tn',
      code: 'VAT',
      rate: 19,
    }));
    stub(prisma.purchaseInvoice, 'create', async (query: Record<string, unknown>) => {
      createData = query.data as Record<string, unknown>;
      return { id: 'purchase-invoice-2', ...createData, vendor: { id: 'vendor-tn', code: 'V2', name: 'Vendor' } };
    });

    try {
      await PurchasesService.createDraftInvoice({
        invoiceNumber: 'SUP-2026-003',
        vendorId: 'vendor-tn',
        issueDate: '2026-10-29',
        dueDate: '2026-11-01',
        subTotal: 100,
        taxRateId: 'rate-tn',
        documentCurrencyCode: 'EUR',
        exchangeRate: 3.4,
        exchangeRateDate: '2026-10-29',
        exchangeRateSource: 'TEST: BCT interbank sample',
        exchangeRateImportedAt: '2026-10-30T06:00:00.000Z',
      }, 'entity-tn', { id: 'creator-2', username: 'test-creator-2' });
      assert.equal(createData?.currencyCode, 'TND');
      assert.equal(createData?.subTotal, 340);
      assert.equal(createData?.taxAmount, 64.6);
      assert.equal(createData?.totalAmount, 404.6);
      assert.equal(createData?.documentCurrencyCode, 'EUR');
      assert.equal(createData?.documentSubTotal, 100);
      assert.equal(createData?.documentTaxAmount, 19);
      assert.equal(createData?.documentTotalAmount, 119);
      assert.equal(createData?.exchangeRate, 3.4);
      assert.equal(createData?.exchangeRateSource, 'TEST: BCT interbank sample');
      assert.equal((createData?.exchangeRateImportedAt as Date).toISOString(), '2026-10-30T06:00:00.000Z');
      assert.equal(createData?.status, 'TO_REVIEW');
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('rejects a tax rate that belongs to a different country profile', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    stub(prisma.entity, 'findUnique', async () => ({
      countryId: 'country-fr',
      country: { currencyCode: 'EUR' },
    }));
    stub(prisma.vendor, 'findFirst', async () => ({ id: 'vendor-fr' }));
    stub(prisma.taxRate, 'findFirst', async () => ({
      id: 'rate-tn',
      countryId: 'country-tn',
      code: 'VAT_TN',
      rate: 19,
    }));

    try {
      await assert.rejects(
        PurchasesService.createDraftInvoice({
          invoiceNumber: 'SUP-2026-002',
          vendorId: 'vendor-fr',
          issueDate: '2026-10-01',
          dueDate: '2026-11-01',
          subTotal: 100,
          taxRateId: 'rate-tn',
        }, 'entity-fr', { id: 'creator-3', username: 'test-creator-3' }),
        (error: unknown) => error instanceof PurchaseRequestError && error.statusCode === 422,
      );
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });
});
