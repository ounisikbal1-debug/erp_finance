import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../../auth';
import { createEntityContextHandlers } from './entity-context-handler';

const globalAdminAccount = {
  id: 'admin-id',
  username: 'admin',
  role: 'ADMIN',
  isActive: true,
  entityId: null,
};

const company = { id: 'company-a', name: 'Société A', code: 'A' };

function makeResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    locals: { authenticatedUser: makeActor() },
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

type Dependencies = NonNullable<Parameters<typeof createEntityContextHandlers>[0]>;

function makeDependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    findUser: async () => globalAdminAccount,
    listEntities: async () => [company],
    findEntity: async () => company,
    createAccessToken: (user: AuthenticatedUser, secret: string) => `${user.entityId}:${secret}`,
    getAuthSecret: () => 'synthetic-auth-secret-long-enough',
    logError: () => assert.fail('Unexpected errors must not be logged in these tests.'),
    ...overrides,
  };
}

function makeRequest(body: unknown = {}) {
  return { body } as Request;
}

function makeActor(role: AuthenticatedUser['role'] = 'ADMIN', entityId: string | null = null): AuthenticatedUser {
  return { id: 'admin-id', username: 'admin', role, entityId };
}

describe('global administrator entity context', () => {
  it('lists entities only for an active, unbound administrator', async () => {
    const response = makeResponse();
    const handlers = createEntityContextHandlers(makeDependencies());

    await handlers.list(
      {} as Request,
      response as unknown as Response,
    );

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { entities: [company] });
  });

  it('includes consolidated groups under their owning companies', async () => {
    const group = {
      id: 'group-a',
      name: 'Groupe consolidé A',
      reportingCurrencyCode: 'TND',
    };
    const response = makeResponse();
    const handlers = createEntityContextHandlers(makeDependencies({
      listEntities: async () => [{ ...company, consolidationGroups: [group] }],
    }));

    await handlers.list(
      {} as Request,
      response as unknown as Response,
    );

    assert.deepEqual(response.body, {
      entities: [{ ...company, consolidationGroups: [group] }],
    });
  });

  it('issues a signed token scoped to the selected entity for the global administrator', async () => {
    const response = makeResponse();
    let tokenUser: AuthenticatedUser | undefined;
    const handlers = createEntityContextHandlers(makeDependencies({
      createAccessToken: (user: AuthenticatedUser) => {
        tokenUser = user;
        return 'scoped-token';
      },
    }));

    await handlers.select(
      makeRequest({ entityId: company.id }),
      response as unknown as Response,
    );

    assert.deepEqual(tokenUser, {
      id: 'admin-id',
      username: 'admin',
      role: 'ADMIN',
      entityId: company.id,
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { accessToken: 'scoped-token', entityId: company.id });
  });

  it('rejects non-administrators, company-bound administrators, and missing companies', async () => {
    const handlers = createEntityContextHandlers(makeDependencies({
      findEntity: async () => null,
    }));

    const nonAdminResponse = makeResponse();
    nonAdminResponse.locals.authenticatedUser = makeActor('ACCOUNTANT');
    await handlers.select(
      makeRequest({ entityId: company.id }),
      nonAdminResponse as unknown as Response,
    );
    assert.equal(nonAdminResponse.statusCode, 403);

    const boundAdminResponse = makeResponse();
    const boundAdminHandlers = createEntityContextHandlers(makeDependencies({
      findUser: async () => ({ ...globalAdminAccount, entityId: company.id }),
    }));
    boundAdminResponse.locals.authenticatedUser = makeActor('ADMIN', company.id);
    await boundAdminHandlers.select(
      makeRequest({ entityId: 'company-b' }),
      boundAdminResponse as unknown as Response,
    );
    assert.equal(boundAdminResponse.statusCode, 403);

    const missingCompanyResponse = makeResponse();
    await handlers.select(
      makeRequest({ entityId: 'company-missing' }),
      missingCompanyResponse as unknown as Response,
    );
    assert.equal(missingCompanyResponse.statusCode, 404);
  });

  it('rejects inactive accounts and invalid entity identifiers', async () => {
    const inactiveHandlers = createEntityContextHandlers(makeDependencies({
      findUser: async () => ({ ...globalAdminAccount, isActive: false }),
    }));
    const inactiveResponse = makeResponse();
    await inactiveHandlers.list(
      {} as Request,
      inactiveResponse as unknown as Response,
    );
    assert.equal(inactiveResponse.statusCode, 401);

    const handlers = createEntityContextHandlers(makeDependencies());
    const invalidResponse = makeResponse();
    await handlers.select(
      makeRequest({ entityId: '' }),
      invalidResponse as unknown as Response,
    );
    assert.equal(invalidResponse.statusCode, 400);
  });

  it('does not issue a scoped token when the signing secret is unavailable', async () => {
    let tokenIssued = false;
    const handlers = createEntityContextHandlers(makeDependencies({
      getAuthSecret: () => null,
      createAccessToken: () => {
        tokenIssued = true;
        return 'unexpected-token';
      },
    }));
    const response = makeResponse();

    await handlers.select(
      makeRequest({ entityId: company.id }),
      response as unknown as Response,
    );

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, {
      error: 'Authentification indisponible : configurez SAFE_ERP_AUTH_SECRET.',
    });
    assert.equal(tokenIssued, false);
  });
});
