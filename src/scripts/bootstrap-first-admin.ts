import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../application/security/passwords';
import { createSqliteBackup } from './sqlite-backup';
import { readHiddenPassword } from './hidden-password';

const SCHEMA_DIRECTORY = resolve(__dirname, '../data/prisma');

export class FirstAdminBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FirstAdminBootstrapError';
  }
}

function getDatabasePath(databaseUrl: string): string {
  const [fileUrl, ...queryParts] = databaseUrl.split('?');
  if (!fileUrl.startsWith('file:')) {
    throw new FirstAdminBootstrapError('Le bootstrap accepte uniquement une base SQLite locale.');
  }
  const query = new URLSearchParams(queryParts.join('?'));
  if (query.get('mode') === 'memory' || query.get('immutable') === '1') {
    throw new FirstAdminBootstrapError('Une base SQLite persistante et inscriptible est requise.');
  }

  let filename = decodeURIComponent(fileUrl.slice('file:'.length));
  if (!filename || filename === ':memory:' || query.get('mode') === 'ro') {
    throw new FirstAdminBootstrapError('Une base SQLite persistante et inscriptible est requise.');
  }
  filename = filename.replace(/^\/+([A-Za-z]:[\\/])/, '$1');
  if (!isAbsolute(filename)) {
    throw new FirstAdminBootstrapError('L’URL de base doit contenir un chemin SQLite absolu.');
  }
  return resolve(filename);
}

function validateInput(username: string, password: string): string {
  const normalizedUsername = username.trim();
  if (!/^[A-Za-z0-9._-]{3,100}$/.test(normalizedUsername)) {
    throw new FirstAdminBootstrapError(
      'L’identifiant doit contenir 3 à 100 caractères (lettres, chiffres, point, tiret ou souligné).',
    );
  }
  if (password.length < 12 || password.length > 1024) {
    throw new FirstAdminBootstrapError('Le mot de passe doit contenir de 12 à 1024 caractères.');
  }
  return normalizedUsername;
}

function createBackupPath(databasePath: string): string {
  return resolve(
    dirname(databasePath),
    `${basename(databasePath)}.first-admin-${Date.now()}-${randomUUID()}.sqlite`,
  );
}

function assertNoSqliteSidecars(databasePath: string): void {
  const sidecars = [`${databasePath}-wal`, `${databasePath}-shm`, `${databasePath}-journal`]
    .filter(existsSync);
  if (sidecars.length) {
    throw new FirstAdminBootstrapError(
      'La base semble active ou non fermée proprement; arrêtez SAFE et réessayez après vérification.',
    );
  }
}

export async function bootstrapFirstAdmin(
  databaseUrl: string,
  username: string,
  password: string,
): Promise<string> {
  const normalizedUsername = validateInput(username, password);
  const databasePath = getDatabasePath(databaseUrl);
  if (!existsSync(databasePath)) {
    throw new FirstAdminBootstrapError('La base SQLite cible est introuvable.');
  }
  assertNoSqliteSidecars(databasePath);

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    if (await prisma.user.count() !== 0) {
      throw new FirstAdminBootstrapError(
        'Le bootstrap est réservé à une base sans compte; utilisez la réinitialisation pour un compte existant.',
      );
    }

    const backupPath = createBackupPath(databasePath);
    await createSqliteBackup(databasePath, backupPath);
    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async (transaction) => {
      if (await transaction.user.count() !== 0) {
        throw new FirstAdminBootstrapError('Un compte a été créé entre-temps; aucun nouveau compte n’a été ajouté.');
      }
      await transaction.user.create({
        data: { username: normalizedUsername, passwordHash, role: 'ADMIN', isActive: true },
        select: { id: true },
      });
    });
    return backupPath;
  } finally {
    await prisma.$disconnect();
  }
}

function getSafeErrorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object' || !('code' in error)) return undefined;
  return typeof error.code === 'string' && /^P\d{4}$/.test(error.code) ? error.code : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length > 1 || args[0]?.startsWith('-')) {
    throw new FirstAdminBootstrapError('Usage : npm run bootstrap-admin [nom_utilisateur]');
  }
  const username = args[0] ?? 'admin';
  const databaseUrl = process.env.SAFE_ERP_BOOTSTRAP_DATABASE_URL;
  if (!databaseUrl) {
    throw new FirstAdminBootstrapError(
      'Définissez SAFE_ERP_BOOTSTRAP_DATABASE_URL avec le chemin absolu de la base DRAFT2.',
    );
  }

  let password = await readHiddenPassword('Mot de passe initial (saisie masquée) : ');
  let confirmation = '';
  try {
    confirmation = await readHiddenPassword('Confirmez le mot de passe : ');
    if (password !== confirmation) {
      throw new FirstAdminBootstrapError('Les mots de passe ne correspondent pas.');
    }
    const backupPath = await bootstrapFirstAdmin(databaseUrl, username, password);
    process.stdout.write(`Premier administrateur créé. Sauvegarde SQLite vérifiée : ${backupPath}\n`);
  } finally {
    password = '';
    confirmation = '';
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    if (error instanceof FirstAdminBootstrapError) {
      process.stderr.write(`Échec du bootstrap : ${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    process.stderr.write('Échec du bootstrap; aucun détail de base ou secret n’a été journalisé. ');
    const errorCode = getSafeErrorCode(error);
    process.stderr.write(JSON.stringify({
      errorType: error instanceof Error ? error.name : 'UnknownError',
      ...(errorCode ? { errorCode } : {}),
    }) + '\n');
    process.exitCode = 1;
  });
}
