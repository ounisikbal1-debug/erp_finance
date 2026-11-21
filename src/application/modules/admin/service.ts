import prisma from '../../../core/models/prisma';
import { isFinancialAccountCategory } from '../advanced-finance/financial-categories';
import {
  CountryConfigurationValidationError,
  validateCountryProfileUpdate,
  validateCountryCreation,
  validatePayrollConfig,
  validateCompletePayrollConfig,
  validatePayrollTaxBrackets,
  validateTaxRates,
} from './country-configuration';
import {
  validateCountryAccountHierarchy,
  validateCountryAccounts,
  type CountryAccountInput,
} from './chart-of-accounts-configuration';
import {
  assertRevisionPeriodDoesNotOverlap,
  getSupersededRevisionEndDate,
  RegulatoryRevisionValidationError,
  validateRegulatoryRevisionInput,
  validateRevisionTransition,
} from './regulatory-revisions';

export class AdminCountryNotFoundError extends Error {
  constructor(code: string) {
    super(`Pays introuvable pour le code ${code}`);
    this.name = 'AdminCountryNotFoundError';
  }
}

export class AdminRegulatoryRevisionNotFoundError extends Error {
  constructor() {
    super('Version réglementaire introuvable pour ce pays.');
    this.name = 'AdminRegulatoryRevisionNotFoundError';
  }
}

export class AdminLocalizationService {
  /**
   * Lister tous les pays configurés
   */
  static async listCountries() {
    return await prisma.countryProfile.findMany({
      include: {
        payrollConfig: true,
        taxRates: true,
        taxBrackets: { orderBy: { order: 'asc' } },
      },
      orderBy: { code: 'asc' },
    });
  }

  /**
   * Obtenir la configuration détaillée d'un pays
   */
  static async getCountryByCode(code: string) {
    const country = await prisma.countryProfile.findUnique({
      where: { code },
      include: {
        payrollConfig: true,
        taxRates: true,
        taxBrackets: { orderBy: { order: 'asc' } },
        accounts: {
          include: { parent: { select: { code: true } } },
          orderBy: [{ classNumber: 'asc' }, { code: 'asc' }],
        },
      },
    });
    if (!country) throw new AdminCountryNotFoundError(code);
    return {
      ...country,
      accounts: country.accounts.map(({ parent, parentId: _parentId, ...account }) => ({
        ...account,
        parentCode: parent?.code ?? null,
      })),
    };
  }

