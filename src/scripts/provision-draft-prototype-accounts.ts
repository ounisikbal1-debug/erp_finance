import { randomBytes } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import sqlite3 from 'sqlite3';
import { hashPassword, verifyPassword } from '../application/security/passwords';

const DATABASE_PATH = String.raw`C:\Users\USER\OneDrive\Desktop\SAFE_ERP-DRAFT 1\src\data\data.db`;
const DATABASE_URL = `file:${DATABASE_PATH.replace(/\\/g, '/')}`;
const EXPECTED_USERS = [
  { username: 'admin', role: 'ADMIN' },
  { username: 'finmgr', role: 'FINANCIAL_MANAGER' },
  { username: 'hrmgr', role: 'HR_MANAGER' },
  { username: 'salesmgr', role: 'SALES_OFFICER' },
] as const;
const ACCOUNTANT_USERNAME = 'compta';

type BackupDatabase = sqlite3.Database & {
  backup(destination: string, callback: (error: Error | null) => void): {
    step(pages: number, callback: (error: Error | null, complete: boolean) => void): void;
    finish(callback: () => void): void;
  };
};

function createBackup(): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '');
  const backupPath = `${DATABASE_PATH}.prototype-credentials-backup-${timestamp}-${randomBytes(4).toString('hex')}`;
  return new Promise((resolveBackup, rejectBackup) => {
    const source = new sqlite3.Database(DATABASE_PATH, sqlite3.OPEN_READONLY, (openError) => {
      if (openError) {
        rejectBackup(openError);
        return;
      }

      const backup = (source as BackupDatabase).backup(backupPath, (backupError) => {
        if (backupError) {
          source.close(() => rejectBackup(backupError));
          return;
        }
        backup.step(-1, (stepError, complete) => {
          backup.finish(() => {
            source.close((closeError) => {
              const error = stepError ?? (complete ? closeError : new Error('Sauvegarde SQLite incomplète.'));
              if (error) rejectBackup(error);
              else resolveBackup(backupPath);
            });
          });
        });
      });
    });
  });
}

function readHiddenPassword(prompt: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('L’outil doit être exécuté dans un PowerShell interactif pour masquer la saisie.');
  }

  return new Promise((resolvePassword, rejectPassword) => {
    const decoder = new StringDecoder('utf8');
    let password = '';
    let complete = false;
    process.stderr.write(prompt);
    input.setRawMode(true);
    input.resume();

    const cleanup = () => {
      input.removeListener('data', onData);
      input.removeListener('end', onEnd);
      input.setRawMode(false);
      process.stderr.write('\n');
    };
    const finish = (error?: Error) => {
      if (complete) return;
      complete = true;
      cleanup();
      if (error) rejectPassword(error);
      else resolvePassword(password);
    };
    const onData = (chunk: Buffer) => {
      for (const character of decoder.write(chunk)) {
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u0003' || character === '\u0004') {
          finish(new Error('Saisie annulée.'));
          return;
        }
        if (character === '\u0008' || character === '\u007f') {
          password = Array.from(password).slice(0, -1).join('');
        } else if (character >= ' ' && character !== '\u007f') {
          password += character;
        }
      }
    };
    const onEnd = () => finish(new Error('Fin de saisie inattendue.'));
    input.on('data', onData);
    input.once('end', onEnd);
  });
}

async function readConfirmedPassword(username: string): Promise<string> {
  let password = await readHiddenPassword(`Mot de passe ${username} (saisie masquée) : `);
  let confirmation = '';
  try {
    if (!password) throw new Error('Le mot de passe ne peut pas être vide.');
    confirmation = await readHiddenPassword(`Confirmez ${username} (saisie masquée) : `);
    if (password !== confirmation) throw new Error('Les saisies ne correspondent pas.');
    const confirmed = password;
    password = '';
    return confirmed;
  } catch (error) {
    password = '';
    throw error;
  } finally {
    confirmation = '';
  }
}

async function main(): Promise<void> {
  if (resolve(DATABASE_PATH) !== DATABASE_PATH || !existsSync(DATABASE_PATH)) {
    throw new Error('La base SQLite dédiée du draft est introuvable; aucune donnée n’a été modifiée.');
  }

  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  const passwords: Record<string, string> = {};
  try {
    const users = await prisma.user.findMany({
      where: { username: { in: EXPECTED_USERS.map(({ username }) => username) } },
      select: { username: true, role: true, entityId: true },
    });
    for (const expected of EXPECTED_USERS) {
      const user = users.find(({ username }) => username === expected.username);
      if (!user || user.role !== expected.role) {
        throw new Error(`Le compte attendu ${expected.username} est absent ou son rôle diffère; aucune modification effectuée.`);
      }
    }

    if (await prisma.user.findUnique({ where: { username: ACCOUNTANT_USERNAME }, select: { id: true } })) {
      throw new Error('Le compte comptable existe déjà; aucune modification effectuée.');
    }
    const admin = users.find(({ username }) => username === 'admin');
    if (!admin?.entityId) throw new Error('Le compte administrateur n’a pas d’entité; aucune modification effectuée.');

    for (const { username } of EXPECTED_USERS) passwords[username] = await readConfirmedPassword(username);
    passwords[ACCOUNTANT_USERNAME] = await readConfirmedPassword(ACCOUNTANT_USERNAME);

    const hashes = Object.fromEntries(
      await Promise.all(Object.entries(passwords).map(async ([username, password]) => [username, await hashPassword(password)])),
    );
    const backupPath = await createBackup();

    await prisma.$transaction(async (transaction) => {
      for (const { username } of EXPECTED_USERS) {
        await transaction.user.update({
          where: { username },
          data: { passwordHash: hashes[username] },
          select: { id: true },
        });
      }
      await transaction.user.create({
        data: {
          username: ACCOUNTANT_USERNAME,
          passwordHash: hashes[ACCOUNTANT_USERNAME],
          role: 'ACCOUNTANT',
          entityId: admin.entityId,
        },
        select: { id: true },
      });

      const stored = await transaction.user.findMany({
        where: { username: { in: [...EXPECTED_USERS.map(({ username }) => username), ACCOUNTANT_USERNAME] } },
        select: { username: true, passwordHash: true, role: true },
      });
      if (stored.length !== EXPECTED_USERS.length + 1) throw new Error('Vérification des comptes incomplète; transaction annulée.');
      for (const user of stored) {
        if (!await verifyPassword(passwords[user.username], user.passwordHash)) {
          throw new Error('La vérification d’un compte a échoué; transaction annulée.');
        }
      }
      if (stored.find(({ username }) => username === ACCOUNTANT_USERNAME)?.role !== 'ACCOUNTANT') {
        throw new Error('Le rôle comptable a échoué à la vérification; transaction annulée.');
      }
    });

    process.stdout.write(`Comptes du prototype configurés; sauvegarde créée : ${backupPath}\n`);
  } finally {
    for (const username of Object.keys(passwords)) passwords[username] = '';
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Erreur inconnue.';
    process.stderr.write(`Échec de la configuration du prototype : ${message}\n`);
    process.exitCode = 1;
  });
}
