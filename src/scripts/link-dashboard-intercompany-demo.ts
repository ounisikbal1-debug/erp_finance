import prisma from '../core/models/prisma';
import IntercompanyService from '../application/modules/intercompany/service';

const DEMO_DATABASE_URLS = new Set([
  'file:../dashboard-demo-synthetic.db',
  'file:../mega-demo-synthetic.db',
]);
const RUN_MARKER = 'SAFE-SYNTHETIC-COMPLETE-2026';
const pairs = [
  { seller: 'SAFE-DEMO-001', buyer: 'SAFE-FR-001', month: 1, sellerAmount: 12000, exchangeRate: 0.3 },
  { seller: 'SAFE-FR-001', buyer: 'SAFE-MA-001', month: 2, sellerAmount: 9800, exchangeRate: 10.2 },
  { seller: 'SAFE-DEMO-001', buyer: 'SAFE-AE-001', month: 3, sellerAmount: 13500, exchangeRate: 1.15 },
  { seller: 'SAFE-MA-001', buyer: 'SAFE-AE-001', month: 4, sellerAmount: 11600, exchangeRate: 0.1 },
] as const;
const ENTITY_CODES = ['SAFE-AE-001', 'SAFE-DEMO-001', 'SAFE-FR-001', 'SAFE-MA-001'] as const;
const tndValueByCurrency: Record<string, number> = { TND: 1, EUR: 3.35, MAD: 0.33, AED: 0.85 };

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

