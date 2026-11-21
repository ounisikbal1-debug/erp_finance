import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import sqlite3 from 'sqlite3';
import prisma from '../core/models/prisma';

const draftDirectoryName = 'SAFE_ERP-DRAFT 1';
const entityCode = 'TN01';
const deductibleVatRateCodes = ['TVA_7', 'TVA_13', 'TVA_19'];

function assertDraftDirectory() {
  if (basename(resolve(process.cwd())).toLocaleLowerCase() !== draftDirectoryName.toLocaleLowerCase()) {
    throw new Error(`Opération refusée : lancez ce script depuis le dossier ${draftDirectoryName}.`);
  }
}

function createDatabaseBackup(databasePath: string): Promise<string> {
  const backupPath = `${databasePath}.vat-deductible-backup-${new Date().toISOString().replace(/[-:.TZ]/g, '')}.sqlite`;
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
  if (!existsSync(databasePath)) throw new Error('Base de données du draft introuvable; aucune donnée n’a été modifiée.');

  const entity = await prisma.entity.findUnique({
    where: { code: entityCode },
    select: {
      id: true,
      countryId: true,
      country: { select: { code: true, isDefault: true, purchaseVatAccountCode: true } },
    },
  });
  if (!entity || entity.country.code !== 'TN' || !entity.country.isDefault) {
    throw new Error('Activation refusée : TN01 doit être rattachée au profil tunisien actif du draft.');
  }
  if (entity.country.purchaseVatAccountCode !== '4366') {
    throw new Error('Activation refusée : le compte TVA déductible tunisien configuré n’est pas 4366.');
  }
  const [vatAccount, rates] = await Promise.all([
    prisma.chartOfAccount.findFirst({
      where: { countryId: entity.countryId, code: '4366', type: 'Asset', isPostingAllowed: true },
      select: { code: true },
    }),
    prisma.taxRate.findMany({
      where: { countryId: entity.countryId, code: { in: deductibleVatRateCodes } },
      select: { id: true, code: true, rate: true },
    }),
  ]);
  if (!vatAccount) throw new Error('Activation refusée : le compte 4366 doit être un compte d’actif comptabilisable.');
  const expectedRates = new Map([['TVA_7', 7], ['TVA_13', 13], ['TVA_19', 19]]);
  if (rates.length !== expectedRates.size || rates.some((rate) => expectedRates.get(rate.code) !== rate.rate)) {
    throw new Error('Activation refusée : les taux TN 7%, 13% et 19% doivent tous exister avec leurs valeurs attendues.');
  }

  const backupPath = await createDatabaseBackup(databasePath);
  try {
    await prisma.taxRate.updateMany({
      where: { countryId: entity.countryId, code: { in: deductibleVatRateCodes } },
      data: { purchaseVatRecoverable: true },
    });
    const verified = await prisma.taxRate.findMany({
      where: { countryId: entity.countryId, code: { in: deductibleVatRateCodes } },
      select: { code: true, rate: true, purchaseVatRecoverable: true },
      orderBy: { rate: 'asc' },
    });
    if (verified.length !== deductibleVatRateCodes.length || verified.some((rate) => !rate.purchaseVatRecoverable)) {
      throw new Error('La vérification après sauvegarde a échoué; la sauvegarde préalable est conservée.');
    }
    console.log([
      'Option TVA déductible activée uniquement pour le profil Tunisie du draft.',
      ...verified.map((rate) => `${rate.code}: ${rate.rate}% — récupérable`),
      'TVA_0 reste non récupérable; aucun autre pays ni la base SAFE originale n’a été modifié.',
      'Sauvegarde préalable : ' + backupPath,
    ].join('\n'));
  } catch (error) {
    console.error(`Échec de mise à jour; la sauvegarde préalable est conservée à ${backupPath}.`);
    throw error;
  }
}

main()
  .catch((error: unknown) => {
    console.error('Erreur d’activation de la TVA déductible:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
