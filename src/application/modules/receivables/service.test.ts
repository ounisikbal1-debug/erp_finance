import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import ReceivablesService from './service';

describe('ReceivablesService.getAging', () => {
  it('limits invoices and payment allocations to the requested entity and cutoff', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    const queries: Record<string, unknown> = {};
    stub(prisma.entity, 'findUnique', async (query: unknown) => {
      queries.entity = query;
      return { name: 'SAFE TN', country: { currencyCode: 'TND' } };
    });
    stub(prisma.invoice, 'findMany', async (query: unknown) => {
      queries.invoices = query;
      return [{
        id: 'invoice-1',
        invoiceNumber: 'INV-001',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        dueDate: new Date('2026-03-30T00:00:00.000Z'),
        status: 'ISSUED',
        totalAmount: 100,
        currencyCode: 'TND',
        functionalCurrencyCode: 'TND',
        customer: { code: 'C001', name: 'Client' },
        cashflowPayments: [{
          amount: 25,
          carryingAmount: 30,
          currencyCode: 'TND',
          direction: 'CUSTOMER_RECEIPT',
          paidAt: new Date('2026-03-15T00:00:00.000Z'),
        }],
      }];
    });

    try {
      const report = await ReceivablesService.getAging('entity-a', '2026-03-31');
      assert.equal(report.totals.outstanding, 70);
      assert.deepEqual(queries.entity, {
        where: { id: 'entity-a' },
        select: { name: true, country: { select: { currencyCode: true } } },
      });
      assert.deepEqual(queries.invoices, {
        where: {
          entityId: 'entity-a',
          status: { in: ['ISSUED', 'PAID'] },
          createdAt: { lt: new Date('2026-04-01T00:00:00.000Z') },
        },
        select: {
          id: true,
          invoiceNumber: true,
          createdAt: true,
          dueDate: true,
          status: true,
          totalAmount: true,
          currencyCode: true,
          functionalCurrencyCode: true,
          customer: { select: { code: true, name: true } },
          cashflowPayments: {
            where: { entityId: 'entity-a', paidAt: { lt: new Date('2026-04-01T00:00:00.000Z') } },
            select: { amount: true, carryingAmount: true, currencyCode: true, direction: true, paidAt: true },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('rejects invalid cutoff dates before querying data', async () => {
    await assert.rejects(() => ReceivablesService.getAging('entity-a', '2026-02-30'), /date calendaire valide/);
  });
});
