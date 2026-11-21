import prisma from '../../../data/prisma/client';
import {
  calculateCountryTaxRule,
  parseCountryTaxDate,
  CountryTaxRuleValidationError,
  validateCountryTaxRuleCreation,
} from './country-tax-rules';

export class CountryTaxRuleNotFoundError extends Error {
  constructor() {
    super('La règle fiscale est introuvable pour ce pays.');
    this.name = 'CountryTaxRuleNotFoundError';
  }
}

export class CountryTaxRuleCountryNotFoundError extends Error {
  constructor(code: string) {
    super(`Pays introuvable pour le code ${code}.`);
    this.name = 'CountryTaxRuleCountryNotFoundError';
  }
}

export class CountryTaxRuleService {
  static async list(countryCode: string) {
    const country = await prisma.countryProfile.findUnique({
      where: { code: countryCode },
      select: { id: true },
    });
    if (!country) throw new CountryTaxRuleCountryNotFoundError(countryCode);
    return prisma.countryTaxRule.findMany({
      where: { jurisdiction: { countryId: country.id } },
      include: {
        jurisdiction: {
          select: { id: true, kind: true, code: true, name: true, parentId: true },
        },
        rates: { orderBy: { sequence: 'asc' } },
        thresholds: { orderBy: { code: 'asc' } },
      },
      orderBy: [
        { jurisdiction: { kind: 'asc' } },
        { code: 'asc' },
        { version: 'desc' },
      ],
    });
  }

  static async create(countryCode: string, value: unknown, actorId: string) {
    const input = validateCountryTaxRuleCreation(value);
    return prisma.$transaction(async (tx) => {
      const country = await tx.countryProfile.findUnique({
        where: { code: countryCode },
        select: { id: true },
      });
      if (!country) throw new CountryTaxRuleCountryNotFoundError(countryCode);

      let parentId: string | null = null;
      if (input.jurisdiction.parentCode) {
        const parents = await tx.taxJurisdiction.findMany({
          where: { countryId: country.id, code: input.jurisdiction.parentCode },
          select: { id: true },
          take: 2,
        });
        if (parents.length !== 1) {
          throw new CountryTaxRuleValidationError('La juridiction parente doit exister et être non ambiguë.');
        }
        parentId = parents[0].id;
      }

      const matchingJurisdictions = await tx.taxJurisdiction.findMany({
        where: {
          countryId: country.id,
          kind: input.jurisdiction.kind,
          code: input.jurisdiction.code,
        },
        select: { id: true, name: true, parentId: true },
        take: 2,
      });
      let jurisdictionId: string;
      if (matchingJurisdictions.length > 1) {
        throw new CountryTaxRuleValidationError('La juridiction est ambiguë dans le profil pays.');
      }
      if (matchingJurisdictions.length === 1) {
        const existing = matchingJurisdictions[0];
        if (existing.name !== input.jurisdiction.name || existing.parentId !== parentId) {
          throw new CountryTaxRuleValidationError('La juridiction existe déjà avec une identité différente; aucune donnée existante n’a été remplacée.');
        }
        jurisdictionId = existing.id;
      } else {
        const jurisdiction = await tx.taxJurisdiction.create({
          data: {
            countryId: country.id,
            parentId,
            kind: input.jurisdiction.kind,
            code: input.jurisdiction.code,
            name: input.jurisdiction.name,
          },
          select: { id: true },
        });
        jurisdictionId = jurisdiction.id;
      }

      const previousVersions = await tx.countryTaxRule.findMany({
        where: { jurisdictionId, code: input.code },
        select: { version: true, effectiveFrom: true, effectiveTo: true },
        orderBy: { version: 'desc' },
      });
      const newEnd = input.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY;
      const overlaps = previousVersions.some((previous) => (
        previous.effectiveFrom.getTime() <= newEnd
        && (previous.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY) >= input.effectiveFrom.getTime()
      ));
      if (overlaps) {
        throw new CountryTaxRuleValidationError('La période chevauche une version existante; créez une période distincte sans modifier l’historique.');
      }

      const version = (previousVersions[0]?.version ?? 0) + 1;
      return tx.countryTaxRule.create({
        data: {
          jurisdictionId,
          code: input.code,
          name: input.name,
          taxType: input.taxType,
          calculationMethod: input.calculationMethod,
          taxBase: input.taxBase,
          currencyCode: input.currencyCode,
          filingPeriod: input.filingPeriod,
          roundingScale: input.roundingScale,
          roundingMethod: input.roundingMethod,
          applicationOrder: input.applicationOrder,
          isCumulative: input.isCumulative,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo,
          version,
          status: 'APPROVED_FOR_TESTING',
          appliesToJson: input.appliesToJson,
          conditionsJson: input.conditionsJson,
          formula: input.formula,
          sourceName: input.sourceName,
          sourceUrl: input.sourceUrl,
          sourceReference: input.sourceReference,
          sourceRetrievedAt: input.sourceRetrievedAt,
          notes: input.notes,
          createdByUserId: actorId,
          approvedByUserId: actorId,
          approvedAt: new Date(),
          approvalNote: 'Acceptée pour calculs et essais sur instruction de l’utilisateur; ne constitue pas une certification juridique.',
          rates: { create: input.rates },
          thresholds: { create: input.thresholds },
        },
        include: {
          jurisdiction: true,
          rates: { orderBy: { sequence: 'asc' } },
          thresholds: { orderBy: { code: 'asc' } },
        },
      });
    });
  }

