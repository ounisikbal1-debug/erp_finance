import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = resolve(__dirname, '../..');
const scratchId = randomUUID();
const databasePath = resolve(projectRoot, `.stock-test-${scratchId}.db`);
const schemaPath = resolve(projectRoot, `.stock-test-${scratchId}.prisma`);
const databaseUrl = process.platform === 'win32'
  ? `file:${databasePath.replace(/\\/g, '/')}`
  : pathToFileURL(databasePath).href;
const testEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  SAFE_ERP_TEST_DATABASE_URL: databaseUrl,
};

assert.ok(databasePath.startsWith(projectRoot));
assert.notEqual(databasePath, resolve(projectRoot, 'src', 'data', 'data.db'));

try {
  const sourceSchema = readFileSync(join(projectRoot, 'src', 'data', 'prisma', 'schema.prisma'), 'utf8');
  const isolatedSchema = sourceSchema.replace(
    /url\s*=\s*(?:env\("SAFE_ERP_DATABASE_URL"\)|"file:\.\.\/data\.db")/,
    'url = env("SAFE_ERP_TEST_DATABASE_URL")',
  );
  if (isolatedSchema === sourceSchema) {
    throw new Error('Impossible de confirmer le remplacement de la cible SQLite dans le schéma isolé.');
  }
  writeFileSync(schemaPath, isolatedSchema, 'utf8');

  execFileSync(process.execPath, [
    require.resolve('prisma'),
    'db',
    'push',
    '--schema',
    schemaPath,
    '--skip-generate',
  ], {
    cwd: projectRoot,
    env: testEnvironment,
    stdio: 'inherit',
  });

  execFileSync(process.execPath, [
    '--test',
    '--require',
    'ts-node/register',
    'src/application/modules/materials/stock-posting.integration.test.ts',
  ], {
    cwd: projectRoot,
    env: testEnvironment,
    stdio: 'inherit',
  });
} finally {
  for (const artifact of [databasePath, `${databasePath}-journal`, `${databasePath}-wal`, `${databasePath}-shm`, schemaPath]) {
    rmSync(artifact, { force: true });
  }
}