async function main() {
  if (!DEMO_DATABASE_URLS.has(process.env.SAFE_ERP_DATABASE_URL ?? '')
    || process.env.SAFE_ERP_DASHBOARD_DEMO_CONFIRM !== 'YES') {
    throw new Error('Refusé : ce script ne fonctionne que sur la base de démonstration dédiée explicitement confirmée.');
  }
  const [countries, demoEntities] = await Promise.all([
    prisma.countryProfile.findMany({ where: { code: { in: ['ZZ', 'FR', 'MA', 'AE'] } }, select: { code: true, name: true } }),
    prisma.entity.findMany({ where: { code: { in: [...ENTITY_CODES] } }, select: { code: true, name: true } }),
  ]);
  if (countries.length !== 4 || demoEntities.length !== 4
    || countries.some((country) => !/synthétique|fictif/i.test(country.name))
    || demoEntities.some((entity) => !/synthétique|fictive/i.test(entity.name))) {
    throw new Error('Le jeu multinational synthétique attendu doit être présent avant de lier ses opérations interco natives.');
  }

  let linked = 0;
  for (const pair of pairs) {
    const tradeLabel = `${pair.seller}-${pair.buyer}-${pair.month.toString().padStart(2, '0')}`;
    const sellerEntryNumber = `INTERCO-${tradeLabel}-SELLER`;
    const buyerEntryNumber = `INTERCO-${tradeLabel}-BUYER`;
    const buyerAmountMillimes = Math.round(pair.sellerAmount * pair.exchangeRate * 1000);
    if (!Number.isSafeInteger(buyerAmountMillimes) || buyerAmountMillimes <= 0) {
      throw new Error(`Montant converti invalide pour ${tradeLabel}.`);
    }
    const buyerAmount = buyerAmountMillimes / 1000;
    const reference = `SAFE-IC-2026-${pair.month.toString().padStart(2, '0')}`;
    const [sellerEntity, buyerEntity, sellerEntry, buyerEntry] = await Promise.all([
      prisma.entity.findUnique({ where: { code: pair.seller }, include: { country: true } }),
      prisma.entity.findUnique({ where: { code: pair.buyer }, include: { country: true } }),
      prisma.journalEntry.findFirst({ where: { entryNumber: sellerEntryNumber, reference: RUN_MARKER }, include: { lines: true } }),
      prisma.journalEntry.findFirst({ where: { entryNumber: buyerEntryNumber, reference: RUN_MARKER }, include: { lines: true } }),
    ]);
    if (!sellerEntity || !buyerEntity || !sellerEntry || !buyerEntry) {
      throw new Error(`Les sociétés ou pièces POSTED de la paire ${tradeLabel} sont incomplètes.`);
    }
    if (!/synthétique|fictive/i.test(sellerEntity.name) || !/synthétique|fictive/i.test(buyerEntity.name)) {
      throw new Error(`La paire ${tradeLabel} ne pointe pas vers des entités explicitement fictives.`);
    }
    if (sellerEntry.status !== 'POSTED' || buyerEntry.status !== 'POSTED') {
      throw new Error(`Les pièces existantes de ${tradeLabel} doivent être POSTED pour leur import historique.`);
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.intercompanyTransaction.findUnique({ where: { reference } });
      if (existing) {
        if (existing.sellerJournalEntryId !== sellerEntry.id
          || existing.buyerJournalEntryId !== buyerEntry.id
          || existing.sellerAmount !== pair.sellerAmount
          || existing.buyerAmount !== buyerAmount
          || existing.exchangeRate !== pair.exchangeRate) {
          throw new Error(`La transaction native ${reference} existe avec des valeurs différentes; aucune modification automatique.`);
        }
        if (existing.status === 'POSTED') {
          await tx.intercompanyTransaction.update({
            where: { id: existing.id },
            data: {
              status: 'RECONCILED',
              sellerReconciledByUserId: 'SAFE-DEMO-SELLER-CONTROLLER',
              sellerReconciledAt: sellerEntry.date,
              buyerReconciledByUserId: 'SAFE-DEMO-BUYER-CONTROLLER',
              buyerReconciledAt: buyerEntry.date,
            },
          });
        }
        return;
      }

      const buyerLines = await tx.journalLine.findMany({ where: { journalEntryId: buyerEntry.id } });
      if (buyerLines.length !== 2
        || !buyerLines.some((line) => line.accountCode === 'SYN-INVENTORY')
        || !buyerLines.some((line) => line.accountCode === 'SYN-TRADE_PAYABLE')) {
        throw new Error(`Les lignes de la pièce acheteur ${buyerEntryNumber} ne correspondent pas au modèle interco synthétique.`);
      }
      for (const line of buyerLines) {
        await tx.journalLine.update({
          where: { id: line.id },
          data: line.debit > 0
            ? { debit: buyerAmount }
            : line.credit > 0
              ? { credit: buyerAmount }
              : (() => { throw new Error(`Ligne sans montant positif dans ${buyerEntryNumber}.`); })(),
        });
      }
      await tx.intercompanyTransaction.create({
        data: {
          reference,
          description: `Opération de marchandises fictive ${tradeLabel}`,
          sellerEntityId: sellerEntity.id,
          buyerEntityId: buyerEntity.id,
          transactionDate: sellerEntry.date,
          currencyCode: sellerEntity.country.currencyCode,
          sellerAmount: pair.sellerAmount,
          buyerAmount,
          exchangeRate: pair.exchangeRate,
          sellerReceivableAccountCode: 'SYN-TRADE_RECEIVABLE',
          sellerRevenueAccountCode: 'SYN-REVENUE',
          buyerInventoryAccountCode: 'SYN-INVENTORY',
          buyerPayableAccountCode: 'SYN-TRADE_PAYABLE',
          sellerJournalEntryId: sellerEntry.id,
          buyerJournalEntryId: buyerEntry.id,
          status: 'POSTED',
          createdByUserId: 'SAFE-DEMO',
          approvedByUserId: 'SAFE-DEMO-CONTROL',
          approvedAt: sellerEntry.date,
          sellerReconciledByUserId: 'SAFE-DEMO-SELLER-CONTROLLER',
          sellerReconciledAt: sellerEntry.date,
          buyerReconciledByUserId: 'SAFE-DEMO-BUYER-CONTROLLER',
          buyerReconciledAt: buyerEntry.date,
        },
      });
      linked += 1;
    });
  }
  let created = 0;
  for (let index = 0; index < 26; index += 1) {
    const sellerCode = ENTITY_CODES[index % ENTITY_CODES.length];
    const buyerOffset = 1 + (Math.floor(index / ENTITY_CODES.length) % (ENTITY_CODES.length - 1));
    const buyerCode = ENTITY_CODES[(index + buyerOffset) % ENTITY_CODES.length];
    const month = (index % 10) + 1;
    const day = ((index * 7) % 25) + 1;
    const reference = `SAFE-IC-2026-OPS-${pad(index + 1)}`;
    const transactionDate = new Date(Date.UTC(2026, month - 1, day));
    const [sellerEntity, buyerEntity] = await Promise.all([
      prisma.entity.findUnique({ where: { code: sellerCode }, include: { country: true } }),
      prisma.entity.findUnique({ where: { code: buyerCode }, include: { country: true } }),
    ]);
    if (!sellerEntity || !buyerEntity) throw new Error(`Entité absente pour l’opération ${reference}.`);
    const exchangeRate = tndValueByCurrency[sellerEntity.country.currencyCode]
      / tndValueByCurrency[buyerEntity.country.currencyCode];
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      throw new Error(`Taux synthétique invalide pour l’opération ${reference}.`);
    }
    const sellerAmount = Math.round((1800 + index * 237.125) * 1000) / 1000;
    const buyerAmount = Math.round(sellerAmount * exchangeRate * 1000) / 1000;
    const existing = await prisma.intercompanyTransaction.findUnique({ where: { reference } });
    if (existing) {
      if (existing.sellerEntityId !== sellerEntity.id
        || existing.buyerEntityId !== buyerEntity.id
        || existing.sellerAmount !== sellerAmount
        || existing.buyerAmount !== buyerAmount
        || Math.abs(existing.exchangeRate - exchangeRate) > 1e-12) {
        throw new Error(`La transaction native ${reference} existe avec des valeurs différentes; aucune modification automatique.`);
      }
      if (existing.transactionDate.toISOString().slice(0, 10) !== transactionDate.toISOString().slice(0, 10)) {
        await prisma.$transaction(async (tx) => {
          await tx.intercompanyTransaction.update({
            where: { id: existing.id },
            data: { transactionDate },
          });
          await Promise.all([
            tx.journalEntry.updateMany({
              where: { id: existing.sellerJournalEntryId, entityId: sellerEntity.id },
              data: { date: transactionDate },
            }),
            tx.journalEntry.updateMany({
              where: { id: existing.buyerJournalEntryId, entityId: buyerEntity.id },
              data: { date: transactionDate },
            }),
          ]);
        });
      }
      continue;
    }

    const transaction = await IntercompanyService.create({
      buyerEntityId: buyerEntity.id,
      reference,
      description: `Vente synthétique de marchandises ${sellerCode} vers ${buyerCode}`,
      date: transactionDate.toISOString().slice(0, 10),
      currencyCode: sellerEntity.country.currencyCode,
      sellerAmount,
      buyerAmount,
      exchangeRate,
      sellerReceivableAccountCode: 'SYN-TRADE_RECEIVABLE',
      sellerRevenueAccountCode: 'SYN-REVENUE',
      buyerInventoryAccountCode: 'SYN-INVENTORY',
      buyerPayableAccountCode: 'SYN-TRADE_PAYABLE',
    }, sellerEntity.id, { id: 'SAFE-DEMO-MAKER', username: 'SAFE-DEMO-MAKER' });
    await IntercompanyService.approve(transaction.id, sellerEntity.id, {
      id: 'SAFE-DEMO-CONTROLLER',
      username: 'SAFE-DEMO-CONTROLLER',
    });
    await IntercompanyService.post(transaction.id, sellerEntity.id, {
      id: 'SAFE-DEMO-POSTER',
      username: 'SAFE-DEMO-POSTER',
    });
    await IntercompanyService.reconcile(transaction.id, sellerEntity.id, {
      id: 'SAFE-DEMO-SELLER-CONTROLLER',
      username: 'SAFE-DEMO-SELLER-CONTROLLER',
    });
    await IntercompanyService.reconcile(transaction.id, buyerEntity.id, {
      id: 'SAFE-DEMO-BUYER-CONTROLLER',
      username: 'SAFE-DEMO-BUYER-CONTROLLER',
    });
    created += 1;
  }
  console.log(JSON.stringify({
    synthetic: true,
    linkedLegacyTransactions: linked,
    createdNativeTransactions: created,
    totalNativeTransactions: await prisma.intercompanyTransaction.count(),
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error('Échec de liaison des transactions interco de démonstration :', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
