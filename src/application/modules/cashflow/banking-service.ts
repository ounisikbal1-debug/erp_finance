import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import prisma from '../../../core/models/prisma';
import { CashflowRequestError } from './errors';
import { buildBankLineDeduplicationKey, parseBankStatementCsv, toMillimes } from './banking';
import { validateJournalEntry } from '../finance/journal-validation';
import { assertAccountingPeriodOpen } from '../finance/posting-period';
import { appendJournalEntryAuditRecord } from '../finance/audit-chain';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isUniqueConstraintError(error: unknown): boolean {
  return isRecord(error) && error.code === 'P2002';
}

function normalizeBankLabel(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getAccountInput(value: unknown): { name: string; currencyCode: string; ledgerAccountCode: string } {
  if (!isRecord(value)) throw new CashflowRequestError('Les données du compte bancaire sont invalides.', 400);
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const currencyCode = typeof value.currencyCode === 'string' ? value.currencyCode.trim().toUpperCase() : '';
  const ledgerAccountCode = typeof value.ledgerAccountCode === 'string' ? value.ledgerAccountCode.trim() : '';
  if (!name || name.length > 100 || !/^[A-Z]{3}$/.test(currencyCode) || !ledgerAccountCode || ledgerAccountCode.length > 50) {
    throw new CashflowRequestError('Renseignez un nom, une devise ISO à trois lettres et un compte comptable.', 400);
  }
  return { name, currencyCode, ledgerAccountCode };
}

export class CashflowBankingService {
  static async getAccountingMapping(entityId: string) {
    const mapping = await prisma.cashflowAccountingMapping.findUnique({
      where: { entityId },
      select: {
        receivableAccountCode: true,
        payableAccountCode: true,
        updatedAt: true,
      },
    });
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: {
        countryId: true,
        country: {
          select: {
            currencyCode: true,
            realizedFxGainAccountCode: true,
            realizedFxLossAccountCode: true,
          },
        },
      },
    });
    if (!entity) throw new CashflowRequestError('Société introuvable.', 404);
    const codes = [mapping?.receivableAccountCode, mapping?.payableAccountCode]
      .filter((code): code is string => Boolean(code));
    const accounts = await prisma.chartOfAccount.findMany({
      where: { countryId: entity.countryId, code: { in: codes } },
      select: { code: true, description: true, type: true, isPostingAllowed: true },
    });
    const availableAccounts = await prisma.chartOfAccount.findMany({
      where: {
        countryId: entity.countryId,
        type: { in: ['Asset', 'Liability'] },
        isPostingAllowed: true,
      },
      select: { code: true, description: true, type: true },
      orderBy: { code: 'asc' },
    });
    return {
      receivableAccountCode: mapping?.receivableAccountCode ?? null,
      payableAccountCode: mapping?.payableAccountCode ?? null,
      updatedAt: mapping?.updatedAt ?? null,
      functionalCurrencyCode: entity.country.currencyCode,
      realizedFxGainAccountCode: entity.country.realizedFxGainAccountCode,
      realizedFxLossAccountCode: entity.country.realizedFxLossAccountCode,
      availableAccounts,
      missingRequirements: [
        ...(!mapping?.receivableAccountCode ? ['Compte client non configuré.'] : []),
        ...(!mapping?.payableAccountCode ? ['Compte fournisseur non configuré.'] : []),
        ...codes.filter((code) => !accounts.some((account) => account.code === code
          && account.isPostingAllowed
          && (code === mapping?.receivableAccountCode ? account.type === 'Asset' : account.type === 'Liability')))
          .map((code) => `Le compte ${code} est absent, non comptabilisable ou de type incorrect.`),
      ],
    };
  }

  static async setAccountingMapping(value: unknown, entityId: string) {
    if (!isRecord(value)) throw new CashflowRequestError('Les mappings comptables sont invalides.', 400);
    const receivableAccountCode = typeof value.receivableAccountCode === 'string'
      ? value.receivableAccountCode.trim()
      : null;
    const payableAccountCode = typeof value.payableAccountCode === 'string'
      ? value.payableAccountCode.trim()
      : null;
    if ([receivableAccountCode, payableAccountCode].some((code) => code !== null && (!code || code.length > 50))) {
      throw new CashflowRequestError('Les comptes comptables sélectionnés sont invalides.', 400);
    }
    if (!receivableAccountCode && !payableAccountCode) {
      throw new CashflowRequestError('Configurez au moins un compte client ou fournisseur.', 400);
    }
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { countryId: true },
    });
    if (!entity) throw new CashflowRequestError('Société introuvable.', 404);
    const expectedTypes = new Map<string, string>();
    if (receivableAccountCode) expectedTypes.set(receivableAccountCode, 'Asset');
    if (payableAccountCode) expectedTypes.set(payableAccountCode, 'Liability');
    if (expectedTypes.size !== Number(Boolean(receivableAccountCode)) + Number(Boolean(payableAccountCode))) {
      throw new CashflowRequestError('Un même compte ne peut pas être utilisé pour les clients et les fournisseurs.', 400);
    }
    const accounts = await prisma.chartOfAccount.findMany({
      where: { countryId: entity.countryId, code: { in: [...expectedTypes.keys()] } },
      select: { code: true, type: true, isPostingAllowed: true },
    });
    if ([...expectedTypes].some(([code, type]) => !accounts.some((account) => (
      account.code === code && account.type === type && account.isPostingAllowed
    )))) {
      throw new CashflowRequestError('Chaque mapping doit cibler un compte comptabilisable du bon type dans le plan pays.', 422);
    }
    return prisma.cashflowAccountingMapping.upsert({
      where: { entityId },
      create: { entityId, receivableAccountCode, payableAccountCode },
      update: { receivableAccountCode, payableAccountCode },
      select: { receivableAccountCode: true, payableAccountCode: true, updatedAt: true },
    });
  }

  static async listPayments(entityId: string) {
    return prisma.cashflowPayment.findMany({
      where: { entityId },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        direction: true,
        amount: true,
        currencyCode: true,
        settledDocumentAmount: true,
        documentCurrencyCode: true,
        carryingAmount: true,
        settlementExchangeRate: true,
        settlementRateDate: true,
        settlementRateSource: true,
        realizedFxGain: true,
        realizedFxLoss: true,
        paidAt: true,
        statementLine: { select: { id: true, description: true, externalReference: true } },
        invoice: { select: { id: true, invoiceNumber: true, status: true } },
        purchaseInvoice: { select: { id: true, invoiceNumber: true, status: true } },
      },
    });
  }

  static async listPaymentTargets(entityId: string) {
    const [invoices, purchaseInvoices, payments] = await Promise.all([
      prisma.invoice.findMany({
        where: { entityId, status: { in: ['ISSUED', 'PAID'] } },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          totalAmount: true,
          documentTotalAmount: true,
          currencyCode: true,
          documentCurrencyCode: true,
          functionalCurrencyCode: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.purchaseInvoice.findMany({
        where: { entityId, status: 'POSTED' },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          totalAmount: true,
          documentTotalAmount: true,
          currencyCode: true,
          documentCurrencyCode: true,
          functionalCurrencyCode: true,
          supplierCreditNotes: {
            where: { status: 'POSTED' },
            select: { documentTotalAmount: true, totalAmount: true, currencyCode: true },
          },
          supplierCreditApplications: {
            select: { documentAmount: true, functionalAmount: true },
          },
        },
        orderBy: { issueDate: 'desc' },
      }),
      prisma.cashflowPayment.findMany({
        where: { entityId },
        select: {
          invoiceId: true,
          purchaseInvoiceId: true,
          amount: true,
          settledDocumentAmount: true,
          documentCurrencyCode: true,
          carryingAmount: true,
        },
      }),
    ]);
    const paidByTarget = new Map<string, { document: number; carrying: number }>();
    const invoiceById = new Map<string, {
      documentCurrencyCode: string | null;
      functionalCurrencyCode: string | null;
      currencyCode: string | null;
    }>([
      ...invoices.map((invoice) => [`SALES_INVOICE:${invoice.id}`, invoice] as const),
      ...purchaseInvoices.map((invoice) => [`PURCHASE_INVOICE:${invoice.id}`, invoice] as const),
    ]);
    for (const payment of payments) {
      const targetId = payment.invoiceId ?? payment.purchaseInvoiceId;
      const targetType = payment.invoiceId ? 'SALES_INVOICE' : 'PURCHASE_INVOICE';
      const target = targetId ? invoiceById.get(`${targetType}:${targetId}`) : null;
      const amountMillimes = toMillimes(payment.amount);
      if (!targetId || !target || amountMillimes === null) {
        throw new CashflowRequestError('Une allocation existante est invalide; les soldes à payer ne sont pas fiables.', 409);
      }
      const documentCurrencyCode = target.documentCurrencyCode ?? target.currencyCode ?? '';
      const functionalCurrencyCode = target.functionalCurrencyCode ?? '';
      const documentAmount = payment.settledDocumentAmount === null
        ? (documentCurrencyCode === functionalCurrencyCode ? amountMillimes : null)
        : toMillimes(payment.settledDocumentAmount);
      const carryingAmount = payment.carryingAmount === null ? amountMillimes : toMillimes(payment.carryingAmount);
      if (documentAmount === null || carryingAmount === null
        || (payment.documentCurrencyCode && payment.documentCurrencyCode !== documentCurrencyCode)) {
        throw new CashflowRequestError('Une allocation historique ne contient pas les montants document et comptable requis; les soldes doivent être contrôlés.', 409);
      }
      const targetKey = `${targetType}:${targetId}`;
      const current = paidByTarget.get(targetKey) ?? { document: 0, carrying: 0 };
      paidByTarget.set(targetKey, {
        document: current.document + documentAmount,
        carrying: current.carrying + carryingAmount,
      });
    }
    return [
      ...invoices.map((invoice) => ({ ...invoice, type: 'SALES_INVOICE' as const })),
      ...purchaseInvoices.map((invoice) => ({ ...invoice, type: 'PURCHASE_INVOICE' as const })),
    ].flatMap((invoice) => {
      const documentTotal = invoice.documentTotalAmount ?? invoice.totalAmount;
      const totalMillimes = toMillimes(documentTotal);
      const functionalTotalMillimes = toMillimes(invoice.totalAmount);
      if (totalMillimes === null || functionalTotalMillimes === null) {
        throw new CashflowRequestError(`Le total de la facture ${invoice.invoiceNumber} n’est pas précis au millime.`, 409);
      }
      const paid = paidByTarget.get(`${invoice.type}:${invoice.id}`) ?? { document: 0, carrying: 0 };
      const credits = invoice.type === 'PURCHASE_INVOICE' ? invoice.supplierCreditNotes : [];
      const sourceCredits = credits.reduce((total, credit) => {
        const document = toMillimes(credit.documentTotalAmount);
        const carrying = toMillimes(credit.totalAmount);
        if (document === null || carrying === null
          || credit.currencyCode !== (invoice.documentCurrencyCode ?? invoice.currencyCode)) {
          throw new CashflowRequestError(`Un avoir fournisseur de ${invoice.invoiceNumber} est invalide.`, 409);
        }
        return { document: total.document + document, carrying: total.carrying + carrying };
      }, { document: 0, carrying: 0 });
      const applications = invoice.type === 'PURCHASE_INVOICE'
        ? invoice.supplierCreditApplications.reduce((total, application) => {
          const document = toMillimes(application.documentAmount);
          const carrying = toMillimes(application.functionalAmount);
          if (document === null || carrying === null) {
            throw new CashflowRequestError(`Une affectation d’avoir de ${invoice.invoiceNumber} est invalide.`, 409);
          }
          return { document: total.document + document, carrying: total.carrying + carrying };
        }, { document: 0, carrying: 0 })
        : { document: 0, carrying: 0 };
      const credited = {
        document: Math.min(sourceCredits.document, Math.max(0, totalMillimes - paid.document)) + applications.document,
        carrying: Math.min(sourceCredits.carrying, Math.max(0, functionalTotalMillimes - paid.carrying))
          + applications.carrying,
      };
      if (paid.document + credited.document > totalMillimes
        || paid.carrying + credited.carrying > functionalTotalMillimes) {
        throw new CashflowRequestError(`Les règlements et affectations dépassent le total de la facture ${invoice.invoiceNumber}.`, 409);
      }
      const remainingMillimes = totalMillimes - paid.document - credited.document;
      if (remainingMillimes <= 0) return [];
      return [{
        id: invoice.id,
        type: invoice.type,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        currencyCode: invoice.documentCurrencyCode ?? invoice.currencyCode ?? '',
        functionalCurrencyCode: invoice.functionalCurrencyCode ?? '',
        totalAmount: documentTotal,
        paidAmount: paid.document / 1000,
        creditedAmount: credited.document / 1000,
        remainingAmount: remainingMillimes / 1000,
      }];
    });
  }

  static async allocatePayment(value: unknown, entityId: string, userId?: string) {
    if (!isRecord(value)
      || typeof value.statementLineId !== 'string'
      || (typeof value.invoiceId !== 'string' && typeof value.purchaseInvoiceId !== 'string')
      || (value.invoiceId && value.purchaseInvoiceId)) {
      throw new CashflowRequestError('Sélectionnez une opération bancaire et une seule facture.', 400);
    }
    const invoiceId = typeof value.invoiceId === 'string' ? value.invoiceId : null;
    const purchaseInvoiceId = typeof value.purchaseInvoiceId === 'string' ? value.purchaseInvoiceId : null;
    try {
      return await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
        const line = await transaction.bankStatementLine.findFirst({
          where: { id: value.statementLineId as string, entityId },
          include: {
            bankAccount: { select: { currencyCode: true, ledgerAccountCode: true } },
            reconciliation: {
              include: {
                journalLine: {
                  include: {
                    journalEntry: { include: { lines: true } },
                  },
                },
              },
            },
            cashflowPayment: { select: { id: true } },
          },
        });
        if (!line || !line.reconciliation) {
          throw new CashflowRequestError('L’opération doit être rapprochée d’une écriture comptable avant son allocation.', 409);
        }
        if (line.cashflowPayment) throw new CashflowRequestError('Cette opération bancaire a déjà été allouée.', 409);
        const bankJournalLine = line.reconciliation.journalLine;
        const journal = bankJournalLine.journalEntry;
        if (journal.entityId !== entityId || journal.status !== 'POSTED') {
          throw new CashflowRequestError('L’écriture rapprochée n’est pas validée pour cette société.', 409);
        }
        const postedReversal = await transaction.journalEntry.findFirst({
          where: { reversesEntryId: journal.id, entityId, status: 'POSTED' },
          select: { id: true },
        });
        if (postedReversal) {
          throw new CashflowRequestError('L’écriture rapprochée est déjà contrepassée; elle ne peut plus servir à une allocation.', 409);
        }
        const signedMillimes = toMillimes(line.amount);
        const bankDebit = toMillimes(bankJournalLine.debit);
        const bankCredit = toMillimes(bankJournalLine.credit);
        if (signedMillimes === null || bankDebit === null || bankCredit === null
          || bankDebit < 0 || bankCredit < 0
          || (bankDebit > 0) === (bankCredit > 0)
          || bankDebit - bankCredit !== signedMillimes) {
          throw new CashflowRequestError('Le montant rapproché est invalide ou non précis au millime.', 409);
        }
        const journalTotals = journal.lines.reduce((totals, journalLine) => {
          const debit = toMillimes(journalLine.debit);
          const credit = toMillimes(journalLine.credit);
          if (debit === null || credit === null || debit < 0 || credit < 0 || (debit > 0 && credit > 0)) {
            return { invalid: true, debit: totals.debit, credit: totals.credit };
          }
          return {
            invalid: totals.invalid,
            debit: totals.debit + debit,
            credit: totals.credit + credit,
          };
        }, { invalid: false, debit: 0, credit: 0 });
        const bankTotals = journal.lines
          .filter((journalLine) => journalLine.accountCode === line.bankAccount.ledgerAccountCode)
          .reduce((totals, journalLine) => {
            const debit = toMillimes(journalLine.debit);
            const credit = toMillimes(journalLine.credit);
            if (debit === null || credit === null) {
              return { invalid: true, signed: totals.signed };
            }
            return { invalid: totals.invalid, signed: totals.signed + debit - credit };
          }, { invalid: false, signed: 0 });
        if (journalTotals.invalid || journalTotals.debit !== journalTotals.credit
          || bankTotals.invalid || bankTotals.signed !== signedMillimes) {
          throw new CashflowRequestError('L’écriture de règlement doit être équilibrée et son compte bancaire doit correspondre exactement au relevé.', 409);
        }
        const incoming = signedMillimes > 0;
        if (bankJournalLine.accountCode !== line.bankAccount.ledgerAccountCode
          || line.currencyCode !== line.bankAccount.currencyCode) {
          throw new CashflowRequestError('La devise ou le compte bancaire rapproché ne correspond pas au relevé.', 409);
        }
        if (!signedMillimes) throw new CashflowRequestError('Un règlement nul ne peut pas être alloué.', 400);
        if (incoming !== Boolean(invoiceId)) {
          throw new CashflowRequestError('Le sens du relevé ne correspond pas au type de facture sélectionné.', 409);
        }
        const entity = await transaction.entity.findUnique({
          where: { id: entityId },
          select: {
            countryId: true,
            country: {
              select: {
                currencyCode: true,
                realizedFxGainAccountCode: true,
                realizedFxLossAccountCode: true,
              },
            },
          },
        });
        if (!entity) throw new CashflowRequestError('Société introuvable.', 404);
        if (line.currencyCode !== entity.country.currencyCode) {
          throw new CashflowRequestError('Le règlement doit être exprimé dans la devise fonctionnelle du profil pays.', 409);
        }
        const expectedCounterAccount = (await transaction.cashflowAccountingMapping.findUnique({
          where: { entityId },
          select: { receivableAccountCode: true, payableAccountCode: true },
        }))?.[incoming ? 'receivableAccountCode' : 'payableAccountCode'];
        if (!expectedCounterAccount) {
          throw new CashflowRequestError(`Le mapping comptable ${incoming ? 'client' : 'fournisseur'} doit être configuré avant l’allocation.`, 409);
        }
        const counterpartTotals = journal.lines
          .filter((journalLine) => journalLine.accountCode === expectedCounterAccount)
          .reduce((totals, journalLine) => {
            const debit = toMillimes(journalLine.debit);
            const credit = toMillimes(journalLine.credit);
            if (debit === null || credit === null) return { invalid: true, debit: totals.debit, credit: totals.credit };
            return { invalid: totals.invalid, debit: totals.debit + debit, credit: totals.credit + credit };
          }, { invalid: false, debit: 0, credit: 0 });
        if (counterpartTotals.invalid || (incoming
          ? counterpartTotals.debit !== 0 || counterpartTotals.credit <= 0
          : counterpartTotals.debit <= 0 || counterpartTotals.credit !== 0)) {
          throw new CashflowRequestError('L’écriture rapprochée ne porte pas une contrepartie valide dans le compte configuré.', 409);
        }

        const target = invoiceId
          ? await transaction.invoice.findFirst({
            where: { id: invoiceId, entityId, status: { in: ['ISSUED', 'PAID'] } },
            select: {
              id: true,
              totalAmount: true,
              documentTotalAmount: true,
              functionalCurrencyCode: true,
              currencyCode: true,
              documentCurrencyCode: true,
              status: true,
            },
          })
          : await transaction.purchaseInvoice.findFirst({
            where: { id: purchaseInvoiceId as string, entityId, status: 'POSTED' },
            select: {
              id: true,
              totalAmount: true,
              documentTotalAmount: true,
              functionalCurrencyCode: true,
              currencyCode: true,
              documentCurrencyCode: true,
              status: true,
            },
          });
        if (!target) throw new CashflowRequestError('Facture introuvable, non émise/comptabilisée ou hors société.', 404);
        const direction = invoiceId ? 'CUSTOMER_RECEIPT' : 'SUPPLIER_PAYMENT';
        const targetCurrency = target.documentCurrencyCode ?? target.currencyCode ?? '';
        const functionalCurrency = target.functionalCurrencyCode ?? entity.country.currencyCode;
        if (functionalCurrency !== entity.country.currencyCode) {
          throw new CashflowRequestError('La devise fonctionnelle de la facture ne correspond pas au profil pays.', 409);
        }
        const foreignCurrency = targetCurrency !== functionalCurrency;
        const supplierCredits = purchaseInvoiceId
          ? await transaction.supplierCreditNote.findMany({
            where: { entityId, sourceInvoiceId: purchaseInvoiceId, status: 'POSTED' },
            select: { documentTotalAmount: true, totalAmount: true, currencyCode: true },
          })
          : [];
        const credited = supplierCredits.reduce((totals, credit) => {
          const document = toMillimes(credit.documentTotalAmount);
          const carrying = toMillimes(credit.totalAmount);
          if (document === null || carrying === null || credit.currencyCode !== targetCurrency) {
            throw new CashflowRequestError('Un avoir fournisseur comptabilisé est invalide; le solde de la facture doit être contrôlé.', 409);
          }
          return { document: totals.document + document, carrying: totals.carrying + carrying };
        }, { document: 0, carrying: 0 });
        const supplierCreditApplications = purchaseInvoiceId
          ? await transaction.supplierCreditNoteApplication.findMany({
            where: { entityId, targetPurchaseInvoiceId: purchaseInvoiceId },
            select: { documentAmount: true, functionalAmount: true },
          })
          : [];
        const appliedCredits = supplierCreditApplications.reduce((totals, application) => {
          const document = toMillimes(application.documentAmount);
          const carrying = toMillimes(application.functionalAmount);
          if (document === null || carrying === null) {
            throw new CashflowRequestError('Une affectation d’avoir existante est invalide; le solde de la facture doit être contrôlé.', 409);
          }
          return { document: totals.document + document, carrying: totals.carrying + carrying };
        }, { document: 0, carrying: 0 });
        const requestedDocumentMillimes = typeof value.documentAmount === 'number'
          ? toMillimes(value.documentAmount)
          : null;
        const existingPayments = await transaction.cashflowPayment.findMany({
          where: { entityId, ...(invoiceId ? { invoiceId } : { purchaseInvoiceId }) },
          select: {
            amount: true,
            settledDocumentAmount: true,
            documentCurrencyCode: true,
            carryingAmount: true,
          },
        });
        const amountMillimes = Math.abs(signedMillimes);
        const paid = existingPayments.reduce((totals, payment) => {
          const amount = toMillimes(payment.amount);
          const documentAmount = payment.settledDocumentAmount === null
            ? (foreignCurrency ? null : amount)
            : toMillimes(payment.settledDocumentAmount);
          const carryingAmount = payment.carryingAmount === null ? amount : toMillimes(payment.carryingAmount);
          if (amount === null || documentAmount === null || carryingAmount === null
            || (payment.documentCurrencyCode && payment.documentCurrencyCode !== targetCurrency)) {
            throw new CashflowRequestError('Une allocation existante est invalide ou incomplète; le solde de la facture doit être contrôlé.', 409);
          }
          return {
            document: totals.document + documentAmount,
            carrying: totals.carrying + carryingAmount,
          };
        }, { document: 0, carrying: 0 });
        const originalDocumentTotal = toMillimes(target.documentTotalAmount ?? target.totalAmount);
        const originalFunctionalTotal = toMillimes(target.totalAmount);
        const creditedAgainstOpen = originalDocumentTotal === null || originalFunctionalTotal === null
          ? null
          : {
            document: Math.min(credited.document, Math.max(0, originalDocumentTotal - paid.document)) + appliedCredits.document,
            carrying: Math.min(credited.carrying, Math.max(0, originalFunctionalTotal - paid.carrying)) + appliedCredits.carrying,
          };
        const documentTotal = originalDocumentTotal === null || !creditedAgainstOpen
          ? null
          : originalDocumentTotal - creditedAgainstOpen.document;
        const functionalTotal = originalFunctionalTotal === null || !creditedAgainstOpen
          ? null
          : originalFunctionalTotal - creditedAgainstOpen.carrying;
        if (documentTotal === null || functionalTotal === null) {
          throw new CashflowRequestError('Les totaux document et fonctionnel de la facture doivent être précis au millime.', 409);
        }
        if (documentTotal < 0 || functionalTotal < 0
          || !Number.isSafeInteger(documentTotal) || !Number.isSafeInteger(functionalTotal)) {
          throw new CashflowRequestError('Les avoirs comptabilisés dépassent le total de la facture; le solde doit être contrôlé.', 409);
        }
        const documentAmountMillimes = foreignCurrency ? requestedDocumentMillimes : amountMillimes;
        if (foreignCurrency && (documentAmountMillimes === null || documentAmountMillimes <= 0)) {
          throw new CashflowRequestError('Saisissez le montant réglé dans la devise de la facture.', 400);
        }
        if (!foreignCurrency && requestedDocumentMillimes !== null && requestedDocumentMillimes !== amountMillimes) {
          throw new CashflowRequestError('Pour une facture dans la devise fonctionnelle, le montant document doit égaler le montant du relevé.', 409);
        }
        const settledDocumentMillimes = documentAmountMillimes ?? amountMillimes;
        const carryingMillimes = incoming ? counterpartTotals.credit : counterpartTotals.debit;
        if (paid.document + settledDocumentMillimes > documentTotal
          || paid.carrying + carryingMillimes > functionalTotal) {
          throw new CashflowRequestError('Le règlement dépasse le restant dû de la facture.', 409);
        }
        const effectiveFunctionalMillimes = amountMillimes;
        let realizedFxGainMillimes = 0;
        let realizedFxLossMillimes = 0;
        if (foreignCurrency) {
          const difference = effectiveFunctionalMillimes - carryingMillimes;
          if (incoming) {
            if (difference > 0) realizedFxGainMillimes = difference;
            else realizedFxLossMillimes = -difference;
          } else if (difference > 0) {
            realizedFxLossMillimes = difference;
          } else {
            realizedFxGainMillimes = -difference;
          }
        } else if (effectiveFunctionalMillimes !== carryingMillimes) {
          throw new CashflowRequestError('L’écriture ne rapproche pas le montant fonctionnel et les frais bancaires d’une facture sans conversion de devise.', 409);
        }
        const gainAccountCode = entity.country.realizedFxGainAccountCode;
        const lossAccountCode = entity.country.realizedFxLossAccountCode;
        if (foreignCurrency && (realizedFxGainMillimes > 0 || realizedFxLossMillimes > 0)) {
          if (!gainAccountCode || !lossAccountCode) {
            throw new CashflowRequestError('Configurez les comptes pays de gains et pertes de change réalisés avant ce règlement.', 409);
          }
          const fxAccounts = await transaction.chartOfAccount.findMany({
            where: { countryId: entity.countryId, code: { in: [gainAccountCode, lossAccountCode] } },
            select: { code: true, type: true, isPostingAllowed: true },
          });
          if (!fxAccounts.some((account) => account.code === gainAccountCode && account.type === 'Revenue' && account.isPostingAllowed)
            || !fxAccounts.some((account) => account.code === lossAccountCode && account.type === 'Expense' && account.isPostingAllowed)) {
            throw new CashflowRequestError('Les comptes pays de gains/pertes de change sont absents, non comptabilisables ou de type incorrect.', 409);
          }
        }
        const fxLineTotals = (accountCode: string | null) => accountCode
          ? journal.lines.filter((journalLine) => journalLine.accountCode === accountCode)
            .reduce((totals, journalLine) => {
              const debit = toMillimes(journalLine.debit);
              const credit = toMillimes(journalLine.credit);
              if (debit === null || credit === null) return { invalid: true, debit: totals.debit, credit: totals.credit };
              return { invalid: false, debit: totals.debit + debit, credit: totals.credit + credit };
            }, { invalid: false, debit: 0, credit: 0 })
          : { invalid: false, debit: 0, credit: 0 };
        const gainTotals = fxLineTotals(gainAccountCode);
        const lossTotals = fxLineTotals(lossAccountCode);
        if (gainTotals.invalid || lossTotals.invalid
          || gainTotals.debit !== 0 || gainTotals.credit !== realizedFxGainMillimes
          || lossTotals.debit !== realizedFxLossMillimes || lossTotals.credit !== 0) {
          throw new CashflowRequestError('Les lignes de gain/perte de change de l’écriture ne correspondent pas au montant réalisé.', 409);
        }
        const rate = amountMillimes / settledDocumentMillimes;
        if (!Number.isFinite(rate) || rate <= 0) {
          throw new CashflowRequestError('Le taux effectif issu du relevé ne peut pas être calculé.', 409);
        }
        const payment = await transaction.cashflowPayment.create({
          data: {
            entityId,
            statementLineId: line.id,
            invoiceId,
            purchaseInvoiceId,
            direction,
            amount: amountMillimes / 1000,
            currencyCode: line.currencyCode,
            settledDocumentAmount: settledDocumentMillimes / 1000,
            documentCurrencyCode: targetCurrency,
            carryingAmount: carryingMillimes / 1000,
            settlementExchangeRate: rate,
            settlementRateDate: line.transactionDate,
            settlementRateSource: 'BANK_STATEMENT',
            realizedFxGain: realizedFxGainMillimes / 1000,
            realizedFxLoss: realizedFxLossMillimes / 1000,
            paidAt: line.transactionDate,
            recordedByUserId: userId,
          },
          select: {
            id: true,
            direction: true,
            amount: true,
            currencyCode: true,
            settledDocumentAmount: true,
            documentCurrencyCode: true,
            carryingAmount: true,
            settlementExchangeRate: true,
            settlementRateDate: true,
            settlementRateSource: true,
            realizedFxGain: true,
            realizedFxLoss: true,
            paidAt: true,
          },
        });
        if (invoiceId && paid.document + settledDocumentMillimes === documentTotal && target.status !== 'PAID') {
          await transaction.invoice.update({ where: { id: invoiceId }, data: { status: 'PAID' } });
        }
        return { ...payment, remainingAmount: (documentTotal - paid.document - settledDocumentMillimes) / 1000 };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new CashflowRequestError('Cette opération ou cette allocation a déjà été enregistrée.', 409);
      }
      throw error;
    }
  }

  static async removePayment(paymentId: string, entityId: string) {
    return prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const payment = await transaction.cashflowPayment.findFirst({
        where: { id: paymentId, entityId },
        include: {
          statementLine: {
            include: {
              reconciliation: {
                include: { journalLine: { select: { journalEntryId: true } } },
              },
            },
          },
        },
      });
      if (!payment) throw new CashflowRequestError('Allocation de règlement introuvable pour cette société.', 404);
      if (payment.documentCurrencyCode && payment.documentCurrencyCode !== payment.currencyCode) {
        const originalEntryId = payment.statementLine.reconciliation?.journalLine.journalEntryId;
        const postedReversal = originalEntryId
          ? await transaction.journalEntry.findFirst({
            where: { reversesEntryId: originalEntryId, entityId, status: 'POSTED' },
            select: { id: true },
          })
          : null;
        if (!postedReversal) {
          throw new CashflowRequestError('Pour annuler une allocation en devise, contre-passez d’abord l’écriture rapprochée et faites valider sa contrepassation.', 409);
        }
      }
      await transaction.cashflowPayment.delete({ where: { id: payment.id } });
      if (payment.invoiceId) {
        const invoice = await transaction.invoice.findFirst({
          where: { id: payment.invoiceId, entityId },
          select: {
            totalAmount: true,
            documentTotalAmount: true,
            documentCurrencyCode: true,
            currencyCode: true,
            functionalCurrencyCode: true,
          },
        });
        if (!invoice) throw new CashflowRequestError('La facture de vente liée à l’allocation est introuvable.', 409);
        const remainingPayments = await transaction.cashflowPayment.findMany({
          where: { entityId, invoiceId: payment.invoiceId },
          select: { amount: true, settledDocumentAmount: true },
        });
        const paidDocumentMillimes = remainingPayments.reduce((total, item) => {
          const amount = item.settledDocumentAmount === null
            ? toMillimes(item.amount)
            : toMillimes(item.settledDocumentAmount);
          if (amount === null) throw new CashflowRequestError('Une allocation restante est invalide; le statut de la facture ne peut pas être recalculé.', 409);
          return total + amount;
        }, 0);
        const totalDocumentMillimes = toMillimes(invoice.documentTotalAmount ?? invoice.totalAmount);
        if (totalDocumentMillimes === null || paidDocumentMillimes > totalDocumentMillimes) {
          throw new CashflowRequestError('Le total document de la facture est invalide après annulation.', 409);
        }
        await transaction.invoice.updateMany({
          where: { id: payment.invoiceId, entityId, status: { in: ['ISSUED', 'PAID'] } },
          data: { status: paidDocumentMillimes === totalDocumentMillimes ? 'PAID' : 'ISSUED' },
        });
      }
      return { id: payment.id };
    });
  }

  static async listBankAccounts(entityId: string) {
    return prisma.bankAccount.findMany({
      where: { entityId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        currencyCode: true,
        ledgerAccountCode: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  static async createBankAccount(value: unknown, entityId: string) {
    const input = getAccountInput(value);
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { countryId: true },
    });
    if (!entity) throw new CashflowRequestError('Société introuvable.', 404);
    const account = await prisma.chartOfAccount.findFirst({
      where: {
        countryId: entity.countryId,
        code: input.ledgerAccountCode,
        type: 'Asset',
        isPostingAllowed: true,
      },
      select: { code: true },
    });
    if (!account) {
      throw new CashflowRequestError('Le compte général doit être un compte d’actif comptabilisable du plan pays de cette société.', 400);
    }

    try {
      return await prisma.bankAccount.create({
        data: { ...input, entityId },
        select: {
          id: true,
          name: true,
          currencyCode: true,
          ledgerAccountCode: true,
          isActive: true,
          createdAt: true,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new CashflowRequestError('Un compte bancaire porte déjà ce nom pour cette société.', 409);
      }
      throw error;
    }
  }

  static async listBankTransfers(entityId: string) {
    return prisma.bankTransfer.findMany({
      where: { entityId },
      orderBy: [{ transferredAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        amount: true,
        currencyCode: true,
        transferredAt: true,
        reference: true,
        description: true,
        createdByUserId: true,
        createdAt: true,
        sourceBankAccount: { select: { id: true, name: true, ledgerAccountCode: true } },
        destinationBankAccount: { select: { id: true, name: true, ledgerAccountCode: true } },
        postingJournalEntry: {
          select: { id: true, entryNumber: true, reference: true, status: true },
        },
      },
    });
  }

  static async createBankTransfer(
    value: unknown,
    entityId: string,
    actor: { id: string; username: string },
  ) {
    if (!isRecord(value)) throw new CashflowRequestError('Les données du virement sont invalides.', 400);
    const sourceBankAccountId = typeof value.sourceBankAccountId === 'string'
      ? value.sourceBankAccountId.trim()
      : '';
    const destinationBankAccountId = typeof value.destinationBankAccountId === 'string'
      ? value.destinationBankAccountId.trim()
      : '';
    const amountMillimes = toMillimes(value.amount);
    const transferredAtValue = typeof value.transferredAt === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(value.transferredAt)
      ? new Date(`${value.transferredAt}T00:00:00.000Z`)
      : null;
    const transferredAt = transferredAtValue
      && Number.isFinite(transferredAtValue.getTime())
      && transferredAtValue.toISOString().slice(0, 10) === value.transferredAt
      ? transferredAtValue
      : null;
    const reference = value.reference === undefined || value.reference === null
      ? null
      : typeof value.reference === 'string' && value.reference.trim().length <= 100
        ? value.reference.trim() || null
        : undefined;
    const description = typeof value.description === 'string' ? value.description.trim() : '';
    const idempotencyKey = typeof value.idempotencyKey === 'string' ? value.idempotencyKey.trim() : '';
    if (!sourceBankAccountId || !destinationBankAccountId
      || sourceBankAccountId === destinationBankAccountId
      || amountMillimes === null || amountMillimes <= 0
      || !transferredAt
      || reference === undefined
      || description.length < 5 || description.length > 500
      || idempotencyKey.length < 8 || idempotencyKey.length > 128
      || !actor.id.trim() || !actor.username.trim()) {
      throw new CashflowRequestError('Saisissez deux comptes distincts, un montant positif au millime, une date valide, un libellé et une clé de virement valides.', 400);
    }

    try {
      return await prisma.$transaction(async (transaction) => {
        const existing = await transaction.bankTransfer.findUnique({
          where: { entityId_idempotencyKey: { entityId, idempotencyKey } },
          select: {
            id: true,
            sourceBankAccountId: true,
            destinationBankAccountId: true,
            amount: true,
            transferredAt: true,
            reference: true,
            description: true,
          },
        });
        if (existing) {
          if (existing.sourceBankAccountId !== sourceBankAccountId
            || existing.destinationBankAccountId !== destinationBankAccountId
            || toMillimes(existing.amount) !== amountMillimes
            || existing.transferredAt.toISOString().slice(0, 10) !== transferredAt.toISOString().slice(0, 10)
            || existing.reference !== reference
            || existing.description !== description) {
            throw new CashflowRequestError('Cette clé d’idempotence est déjà utilisée pour un autre virement.', 409);
          }
          return transaction.bankTransfer.findUniqueOrThrow({
            where: { id: existing.id },
            include: {
              sourceBankAccount: { select: { id: true, name: true, ledgerAccountCode: true } },
              destinationBankAccount: { select: { id: true, name: true, ledgerAccountCode: true } },
              postingJournalEntry: { include: { lines: true } },
            },
          });
        }

        const entity = await transaction.entity.findUnique({
          where: { id: entityId },
          select: {
            countryId: true,
            country: { select: { currencyCode: true } },
          },
        });
        if (!entity) throw new CashflowRequestError('Société introuvable.', 404);
        const bankAccounts = await transaction.bankAccount.findMany({
          where: {
            entityId,
            isActive: true,
            id: { in: [sourceBankAccountId, destinationBankAccountId] },
          },
          select: { id: true, name: true, currencyCode: true, ledgerAccountCode: true },
        });
        const source = bankAccounts.find(({ id }) => id === sourceBankAccountId);
        const destination = bankAccounts.find(({ id }) => id === destinationBankAccountId);
        if (!source || !destination) {
          throw new CashflowRequestError('Les deux comptes bancaires doivent être actifs et appartenir à cette société.', 404);
        }
        if (source.currencyCode !== entity.country.currencyCode
          || destination.currencyCode !== entity.country.currencyCode) {
          throw new CashflowRequestError(
            `Les virements internes sont limités à la devise fonctionnelle ${entity.country.currencyCode}; les devises étrangères nécessitent une conversion explicitement documentée.`,
            422,
          );
        }
        const ledgerAccounts = await transaction.chartOfAccount.findMany({
          where: {
            countryId: entity.countryId,
            code: { in: [source.ledgerAccountCode, destination.ledgerAccountCode] },
          },
          select: { code: true, type: true, isPostingAllowed: true },
        });
        if ([source.ledgerAccountCode, destination.ledgerAccountCode].some((code) => !ledgerAccounts.some((account) => (
          account.code === code && account.type === 'Asset' && account.isPostingAllowed
        )))) {
          throw new CashflowRequestError('Les comptes de contrepartie doivent être des actifs comptabilisables du plan pays.', 422);
        }
        await assertAccountingPeriodOpen(
          transaction,
          entityId,
          transferredAt,
          (message) => new CashflowRequestError(message, 409),
        );

        const transferId = randomUUID();
        const entryNumber = `VIR-${randomUUID()}`;
        const journal = validateJournalEntry({
          entryNumber,
          entityId,
          date: transferredAt.toISOString().slice(0, 10),
          reference: `VIR-${transferId}`,
          description,
          lines: [
            {
              accountCode: destination.ledgerAccountCode,
              debit: amountMillimes / 1000,
              credit: 0,
              description: `Virement reçu — ${source.name} vers ${destination.name}`,
            },
            {
              accountCode: source.ledgerAccountCode,
              debit: 0,
              credit: amountMillimes / 1000,
              description: `Virement émis — ${source.name} vers ${destination.name}`,
            },
          ],
        });
        const postingJournalEntry = await transaction.journalEntry.create({
          data: {
            ...journal,
            date: transferredAt,
            status: 'POSTED',
            createdByUserId: actor.id,
            createdByUsername: actor.username,
            postedByUserId: actor.id,
            postedByUsername: actor.username,
            postedAt: new Date(),
            lines: { create: journal.lines },
          },
          select: { id: true, entryNumber: true, reference: true, status: true },
        });
        await appendJournalEntryAuditRecord(transaction, postingJournalEntry.id);
        return transaction.bankTransfer.create({
          data: {
            id: transferId,
            entityId,
            sourceBankAccountId,
            destinationBankAccountId,
            amount: amountMillimes / 1000,
            currencyCode: entity.country.currencyCode,
            transferredAt,
            reference,
            description,
            idempotencyKey,
            postingJournalEntryId: postingJournalEntry.id,
            createdByUserId: actor.id,
          },
          include: {
            sourceBankAccount: { select: { id: true, name: true, ledgerAccountCode: true } },
            destinationBankAccount: { select: { id: true, name: true, ledgerAccountCode: true } },
            postingJournalEntry: { include: { lines: true } },
          },
        });
      });
    } catch (error) {
      if (error instanceof CashflowRequestError) throw error;
      if (isUniqueConstraintError(error)) {
        const existing = await prisma.bankTransfer.findUnique({
          where: { entityId_idempotencyKey: { entityId, idempotencyKey } },
          include: {
            sourceBankAccount: { select: { id: true, name: true, ledgerAccountCode: true } },
            destinationBankAccount: { select: { id: true, name: true, ledgerAccountCode: true } },
            postingJournalEntry: { include: { lines: true } },
          },
        });
        if (existing) {
          if (existing.sourceBankAccountId !== sourceBankAccountId
            || existing.destinationBankAccountId !== destinationBankAccountId
            || toMillimes(existing.amount) !== amountMillimes
            || existing.transferredAt.toISOString().slice(0, 10) !== transferredAt.toISOString().slice(0, 10)
            || existing.reference !== reference
            || existing.description !== description) {
            throw new CashflowRequestError('Cette clé d’idempotence est déjà utilisée pour un autre virement.', 409);
          }
          return existing;
        }
      }
      throw error;
    }
  }

  static async importStatement(input: {
    bankAccountId: unknown;
    csv: unknown;
    importedByUserId?: string;
  }, entityId: string) {
    if (typeof input.bankAccountId !== 'string' || !input.bankAccountId.trim()) {
      throw new CashflowRequestError('Sélectionnez un compte bancaire.', 400);
    }
    if (typeof input.csv !== 'string') throw new CashflowRequestError('Le contenu CSV est obligatoire.', 400);
    const lines = parseBankStatementCsv(input.csv);
    const sourceHash = createHash('sha256').update(input.csv, 'utf8').digest('hex');
    const bankAccount = await prisma.bankAccount.findFirst({
      where: { id: input.bankAccountId, entityId, isActive: true },
      select: { id: true, currencyCode: true },
    });
    if (!bankAccount) throw new CashflowRequestError('Compte bancaire introuvable ou inactif pour cette société.', 404);
    const alreadyImported = await prisma.bankStatement.findUnique({
      where: { bankAccountId_sourceHash: { bankAccountId: bankAccount.id, sourceHash } },
      select: { id: true },
    });
    if (alreadyImported) throw new CashflowRequestError('Ce fichier a déjà été importé pour ce compte bancaire.', 409);

    const deduplicationKeys = lines.map((line) => buildBankLineDeduplicationKey({
      sourceHash,
      rowNumber: line.rowNumber,
      transactionDate: line.transactionDate,
      amountMillimes: line.amountMillimes,
      externalReference: line.externalReference,
    }));
    const duplicateKeys = new Set(deduplicationKeys.filter((key, index) => deduplicationKeys.indexOf(key) !== index));
    if (duplicateKeys.size > 0) {
      throw new CashflowRequestError('Le fichier contient plusieurs fois la même opération avec référence.', 409);
    }
    const existing = await prisma.bankStatementLine.findMany({
      where: { bankAccountId: bankAccount.id, deduplicationKey: { in: deduplicationKeys } },
      select: { deduplicationKey: true },
    });
    if (existing.length > 0) {
      throw new CashflowRequestError('Une ou plusieurs opérations référencées sont déjà présentes dans un autre relevé.', 409);
    }

    try {
      return await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
        const statement = await transaction.bankStatement.create({
          data: {
            entityId,
            bankAccountId: bankAccount.id,
            sourceHash,
            lineCount: lines.length,
            importedByUserId: input.importedByUserId,
          },
          select: { id: true, entityId: true, bankAccountId: true, lineCount: true, importedAt: true },
        });
        await transaction.bankStatementLine.createMany({
          data: lines.map((line, index) => ({
            entityId,
            bankAccountId: bankAccount.id,
            statementId: statement.id,
            rowNumber: line.rowNumber,
            transactionDate: line.transactionDate,
            description: line.description,
            amount: line.amount,
            balanceAfter: line.balanceAfter,
            currencyCode: bankAccount.currencyCode,
            externalReference: line.externalReference,
            deduplicationKey: deduplicationKeys[index],
          })),
        });
        return statement;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new CashflowRequestError('Ce relevé ou une de ses opérations existe déjà; aucune ligne n’a été importée.', 409);
      }
      throw error;
    }
  }

  static async listStatements(entityId: string) {
    return prisma.bankStatement.findMany({
      where: { entityId },
      orderBy: { importedAt: 'desc' },
      select: {
        id: true,
        lineCount: true,
        importedAt: true,
        bankAccount: { select: { id: true, name: true, currencyCode: true } },
      },
    });
  }

  static async listStatementLines(statementId: string, entityId: string) {
    const statement = await prisma.bankStatement.findFirst({
      where: { id: statementId, entityId },
      select: { id: true },
    });
    if (!statement) throw new CashflowRequestError('Relevé introuvable pour cette société.', 404);
    return prisma.bankStatementLine.findMany({
      where: { statementId, entityId },
      orderBy: [{ transactionDate: 'asc' }, { rowNumber: 'asc' }],
      select: {
        id: true,
        rowNumber: true,
        transactionDate: true,
        description: true,
        amount: true,
        balanceAfter: true,
        currencyCode: true,
        externalReference: true,
        reconciliation: { select: { id: true, reconciledAt: true } },
        cashflowPayment: {
          select: {
            id: true,
            direction: true,
            amount: true,
            currencyCode: true,
            settledDocumentAmount: true,
            documentCurrencyCode: true,
            carryingAmount: true,
            settlementExchangeRate: true,
            settlementRateDate: true,
            settlementRateSource: true,
            realizedFxGain: true,
            realizedFxLoss: true,
            invoice: { select: { invoiceNumber: true } },
            purchaseInvoice: { select: { invoiceNumber: true } },
          },
        },
      },
    });
  }

  static async getReconciliationCandidates(statementLineId: string, entityId: string) {
    const statementLine = await prisma.bankStatementLine.findFirst({
      where: { id: statementLineId, entityId },
      include: {
        bankAccount: {
          include: { entity: { select: { countryId: true, country: { select: { currencyCode: true } } } } },
        },
        reconciliation: { select: { id: true } },
      },
    });
    if (!statementLine) throw new CashflowRequestError('Opération de relevé introuvable pour cette société.', 404);
    if (statementLine.reconciliation) throw new CashflowRequestError('Cette opération est déjà rapprochée.', 409);
    if (statementLine.currencyCode !== statementLine.bankAccount.entity.country.currencyCode) {
      throw new CashflowRequestError('Le rapprochement automatique est indisponible pour une devise différente de la devise fonctionnelle.', 409);
    }
    const dayStart = new Date(Date.UTC(
      statementLine.transactionDate.getUTCFullYear(),
      statementLine.transactionDate.getUTCMonth(),
      statementLine.transactionDate.getUTCDate(),
    ));
    const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const [account, journalLines] = await Promise.all([
      prisma.chartOfAccount.findFirst({
        where: {
          countryId: statementLine.bankAccount.entity.countryId,
          code: statementLine.bankAccount.ledgerAccountCode,
          type: 'Asset',
          isPostingAllowed: true,
        },
        select: { code: true },
      }),
      prisma.journalLine.findMany({
        where: {
          accountCode: statementLine.bankAccount.ledgerAccountCode,
          journalEntry: { entityId, status: 'POSTED', date: { gte: dayStart, lt: nextDay } },
        },
        orderBy: { journalEntry: { date: 'asc' } },
        select: {
          id: true,
          debit: true,
          credit: true,
          description: true,
          journalEntry: { select: { entryNumber: true, date: true, description: true } },
        },
      }),
    ]);
    if (!account) throw new CashflowRequestError('Le compte général du compte bancaire n’est plus comptabilisable dans le plan pays.', 409);
    const journalLineIds = journalLines.map((line) => line.id);
    const matched = journalLineIds.length === 0
      ? []
      : await prisma.bankReconciliation.findMany({
        where: { entityId, journalLineId: { in: journalLineIds } },
        select: { journalLineId: true },
      });
    const matchedIds = new Set(matched.map((item) => item.journalLineId));
    const statementMillimes = toMillimes(statementLine.amount);
    if (statementMillimes === null) throw new CashflowRequestError('Le montant du relevé n’est pas précis au millime.', 409);
    const candidates = journalLines.filter((line) => {
      if (matchedIds.has(line.id)) return false;
      const debit = toMillimes(line.debit);
      const credit = toMillimes(line.credit);
      return debit !== null
        && credit !== null
        && debit >= 0
        && credit >= 0
        && (debit > 0 || credit > 0)
        && !(debit > 0 && credit > 0)
        && debit - credit === statementMillimes;
    }).map((line) => {
      const statementLabel = normalizeBankLabel(statementLine.description);
      const journalLabel = normalizeBankLabel(line.description ?? line.journalEntry.description);
      const labelMatch = statementLabel.length > 0 && statementLabel === journalLabel;
      return {
        ...line,
        labelMatch,
        suggestionReason: labelMatch
         ? 'Montant, date et compte exacts; libellé identique après normalisation.'
         : 'Montant, date et compte exacts; libellé différent, à vérifier manuellement.',
      };
    }).sort((left, right) => Number(right.labelMatch) - Number(left.labelMatch));
    return {
      statementLine: {
        id: statementLine.id,
        transactionDate: statementLine.transactionDate,
        description: statementLine.description,
        amount: statementLine.amount,
        currencyCode: statementLine.currencyCode,
      },
      candidates,
    };
  }

  static async reconcile(input: { statementLineId: unknown; journalLineId: unknown; userId?: string }, entityId: string) {
    if (typeof input.statementLineId !== 'string' || typeof input.journalLineId !== 'string') {
      throw new CashflowRequestError('Les identifiants du relevé et du grand livre sont obligatoires.', 400);
    }
    try {
      return await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
        const statementLine = await transaction.bankStatementLine.findFirst({
          where: { id: input.statementLineId as string, entityId },
          include: {
            bankAccount: {
              include: { entity: { select: { countryId: true, country: { select: { currencyCode: true } } } } },
            },
            reconciliation: { select: { id: true } },
          },
        });
        const journalLine = await transaction.journalLine.findFirst({
          where: {
            id: input.journalLineId as string,
            journalEntry: { entityId, status: 'POSTED' },
          },
          include: { journalEntry: { select: { date: true } } },
        });
        if (!statementLine || !journalLine) throw new CashflowRequestError('Opération de relevé ou ligne comptable introuvable pour cette société.', 404);
        if (statementLine.reconciliation) throw new CashflowRequestError('Cette opération de relevé est déjà rapprochée.', 409);
        if (statementLine.currencyCode !== statementLine.bankAccount.entity.country.currencyCode) {
          throw new CashflowRequestError('Le rapprochement exige actuellement la devise fonctionnelle de la société.', 409);
        }
        if (journalLine.accountCode !== statementLine.bankAccount.ledgerAccountCode) {
          throw new CashflowRequestError('La ligne comptable n’utilise pas le compte général associé à ce compte bancaire.', 409);
        }
        const statementDate = statementLine.transactionDate.toISOString().slice(0, 10);
        const journalDate = journalLine.journalEntry.date.toISOString().slice(0, 10);
        const amountMillimes = toMillimes(statementLine.amount);
        const debit = toMillimes(journalLine.debit);
        const credit = toMillimes(journalLine.credit);
        if (
          statementDate !== journalDate
          || amountMillimes === null
          || debit === null
          || credit === null
          || debit < 0
          || credit < 0
          || (debit === 0 && credit === 0)
          || (debit > 0 && credit > 0)
          || debit - credit !== amountMillimes
        ) {
          throw new CashflowRequestError('Date et montant signés doivent correspondre exactement au millime entre relevé et écriture.', 409);
        }
        const chartAccount = await transaction.chartOfAccount.findFirst({
          where: {
            countryId: statementLine.bankAccount.entity.countryId,
            code: statementLine.bankAccount.ledgerAccountCode,
            type: 'Asset',
            isPostingAllowed: true,
          },
          select: { code: true },
        });
        if (!chartAccount) throw new CashflowRequestError('Le compte général du rapprochement est absent ou non comptabilisable.', 409);
        const existing = await transaction.bankReconciliation.findFirst({
          where: {
            entityId,
            OR: [{ statementLineId: statementLine.id }, { journalLineId: journalLine.id }],
          },
          select: { id: true },
        });
        if (existing) throw new CashflowRequestError('Cette opération bancaire ou cette ligne comptable est déjà rapprochée.', 409);
        return transaction.bankReconciliation.create({
          data: {
            entityId,
            statementLineId: statementLine.id,
            journalLineId: journalLine.id,
            reconciledByUserId: input.userId,
          },
          select: { id: true, statementLineId: true, journalLineId: true, reconciledAt: true },
        });
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new CashflowRequestError('Une opération ou écriture a été rapprochée simultanément; rechargez le relevé.', 409);
      }
      throw error;
    }
  }

  static async removeReconciliation(reconciliationId: string, entityId: string) {
    const reconciliation = await prisma.bankReconciliation.findFirst({
      where: { id: reconciliationId, entityId },
      select: { statementLine: { select: { cashflowPayment: { select: { id: true } } } } },
    });
    if (reconciliation?.statementLine.cashflowPayment) {
      throw new CashflowRequestError('Annulez d’abord l’allocation du règlement avant de retirer son rapprochement.', 409);
    }
    const result = await prisma.bankReconciliation.deleteMany({
      where: { id: reconciliationId, entityId },
    });
    if (result.count === 0) throw new CashflowRequestError('Rapprochement introuvable pour cette société.', 404);
    return { id: reconciliationId };
  }
}

export default CashflowBankingService;
