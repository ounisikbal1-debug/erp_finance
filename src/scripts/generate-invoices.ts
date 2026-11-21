import { PrismaClient } from '@prisma/client';
import PurchasesService from '../application/modules/purchases/service';
import SalesService from '../application/modules/sales/service';

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:../data.db' } },
});

const ENTITY_CODE = 'TN01';
const YEAR = 2026;
const MONTHS_PER_YEAR = YEAR === new Date().getUTCFullYear()
  ? new Date().getUTCMonth() + 1
  : 12;
const INVOICES_PER_MONTH = 10;
const PREFIX = 'SCÉNARIO SYNTHÉTIQUE — ';

const PURCHASE_DESCRIPTIONS = [
  'Achat de matériel informatique', 'Fournitures de bureau', 'Achat de matières premières',
  'Services de maintenance', 'Achat de carburant', 'Télécommunications et internet',
  'Loyer de locaux', 'Assurance professionnelle', 'Achat de petits équipements',
  'Honoraires comptables',
];

const SALES_DESCRIPTIONS = [
  'Vente de produits finis', 'Prestation de services', 'Vente de marchandises',
  'Installation et configuration', 'Formation client', 'Maintenance préventive',
  'Vente de pièces de rechange', 'Conseil technique', 'Livraison de matériel',
  'Support technique annuel',
];

function amountFor(index: number, month: number, kind: number): number {
  // Valeur reproductible et précise au millime, sans tirage aléatoire.
  return Math.round((180 + ((index * 137 + month * 89 + kind * 53) % 4820)) * 1000) / 1000;
}

function invoiceDate(year: number, month: number, index: number): string {
  const lastCalendarDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const latestAllowedDay = year === new Date().getUTCFullYear() && month === new Date().getUTCMonth()
    ? new Date().getUTCDate()
    : lastCalendarDay;
  const day = Math.min(2 + ((index * 2 + month) % 26), latestAllowedDay);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function nextMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 1));
}

function dueDateThirtyDaysAfter(date: string): string {
  const due = new Date(`${date}T00:00:00.000Z`);
  due.setUTCDate(due.getUTCDate() + 30);
  return due.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const entity = await prisma.entity.findUnique({
    where: { code: ENTITY_CODE },
    include: { country: true },
  });
  if (!entity) throw new Error(`Société ${ENTITY_CODE} introuvable.`);

  const [vendors, customers, taxRate, actor] = await Promise.all([
    prisma.vendor.findMany({ where: { entityId: entity.id }, orderBy: { code: 'asc' } }),
    prisma.customer.findMany({ where: { entityId: entity.id }, orderBy: { code: 'asc' } }),
    prisma.taxRate.findFirst({
      where: { countryId: entity.countryId, code: 'TVA_19' },
      orderBy: { rate: 'desc' },
    }),
    prisma.user.findFirst({ where: { entityId: entity.id, role: 'ADMIN', isActive: true } }),
  ]);
  if (!vendors.length || !customers.length) throw new Error('Aucun fournisseur ou client actif pour cette société.');
  if (!taxRate) throw new Error('Le taux TVA_19 configuré pour le pays est introuvable.');
  if (!actor) throw new Error('Aucun utilisateur administrateur actif pour créer les brouillons.');

  let createdPurchases = 0;
  let createdSales = 0;
  for (let month = 0; month < MONTHS_PER_YEAR; month += 1) {
    const start = new Date(Date.UTC(YEAR, month, 1));
    const end = nextMonthStart(YEAR, month);
    const [purchaseCount, salesCount] = await Promise.all([
      prisma.purchaseInvoice.count({ where: { entityId: entity.id, issueDate: { gte: start, lt: end } } }),
      prisma.invoice.count({ where: { entityId: entity.id, createdAt: { gte: start, lt: end } } }),
    ]);

    for (let index = purchaseCount; index < INVOICES_PER_MONTH; index += 1) {
      const date = invoiceDate(YEAR, month, index);
      const amount = amountFor(index, month, 1);
      const invoiceNumber = `SYN-ACH-${YEAR}${String(month + 1).padStart(2, '0')}-${String(index + 1).padStart(3, '0')}`;
      await PurchasesService.createDraftInvoice({
        invoiceNumber,
        vendorId: vendors[index % vendors.length].id,
        issueDate: date,
        dueDate: dueDateThirtyDaysAfter(date),
        subTotal: amount,
        taxRateId: taxRate.id,
        lines: [{
          description: `${PREFIX}${PURCHASE_DESCRIPTIONS[index % PURCHASE_DESCRIPTIONS.length]}`,
          materialId: null,
          quantity: 1,
          unitPrice: amount,
        }],
      }, entity.id, { id: actor.id, username: actor.username });
      createdPurchases += 1;
    }

    for (let index = salesCount; index < INVOICES_PER_MONTH; index += 1) {
      const date = invoiceDate(YEAR, month, index);
      const amount = amountFor(index, month, 2);
      await SalesService.createInvoice({
        customerId: customers[index % customers.length].id,
        entityId: entity.id,
        issueDate: date,
        dueDate: dueDateThirtyDaysAfter(date),
        items: [{
          description: `${PREFIX}${SALES_DESCRIPTIONS[index % SALES_DESCRIPTIONS.length]}`,
          quantity: 1,
          unitPrice: amount,
          taxRate: taxRate.rate,
        }],
      }, { id: actor.id, username: actor.username });
      createdSales += 1;
    }
  }

  console.log(`Année ${YEAR} : ${createdPurchases} facture(s) d'achat et ${createdSales} facture(s) de vente ajoutées.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
