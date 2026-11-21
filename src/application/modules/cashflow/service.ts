import prisma from '../../../data/prisma/client';
import { CashflowRequestError } from './errors';
import { buildCashflowReport } from './report';
import { parseCashflowPeriod, validateCashAccountCodes } from './validation';

export class CashflowService {
  static async getModuleData(entityId: string, requestedPeriod: unknown) {
    const period = parseCashflowPeriod(requestedPeriod);
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: {
        name: true,
        countryId: true,
        country: { select: { code: true, currencyCode: true } },
      },
    });
    if (!entity) throw new CashflowRequestError('Société introuvable.', 404);

    const [mappings, bankAccounts, accounts] = await Promise.all([
      prisma.cashAccountMapping.findMany({
        where: { entityId },
        select: { accountCode: true },
        orderBy: { accountCode: 'asc' },
      }),
      prisma.bankAccount.findMany({
        where: { entityId, isActive: true },
        select: { ledgerAccountCode: true },
      }),
      prisma.chartOfAccount.findMany({
        where: { countryId: entity.countryId, type: 'Asset', isPostingAllowed: true },
        select: { code: true, description: true, type: true },
        orderBy: { code: 'asc' },
      }),
    ]);

    const mappedAccountCodes = [...new Set([
      ...mappings.map((mapping) => mapping.accountCode),
      ...bankAccounts.map((account) => account.ledgerAccountCode),
    ])].sort((left, right) => left.localeCompare(right));
    const validCodes = new Set(accounts.map((account) => account.code));
    const queryCodes = mappedAccountCodes.filter((code) => validCodes.has(code));
    const journalLines = queryCodes.length === 0
      ? []
      : await prisma.journalLine.findMany({
        where: {
          accountCode: { in: queryCodes },
          journalEntry: {
            entityId,
            status: 'POSTED',
            date: { lt: period.endExclusive },
          },
        },
        select: {
          id: true,
          accountCode: true,
          debit: true,
          credit: true,
          description: true,
          journalEntry: {
            select: {
              entryNumber: true,
              date: true,
              reference: true,
              description: true,
            },
          },
        },
      });

    return buildCashflowReport({
      entity: {
        name: entity.name,
        countryCode: entity.country.code,
        currencyCode: entity.country.currencyCode,
      },
      period: period.period,
      startAt: period.startAt,
      endExclusive: period.endExclusive,
      accounts,
      mappedAccountCodes,
      journalLines,
    });
  }

  static async setCashAccounts(value: unknown, entityId: string) {
    const accountCodes = validateCashAccountCodes(
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>).accountCodes
        : undefined,
    );
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { countryId: true },
    });
    if (!entity) throw new CashflowRequestError('Société introuvable.', 404);

    const [accounts, bankAccounts] = await Promise.all([
      accountCodes.length === 0
        ? []
        : prisma.chartOfAccount.findMany({
          where: {
            countryId: entity.countryId,
            type: 'Asset',
            isPostingAllowed: true,
            code: { in: accountCodes },
          },
          select: { code: true },
        }),
      prisma.bankAccount.findMany({
        where: { entityId, isActive: true },
        select: { ledgerAccountCode: true },
      }),
    ]);
    const validCodes = new Set(accounts.map((account) => account.code));
    const invalidCodes = accountCodes.filter((code) => !validCodes.has(code));
    if (invalidCodes.length > 0) {
      throw new CashflowRequestError(
        `Seuls les comptes d’actif du plan comptable du pays peuvent être mappés : ${invalidCodes.join(', ')}.`,
        400,
      );
    }
    const missingBankCodes = bankAccounts
      .map((account) => account.ledgerAccountCode)
      .filter((code) => !accountCodes.includes(code));
    if (missingBankCodes.length > 0) {
      throw new CashflowRequestError(
        `Les comptes généraux liés à des comptes bancaires actifs restent inclus dans le rapport : ${missingBankCodes.join(', ')}.`,
        409,
      );
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.cashAccountMapping.deleteMany({ where: { entityId } });
      if (accountCodes.length > 0) {
        await transaction.cashAccountMapping.createMany({
          data: accountCodes.map((accountCode) => ({ entityId, accountCode })),
        });
      }
    });
    return { accountCodes };
  }
}

export default CashflowService;
