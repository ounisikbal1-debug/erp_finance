import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AdminUserError,
  validateAdminUserInput,
  validateAdminUserPasswordReset,
  validateAdminUserStatus,
  validateAdminUserUpdate,
} from './users';

describe('admin user management validation', () => {
  it('normalizes valid account fields and supports an explicitly global account', () => {
    assert.deepEqual(validateAdminUserInput({
      username: '  finance.user  ',
      password: 'a-long-test-password',
      role: 'ACCOUNTANT',
    }), {
      username: 'finance.user',
      password: 'a-long-test-password',
      role: 'ACCOUNTANT',
      entityId: null,
    });
  });

  it('rejects short passwords and unsupported roles before persistence', () => {
    assert.throws(
      () => validateAdminUserInput({ username: 'finance', password: 'short', role: 'ACCOUNTANT' }),
      (error: unknown) => error instanceof AdminUserError && error.status === 400,
    );
    assert.throws(
      () => validateAdminUserInput({ username: 'finance', password: 'long-enough-password', role: 'SUPERUSER' }),
      (error: unknown) => error instanceof AdminUserError && error.status === 400,
    );
  });

  it('rejects malformed identifiers and non-string entity scopes', () => {
    assert.throws(
      () => validateAdminUserInput({ username: 'not valid', password: 'long-enough-password', role: 'ADMIN' }),
      (error: unknown) => error instanceof AdminUserError && error.status === 400,
    );
    assert.throws(
      () => validateAdminUserUpdate({ role: 'ADMIN', entityId: 7 }),
      (error: unknown) => error instanceof AdminUserError && error.status === 400,
    );
  });

  it('accepts reset passwords without trimming and enforces the password length bounds', () => {
    assert.equal(validateAdminUserPasswordReset({ password: ' secure test password ' }), ' secure test password ');
    assert.throws(
      () => validateAdminUserPasswordReset({ password: 'short' }),
      (error: unknown) => error instanceof AdminUserError && error.status === 400,
    );
    assert.throws(
      () => validateAdminUserPasswordReset({ password: 'x'.repeat(1025) }),
      (error: unknown) => error instanceof AdminUserError && error.status === 400,
    );
    assert.throws(() => validateAdminUserPasswordReset(null), AdminUserError);
  });

  it('accepts only explicit boolean account statuses', () => {
    assert.equal(validateAdminUserStatus({ isActive: false }), false);
    assert.equal(validateAdminUserStatus({ isActive: true }), true);
    assert.throws(() => validateAdminUserStatus({ isActive: 'false' }), AdminUserError);
    assert.throws(() => validateAdminUserStatus(null), AdminUserError);
  });
});
