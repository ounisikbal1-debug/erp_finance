import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import { CashflowRequestError } from './errors';
import CashflowForecastService from './forecast-service';

function stub(target: object, property: string, value: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, { configurable: true, value });
  return () => {
    if (original) Object.defineProperty(target, property, original);
    else Reflect.deleteProperty(target, property);
  };
}

function stubForecastData(creditAmount: number) {
  return [
    stub(prisma.cashForecastScenario, 'findFirst', async () => ({ currencyCode: 'TND' })),
    stub(prisma.invoice, 'findMany', async () => []),
    stub(prisma.purchaseInvoice, 'findMany', async () => [{
      id: 'purchase-invoice-a',
      invoiceNumber: 'SUP-1',
      dueDate: new Date('2026-03-31T00:00:00.000Z'),
      totalAmount: 100,
      currencyCode: 'TND',
      functionalCurrencyCode: 'TND',
      status: 'POSTED',
      supplierCreditNotes: [{
        documentTotalAmount: creditAmount,
        totalAmount: creditAmount,
        currencyCode: 'TND',
      }],
      vendor: { name: 'Fournisseur test' },
    }]),
    stub(prisma.cashflowPayment, 'findMany', async () => []),
  ];
}

describe('CashflowForecastService.listSources', () => {
  it('subtracts posted supplier credits from projected outflows', async () => {
    const restorers = stubForecastData(25);
    try {
      const [source] = await CashflowForecastService.listSources('scenario-a', 'entity-a');
      assert.equal(source.sourceId, 'purchase-invoice-a');
      assert.equal(source.amount, 75);
      assert.equal(source.direction, 'OUTFLOW');
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('rejects posted supplier credits that exceed the invoice balance', async () => {
    const restorers = stubForecastData(101);
    try {
      await assert.rejects(
        CashflowForecastService.listSources('scenario-a', 'entity-a'),
        (error: unknown) => error instanceof CashflowRequestError && error.statusCode === 409,
      );
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });
});
