import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import sqlite3 from 'sqlite3';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const draftDirectoryName = 'SAFE_ERP-DRAFT 1';
const entityCode = 'TN01';
const tunisiaMapping = {
  salesReceivableAccountCode: '411',
  salesRevenueAccountCode: '701',
  salesVatAccountCode: '4367',
  salesStampDutyAccountCode: '432',
  purchaseExpenseAccountCode: '601',
  purchaseVatAccountCode: '4366',
} as const;
const cashflowMapping = {
  receivableAccountCode: '411',
  payableAccountCode: '401',
} as const;

function assertDraftDirectory() {
  if (basename(resolve(process.cwd())).toLocaleLowerCase() !== draftDirectoryName.toLocaleLowerCase()) {
    throw new Error(`Opération refusée : lancez ce script depuis le dossier ${draftDirectoryName}.`);
  }
}

function createDatabaseBackup(databasePath: string): Promise<string> {
  const backupPath = `${databasePath}.tunisia-mapping-backup-${new Date().toISOString().replace(/[-:.TZ]/g, '')}.sqlite`;
  return new Promise((resolveBackup, rejectBackup) => {
    const source = new sqlite3.Database(databasePath, (openError) => {
      if (openError) {
        rejectBackup(openError);
        return;
      }
      const escapedPath = backupPath.replace(/'/g, "''");
      source.exec(`VACUUM INTO '${escapedPath}'`, (backupError) => {
        source.close((closeError) => {
          if (backupError) rejectBackup(backupError);
          else if (closeError) rejectBackup(closeError);
          else resolveBackup(backupPath);
        });
      });
    });
  });
}

async function main() {
  assertDraftDirectory();
  const databasePath = resolve(__dirname, '../data/data.db');
  if (!existsSync(databasePath)) throw new Error('Base de données du draft introuvable.');

  const entity = await prisma.entity.findUnique({
    where: { code: entityCode },
    select: { id: true, countryId: true, country: { select: { code: true } } },
  });
  if (!entity || entity.country.code !== 'TN') {
    throw new Error(`La société ${entityCode} n’est pas rattachée au profil tunisien; aucune modification effectuée.`);
  }

  const [accounts, otherCountries] = await Promise.all([
    prisma.chartOfAccount.findMany({
      where: {
        countryId: entity.countryId,
        code: { in: ['411', '701', '4367', '432', '601', '4366', '401'] },
      },
      select: { code: true, type: true, isPostingAllowed: true },
    }),
    prisma.countryProfile.findMany({
      where: { code: { not: 'TN' } },
      select: { code: true },
    }),
  ]);
  const expectedTypes: Record<string, string> = {
    '411': 'Asset',
    '701': 'Revenue',
    '4367': 'Liability',
    '432': 'Liability',
    '601': 'Expense',
    '4366': 'Asset',
    '401': 'Liability',
  };
  const invalidAccounts = Object.entries(expectedTypes).filter(([code, type]) => !accounts.some(
    (account) => account.code === code && account.type === type && account.isPostingAllowed,
  ));
  if (invalidAccounts.length) {
    throw new Error(`Comptes tunisiens absents, non comptabilisables ou de type inattendu : ${invalidAccounts.map(([code]) => code).join(', ')}.`);
  }

  const backupPath = await createDatabaseBackup(databasePath);
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.countryProfile.update({
        where: { code: 'TN' },
        data: tunisiaMapping,
      });
      await transaction.cashflowAccountingMapping.upsert({
        where: { entityId: entity.id },
        create: { entityId: entity.id, ...cashflowMapping },
        update: cashflowMapping,
      });
    });
  } catch (error) {
    console.error(`Échec de mise à jour; la sauvegarde est conservée à ${backupPath}.`);
    throw error;
  }

  const [country, mapping] = await Promise.all([
    prisma.countryProfile.findUniqueOrThrow({
      where: { code: 'TN' },
      select: {
        code: true,
        salesReceivableAccountCode: true,
        salesRevenueAccountCode: true,
        salesVatAccountCode: true,
        salesStampDutyAccountCode: true,
        purchaseExpenseAccountCode: true,
        purchaseVatAccountCode: true,
      },
    }),
    prisma.cashflowAccountingMapping.findUniqueOrThrow({
      where: { entityId: entity.id },
      select: { receivableAccountCode: true, payableAccountCode: true },
    }),
  ]);
  if (JSON.stringify(country) !== JSON.stringify({ code: 'TN', ...tunisiaMapping })
    || JSON.stringify(mapping) !== JSON.stringify(cashflowMapping)) {
    throw new Error(`La vérification post-écriture a échoué. Sauvegarde conservée à ${backupPath}.`);
  }

  console.log([
    'Mapping tunisien appliqué au draft uniquement; aucun autre profil pays ni SAFE original n’a été modifié.',
    `Ventes/achats: ${JSON.stringify(tunisiaMapping)}`,
    `Encaissements/paiements: ${JSON.stringify(cashflowMapping)}`,
    'Le timbre utilise le compte 432 conformément à ARCHITECTURE_SAFE_TUNISIE.md et au test de service; le SAFE original avait 4367 sur ce champ.',
    'purchaseVatRecoverable et les mappings de stock restent inchangés.',
    `Sauvegarde préalable: ${backupPath}`,
    otherCountries.length ? `Autres profils préservés: ${otherCountries.map(({ code }) => code).join(', ')}` : 'Aucun autre profil pays n’a été activé.',
  ].join('\n'));
}

main()
  .catch((error: unknown) => {
    console.error('Erreur de configuration du mapping tunisien du draft:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
