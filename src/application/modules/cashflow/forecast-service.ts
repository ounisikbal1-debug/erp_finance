import prisma from '../../../core/models/prisma';
import { CashflowRequestError } from './errors';
import { toMillimes } from './banking';
import { buildCashForecast, parseForecastDate, validateForecastHorizon } from './forecast';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isUniqueConstraintError(error: unknown): boolean {
  return isRecord(error) && error.code === 'P2002';
}

export class CashflowForecastService {
  static async listScenarios(entityId: string) {
    return prisma.cashForecastScenario.findMany({
      where: { entityId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        currencyCode: true,
        openingBalance: true,
        openingBalanceDate: true,
        openingBalanceSource: true,
        bankAccount: { select: { id: true, name: true, currencyCode: true } },
      },
    });
  }

  static async createScenario(value: unknown, entityId: string) {
    if (!isRecord(value)) throw new CashflowRequestError('Les données du scénario sont invalides.', 400);
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    const bankAccountId = typeof value.bankAccountId === 'string' ? value.bankAccountId.trim() : '';
    if (!name || name.length > 100 || !bankAccountId) {
      throw new CashflowRequestError('Un nom et un compte bancaire sont obligatoires pour le scénario.', 400);
    }
    const hasOpeningBalance = value.openingBalance !== undefined && value.openingBalance !== null && value.openingBalance !== '';
    const hasOpeningDate = value.openingBalanceDate !== undefined && value.openingBalanceDate !== null && value.openingBalanceDate !== '';
    if (hasOpeningBalance !== hasOpeningDate) {
      throw new CashflowRequestError('Le solde initial et sa date doivent être renseignés ensemble.', 400);
    }
    let openingBalance: number | undefined;
    let openingBalanceDate: Date | undefined;
    if (hasOpeningBalance) {
      openingBalance = typeof value.openingBalance === 'number' ? value.openingBalance : Number.NaN;
      if (toMillimes(openingBalance) === null) {
        throw new CashflowRequestError('Le solde initial doit être un nombre précis au millime.', 400);
      }
      openingBalanceDate = parseForecastDate(value.openingBalanceDate);
      if (!openingBalanceDate || openingBalanceDate.getTime() > Date.now()) {
        throw new CashflowRequestError('La date du solde initial ne peut pas être future.', 400);
      }
    }

    const bankAccount = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, entityId, isActive: true },
      select: { id: true, currencyCode: true },
    });
    if (!bankAccount) throw new CashflowRequestError('Compte bancaire introuvable ou inactif pour cette société.', 404);
    try {
      return await prisma.cashForecastScenario.create({
        data: {
          entityId,
          bankAccountId: bankAccount.id,
          name,
          currencyCode: bankAccount.currencyCode,
          ...(openingBalance === undefined || openingBalanceDate === undefined
            ? {}
            : {
              openingBalance,
              openingBalanceDate,
              openingBalanceSource: 'MANUAL',
            }),
        },
        select: {
          id: true,
          name: true,
          currencyCode: true,
          openingBalance: true,
          openingBalanceDate: true,
          openingBalanceSource: true,
          bankAccount: { select: { id: true, name: true, currencyCode: true } },
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new CashflowRequestError('Un scénario porte déjà ce nom pour cette société.', 409);
      }
      throw error;
    }
  }

  static async listSources(scenarioId: string, entityId: string) {
    const scenario = await prisma.cashForecastScenario.findFirst({
      where: { id: scenarioId, entityId },
      select: { currencyCode: true },
    });
    if (!scenario) throw new CashflowRequestError('Scénario introuvable pour cette société.', 404);
    const [salesInvoices, purchaseInvoices, paymentAllocations] = await Promise.all([
      prisma.invoice.findMany({
        where: { entityId, status: 'ISSUED', dueDate: { not: null } },
        select: {
          id: true,
          invoiceNumber: true,
          dueDate: true,
          totalAmount: true,
          currencyCode: true,
          functionalCurrencyCode: true,
          customer: { select: { name: true } },
        },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.purchaseInvoice.findMany({
        where: { entityId, status: { in: ['TO_REVIEW', 'APPROVED', 'POSTED'] } },
        select: {
          id: true,
          invoiceNumber: true,
          dueDate: true,
          totalAmount: true,
          currencyCode: true,
          functionalCurrencyCode: true,
          status: true,
          supplierCreditNotes: {
            where: { status: 'POSTED' },
            select: { documentTotalAmount: true, totalAmount: true, currencyCode: true },
          },
          vendor: { select: { name: true } },
        },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.cashflowPayment.findMany({
        where: { entityId },
        select: { invoiceId: true, purchaseInvoiceId: true, amount: true, carryingAmount: true },
      }),
    ]);
    const paidMillimes = new Map<string, number>();
    for (const payment of paymentAllocations) {
      const targetKey = payment.invoiceId
        ? `SALES_INVOICE:${payment.invoiceId}`
        : payment.purchaseInvoiceId ? `PURCHASE_INVOICE:${payment.purchaseInvoiceId}` : null;
      const amountMillimes = toMillimes(payment.carryingAmount ?? payment.amount);
      if (!targetKey || amountMillimes === null) {
        throw new CashflowRequestError('Une allocation de règlement est invalide; les échéances ne peuvent pas être calculées.', 409);
      }
      paidMillimes.set(targetKey, (paidMillimes.get(targetKey) ?? 0) + amountMillimes);
    }
    const sales = salesInvoices
      .filter((invoice) => (invoice.functionalCurrencyCode ?? invoice.currencyCode) === scenario.currencyCode
        && invoice.dueDate !== null && toMillimes(invoice.totalAmount) !== null && invoice.totalAmount > 0)
      .map((invoice) => {
        const totalMillimes = toMillimes(invoice.totalAmount)!;
        const amountMillimes = totalMillimes - (paidMillimes.get(`SALES_INVOICE:${invoice.id}`) ?? 0);
        return {
        sourceType: 'SALES_INVOICE',
        sourceId: invoice.id,
        expectedDate: invoice.dueDate!.toISOString(),
        description: `${invoice.invoiceNumber} — ${invoice.customer.name}`,
        direction: 'INFLOW',
        amount: amountMillimes / 1000,
        category: 'Facture client émise',
        currencyCode: scenario.currencyCode,
        status: 'ISSUED',
        };
      })
      .filter((invoice) => invoice.amount > 0);
    const purchases = purchaseInvoices
      .filter((invoice) => (invoice.functionalCurrencyCode ?? invoice.currencyCode) === scenario.currencyCode
        && toMillimes(invoice.totalAmount) !== null && invoice.totalAmount > 0)
      .map((invoice) => {
        const totalMillimes = toMillimes(invoice.totalAmount)!;
        const creditedMillimes = invoice.supplierCreditNotes.reduce((total, credit) => {
          if (credit.currencyCode !== invoice.currencyCode) {
            throw new CashflowRequestError(`Un avoir fournisseur de ${invoice.invoiceNumber} utilise une devise incohérente.`, 409);
          }
          const amount = toMillimes(credit.totalAmount);
          if (amount === null) {
            throw new CashflowRequestError(`Un avoir fournisseur de ${invoice.invoiceNumber} a un montant invalide.`, 409);
          }
          return total + amount;
        }, 0);
        const paidAmountMillimes = paidMillimes.get(`PURCHASE_INVOICE:${invoice.id}`) ?? 0;
        if (paidAmountMillimes + creditedMillimes > totalMillimes) {
          throw new CashflowRequestError(`Les règlements et avoirs dépassent le total de la facture ${invoice.invoiceNumber}.`, 409);
        }
        const amountMillimes = totalMillimes - paidAmountMillimes - creditedMillimes;
        return {
        sourceType: 'PURCHASE_INVOICE',
        sourceId: invoice.id,
        expectedDate: invoice.dueDate.toISOString(),
        description: `${invoice.invoiceNumber} — ${invoice.vendor.name}`,
        direction: 'OUTFLOW',
        amount: amountMillimes / 1000,
        category: invoice.status === 'POSTED'
          ? 'Facture fournisseur comptabilisée'
          : invoice.status === 'APPROVED' ? 'Facture fournisseur approuvée' : 'Facture fournisseur à contrôler',
        currencyCode: scenario.currencyCode,
        status: invoice.status,
        };
      })
      .filter((invoice) => invoice.amount > 0);
    return [...sales, ...purchases].sort((left, right) => left.expectedDate.localeCompare(right.expectedDate));
  }

  static async getScenarioData(scenarioId: string, entityId: string, requestedHorizon: unknown) {
    const horizonDays = validateForecastHorizon(requestedHorizon);
    const scenario = await prisma.cashForecastScenario.findFirst({
      where: { id: scenarioId, entityId },
      include: { bankAccount: { select: { id: true, name: true, currencyCode: true } } },
    });
    if (!scenario) throw new CashflowRequestError('Scénario introuvable pour cette société.', 404);

    const statementSnapshot = scenario.openingBalance === null || scenario.openingBalanceDate === null
      ? await prisma.bankStatementLine.findFirst({
        where: {
          entityId,
          bankAccountId: scenario.bankAccountId,
          balanceAfter: { not: null },
        },
        orderBy: [{ transactionDate: 'desc' }, { statement: { importedAt: 'desc' } }],
        select: { transactionDate: true, balanceAfter: true },
      })
      : null;
    const openingBalance = scenario.openingBalance ?? statementSnapshot?.balanceAfter ?? null;
    const openingBalanceDate = scenario.openingBalanceDate ?? statementSnapshot?.transactionDate ?? null;
    const openingBalanceSource = scenario.openingBalanceSource
      ?? (statementSnapshot ? 'STATEMENT' : null);
    const storedItems = await prisma.cashForecastItem.findMany({
      where: { scenarioId, entityId },
      orderBy: [{ expectedDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        expectedDate: true,
        description: true,
        direction: true,
        amount: true,
        category: true,
        status: true,
        sourceType: true,
        sourceId: true,
      },
    });
    const sources = await this.listSources(scenarioId, entityId);
    const currentSources = new Map(sources.map((source) => [`${source.sourceType}:${source.sourceId}`, source]));
    const items = storedItems.flatMap((item) => {
      if (!item.sourceType || !item.sourceId) return [item];
      const currentSource = currentSources.get(`${item.sourceType}:${item.sourceId}`);
      if (!currentSource) return [];
      return [{
        ...item,
        expectedDate: new Date(currentSource.expectedDate),
        description: currentSource.description,
        direction: currentSource.direction,
        amount: currentSource.amount,
        category: currentSource.category,
      }];
    });
    return {
      scenario: {
        id: scenario.id,
        name: scenario.name,
        currencyCode: scenario.currencyCode,
        openingBalance,
        openingBalanceDate: openingBalanceDate?.toISOString() ?? null,
        openingBalanceSource,
        bankAccount: scenario.bankAccount,
      },
      ...buildCashForecast({
        asOfDate: openingBalanceDate,
        openingBalance,
        openingBalanceSource,
        currencyCode: scenario.currencyCode,
        horizonDays,
        items,
      }),
      items,
    };
  }

  static async createItem(value: unknown, scenarioId: string, entityId: string) {
    if (!isRecord(value)) throw new CashflowRequestError('Les données de la prévision sont invalides.', 400);
    if (value.status !== undefined && value.status !== 'PLANNED') {
      throw new CashflowRequestError('Un flux saisi reste planifié; son statut ne peut pas être confirmé manuellement.', 400);
    }
    const scenario = await prisma.cashForecastScenario.findFirst({
      where: { id: scenarioId, entityId },
      select: { id: true },
    });
    if (!scenario) throw new CashflowRequestError('Scénario introuvable pour cette société.', 404);
    let expectedDate: Date;
    let description: string;
    let category: string;
    let direction: unknown;
    let amount: number;
    let sourceType = 'MANUAL';
    let sourceId: string | null = null;
    if (value.sourceType === 'SALES_INVOICE' || value.sourceType === 'PURCHASE_INVOICE') {
      if (typeof value.sourceId !== 'string' || !value.sourceId.trim()) {
        throw new CashflowRequestError('Une facture source valide est requise.', 400);
      }
      const source = (await this.listSources(scenarioId, entityId))
        .find((item) => item.sourceType === value.sourceType && item.sourceId === value.sourceId);
      if (!source) throw new CashflowRequestError('Facture source absente, non admissible ou dans une autre devise.', 409);
      const duplicate = await prisma.cashForecastItem.findFirst({
        where: { scenarioId, entityId, sourceType: value.sourceType, sourceId: value.sourceId },
        select: { id: true },
      });
      if (duplicate) throw new CashflowRequestError('Cette facture figure déjà dans le scénario.', 409);
      expectedDate = new Date(source.expectedDate);
      description = source.description;
      category = source.category;
      direction = source.direction;
      amount = source.amount;
      sourceType = value.sourceType;
      sourceId = value.sourceId;
    } else {
      if (value.sourceType !== undefined || value.sourceId !== undefined) {
        throw new CashflowRequestError('La source du flux prévisionnel est invalide.', 400);
      }
      description = typeof value.description === 'string' ? value.description.trim() : '';
      category = typeof value.category === 'string' ? value.category.trim() : '';
      direction = value.direction;
      amount = typeof value.amount === 'number' ? value.amount : Number.NaN;
      expectedDate = parseForecastDate(value.expectedDate);
    }
    const amountMillimes = toMillimes(amount);
    if (
      !description || description.length > 250
      || !category || category.length > 80
      || (direction !== 'INFLOW' && direction !== 'OUTFLOW')
      || amountMillimes === null
      || amountMillimes <= 0
    ) {
      throw new CashflowRequestError('Renseignez un libellé, une catégorie, un sens de flux valide et un montant positif au millime.', 400);
    }
    return prisma.cashForecastItem.create({
      data: {
        entityId,
        scenarioId,
        expectedDate,
        description,
        category,
        direction,
        amount: amountMillimes / 1000,
        status: 'PLANNED',
        sourceType,
        sourceId,
      },
      select: {
        id: true,
        expectedDate: true,
        description: true,
        direction: true,
        amount: true,
        category: true,
        status: true,
        sourceType: true,
        sourceId: true,
      },
    });
  }

  static async removeItem(itemId: string, entityId: string) {
    const result = await prisma.cashForecastItem.deleteMany({
      where: { id: itemId, entityId },
    });
    if (result.count === 0) throw new CashflowRequestError('Ligne de prévision introuvable pour cette société.', 404);
    return { id: itemId };
  }
}

export default CashflowForecastService;
