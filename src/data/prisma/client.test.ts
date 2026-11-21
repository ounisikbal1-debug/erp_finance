import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, it } from 'node:test';
import type { PrismaClient } from '@prisma/client';

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'safe-erp-runtime-db-'));
const databasePath = join(temporaryDirectory, 'runtime-test.db');
const previousNodeEnv = process.env.NODE_ENV;
const previousDatabaseUrl = process.env.SAFE_ERP_DATABASE_URL;
process.env.NODE_ENV = 'production';
process.env.SAFE_ERP_DATABASE_URL = `file:${databasePath.replace(/\\/g, '/')}`;
const prisma = (require('./client') as { default: PrismaClient }).default;

after(async () => {
  await prisma.$disconnect();
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousDatabaseUrl === undefined) delete process.env.SAFE_ERP_DATABASE_URL;
  else process.env.SAFE_ERP_DATABASE_URL = previousDatabaseUrl;
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

it('uses the opt-in runtime database URL without the test environment', async () => {
  const result = await prisma.$queryRaw<Array<{ result: bigint }>>`SELECT 1 AS result`;
  assert.deepEqual(result, [{ result: 1n }]);
  assert.equal(existsSync(databasePath), true);
});

it('keeps test-mode connections isolated from the runtime database URL', () => {
  const runtimePath = join(temporaryDirectory, 'runtime-should-not-be-used.db');
  const isolatedPath = join(temporaryDirectory, 'explicit-test.db');
  const toDatabaseUrl = (path: string) => `file:${path.replace(/\\/g, '/')}`;
  const probe = [
    "const prisma = require('./src/data/prisma/client').default;",
    "prisma.$queryRaw`SELECT 1`.then(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });",
  ].join('\n');
  const runProbe = (environment: NodeJS.ProcessEnv) => execFileSync(process.execPath, [
    '--require',
    'ts-node/register',
    '-e',
    probe,
  ], {
    cwd: process.cwd(),
    env: environment,
    stdio: 'pipe',
  });
  const runtimeOnlyEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    SAFE_ERP_DATABASE_URL: toDatabaseUrl(runtimePath),
  };
  delete runtimeOnlyEnvironment.SAFE_ERP_TEST_DATABASE_URL;

  runProbe(runtimeOnlyEnvironment);
  assert.equal(existsSync(runtimePath), false);

  runProbe({
    ...runtimeOnlyEnvironment,
    SAFE_ERP_TEST_DATABASE_URL: toDatabaseUrl(isolatedPath),
  });
  assert.equal(existsSync(isolatedPath), true);
  assert.equal(existsSync(runtimePath), false);
});
