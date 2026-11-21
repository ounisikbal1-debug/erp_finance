import {
  financialCategoryMatchesAccountType,
  isFinancialAccountCategory,
  type FinancialAccountCategory,
} from '../advanced-finance/financial-categories';
import { CountryConfigurationValidationError } from './country-configuration';

export interface CountryAccountInput {
  code: string;
  description: string;
  classNumber: number;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  financialCategory?: FinancialAccountCategory | null;
  parentCode?: string | null;
  isPostingAllowed?: boolean;
}

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as const;
const ACCOUNT_FIELDS = ['code', 'description', 'classNumber', 'type', 'financialCategory', 'parentCode', 'isPostingAllowed'] as const;

function getAccountInput(value: unknown, index: number): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CountryConfigurationValidationError(`Le compte ${index + 1} doit être un objet.`);
  }
  const input = value as Record<string, unknown>;
  const unknownFields = Object.keys(input).filter((field) => !(ACCOUNT_FIELDS as readonly string[]).includes(field));
  if (unknownFields.length > 0) {
    throw new CountryConfigurationValidationError(`Le compte ${index + 1} contient des champs inconnus : ${unknownFields.join(', ')}.`);
  }
  return input;
}

export function validateCountryAccounts(value: unknown): CountryAccountInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CountryConfigurationValidationError('La configuration doit contenir au moins un compte.');
  }
  const accounts = value.map((item, index) => {
    const input = getAccountInput(item, index);
    if (typeof input.code !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/.test(input.code.trim())) {
      throw new CountryConfigurationValidationError(`Le code du compte ${index + 1} est invalide.`);
    }
    if (typeof input.description !== 'string' || !input.description.trim() || input.description.trim().length > 180) {
      throw new CountryConfigurationValidationError(`Le libellé du compte ${index + 1} est obligatoire et limité à 180 caractères.`);
    }
    if (!Number.isSafeInteger(input.classNumber) || (input.classNumber as number) < 1 || (input.classNumber as number) > 9) {
      throw new CountryConfigurationValidationError(`La classe du compte ${index + 1} doit être un entier de 1 à 9.`);
    }
    if (!(ACCOUNT_TYPES as readonly unknown[]).includes(input.type)) {
      throw new CountryConfigurationValidationError(`Le type du compte ${index + 1} est invalide.`);
    }
    const account: CountryAccountInput = {
      code: input.code.trim(),
      description: input.description.trim(),
      classNumber: input.classNumber as number,
      type: input.type as CountryAccountInput['type'],
    };
    if ('financialCategory' in input) {
      if (input.financialCategory === null) {
        account.financialCategory = null;
      } else if (!isFinancialAccountCategory(input.financialCategory)) {
        throw new CountryConfigurationValidationError(`La catégorie financière du compte ${index + 1} est invalide.`);
      } else {
        if (!financialCategoryMatchesAccountType(input.financialCategory, account.type)) {
          throw new CountryConfigurationValidationError(`La catégorie financière du compte ${index + 1} ne correspond pas à son type comptable.`);
        }
        account.financialCategory = input.financialCategory;
      }
    }
    if ('parentCode' in input) {
      if (input.parentCode !== null
        && (typeof input.parentCode !== 'string'
          || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/.test(input.parentCode.trim()))) {
        throw new CountryConfigurationValidationError(`Le compte parent du compte ${index + 1} est invalide.`);
      }
      account.parentCode = typeof input.parentCode === 'string' ? input.parentCode.trim() : null;
    }
    if ('isPostingAllowed' in input) {
      if (typeof input.isPostingAllowed !== 'boolean') {
        throw new CountryConfigurationValidationError(`Le statut comptabilisable du compte ${index + 1} est invalide.`);
      }
      account.isPostingAllowed = input.isPostingAllowed;
    }
    return account;
  });
  const codes = new Set(accounts.map((account) => account.code.toUpperCase()));
  if (codes.size !== accounts.length) {
    throw new CountryConfigurationValidationError('Les codes de compte doivent être uniques sans distinction de casse.');
  }
  return accounts;
}

export function validateCountryAccountHierarchy(accounts: readonly CountryAccountInput[]): void {
  const accountsByCode = new Map(accounts.map((account) => [account.code.toUpperCase(), account]));
  for (const account of accounts) {
    const parentCode = account.parentCode?.trim();
    if (!parentCode) continue;
    const parent = accountsByCode.get(parentCode.toUpperCase());
    if (!parent) {
      throw new CountryConfigurationValidationError(
        `Le compte parent ${parentCode} du compte ${account.code} est introuvable dans ce pays.`,
      );
    }
    if (parent.code.toUpperCase() === account.code.toUpperCase()) {
      throw new CountryConfigurationValidationError(`Le compte ${account.code} ne peut pas être son propre parent.`);
    }
    if (parent.classNumber !== account.classNumber || parent.type !== account.type) {
      throw new CountryConfigurationValidationError(`Le compte parent ${parent.code} doit appartenir à la même classe et au même type que ${account.code}.`);
    }
    if (parent.isPostingAllowed !== false) {
      throw new CountryConfigurationValidationError(`Le compte parent ${parent.code} doit être non comptabilisable.`);
    }
  }

  const visited = new Set<string>();
  const visit = (account: CountryAccountInput, ancestors: Set<string>) => {
    const key = account.code.toUpperCase();
    if (ancestors.has(key)) {
      throw new CountryConfigurationValidationError(`La hiérarchie des comptes contient une boucle à ${account.code}.`);
    }
    if (visited.has(key)) return;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(key);
    const parent = account.parentCode ? accountsByCode.get(account.parentCode.toUpperCase()) : undefined;
    if (parent) visit(parent, nextAncestors);
    visited.add(key);
  };
  accounts.forEach((account) => visit(account, new Set()));
}
