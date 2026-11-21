import prisma from '../../../data/prisma/client';
import { FinanceRequestError } from '../finance/errors';
import { calculateReceivablesAging, parseReceivablesAsOf } from './aging';

export class ReceivablesService {
  static async getAging(entityId: string, value: unknown) {
    const { asOf, endExclusive } = parseReceivablesAsOf(value);
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: {
        name: true,
        country: { select: { currencyCode: true } },
      },
    });
    if (!entity) throw new FinanceRequestError('Société introuvable.', 404);
    const invoices = await prisma.invoice.findMany({
      where: {
        entityId,
        status: { in: ['ISSUED', 'PAID'] },
        createdAt: { lt: endExclusive },
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
          where: { entityId, paidAt: { lt: endExclusive } },
          select: { amount: true, carryingAmount: true, currencyCode: true, direction: true, paidAt: true },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
    return calculateReceivablesAging({
      entity: { name: entity.name, currencyCode: entity.country.currencyCode },
      invoices,
      asOf,
    });
  }
}

export default ReceivablesService;
