const http = require('http');

function postJson(url, data, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch (e) {
          resolve({ status: res.statusCode, raw });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getJson(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch (e) {
          resolve({ status: res.statusCode, raw });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('Testing authentication...');
  // Check login options first to see valid entity ids
  const options = await getJson('http://127.0.0.1:3001/api/auth/login-options');
  console.log('Login options:', options.status, options.body);

  const entity = options.body.entities[0];
  const loginRes = await postJson('http://127.0.0.1:3001/api/auth/login', {
    username: 'admin',
    password: 'ChangeMe123!',
    entityId: entity.id,
    role: 'ADMIN'
  });
  console.log('Login result:', loginRes.status, loginRes.body);
  if (!loginRes.body.accessToken) {
    console.error('No accessToken!');
    return;
  }
  const token = loginRes.body.accessToken;

  console.log('\n--- 1. Cashflow Data ---');
  const cf = await getJson('http://127.0.0.1:3001/api/cashflow/data?period=2026-11', token);
  console.log('Cashflow /data status:', cf.status, cf.body?.error || cf.status);

  console.log('\n--- 2. Budget ---');
  const bg = await getJson('http://127.0.0.1:3001/api/budget', token);
  console.log('Budget status:', bg.status, bg.body);

  console.log('\n--- 3. Finance (Journal entries, General Ledger) ---');
  const je = await getJson('http://127.0.0.1:3001/api/finance/journal-entries', token);
  console.log('Journal entries status:', je.status, je.body?.error || (Array.isArray(je.body) ? `Count: ${je.body.length}` : je.body));

  console.log('\n--- 4. Decision Support ---');
  const ds = await getJson('http://127.0.0.1:3001/api/bi/kpi', token);
  console.log('BI KPI status:', ds.status, ds.body?.error || ds.body);

  console.log('\n--- 5. Aged Payables ---');
  const ap = await getJson('http://127.0.0.1:3001/api/purchases/aging', token);
  console.log('Aged payables status:', ap.status, ap.body?.error || (Array.isArray(ap.body) ? `Count: ${ap.body.length}` : ap.body));

  console.log('\n--- 6. Taxation G50 ---');
  const tx = await getJson('http://127.0.0.1:3001/api/taxation/declaration?year=2026&month=10', token);
  console.log('Taxation status:', tx.status, tx.body?.error || tx.body);

  console.log('\n--- 7. Materials / Stocks / Production ---');
  const mat = await getJson('http://127.0.0.1:3001/api/materials', token);
  console.log('Materials status:', mat.status, Array.isArray(mat.body) ? `Count: ${mat.body.length}` : mat.body);
  const prod = await getJson('http://127.0.0.1:3001/api/production/work-orders', token);
  console.log('Production work orders status:', prod.status, Array.isArray(prod.body) ? `Count: ${prod.body.length}` : prod.body);
}

main().catch(console.error);
