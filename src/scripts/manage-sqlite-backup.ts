import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import {
  createSqliteBackup,
  restoreSqliteBackup,
} from './sqlite-backup';

function getDatabasePath(databaseUrl: string): string {
  const [fileUrl, ...queryParts] = databaseUrl.split('?');
  if (!fileUrl.startsWith('file:')) {
    throw new Error('La base doit utiliser une URL SQLite de type file:.');
  }

  const query = new URLSearchParams(queryParts.join('?'));
  let filename = decodeURIComponent(fileUrl.slice('file:'.length));
  if (!filename || filename === ':memory:' || query.get('mode') === 'memory') {
    throw new Error('Une base SQLite persistante est requise.');
  }

  filename = filename.replace(/^\/+([A-Za-z]:[\\/])/, '$1');
  if (!isAbsolute(filename)) {
    throw new Error('SAFE_ERP_DATABASE_URL doit contenir un chemin SQLite absolu.');
  }
  return resolve(filename);
}

function defaultBackupPath(databasePath: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '');
  let backupPath: string;
  do {
    backupPath = resolve(
      dirname(databasePath),
      `${basename(databasePath)}.backup-${timestamp}-${randomBytes(8).toString('hex')}.sqlite`,
    );
  } while (existsSync(backupPath));
  return backupPath;
}

async function main(): Promise<void> {
  const [operation, ...args] = process.argv.slice(2);
  const databaseUrl = process.env.SAFE_ERP_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('SAFE_ERP_DATABASE_URL doit désigner explicitement la base SQLite cible.');
  }
  const databasePath = getDatabasePath(databaseUrl);

  if (operation === 'backup' && args.length <= 1) {
    const backupPath = resolve(args[0] ?? defaultBackupPath(databasePath));
    await createSqliteBackup(databasePath, backupPath);
    process.stdout.write(`Sauvegarde SQLite créée et vérifiée : ${backupPath}\n`);
    return;
  }

  if (operation === 'restore' && args.length === 2 && args[1] === '--confirm-target-offline') {
    const backupPath = resolve(args[0]);
    const rollbackPath = await restoreSqliteBackup(databasePath, backupPath, true);
    process.stdout.write(
      `Restauration SQLite vérifiée. Sauvegarde pré-restauration conservée : ${rollbackPath}\n`,
    );
    return;
  }

  throw new Error(
    'Usage : npm run db:backup [chemin_sauvegarde] | ' +
    'npm run db:restore -- chemin_sauvegarde.sqlite --confirm-target-offline',
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Erreur inconnue.';
    process.stderr.write(`Échec de l’opération de sauvegarde/restauration : ${message}\n`);
    process.exitCode = 1;
  });
}
