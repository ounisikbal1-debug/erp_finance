import prisma from '../../../core/models/prisma';
import { randomUUID } from 'node:crypto';
import {
  validateEmployeeInput,
  validatePayslipPeriod,
  validatePayslipRubriques,
  assertEmployeeCanBeDeleted,
  validateEmployeeTerminationInput,
} from './employee-validation';
import { isUniqueConstraintViolation } from './payslip-uniqueness';
import { HrRequestError } from './errors';
import { assertPayrollConfigurationAvailable, getPayrollAvailability } from './payroll-availability';
import { calculateProgressiveTax } from './progressive-tax';
import { calculateRetirementCssGain } from './retirement-css-gain';
import { validatePayrollCalculationInput } from './payroll-input';
import { validatePayrollRubriqueInput, validatePayrollRubriqueList } from './payroll-rubriques';
import { mergePayrollRubriquesForCountry, normalizePayrollCountryCode } from './country-payroll-rubriques';
import { buildPayrollRegister, isEmployeeEmployedDuringPeriod } from './payroll-register';

export interface RubriqueItem {
  code: string;
  label?: string;
  category: 'PRIME' | 'PRIME_NON_COTISABLE' | 'AVANTAGE_FISCAL' | 'RETENUE';
  amount: number;
}

export interface DetailedPayslipInput {
  fiscalBenefitType?: 'COMPLEMENTARY_RETIREMENT' | 'RETIREMENT_SAVINGS' | 'LIFE_INSURANCE';
  grossSalary?: number;
  baseSalary?: number;
  presenceBonus?: number; // 15.589 TND par défaut
  transportBonus?: number; // 88.778 TND par défaut
  complementaryRetirementRate?: number; // ex: 4%
  maritalStatus?: string;
  isHeadOfFamily?: boolean;
  childrenCount?: number;
  dependentParents?: number;
  countryCode?: string;
  rubriques?: RubriqueItem[];
}

