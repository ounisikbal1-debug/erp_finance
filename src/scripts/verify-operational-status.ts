import assert from 'node:assert/strict';
import http from 'node:http';

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Configurez ${name} pour exécuter la vérification opérationnelle.`);
  }
  return value;
}

async function runVerification() {
  const authSecret = requiredEnvironmentValue('SAFE_ERP_AUTH_SECRET');
  if (Buffer.byteLength(authSecret, 'utf8') < 32) {
    throw new Error('SAFE_ERP_AUTH_SECRET doit contenir au moins 32 octets.');
  }
  const adminUsername = requiredEnvironmentValue('SAFE_ERP_VERIFY_ADMIN_USERNAME');
  const adminPassword = requiredEnvironmentValue('SAFE_ERP_VERIFY_ADMIN_PASSWORD');
  const financeUsername = requiredEnvironmentValue('SAFE_ERP_VERIFY_FINANCE_USERNAME');
  const financePassword = requiredEnvironmentValue('SAFE_ERP_VERIFY_FINANCE_PASSWORD');
  const { default: app } = await import('../application/server');

  console.log('Testing live server API...');
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Server address not resolved');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Server listening on ${baseUrl}`);

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200, 'Health check should be 200');
    const healthJson = await healthRes.json() as any;
    console.log('✔ Healthcheck OK:', healthJson.erp, healthJson.version);

    // 2. Login as admin
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: adminUsername, password: adminPassword }),
    });
    assert.equal(adminLoginRes.status, 200, 'Admin login should succeed with 200');
    const adminAuth = await adminLoginRes.json() as any;
    assert.ok(adminAuth.accessToken, 'Admin should receive accessToken');
    assert.equal(adminAuth.user.role, 'ADMIN', 'Admin role should be ADMIN');
    console.log('✔ Admin login OK:', adminAuth.user.username, adminAuth.user.role);

    // 3. Login as Financial Manager
    const finLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: financeUsername, password: financePassword }),
    });
    assert.equal(finLoginRes.status, 200, 'Finmgr login should succeed with 200');
    const finAuth = await finLoginRes.json() as any;
    assert.ok(finAuth.accessToken, 'Finmgr should receive accessToken');
    assert.equal(finAuth.user.role, 'FINANCIAL_MANAGER', 'Role should be FINANCIAL_MANAGER');
    console.log('✔ Finmgr login OK:', finAuth.user.username, finAuth.user.role, 'Entity:', finAuth.user.entityId);

    // 4. Test authenticated endpoint with token
    const entitiesRes = await fetch(`${baseUrl}/api/auth/entities`, {
      headers: { Authorization: `Bearer ${adminAuth.accessToken}` },
    });
    assert.equal(entitiesRes.status, 200, 'Entities should return 200 for authenticated admin');
    const entities = await entitiesRes.json() as any;
    console.log('✔ Authenticated entities list OK:', entities.length, 'entities available');

    console.log('\nOperational checks passed for the configured test environment.');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

runVerification().catch((err) => {
  console.error('Operational check failed:', err);
  process.exitCode = 1;
});
