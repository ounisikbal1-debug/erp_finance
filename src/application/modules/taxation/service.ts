import prisma from '../../../data/prisma/client';
import { getModuleRoles, type AuthenticatedUser } from '../../auth';
import {
  parseWithholdingCertificateInput,
  WithholdingCertificateError,
  type WithholdingCertificateActor,
} from './certificates';
import { calculateTaxDeclaration, TaxDeclarationError, validateTaxPeriod } from './declaration';
import {
  calculateTunisianWithholding,
  parseTunisianWithholdingInput,
  tunisianWithholdingRuleCatalog,
  tunisianWithholdingRuleProvenance,
} from './withholding';
import {
  parseTaxDeclarationWorkpaperInput,
  TaxDeclarationWorkpaperError,
} from './workpapers';

const withholdingCertificateStatuses = new Set(['PREPARED', 'ISSUED', 'CANCELLED', 'REVOKED']);

function isValidWorkpaperAmount(amount: number): boolean {
  const millimes = Math.round(amount * 1000);
  return Number.isFinite(amount)
    && amount >= 0
    && Number.isSafeInteger(millimes)
    && Math.abs(amount * 1000 - millimes) <= 1e-7;
}

function getG50VatBase(report: Awaited<ReturnType<typeof calculateTaxDeclaration>>): number {
  return report.tvaDetailsCollected.reduce((total, detail) => (
    total + (typeof detail.baseHT === 'number' && Number.isFinite(detail.baseHT) ? detail.baseHT : 0)
  ), 0);
}

export class TaxationService {
  private static requireCertificateActor(actor: WithholdingCertificateActor | undefined): WithholdingCertificateActor {
    if (!actor?.id || !actor.username || !actor.role) {
      throw new WithholdingCertificateError('Identité authentifiée requise pour le workflow de certificat.', 401);
    }
    if (!getModuleRoles('taxation')?.includes(actor.role as AuthenticatedUser['role'])) {
      throw new WithholdingCertificateError('Rôle non habilité pour le workflow de certificat fiscal.', 403);
    }
    return actor;
  }