export class HrService {
  /**
   * Moteur officiel de Paie Tunisienne conforme à la structure exacte :
   * Salaire de Base, Prime de Présence (15.589), Prime de Transport (88.778), Salaire Brut,
   * CNSS (9.68%), Brut Imposable, Frais Pro (10% max 2000), Chef de famille, Enfant à charge,
   * Prime Retraite Complémentaire, Net Imposable, IRPP (8 tranches), CSS (0.5%),
   * Total Impôts, Gain IRPP/CSS, Total Gain, Total Impôts après gains, Salaire Net, Parent à Charge, Total Retenue.
   */
  static async calculatePayroll(requestedInput: unknown) {
    const input = validatePayrollCalculationInput(requestedInput);
    const countryCode = input.countryCode;
    const payrollPeriod = input.period ?? new Date().toISOString().slice(0, 7);
    
    // 1. Détermination du salaire de base et des primes légales tunisiennes
    const baseSalary = Number(input.baseSalary ?? input.grossSalary);
    const presenceBonus = Number(input.presenceBonus ?? 15.589);
    const transportBonus = Number(input.transportBonus ?? 88.778);
    const retirementRate = (input.fiscalBenefitType === undefined
      || input.fiscalBenefitType === 'COMPLEMENTARY_RETIREMENT')
      ? Number(input.complementaryRetirementRate ?? 4.0) / 100
      : 0;
    
    const isHeadOfFamily = input.isHeadOfFamily ?? false;
    const childrenCount = input.childrenCount ?? 0;
    const dependentParents = input.dependentParents ?? 0;
    const rubriques = input.rubriques || [];

    // Configuration pays
    const country = await prisma.countryProfile.findUnique({
      where: { code: countryCode },
      include: {
        payrollConfig: true,
        taxBrackets: { orderBy: { order: 'asc' } },
      },
    });

    if (!country) {
      throw new HrRequestError(`Configuration de paie absente pour le pays ${countryCode}.`, 422);
    }
    assertPayrollConfigurationAvailable(
      country.code,
      Boolean(country.payrollConfig),
      country.taxBrackets,
      country.payrollConfig,
    );
    const cfg = country.payrollConfig;
    if (!cfg) {
      throw new HrRequestError('La configuration tunisienne de paie est absente.', 422);
    }

    // 2. Traitement des rubriques additionnelles
    let extraPrimesCotisables = 0;
    let extraPrimesNonCotisables = 0;
    let extraAvantagesFiscaux = 0;
    let extraRetenues = 0;

    for (const r of rubriques) {
      const amt = Number(r.amount) || 0;
      if (r.category === 'PRIME') extraPrimesCotisables += amt;
      else if (r.category === 'PRIME_NON_COTISABLE') extraPrimesNonCotisables += amt;
      else if (r.category === 'AVANTAGE_FISCAL') extraAvantagesFiscaux += amt;
      else if (r.category === 'RETENUE') extraRetenues += amt;
    }

    // 3. Salaire Brut = Base + Présence + Transport + Autres Primes
    const grossSalary = Math.round((baseSalary + presenceBonus + transportBonus + extraPrimesCotisables) * 1000) / 1000;

    // 4. Retenue CNSS (9.68% du Salaire Brut)
    const employeeCnss = Math.round((grossSalary * (cfg.employeeCnssRate / 100)) * 1000) / 1000;

    // 5. Brut imposable = Salaire Brut - CNSS (9.68%)
    const taxableGross = Math.max(
      0,
      Math.round((grossSalary - employeeCnss) * 1000) / 1000,
    );

    // Base annuelle pour les abattements
    const annualTaxableGross = taxableGross * 12;

    // 6. Frais Professionnels (10% plafonné à 2000 DT / an)
    const annualProfExpenses = Math.min(annualTaxableGross * (cfg.profExpensesRate / 100), cfg.profExpensesMaxCap);
    const monthlyProfExpenses = Math.round((annualProfExpenses / 12) * 1000) / 1000;

    // 7. Déductions familiales annuelles & mensuelles
    const annualHeadOfFamily = isHeadOfFamily ? cfg.headOfFamilyDeduction : 0;
    const monthlyHeadOfFamily = Math.round((annualHeadOfFamily / 12) * 1000) / 1000;

    const annualChildren = childrenCount * cfg.childDeduction;
    const monthlyChildren = Math.round((annualChildren / 12) * 1000) / 1000;

    const annualParents = dependentParents * cfg.parentDeduction;
    const monthlyParents = Math.round((annualParents / 12) * 1000) / 1000;

    // 8. Prime Retraite Complémentaire (Salaire Brut * 4% déductible fiscalement)
    const retirementBonusDeduction = Math.round((grossSalary * retirementRate) * 1000) / 1000;
    const annualRetirementDeduction = Math.min((retirementBonusDeduction + extraAvantagesFiscaux) * 12, 10000.0);

    // 9. Net Imposable Annuel & Mensuel
    const annualDeductions = annualProfExpenses + annualHeadOfFamily + annualChildren + annualParents + annualRetirementDeduction;
    const annualNetTaxable = Math.max(0, annualTaxableGross - annualDeductions);
    const monthlyNetTaxable = Math.round((annualNetTaxable / 12) * 1000) / 1000;

    // Measure the IRPP relief attributable only to complementary retirement contributions.
    const brackets = country.taxBrackets;
    const { annualTax: annualIrpp, details: bracketDetails } = calculateProgressiveTax(annualNetTaxable, brackets);
    const monthlyIrpp = Math.round((annualIrpp / 12) * 1000) / 1000;
    const annualDeductionsWithoutRetirement = annualProfExpenses + annualHeadOfFamily + annualChildren + annualParents
      + Math.min(extraAvantagesFiscaux * 12, 10000);
    const annualNetTaxableWithoutRetirement = Math.max(0, annualTaxableGross - annualDeductionsWithoutRetirement);
    const annualIrppWithoutRetirement = calculateProgressiveTax(annualNetTaxableWithoutRetirement, brackets).annualTax;
    const irppBeforeRetirementGain = Math.round((annualIrppWithoutRetirement / 12) * 1000) / 1000;
    const gainIrpp = Math.max(0, Math.round((irppBeforeRetirementGain - monthlyIrpp) * 1000) / 1000);

    const annualRetirementBenefit = Math.max(
      0,
      annualRetirementDeduction - Math.min(extraAvantagesFiscaux * 12, 10000),
    );
    const monthlyRetirementBenefit = Math.round((annualRetirementBenefit / 12) * 1000) / 1000;
    const { cssBeforeRetirementGain, css, gainCss } = calculateRetirementCssGain(
      grossSalary,
      monthlyRetirementBenefit,
      cfg.cssRate,
    );
    const totalTaxes = Math.round((irppBeforeRetirementGain + cssBeforeRetirementGain) * 1000) / 1000;
    const totalGain = Math.round((gainIrpp + gainCss) * 1000) / 1000;
    const totalTaxesAfterGains = Math.max(0, Math.round((monthlyIrpp + css) * 1000) / 1000);

    // 15. Salaire Net avant retenues de prêts
    const intermediateNet = Math.round((grossSalary - employeeCnss - totalTaxesAfterGains + extraPrimesNonCotisables) * 1000) / 1000;

    // 16. Total Retenues (CNSS + Impôts après gains + Prêt/Avances + Cotisation Retraite Salariale)
    const totalDeductions = Math.round((employeeCnss + totalTaxesAfterGains + extraRetenues + retirementBonusDeduction) * 1000) / 1000;

    // 17. Salaire Net Définitif
    const finalNetSalary = Math.round((grossSalary + extraPrimesNonCotisables - totalDeductions) * 1000) / 1000;

    // Cotisations patronales pour information
    const employerCnss = Math.round((grossSalary * ((cfg.employerCnssRate + cfg.employerWorkAccidentRate) / 100)) * 1000) / 1000;
    const foprolos = Math.round((grossSalary * (cfg.foprolosRate / 100)) * 1000) / 1000;

    return {
      country: country?.name || 'Tunisie',
      currency: country?.currencyCode || 'TND',
      currencySymbol: country?.currencySymbol || 'DT',
      // Éléments de Base
      baseSalary,
      presenceBonus,
      transportBonus,
      retirementBonusDeduction,
      retirementRatePct: retirementRate * 100,
      annualRetirementContributionDeduction: annualRetirementBenefit,
      // Total Brut
      grossSalary,
      // Retenue sociale
      employeeCnss,
      taxableGross,
      // Abattements et charges de famille
      fraisProfessionnels: monthlyProfExpenses,
      chefDeFamille: monthlyHeadOfFamily,
      enfantACharge: monthlyChildren,
      parentACharge: monthlyParents,
      netImposable: monthlyNetTaxable,
      annualNetTaxable,
      // Fiscalité
      irpp: monthlyIrpp,
      irppBeforeRetirementGain,
      css,
      cssBeforeRetirementGain,
      totalImpots: totalTaxes,
      gainIrpp,
      gainCss,
      totalGain,
      totalImpotsApresGains: totalTaxesAfterGains,
      // Net et Retenues
      intermediateNet,
      totalRetenue: totalDeductions,
      netSalary: finalNetSalary,
      // Patronales
      employerContributions: {
        employerCnss,
        foprolos,
        total: Math.round((employerCnss + foprolos) * 1000) / 1000,
      },
      bracketDetails,
      calculationSnapshot: {
        version: 'SAFE_PAYROLL_CALCULATION_V1',
        period: payrollPeriod,
        countryCode: country.code,
        currencyCode: country.currencyCode,
        configuration: {
          employeeCnssRate: cfg.employeeCnssRate,
          employerCnssRate: cfg.employerCnssRate,
          employerWorkAccidentRate: cfg.employerWorkAccidentRate,
          foprolosRate: cfg.foprolosRate,
          cssRate: cfg.cssRate,
          profExpensesRate: cfg.profExpensesRate,
          profExpensesMaxCap: cfg.profExpensesMaxCap,
          headOfFamilyDeduction: cfg.headOfFamilyDeduction,
          childDeduction: cfg.childDeduction,
          parentDeduction: cfg.parentDeduction,
        },
        taxBrackets: brackets.map(({ order, minAmount, maxAmount, rate }) => ({
          order,
          minAmount,
          maxAmount,
          rate,
        })),
        inputs: {
          baseSalary,
          presenceBonus,
          transportBonus,
          fiscalBenefitType: input.fiscalBenefitType,
          complementaryRetirementRate: retirementRate * 100,
          isHeadOfFamily,
          childrenCount,
          dependentParents,
          rubriques,
        },
        results: {
          grossSalary,
          employeeCnss,
          taxableGross,
          netImposable: monthlyNetTaxable,
          irpp: monthlyIrpp,
          css,
          employerCnss,
          foprolos,
          netSalary: finalNetSalary,
        },
      },
    };
  }

