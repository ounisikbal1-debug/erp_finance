import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { it } from 'node:test';

const projectRoot = resolve(__dirname, '../..');
const serverPath = resolve(__dirname, 'server.ts');
const tsNodeRegister = resolve(projectRoot, 'node_modules/ts-node/register/transpile-only');

function assertStartupRejected(environment: NodeJS.ProcessEnv, expectedMessage: RegExp): void {
  assert.throws(() => execFileSync(process.execPath, [
    '--require',
    tsNodeRegister,
    serverPath,
  ], {
    cwd: projectRoot,
    env: environment,
    encoding: 'utf8',
    stdio: 'pipe',
  }), expectedMessage);
}

function baseEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SAFE_ERP_DATABASE_PROVIDER: 'sqlite',
    SAFE_ERP_DATABASE_URL: 'file:./safe-erp-startup-test.db',
    PORT: '3000',
    API_HOST: '127.0.0.1',
    NODE_ENV: 'test',
    SAFE_ERP_AUTH_SECRET: '',
    SAFE_ERP_PERSISTENT_SESSIONS: '',
  };
}

it('refuses to start without an authentication secret', () => {
  const environment = baseEnvironment();

  assertStartupRejected(environment, /SAFE_ERP_AUTH_SECRET/);
});

it('refuses direct HTTP binds outside loopback', () => {
  const environment = baseEnvironment();
  environment.SAFE_ERP_AUTH_SECRET = 'x'.repeat(48);
  environment.API_HOST = '0.0.0.0';

  assertStartupRejected(environment, /refuse toute écoute HTTP directe sur le réseau/);
});

it('refuses SQLite in production', () => {
  const environment = baseEnvironment();
  environment.NODE_ENV = 'production';
  environment.SAFE_ERP_AUTH_SECRET = 'x'.repeat(48);

  assertStartupRejected(environment, /DATABASE_PROVIDER=postgresql/);
});