  static async calculate(countryCode: string, ruleId: string, value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new CountryTaxRuleValidationError('Les paramètres de calcul doivent être un objet.');
    }
    const input = value as Record<string, unknown>;
    const unknownFields = Object.keys(input).filter((key) => ![
      'taxableBase',
      'currencyCode',
      'effectiveDate',
      'eligibilityConfirmed',
      'units',
    ].includes(key));
    if (unknownFields.length) {
      throw new CountryTaxRuleValidationError(`Le calcul contient des champs inconnus : ${unknownFields.join(', ')}.`);
    }
    if (typeof input.taxableBase !== 'number' || !Number.isFinite(input.taxableBase) || input.taxableBase < 0) {
      throw new CountryTaxRuleValidationError('La base taxable doit être un nombre fini positif ou nul.');
    }
    if (input.currencyCode !== undefined && input.currencyCode !== null
      && (typeof input.currencyCode !== 'string' || !/^[A-Za-z]{3}$/.test(input.currencyCode.trim()))) {
      throw new CountryTaxRuleValidationError('La devise de calcul doit contenir trois lettres.');
    }
    if (input.eligibilityConfirmed !== undefined && typeof input.eligibilityConfirmed !== 'boolean') {
      throw new CountryTaxRuleValidationError('La confirmation d’éligibilité doit être booléenne.');
    }
    if (input.units !== undefined && (typeof input.units !== 'number' || !Number.isFinite(input.units) || input.units < 0)) {
      throw new CountryTaxRuleValidationError('La quantité doit être un nombre fini positif ou nul.');
    }
    const rule = await prisma.countryTaxRule.findFirst({
      where: {
        id: ruleId,
        jurisdiction: { country: { code: countryCode } },
      },
      include: { rates: { orderBy: { sequence: 'asc' } } },
    });
    if (!rule) throw new CountryTaxRuleNotFoundError();
    return calculateCountryTaxRule({
      rule,
      taxableBase: input.taxableBase,
      currencyCode: typeof input.currencyCode === 'string' ? input.currencyCode.trim().toUpperCase() : null,
      effectiveDate: parseCountryTaxDate(input.effectiveDate, 'La date d’effet du calcul'),
      eligibilityConfirmed: input.eligibilityConfirmed === true,
      units: typeof input.units === 'number' ? input.units : undefined,
    });
  }
}