  /**
   * Mettre à jour les paramètres généraux et fiscaux d'un pays
   */
  static async updateCountryProfile(code: string, data: {
    name?: string;
    currencyCode?: string;
    currencySymbol?: string;
    stampDuty?: number | null;
    corporateTax?: number | null;
    salesReceivableAccountCode?: string | null;
    salesRevenueAccountCode?: string | null;
    salesVatAccountCode?: string | null;
    salesStampDutyAccountCode?: string | null;
    stockAssetAccountCode?: string | null;
    stockAdjustmentAccountCode?: string | null;
    productionWipAccountCode?: string | null;
    productionLaborAccountCode?: string | null;
    productionOverheadAccountCode?: string | null;
    purchaseExpenseAccountCode?: string | null;
    purchaseVatAccountCode?: string | null;
    realizedFxGainAccountCode?: string | null;
    realizedFxLossAccountCode?: string | null;
    unrealizedFxGainAccountCode?: string | null;
    unrealizedFxLossAccountCode?: string | null;
    isDefault?: boolean;
  }) {
    const update = validateCountryProfileUpdate(data);
    return prisma.$transaction(async (tx) => {
      const country = await tx.countryProfile.findUnique({
        where: { code },
        select: { id: true },
      });
      if (!country) throw new AdminCountryNotFoundError(code);
      const fxAccountTypes = new Map<string, string>([
        ...(update.realizedFxGainAccountCode ? [[update.realizedFxGainAccountCode, 'Revenue'] as const] : []),
        ...(update.realizedFxLossAccountCode ? [[update.realizedFxLossAccountCode, 'Expense'] as const] : []),
        ...(update.unrealizedFxGainAccountCode ? [[update.unrealizedFxGainAccountCode, 'Revenue'] as const] : []),
        ...(update.unrealizedFxLossAccountCode ? [[update.unrealizedFxLossAccountCode, 'Expense'] as const] : []),
      ]);
      const productionCostAccountCodes = [
        update.productionLaborAccountCode,
        update.productionOverheadAccountCode,
      ].filter((accountCode): accountCode is string => Boolean(accountCode));
      const gainCodes = [update.realizedFxGainAccountCode, update.unrealizedFxGainAccountCode].filter(Boolean);
      const lossCodes = [update.realizedFxLossAccountCode, update.unrealizedFxLossAccountCode].filter(Boolean);
      if (gainCodes.some((accountCode) => lossCodes.includes(accountCode))) {
        throw new CountryConfigurationValidationError('Les comptes de gains et pertes de change doivent être distincts.');
      }
      if (fxAccountTypes.size) {
        const accounts = await tx.chartOfAccount.findMany({
          where: { countryId: country.id, code: { in: [...fxAccountTypes.keys()] } },
          select: { code: true, type: true, isPostingAllowed: true },
        });
        if ([...fxAccountTypes].some(([accountCode, type]) => !accounts.some((account) => (
          account.code === accountCode && account.type === type && account.isPostingAllowed
        )))) {
          throw new CountryConfigurationValidationError('Les comptes de change doivent appartenir au plan pays, être comptabilisables et de type gain (Revenue) ou charge (Expense).');
        }
        if (productionCostAccountCodes.length > 0) {
          const accounts = await tx.chartOfAccount.findMany({
            where: { countryId: country.id, code: { in: productionCostAccountCodes } },
            select: { code: true, type: true, isPostingAllowed: true },
          });
          if (productionCostAccountCodes.some((accountCode) => !accounts.some((account) => (
            account.code === accountCode && account.type === 'Expense' && account.isPostingAllowed
          )))) {
            throw new CountryConfigurationValidationError('Les comptes de main-d’œuvre et de frais indirects doivent être des charges comptabilisables du plan pays.');
          }
          if (new Set(productionCostAccountCodes).size !== productionCostAccountCodes.length) {
            throw new CountryConfigurationValidationError('Les comptes de main-d’œuvre et de frais indirects doivent être distincts.');
          }
        }
      }
      if (update.isDefault) await tx.countryProfile.updateMany({ data: { isDefault: false } });
      return tx.countryProfile.update({
        where: { code },
        data: update,
      });
    });
  }

  /**
   * Mettre à jour la configuration sociale et de paie
   */
  static async updatePayrollConfig(code: string, data: unknown) {
    const country = await prisma.countryProfile.findUnique({
      where: { code },
      include: { payrollConfig: true },
    });
    if (!country) throw new AdminCountryNotFoundError(code);

    const update = country.payrollConfig
      ? validatePayrollConfig(data)
      : validateCompletePayrollConfig(data);
    return await prisma.payrollConfig.upsert({
      where: { countryId: country.id },
      update,
      create: { ...update, countryId: country.id },
    });
  }

  /**
   * Mettre à jour ou remplacer les tranches de l'IRPP
   */
  static async updateTaxBrackets(code: string, input: unknown) {
    const country = await prisma.countryProfile.findUnique({ where: { code } });
    if (!country) throw new AdminCountryNotFoundError(code);

    const brackets = validatePayrollTaxBrackets(input);
    return prisma.$transaction(async (tx) => {
      await tx.payrollTaxBracket.deleteMany({ where: { countryId: country.id } });
      await tx.payrollTaxBracket.createMany({
        data: brackets.map((bracket) => ({ ...bracket, countryId: country.id })),
      });
      return tx.payrollTaxBracket.findMany({
        where: { countryId: country.id },
        orderBy: { order: 'asc' },
      });
    });
  }

