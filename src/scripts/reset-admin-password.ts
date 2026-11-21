import { randomBytes } from 'node:crypto';
import { resolve, dirname, basename, isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import sqlite3 from 'sqlite3';
import { hashPassword } from '../application/security/passwords';
import { readHiddenPassword } from './hidden-password';

const DEFAULT_DATABASE_URL = 'file:../data.db';
const SCHEMA_DIRECTORY = resolve(__dirname, '../data/prisma');
type BackupCapableDatabase = sqlite3.Database & {
  backup(
    destination: string,
    callback: (error: Error | null) => void,
  ): {
    step(pages: number, callback: (error: Error | null, complete: boolean) => void): void;
    finish(callback: () => void): void;
  };
};

function getDatabasePath(databaseUrl: string): string {
  const [fileUrl, ...queryParts] = databaseUrl.split('?');
  if (!fileUrl.startsWith('file:')) {
    throw new Error('La base doit utiliser une URL SQLite de type file:.');
  }

  const query = new URLSearchParams(queryParts.join('?'));
  let filename = decodeURIComponent(fileUrl.slice('file:'.length));
  if (!filename || filename === ':memory:' || query.get('mode') === 'memory') {
    throw new Error('Une base SQLite persistante est requise pour créer une sauvegarde.');
  }

  filename = filename.replace(/^\/+([A-Za-z]:[\\/])/, '$1');
  return isAbsolute(filename) ? filename : resolve(SCHEMA_DIRECTORY, filename);
}

async function createBackup(databasePath: string): Promise<string> {
  if (!existsSync(databasePath)) {
    throw new Error(`Base SQLite introuvable : ${databasePath}`);
  }

  const timestamp = new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '');
  let backupPath: string;
  while (true) {
    backupPath = resolve(
      dirname(databasePath),
      `${basename(databasePath)}.backup-${timestamp}-${randomBytes(4).toString('hex')}`,
    );
    try {
      const reservation = await open(backupPath, 'wx');
      await reservation.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }

  try {
    return await new Promise((resolveBackup, rejectBackup) => {
      const source = new sqlite3.Database(
        databasePath,
        sqlite3.OPEN_READONLY,
        (openError) => {
          if (openError) {
            rejectBackup(openError);
            return;
          }

          let closing = false;
          const closeSource = (error?: Error | null) => {
            if (closing) return;
            closing = true;
            source.close((closeError) => {
              if (error) rejectBackup(error);
              else if (closeError) rejectBackup(closeError);
              else resolveBackup(backupPath);
            });
          };
          const backup = (source as BackupCapableDatabase).backup(
            backupPath,
            (openBackupError) => {
              if (openBackupError) {
                closeSource(openBackupError);
                return;
              }

              const finishBackup = (backupError?: Error | null) => {
                backup.finish(() => closeSource(backupError));
              };
              const copy = () => {
                backup.step(-1, (stepError, complete) => {
                  if (stepError) finishBackup(stepError);
                  else if (complete) finishBackup();
                  else copy();
                });
              };
              copy();
            },
          );
        },
      );
    });
  } catch (error) {
    await unlink(backupPath).catch(() => undefined);
    throw error;
  }
}

export async function resetUserPassword(
  databaseUrl: string,
  username: string,
  newPassword: string,
): Promise<string> {
  if (!username.trim()) throw new Error('Le nom d’utilisateur ne peut pas être vide.');
  if (Array.from(newPassword).length < 12) {
    throw new Error('Le mot de passe doit contenir au moins 12 caractères.');
  }

  const databasePath = getDatabasePath(databaseUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!user) throw new Error(`Aucun compte « ${username} » n’existe dans cette base.`);

    const passwordHash = await hashPassword(newPassword);
    const backupPath = await createBackup(databasePath);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
      select: { id: true },
    });
    return backupPath;
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const usernames = process.argv.slice(2);
  if (usernames.length > 1 || usernames[0]?.startsWith('-')) {
    throw new Error('Usage : npm run reset-admin-password [nom_utilisateur]');
  }

  const username = usernames[0] ?? 'admin';
  const databaseUrl = process.env.SAFE_ERP_RESET_DATABASE_URL ?? DEFAULT_DATABASE_URL;
  let password = await readHiddenPassword('Nouveau mot de passe (saisie masquée) : ');
  let confirmation = '';
  try {
    confirmation = await readHiddenPassword('Confirmez le mot de passe : ');
    if (password !== confirmation) throw new Error('Les mots de passe ne correspondent pas.');

    const backupPath = await resetUserPassword(databaseUrl, username, password);
    process.stdout.write(`Mot de passe réinitialisé pour « ${username} ». Sauvegarde : ${backupPath}\n`);
  } finally {
    password = '';
    confirmation = '';
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Erreur inconnue.';
    process.stderr.write(`Échec de la réinitialisation : ${message}\n`);
    process.exitCode = 1;
  });
}