  static async simulatePayroll(input: unknown, entityId: string) {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { country: { select: { id: true, code: true } } },
    });
    if (!entity) throw new HrRequestError('Société introuvable.', 404);
    const validatedInput = validatePayrollCalculationInput(input, entity.country.code);
    await this.assertConfiguredRubriques(entity.country.id, entity.country.code, validatedInput.rubriques ?? []);
    return this.calculatePayroll({
      ...validatedInput,
      countryCode: entity.country.code,
    });
  }

  static async getPayrollAvailability(entityId: string) {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: {
        country: {
          select: {
            code: true,
            payrollConfig: true,
            taxBrackets: { select: { order: true, minAmount: true, maxAmount: true, rate: true } },
          },
        },
      },
    });
    if (!entity) throw new HrRequestError('Société introuvable.', 404);
    return getPayrollAvailability(
      entity.country.code,
      Boolean(entity.country.payrollConfig),
      entity.country.taxBrackets,
      entity.country.payrollConfig,
    );
  }

  static async listEmployees(entityId: string) {
    return await prisma.employee.findMany({
      where: { entityId },
      include: {
        entity: true,
        payslips: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
      orderBy: { hiredAt: 'desc' },
    });
  }

  static async createEmployee(data: unknown, entityId: string) {
    const employee = validateEmployeeInput(data, entityId);
    if (!employee.empId) {
      employee.empId = `EMP-${new Date().getFullYear()}-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    }
    return await prisma.employee.create({ data: employee });
  }

  static async deleteEmployee(id: string, entityId: string) {
    return prisma.$transaction(async (transaction) => {
      const employee = await transaction.employee.findFirst({
        where: { id, entityId },
        include: {
          payslips: { select: { id: true } },
          leaveRequests: { select: { id: true } },
          documents: { select: { id: true } },
          expenseClaims: { select: { id: true } },
          employmentEvents: { select: { id: true } },
        },
      });
      if (!employee) throw new HrRequestError('Salarié introuvable pour cette société', 404);
      assertEmployeeCanBeDeleted(employee.payslips.length, employee.leaveRequests.length);
      if (employee.documents.length > 0 || employee.expenseClaims.length > 0) {
        throw new HrRequestError('Le salarié possède des documents RH ou des notes de frais; archivez ou traitez ces éléments avant suppression.', 409);
      }
      if (employee.employmentEvents.length > 0) {
        throw new HrRequestError('Le dossier salarié comporte une trace de changement d’emploi; la suppression est interdite pour conserver l’audit.', 409);
      }
      const result = await transaction.employee.deleteMany({ where: { id, entityId } });
      if (result.count !== 1) throw new HrRequestError('Le salarié a changé pendant la suppression; recommencez l’opération', 409);
      return employee;
    });
  }

  static async updateEmployeeTermination(
    id: string,
    entityId: string,
    requestedInput: unknown,
    actor: { id: string; username: string },
  ) {
    if (!actor.id || !actor.username) {
      throw new HrRequestError('Une identité authentifiée est requise pour modifier la date de sortie.', 403);
    }
    const input = validateEmployeeTerminationInput(requestedInput);
    return prisma.$transaction(async (transaction) => {
      const employee = await transaction.employee.findFirst({
        where: { id, entityId },
        select: { id: true, hiredAt: true, terminatedAt: true },
      });
      if (!employee) throw new HrRequestError('Salarié introuvable pour cette société', 404);
      if (input.terminatedAt
        && input.terminatedAt.toISOString().slice(0, 10) < employee.hiredAt.toISOString().slice(0, 10)) {
        throw new HrRequestError('La date de sortie ne peut pas précéder la date d’embauche.', 422);
      }
      const previousDate = employee.terminatedAt?.toISOString().slice(0, 10) ?? null;
      const nextDate = input.terminatedAt?.toISOString().slice(0, 10) ?? null;
      if (previousDate === nextDate) {
        return { id: employee.id, terminatedAt: employee.terminatedAt, eventRecorded: false };
      }

      const updated = await transaction.employee.updateMany({
        where: { id, entityId, terminatedAt: employee.terminatedAt },
        data: { terminatedAt: input.terminatedAt },
      });
      if (updated.count !== 1) {
        throw new HrRequestError('Le dossier salarié a changé pendant la modification; rechargez-le et recommencez.', 409);
      }
      await transaction.employeeEmploymentEvent.create({
        data: {
          employeeId: id,
          action: input.terminatedAt ? 'EMPLOYMENT_END_DATE_SET' : 'EMPLOYMENT_END_DATE_CLEARED',
          previousTerminatedAt: employee.terminatedAt,
          newTerminatedAt: input.terminatedAt,
          actorUserId: actor.id,
          actorUsername: actor.username,
          note: input.note,
        },
      });
      return { id: employee.id, terminatedAt: input.terminatedAt, eventRecorded: true };
    });
  }

  static async generatePayslip(
    requestedEmployeeId: unknown,
    entityId: string,
    requestedPeriod: unknown,
    requestedRubriques: unknown,
  ) {
    if (typeof requestedEmployeeId !== 'string' || !requestedEmployeeId.trim()) {
      throw new HrRequestError('Le salarié est obligatoire', 400);
    }
    const employeeId = requestedEmployeeId.trim();
    const period = validatePayslipPeriod(requestedPeriod);
    const rubriques = validatePayslipRubriques(requestedRubriques);
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, entityId },
      include: { entity: { include: { country: true } } },
    });
    if (!employee) throw new HrRequestError('Salarié introuvable pour cette société', 404);
    if (!isEmployeeEmployedDuringPeriod(period, employee)) {
      throw new HrRequestError('La période de paie est hors période d’emploi du salarié.', 422);
    }

    if (await prisma.payslip.findFirst({ where: { employeeId, period }, select: { id: true } })) {
      throw new HrRequestError('Une fiche de paie existe déjà pour ce salarié et cette période', 409);
    }

    if (rubriques.length > 0) {
      await this.assertConfiguredRubriques(
        employee.entity.country.id,
        employee.entity.country.code,
        rubriques,
      );
    }

    const calculated = await this.calculatePayroll({
      baseSalary: employee.baseSalary,
      maritalStatus: employee.maritalStatus,
      isHeadOfFamily: employee.isHeadOfFamily,
      childrenCount: employee.childrenCount,
      dependentParents: employee.dependentParents,
      countryCode: employee.entity.country.code,
      period,
      rubriques,
    });

    try {
      const payslip = await prisma.payslip.create({
        data: {
          employeeId,
          period,
          currencyCode: calculated.currency,
          grossSalary: calculated.grossSalary,
          employeeCnss: calculated.employeeCnss,
          employerCnss: calculated.employerContributions.employerCnss,
          foprolos: calculated.employerContributions.foprolos,
          taxableGross: calculated.taxableGross,
          irpp: calculated.irpp,
          css: calculated.css,
          netSalary: calculated.netSalary,
          fiscalBenefitType: 'COMPLEMENTARY_RETIREMENT',
          complementaryRetirementRate: calculated.retirementRatePct,
          retirementContribution: calculated.retirementBonusDeduction,
          annualRetirementContributionDeduction: calculated.annualRetirementContributionDeduction,
          irppBeforeRetirementGain: calculated.irppBeforeRetirementGain,
          cssBeforeRetirementGain: calculated.cssBeforeRetirementGain,
          gainIrpp: calculated.gainIrpp,
          gainCss: calculated.gainCss,
          calculationSnapshot: JSON.stringify(calculated.calculationSnapshot),
        },
        include: { employee: true },
      });
      return {
        ...payslip,
        retirementContribution: calculated.retirementBonusDeduction,
        annualRetirementContributionDeduction: calculated.annualRetirementContributionDeduction,
        complementaryRetirementRate: calculated.retirementRatePct,
        irppBeforeRetirementGain: calculated.irppBeforeRetirementGain,
        cssBeforeRetirementGain: calculated.cssBeforeRetirementGain,
        gainIrpp: calculated.gainIrpp,
        gainCss: calculated.gainCss,
      };
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new HrRequestError('Une fiche de paie existe déjà pour ce salarié et cette période', 409);
      }
      throw error;
    }
  }

  private static async assertConfiguredRubriques(countryId: string, countryCode: string, rubriques: RubriqueItem[]) {
    if (rubriques.length === 0) return;
    const [countryRubriques, legacyRubriques] = await Promise.all([
      prisma.countryPayrollRubrique.findMany({
        where: { countryId },
        select: { id: true, code: true, label: true, category: true, defaultAmount: true },
      }),
      countryCode.toUpperCase() === 'TN'
        ? prisma.payrollRubrique.findMany({
          select: { id: true, code: true, label: true, category: true, defaultAmount: true },
        })
        : Promise.resolve([]),
    ]);
    const configured = mergePayrollRubriquesForCountry(
      countryCode,
      countryRubriques,
      legacyRubriques,
    );
    const categories = new Map(configured.map((rubrique) => [rubrique.code, rubrique.category]));
    for (const rubrique of rubriques) {
      if (categories.get(rubrique.code) !== rubrique.category) {
        throw new HrRequestError(`Rubrique absente ou catégorie différente du paramétrage du pays ${countryCode} : ${rubrique.code}`, 400);
      }
    }
  }

  static async listRubriques(requestedCountryCode?: unknown) {
    if (requestedCountryCode === undefined) {
      return prisma.payrollRubrique.findMany({ orderBy: { createdAt: 'asc' } });
    }
    const countryCode = normalizePayrollCountryCode(requestedCountryCode);
    const country = await prisma.countryProfile.findUnique({
      where: { code: countryCode },
      select: { id: true },
    });
    if (!country) throw new HrRequestError(`Pays introuvable pour le code ${countryCode}.`, 404);
    const [countryRubriques, legacyRubriques] = await Promise.all([
      prisma.countryPayrollRubrique.findMany({
        where: { countryId: country.id },
        orderBy: { createdAt: 'asc' },
      }),
      countryCode === 'TN'
        ? prisma.payrollRubrique.findMany({ orderBy: { createdAt: 'asc' } })
        : Promise.resolve([]),
    ]);
    return mergePayrollRubriquesForCountry(countryCode, countryRubriques, legacyRubriques);
  }

  static async listPayslips(entityId: string) {
    return prisma.payslip.findMany({
      where: { employee: { entityId } },
      include: { employee: true },
      orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
    });
  }

  static async getPayrollRegister(entityId: string, requestedPeriod: unknown) {
    const period = validatePayslipPeriod(requestedPeriod);
    const [employees, payslips] = await Promise.all([
      prisma.employee.findMany({
        where: { entityId },
        select: {
          id: true,
          empId: true,
          firstName: true,
          lastName: true,
          cnssNumber: true,
          hiredAt: true,
          terminatedAt: true,
        },
        orderBy: [{ hiredAt: 'asc' }, { id: 'asc' }],
      }),
      prisma.payslip.findMany({
        where: { period, employee: { entityId } },
        include: {
          employee: {
            select: { id: true, empId: true, firstName: true, lastName: true, cnssNumber: true },
          },
        },
        orderBy: [{ employee: { lastName: 'asc' } }, { employee: { firstName: 'asc' } }],
      }),
    ]);
    return buildPayrollRegister(period, employees, payslips);
  }

  static async createCountryRubrique(requestedCountryCode: unknown, data: unknown) {
    const countryCode = normalizePayrollCountryCode(requestedCountryCode);
    const country = await prisma.countryProfile.findUnique({
      where: { code: countryCode },
      select: { id: true },
    });
    if (!country) throw new HrRequestError(`Pays introuvable pour le code ${countryCode}.`, 404);
    const rubrique = validatePayrollRubriqueInput(data);
    return prisma.countryPayrollRubrique.upsert({
      where: { countryId_code: { countryId: country.id, code: rubrique.code } },
      update: {
        label: rubrique.label,
        category: rubrique.category,
        defaultAmount: rubrique.defaultAmount,
      },
      create: { ...rubrique, countryId: country.id },
    });
  }

  static async saveCountryRubriques(requestedCountryCode: unknown, input: unknown) {
    const countryCode = normalizePayrollCountryCode(requestedCountryCode);
    const country = await prisma.countryProfile.findUnique({
      where: { code: countryCode },
      select: { id: true },
    });
    if (!country) throw new HrRequestError(`Pays introuvable pour le code ${countryCode}.`, 404);
    const rubriques = validatePayrollRubriqueList(input);
    return prisma.$transaction(async (tx) => {
      for (const rubrique of rubriques) {
        await tx.countryPayrollRubrique.upsert({
          where: { countryId_code: { countryId: country.id, code: rubrique.code } },
          update: {
            label: rubrique.label,
            category: rubrique.category,
            defaultAmount: rubrique.defaultAmount,
          },
          create: { ...rubrique, countryId: country.id },
        });
      }
      return tx.countryPayrollRubrique.findMany({
        where: { countryId: country.id },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  static async deleteCountryRubrique(requestedCountryCode: unknown, requestedId: unknown) {
    const countryCode = normalizePayrollCountryCode(requestedCountryCode);
    if (typeof requestedId !== 'string' || !requestedId.trim()) {
      throw new HrRequestError('Identifiant de rubrique invalide.', 400);
    }
    const country = await prisma.countryProfile.findUnique({
      where: { code: countryCode },
      select: { id: true },
    });
    if (!country) throw new HrRequestError(`Pays introuvable pour le code ${countryCode}.`, 404);
    const deleted = await prisma.countryPayrollRubrique.deleteMany({
      where: { id: requestedId.trim(), countryId: country.id },
    });
    if (deleted.count !== 1) throw new HrRequestError('Rubrique introuvable pour ce pays.', 404);
    return { id: requestedId.trim() };
  }

}

export default HrService;
