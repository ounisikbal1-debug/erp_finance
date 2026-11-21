import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import BusinessIntelligenceService from './service';

describe('Power BI dataset service', () => {
  it('filters sales invoices by their effective document date rather than workflow processing time', async () => {
    const originalEntity = Object.getOwnPropertyDescriptor(prisma.entity, 'findUnique');
    const originalInvoices = Object.getOwnPropertyDescriptor(prisma.invoice, 'findMany');
    let invoiceQuery: Record<string, unknown> | undefined;
    Object.defineProperty(prisma.entity, 'findUnique', {
      configurable: true,
      value: async () => ({
        id: 'TEST_entity_a',
        code: 'TEST-A',
        countryId: 'TEST_country',
        country: { code: 'TN', currencyCode: 'TND' },
      }),
    });
    Object.defineProperty(prisma.invoice, 'findMany', {
      configurable: true,
      value: async (query: Record<string, unknown>) => {
        invoiceQuery = query;
        return [{
          invoiceNumber: 'TEST-FAC-2026',
          createdAt: new Date('2026-10-15T00:00:00.000Z'),
          issuedAt: new Date('2026-11-07T17:00:00.000Z'),
          dueDate: new Date('2026-11-30T00:00:00.000Z'),
          status: 'PAID',
          currencyCode: 'TND',
          documentCurrencyCode: 'TND',
          functionalCurrencyCode: 'TND',
          exchangeRate: 1,
          exchangeRateDate: new Date('2026-10-15T00:00:00.000Z'),
          exchangeRateSource: 'TEST',
          exchangeRateImportedAt: null,
          subTotal: 100,
          taxAmount: 19,
          stampDuty: 1,
          totalAmount: 120,
          documentSubTotal: 100,
          documentTaxAmount: 19,
          documentStampDuty: 1,
          documentTotalAmount: 120,
          customer: { code: 'TEST-CUSTOMER' },
        }];
      },
    });
    try {
      const result = await BusinessIntelligenceService.getSalesInvoices('TEST_entity_a', '2026-11-01', '2026-11-30');
      const where = invoiceQuery?.where as { issuedAt?: unknown };
      assert.deepEqual(where.issuedAt, {
        gte: new Date('2026-11-01T00:00:00.000Z'),
        lt: new Date('2026-12-01T00:00:00.000Z'),
      });
      assert.deepEqual(result.rows.map((row) => ({
        issueDate: row.issueDate,
        issuedAt: row.issuedAt,
        customerCode: row.customerCode,
      })), [{
        issueDate: '2026-11-07',
        issuedAt: '2026-11-07T17:00:00.000Z',
        customerCode: 'TEST-CUSTOMER',
      }]);
    } finally {
      if (originalEntity) Object.defineProperty(prisma.entity, 'findUnique', originalEntity);
      else Reflect.deleteProperty(prisma.entity, 'findUnique');
      if (originalInvoices) Object.defineProperty(prisma.invoice, 'findMany', originalInvoices);
      else Reflect.deleteProperty(prisma.invoice, 'findMany');
    }
  });

  it('scopes journal rows to POSTED entries for the requested entity and period', async () => {
    const originalEntity = Object.getOwnPropertyDescriptor(prisma.entity, 'findUnique');
    const originalLines = Object.getOwnPropertyDescriptor(prisma.journalLine, 'findMany');
    const originalAccounts = Object.getOwnPropertyDescriptor(prisma.chartOfAccount, 'findMany');
    let lineQuery: Record<string, unknown> | undefined;
    Object.defineProperty(prisma.entity, 'findUnique', {
      configurable: true,
      value: async () => ({
        id: 'TEST_entity_a',
        code: 'TEST-A',
        countryId: 'TEST_country',
        country: { code: 'TN', currencyCode: 'TND' },
      }),
    });
    Object.defineProperty(prisma.journalLine, 'findMany', {
      configurable: true,
      value: async (query: Record<string, unknown>) => {
        lineQuery = query;
        return [{
          accountCode: 'TEST-701',
          debit: 0,
          credit: 125,
          description: 'TEST line',
          costCenterCode: null,
          journalEntry: {
            entryNumber: 'TEST-1',
            date: new Date('2026-01-10T00:00:00.000Z'),
            reference: null,
            description: 'TEST entry',
            status: 'POSTED',
          },
        }];
      },
    });
    Object.defineProperty(prisma.chartOfAccount, 'findMany', {
      configurable: true,
      value: async () => [{ code: 'TEST-701', description: 'TEST revenue', type: 'Revenue' }],
    });

    try {
      const result = await BusinessIntelligenceService.getJournalLines('TEST_entity_a', '2026-01-01', '2026-01-31');
      const where = lineQuery?.where as { journalEntry?: Record<string, unknown> };
      assert.equal(where.journalEntry?.entityId, 'TEST_entity_a');
      assert.equal(where.journalEntry?.status, 'POSTED');
      assert.deepEqual(where.journalEntry?.date, {
        gte: new Date('2026-01-01T00:00:00.000Z'),
        lt: new Date('2026-02-01T00:00:00.000Z'),
      });
      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].accountType, 'Revenue');
      assert.deepEqual(result.entity, { code: 'TEST-A', countryCode: 'TN', currencyCode: 'TND' });
    } finally {
      if (originalEntity) Object.defineProperty(prisma.entity, 'findUnique', originalEntity);
      else Reflect.deleteProperty(prisma.entity, 'findUnique');
      if (originalLines) Object.defineProperty(prisma.journalLine, 'findMany', originalLines);
      else Reflect.deleteProperty(prisma.journalLine, 'findMany');
      if (originalAccounts) Object.defineProperty(prisma.chartOfAccount, 'findMany', originalAccounts);
      else Reflect.deleteProperty(prisma.chartOfAccount, 'findMany');
    }
  });

  it('rejects date windows longer than one year before querying the database', async () => {
    const originalEntity = Object.getOwnPropertyDescriptor(prisma.entity, 'findUnique');
    let queried = false;
    Object.defineProperty(prisma.entity, 'findUnique', {
      configurable: true,
      value: async () => {
        queried = true;
        return null;
      },
    });
    try {
      await assert.rejects(
        BusinessIntelligenceService.getJournalLines('TEST_entity_a', '2025-01-01', '2026-01-02'),
        /366 jours/,
      );
      assert.equal(queried, false);
    } finally {
      if (originalEntity) Object.defineProperty(prisma.entity, 'findUnique', originalEntity);
      else Reflect.deleteProperty(prisma.entity, 'findUnique');
    }
  });
});
