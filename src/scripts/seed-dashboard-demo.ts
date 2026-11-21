import { existsSync } from 'node:fs';
import path from 'node:path';
import prisma from '../data/prisma/client';
import { FINANCIAL_ACCOUNT_CATEGORIES, type FinancialAccountCategory } from '../application/modules/advanced-finance/financial-categories';

const demoDatabaseUrl = 'file:../dashboard-demo-synthetic.db';
const demoDatabasePath = path.resolve(__dirname, '../data/dashboard-demo-synthetic.db');
const demoCountryCode = 'ZZ';
const demoEntityCode = 'SAFE-DEMO-001';

function requireDemoDatabase(): void {
  if (process.env.SAFE_ERP_DATABASE_URL !== demoDatabaseUrl
    || process.env.SAFE_ERP_DASHBOARD_DEMO_CONFIRM !== 'YES') {
    throw new Error('Initialisation refusée : définissez SAFE_ERP_DATABASE_URL=file:../dashboard-demo-synthetic.db et SAFE_ERP_DASHBOARD_DEMO_CONFIRM=YES.');
  }
  if (!existsSync(demoDatabasePath)) {
    throw new Error(`Base de démonstration introuvable : ${demoDatabasePath}. Initialisez d’abord le schéma SQLite dans cette base dédiée.`);
  }
}

async function main(): Promise<void> {
  requireDemoDatabase();
  await prisma.$transaction(async (tx) => {
    if (await tx.countryProfile.findUnique({ where: { code: demoCountryCode } })
      || await tx.entity.findUnique({ where: { code: demoEntityCode } })) {
      throw new Error('La base synthétique contient déjà les données de démonstration; aucune donnée n’a été modifiée.');
    }

    const country = await tx.countryProfile.create({
      data: {
        code: demoCountryCode,
        name: 'Pays fictif de démonstration',
        currencyCode: 'TND',
        currencySymbol: 'DT',
        isDefault: true,
      },
    });
    const entity = await tx.entity.create({
      data: {
        code: demoEntityCode,
        name: 'SAFE Démonstration Synthétique (fictive)',
        countryId: country.id,
      },
    });
    const categories = Object.entries(FINANCIAL_ACCOUNT_CATEGORIES) as Array<
      [FinancialAccountCategory, (typeof FINANCIAL_ACCOUNT_CATEGORIES)[FinancialAccountCategory]]
    >;
    for (const [financialCategory, details] of categories) {
      const classNumber = details.accountType === 'Asset' || details.accountType === 'Equity'
        ? 1
        : details.accountType === 'Liability' ? 4 : details.accountType === 'Revenue' ? 7 : 6;
      await tx.chartOfAccount.create({
        data: {
          countryId: country.id,
          code: `SYN-${financialCategory}`,
          description: `Compte synthétique — ${details.label}`,
          classNumber,
          type: details.accountType,
          financialCategory,
        },
      });
    }

    const openingDate = new Date(Date.UTC(new Date().getUTCFullYear() - 1, new Date().getUTCMonth() - 1, 1));
    const activityDate = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 3, 10));
    const openingLines = [
      ['CASH_EQUIVALENT', 700, 0],
      ['NONCURRENT_ASSET', 300, 0],
      ['INVENTORY', 400, 0],
      ['TRADE_RECEIVABLE', 100, 0],
      ['TRADE_PAYABLE', 0, 150],
      ['EQUITY', 0, 1350],
    ] as const;
    const activityLines = [
      ['CASH_EQUIVALENT', 350, 0],
      ['TRADE_RECEIVABLE', 150, 0],
      ['REVENUE', 0, 500],
      ['COST_OF_GOODS_SOLD', 200, 0],
      ['INVENTORY', 0, 200],
      ['PURCHASES', 100, 0],
      ['TRADE_PAYABLE', 0, 100],
      ['OPERATING_EXPENSE', 50, 0],
      ['CASH_EQUIVALENT', 0, 50],
      ['INTEREST_EXPENSE', 150, 0],
      ['CASH_EQUIVALENT', 0, 150],
    ] as const;
    const createEntry = async (
      entryNumber: string,
      date: Date,
      description: string,
      lines: readonly (readonly [string, number, number])[],
    ) => tx.journalEntry.create({
      data: {
        entryNumber,
        entityId: entity.id,
        date,
        description,
        status: 'POSTED',
        lines: {
          create: lines.map(([category, debit, credit]) => ({
            accountCode: `SYN-${category}`,
            debit,
            credit,
            description: 'Donnée fictive de démonstration',
          })),
        },
      },
    });
    await createEntry('DEMO-OPENING-001', openingDate, 'Soldes d’ouverture synthétiques équilibrés', openingLines);
    await createEntry('DEMO-ACTIVITY-001', activityDate, 'Activité synthétique équilibrée de démonstration', activityLines);

    const customer = await tx.customer.create({
      data: {
        entityId: entity.id,
        code: 'SYN-CUSTOMER-001',
        name: 'Client fictif de démonstration',
      },
    });
    await tx.invoice.create({
      data: {
        invoiceNumber: 'SYN-INV-001',
        entityId: entity.id,
        customerId: customer.id,
        currencyCode: 'TND',
        subTotal: 500,
        taxAmount: 0,
        stampDuty: 0,
        totalAmount: 500,
        status: 'ISSUED',
        createdAt: activityDate,
        issuedAt: activityDate,
      },
    });
    await tx.material.create({
      data: {
        entityId: entity.id,
        sku: 'SYN-MAT-001',
        name: 'Matière fictive de démonstration',
        quantity: 10,
        unitPrice: 30,
        costPrice: 20,
      },
    });
  });
  console.log(`Données synthétiques créées pour ${demoEntityCode} dans ${demoDatabasePath}.`);
}

main()
  .catch((error: unknown) => {
    console.error('Échec de l’initialisation synthétique du tableau de bord :', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
