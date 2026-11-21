import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import express from 'express';

type ModuleName = 'budget' | 'sales' | 'finance' | 'cashflow';
type Phase = 'read' | 'write';
type Measurement = {
  module: ModuleName;
  phase: Phase;
  status: number;
  elapsedMs: number;
  body?: unknown;
  error?: string;
};

const moduleNames: ModuleName[] = ['budget', 'sales', 'finance', 'cashflow'];
const concurrencyStages = [1, 2, 4, 8, 12, 16, 20, 24, 28, 32];
const readP95LimitMs = 500;
const writeP95LimitMs = 1000;
const runId = Math.random().toString(36).slice(2, 9).toUpperCase();
const projectRoot = resolve(__dirname, '../..');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'safe-erp-concurrency-'));
const databasePath = resolve(temporaryDirectory, 'concurrency.db');
const schemaPath = resolve(temporaryDirectory, 'schema.prisma');
const databaseUrl = process.platform === 'win32'
  ? `file:${databasePath.replace(/\\/g, '/')}`
  : pathToFileURL(databasePath).href;
const testEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  SAFE_ERP_TEST_DATABASE_URL: databaseUrl,
};

assert.ok(databasePath.startsWith(`${resolve(temporaryDirectory)}${sep}`));
assert.ok(!databasePath.startsWith(projectRoot));

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function summarize(measurements: Measurement[]) {
  const elapsed = measurements.map(({ elapsedMs }) => elapsedMs);
  return {
    requests: measurements.length,
    errors: measurements.filter(({ error }) => error !== undefined).length,
    conflicts: measurements.filter(({ status }) => status === 409).length,
    p50Ms: Number(percentile(elapsed, 0.5).toFixed(2)),
    p95Ms: Number(percentile(elapsed, 0.95).toFixed(2)),
    maxMs: Number(Math.max(...elapsed).toFixed(2)),
  };
}