  static async updateTaxRates(code: string, input: unknown) {
    const country = await prisma.countryProfile.findUnique({ where: { code } });
    if (!country) throw new AdminCountryNotFoundError(code);

    const rates = validateTaxRates(input);
    return prisma.$transaction(async (tx) => {
      await tx.taxRate.deleteMany({ where: { countryId: country.id } });
      await tx.taxRate.createMany({
        data: rates.map((rate) => ({ ...rate, countryId: country.id })),
      });
      return tx.taxRate.findMany({
        where: { countryId: country.id },
        orderBy: { code: 'asc' },
      });
    });
  }

  static async updateCountryAccounts(code: string, input: unknown) {
    const country = await prisma.countryProfile.findUnique({ where: { code } });
    if (!country) throw new AdminCountryNotFoundError(code);

    const accounts = validateCountryAccounts(input);
    return prisma.$transaction(async (tx) => {
      const existing = await tx.chartOfAccount.findMany({
        where: { countryId: country.id },
        include: { parent: { select: { code: true } } },
      });
      const currentByCode = new Map(existing.map((account) => [account.code.toUpperCase(), account]));
      const mergedByCode = new Map<string, CountryAccountInput>();
      for (const account of existing) {
        let financialCategory: CountryAccountInput['financialCategory'] = null;
        if (account.financialCategory !== null) {
          if (!isFinancialAccountCategory(account.financialCategory)) {
            throw new Error(`Catégorie financière invalide sur le compte ${account.code}.`);
          }
          financialCategory = account.financialCategory;
        }
        mergedByCode.set(account.code.toUpperCase(), {
          code: account.code,
          description: account.description,
          classNumber: account.classNumber,
          type: account.type as CountryAccountInput['type'],
          financialCategory,
          parentCode: account.parent?.code ?? null,
          isPostingAllowed: account.isPostingAllowed,
        });
      }
      for (const account of accounts) {
        const key = account.code.toUpperCase();
        const current = currentByCode.get(key);
        const existingConfiguration = mergedByCode.get(key);
        mergedByCode.set(account.code.toUpperCase(), {
          code: account.code,
          description: account.description,
          classNumber: account.classNumber,
          type: account.type,
          financialCategory: account.financialCategory === undefined
            ? existingConfiguration?.financialCategory ?? null
            : account.financialCategory,
          parentCode: account.parentCode === undefined ? current?.parent?.code ?? null : account.parentCode,
          isPostingAllowed: account.isPostingAllowed ?? current?.isPostingAllowed ?? true,
        });
      }
      const mergedAccounts = [...mergedByCode.values()];
      validateCountryAccountHierarchy(mergedAccounts);
      const parentIdsByCode = new Map(existing.map((account) => [account.code.toUpperCase(), account.id]));
      const accountsByCode = new Map(mergedAccounts.map((account) => [account.code.toUpperCase(), account]));
      const accountDepth = (account: CountryAccountInput): number => {
        let depth = 0;
        let parentCode = account.parentCode;
        while (parentCode) {
          depth += 1;
          parentCode = accountsByCode.get(parentCode.toUpperCase())?.parentCode ?? null;
        }
        return depth;
      };
      const orderedAccounts = [...accounts].sort((a, b) => accountDepth(a) - accountDepth(b));
      for (const account of orderedAccounts) {
        const parentCode = mergedByCode.get(account.code.toUpperCase())?.parentCode;
        const parentId = parentCode ? parentIdsByCode.get(parentCode.toUpperCase()) : null;
        if (parentCode && !parentId) {
          const createdParent = await tx.chartOfAccount.findUnique({
            where: { countryId_code: { countryId: country.id, code: parentCode } },
            select: { id: true },
          });
          if (!createdParent) {
            throw new CountryConfigurationValidationError(`Le compte parent ${parentCode} est introuvable dans ce pays.`);
          }
          parentIdsByCode.set(parentCode.toUpperCase(), createdParent.id);
        }
        const resolvedParentId = parentCode ? parentIdsByCode.get(parentCode.toUpperCase()) : null;
        const saved = await tx.chartOfAccount.upsert({
          where: { countryId_code: { countryId: country.id, code: account.code } },
          update: {
            description: account.description,
            classNumber: account.classNumber,
            type: account.type,
            ...(account.financialCategory !== undefined ? { financialCategory: account.financialCategory } : {}),
            ...(account.parentCode !== undefined ? { parentId: resolvedParentId } : {}),
            ...(account.isPostingAllowed !== undefined ? { isPostingAllowed: account.isPostingAllowed } : {}),
          },
          create: {
            code: account.code,
            description: account.description,
            classNumber: account.classNumber,
            type: account.type,
            financialCategory: account.financialCategory ?? null,
            countryId: country.id,
            parentId: account.parentCode ? resolvedParentId : null,
            isPostingAllowed: account.isPostingAllowed ?? true,
          },
        });
        parentIdsByCode.set(account.code.toUpperCase(), saved.id);
      }
      const updatedAccounts = await tx.chartOfAccount.findMany({
        where: { countryId: country.id },
        include: { parent: { select: { code: true } } },
        orderBy: [{ classNumber: 'asc' }, { code: 'asc' }],
      });
      return updatedAccounts.map(({ parent, parentId: _parentId, ...account }) => ({
        ...account,
        parentCode: parent?.code ?? null,
      }));
    });
  }

