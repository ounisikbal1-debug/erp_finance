import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import {
  authenticate,
  authenticateCredentials,
  authorize,
  createAccessToken,
  getModuleRoles,
  revokeUserSessions,
  verifyAccessToken,
} from '../../auth';
import { verifyPassword } from '../../security/passwords';
import prisma from '../../../data/prisma/client';
import authRouter from '../auth/api';
import adminRouter from './api';

const secret = 'a-synthetic-admin-user-integration-secret';

describe('admin user management API integration', () => {
  it('creates users, updates persisted role and scope, and protects administrator access', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use(authenticate, authorize(...(getModuleRoles('admin') ?? [])));
    app.use(adminRouter);
    const server = createServer(app);
    const originalSecret = process.env.SAFE_ERP_AUTH_SECRET;
    process.env.SAFE_ERP_AUTH_SECRET = secret;
    const adminId = `TEST_admin_${Date.now()}`;
    const createdUsername = `TEST_account_${Date.now()}`;
    let createdUserId: string | null = null;

    await prisma.user.create({
      data: { id: adminId, username: adminId, passwordHash: 'test-only', role: 'ADMIN' },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      const token = createAccessToken({
        id: adminId,
        username: adminId,
        role: 'ADMIN',
        entityId: null,
      }, secret);

      const listed = await fetch(`${base}/users`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(listed.status, 200);
      const listedBody = await listed.json() as {
        users: Array<Record<string, unknown>>;
        entities: unknown[];
        events: Array<Record<string, unknown>>;
      };
      assert.ok(Array.isArray(listedBody.users));
      assert.ok(Array.isArray(listedBody.events));
      assert.ok(!('passwordHash' in listedBody.users.find((user) => user.id === adminId)!));

      const initialPassword = 'a-secure-test-password';
      const created = await fetch(`${base}/users`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: createdUsername, password: initialPassword, role: 'HR_MANAGER' }),
      });
      assert.equal(created.status, 201);
      const createdUser = await created.json() as { id: string; role: string; entityId: string | null; isActive: boolean };
      createdUserId = createdUser.id;
      assert.equal(createdUser.isActive, true);
      const persisted = await prisma.user.findUniqueOrThrow({ where: { id: createdUser.id } });
      assert.equal(createdUser.role, 'HR_MANAGER');
      assert.equal(persisted.entityId, null);
      assert.ok(await verifyPassword(initialPassword, persisted.passwordHash));
      const login = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: createdUsername, password: initialPassword }),
      });
      assert.equal(login.status, 200);
      assert.equal(login.headers.get('content-type')?.includes('application/json'), true);
      assert.equal((await login.json() as { user: { id: string } }).user.id, createdUser.id);
      const creationEvent = await prisma.adminUserEvent.findFirst({
        where: { targetUserId: createdUser.id, action: 'USER_CREATED' },
      });
      assert.equal(creationEvent?.actorUserId, adminId);
      assert.ok(!JSON.stringify(creationEvent).includes(initialPassword));
      const priorRoleToken = createAccessToken({
        id: createdUser.id,
        username: createdUsername,
        role: 'HR_MANAGER',
        entityId: null,
      }, secret);

      const updated = await fetch(`${base}/users/${encodeURIComponent(createdUser.id)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'SALES_OFFICER', entityId: null }),
      });
      assert.equal(updated.status, 200);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: createdUser.id } })).role, 'SALES_OFFICER');
      assert.equal(verifyAccessToken(priorRoleToken, secret), null);
      assert.equal(await prisma.adminUserEvent.count({
        where: { targetUserId: createdUser.id, action: 'USER_ACCESS_UPDATED', previousRole: 'HR_MANAGER', nextRole: 'SALES_OFFICER' },
      }), 1);

      const activeTokenBeforeReset = createAccessToken({
        id: createdUser.id,
        username: createdUsername,
        role: 'SALES_OFFICER',
        entityId: null,
      }, secret);
      const invalidPasswordReset = await fetch(`${base}/users/${encodeURIComponent(createdUser.id)}/password`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'short' }),
      });
      assert.equal(invalidPasswordReset.status, 400);

      const resetPassword = 'a-different-secure-test-password';
      const passwordReset = await fetch(`${base}/users/${encodeURIComponent(createdUser.id)}/password`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      });
      assert.equal(passwordReset.status, 200);
      const passwordResetBody = await passwordReset.json() as Record<string, unknown>;
      assert.ok(!('passwordHash' in passwordResetBody));
      const passwordResetUser = await prisma.user.findUniqueOrThrow({ where: { id: createdUser.id } });
      assert.ok(await verifyPassword(resetPassword, passwordResetUser.passwordHash));
      assert.equal(await verifyPassword(initialPassword, passwordResetUser.passwordHash), false);
      assert.equal(verifyAccessToken(activeTokenBeforeReset, secret), null);
      const passwordResetEvent = await prisma.adminUserEvent.findFirst({
        where: { targetUserId: createdUser.id, action: 'USER_PASSWORD_RESET' },
      });
      assert.equal(passwordResetEvent?.actorUserId, adminId);
      assert.ok(!JSON.stringify(passwordResetEvent).includes(resetPassword));

      const loggedInBeforeDeactivation = await authenticateCredentials(createdUsername, resetPassword);
      assert.ok(loggedInBeforeDeactivation);
      const activeTokenBeforeDeactivation = createAccessToken({
        id: createdUser.id,
        username: createdUsername,
        role: 'SALES_OFFICER',
        entityId: null,
      }, secret);
      const deactivated = await fetch(`${base}/users/${encodeURIComponent(createdUser.id)}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      assert.equal(deactivated.status, 200);
      assert.equal((await deactivated.json() as { isActive: boolean }).isActive, false);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: createdUser.id } })).isActive, false);
      assert.equal(verifyAccessToken(activeTokenBeforeDeactivation, secret), null);
      assert.equal(await authenticateCredentials(createdUsername, resetPassword), null);
      const deactivationEvent = await prisma.adminUserEvent.findFirst({
        where: { targetUserId: createdUser.id, action: 'USER_DEACTIVATED' },
      });
      assert.equal(deactivationEvent?.actorUserId, adminId);
      assert.ok(!JSON.stringify(deactivationEvent).includes(resetPassword));

      const reactivated = await fetch(`${base}/users/${encodeURIComponent(createdUser.id)}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      });
      assert.equal(reactivated.status, 200);
      assert.equal((await reactivated.json() as { isActive: boolean }).isActive, true);
      assert.ok(await authenticateCredentials(createdUsername, resetPassword));

      const selfUpdate = await fetch(`${base}/users/${encodeURIComponent(adminId)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'ACCOUNTANT', entityId: null }),
      });
      assert.equal(selfUpdate.status, 409);

      const selfPasswordReset = await fetch(`${base}/users/${encodeURIComponent(adminId)}/password`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'a-different-secure-test-password' }),
      });
      assert.equal(selfPasswordReset.status, 409);

      const selfDeactivation = await fetch(`${base}/users/${encodeURIComponent(adminId)}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      assert.equal(selfDeactivation.status, 409);

      const differentAdministratorToken = createAccessToken({
        id: `TEST_second_admin_${Date.now()}`,
        username: 'TEST_second_admin',
        role: 'ADMIN',
        entityId: null,
      }, secret);
      const lastAdminUpdate = await fetch(`${base}/users/${encodeURIComponent(adminId)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${differentAdministratorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'ACCOUNTANT', entityId: null }),
      });
      assert.equal(lastAdminUpdate.status, 409);
      const lastAdminDeactivation = await fetch(`${base}/users/${encodeURIComponent(adminId)}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${differentAdministratorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      assert.equal(lastAdminDeactivation.status, 409);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).role, 'ADMIN');
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).isActive, true);
    } finally {
      revokeUserSessions(adminId);
      if (createdUserId) revokeUserSessions(createdUserId);
      if (originalSecret === undefined) delete process.env.SAFE_ERP_AUTH_SECRET;
      else process.env.SAFE_ERP_AUTH_SECRET = originalSecret;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      await prisma.user.deleteMany({ where: { id: { in: [adminId, createdUsername] } } });
      await prisma.user.deleteMany({ where: { username: createdUsername } });
    }
  });
});
