import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import {
  decryptWorkbookConnectorCredentials,
  deleteWorkbookConnectorCredentials,
  encryptWorkbookConnectorCredentials,
  getWorkbookConnectorCredentialStatus,
  saveWorkbookConnectorCredentialField,
  testWorkbookConnectorConnection,
} from './workbook-connector-vault';
import { WorkbookFeatureConfigurationError } from './workbook-feature-errors';

const KEY = '7c'.repeat(32);

function withEncryptionKey(run: () => void) {
  const previousKey = process.env.SAFE_ERP_CONNECTOR_ENCRYPTION_KEY;
  const previousKeyId = process.env.SAFE_ERP_CONNECTOR_ENCRYPTION_KEY_ID;
  process.env.SAFE_ERP_CONNECTOR_ENCRYPTION_KEY = KEY;
  process.env.SAFE_ERP_CONNECTOR_ENCRYPTION_KEY_ID = 'test-key-1';
  try {
    run();
  } finally {
    if (previousKey === undefined) delete process.env.SAFE_ERP_CONNECTOR_ENCRYPTION_KEY;
    else process.env.SAFE_ERP_CONNECTOR_ENCRYPTION_KEY = previousKey;
    if (previousKeyId === undefined) delete process.env.SAFE_ERP_CONNECTOR_ENCRYPTION_KEY_ID;
    else process.env.SAFE_ERP_CONNECTOR_ENCRYPTION_KEY_ID = previousKeyId;
  }
}

