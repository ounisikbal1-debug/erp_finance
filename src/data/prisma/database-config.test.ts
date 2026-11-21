import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveDatabaseConfiguration } from './database-config';

describe('database provider configuration', () => {
  it('keeps SQLite as the local default', () => {
    assert.deepEqual(resolveDatabaseConfiguration({}), {
      provider: 'sqlite',
      url: 'file:../data.db',
    });
  });

  it('requires an explicit PostgreSQL URL outside tests', () => {
    assert.throws(
      () => resolveDatabaseConfiguration({ SAFE_ERP_DATABASE_PROVIDER: 'postgresql' }),
      /SAFE_ERP_DATABASE_URL must explicitly identify the PostgreSQL database/,
    );
  });

  it('rejects a SQLite URL when PostgreSQL is selected', () => {
    assert.throws(
      () => resolveDatabaseConfiguration({
        SAFE_ERP_DATABASE_PROVIDER: 'postgresql',
        SAFE_ERP_DATABASE_URL: 'file:C:/safe.db',
      }),
      /PostgreSQL provider requires a postgres:\/\/ or postgresql:\/\/ URL/,
    );
  });

  it('rejects a PostgreSQL URL when SQLite is selected', () => {
    assert.throws(
      () => resolveDatabaseConfiguration({
        SAFE_ERP_DATABASE_PROVIDER: 'sqlite',
        SAFE_ERP_DATABASE_URL: 'postgresql://localhost/safe',
      }),
      /SQLite provider requires a Prisma file: database URL/,
    );
  });

  it('requires a separate PostgreSQL test URL rather than falling back to the runtime URL', () => {
    assert.throws(
      () => resolveDatabaseConfiguration({
        NODE_ENV: 'test',
        SAFE_ERP_DATABASE_PROVIDER: 'postgresql',
        SAFE_ERP_DATABASE_URL: 'postgresql://localhost/runtime',
      }),
      /SAFE_ERP_TEST_DATABASE_URL must explicitly identify the PostgreSQL database/,
    );
  });

  it('accepts a separate PostgreSQL test URL', () => {
    assert.deepEqual(resolveDatabaseConfiguration({
      NODE_ENV: 'test',
      SAFE_ERP_DATABASE_PROVIDER: 'postgresql',
      SAFE_ERP_TEST_DATABASE_URL: 'postgresql://localhost/test',
    }), {
      provider: 'postgresql',
      url: 'postgresql://localhost/test?connection_limit=10',
    });
  });

  it('uses a bounded PostgreSQL connection pool while preserving an explicit limit', () => {
    assert.equal(resolveDatabaseConfiguration({
      SAFE_ERP_DATABASE_PROVIDER: 'postgresql',
      SAFE_ERP_DATABASE_URL: 'postgresql://localhost/safe?sslmode=require',
    }).url, 'postgresql://localhost/safe?sslmode=require&connection_limit=10');
    assert.equal(resolveDatabaseConfiguration({
      SAFE_ERP_DATABASE_PROVIDER: 'postgresql',
      SAFE_ERP_DATABASE_URL: 'postgresql://localhost/safe?connection_limit=6&sslmode=require',
    }).url, 'postgresql://localhost/safe?connection_limit=6&sslmode=require');
  });

  it('rejects unknown database providers', () => {
    assert.throws(
      () => resolveDatabaseConfiguration({
        SAFE_ERP_DATABASE_PROVIDER: 'mysql',
        SAFE_ERP_DATABASE_URL: 'mysql://localhost/safe',
      }),
      /SAFE_ERP_DATABASE_PROVIDER must be either/,
    );
  });
});
