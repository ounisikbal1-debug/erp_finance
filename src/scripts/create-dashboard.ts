import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createFinancialDashboardWorkbook } from './financial-dashboard-workbook';
import AdvancedFinanceService from '../application/modules/advanced-finance/service';
import prisma from '../data/prisma/client';
import { renderFinancialDashboardPage, type FinancialDashboardSnapshot } from './financial-dashboard-page';

function getOutputPath(): string {
  const configuredPath = process.env.SAFE_DASHBOARD_EXPORT_PATH?.trim();
  if (configuredPath) return path.resolve(configuredPath);

  const profile = process.env.USERPROFILE || homedir();
  const desktop = [
    path.join(profile, 'OneDrive', 'Desktop'),
    path.join(profile, 'Desktop'),
  ].find((candidate) => existsSync(candidate));
  if (!desktop) {
    throw new Error('Bureau introuvable. Définissez SAFE_DASHBOARD_EXPORT_PATH vers un chemin de fichier.');
  }
  return path.join(desktop, 'SAFE - Tableau de bord financier.html');
}

async function main(): Promise<void> {
  const entities = await prisma.entity.findMany({ select: { id: true } });
  if (entities.length === 0) throw new Error('Aucune entité SAFE disponible pour générer le tableau de bord.');

  const asOf = new Date();
  const snapshots: FinancialDashboardSnapshot[] = [];
  for (const entity of entities) {
    snapshots.push(await AdvancedFinanceService.getDashboardSummary(entity.id, asOf));
  }

  const outputPath = getOutputPath();
  if (!existsSync(path.dirname(outputPath))) {
    throw new Error(`Le dossier de sortie n'existe pas : ${path.dirname(outputPath)}`);
  }
  const workbookPath = `${outputPath.slice(0, -path.extname(outputPath).length)}.xlsx`;
  const exportLabel = process.env.SAFE_DASHBOARD_EXPORT_LABEL?.trim();
  const temporaryHtml = `${outputPath}.${randomUUID()}.tmp`;
  const temporaryWorkbook = `${workbookPath}.${randomUUID()}.tmp`;
  try {
    const workbook = createFinancialDashboardWorkbook(snapshots, asOf, 12, exportLabel);
    await workbook.xlsx.writeFile(temporaryWorkbook);
    await writeFile(
      temporaryHtml,
      renderFinancialDashboardPage(snapshots, path.basename(workbookPath), exportLabel),
      { encoding: 'utf8', flag: 'wx' },
    );
    await rename(temporaryHtml, outputPath);
    await rename(temporaryWorkbook, workbookPath);
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    for (const temporaryPath of [temporaryHtml, temporaryWorkbook]) {
      try {
        await unlink(temporaryPath);
      } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
          cleanupErrors.push(cleanupError);
        }
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError([error, ...cleanupErrors], 'Échec de la génération et du nettoyage des fichiers temporaires du tableau de bord.');
    }
    throw error;
  }
  console.log(`Tableau de bord SAFE exporté : ${outputPath}`);
  console.log(`Classeur Excel SAFE exporté : ${workbookPath}`);
}

main()
  .catch((error: unknown) => {
    console.error('Échec de la génération du tableau de bord SAFE :', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
