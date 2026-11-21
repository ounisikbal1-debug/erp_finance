import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const projectRoot = resolve(__dirname, '../..');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'safe-erp-intercompany-test-'));
const databasePath = resolve(temporaryDirectory, 'intercompany-test.db');
const schemaPath = resolve(temporaryDirectory, 'schema.prisma');
const databaseUrl = `file:${databasePath.replace(/\\/g, '/')}`;
const testEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  SAFE_ERP_DATABASE_URL: databaseUrl,
  SAFE_ERP_TEST_DATABASE_URL: databaseUrl,
};

assert.ok(databasePath.startsWith(`${resolve(temporaryDirectory)}${sep}`));
assert.ok(!databasePath.startsWith(projectRoot));

try {
  const sourceSchema = readFileSync(join(projectRoot, 'src', 'data', 'prisma', 'schema.prisma'), 'utf8');
  const isolatedSchema = sourceSchema.replace(
    /url\s*=\s*env\("SAFE_ERP_DATABASE_URL"\)/,
    'url = env("SAFE_ERP_TEST_DATABASE_URL")',
  );
  if (isolatedSchema === sourceSchema) {
    throw new Error('Impossible de confirmer la substitution de la cible SQLite dans le schéma isolé.');
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
    'src/application/modules/intercompany/service.integration.test.ts',
  ], {
    cwd: projectRoot,
    env: testEnvironment,
    stdio: 'inherit',
  });
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
