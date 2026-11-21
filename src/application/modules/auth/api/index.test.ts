import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { it } from 'node:test';
import { createAccessToken, verifyAccessToken, type AuthenticatedUser } from '../../../auth';
import authRouter from './index';

const user: AuthenticatedUser = {
  id: 'logout-test-user',
  username: 'logout-test-user',
  role: 'ADMIN',
  entityId: null,
};
const secret = 'a-synthetic-logout-test-secret-longer-than-thirty-two-bytes';

it('revokes the authenticated session on logout', async () => {
  const previousSecret = process.env.SAFE_ERP_AUTH_SECRET;
  const previousPersistentSessions = process.env.SAFE_ERP_PERSISTENT_SESSIONS;
  process.env.SAFE_ERP_AUTH_SECRET = secret;
  delete process.env.SAFE_ERP_PERSISTENT_SESSIONS;

  const app = express();
  app.use('/api/auth', authRouter);
  const server = createServer(app);
  const token = createAccessToken(user, secret);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve());
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 204);
    assert.equal(verifyAccessToken(token, secret), null);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    if (previousSecret === undefined) delete process.env.SAFE_ERP_AUTH_SECRET;
    else process.env.SAFE_ERP_AUTH_SECRET = previousSecret;
    if (previousPersistentSessions === undefined) delete process.env.SAFE_ERP_PERSISTENT_SESSIONS;
    else process.env.SAFE_ERP_PERSISTENT_SESSIONS = previousPersistentSessions;
  }
});