  private static async requireTunisianEntity(entityId: string): Promise<void> {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { country: { select: { code: true } } },
    });
    if (!entity) throw new TaxDeclarationError('Société introuvable', 404);
    if (entity.country.code !== 'TN') {
      throw new TaxDeclarationError('Les certificats de retenue sont disponibles uniquement pour les entités tunisiennes', 422);
    }
  }

  static async recordTaxDeclarationWorkpaper(
    requestedInput: unknown,
    entityId: string,
    requestedActor?: WithholdingCertificateActor,
  ) {
    const actor = this.requireCertificateActor(requestedActor);
    await this.requireTunisianEntity(entityId);
    const input = parseTaxDeclarationWorkpaperInput(requestedInput);
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { country: { select: { corporateTax: true } } },
    });
    if (!entity) throw new TaxDeclarationError('Société introuvable', 404);
    const corporateTaxRate = entity.country.corporateTax;
    if (input.section === 'IS'
      && (corporateTaxRate === null || !Number.isFinite(corporateTaxRate) || corporateTaxRate < 0 || corporateTaxRate > 100)) {
      throw new TaxDeclarationWorkpaperError('Le taux IS du profil pays doit être configuré et valide avant d’enregistrer le dossier.', 422);
    }
    const g50Report = input.section === 'G50'
      ? await this.getMonthlyTaxDeclaration(input.period, entityId)
      : null;
    if (input.section === 'G50' && (g50Report?.tvaDue === null || g50Report?.tvaDue === undefined)) {
      throw new TaxDeclarationWorkpaperError(
        'Le composant TVA G50 est incomplet; corrigez et rapprochez les pièces avant de l’enregistrer.',
        409,
      );
    }

    try {
      const workpaper = await prisma.$transaction(async (tx) => {
        let amount: number;
        let certificateCount: number | null = null;
        let taxableBase: number | null = null;
        if (input.section === 'G50') {
          amount = g50Report!.tvaDue!;
          taxableBase = getG50VatBase(g50Report!);
        } else if (input.section === 'RS') {
          const certificates = await tx.withholdingCertificate.findMany({
            where: { entityId, period: input.period },
            select: { status: true, withholdingAmount: true, currencyCode: true },
          });
          if (certificates.some((certificate) => !withholdingCertificateStatuses.has(certificate.status))) {
            throw new TaxDeclarationWorkpaperError('Un certificat RS a un statut inconnu; corrigez-le avant le rapprochement.', 422);
          }
          if (certificates.some((certificate) => certificate.status === 'PREPARED')) {
            throw new TaxDeclarationWorkpaperError('Émettez ou annulez tous les certificats préparés avant d’approuver la complétude RS.', 409);
          }
          const issued = certificates.filter((certificate) => certificate.status === 'ISSUED');
          if (issued.some((certificate) => certificate.currencyCode !== 'TND')) {
            throw new TaxDeclarationWorkpaperError('Tous les certificats RS doivent être en TND pour le rapprochement.', 422);
          }
          const amountMillimes = issued.reduce((total, certificate) => {
            const millimes = Math.round(certificate.withholdingAmount * 1000);
            if (!Number.isFinite(certificate.withholdingAmount)
              || certificate.withholdingAmount < 0
              || !Number.isSafeInteger(millimes)
              || Math.abs(certificate.withholdingAmount * 1000 - millimes) > 1e-7
              || !Number.isSafeInteger(total + millimes)) {
              throw new TaxDeclarationWorkpaperError('Un certificat émis contient un montant RS invalide ou hors précision sûre.', 422);
            }
            return total + millimes;
          }, 0);
          amount = amountMillimes / 1000;
          certificateCount = issued.length;
        } else {
          if (input.amount === undefined || input.taxableBase === undefined) {
            throw new TaxDeclarationWorkpaperError('La base et le montant IS validés sont obligatoires.', 400);
          }
          amount = input.amount;
        }

        const previous = await tx.taxDeclarationWorkpaper.findFirst({
          where: { entityId, period: input.period, section: input.section, isCurrent: true },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const version = (previous?.version ?? 0) + 1;
        if (previous) {
          await tx.taxDeclarationWorkpaper.updateMany({
            where: { entityId, period: input.period, section: input.section, isCurrent: true },
            data: { isCurrent: false },
          });
        }
        return tx.taxDeclarationWorkpaper.create({
          data: {
            entityId,
            period: input.period,
            section: input.section,
            version,
            amount,
            taxableBase: input.section === 'G50'
              ? taxableBase
              : input.section === 'IS' ? input.taxableBase ?? null : null,
            taxRateSnapshot: input.section === 'IS' ? corporateTaxRate : null,
            certificateCount,
            sourceReference: input.sourceReference,
            reviewNote: input.reviewNote,
            approvedByUserId: actor.id,
            approvedByUsername: actor.username,
          },
        });
      });
      return { ...workpaper, sourceCurrent: true };
    } catch (error) {
      if (error instanceof TaxDeclarationWorkpaperError) throw error;
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw new TaxDeclarationWorkpaperError('Un autre dossier a été approuvé simultanément; rechargez la période.', 409);
      }
      throw error;
    }
  }

  static async getTaxDeclarationWorkpapers(
    entityId: string,
    requestedActor?: WithholdingCertificateActor,
    requestedPeriod?: unknown,
  ) {
    this.requireCertificateActor(requestedActor);
    await this.requireTunisianEntity(entityId);
    const period = requestedPeriod === undefined ? undefined : validateTaxPeriod(requestedPeriod);
    const [entity, workpapers] = await Promise.all([
      prisma.entity.findUnique({
        where: { id: entityId },
        select: { country: { select: { corporateTax: true } } },
      }),
      prisma.taxDeclarationWorkpaper.findMany({
        where: { entityId, isCurrent: true, ...(period ? { period } : {}) },
        orderBy: [{ period: 'desc' }, { section: 'asc' }],
      }),
    ]);
    if (!entity) throw new TaxDeclarationError('Société introuvable', 404);
    if (workpapers.length === 0) return [];

    const certificates = await prisma.withholdingCertificate.findMany({
      where: { entityId, period: { in: [...new Set(workpapers.map((workpaper) => workpaper.period))] } },
      select: { period: true, status: true, withholdingAmount: true, currencyCode: true },
    });
    const g50Declarations = new Map<string, Awaited<ReturnType<typeof this.getMonthlyTaxDeclaration>>>();
    await Promise.all([...new Set(
      workpapers.filter((workpaper) => workpaper.section === 'G50').map((workpaper) => workpaper.period),
    )].map(async (g50Period) => {
      g50Declarations.set(g50Period, await this.getMonthlyTaxDeclaration(g50Period, entityId));
    }));
    return workpapers.map((workpaper) => {
      if (workpaper.section === 'G50') {
        const declaration = g50Declarations.get(workpaper.period);
        const currentBase = declaration ? getG50VatBase(declaration) : null;
        return {
          ...workpaper,
          sourceCurrent: declaration?.tvaDue !== null
            && declaration?.tvaDue !== undefined
            && isValidWorkpaperAmount(workpaper.amount)
            && isValidWorkpaperAmount(workpaper.taxableBase ?? Number.NaN)
            && Math.round(workpaper.amount * 1000) === Math.round(declaration.tvaDue * 1000)
            && currentBase !== null
            && Math.round((workpaper.taxableBase ?? 0) * 1000) === Math.round(currentBase * 1000),
        };
      }
      if (workpaper.section === 'IS') {
        return {
          ...workpaper,
          sourceCurrent: workpaper.taxableBase !== null
            && isValidWorkpaperAmount(workpaper.amount)
            && isValidWorkpaperAmount(workpaper.taxableBase)
            && workpaper.taxRateSnapshot !== null
            && Number.isFinite(workpaper.taxRateSnapshot)
            && workpaper.taxRateSnapshot >= 0
            && workpaper.taxRateSnapshot <= 100
            && workpaper.taxRateSnapshot === entity.country.corporateTax,
        };
      }
      if (workpaper.section !== 'RS') return { ...workpaper, sourceCurrent: false };

      const periodCertificates = certificates.filter((certificate) => certificate.period === workpaper.period);
      const issued = periodCertificates.filter((certificate) => certificate.status === 'ISSUED');
      let totalMillimes = 0;
      let validAmounts = true;
      for (const certificate of issued) {
        const millimes = Math.round(certificate.withholdingAmount * 1000);
        if (certificate.currencyCode !== 'TND'
          || !Number.isFinite(certificate.withholdingAmount)
          || certificate.withholdingAmount < 0
          || !Number.isSafeInteger(millimes)
          || Math.abs(certificate.withholdingAmount * 1000 - millimes) > 1e-7
          || !Number.isSafeInteger(totalMillimes + millimes)) {
          validAmounts = false;
          break;
        }
        totalMillimes += millimes;
      }
      return {
        ...workpaper,
        sourceCurrent: !periodCertificates.some((certificate) => certificate.status === 'PREPARED')
          && periodCertificates.every((certificate) => withholdingCertificateStatuses.has(certificate.status))
          && validAmounts
          && workpaper.certificateCount === issued.length
          && Math.round(workpaper.amount * 1000) === totalMillimes,
      };
    });
  }

  static async prepareWithholdingCertificate(requestedInput: unknown, entityId: string, requestedActor?: WithholdingCertificateActor) {
    const actor = this.requireCertificateActor(requestedActor);
    await this.requireTunisianEntity(entityId);
    const input = parseWithholdingCertificateInput(requestedInput);
    let source: {
      purchaseInvoiceId: string | null;
      cashflowPaymentId: string | null;
      beneficiaryName: string;
      beneficiaryFiscalId: string | null;
      grossAmountTtc: number;
      currencyCode: string;
      supplierFiscalIdPresent: boolean;
    };

    if (input.sourceType === 'PURCHASE_INVOICE') {
      const invoice = await prisma.purchaseInvoice.findFirst({
        where: { entityId, invoiceNumber: input.sourceReference, status: 'POSTED' },
        select: {
          id: true,
          totalAmount: true,
          currencyCode: true,
          vendor: { select: { name: true, fiscalId: true } },
        },
      });
      if (!invoice) {
        throw new WithholdingCertificateError('Facture fournisseur comptabilisée introuvable dans cette entité.', 404);
      }
      source = {
        purchaseInvoiceId: invoice.id,
        cashflowPaymentId: null,
        beneficiaryName: invoice.vendor.name,
        beneficiaryFiscalId: invoice.vendor.fiscalId?.trim() || null,
        grossAmountTtc: invoice.totalAmount,
        currencyCode: invoice.currencyCode,
        supplierFiscalIdPresent: Boolean(invoice.vendor.fiscalId?.trim()),
      };
    } else if (input.sourceType === 'SUPPLIER_PAYMENT') {
      const payment = await prisma.cashflowPayment.findFirst({
        where: { id: input.sourceReference, entityId, direction: 'SUPPLIER_PAYMENT' },
        select: {
          id: true,
          amount: true,
          currencyCode: true,
          purchaseInvoiceId: true,
          purchaseInvoice: {
            select: { totalAmount: true, currencyCode: true, vendor: { select: { name: true, fiscalId: true } } },
          },
        },
      });
      if (!payment || !payment.purchaseInvoiceId || !payment.purchaseInvoice) {
        throw new WithholdingCertificateError('Paiement fournisseur lié à une facture SAFE introuvable.', 404);
      }
      if (payment.purchaseInvoice.currencyCode !== 'TND'
        || payment.currencyCode !== payment.purchaseInvoice.currencyCode) {
        throw new WithholdingCertificateError('La devise du paiement et de sa facture doit être TND et identique; aucune conversion automatique n’est appliquée.', 422);
      }
      source = {
        purchaseInvoiceId: payment.purchaseInvoiceId,
        cashflowPaymentId: payment.id,
        beneficiaryName: payment.purchaseInvoice.vendor.name,
        beneficiaryFiscalId: payment.purchaseInvoice.vendor.fiscalId?.trim() || null,
        grossAmountTtc: payment.amount,
        currencyCode: payment.currencyCode,
        supplierFiscalIdPresent: Boolean(payment.purchaseInvoice.vendor.fiscalId?.trim()),
      };
    } else {
      if (!input.beneficiaryName) {
        throw new WithholdingCertificateError('Le bénéficiaire doit être fourni pour une source non référencée dans SAFE.', 400);
      }
      source = {
        purchaseInvoiceId: null,
        cashflowPaymentId: null,
        beneficiaryName: input.beneficiaryName,
        beneficiaryFiscalId: input.beneficiaryFiscalId ?? null,
        grossAmountTtc: input.withholding.amountTtc,
        currencyCode: 'TND',
        supplierFiscalIdPresent: input.withholding.supplierFiscalIdPresent ?? false,
      };
    }

    if (source.currencyCode !== 'TND') {
      throw new WithholdingCertificateError('Le workflow de certificat exige actuellement une base source en TND; aucune conversion automatique n’est appliquée.', 422);
    }
    if (Math.round(source.grossAmountTtc * 1000) !== Math.round(input.withholding.amountTtc * 1000)) {
      throw new WithholdingCertificateError('La base TTC du certificat doit correspondre au montant de la pièce source; les montants partiels nécessitent une source distincte vérifiable.', 422);
    }
    if (input.beneficiaryName && input.beneficiaryName !== source.beneficiaryName) {
      throw new WithholdingCertificateError('Le nom du bénéficiaire ne correspond pas à la fiche fournisseur de la source.', 422);
    }
    if (input.beneficiaryFiscalId !== undefined && input.beneficiaryFiscalId !== source.beneficiaryFiscalId) {
      throw new WithholdingCertificateError('Le matricule du bénéficiaire ne correspond pas à la fiche fournisseur de la source.', 422);
    }
    if (input.withholding.supplierFiscalIdPresent !== undefined
      && input.withholding.supplierFiscalIdPresent !== source.supplierFiscalIdPresent) {
      throw new WithholdingCertificateError('La présence du matricule fiscal ne correspond pas à la source bénéficiaire.', 422);
    }
    if (input.withholding.category === 'livraisons_sans_carte_fiscale' && source.supplierFiscalIdPresent) {
      throw new WithholdingCertificateError('La catégorie « livraison sans carte fiscale » contredit le matricule fiscal de la source SAFE.', 422);
    }

    const withholdingInput = input.sourceType === 'OTHER'
      ? input.withholding
      : { ...input.withholding, supplierFiscalIdPresent: source.supplierFiscalIdPresent };
    const calculation = calculateTunisianWithholding(withholdingInput);
    if (calculation.status !== 'CALCULATED'
      || calculation.certificate.required !== true
      || calculation.amount === null
      || calculation.rate === null) {
      throw new WithholdingCertificateError(
        'Le certificat ne peut être préparé : le calcul RS est indisponible ou aucune retenue positive n’est déterminée.',
        422,
      );
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const certificate = await tx.withholdingCertificate.create({
          data: {
            entityId,
            purchaseInvoiceId: source.purchaseInvoiceId,
            cashflowPaymentId: source.cashflowPaymentId,
            certificateNumber: input.certificateNumber,
            beneficiaryName: source.beneficiaryName,
            beneficiaryFiscalId: source.beneficiaryFiscalId,
            category: withholdingInput.category,
            grossAmountTtc: source.grossAmountTtc,
            withholdingRate: calculation.rate!,
            withholdingAmount: calculation.amount!,
            currencyCode: source.currencyCode,
            period: withholdingInput.period,
            sourceType: input.sourceType,
            sourceReference: input.sourceReference,
            ruleSource: calculation.ruleProvenance.source,
            ruleSourceDate: calculation.ruleProvenance.sourceDate,
            ruleEffectiveFrom: calculation.ruleProvenance.effectiveFrom,
            preparedByUserId: actor.id,
            preparedByUsername: actor.username,
            workflowEvents: {
              create: {
                action: 'PREPARED',
                actorUserId: actor.id,
                actorUsername: actor.username,
                note: 'Certificat préparé; émission soumise à une vérification humaine.',
              },
            },
          },
          include: { workflowEvents: { orderBy: { createdAt: 'asc' } } },
        });
        return certificate;
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw new WithholdingCertificateError('Un certificat existe déjà pour ce numéro ou cette source/période/catégorie.', 409);
      }
      throw error;
    }
  }

  static async getWithholdingCertificates(entityId: string, requestedActor?: WithholdingCertificateActor, period?: unknown) {
    this.requireCertificateActor(requestedActor);
    await this.requireTunisianEntity(entityId);
    let normalizedPeriod: string | undefined;
    if (period !== undefined) normalizedPeriod = validateTaxPeriod(period);
    return prisma.withholdingCertificate.findMany({
      where: { entityId, ...(normalizedPeriod ? { period: normalizedPeriod } : {}) },
      include: { workflowEvents: { orderBy: { createdAt: 'asc' } } },
      orderBy: [{ createdAt: 'desc' }, { certificateNumber: 'asc' }],
    });
  }

  static async transitionWithholdingCertificate(
    certificateId: string,
    entityId: string,
    action: 'ISSUE' | 'CANCEL' | 'REVOKE',
    requestedActor?: WithholdingCertificateActor,
    reason?: unknown,
  ) {
    const actor = this.requireCertificateActor(requestedActor);
    await this.requireTunisianEntity(entityId);
    if (typeof certificateId !== 'string' || certificateId.length === 0 || certificateId.length > 100) {
      throw new WithholdingCertificateError('Identifiant de certificat invalide.', 400);
    }
    if (action !== 'ISSUE' && (typeof reason !== 'string' || reason.trim().length < 10 || reason.trim().length > 500)) {
      throw new WithholdingCertificateError('Un motif de 10 à 500 caractères est requis pour annuler ou révoquer.', 400);
    }

    return prisma.$transaction(async (tx) => {
      const certificate = await tx.withholdingCertificate.findFirst({ where: { id: certificateId, entityId } });
      if (!certificate) throw new WithholdingCertificateError('Certificat introuvable dans cette entité.', 404);
      const currentStatus = certificate.status;
      const nextStatus = action === 'ISSUE' ? 'ISSUED' : action === 'CANCEL' ? 'CANCELLED' : 'REVOKED';
      const expectedStatus = action === 'REVOKE' ? 'ISSUED' : 'PREPARED';
      if (currentStatus !== expectedStatus) {
        throw new WithholdingCertificateError(
          action === 'REVOKE'
            ? 'Seul un certificat émis peut être révoqué.'
            : 'Seul un certificat préparé peut être émis ou annulé.',
          409,
        );
      }

      const timestamp = new Date();
      const updated = await tx.withholdingCertificate.updateMany({
        where: { id: certificateId, entityId, status: expectedStatus },
        data: {
          status: nextStatus,
          ...(action === 'ISSUE' ? { issuedByUserId: actor.id, issuedByUsername: actor.username, issuedAt: timestamp } : {}),
          ...(action === 'CANCEL' ? {
            cancelledByUserId: actor.id,
            cancelledByUsername: actor.username,
            cancelledAt: timestamp,
            cancellationReason: (reason as string).trim(),
          } : {}),
          ...(action === 'REVOKE' ? {
            revokedByUserId: actor.id,
            revokedByUsername: actor.username,
            revokedAt: timestamp,
            revocationReason: (reason as string).trim(),
          } : {}),
        },
      });
      if (updated.count !== 1) {
        throw new WithholdingCertificateError('Le certificat a été modifié par une autre opération; rechargez son état.', 409);
      }
      await tx.withholdingCertificateWorkflowEvent.create({
        data: {
          certificateId,
          action: nextStatus,
          actorUserId: actor.id,
          actorUsername: actor.username,
          note: action === 'ISSUE' ? 'Certificat émis après validation utilisateur.' : (reason as string).trim(),
        },
      });
      return tx.withholdingCertificate.findFirst({
        where: { id: certificateId, entityId },
        include: { workflowEvents: { orderBy: { createdAt: 'asc' } } },
      });
    });
  }

  static async getWithholdingRuleCatalog(entityId: string) {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { country: { select: { code: true } } },
    });
    if (!entity) throw new TaxDeclarationError('Société introuvable', 404);
    if (entity.country.code !== 'TN') {
      throw new TaxDeclarationError('L’aperçu des retenues fourni est disponible uniquement pour les entités tunisiennes', 422);
    }

    return {
      currency: 'TND',
      periodBasis: 'Événement de rattachement (facturation ou paiement) non défini; à confirmer avant déclaration',
      base: 'TTC',
      ruleProvenance: tunisianWithholdingRuleProvenance,
      monthlyDeclarationDue: '15 premiers jours du mois suivant',
      annualDeclarationDue: 'Avant le 28 février de l’année suivante',
      ruleBasis: 'USER_REPORTED_EXPERT_VALIDATION_IMPLEMENTATION_UNVERIFIED',
      rules: tunisianWithholdingRuleCatalog,
      certificate: {
        recipient: 'supplier',
        workflow: 'PREPARED_ISSUED_CANCELLED_REVOKED',
        regulatoryCertification: false,
      },
    };
  }

  static async calculateWithholdingPreview(requestedInput: unknown, entityId: string) {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { country: { select: { code: true } } },
    });
    if (!entity) throw new TaxDeclarationError('Société introuvable', 404);
    if (entity.country.code !== 'TN') {
      throw new TaxDeclarationError('L’aperçu des retenues fourni est disponible uniquement pour les entités tunisiennes', 422);
    }

    return calculateTunisianWithholding(parseTunisianWithholdingInput(requestedInput));
  }

  static async getMonthlyTaxDeclaration(requestedPeriod: unknown, entityId: string) {
    const period = validateTaxPeriod(requestedPeriod);
    const [year, month] = period.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 1));
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      include: {
        country: {
          include: {
            taxRates: { select: { id: true, purchaseVatRecoverable: true } },
          },
        },
      },
    });
    if (!entity) throw new TaxDeclarationError('Société introuvable', 404);
    if (entity.country.code !== 'TN') {
      throw new TaxDeclarationError('La déclaration G50 est disponible uniquement pour les entités tunisiennes', 422);
    }

    const [invoices, deductibleLines, collectedVatLines, purchaseInvoices, supplierCreditNotes] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          entityId,
          status: { in: ['ISSUED', 'PAID'] },
          createdAt: { gte: startDate, lt: endDate },
        },
        select: {
          invoiceNumber: true,
          subTotal: true,
          taxAmount: true,
          currencyCode: true,
          documentCurrencyCode: true,
          functionalCurrencyCode: true,
          exchangeRate: true,
          exchangeRateDate: true,
          exchangeRateSource: true,
          items: { select: { quantity: true, unitPrice: true, taxRate: true } },
        },
      }),
      prisma.journalLine.findMany({
        where: {
          accountCode: entity.country.purchaseVatAccountCode ?? '__UNCONFIGURED_PURCHASE_VAT__',
          journalEntry: {
            entityId,
            status: 'POSTED',
            date: { gte: startDate, lt: endDate },
          },
        },
        select: {
          accountCode: true,
          debit: true,
          credit: true,
          journalEntry: { select: { reference: true } },
        },
      }),
      prisma.journalLine.findMany({
        where: {
          accountCode: entity.country.salesVatAccountCode ?? '__UNCONFIGURED_SALES_VAT__',
          journalEntry: {
            entityId,
            status: 'POSTED',
            date: { gte: startDate, lt: endDate },
          },
        },
        select: {
          debit: true,
          credit: true,
          journalEntry: { select: { reference: true } },
        },
      }),
      prisma.purchaseInvoice.findMany({
        where: {
          entityId,
          status: 'POSTED',
          issueDate: { gte: startDate, lt: endDate },
        },
        select: {
          invoiceNumber: true,
          taxRateId: true,
          subTotal: true,
          taxAmount: true,
          taxRate: true,
        },
      }),
      prisma.supplierCreditNote.findMany({
        where: {
          entityId,
          status: 'POSTED',
          OR: [
            { creditDate: { gte: startDate, lt: endDate } },
            { creditDate: null, postedAt: { gte: startDate, lt: endDate } },
          ],
        },
        select: {
          supplierDocumentNumber: true,
          taxRateId: true,
          creditDate: true,
          subTotal: true,
          taxAmount: true,
          taxRate: true,
        },
      }),
    ]);

    const [workpapers, withholdingCertificates] = await Promise.all([
      prisma.taxDeclarationWorkpaper.findMany({
        where: { entityId, period, isCurrent: true },
        select: {
          section: true,
          amount: true,
          taxableBase: true,
          taxRateSnapshot: true,
          certificateCount: true,
        },
      }),
      prisma.withholdingCertificate.findMany({
        where: { entityId, period },
        select: {
          status: true,
          category: true,
          grossAmountTtc: true,
          withholdingRate: true,
          withholdingAmount: true,
          currencyCode: true,
          sourceReference: true,
        },
      }),
    ]);
    const rsWorkpaper = workpapers.find((workpaper) => workpaper.section === 'RS');
    const issuedCertificates = withholdingCertificates.filter((certificate) => certificate.status === 'ISSUED');
    const hasPreparedCertificates = withholdingCertificates.some((certificate) => certificate.status === 'PREPARED');
    const hasUnknownCertificateStatuses = withholdingCertificates.some(
      (certificate) => !withholdingCertificateStatuses.has(certificate.status),
    );
    let issuedCertificateTotal = 0;
    let validCertificateAmounts = true;
    for (const certificate of issuedCertificates) {
      const millimes = Math.round(certificate.withholdingAmount * 1000);
      const validBase = isValidWorkpaperAmount(certificate.grossAmountTtc);
      const validRate = Number.isFinite(certificate.withholdingRate)
        && certificate.withholdingRate >= 0
        && certificate.withholdingRate <= 100;
      const calculatedMillimes = validBase && validRate
        ? Math.round(certificate.grossAmountTtc * certificate.withholdingRate / 100 * 1000)
        : Number.NaN;
      if (certificate.currencyCode !== 'TND'
        || typeof certificate.category !== 'string'
        || !certificate.category.trim()
        || typeof certificate.sourceReference !== 'string'
        || !certificate.sourceReference.trim()
        || !validBase
        || !validRate
        || !Number.isFinite(certificate.withholdingAmount)
        || certificate.withholdingAmount < 0
        || !Number.isSafeInteger(millimes)
        || !Number.isSafeInteger(calculatedMillimes)
        || calculatedMillimes !== millimes
        || Math.abs(certificate.withholdingAmount * 1000 - millimes) > 1e-7
        || !Number.isSafeInteger(issuedCertificateTotal + millimes)) {
        validCertificateAmounts = false;
        break;
      }
      issuedCertificateTotal += millimes;
    }
    const rsWithholdingAmount = rsWorkpaper
      && !hasPreparedCertificates
      && !hasUnknownCertificateStatuses
      && validCertificateAmounts
      && rsWorkpaper.certificateCount === issuedCertificates.length
      && Math.round(rsWorkpaper.amount * 1000) === issuedCertificateTotal
      ? rsWorkpaper.amount
      : undefined;
    const isWorkpaper = workpapers.find((workpaper) => workpaper.section === 'IS');
    const corporateTaxAmount = isWorkpaper
      && isWorkpaper.taxableBase !== null
      && isWorkpaper.taxRateSnapshot === entity.country.corporateTax
      ? isWorkpaper.amount
      : undefined;

    return calculateTaxDeclaration(
      period,
      entity.country.currencyCode,
      invoices,
      deductibleLines.map((line) => ({
        accountCode: line.accountCode,
        reference: line.journalEntry.reference,
        debit: line.debit,
        credit: line.credit,
      })),
      collectedVatLines.map((line) => ({
        reference: line.journalEntry.reference,
        debit: line.debit,
        credit: line.credit,
      })),
      purchaseInvoices.map((invoice) => ({
        ...invoice,
        purchaseVatRecoverable: entity.country.taxRates.find((rate) => rate.id === invoice.taxRateId)
          ?.purchaseVatRecoverable ?? null,
      })),
      supplierCreditNotes.map((creditNote) => ({
        documentNumber: creditNote.creditDate ? creditNote.supplierDocumentNumber : null,
        subTotal: creditNote.subTotal,
        taxAmount: creditNote.taxAmount,
        taxRate: creditNote.taxRate,
        purchaseVatRecoverable: entity.country.taxRates.find((rate) => rate.id === creditNote.taxRateId)
          ?.purchaseVatRecoverable ?? null,
      })),
      {
        salesVatAccountCode: entity.country.salesVatAccountCode,
        purchaseVatAccountCode: entity.country.purchaseVatAccountCode,
        corporateTaxRate: entity.country.corporateTax,
        ...(rsWithholdingAmount === undefined ? {} : { rsWithholdingAmount }),
        ...(rsWithholdingAmount === undefined ? {} : {
          rsDetails: issuedCertificates.map((certificate) => ({
            category: certificate.category,
            sourceReference: certificate.sourceReference,
            baseTtc: certificate.grossAmountTtc,
            rate: certificate.withholdingRate,
            amount: certificate.withholdingAmount,
          })),
        }),
        ...(corporateTaxAmount === undefined || isWorkpaper?.taxableBase === null
          ? {}
          : { corporateTaxAmount, corporateTaxableBase: isWorkpaper.taxableBase }),
      },
    );
  }
}

export default TaxationService;
