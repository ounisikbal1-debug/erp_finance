import { randomBytes } from 'node:crypto';
import type { PrismaClient as PrismaClientType } from '@prisma/client';
import { hashPassword } from '../application/security/passwords';

const databaseUrl = 'file:../mega-demo-synthetic-2025.db';
const confirmation = 'YES';
const marker = 'SAFE-SYNTHETIC-MEGA-2025-2026';
const entityCodes = ['SAFE-DEMO-001', 'SAFE-FR-001', 'SAFE-MA-001', 'SAFE-AE-001'];
const syntheticNote = 'Scénario synthétique généré pour test; aucune revue professionnelle, déclaration ou opération réelle n’est attestée.';

type DemoActor = { id: string; username: string; role: string };
type DemoActors = { preparer: DemoActor; reviewer: DemoActor; poster: DemoActor };
type BankMovement = { date: string; description: string; amount: number; reference: string };
type JournalLineInput = { accountCode: string; debit: number; credit: number; description: string };

function roundAmount(amount: number): number {
  return Math.round(amount * 1000) / 1000;
}

function amountText(amount: number): string {
  return roundAmount(amount).toFixed(3);
}

function periodForMonth(month: number): string {
  return `2025-${String(month).padStart(2, '0')}`;
}

function monthDate(period: string, day: number): string {
  return `${period}-${String(day).padStart(2, '0')}`;
}

