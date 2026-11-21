import type { Prisma } from '@prisma/client';
import { FinanceRequestError } from './errors';

type PeriodLockClient = Pick<Prisma.TransactionClient, 'monthlyCloseLock'>;
type PeriodLockErrorFactory = (message: string) => Error;

export async function assertAccountingPeriodOpen(
  transaction: PeriodLockClient,
  entityId: string,
  postingDate: Date,
  createError: PeriodLockErrorFactory = (message) => new FinanceRequestError(message, 409),
): Promise<void> {
  if (!(postingDate instanceof Date) || !Number.isFinite(postingDate.getTime())) {
    throw new Error('La date comptable doit être une date valide.');
  }
  const month = postingDate.toISOString().slice(0, 7);
  const year = month.slice(0, 4);
  const lock = await transaction.monthlyCloseLock.findFirst({
    where: { entityId, period: { in: [month, year] } },
    select: { period: true },
  });
  if (lock) {
    throw createError(`La période comptable ${lock.period} est clôturée; cette pièce ne peut pas être comptabilisée.`);
  }
}