describe('workbook connector credential vault', () => {
  it('encrypts credentials with AES-GCM and binds the ciphertext to entity and connector', () => {
    withEncryptionKey(() => {
      const credentials = { login: 'synthetic-user', accessToken: 'synthetic-secret' };
      const encrypted = encryptWorkbookConnectorCredentials('TEST_entity', 'e-invoicing-dgi', credentials);
      assert.equal(encrypted.ciphertext.includes('synthetic-secret'), false);
      assert.deepEqual(decryptWorkbookConnectorCredentials('TEST_entity', 'e-invoicing-dgi', encrypted), credentials);
      assert.throws(
        () => decryptWorkbookConnectorCredentials('OTHER_entity', 'e-invoicing-dgi', encrypted),
        (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 503,
      );
      assert.throws(
        () => decryptWorkbookConnectorCredentials('TEST_entity', 'tuneps-connector', encrypted),
        (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 503,
      );
    });
  });

  it('rejects tampering and missing encryption configuration without exposing values', () => {
    withEncryptionKey(() => {
      const encrypted = encryptWorkbookConnectorCredentials('TEST_entity', 'cnss-declaration-connector', {
        employerCode: 'synthetic-employer-code',
      });
      assert.throws(
        () => decryptWorkbookConnectorCredentials('TEST_entity', 'cnss-declaration-connector', {
          ...encrypted,
          ciphertext: Buffer.from('tampered').toString('base64'),
        }),
        (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 503,
      );
      delete process.env.SAFE_ERP_CONNECTOR_ENCRYPTION_KEY;
      assert.throws(
        () => encryptWorkbookConnectorCredentials('TEST_entity', 'cnss-declaration-connector', {
          password: 'synthetic-password',
        }),
        /clé maître AES-256/,
      );
    });
  });

  it('rejects invalid connector keys and malformed credential fields', () => {
    withEncryptionKey(() => {
      assert.throws(() => encryptWorkbookConnectorCredentials('TEST_entity', 'unknown-connector', {
        token: 'synthetic',
      }), (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 404);
      assert.throws(() => encryptWorkbookConnectorCredentials('TEST_entity', 'tuneps-connector', {
        password: '',
      }), (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400);
      assert.throws(() => encryptWorkbookConnectorCredentials('TEST_entity', 'tuneps-connector', {
        '__proto__.polluted': 'synthetic',
      }), (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400);
    });
  });

  it('stores encrypted fields, returns metadata only, and never reports a live connection', async () => {
    const previousKey = process.env.SAFE_ERP_CONNECTOR_ENCRYPTION_KEY;
    const previousKeyId = process.env.SAFE_ERP_CONNECTOR_ENCRYPTION_KEY_ID;
    process.env.SAFE_ERP_CONNECTOR_ENCRYPTION_KEY = KEY;
    process.env.SAFE_ERP_CONNECTOR_ENCRYPTION_KEY_ID = 'test-key-1';
    const entityDelegate = prisma.entity;
    const secretDelegate = prisma.workbookConnectorSecret;
    const originalEntityFind = entityDelegate.findUnique;
    const originalSecretFind = secretDelegate.findUnique;
    const originalSecretCreate = secretDelegate.create;
    const originalSecretUpdate = secretDelegate.updateMany;
    const originalSecretDelete = secretDelegate.deleteMany;
    let stored: Record<string, unknown> | null = null;
    Object.defineProperty(entityDelegate, 'findUnique', {
      configurable: true,
      value: async ({ where }: { where: { id: string } }) => ({ id: where.id }),
    });
    Object.defineProperty(secretDelegate, 'findUnique', {
      configurable: true,
      value: async () => stored,
    });
    Object.defineProperty(secretDelegate, 'create', {
      configurable: true,
      value: async ({ data }: { data: Record<string, unknown> }) => {
        stored = { id: 'TEST_secret', version: 1, updatedAt: new Date(), ...data };
        return stored;
      },
    });
    Object.defineProperty(secretDelegate, 'updateMany', {
      configurable: true,
      value: async ({ where, data }: {
        where: { id: string; version: number };
        data: Record<string, unknown>;
      }) => {
        if (!stored || stored.id !== where.id || stored.version !== where.version) return { count: 0 };
        const increment = data.version as { increment: number };
        stored = { ...stored, ...data, version: where.version + increment.increment, updatedAt: new Date() };
        return { count: 1 };
      },
    });
    Object.defineProperty(secretDelegate, 'deleteMany', {
      configurable: true,
      value: async () => {
        const count = stored ? 1 : 0;
        stored = null;
        return { count };
      },
    });

    try {
      const firstStatus = await saveWorkbookConnectorCredentialField(
        'TEST_entity',
        'tuneps-connector',
        'username',
        'synthetic-user-secret',
        { id: 'TEST_admin', username: 'admin' },
      );
      assert.deepEqual(firstStatus.credentialFieldNames, ['username']);
      assert.equal(firstStatus.connectionStatus, 'NOT_CONNECTED');
      assert.ok(stored);
      assert.equal(JSON.stringify(stored).includes('synthetic-user-secret'), false);

      const secondStatus = await saveWorkbookConnectorCredentialField(
        'TEST_entity',
        'tuneps-connector',
        'password',
        'synthetic-password-secret',
        { id: 'TEST_admin', username: 'admin' },
      );
      assert.deepEqual(secondStatus.credentialFieldNames, ['password', 'username']);
      assert.equal(JSON.stringify(secondStatus).includes('synthetic-password-secret'), false);
      assert.ok(stored);
      assert.deepEqual(
        decryptWorkbookConnectorCredentials('TEST_entity', 'tuneps-connector', {
          keyId: String(stored.keyId),
          fieldNamesJson: String(stored.fieldNamesJson),
          ciphertext: String(stored.ciphertext),
          iv: String(stored.iv),
          authTag: String(stored.authTag),
        }),
        { username: 'synthetic-user-secret', password: 'synthetic-password-secret' },
      );

      const status = await getWorkbookConnectorCredentialStatus('TEST_entity', 'tuneps-connector');
      assert.equal(status.credentialsConfigured, true);
      assert.equal(status.connectionStatus, 'NOT_CONNECTED');
      const testResult = await testWorkbookConnectorConnection('TEST_entity', 'tuneps-connector');
      assert.equal(testResult.testStatus, 'BLOCKED');
      assert.equal(testResult.networkRequestMade, false);

      const cleared = await deleteWorkbookConnectorCredentials('TEST_entity', 'tuneps-connector');
      assert.equal(cleared.credentialsConfigured, false);
      assert.equal(cleared.connectionStatus, 'NOT_CONNECTED');
    } finally {
      Object.defineProperty(entityDelegate, 'findUnique', { configurable: true, value: originalEntityFind });
      Object.defineProperty(secretDelegate, 'findUnique', { configurable: true, value: originalSecretFind });
      Object.defineProperty(secretDelegate, 'create', { configurable: true, value: originalSecretCreate });
      Object.defineProperty(secretDelegate, 'updateMany', { configurable: true, value: originalSecretUpdate });
      Object.defineProperty(secretDelegate, 'deleteMany', { configurable: true, value: originalSecretDelete });
      if (previousKey === undefined) delete process.env.SAFE_ERP_CONNECTOR_ENCRYPTION_KEY;
      else process.env.SAFE_ERP_CONNECTOR_ENCRYPTION_KEY = previousKey;
      if (previousKeyId === undefined) delete process.env.SAFE_ERP_CONNECTOR_ENCRYPTION_KEY_ID;
      else process.env.SAFE_ERP_CONNECTOR_ENCRYPTION_KEY_ID = previousKeyId;
    }
  });
});