  static async listRegulatoryRevisions(code: string) {
    const country = await prisma.countryProfile.findUnique({ where: { code }, select: { id: true } });
    if (!country) throw new AdminCountryNotFoundError(code);
    return prisma.countryRegulatoryRevision.findMany({
      where: { countryId: country.id },
      orderBy: [{ configType: 'asc' }, { version: 'desc' }],
    });
  }

  static async createRegulatoryRevision(code: string, metadata: unknown, createdBy: string) {
    const country = await prisma.countryProfile.findUnique({
      where: { code },
      include: {
        payrollConfig: true,
        taxRates: { orderBy: { code: 'asc' } },
        taxBrackets: { orderBy: { order: 'asc' } },
        accounts: { orderBy: [{ classNumber: 'asc' }, { code: 'asc' }] },
        payrollRubriques: { orderBy: { code: 'asc' } },
      },
    });
    if (!country) throw new AdminCountryNotFoundError(code);
    if (!createdBy.trim()) throw new RegulatoryRevisionValidationError('Identifiant de création manquant.');
    const revision = validateRegulatoryRevisionInput(metadata);

    let snapshot: unknown;
    switch (revision.configType) {
      case 'PROFILE':
        snapshot = {
          code: country.code,
          name: country.name,
          currencyCode: country.currencyCode,
          currencySymbol: country.currencySymbol,
          stampDuty: country.stampDuty,
          corporateTax: country.corporateTax,
          isDefault: country.isDefault,
        };
        break;
      case 'TAX':
        snapshot = {
          corporateTax: country.corporateTax,
          stampDuty: country.stampDuty,
          taxRates: country.taxRates,
        };
        break;
      case 'PAYROLL':
        snapshot = {
          payrollConfig: country.payrollConfig,
          taxBrackets: country.taxBrackets,
          countryRubriques: country.payrollRubriques,
          legacyTunisiaRubriques: country.code === 'TN'
            ? await prisma.payrollRubrique.findMany({ orderBy: { code: 'asc' } })
            : [],
        };
        break;
      case 'ACCOUNTING':
        snapshot = {
          accounts: country.accounts,
          salesAccountMapping: {
            receivableAccountCode: country.salesReceivableAccountCode,
            revenueAccountCode: country.salesRevenueAccountCode,
            vatAccountCode: country.salesVatAccountCode,
            stampDutyAccountCode: country.salesStampDutyAccountCode,
          },
          stockAccountMapping: {
            stockAssetAccountCode: country.stockAssetAccountCode,
            stockAdjustmentAccountCode: country.stockAdjustmentAccountCode,
            productionWipAccountCode: country.productionWipAccountCode,
          },
          purchaseAccountMapping: {
            purchaseExpenseAccountCode: country.purchaseExpenseAccountCode,
            purchaseVatAccountCode: country.purchaseVatAccountCode,
          },
          realizedFxAccountMapping: {
            realizedFxGainAccountCode: country.realizedFxGainAccountCode,
            realizedFxLossAccountCode: country.realizedFxLossAccountCode,
          },
        };
        break;
    }

    return prisma.$transaction(async (tx) => {
      const existingRevisions = await tx.countryRegulatoryRevision.findMany({
        where: {
          countryId: country.id,
          configType: revision.configType,
          status: { not: 'REJECTED' },
        },
        select: { id: true, effectiveFrom: true, effectiveTo: true, status: true },
      });
      const superseded = revision.supersedesRevisionId
        ? existingRevisions.find(({ id }) => id === revision.supersedesRevisionId)
        : undefined;
      if (revision.supersedesRevisionId && !superseded) {
        throw new RegulatoryRevisionValidationError('La version à remplacer est introuvable pour ce pays et ce domaine.');
      }
      const replacementEndDate = superseded
        ? getSupersededRevisionEndDate(superseded, revision.effectiveFrom)
        : null;
      assertRevisionPeriodDoesNotOverlap(
        revision,
        existingRevisions.filter(({ id }) => id !== superseded?.id),
      );
      const current = await tx.countryRegulatoryRevision.aggregate({
        where: { countryId: country.id, configType: revision.configType },
        _max: { version: true },
      });
      if (superseded && replacementEndDate && revision.supersedesRevisionId && revision.closureNote) {
        await tx.countryRegulatoryRevision.update({
          where: { id: superseded.id },
          data: {
            effectiveTo: replacementEndDate,
            periodClosedAt: new Date(),
            periodClosedBy: createdBy.trim(),
            periodClosureNote: revision.closureNote,
          },
        });
      }
      return tx.countryRegulatoryRevision.create({
        data: {
          countryId: country.id,
          configType: revision.configType,
          version: (current._max.version ?? 0) + 1,
          effectiveFrom: revision.effectiveFrom,
          effectiveTo: revision.effectiveTo,
          source: revision.source,
          status: 'DRAFT',
          snapshot: JSON.stringify(snapshot),
          createdBy: createdBy.trim(),
          retroactiveConfirmed: revision.retroactiveConfirmed,
        },
      });
    });
  }

