import { createHash } from 'node:crypto';
import prisma from '../../models/prisma';
import {
  assertOfficialCustomsSource,
  calculateCustomsImport,
  CustomsTariffError,
  validateCustomsTariffInput,
} from '../../../application/modules/customs/tariff';
import { previewCustomsTariffCsv } from '../../../application/modules/customs/tariff-import';

function asDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function rangesOverlap(
  leftStart: Date,
  leftEnd: Date | null,
  rightStart: Date,
  rightEnd: Date | null,
): boolean {
  return (leftEnd === null || rightStart <= leftEnd)
    && (rightEnd === null || leftStart <= rightEnd);
}

function assertVerifiedSource(record: {
  sourceName: string | null;
  sourceUrl: string | null;
  sourceReference: string | null;
  verifiedAt: Date | null;
  verifiedByUserId: string | null;
}): void {
  assertOfficialCustomsSource(record.sourceUrl);
  if (!record.sourceName?.trim() || !record.sourceReference?.trim() || !record.verifiedAt || !record.verifiedByUserId) {
    throw new CustomsTariffError('Le barème vérifié ne contient pas la trace complète de sa validation.', 409);
  }
}

export class CustomsTariffService {
  static async previewCsvImport(value: unknown) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new CustomsTariffError('Les paramètres d’import doivent être un objet.');
    }
    const input = value as Record<string, unknown>;
    try {
      const countryCode = typeof input.countryCode === 'string' ? input.countryCode.toUpperCase() : '';
      const country = await prisma.countryProfile.findUnique({
        where: { code: countryCode },
        select: { id: true },
      });
      if (!country) throw new CustomsTariffError(`Pays introuvable pour le code ${countryCode}.`, 404);
      return previewCustomsTariffCsv(input.csv, input.settings);
    } catch (error) {
      if (error instanceof CustomsTariffError) throw error;
      if (error instanceof Error) throw new CustomsTariffError(error.message, 400);
      throw new CustomsTariffError('Impossible de valider le fichier de barèmes.', 400);
    }
  }

  static async importCsvDrafts(countryCode: string, value: unknown, userId: string) {
    if (!userId.trim()) throw new CustomsTariffError('Un administrateur authentifié est requis.', 401);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new CustomsTariffError('Les paramètres d’import doivent être un objet.');
    }
    const input = value as Record<string, unknown>;
    if (input.importConfirmed !== true) {
      throw new CustomsTariffError('Confirmez l’import des barèmes en brouillon après revue de l’aperçu.', 400);
    }
    const preview = await this.previewCsvImport({
      csv: input.csv,
      settings: input.settings,
      countryCode,
    });
    if (!preview.canImport) {
      throw new CustomsTariffError('L’aperçu contient des erreurs ou aucun barème valide; aucun enregistrement n’a été créé.', 422);
    }
    if (typeof input.csv !== 'string') throw new CustomsTariffError('Le contenu CSV est invalide.');
    const sourceReference = preview.records[0].sourceReference ?? '';
    const sourceReferenceWithHash = `${sourceReference} | SHA-256:${createHash('sha256').update(input.csv, 'utf8').digest('hex')}`;
    if (sourceReferenceWithHash.length > 500) {
      throw new CustomsTariffError('La référence source est trop longue pour enregistrer son empreinte SHA-256.');
    }

    const country = await prisma.countryProfile.findUnique({
      where: { code: countryCode },
      select: { id: true },
    });
    if (!country) throw new CustomsTariffError(`Pays introuvable pour le code ${countryCode}.`, 404);

    const importedCount = await prisma.$transaction(async (tx) => {
      const existing = await tx.customsTariffRate.findMany({
        where: { countryId: country.id, sourceReference: sourceReferenceWithHash },
        select: { id: true },
        take: 1,
      });
      if (existing.length > 0) {
        throw new CustomsTariffError('Ce fichier source a déjà été importé pour ce pays.', 409);
      }
      const result = await tx.customsTariffRate.createMany({
        data: preview.records.map((record) => ({
          countryId: country.id,
          tariffCode: record.tariffCode,
          description: record.description,
          customsDutyRate: record.customsDutyRate,
          consumptionDutyRate: record.consumptionDutyRate,
          fodecRate: record.fodecRate,
          importVatRate: record.importVatRate,
          customsServiceFeeRate: record.customsServiceFeeRate,
          preferentialCustomsDutyRate: record.preferentialCustomsDutyRate,
          originCountryCode: record.originCountryCode,
          preferentialAgreementCode: record.preferentialAgreementCode,
          customsDutyBaseComponents: JSON.stringify(record.customsDutyBaseComponents),
          consumptionDutyBaseComponents: JSON.stringify(record.consumptionDutyBaseComponents),
          fodecBaseComponents: JSON.stringify(record.fodecBaseComponents),
          importVatBaseComponents: JSON.stringify(record.importVatBaseComponents),
          customsServiceFeeBaseComponents: JSON.stringify(record.customsServiceFeeBaseComponents),
          effectiveFrom: asDate(record.effectiveFrom),
          effectiveTo: record.effectiveTo ? asDate(record.effectiveTo) : null,
          sourceName: record.sourceName,
          sourceUrl: record.sourceUrl,
          sourceReference: sourceReferenceWithHash,
          status: 'DRAFT',
          createdByUserId: userId,
        })),
      });
      return result.count;
    });
    return {
      importedCount,
      status: 'DRAFT',
      verified: false,
      sourceName: preview.records[0].sourceName,
      sourceUrl: preview.records[0].sourceUrl,
      sourceReference: sourceReferenceWithHash,
      notice: 'Les taux importés restent des brouillons; chaque barème doit être vérifié avant tout calcul.',
    };
  }

  static async list(countryCode: string) {
    const country = await prisma.countryProfile.findUnique({
      where: { code: countryCode },
      select: { id: true },
    });
    if (!country) throw new CustomsTariffError(`Pays introuvable pour le code ${countryCode}.`, 404);
    return prisma.customsTariffRate.findMany({
      where: { countryId: country.id },
      orderBy: [{ tariffCode: 'asc' }, { effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
  }

  static async createDraft(countryCode: string, value: unknown, userId: string) {
    if (!userId.trim()) throw new CustomsTariffError('Un administrateur authentifié est requis.', 401);
    const input = validateCustomsTariffInput(value);
    const country = await prisma.countryProfile.findUnique({
      where: { code: countryCode },
      select: { id: true },
    });
    if (!country) throw new CustomsTariffError(`Pays introuvable pour le code ${countryCode}.`, 404);
    return prisma.customsTariffRate.create({
      data: {
        countryId: country.id,
        tariffCode: input.tariffCode,
        description: input.description,
        customsDutyRate: input.customsDutyRate,
        consumptionDutyRate: input.consumptionDutyRate,
        fodecRate: input.fodecRate,
        importVatRate: input.importVatRate,
        customsServiceFeeRate: input.customsServiceFeeRate,
        preferentialCustomsDutyRate: input.preferentialCustomsDutyRate,
        originCountryCode: input.originCountryCode,
        preferentialAgreementCode: input.preferentialAgreementCode,
        customsDutyBaseComponents: JSON.stringify(input.customsDutyBaseComponents),
        consumptionDutyBaseComponents: JSON.stringify(input.consumptionDutyBaseComponents),
        fodecBaseComponents: JSON.stringify(input.fodecBaseComponents),
        importVatBaseComponents: JSON.stringify(input.importVatBaseComponents),
        customsServiceFeeBaseComponents: JSON.stringify(input.customsServiceFeeBaseComponents),
        effectiveFrom: asDate(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? asDate(input.effectiveTo) : null,
        sourceName: input.sourceName,
        sourceUrl: input.sourceUrl,
        sourceReference: input.sourceReference,
        status: 'DRAFT',
        createdByUserId: userId,
      },
    });
  }

  static async verifyDraft(countryCode: string, id: string, userId: string, confirmation: unknown) {
    if (confirmation !== true) {
      throw new CustomsTariffError('Confirmez que le barème et sa période ont été vérifiés dans la source officielle.', 400);
    }
    if (!userId.trim()) throw new CustomsTariffError('Un administrateur authentifié est requis.', 401);
    const country = await prisma.countryProfile.findUnique({
      where: { code: countryCode },
      select: { id: true },
    });
    if (!country) throw new CustomsTariffError(`Pays introuvable pour le code ${countryCode}.`, 404);

    return prisma.$transaction(async (tx) => {
      const tariff = await tx.customsTariffRate.findFirst({
        where: { id, countryId: country.id },
      });
      if (!tariff) throw new CustomsTariffError('Barème douanier introuvable.', 404);
      if (tariff.status !== 'DRAFT') throw new CustomsTariffError('Seul un barème brouillon peut être vérifié.', 409);
      assertVerifiedSource(tariff);

      const sameSchedule = await tx.customsTariffRate.findMany({
        where: {
          countryId: tariff.countryId,
          tariffCode: tariff.tariffCode,
          originCountryCode: tariff.originCountryCode,
          preferentialAgreementCode: tariff.preferentialAgreementCode,
          status: 'VERIFIED',
          id: { not: tariff.id },
        },
        select: { effectiveFrom: true, effectiveTo: true },
      });
      if (sameSchedule.some((existing) => rangesOverlap(
        tariff.effectiveFrom,
        tariff.effectiveTo,
        existing.effectiveFrom,
        existing.effectiveTo,
      ))) {
        throw new CustomsTariffError('La période chevauche déjà un autre barème vérifié pour ce code et ce régime.', 409);
      }

      return tx.customsTariffRate.update({
        where: { id: tariff.id },
        data: {
          status: 'VERIFIED',
          verifiedAt: new Date(),
          verifiedByUserId: userId,
        },
      });
    });
  }

  static async calculate(countryCode: string, value: unknown) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new CustomsTariffError('Les paramètres de calcul doivent être un objet.');
    }
    const input = value as Record<string, unknown>;
    const tariffCode = input.tariffCode;
    if (typeof tariffCode !== 'string' || !/^\d{10}$/.test(tariffCode)) {
      throw new CustomsTariffError('Le code NGP doit contenir exactement 10 chiffres.');
    }
    if (typeof input.calculationDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.calculationDate)) {
      throw new CustomsTariffError('La date du calcul doit être au format AAAA-MM-JJ.');
    }
    const calculationDate = asDate(input.calculationDate);
    if (!Number.isFinite(calculationDate.getTime())
      || calculationDate.toISOString().slice(0, 10) !== input.calculationDate) {
      throw new CustomsTariffError('La date du calcul n’est pas valide.');
    }
    if (typeof input.cifValue !== 'number' || !Number.isFinite(input.cifValue) || input.cifValue < 0) {
      throw new CustomsTariffError('La valeur CAF doit être un montant positif ou nul.');
    }
    const eligibilityConfirmed = input.preferenceEligibilityConfirmed === true;
    const preferenceEvidenceReference = typeof input.preferenceEvidenceReference === 'string'
      ? input.preferenceEvidenceReference.trim()
      : '';
    if (eligibilityConfirmed && (
      typeof input.originCountryCode !== 'string'
      || !/^[A-Za-z]{2}$/.test(input.originCountryCode)
      || typeof input.preferentialAgreementCode !== 'string'
      || !input.preferentialAgreementCode.trim()
      || !preferenceEvidenceReference
    )) {
      throw new CustomsTariffError('Une préférence exige un pays d’origine, un accord et une référence de justificatif.');
    }
    const country = await prisma.countryProfile.findUnique({
      where: { code: countryCode },
      select: { id: true },
    });
    if (!country) throw new CustomsTariffError(`Pays introuvable pour le code ${countryCode}.`, 404);

    const rates = await prisma.customsTariffRate.findMany({
      where: {
        countryId: country.id,
        tariffCode,
        status: 'VERIFIED',
        effectiveFrom: { lte: calculationDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: calculationDate } }],
      },
    });
    const standardRates = rates.filter((rate) => rate.originCountryCode === null
      && rate.preferentialAgreementCode === null);
    if (standardRates.length === 0) throw new CustomsTariffError('Aucun barème général vérifié n’est en vigueur à cette date.', 404);
    if (standardRates.length > 1) throw new CustomsTariffError('Plusieurs barèmes généraux sont actifs pour ce code et cette date.', 409);
    const standardRate = standardRates[0];
    assertVerifiedSource(standardRate);

    let selectedRate = standardRate;
    if (eligibilityConfirmed) {
      const originCode = (input.originCountryCode as string).toUpperCase();
      const agreementCode = (input.preferentialAgreementCode as string).trim().toUpperCase();
      const preferenceRates = rates.filter((rate) => rate.originCountryCode === originCode
        && rate.preferentialAgreementCode === agreementCode
        && rate.preferentialCustomsDutyRate !== null);
      if (preferenceRates.length === 0) {
        throw new CustomsTariffError('Aucun taux préférentiel vérifié n’est en vigueur pour ce pays et cet accord.', 422);
      }
      if (preferenceRates.length > 1) {
        throw new CustomsTariffError('Plusieurs taux préférentiels sont actifs pour ce code, cet accord et cette date.', 409);
      }
      const preferenceRate = preferenceRates[0];
      assertVerifiedSource(preferenceRate);
      selectedRate = preferenceRate;
    }

    const calculation = calculateCustomsImport(selectedRate, {
      cifValue: input.cifValue,
      ...(typeof input.originCountryCode === 'string' ? { originCountryCode: input.originCountryCode } : {}),
      ...(typeof input.preferentialAgreementCode === 'string' ? { preferentialAgreementCode: input.preferentialAgreementCode } : {}),
      preferenceEligibilityConfirmed: eligibilityConfirmed,
      ...(typeof input.preferenceEvidenceReference === 'string'
        ? { preferenceEvidenceReference: input.preferenceEvidenceReference }
        : {}),
    });
    return {
      ...calculation,
      tariffCode: selectedRate.tariffCode,
      tariffDescription: selectedRate.description,
      calculationDate: input.calculationDate,
      ...(calculation.preferentialCustomsDutyApplied
        ? { preferenceEvidenceReference }
        : {}),
      source: {
        name: selectedRate.sourceName,
        url: selectedRate.sourceUrl,
        reference: selectedRate.sourceReference,
        verifiedAt: selectedRate.verifiedAt,
      },
      disclaimer: 'Estimation basée exclusivement sur le barème vérifié et les assiettes configurées. Vérifiez le classement NGP, l’origine, l’accord et les justificatifs avec un déclarant en douane; aucune déclaration douanière n’est produite.',
    };
  }
}
