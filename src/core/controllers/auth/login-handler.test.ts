import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';
import { createLoginHandler } from './login-handler';

function makeResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

describe('login API handler', () => {
  it('returns a JSON 500 and logs only safe error metadata when authentication fails internally', async () => {
    const logged: Array<{ errorType: string; errorCode?: string }> = [];
    const response = makeResponse();
    const sensitiveDiagnostic = 'database URL and password must not be logged';
    const handler = createLoginHandler({
      getAuthSecret: () => 'synthetic-test-secret-long-enough',
      findEntity: async () => ({ id: 'entity-a' }),
      authenticateCredentials: async () => {
        throw Object.assign(new Error(sensitiveDiagnostic), { code: 'P2021' });
      },
      createAccessToken: () => 'unused',
      logError: (errorType, errorCode) => logged.push({ errorType, errorCode }),
    });

    await handler(
      { body: { username: 'synthetic-user', password: 'synthetic-password', entityId: 'entity-a', accountType: 'ADMIN' } } as Request,
      response as unknown as Response,
    );

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, {
      error: 'Le service de connexion est temporairement indisponible.',
    });
    assert.deepEqual(logged, [{ errorType: 'Error', errorCode: 'P2021' }]);
    assert.ok(!JSON.stringify(logged).includes(sensitiveDiagnostic));
  });

  it('returns 503 JSON when the authentication secret is unavailable', async () => {
    const response = makeResponse();
    const handler = createLoginHandler({
      getAuthSecret: () => null,
      findEntity: async () => ({ id: 'entity-a' }),
      authenticateCredentials: async () => {
        assert.fail('Authentication must not query users without a configured secret.');
      },
      createAccessToken: () => 'unused',
      logError: () => assert.fail('A missing secret is a configuration response, not an exception.'),
    });

    await handler(
      { body: { username: 'synthetic-user', password: 'synthetic-password', entityId: 'entity-a', accountType: 'ADMIN' } } as Request,
      response as unknown as Response,
    );

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, {
      error: 'Authentification indisponible : configurez SAFE_ERP_AUTH_SECRET.',
    });
  });

  it('requires the selected account type and entity to match the authenticated user', async () => {
    const makeHandler = (overrides: Partial<Parameters<typeof createLoginHandler>[0]>) => createLoginHandler({
      getAuthSecret: () => 'synthetic-test-secret-long-enough',
      authenticateCredentials: async () => ({
        id: 'user-a',
        username: 'accountant',
        role: 'ACCOUNTANT',
        entityId: 'entity-a',
      }),
      findEntity: async (id) => ({ id }),
      createAccessToken: () => 'unused',
      logError: () => assert.fail('Unexpected internal error.'),
      ...overrides,
    });

    const mismatchedRole = makeResponse();
    await makeHandler({})(
      { body: { username: 'accountant', password: 'synthetic-password', entityId: 'entity-a', accountType: 'ADMIN' } } as Request,
      mismatchedRole as unknown as Response,
    );
    assert.equal(mismatchedRole.statusCode, 401);

    const mismatchedEntity = makeResponse();
    await makeHandler({})(
      { body: { username: 'accountant', password: 'synthetic-password', entityId: 'entity-b', accountType: 'ACCOUNTANT' } } as Request,
      mismatchedEntity as unknown as Response,
    );
    assert.equal(mismatchedEntity.statusCode, 401);
  });
});