function lastDay(period: string): number {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function summarizeLines(lines: JournalLineInput[]) {
  return lines
    .map((line) => ({
      ...line,
      debit: roundAmount(line.debit),
      credit: roundAmount(line.credit),
    }))
    .filter((line) => line.debit > 0 || line.credit > 0);
}

async function main(): Promise<void> {
  const guardFailures = [
    process.env.NODE_ENV === 'production' ? 'production environment' : null,
    process.env.SAFE_ERP_DATABASE_PROVIDER !== 'sqlite' ? 'database provider' : null,
    process.env.SAFE_ERP_DATABASE_URL !== databaseUrl ? 'database URL' : null,
    process.env.SAFE_ERP_MEGA_2025_CONFIRM !== confirmation ? 'confirmation' : null,
  ].filter((failure): failure is string => failure !== null);
  if (guardFailures.length > 0) {
    throw new Error(`Seed refusé : configuration non autorisée (${guardFailures.join(', ')}).`);
  }

  const { PrismaClient } = await import('@prisma/client');
  const prisma: PrismaClientType = new PrismaClient();
  const sourcePrisma: PrismaClientType = new PrismaClient({
    datasources: { db: { url: 'file:../data.db' } },
  });

  try {
    const [
      { default: FinanceService },
      { default: SalesService },
      { default: PurchasesService },
      { default: CashflowBankingService },
      { default: TaxationService },
      { default: HrService },
      { default: MonthlyCloseService },
      { MONTHLY_CLOSE_CHECKS, ANNUAL_CLOSE_CHECKS },
    ] = await Promise.all([
      import('../application/modules/finance/service'),
      import('../application/modules/sales/service'),
      import('../application/modules/purchases/service'),
      import('../application/modules/cashflow/banking-service'),
      import('../application/modules/taxation/service'),
      import('../application/modules/hr/service'),
      import('../application/modules/monthly-close/service'),
      import('../application/modules/monthly-close/checklist'),
    ]);

    const existingMarker = await prisma.workbookFeatureConfiguration.findFirst({
      where: { featureKey: 'SYNTHETIC_2025_2026_DATASET' },
      select: { id: true },
    });
    if (existingMarker) {
      throw new Error('Le scénario synthétique 2025-2026 a déjà été lancé; aucune donnée n’a été modifiée.');
    }

    const entities = await prisma.entity.findMany({
      where: { code: { in: entityCodes } },
      include: { country: true },
      orderBy: { code: 'asc' },
    });
    if (entities.length !== entityCodes.length
      || entities.some((entity) => !/synthétique|fictive/i.test(entity.name))) {
      throw new Error('Les quatre sociétés synthétiques attendues doivent exister dans la copie ciblée.');
    }

    const sourceTunisia = await sourcePrisma.countryProfile.findUnique({
      where: { code: 'TN' },
      include: {
        accounts: true,
        taxRates: true,
        payrollConfig: true,
        taxBrackets: { orderBy: { order: 'asc' } },
      },
    });
    if (!sourceTunisia?.payrollConfig
      || sourceTunisia.taxBrackets.length === 0
      || sourceTunisia.taxRates.length === 0
      || sourceTunisia.accounts.length === 0) {
      throw new Error('Les paramètres TN attendus sont absents de la source; aucun taux ne sera inventé.');
    }

    const syntheticTunisia = await prisma.countryProfile.findUnique({ where: { code: 'ZZ' } });
    if (!syntheticTunisia) throw new Error('Le profil ZZ de démonstration est absent de la copie.');

    await prisma.countryProfile.updateMany({ where: { id: { not: syntheticTunisia.id } }, data: { isDefault: false } });
    await prisma.countryProfile.update({
      where: { id: syntheticTunisia.id },
      data: {
        code: 'TN',
        name: 'Tunisie — profil synthétique',
        currencyCode: sourceTunisia.currencyCode,
        currencySymbol: sourceTunisia.currencySymbol,
        stampDuty: sourceTunisia.stampDuty,
        corporateTax: sourceTunisia.corporateTax,
        salesReceivableAccountCode: sourceTunisia.salesReceivableAccountCode,
        salesRevenueAccountCode: sourceTunisia.salesRevenueAccountCode,
        salesVatAccountCode: sourceTunisia.salesVatAccountCode,
        salesStampDutyAccountCode: sourceTunisia.salesStampDutyAccountCode,
        stockAssetAccountCode: sourceTunisia.stockAssetAccountCode,
        stockAdjustmentAccountCode: sourceTunisia.stockAdjustmentAccountCode,
        productionWipAccountCode: sourceTunisia.productionWipAccountCode,
        productionLaborAccountCode: sourceTunisia.productionLaborAccountCode,
        productionOverheadAccountCode: sourceTunisia.productionOverheadAccountCode,
        purchaseExpenseAccountCode: sourceTunisia.purchaseExpenseAccountCode,
        purchaseVatAccountCode: sourceTunisia.purchaseVatAccountCode,
        realizedFxGainAccountCode: sourceTunisia.realizedFxGainAccountCode,
        realizedFxLossAccountCode: sourceTunisia.realizedFxLossAccountCode,
        unrealizedFxGainAccountCode: sourceTunisia.unrealizedFxGainAccountCode,
        unrealizedFxLossAccountCode: sourceTunisia.unrealizedFxLossAccountCode,
        isDefault: true,
      },
    });

    for (const account of sourceTunisia.accounts) {
      await prisma.chartOfAccount.upsert({
        where: { countryId_code: { countryId: syntheticTunisia.id, code: account.code } },
        update: {
          description: account.description,
          classNumber: account.classNumber,
          type: account.type,
          financialCategory: account.financialCategory,
          isPostingAllowed: account.isPostingAllowed,
        },
        create: {
          countryId: syntheticTunisia.id,
          code: account.code,
          description: account.description,
          classNumber: account.classNumber,
          type: account.type,
          financialCategory: account.financialCategory,
          isPostingAllowed: account.isPostingAllowed,
        },
      });
    }
    await prisma.chartOfAccount.upsert({
      where: { countryId_code: { countryId: syntheticTunisia.id, code: 'SYN-RETIREMENT-PAYABLE' } },
      update: {
        description: 'Retraite complémentaire à reverser — compte synthétique de démonstration',
        classNumber: 4,
        type: 'Liability',
        isPostingAllowed: true,
      },
      create: {
        countryId: syntheticTunisia.id,
        code: 'SYN-RETIREMENT-PAYABLE',
        description: 'Retraite complémentaire à reverser — compte synthétique de démonstration',
        classNumber: 4,
        type: 'Liability',
        isPostingAllowed: true,
      },
    });

    for (const rate of sourceTunisia.taxRates) {
      const current = await prisma.taxRate.findFirst({
        where: { countryId: syntheticTunisia.id, code: rate.code },
        select: { id: true },
      });
      if (current) {
        await prisma.taxRate.update({
          where: { id: current.id },
          data: {
            name: rate.name,
            rate: rate.rate,
            isDefault: rate.isDefault,
            purchaseVatRecoverable: rate.purchaseVatRecoverable,
          },
        });
      } else {
        await prisma.taxRate.create({
          data: {
            countryId: syntheticTunisia.id,
            code: rate.code,
            name: rate.name,
            rate: rate.rate,
            isDefault: rate.isDefault,
            purchaseVatRecoverable: rate.purchaseVatRecoverable,
          },
        });
      }
    }

    await prisma.payrollConfig.upsert({
      where: { countryId: syntheticTunisia.id },
      update: {
        employeeCnssRate: sourceTunisia.payrollConfig.employeeCnssRate,
        employerCnssRate: sourceTunisia.payrollConfig.employerCnssRate,
        employerWorkAccidentRate: sourceTunisia.payrollConfig.employerWorkAccidentRate,
        foprolosRate: sourceTunisia.payrollConfig.foprolosRate,
        cssRate: sourceTunisia.payrollConfig.cssRate,
        profExpensesRate: sourceTunisia.payrollConfig.profExpensesRate,
        profExpensesMaxCap: sourceTunisia.payrollConfig.profExpensesMaxCap,
        headOfFamilyDeduction: sourceTunisia.payrollConfig.headOfFamilyDeduction,
        childDeduction: sourceTunisia.payrollConfig.childDeduction,
        parentDeduction: sourceTunisia.payrollConfig.parentDeduction,
      },
      create: {
        countryId: syntheticTunisia.id,
        employeeCnssRate: sourceTunisia.payrollConfig.employeeCnssRate,
        employerCnssRate: sourceTunisia.payrollConfig.employerCnssRate,
        employerWorkAccidentRate: sourceTunisia.payrollConfig.employerWorkAccidentRate,
        foprolosRate: sourceTunisia.payrollConfig.foprolosRate,
        cssRate: sourceTunisia.payrollConfig.cssRate,
        profExpensesRate: sourceTunisia.payrollConfig.profExpensesRate,
        profExpensesMaxCap: sourceTunisia.payrollConfig.profExpensesMaxCap,
        headOfFamilyDeduction: sourceTunisia.payrollConfig.headOfFamilyDeduction,
        childDeduction: sourceTunisia.payrollConfig.childDeduction,
        parentDeduction: sourceTunisia.payrollConfig.parentDeduction,
      },
    });
    await prisma.payrollTaxBracket.deleteMany({ where: { countryId: syntheticTunisia.id } });
    await prisma.payrollTaxBracket.createMany({
      data: sourceTunisia.taxBrackets.map((bracket) => ({
        countryId: syntheticTunisia.id,
        order: bracket.order,
        minAmount: bracket.minAmount,
        maxAmount: bracket.maxAmount,
        rate: bracket.rate,
      })),
    });

    for (const entity of entities.filter((candidate) => candidate.code !== 'SAFE-DEMO-001')) {
      const profile = await prisma.countryProfile.update({
        where: { id: entity.countryId },
        data: {
          stampDuty: 0,
          corporateTax: null,
          salesReceivableAccountCode: 'SYN-TRADE_RECEIVABLE',
          salesRevenueAccountCode: 'SYN-REVENUE',
          salesVatAccountCode: 'SYN-OTHER_CURRENT_LIABILITY',
          salesStampDutyAccountCode: 'SYN-OTHER_CURRENT_LIABILITY',
          purchaseExpenseAccountCode: 'SYN-PURCHASES',
          purchaseVatAccountCode: 'SYN-OTHER_CURRENT_ASSET',
        },
      });
      const zeroRate = await prisma.taxRate.findFirst({
        where: { countryId: profile.id, code: 'SYN-ZERO' },
        select: { id: true },
      });
      if (!zeroRate) {
        await prisma.taxRate.create({
          data: {
            countryId: profile.id,
            code: 'SYN-ZERO',
            name: 'Taux nul de démonstration — non réglementaire',
            rate: 0,
            isDefault: true,
            purchaseVatRecoverable: false,
          },
        });
      }
    }

    const refreshedEntities = await prisma.entity.findMany({
      where: { code: { in: entityCodes } },
      include: { country: { include: { taxRates: true } } },
      orderBy: { code: 'asc' },
    });
    const actorsByEntity = new Map<string, DemoActors>();
    const markerRecords = new Map<string, string>();
    await prisma.$transaction(async (tx) => {
      for (const entity of refreshedEntities) {
        const preparerUsername = `SYN25-${entity.code}-PREPARER`;
        const reviewerUsername = `SYN25-${entity.code}-REVIEWER`;
        const posterUsername = `SYN25-${entity.code}-POSTER`;
        const users = await Promise.all([
          tx.user.create({
            data: {
              username: preparerUsername,
              passwordHash: await hashPassword(randomBytes(32).toString('hex')),
              role: 'ACCOUNTANT',
              entityId: entity.id,
              isActive: false,
            },
            select: { id: true, username: true, role: true },
          }),
          tx.user.create({
            data: {
              username: reviewerUsername,
              passwordHash: await hashPassword(randomBytes(32).toString('hex')),
              role: 'FINANCIAL_MANAGER',
              entityId: entity.id,
              isActive: false,
            },
            select: { id: true, username: true, role: true },
          }),
          tx.user.create({
            data: {
              username: posterUsername,
              passwordHash: await hashPassword(randomBytes(32).toString('hex')),
              role: 'ADMIN',
              entityId: entity.id,
              isActive: false,
            },
            select: { id: true, username: true, role: true },
          }),
        ]);
        actorsByEntity.set(entity.id, { preparer: users[0], reviewer: users[1], poster: users[2] });
        const configuration = await tx.workbookFeatureConfiguration.create({
          data: {
            entityId: entity.id,
            featureKey: 'SYNTHETIC_2025_2026_DATASET',
            configurationJson: JSON.stringify({ marker, status: 'RUNNING', syntheticOnly: true }),
            enabled: false,
            sourceReference: marker,
            confirmationNote: syntheticNote,
          },
          select: { id: true },
        });
        markerRecords.set(entity.id, configuration.id);
        await tx.workbookFeatureConfigurationRevision.create({
          data: {
            entityId: entity.id,
            featureKey: 'SYNTHETIC_2025_2026_DATASET',
            version: 1,
            configurationJson: JSON.stringify({ marker, status: 'RUNNING', syntheticOnly: true }),
            enabled: false,
            sourceReference: marker,
            actorUserId: users[0].id,
            actorUsername: users[0].username,
          },
        });
      }
    });

    const tunisianEntity = refreshedEntities.find((entity) => entity.country.code === 'TN');
    if (!tunisianEntity) throw new Error('L’entité de démonstration TN n’a pas été rattachée au profil TN.');
    const tnEmployees = await prisma.employee.findMany({
      where: { entityId: tunisianEntity.id },
      orderBy: { empId: 'asc' },
    });
    const requiredEmployees = [
      { empId: 'MEGA25-TN-EMP-003', firstName: 'Nour', lastName: 'Synthétique', position: 'Analyste fictive', baseSalary: 3200, maritalStatus: 'MARRIED', isHeadOfFamily: false, childrenCount: 1, dependentParents: 0 },
      { empId: 'MEGA25-TN-EMP-004', firstName: 'Yassine', lastName: 'Synthétique', position: 'Technicien fictif', baseSalary: 2200, maritalStatus: 'SINGLE', isHeadOfFamily: false, childrenCount: 0, dependentParents: 0 },
      { empId: 'MEGA25-TN-EMP-005', firstName: 'Lina', lastName: 'Synthétique', position: 'Gestionnaire fictive', baseSalary: 1600, maritalStatus: 'SINGLE', isHeadOfFamily: false, childrenCount: 0, dependentParents: 0 },
    ];
    for (const employee of requiredEmployees) {
      await prisma.employee.create({
        data: {
          ...employee,
          email: `${employee.empId.toLowerCase()}@example.invalid`,
          hiredAt: new Date('2024-01-01T00:00:00.000Z'),
          entityId: tunisianEntity.id,
        },
      });
    }
    const allTnEmployees = await prisma.employee.findMany({
      where: { entityId: tunisianEntity.id },
      orderBy: { empId: 'asc' },
    });
    const allEmployeeIds = (await prisma.employee.findMany({
      where: { entityId: { in: refreshedEntities.map((entity) => entity.id) } },
      select: { id: true },
    })).map((employee) => employee.id);
    await prisma.payslip.deleteMany({
      where: { employeeId: { in: allEmployeeIds }, period: '2026-10' },
    });
    for (const year of [2025, 2026]) {
      for (let month = 1; month <= 12; month += 1) {
        const period = `${year}-${String(month).padStart(2, '0')}`;
        for (const employee of allTnEmployees) {
          await HrService.generatePayslip(employee.id, tunisianEntity.id, period, []);
        }
      }
    }

    const runPostedJournal = async (
      entityId: string,
      actors: DemoActors,
      entryNumber: string,
      reference: string,
      date: string,
      description: string,
      requestedLines: JournalLineInput[],
    ) => {
      const lines = summarizeLines(requestedLines);
      const journal = await FinanceService.createJournalEntry({
        entityId,
        entryNumber,
        reference,
        date,
        description,
        lines,
      }, actors.preparer, `Préparation ${marker}; données fictives uniquement.`);
      await FinanceService.approveJournalEntry(
        journal.id,
        entityId,
        actors.reviewer,
        `Contrôle de workflow ${marker}; pas de validation réglementaire.`,
      );
      return FinanceService.postJournalEntry(
        journal.id,
        entityId,
        actors.poster,
        `Comptabilisation de test ${marker}; pas d’opération réelle.`,
      );
    };

    const bankMovementsByEntity = new Map<string, BankMovement[]>();
    const bankAccountByEntity = new Map<string, { id: string; ledgerAccountCode: string; currencyCode: string }>();
    const salesCounts = new Map<string, number>();
    const purchaseCounts = new Map<string, number>();
    for (const entity of refreshedEntities) {
      const actors = actorsByEntity.get(entity.id);
      if (!actors) throw new Error(`Acteurs synthétiques manquants pour ${entity.code}.`);
      const isTn = entity.country.code === 'TN';
      const bankAccount = await prisma.bankAccount.create({
        data: {
          entityId: entity.id,
          name: `Banque ${entity.country.code} — exercice synthétique 2025`,
          currencyCode: entity.country.currencyCode,
          ledgerAccountCode: isTn ? '532' : 'SYN-CASH_EQUIVALENT',
          isActive: true,
        },
        select: { id: true, ledgerAccountCode: true, currencyCode: true },
      });
      bankAccountByEntity.set(entity.id, bankAccount);
      const movements: BankMovement[] = [];
      bankMovementsByEntity.set(entity.id, movements);
      const customer = await prisma.customer.create({
        data: {
          entityId: entity.id,
          code: `SYN25-${entity.code}-CLIENT`,
          name: `Client fictif ${entity.code}`,
          fiscalId: 'SYNTHETIC-NOT-A-REAL-TAX-ID',
          email: `client.${entity.code.toLowerCase()}@example.invalid`,
        },
        select: { id: true },
      });
      const vendor = await prisma.vendor.create({
        data: {
          entityId: entity.id,
          code: `SYN25-${entity.code}-SERV`,
          name: `Prestataire fictif ${entity.code}`,
          fiscalId: 'SYNTHETIC-NOT-A-REAL-TAX-ID',
          email: `prestataire.${entity.code.toLowerCase()}@example.invalid`,
        },
        select: { id: true },
      });
      const taxRate = entity.country.taxRates.find((rate) => rate.rate === (isTn ? 19 : 0));
      if (!taxRate) throw new Error(`Taux de test attendu absent pour ${entity.code}.`);
      const bankCode = bankAccount.ledgerAccountCode;
      const receivableCode = entity.country.salesReceivableAccountCode;
      const payableCode = isTn ? '401' : 'SYN-TRADE_PAYABLE';
      if (!receivableCode || !payableCode) throw new Error(`Mappings comptables absents pour ${entity.code}.`);
      let salesCount = 0;
      let purchaseCount = 0;

      for (let month = 1; month <= 12; month += 1) {
        const period = periodForMonth(month);
        const dueDate = monthDate(period, Math.min(28, lastDay(period)));
        const issueDate = monthDate(period, 10);
        const salesSubTotal = isTn ? 35000 : 15000;
        const purchaseSubTotal = isTn ? 5000 : 6000;
        const salesDraft = await SalesService.createInvoice({
          customerId: customer.id,
          entityId: entity.id,
          issueDate,
          dueDate,
          items: [{
            description: `${marker}: prestation de service fictive ${period}`,
            quantity: 1,
            unitPrice: salesSubTotal,
            taxRate: isTn ? 19 : 0,
          }],
        }, actors.preparer);
        await SalesService.approveInvoice(
          salesDraft.id,
          entity.id,
          actors.reviewer,
          `Facture synthétique à contrôler (${period}).`,
        );
        await SalesService.issueInvoice(
          salesDraft.id,
          entity.id,
          actors.poster,
          `Émission historique synthétique (${period}); aucune vente réelle.`,
        );
        const salesInvoice = await prisma.invoice.findUnique({
          where: { id: salesDraft.id },
          select: { invoiceNumber: true, totalAmount: true },
        });
        if (!salesInvoice) throw new Error(`Facture client introuvable pour ${entity.code}/${period}.`);

        const invoiceNumber = `SYN25-${entity.code}-${period}`;
        const purchaseDraft = await PurchasesService.createDraftInvoice({
          invoiceNumber,
          vendorId: vendor.id,
          issueDate: monthDate(period, 12),
          dueDate,
          subTotal: purchaseSubTotal,
          taxRateId: taxRate.id,
          lines: [{
            description: `${marker}: honoraires de démonstration ${period}`,
            materialId: null,
            quantity: 1,
            unitPrice: purchaseSubTotal,
          }],
        }, entity.id, actors.preparer);
        await PurchasesService.approveInvoice(
          purchaseDraft.id,
          entity.id,
          actors.reviewer,
          `Facture fournisseur synthétique à contrôler (${period}).`,
        );
        await PurchasesService.postInvoice(
          purchaseDraft.id,
          entity.id,
          actors.poster,
          `Comptabilisation historique synthétique (${period}); aucune dépense réelle.`,
        );
        const purchaseInvoice = await prisma.purchaseInvoice.findUnique({
          where: { id: purchaseDraft.id },
          select: { invoiceNumber: true, totalAmount: true },
        });
        if (!purchaseInvoice) throw new Error(`Facture fournisseur introuvable pour ${entity.code}/${period}.`);
        salesCount += 1;
        purchaseCount += 1;

        let withholdingAmount = 0;
        if (isTn) {
          const certificate = await TaxationService.prepareWithholdingCertificate({
            period,
            category: 'honoraires_residents',
            amountTtc: purchaseInvoice.totalAmount,
            declarantType: 'PERSONNE_MORALE',
            isEmployer: true,
            supplierFiscalIdPresent: true,
            certificateNumber: `SYN25-${entity.code}-${period}-RS`,
            sourceType: 'PURCHASE_INVOICE',
            sourceReference: purchaseInvoice.invoiceNumber,
          }, entity.id, actors.preparer);
          await TaxationService.transitionWithholdingCertificate(
            certificate.id,
            entity.id,
            'ISSUE',
            actors.reviewer,
          );
          withholdingAmount = certificate.withholdingAmount;
        }

        const salesReceiptReference = `${marker}-${entity.code}-${period}-SALE-RECEIPT`;
        await runPostedJournal(entity.id, actors, `SYN25-${entity.code}-${period}-SALE-RCPT`, salesReceiptReference, monthDate(period, 20), 'Encaissement client fictif', [
          { accountCode: bankCode, debit: salesInvoice.totalAmount, credit: 0, description: 'Encaissement synthétique' },
          { accountCode: receivableCode, debit: 0, credit: salesInvoice.totalAmount, description: 'Règlement client synthétique' },
        ]);
        movements.push({
          date: monthDate(period, 20),
          description: `Encaissement fictif ${period}`,
          amount: roundAmount(salesInvoice.totalAmount),
          reference: salesReceiptReference,
        });

        const supplierNetPayment = roundAmount(purchaseInvoice.totalAmount - withholdingAmount);
        const supplierPaymentReference = `${marker}-${entity.code}-${period}-SUPPLIER-PAY`;
        await runPostedJournal(entity.id, actors, `SYN25-${entity.code}-${period}-SUPP-PAY`, supplierPaymentReference, monthDate(period, 22), 'Règlement fournisseur fictif', [
          { accountCode: payableCode, debit: purchaseInvoice.totalAmount, credit: 0, description: 'Dette fournisseur synthétique' },
          { accountCode: bankCode, debit: 0, credit: supplierNetPayment, description: 'Paiement fournisseur synthétique' },
          ...(withholdingAmount > 0
            ? [{ accountCode: '438', debit: 0, credit: withholdingAmount, description: 'Retenue RS synthétique à reverser' }]
            : []),
        ]);
        movements.push({
          date: monthDate(period, 22),
          description: `Paiement fournisseur fictif ${period}`,
          amount: -supplierNetPayment,
          reference: supplierPaymentReference,
        });

        if (isTn && withholdingAmount > 0) {
          const withholdingPaymentReference = `${marker}-${entity.code}-${period}-RS-REMIT`;
          await runPostedJournal(entity.id, actors, `SYN25-${entity.code}-${period}-RS-REMIT`, withholdingPaymentReference, monthDate(period, 25), 'Reversement RS fictif', [
            { accountCode: '438', debit: withholdingAmount, credit: 0, description: 'Règlement RS synthétique' },
            { accountCode: bankCode, debit: 0, credit: withholdingAmount, description: 'Paiement fiscal synthétique' },
          ]);
          movements.push({
            date: monthDate(period, 25),
            description: `Reversement RS fictif ${period}`,
            amount: -withholdingAmount,
            reference: withholdingPaymentReference,
          });
        }

        if (isTn) {
          const payslips = await prisma.payslip.findMany({
            where: { employeeId: { in: allTnEmployees.map((employee) => employee.id) }, period },
          });
          if (payslips.length !== allTnEmployees.length) {
            throw new Error(`Paies TN incomplètes pour ${period}.`);
          }
          const total = {
            gross: roundAmount(payslips.reduce((sum, payslip) => sum + payslip.grossSalary, 0)),
            employeeCnss: roundAmount(payslips.reduce((sum, payslip) => sum + payslip.employeeCnss, 0)),
            employerCnss: roundAmount(payslips.reduce((sum, payslip) => sum + payslip.employerCnss, 0)),
            foprolos: roundAmount(payslips.reduce((sum, payslip) => sum + payslip.foprolos, 0)),
            retirementContribution: roundAmount(payslips.reduce((sum, payslip) => sum + (payslip.retirementContribution ?? 0), 0)),
            irpp: roundAmount(payslips.reduce((sum, payslip) => sum + payslip.irpp, 0)),
            css: roundAmount(payslips.reduce((sum, payslip) => sum + payslip.css, 0)),
            net: roundAmount(payslips.reduce((sum, payslip) => sum + payslip.netSalary, 0)),
          };
          await runPostedJournal(entity.id, actors, `SYN25-${entity.code}-${period}-PAYROLL`, `${marker}-${entity.code}-${period}-PAYROLL-ACCRUAL`, monthDate(period, 26), 'Paie et charges sociales fictives', [
            { accountCode: '640', debit: total.gross, credit: 0, description: 'Salaires bruts calculés par le module de paie' },
            { accountCode: '647', debit: total.employerCnss + total.foprolos, credit: 0, description: 'Charges patronales selon le paramétrage copié' },
            { accountCode: '421', debit: 0, credit: total.net, description: 'Salaires nets à payer' },
            { accountCode: '434', debit: 0, credit: total.employeeCnss + total.employerCnss + total.foprolos, description: 'Cotisations sociales à reverser' },
            { accountCode: '438', debit: 0, credit: total.irpp, description: 'IRPP retenu sur paie' },
            { accountCode: '432', debit: 0, credit: total.css, description: 'CSS retenue sur paie' },
            { accountCode: 'SYN-RETIREMENT-PAYABLE', debit: 0, credit: total.retirementContribution, description: 'Retraite complémentaire synthétique à reverser' },
          ]);
          const payrollPaymentReference = `${marker}-${entity.code}-${period}-PAYROLL-PAY`;
          await runPostedJournal(entity.id, actors, `SYN25-${entity.code}-${period}-PAY-PAY`, payrollPaymentReference, monthDate(period, 28), 'Paiement net des salaires fictifs', [
            { accountCode: '421', debit: total.net, credit: 0, description: 'Règlement des salaires nets' },
            { accountCode: bankCode, debit: 0, credit: total.net, description: 'Virement salarial synthétique' },
          ]);
          movements.push({
            date: monthDate(period, 28),
            description: `Paie nette fictive ${period}`,
            amount: -total.net,
            reference: payrollPaymentReference,
          });
          if (total.retirementContribution > 0) {
            const retirementPaymentReference = `${marker}-${entity.code}-${period}-RETIREMENT-PAY`;
            await runPostedJournal(entity.id, actors, `SYN25-${entity.code}-${period}-RET-PAY`, retirementPaymentReference, monthDate(period, 28), 'Reversement retraite complémentaire fictif', [
              { accountCode: 'SYN-RETIREMENT-PAYABLE', debit: total.retirementContribution, credit: 0, description: 'Règlement retraite complémentaire synthétique' },
              { accountCode: bankCode, debit: 0, credit: total.retirementContribution, description: 'Paiement retraite synthétique' },
            ]);
            movements.push({
              date: monthDate(period, 28),
              description: `Retraite complémentaire fictive ${period}`,
              amount: -total.retirementContribution,
              reference: retirementPaymentReference,
            });
          }

          await TaxationService.recordTaxDeclarationWorkpaper({
            period,
            section: 'RS',
            sourceReference: `${marker}-${entity.code}-${period}-RS`,
            reviewNote: 'Certificats et paiements synthétiques; revue professionnelle et dépôt non réalisés.',
            confirmed: true,
          }, entity.id, actors.reviewer);
          await TaxationService.recordTaxDeclarationWorkpaper({
            period,
            section: 'G50',
            sourceReference: `${marker}-${entity.code}-${period}-G50-TVA`,
            reviewNote: 'Composant TVA calculé sur pièces synthétiques; total légal G50 non calculé.',
            confirmed: true,
          }, entity.id, actors.reviewer);
        }
      }
      salesCounts.set(entity.id, salesCount);
      purchaseCounts.set(entity.id, purchaseCount);
    }

    const reconciliationCounts = new Map<string, number>();
    const closingBalances = new Map<string, number>();
    for (const entity of refreshedEntities) {
      const actors = actorsByEntity.get(entity.id)!;
      const bankAccount = bankAccountByEntity.get(entity.id)!;
      const movements = bankMovementsByEntity.get(entity.id)!;
      let runningBalance = entity.country.code === 'TN' ? 1000000 : 250000;
      const rows = movements.map((movement) => {
        runningBalance = roundAmount(runningBalance + movement.amount);
        return [
          movement.date,
          movement.description,
          amountText(movement.amount),
          movement.reference,
          amountText(runningBalance),
        ].map(csvCell).join(',');
      });
      const csv = [
        ['date', 'description', 'amount', 'reference', 'balance'].join(','),
        ...rows,
      ].join('\n');
      const statement = await CashflowBankingService.importStatement({
        bankAccountId: bankAccount.id,
        csv,
        importedByUserId: actors.preparer.id,
      }, entity.id);
      const statementLines = await prisma.bankStatementLine.findMany({
        where: { statementId: statement.id, entityId: entity.id },
        select: { id: true, externalReference: true },
      });
      for (const statementLine of statementLines) {
        if (!statementLine.externalReference) throw new Error('Référence bancaire synthétique absente.');
        const journal = await prisma.journalEntry.findFirst({
          where: { entityId: entity.id, reference: statementLine.externalReference, status: 'POSTED' },
          include: { lines: true },
        });
        const journalLine = journal?.lines.find((line) => line.accountCode === bankAccount.ledgerAccountCode);
        if (!journalLine) throw new Error(`Ligne de grand livre bancaire absente pour ${statementLine.externalReference}.`);
        await CashflowBankingService.reconcile({
          statementLineId: statementLine.id,
          journalLineId: journalLine.id,
          userId: actors.poster.id,
        }, entity.id);
      }
      if (statementLines.length !== movements.length) {
        throw new Error(`Le relevé ${entity.code} ne contient pas toutes les opérations attendues.`);
      }
      reconciliationCounts.set(entity.id, statementLines.length);
      closingBalances.set(entity.id, runningBalance);

      if (entity.country.code === 'TN') {
        const fiscalYearProfit = await (async () => {
          const periodStart = new Date('2025-01-01T00:00:00.000Z');
          const periodEnd = new Date('2026-01-01T00:00:00.000Z');
          const [journalLines, accounts] = await Promise.all([
            prisma.journalLine.findMany({
              where: {
                journalEntry: {
                  entityId: entity.id,
                  status: 'POSTED',
                  date: { gte: periodStart, lt: periodEnd },
                },
              },
              select: { accountCode: true, debit: true, credit: true },
            }),
            prisma.chartOfAccount.findMany({
              where: { countryId: entity.countryId },
              select: { code: true, type: true },
            }),
          ]);
          const typeByCode = new Map(accounts.map((account) => [account.code, account.type]));
          const balances = new Map<string, { debit: number; credit: number }>();
          for (const line of journalLines) {
            const balance = balances.get(line.accountCode) ?? { debit: 0, credit: 0 };
            balance.debit += line.debit;
            balance.credit += line.credit;
            balances.set(line.accountCode, balance);
          }
          let revenue = 0;
          let expenses = 0;
          for (const [code, balance] of balances) {
            if (typeByCode.get(code) === 'Revenue') revenue += balance.credit - balance.debit;
            if (typeByCode.get(code) === 'Expense') expenses += balance.debit - balance.credit;
          }
          return { revenue: roundAmount(revenue), expenses: roundAmount(expenses), result: roundAmount(revenue - expenses) };
        })();
        const taxBase = Math.max(0, fiscalYearProfit.result);
        const taxRate = entity.country.corporateTax;
        if (taxRate === null || !Number.isFinite(taxRate)) throw new Error('Taux IS absent du profil TN copié.');
        const corporateTax = roundAmount(taxBase * taxRate / 100);
        for (const [period, base, amount] of [
          ['2025-12', taxBase, corporateTax],
          [
            '2026-12',
            Math.max(0, roundAmount((35000 - 5000) * 12 - (await prisma.payslip.findMany({
              where: { employeeId: { in: allTnEmployees.map((employee) => employee.id) }, period: { startsWith: '2026-' } },
              select: { grossSalary: true, employerCnss: true, foprolos: true },
            })).reduce((sum, payslip) => sum + payslip.grossSalary + payslip.employerCnss + payslip.foprolos, 0))),
            0,
          ],
        ] as const) {
          const resolvedAmount = period === '2026-12' ? roundAmount(base * taxRate / 100) : amount;
          await TaxationService.recordTaxDeclarationWorkpaper({
            period,
            section: 'IS',
            sourceReference: `${marker}-${entity.code}-${period}-IS`,
            reviewNote: 'Estimation sur scénario synthétique; aucun retraitement, avis professionnel ou dépôt n’est attesté.',
            confirmed: true,
            taxableBase: base,
            amount: resolvedAmount,
          }, entity.id, actors.reviewer);
        }

        const closingDate = '2025-12-31';
        const periodStart = new Date('2025-01-01T00:00:00.000Z');
        const periodEnd = new Date('2026-01-01T00:00:00.000Z');
        const [journalLines, accounts] = await Promise.all([
          prisma.journalLine.findMany({
            where: { journalEntry: { entityId: entity.id, status: 'POSTED', date: { gte: periodStart, lt: periodEnd } } },
            select: { accountCode: true, debit: true, credit: true },
          }),
          prisma.chartOfAccount.findMany({
            where: { countryId: entity.countryId },
            select: { code: true, type: true },
          }),
        ]);
        const accountType = new Map(accounts.map((account) => [account.code, account.type]));
        const balances = new Map<string, { debit: number; credit: number }>();
        for (const line of journalLines) {
          const balance = balances.get(line.accountCode) ?? { debit: 0, credit: 0 };
          balance.debit += line.debit;
          balance.credit += line.credit;
          balances.set(line.accountCode, balance);
        }
        const closingLines: JournalLineInput[] = [];
        for (const [code, balance] of balances) {
          if (accountType.get(code) === 'Revenue' && balance.credit > balance.debit) {
            closingLines.push({ accountCode: code, debit: roundAmount(balance.credit - balance.debit), credit: 0, description: 'Clôture synthétique des produits 2025' });
          }
          if (accountType.get(code) === 'Expense' && balance.debit > balance.credit) {
            closingLines.push({ accountCode: code, debit: 0, credit: roundAmount(balance.debit - balance.credit), description: 'Clôture synthétique des charges 2025' });
          }
        }
        const netResult = roundAmount(fiscalYearProfit.result);
        closingLines.push({
          accountCode: '120',
          debit: netResult < 0 ? Math.abs(netResult) : 0,
          credit: netResult > 0 ? netResult : 0,
          description: 'Résultat pré-IS du scénario synthétique 2025',
        });
        await runPostedJournal(
          entity.id,
          actors,
          `SYN25-${entity.code}-PL-CLOSE`,
          `${marker}-${entity.code}-2025-PL-CLOSE`,
          closingDate,
          'Clôture synthétique des comptes de résultat 2025',
          closingLines,
        );
      } else {
        const periodStart = new Date('2025-01-01T00:00:00.000Z');
        const periodEnd = new Date('2026-01-01T00:00:00.000Z');
        const [journalLines, accounts] = await Promise.all([
          prisma.journalLine.findMany({
            where: { journalEntry: { entityId: entity.id, status: 'POSTED', date: { gte: periodStart, lt: periodEnd } } },
            select: { accountCode: true, debit: true, credit: true },
          }),
          prisma.chartOfAccount.findMany({
            where: { countryId: entity.countryId },
            select: { code: true, type: true },
          }),
        ]);
        const accountType = new Map(accounts.map((account) => [account.code, account.type]));
        const balances = new Map<string, { debit: number; credit: number }>();
        for (const line of journalLines) {
          const balance = balances.get(line.accountCode) ?? { debit: 0, credit: 0 };
          balance.debit += line.debit;
          balance.credit += line.credit;
          balances.set(line.accountCode, balance);
        }
        let revenue = 0;
        let expenses = 0;
        const closingLines: JournalLineInput[] = [];
        for (const [code, balance] of balances) {
          if (accountType.get(code) === 'Revenue') {
            const value = roundAmount(balance.credit - balance.debit);
            revenue += value;
            if (value > 0) closingLines.push({ accountCode: code, debit: value, credit: 0, description: 'Clôture synthétique des produits 2025' });
          }
          if (accountType.get(code) === 'Expense') {
            const value = roundAmount(balance.debit - balance.credit);
            expenses += value;
            if (value > 0) closingLines.push({ accountCode: code, debit: 0, credit: value, description: 'Clôture synthétique des charges 2025' });
          }
        }
        const result = roundAmount(revenue - expenses);
        closingLines.push({
          accountCode: 'SYN-EQUITY',
          debit: result < 0 ? Math.abs(result) : 0,
          credit: result > 0 ? result : 0,
          description: 'Résultat synthétique 2025',
        });
        await runPostedJournal(
          entity.id,
          actors,
          `SYN25-${entity.code}-PL-CLOSE`,
          `${marker}-${entity.code}-2025-PL-CLOSE`,
          '2025-12-31',
          'Clôture synthétique des comptes de résultat 2025',
          closingLines,
        );
      }

      const allPeriods = Array.from({ length: 12 }, (_, index) => periodForMonth(index + 1));
      for (const period of allPeriods) {
        for (const check of MONTHLY_CLOSE_CHECKS) {
          await MonthlyCloseService.recordCheck({
            entityId: entity.id,
            period,
            checkKey: check.key,
            checked: true,
            note: `${marker}: simulation de contrôle; aucune validation professionnelle ou conformité légale n’est attestée.`,
            actorUserId: actors.reviewer.id,
            actorUsername: actors.reviewer.username,
          });
        }
        await MonthlyCloseService.lockPeriod({
          entityId: entity.id,
          period,
          note: `${marker}: verrouillage de test; ne vaut pas clôture réelle.`,
          actorUserId: actors.poster.id,
          actorUsername: actors.poster.username,
        });
      }
      for (const check of ANNUAL_CLOSE_CHECKS) {
        await MonthlyCloseService.recordCheck({
          entityId: entity.id,
          period: '2025',
          checkKey: check.key,
          checked: true,
          note: `${marker}: simulation de contrôle; inventaire, cut-off, fiscalité et archivage réels non certifiés.`,
          actorUserId: actors.reviewer.id,
          actorUsername: actors.reviewer.username,
        });
      }
      await MonthlyCloseService.lockPeriod({
        entityId: entity.id,
        period: '2025',
        note: `${marker}: clôture annuelle simulée uniquement; ne constitue pas une clôture comptable ou fiscale réelle.`,
        actorUserId: actors.poster.id,
        actorUsername: actors.poster.username,
      });
    }

    for (const entity of refreshedEntities) {
      const actors = actorsByEntity.get(entity.id)!;
      const bankAccount = bankAccountByEntity.get(entity.id)!;
      const forecast = await prisma.cashForecastScenario.create({
        data: {
          entityId: entity.id,
          bankAccountId: bankAccount.id,
          name: `${marker}-${entity.code}-2026-FORECAST`,
          currencyCode: entity.country.currencyCode,
          openingBalance: closingBalances.get(entity.id),
          openingBalanceDate: new Date('2025-12-31T00:00:00.000Z'),
          openingBalanceSource: `${marker}: solde de relevé fictif rapproché`,
        },
        select: { id: true },
      });
      const forecastItems: Array<{
        expectedDate: Date;
        description: string;
        direction: string;
        amount: number;
        category: string;
        sourceType: string;
        sourceId: string;
      }> = [];
      const isTn = entity.country.code === 'TN';
      const forecastPayslips = isTn
        ? await prisma.payslip.findMany({
          where: {
            employeeId: { in: allTnEmployees.map((employee) => employee.id) },
            period: { startsWith: '2026-' },
          },
        })
        : [];
      for (let month = 1; month <= 12; month += 1) {
        const period = `2026-${String(month).padStart(2, '0')}`;
        const expectedDate = new Date(`${period}-15T00:00:00.000Z`);
        const monthlyPayslips = forecastPayslips.filter((payslip) => payslip.period === period);
        const payrollNet = roundAmount(monthlyPayslips.reduce((sum, payslip) => sum + payslip.netSalary, 0));
        const retirementContribution = roundAmount(monthlyPayslips.reduce(
          (sum, payslip) => sum + (payslip.retirementContribution ?? 0),
          0,
        ));
        const monthlySales = isTn ? 35000 : 15000;
        const monthlyPurchases = isTn ? 5000 : 6000;
        const taxRate = isTn ? 19 : 0;
        const salesTax = roundAmount(monthlySales * taxRate / 100);
        const purchaseTax = roundAmount(monthlyPurchases * taxRate / 100);
        const withholding = isTn ? roundAmount((monthlyPurchases + purchaseTax) * 0.15) : 0;
        const totalSales = roundAmount(monthlySales + salesTax + (isTn ? Number(entity.country.stampDuty ?? 0) : 0));
        const totalPurchase = roundAmount(monthlyPurchases + purchaseTax);
        forecastItems.push(
          {
            expectedDate,
            description: `${marker}: encaissements ventes prévisionnels ${period}`,
            direction: 'INFLOW',
            amount: totalSales,
            category: 'SYNTHETIC_SALES',
            sourceType: 'SYNTHETIC_FORECAST',
            sourceId: `${period}-sales`,
          },
          {
            expectedDate,
            description: `${marker}: règlements fournisseurs prévisionnels ${period}`,
            direction: 'OUTFLOW',
            amount: roundAmount(totalPurchase - withholding),
            category: 'SYNTHETIC_SUPPLIERS',
            sourceType: 'SYNTHETIC_FORECAST',
            sourceId: `${period}-suppliers`,
          },
        );
        if (isTn) {
          forecastItems.push(
            {
              expectedDate,
              description: `${marker}: paie nette prévisionnelle ${period}`,
              direction: 'OUTFLOW',
              amount: payrollNet,
              category: 'SYNTHETIC_PAYROLL',
              sourceType: 'SYNTHETIC_FORECAST',
              sourceId: `${period}-payroll`,
            },
            {
              expectedDate,
              description: `${marker}: retraite complémentaire prévisionnelle ${period}`,
              direction: 'OUTFLOW',
              amount: retirementContribution,
              category: 'SYNTHETIC_RETIREMENT',
              sourceType: 'SYNTHETIC_FORECAST',
              sourceId: `${period}-retirement`,
            },
            {
              expectedDate,
              description: `${marker}: retenue RS prévisionnelle ${period}`,
              direction: 'OUTFLOW',
              amount: withholding,
              category: 'SYNTHETIC_RS',
              sourceType: 'SYNTHETIC_FORECAST',
              sourceId: `${period}-rs`,
            },
            {
              expectedDate,
              description: `${marker}: TVA nette prévisionnelle ${period}`,
              direction: 'OUTFLOW',
              amount: Math.max(0, roundAmount(salesTax - purchaseTax)),
              category: 'SYNTHETIC_VAT',
              sourceType: 'SYNTHETIC_FORECAST',
              sourceId: `${period}-vat`,
            },
          );
        }
      }
      if (isTn) {
        const annualPayroll = forecastPayslips.reduce(
          (sum, payslip) => sum + payslip.grossSalary + payslip.employerCnss + payslip.foprolos,
          0,
        );
        const forecastBase = Math.max(0, roundAmount((35000 - 5000) * 12 - annualPayroll));
        const projectedTax = roundAmount(forecastBase * Number(entity.country.corporateTax ?? 0) / 100);
        for (const month of [4, 8, 12]) {
          const period = `2026-${String(month).padStart(2, '0')}`;
          forecastItems.push({
            expectedDate: new Date(`${period}-15T00:00:00.000Z`),
            description: `${marker}: avance IS prévisionnelle non déposée ${period}`,
            direction: 'OUTFLOW',
            amount: roundAmount(projectedTax / 3),
            category: 'SYNTHETIC_IS_ADVANCE',
            sourceType: 'SYNTHETIC_FORECAST',
            sourceId: `${period}-is-advance`,
          });
        }
      }
      await prisma.cashForecastItem.createMany({
        data: forecastItems.map((item) => ({ ...item, entityId: entity.id, scenarioId: forecast.id, status: 'PLANNED' })),
      });
      await prisma.workbookFeatureConfiguration.update({
        where: { id: markerRecords.get(entity.id)! },
        data: {
          configurationJson: JSON.stringify({
            marker,
            status: 'COMPLETE',
            syntheticOnly: true,
            year2025: {
              salesInvoices: salesCounts.get(entity.id),
              purchaseInvoices: purchaseCounts.get(entity.id),
              reconciledBankLines: reconciliationCounts.get(entity.id),
            },
            year2026: 'Paie TN calculée; trésorerie et IS prévisionnels en brouillon.',
            warning: syntheticNote,
          }),
          confirmationNote: syntheticNote,
        },
      });
      await prisma.workbookFeatureConfigurationRevision.create({
        data: {
          entityId: entity.id,
          featureKey: 'SYNTHETIC_2025_2026_DATASET',
          version: 2,
          configurationJson: JSON.stringify({ marker, status: 'COMPLETE', syntheticOnly: true }),
          enabled: false,
          sourceReference: marker,
          actorUserId: actors.poster.id,
          actorUsername: actors.poster.username,
        },
      });
    }

    const [sqliteIntegrity, foreignKeyViolations] = await Promise.all([
      prisma.$queryRaw<Array<{ integrity_check: string }>>`PRAGMA integrity_check`,
      prisma.$queryRaw<Array<Record<string, unknown>>>`PRAGMA foreign_key_check`,
    ]);
    if (sqliteIntegrity[0]?.integrity_check !== 'ok' || foreignKeyViolations.length > 0) {
      throw new Error('La vérification SQLite a détecté une anomalie d’intégrité.');
    }

    const tunisianActors = actorsByEntity.get(tunisianEntity.id);
    if (!tunisianActors) throw new Error('Acteur synthétique TN absent pour vérifier les workpapers.');
    const tunisianWorkpapers = await TaxationService.getTaxDeclarationWorkpapers(
      tunisianEntity.id,
      tunisianActors.reviewer,
    );
    const g50Workpapers = tunisianWorkpapers.filter((workpaper) => workpaper.section === 'G50' && workpaper.period.startsWith('2025-'));
    const rsWorkpapers = tunisianWorkpapers.filter((workpaper) => workpaper.section === 'RS' && workpaper.period.startsWith('2025-'));
    if (g50Workpapers.length !== 12 || g50Workpapers.some((workpaper) => !workpaper.sourceCurrent)
      || rsWorkpapers.length !== 12 || rsWorkpapers.some((workpaper) => !workpaper.sourceCurrent)) {
      throw new Error('Les workpapers G50/RS 2025 ne sont pas tous cohérents avec leurs sources synthétiques.');
    }

    const closeLocks = await prisma.monthlyCloseLock.count({
      where: { entityId: { in: refreshedEntities.map((entity) => entity.id) }, period: { startsWith: '2025-' } },
    });
    const annualLocks = await prisma.monthlyCloseLock.count({
      where: { entityId: { in: refreshedEntities.map((entity) => entity.id) }, period: '2025' },
    });
    if (closeLocks !== 48 || annualLocks !== 4) {
      throw new Error('Les verrous de clôture synthétique attendus sont incomplets.');
    }
    console.log(JSON.stringify({
      marker,
      syntheticOnly: true,
      entities: refreshedEntities.length,
      year2025: {
        salesInvoices: [...salesCounts.values()].reduce((sum, count) => sum + count, 0),
        purchaseInvoices: [...purchaseCounts.values()].reduce((sum, count) => sum + count, 0),
        tnPayslips: 60,
        tnG50Workpapers: g50Workpapers.length,
        tnRsWorkpapers: rsWorkpapers.length,
        reconciledBankLines: [...reconciliationCounts.values()].reduce((sum, count) => sum + count, 0),
        monthlyLocks: closeLocks,
        annualLocks,
      },
      year2026: {
        tnPayslips: 60,
        forecastOnly: true,
        inactiveTechnicalUsers: refreshedEntities.length * 3,
      },
      sqliteIntegrity: sqliteIntegrity[0]?.integrity_check,
      foreignKeyViolations: foreignKeyViolations.length,
      warning: syntheticNote,
    }, null, 2));
  } finally {
    await Promise.all([prisma.$disconnect(), sourcePrisma.$disconnect()]);
  }
}

main().catch((error: unknown) => {
  console.error('Échec du seed synthétique 2025-2026 :', error);
  process.exitCode = 1;
});