  static async transitionRegulatoryRevision(
    code: string,
    revisionId: string,
    nextStatus: unknown,
    reviewer: string,
    reviewNote: unknown,
  ) {
    const country = await prisma.countryProfile.findUnique({ where: { code }, select: { id: true } });
    if (!country) throw new AdminCountryNotFoundError(code);
    return prisma.$transaction(async (tx) => {
      const revision = await tx.countryRegulatoryRevision.findFirst({
        where: { id: revisionId, countryId: country.id },
      });
      if (!revision) throw new AdminRegulatoryRevisionNotFoundError();
      const transition = validateRevisionTransition(
        revision.status,
        nextStatus,
        reviewer,
        reviewNote,
        revision.createdBy,
        revision.reviewer,
      );
      return tx.countryRegulatoryRevision.update({
        where: { id: revision.id },
        data: {
          status: transition.status,
          ...(transition.status === 'APPROVED'
            ? {
              approvedBy: transition.reviewer,
              approvalNote: transition.reviewNote,
              approvedAt: new Date(),
            }
            : {
              reviewer: transition.reviewer,
              reviewNote: transition.reviewNote,
              reviewedAt: new Date(),
            }),
        },
      });
    });
  }

  /**
   * Créer un nouveau pays dans le système (ex: France, Algérie, etc.)
   */
  static async createCountry(data: unknown) {
    const countryInput = validateCountryCreation(data);
    const country = await prisma.$transaction(async (tx) => tx.countryProfile.create({
      data: {
        code: countryInput.code,
        name: countryInput.name,
        currencyCode: countryInput.currencyCode,
        currencySymbol: countryInput.currencySymbol,
        stampDuty: countryInput.stampDuty,
        corporateTax: countryInput.corporateTax,
        ...(countryInput.payrollConfig ? { payrollConfig: { create: countryInput.payrollConfig } } : {}),
        ...(countryInput.taxRates ? { taxRates: { create: countryInput.taxRates } } : {}),
        ...(countryInput.taxBrackets ? { taxBrackets: { create: countryInput.taxBrackets } } : {}),
      },
    }));
    return this.getCountryByCode(country.code);
  }
}

export default AdminLocalizationService;