async function main() {
  let prisma: typeof import('../data/prisma/client').default | undefined;
  let server: Server | undefined;
  let integrityFailure = false;
  let maximumTested = 0;
  let maximumSatisfying = 0;
  let stopReason = 'Cap de sécurité atteint : 32 utilisateurs concurrents.';
  const expectedWrites: Record<ModuleName, number> = {
    budget: 0,
    sales: 0,
    finance: 0,
    cashflow: 0,
  };
  const previousEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    SAFE_ERP_DATABASE_URL: process.env.SAFE_ERP_DATABASE_URL,
    SAFE_ERP_TEST_DATABASE_URL: process.env.SAFE_ERP_TEST_DATABASE_URL,
    SAFE_ERP_AUTH_SECRET: process.env.SAFE_ERP_AUTH_SECRET,
  };

  try {
    const sourceSchema = readFileSync(join(projectRoot, 'src', 'data', 'prisma', 'schema.prisma'), 'utf8');
    const isolatedSchema = sourceSchema.replace(
      /url\s*=\s*env\("SAFE_ERP_DATABASE_URL"\)/,
      'url = env("SAFE_ERP_TEST_DATABASE_URL")',
    );
    if (isolatedSchema === sourceSchema) {
      throw new Error('Impossible de confirmer la substitution de la cible SQLite dans le schéma isolé.');
    }
    writeFileSync(schemaPath, isolatedSchema, 'utf8');
    process.env.NODE_ENV = 'test';
    process.env.SAFE_ERP_DATABASE_URL = databaseUrl;
    process.env.SAFE_ERP_TEST_DATABASE_URL = databaseUrl;
    process.env.SAFE_ERP_AUTH_SECRET = 'synthetic-concurrency-test-secret-0123456789';
    execFileSync(process.execPath, [
      require.resolve('prisma'),
      'db',
      'push',
      '--schema',
      schemaPath,
      '--skip-generate',
    ], {
      cwd: projectRoot,
      env: {
        ...testEnvironment,
        SAFE_ERP_DATABASE_URL: databaseUrl,
        SAFE_ERP_AUTH_SECRET: process.env.SAFE_ERP_AUTH_SECRET,
      },
      stdio: 'inherit',
    });

    prisma = require('../data/prisma/client').default;
    const {
      authorize,
      createAccessToken,
      authenticate,
      getModuleRoles,
    } = require('../application/auth') as typeof import('../application/auth');
    const { default: budgetRouter } = require('../application/modules/budget/api/index') as typeof import('../application/modules/budget/api');
    const { default: salesRouter } = require('../application/modules/sales/api/index') as typeof import('../application/modules/sales/api');
    const { default: financeRouter } = require('../application/modules/finance/api/index') as typeof import('../application/modules/finance/api');
    const { default: cashflowRouter } = require('../application/modules/cashflow/api/index') as typeof import('../application/modules/cashflow/api');

    const country = await prisma.countryProfile.create({
      data: { code: `Z${runId}`, name: `Synthetic load country ${runId}`, currencyCode: 'TND' },
    });
    const entity = await prisma.entity.create({
      data: { code: `LOAD-${runId}`, name: `Synthetic load entity ${runId}`, countryId: country.id },
    });
    const userRows = await prisma.user.createManyAndReturn({
      data: Array.from({ length: 32 }, (_, index) => ({
        username: `load-${runId}-${String(index + 1).padStart(2, '0')}`,
        passwordHash: 'synthetic-only-unused',
        role: 'FINANCIAL_MANAGER',
        entityId: entity.id,
      })),
      select: { id: true, username: true, role: true, entityId: true },
    });
    const userIds = new Set(userRows.map(({ id }) => id));
    const budgetAccounts = Array.from({ length: 200 }, (_, index) => ({
      countryId: country.id,
      code: `LOAD-${runId}-EXP-${String(index + 1).padStart(4, '0')}`,
      description: 'Synthetic concurrency expense account',
      classNumber: 6,
      type: 'Expense',
      isPostingAllowed: true,
    }));
    await prisma.chartOfAccount.createMany({
      data: [
        ...budgetAccounts,
        {
          countryId: country.id,
          code: `LOAD-${runId}-ASSET`,
          description: 'Synthetic concurrency asset account',
          classNumber: 1,
          type: 'Asset',
          isPostingAllowed: true,
        },
        {
          countryId: country.id,
          code: `LOAD-${runId}-REVENUE`,
          description: 'Synthetic concurrency revenue account',
          classNumber: 7,
          type: 'Revenue',
          isPostingAllowed: true,
        },
      ],
    });
    const bankAccount = await prisma.bankAccount.create({
      data: {
        entityId: entity.id,
        name: `Synthetic load account ${runId}`,
        currencyCode: 'TND',
        ledgerAccountCode: `LOAD-${runId}-ASSET`,
      },
    });

    const app = express();
    app.use(express.json({ limit: '1mb' }));
    const routers = {
      budget: budgetRouter,
      sales: salesRouter,
      finance: financeRouter,
      cashflow: cashflowRouter,
    };
    for (const moduleName of moduleNames) {
      const roles = getModuleRoles(moduleName);
      if (!roles) throw new Error(`Politique d’accès manquante pour ${moduleName}.`);
      app.use(`/api/${moduleName}`, authenticate, authorize(...roles), routers[moduleName]);
    }
    server = createServer(app);
    await new Promise<void>((resolveListen, rejectListen) => {
      server?.once('error', rejectListen);
      server?.listen(0, '127.0.0.1', resolveListen);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Le serveur local temporaire ne fournit pas de port TCP.');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const secret = process.env.SAFE_ERP_AUTH_SECRET;
    if (!secret) throw new Error('La clé de test synthétique est absente.');
    const tokens = userRows.map((user) => createAccessToken({
      id: user.id,
      username: user.username,
      role: 'FINANCIAL_MANAGER',
      entityId: entity.id,
    }, secret));
    let writeSequence = 0;
    let budgetAccountSequence = 0;

    async function performRequest(
      moduleName: ModuleName,
      token: string,
      phase: Phase,
      method: 'GET' | 'POST',
      path: string,
      body?: unknown,
    ): Promise<Measurement> {
      const startedAt = performance.now();
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const responseText = await response.text();
        let payload: unknown;
        try {
          payload = responseText ? JSON.parse(responseText) : undefined;
        } catch {
          payload = responseText;
        }
        return {
          module: moduleName,
          phase,
          status: response.status,
          elapsedMs: performance.now() - startedAt,
          body: payload,
          ...(!response.ok ? { error: isRecord(payload) && typeof payload.error === 'string'
            ? payload.error
            : `HTTP ${response.status}` } : {}),
        };
      } catch (error) {
        return {
          module: moduleName,
          phase,
          status: 0,
          elapsedMs: performance.now() - startedAt,
          error: error instanceof Error ? error.message : 'Erreur réseau inconnue.',
        };
      }
    }

    function readOperation(moduleName: ModuleName, token: string): Promise<Measurement> {
      switch (moduleName) {
        case 'budget':
          return performRequest(moduleName, token, 'read', 'GET', '/api/budget/data?period=2026-03');
        case 'sales':
          return performRequest(moduleName, token, 'read', 'GET', '/api/sales/invoices?page=1&pageSize=10');
        case 'finance':
          return performRequest(moduleName, token, 'read', 'GET', '/api/finance/journal-entries');
        case 'cashflow':
          return performRequest(moduleName, token, 'read', 'GET', '/api/cashflow/data?period=2026-03');
      }
    }

    function writeOperation(moduleName: ModuleName, token: string): Promise<Measurement> {
      writeSequence += 1;
      const suffix = String(writeSequence).padStart(5, '0');
      switch (moduleName) {
        case 'budget': {
          budgetAccountSequence += 1;
          const accountCode = budgetAccounts[budgetAccountSequence - 1]?.code;
          if (!accountCode) throw new Error('Le nombre de comptes budgétaires synthétiques préalloués est insuffisant.');
          return performRequest(moduleName, token, 'write', 'POST', '/api/budget/lines', {
            period: '2026-03',
            accountCode,
            amount: 100,
          });
        }
        case 'sales':
          return performRequest(moduleName, token, 'write', 'POST', '/api/sales/customers', {
            code: `LOAD-${runId}-C-${suffix}`,
            name: `Synthetic load customer ${suffix}`,
          });
        case 'finance':
          return performRequest(moduleName, token, 'write', 'POST', '/api/finance/journal-entries', {
            entryNumber: `LOAD-${runId}-J-${suffix}`,
            date: '2026-03-15',
            description: `Synthetic load journal ${suffix}`,
            note: 'Synthetic concurrency test entry.',
            lines: [
              { accountCode: `LOAD-${runId}-ASSET`, debit: 100, credit: 0 },
              { accountCode: `LOAD-${runId}-REVENUE`, debit: 0, credit: 100 },
            ],
          });
        case 'cashflow':
          return performRequest(moduleName, token, 'write', 'POST', '/api/cashflow/forecast/scenarios', {
            name: `Synthetic load scenario ${runId}-${suffix}`,
            bankAccountId: bankAccount.id,
          });
      }
    }

    function ensureReadShape(measurements: Measurement[]) {
      for (const measurement of measurements) {
        if (measurement.error) continue;
        const valid = measurement.module === 'finance'
          ? Array.isArray(measurement.body)
          : measurement.module === 'sales'
            ? isRecord(measurement.body) && Array.isArray(measurement.body.items)
            : isRecord(measurement.body);
        if (!valid) measurement.error = 'La forme de la réponse de lecture ne correspond pas au module.';
      }
    }

    async function verifyIntegrity() {
      const prefix = `LOAD-${runId}-`;
      const [budgetLines, customers, journals, scenarios] = await Promise.all([
        prisma?.budgetLine.findMany({
          where: { entityId: entity.id, accountCode: { startsWith: `${prefix}EXP-` } },
          select: { entityId: true, status: true, createdByUserId: true, amount: true },
        }),
        prisma?.customer.findMany({
          where: { entityId: entity.id, code: { startsWith: `${prefix}C-` } },
          select: { entityId: true },
        }),
        prisma?.journalEntry.findMany({
          where: { entityId: entity.id, entryNumber: { startsWith: `${prefix}J-` } },
          include: { lines: true, workflowEvents: true },
        }),
        prisma?.cashForecastScenario.findMany({
          where: { entityId: entity.id, name: { startsWith: `Synthetic load scenario ${runId}-` } },
          select: { entityId: true, bankAccountId: true },
        }),
      ]);
      const rows = { budget: budgetLines ?? [], sales: customers ?? [], finance: journals ?? [], cashflow: scenarios ?? [] };
      const validBudget = rows.budget.every((line) => line.entityId === entity.id
        && line.status === 'DRAFT'
        && userIds.has(line.createdByUserId)
        && line.amount === 100);
      const validCustomers = rows.sales.every((customer) => customer.entityId === entity.id);
      const validJournals = rows.finance.every((entry) => {
        const debits = entry.lines.reduce((sum, line) => sum + line.debit, 0);
        const credits = entry.lines.reduce((sum, line) => sum + line.credit, 0);
        return entry.entityId === entity.id
          && entry.status === 'TO_REVIEW'
          && userIds.has(entry.createdByUserId ?? '')
          && debits === credits
          && entry.workflowEvents.length === 1
          && entry.workflowEvents[0].actorUserId === entry.createdByUserId;
      });
      const validScenarios = rows.cashflow.every((scenario) => scenario.entityId === entity.id
        && scenario.bankAccountId === bankAccount.id);
      const countsMatch = (Object.keys(expectedWrites) as ModuleName[])
        .every((moduleName) => rows[moduleName].length === expectedWrites[moduleName]);
      return {
        valid: countsMatch && validBudget && validCustomers && validJournals && validScenarios,
        counts: Object.fromEntries((Object.keys(expectedWrites) as ModuleName[])
          .map((moduleName) => [moduleName, rows[moduleName].length])),
        expected: { ...expectedWrites },
      };
    }

    console.log(JSON.stringify({
      config: {
        modules: moduleNames,
        moduleMix: 'round-robin virtual users; 5 per module at 20 total, 8 per module at 32 total',
        stages: concurrencyStages,
        readP95LimitMs,
        writeP95LimitMs,
        maximumConcurrentUsers: 32,
        database: 'disposable SQLite under OS temp directory',
      },
    }));

    for (const concurrency of concurrencyStages) {
      const assignments = Array.from({ length: concurrency }, (_, index) => ({
        module: moduleNames[index % moduleNames.length],
        token: tokens[index],
        userId: userRows[index].id,
      }));
      maximumTested = concurrency;
      const reads = await Promise.all(assignments.map(({ module, token }) => readOperation(module, token)));
      ensureReadShape(reads);
      const readSummary = summarize(reads);
      const readFailed = readSummary.errors > 0
        || readSummary.conflicts > 0
        || readSummary.p95Ms > readP95LimitMs;
      let writeSummary: ReturnType<typeof summarize> | null = null;
      let integrity: Awaited<ReturnType<typeof verifyIntegrity>> | null = null;

      if (readFailed) {
        stopReason = readSummary.errors > 0 || readSummary.conflicts > 0
          ? 'Erreur ou conflit HTTP pendant la phase de lecture.'
          : `P95 lecture (${readSummary.p95Ms} ms) supérieur au seuil (${readP95LimitMs} ms).`;
      } else {
        for (const { module } of assignments) expectedWrites[module] += 1;
        const writes = await Promise.all(assignments.map(({ module, token }) => writeOperation(module, token)));
        writeSummary = summarize(writes);
        const writeFailed = writeSummary.errors > 0
          || writeSummary.conflicts > 0
          || writeSummary.p95Ms > writeP95LimitMs;
        integrity = await verifyIntegrity();
        const integrityFailed = !integrity.valid;
        integrityFailure ||= integrityFailed;
        if (writeFailed) {
          stopReason = writeSummary.errors > 0 || writeSummary.conflicts > 0
            ? 'Erreur ou conflit HTTP pendant la phase d’écriture.'
            : `P95 écriture (${writeSummary.p95Ms} ms) supérieur au seuil (${writeP95LimitMs} ms).`;
        } else if (integrityFailed) {
          stopReason = 'L’intégrité des écritures synthétiques ne correspond pas aux opérations attendues.';
        }
        if (!writeFailed && !integrityFailed) {
          maximumSatisfying = concurrency;
        }
        console.log(JSON.stringify({
          totalConcurrentUsers: concurrency,
          activeUsersByModule: moduleNames.map((module) => ({
            module,
            users: assignments.filter((item) => item.module === module).length,
          })),
          reads: readSummary,
          writes: writeSummary,
          integrity,
          satisfying: !writeFailed && !integrityFailed,
        }));
        if (writeFailed || integrityFailed) break;
        continue;
      }

      console.log(JSON.stringify({
        totalConcurrentUsers: concurrency,
        activeUsersByModule: moduleNames.map((module) => ({
          module,
          users: assignments.filter((item) => item.module === module).length,
        })),
        reads: readSummary,
        writes: writeSummary,
        integrity,
        satisfying: false,
        stopReason,
      }));
      break;
    }

    console.log(JSON.stringify({
      result: 'complete',
      maximumTestedTotalConcurrency: maximumTested,
      maximumSatisfyingTotalConcurrency: maximumSatisfying,
      moduleMixAtMaximumTested: moduleNames.map((module) => ({
        module,
        users: Math.floor(maximumTested / moduleNames.length)
          + (moduleNames.indexOf(module) < maximumTested % moduleNames.length ? 1 : 0),
      })),
      stopReason,
      integrityFailure,
      scope: 'This result applies only to this run’s machine, Node version, harness, and disposable SQLite configuration.',
    }));
    if (integrityFailure) process.exitCode = 1;
  } finally {
    if (server?.listening) {
      await new Promise<void>((resolveClose, rejectClose) => {
        server?.close((error) => error ? rejectClose(error) : resolveClose());
      });
    }
    if (prisma) await prisma.$disconnect();
    for (const [name, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error('Échec du test de capacité isolé:', error);
  process.exitCode = 1;
});
