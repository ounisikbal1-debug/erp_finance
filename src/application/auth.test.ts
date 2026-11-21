import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  authorize,
  createAccessToken,
  getAccessPolicySnapshot,
  getAuthSecret,
  getModuleRoles,
  revokeUserSessions,
  SESSION_IDLE_TIMEOUT_SECONDS,
  USER_ROLES,
  type AuthenticatedUser,
  UserRole,
  verifyAccessToken,
} from './auth';
import type { Response } from 'express';
import { hashPassword, verifyPassword } from './security/passwords';

const user = {
  id: 'user-1',
  username: 'admin',
  role: 'ADMIN' as const,
  entityId: 'entity-1',
};
const secret = 'a-test-secret-longer-than-thirty-two-bytes';

describe('API authentication', () => {
  it('requires an explicitly configured authentication secret of at least 32 bytes', () => {
    const previousSecret = process.env.SAFE_ERP_AUTH_SECRET;
    try {
      delete process.env.SAFE_ERP_AUTH_SECRET;
      assert.equal(getAuthSecret(), null);

      process.env.SAFE_ERP_AUTH_SECRET = 'too-short';
      assert.equal(getAuthSecret(), null);

      const configuredSecret = 'a'.repeat(32);
      process.env.SAFE_ERP_AUTH_SECRET = configuredSecret;
      assert.equal(getAuthSecret(), configuredSecret);
    } finally {
      if (previousSecret === undefined) delete process.env.SAFE_ERP_AUTH_SECRET;
      else process.env.SAFE_ERP_AUTH_SECRET = previousSecret;
    }
  });

  it('allows only authenticated users with an explicitly permitted route role', () => {
    const makeResponse = (authenticatedUser?: AuthenticatedUser) => ({
      locals: { authenticatedUser },
      statusCode: 0,
      body: undefined as unknown,
      status(statusCode: number) {
        this.statusCode = statusCode;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
    });

    let allowedNextCalled = false;
    const allowedResponse = makeResponse(user);
    authorize('ADMIN')({} as never, allowedResponse as unknown as Response, () => {
      allowedNextCalled = true;
    });
    assert.equal(allowedNextCalled, true);
    assert.equal(allowedResponse.statusCode, 0);

    let deniedNextCalled = false;
    const deniedResponse = makeResponse({ ...user, role: 'ACCOUNTANT' });
    authorize('ADMIN')({} as never, deniedResponse as unknown as Response, () => {
      deniedNextCalled = true;
    });
    assert.equal(deniedNextCalled, false);
    assert.equal(deniedResponse.statusCode, 403);

    const anonymousResponse = makeResponse();
    authorize('ADMIN')({} as never, anonymousResponse as unknown as Response, () => {
      assert.fail('Unauthenticated request must not reach the route.');
    });
    assert.equal(anonymousResponse.statusCode, 401);
  });

  it('hashes passwords with a unique salt and verifies only the matching password', async () => {
    const first = await hashPassword('a-secure-test-password');
    const second = await hashPassword('a-secure-test-password');
    assert.notEqual(first, second);
    assert.equal(await verifyPassword('a-secure-test-password', first), true);
    assert.equal(await verifyPassword('incorrect-password', first), false);
    assert.equal(await verifyPassword('a-secure-test-password', 'legacy-plaintext'), false);
  });

  it('renews the inactivity timeout on activity and expires after 60 idle minutes', () => {
    const now = 1_800_000_000_000;
    const token = createAccessToken(user, secret, now);
    assert.equal(SESSION_IDLE_TIMEOUT_SECONDS, 60 * 60);
    assert.deepEqual(verifyAccessToken(token, secret, now), user);
    assert.deepEqual(verifyAccessToken(token, secret, now + 59 * 60 * 1000), user);
    assert.equal(verifyAccessToken(token, 'another-secret-longer-than-thirty-two-bytes', now), null);
    assert.equal(verifyAccessToken(`${token.slice(0, -2)}xx`, secret, now), null);
    assert.deepEqual(verifyAccessToken(token, secret, now + 118 * 60 * 1000), user);
    assert.equal(verifyAccessToken(token, secret, now + 178 * 60 * 1000), null);
    assert.equal(verifyAccessToken(`${token}.extra`, secret, now), null);

    const idleToken = createAccessToken(user, secret, now);
    assert.equal(verifyAccessToken(idleToken, secret, now + 60 * 60 * 1000), null);
  });

  it('revokes all active sessions for a user after a security change', () => {
    const token = createAccessToken(user, secret);
    assert.deepEqual(verifyAccessToken(token, secret), user);
    revokeUserSessions(user.id);
    assert.equal(verifyAccessToken(token, secret), null);
  });

  it('defines least-privilege module role policies', () => {
    assert.deepEqual(getModuleRoles('admin'), ['ADMIN']);
    assert.deepEqual(getModuleRoles('consolidation'), ['ADMIN']);
    assert.deepEqual(getModuleRoles('intercompany'), ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT']);
    assert.deepEqual(getModuleRoles('hr'), ['ADMIN', 'HR_MANAGER']);
    assert.deepEqual(getModuleRoles('sales'), ['ADMIN', 'FINANCIAL_MANAGER', 'SALES_OFFICER']);
    assert.deepEqual(getModuleRoles('receivables'), ['ADMIN', 'FINANCIAL_MANAGER', 'SALES_OFFICER']);
    assert.deepEqual(getModuleRoles('anomalies'), ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT']);
    assert.deepEqual(getModuleRoles('purchases'), ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT']);
    assert.deepEqual(getModuleRoles('fx-rates'), ['ADMIN', 'FINANCIAL_MANAGER', 'SALES_OFFICER']);
    assert.deepEqual(getModuleRoles('dashboard'), USER_ROLES);
    assert.deepEqual(getModuleRoles('finance'), ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT']);
    assert.deepEqual(getModuleRoles('monthly-close'), ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT']);
    assert.deepEqual(getModuleRoles('advanced-finance'), ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT']);
    assert.deepEqual(getModuleRoles('taxation'), ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT']);
    assert.equal(getModuleRoles('admin')?.includes('ACCOUNTANT'), false);
    assert.equal(getModuleRoles('hr')?.includes('ACCOUNTANT'), false);
    assert.equal(getModuleRoles('materials')?.includes('ACCOUNTANT'), false);
    assert.equal(getModuleRoles('cashflow')?.includes('ACCOUNTANT'), false);
    assert.equal(getModuleRoles('budget')?.includes('ACCOUNTANT'), false);
    assert.equal(getModuleRoles('missing-module'), undefined);
    const hrRoles = getModuleRoles('hr') as readonly UserRole[];
    assert.equal(hrRoles.includes('SALES_OFFICER'), false);
  });

  it('snapshots the exact API role policies without exposing mutable policy arrays', () => {
    const snapshot = getAccessPolicySnapshot();
    assert.deepEqual(snapshot.roles, USER_ROLES);
    for (const policy of snapshot.policies) {
      assert.deepEqual(policy.allowedRoles, getModuleRoles(policy.module));
    }
    const consolidation = snapshot.policies.find(({ module }) => module === 'consolidation');
    assert.deepEqual(consolidation?.allowedRoles, ['ADMIN']);
    const intercompany = snapshot.policies.find(({ module }) => module === 'intercompany');
    assert.deepEqual(intercompany?.allowedRoles, ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT']);
  });
});
