import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import sqlite3 from 'sqlite3';

const SCHEMA_PATH = resolve(__dirname, '../data/prisma/schema.prisma');
const PROJECT_ROOT = resolve(__dirname, '../..');
const PRISMA_CLI = resolve(PROJECT_ROOT, 'node_modules/prisma/build/index.js');

function samePath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left).replace(/[\\/]+$/, '');
  const normalizedRight = resolve(right).replace(/[\\/]+$/, '');
  return process.platform === 'win32'
    ? normalizedLeft.toLocaleLowerCase() === normalizedRight.toLocaleLowerCase()
    : normalizedLeft === normalizedRight;
}

function resolveSqlitePath(databaseUrl: string): string {
  const [fileUrl, ...queryParts] = databaseUrl.split('?');
  if (!fileUrl.startsWith('file:')) {
    throw new Error('SAFE_ERP_DATABASE_URL doit être une URL SQLite persistante de type file:.');
  }

  const query = new URLSearchParams(queryParts.join('?'));
  let filename = decodeURIComponent(fileUrl.slice('file:'.length));
  if (!filename || filename === ':memory:' || query.get('mode') === 'memory') {
    throw new Error('La vérification exige une base SQLite persistante.');
  }
  filename = filename.replace(/^\/+([A-Za-z]:[\\/])/, '$1');
  if (!isAbsolute(filename)) {
    throw new Error('SAFE_ERP_DATABASE_URL doit contenir un chemin SQLite absolu.');
  }
  return resolve(filename);
}

export function resolveDeploymentTarget(
  databaseUrl: string | undefined,
  expectedDatabasePath: string | undefined,
): string {
  if (!databaseUrl) {
    throw new Error('SAFE_ERP_DATABASE_URL doit désigner explicitement la base SQLite cible.');
  }
  if (!expectedDatabasePath || !isAbsolute(expectedDatabasePath)) {
    throw new Error('--expected-database-path doit être le chemin absolu de la base voulue.');
  }

  const configuredPath = resolveSqlitePath(databaseUrl);
  const expectedPath = resolve(expectedDatabasePath);
  if (!samePath(configuredPath, expectedPath)) {
    throw new Error(
      `La cible configurée ne correspond pas à --expected-database-path (configurée : ${configuredPath}).`,
    );
  }
  if (!existsSync(configuredPath)) {
    throw new Error(`Base SQLite introuvable : ${configuredPath}`);
  }
  return configuredPath;
}

export async function verifySqliteDeploymentDatabase(databasePath: string): Promise<void> {
  const database = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);
  try {
    const integrity = await new Promise<string>((resolveIntegrity, rejectIntegrity) => {
      database.get<{ integrity_check: string }>('PRAGMA integrity_check', (error, row) => {
        if (error) rejectIntegrity(error);
        else if (!row) rejectIntegrity(new Error('SQLite integrity_check n’a renvoyé aucun résultat.'));
        else resolveIntegrity(row.integrity_check);
      });
    });
    if (integrity !== 'ok') {
      throw new Error(`Échec de PRAGMA integrity_check : ${integrity}`);
    }

    const foreignKeyViolations = await new Promise<unknown[]>((resolveRows, rejectRows) => {
      database.all('PRAGMA foreign_key_check', (error, rows) => {
        if (error) rejectRows(error);
        else resolveRows(rows);
      });
    });
    if (foreignKeyViolations.length > 0) {
      throw new Error(
        `Échec de PRAGMA foreign_key_check : ${foreignKeyViolations.length} violation(s).`,
      );
    }
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      database.close((error) => error ? rejectClose(error) : resolveClose());
    });
  }
}

export function verifyMigrationHistoryIsCurrent(databasePath: string): string {
  let output: string;
  try {
    output = execFileSync(process.execPath, [
      PRISMA_CLI,
      'migrate',
      'status',
      '--schema',
      SCHEMA_PATH,
    ], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        SAFE_ERP_DATABASE_URL: `file:${databasePath.replace(/\\/g, '/')}`,
      },
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    const details = error instanceof Error && 'stderr' in error
      ? String(error.stderr)
      : error instanceof Error ? error.message : 'Erreur inconnue.';
    throw new Error(`Échec de prisma migrate status : ${details}`);
  }

  if (!/up to date|successfully applied/i.test(output)) {
    throw new Error(`L’historique des migrations n’est pas à jour :\n${output}`);
  }
  return output.trim();
}

function parseArguments(args: string[]): { expectedDatabasePath?: string; requireUpToDate: boolean } {
  let expectedDatabasePath: string | undefined;
  let requireUpToDate = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--expected-database-path') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--expected-database-path exige un chemin absolu.');
      }
      expectedDatabasePath = value;
      index += 1;
    } else if (args[index] === '--require-up-to-date') {
      requireUpToDate = true;
    } else {
      throw new Error(`Option inconnue : ${args[index]}`);
    }
  }
  return { expectedDatabasePath, requireUpToDate };
}

async function main(): Promise<void> {
  const { expectedDatabasePath, requireUpToDate } = parseArguments(process.argv.slice(2));
  const databasePath = resolveDeploymentTarget(
    process.env.SAFE_ERP_DATABASE_URL,
    expectedDatabasePath,
  );
  await verifySqliteDeploymentDatabase(databasePath);

  process.stdout.write(`Cible SQLite vérifiée : ${databasePath}\n`);
  process.stdout.write('PRAGMA integrity_check : ok\n');
  process.stdout.write('PRAGMA foreign_key_check : 0 violation\n');
  if (requireUpToDate) {
    const status = verifyMigrationHistoryIsCurrent(databasePath);
    process.stdout.write(`Historique Prisma à jour : ${status}\n`);
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Erreur inconnue.';
    process.stderr.write(`Échec du contrôle de déploiement : ${message}\n`);
    process.exitCode = 1;
  });
}
