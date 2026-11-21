import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import sqlite3 from 'sqlite3';

type BackupCapableDatabase = sqlite3.Database & {
  backup(
    destination: string,
    callback: (error: Error | null) => void,
  ): {
    step(pages: number, callback: (error: Error | null, complete: boolean) => void): void;
    finish(callback: () => void): void;
  };
};

function assertDifferentFiles(sourcePath: string, destinationPath: string): void {
  if (resolve(sourcePath) === resolve(destinationPath)) {
    throw new Error('La source et la destination doivent être deux fichiers différents.');
  }
}

async function reserveFile(path: string): Promise<void> {
  const reservation = await open(path, 'wx');
  await reservation.close();
}

function copyDatabase(sourcePath: string, destinationPath: string): Promise<void> {
  return new Promise((resolveCopy, rejectCopy) => {
    const source = new sqlite3.Database(
      sourcePath,
      sqlite3.OPEN_READONLY,
      (openError) => {
        if (openError) {
          source.close(() => rejectCopy(openError));
          return;
        }

        let closing = false;
        const closeSource = (error?: Error | null) => {
          if (closing) return;
          closing = true;
          source.close((closeError) => {
            if (error) rejectCopy(error);
            else if (closeError) rejectCopy(closeError);
            else resolveCopy();
          });
        };
        const backup = (source as BackupCapableDatabase).backup(
          destinationPath,
          (backupOpenError) => {
            if (backupOpenError) {
              closeSource(backupOpenError);
              return;
            }

            const finishBackup = (backupError?: Error | null) => {
              backup.finish(() => closeSource(backupError));
            };
            const copyNextPage = () => {
              backup.step(-1, (stepError, complete) => {
                if (stepError) finishBackup(stepError);
                else if (complete) finishBackup();
                else copyNextPage();
              });
            };
            copyNextPage();
          },
        );
      },
    );
  });
}

export async function verifySqliteIntegrity(databasePath: string): Promise<void> {
  if (!existsSync(databasePath)) throw new Error(`Base SQLite introuvable : ${databasePath}`);

  const database = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);
  const check = await new Promise<string>((resolveCheck, rejectCheck) => {
    database.get<{ integrity_check: string }>('PRAGMA integrity_check', (error, row) => {
      if (error) rejectCheck(error);
      else if (!row) rejectCheck(new Error('SQLite n’a renvoyé aucun résultat d’intégrité.'));
      else resolveCheck(row.integrity_check);
    });
  }).finally(() => new Promise<void>((resolveClose, rejectClose) => {
    database.close((error) => error ? rejectClose(error) : resolveClose());
  }));

  if (check !== 'ok') throw new Error(`Échec du contrôle d’intégrité SQLite : ${check}`);
}

export async function createSqliteBackup(
  databasePath: string,
  backupPath: string,
): Promise<void> {
  const sourcePath = resolve(databasePath);
  const destinationPath = resolve(backupPath);
  assertDifferentFiles(sourcePath, destinationPath);
  if (!existsSync(sourcePath)) throw new Error(`Base SQLite introuvable : ${sourcePath}`);

  await reserveFile(destinationPath);
  try {
    await copyDatabase(sourcePath, destinationPath);
    await verifySqliteIntegrity(destinationPath);
  } catch (error) {
    await unlink(destinationPath).catch(() => undefined);
    throw error;
  }
}

function uniqueSiblingPath(databasePath: string, label: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '');
  let candidate: string;
  do {
    candidate = resolve(
      dirname(databasePath),
      `${basename(databasePath)}.${label}-${timestamp}-${randomBytes(8).toString('hex')}.sqlite`,
    );
  } while (existsSync(candidate));
  return candidate;
}

function assertNoSqliteSidecars(databasePath: string): void {
  const sidecars = [`${databasePath}-wal`, `${databasePath}-shm`, `${databasePath}-journal`]
    .filter(existsSync);
  if (sidecars.length) {
    throw new Error(
      `Restauration refusée : des fichiers SQLite annexes existent (${sidecars.join(', ')}). ` +
      'Ne les supprimez pas manuellement; vérifiez que la base est arrêtée et cohérente.',
    );
  }
}

export async function restoreSqliteBackup(
  databasePath: string,
  backupPath: string,
  targetIsOffline: boolean,
): Promise<string> {
  if (!targetIsOffline) {
    throw new Error('Restauration refusée : arrêtez le service et confirmez que la base cible est hors ligne.');
  }

  const targetPath = resolve(databasePath);
  const sourceBackupPath = resolve(backupPath);
  assertDifferentFiles(targetPath, sourceBackupPath);
  if (!existsSync(targetPath)) throw new Error(`Base cible SQLite introuvable : ${targetPath}`);
  if (!existsSync(sourceBackupPath)) throw new Error(`Sauvegarde SQLite introuvable : ${sourceBackupPath}`);
  assertNoSqliteSidecars(targetPath);
  await verifySqliteIntegrity(targetPath);
  await verifySqliteIntegrity(sourceBackupPath);

  const restoreStagePath = uniqueSiblingPath(targetPath, 'restore-stage');
  await reserveFile(restoreStagePath);
  let rollbackPath: string | undefined;
  let originalMoved = false;
  try {
    await copyDatabase(sourceBackupPath, restoreStagePath);
    await verifySqliteIntegrity(restoreStagePath);

    rollbackPath = uniqueSiblingPath(targetPath, 'pre-restore');
    await rename(targetPath, rollbackPath);
    originalMoved = true;
    try {
      await rename(restoreStagePath, targetPath);
    } catch (error) {
      try {
        await rename(rollbackPath, targetPath);
        originalMoved = false;
      } catch (restoreError) {
        throw new Error(
          `La restauration a échoué; la base originale est conservée à ${rollbackPath}.`,
          { cause: restoreError },
        );
      }
      throw error;
    }

    originalMoved = false;
    return rollbackPath;
  } catch (error) {
    await unlink(restoreStagePath).catch(() => undefined);
    if (originalMoved) {
      throw new Error(
        `La restauration a échoué et la base originale reste à ${rollbackPath}.`,
        { cause: error },
      );
    }
    throw error;
  }
}
