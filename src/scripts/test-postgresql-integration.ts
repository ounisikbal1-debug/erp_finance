import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, cp, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import sqlite3 from 'sqlite3';

interface EmbeddedPostgresInstance {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  createDatabase(name: string): Promise<void>;
}

interface PostgresToolsInstaller {
  setup(): Promise<void>;
  readonly programDir: string;
}

interface ToolResult {
  command: string;
  output: string;
}

interface PgClientLike {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<Row = Record<string, unknown>>(
    query: string,
    values?: unknown[],
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
}

interface PgClientConstructor {
  new(options: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    ssl: false;
  }): PgClientLike;
}

function newPgClient(
  Client: PgClientConstructor,
  database: string,
  port: number,
  password: string,
): PgClientLike {
  return new Client({
    host: '127.0.0.1',
    port,
    user: 'postgres',
    password,
    database,
    ssl: false,
  });
}

const projectRoot = resolve(__dirname, '../..');
const prismaCli = resolve(projectRoot, 'node_modules/prisma/build/index.js');
const tsNodeRegister = resolve(projectRoot, 'node_modules/ts-node/register/transpile-only');
const sqliteSchemaPath = resolve(projectRoot, 'src/data/prisma/schema.prisma');
const postgresSchemaPath = resolve(projectRoot, 'src/data/prisma/postgresql/schema.prisma');
const postgresMigrationsPath = resolve(projectRoot, 'src/data/prisma/postgresql/migrations');
const postgresDeployGuardPath = resolve(projectRoot, 'src/scripts/deploy-postgresql-migrations.ts');
const importerPath = resolve(projectRoot, 'src/scripts/import-sqlite-to-postgresql.ts');
const prismaPoolWorkerPath = resolve(projectRoot, 'src/scripts/test-postgresql-prisma-pool-worker.ts');
const prismaLockRaceWorkerPath = resolve(projectRoot, 'src/scripts/test-postgresql-prisma-lock-race-worker.ts');

function run(file: string, args: string[], environment: NodeJS.ProcessEnv): ToolResult {
  try {
    return {
      command: `${file} ${args.join(' ')}`,
      output: execFileSync(file, args, {
        cwd: projectRoot,
        env: environment,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        stdio: 'pipe',
      }),
    };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stderr?: Buffer | string; stdout?: Buffer | string };
    const detail = [failure.stderr, failure.stdout, failure.message]
      .filter(Boolean)
      .map((part) => String(part))
      .join('\n')
      .replace(/(postgres(?:ql)?:\/\/)[^/@\s]+@/gi, '$1[redacted]@');
    throw new Error(`Command failed: ${file} ${args.join(' ')}\n${detail}`);
  }
}

interface RaceWorkerProcess {
  child: ChildProcess;
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  stderr: string;
}

function startRaceWorker(
  mode: 'lock' | 'journal',
  signalDirectory: string,
  environment: NodeJS.ProcessEnv,
): RaceWorkerProcess {
  const child = spawn(process.execPath, [
    '--require',
    tsNodeRegister,
    prismaLockRaceWorkerPath,
    mode,
    signalDirectory,
  ], {
    cwd: projectRoot,
    env: environment,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
  });
  return { child, exit, get stderr() { return stderr; } };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitForRaceFile(
  filePath: string,
  worker: RaceWorkerProcess,
): Promise<void> {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      await access(filePath);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    if (worker.child.exitCode !== null || worker.child.signalCode !== null) {
      const { code, signal } = await worker.exit;
      throw new Error(
        `PostgreSQL race worker exited before creating ${filePath} (code ${code}, signal ${signal}). ${worker.stderr}`,
      );
    }
    await delay(20);
  }
  throw new Error(`Timed out waiting for PostgreSQL race marker ${filePath}. ${worker.stderr}`);
}

async function waitForPostgresLockWait(client: PgClientLike, applicationName: string): Promise<void> {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const { rows: [{ waiting }] } = await client.query<{ waiting: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_stat_activity
         WHERE datname = current_database()
           AND application_name = $1
           AND state = 'active'
           AND wait_event_type = 'Lock'
       ) AS "waiting"`,
      [applicationName],
    );
    if (waiting) return;
    await delay(25);
  }
  throw new Error(`Prisma journal process ${applicationName} was not observed waiting on a PostgreSQL lock.`);
}

async function runCrossProcessPeriodLockRace(
  client: PgClientLike,
  databaseUrl: string,
  signalDirectory: string,
): Promise<void> {
  await client.query(
    `INSERT INTO "Entity" ("id", "code", "name", "countryId")
     VALUES ('synthetic-lock-entity', 'SYNTH-LOCK', 'Synthetic lock entity', 'synthetic-country')`,
  );
  const lockWorker = startRaceWorker('lock', signalDirectory, prismaEnvironment(databaseUrl));
  const journalUrl = new URL(databaseUrl);
  const journalApplicationName = 'safe-period-lock-race-journal';
  journalUrl.searchParams.set('application_name', journalApplicationName);
  const journalWorker = startRaceWorker(
    'journal',
    signalDirectory,
    prismaEnvironment(journalUrl.toString()),
  );
  const workers = [lockWorker, journalWorker];

  try {
    await waitForRaceFile(join(signalDirectory, 'lock-created.json'), lockWorker);
    await waitForRaceFile(join(signalDirectory, 'journal-ready.json'), journalWorker);
    await writeFile(join(signalDirectory, 'start-journal.json'), '{}');
    await waitForRaceFile(join(signalDirectory, 'journal-attempting.json'), journalWorker);
    await waitForPostgresLockWait(client, journalApplicationName);
    await writeFile(join(signalDirectory, 'release-lock.json'), '{}');
    await Promise.all([
      waitForRaceFile(join(signalDirectory, 'lock-result.json'), lockWorker),
      waitForRaceFile(join(signalDirectory, 'journal-result.json'), journalWorker),
    ]);

    const [{ code: lockCode, signal: lockSignal }, { code: journalCode, signal: journalSignal }] = await Promise.all(
      workers.map((worker) => worker.exit),
    );
    assert.equal(lockCode, 0, `Close-lock process failed (${lockSignal}). ${lockWorker.stderr}`);
    assert.equal(journalCode, 0, `Journal process failed (${journalSignal}). ${journalWorker.stderr}`);
    assert.deepEqual(JSON.parse(await readFile(join(signalDirectory, 'lock-result.json'), 'utf8')), {
      lockMutationRejected: true,
    });
    assert.deepEqual(JSON.parse(await readFile(join(signalDirectory, 'journal-result.json'), 'utf8')), {
      journalInsertRejected: true,
    });
  } finally {
    await Promise.all([
      writeFile(join(signalDirectory, 'release-lock.json'), '{}'),
      writeFile(join(signalDirectory, 'start-journal.json'), '{}'),
    ]);
    for (const worker of workers) {
      if (worker.child.exitCode === null && worker.child.signalCode === null) worker.child.kill();
    }
    await Promise.allSettled(workers.map((worker) => worker.exit));
  }
}

function formatError(error: unknown): string {
  if (error instanceof AggregateError) {
    return [
      error.message,
      ...error.errors.map((nested) => formatError(nested)),
    ].join('\n');
  }
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

function exitAfterCleanup(exitCode: number): void {
  process.exit(exitCode);
}

function prismaEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SAFE_ERP_DATABASE_PROVIDER: 'postgresql',
    SAFE_ERP_DATABASE_URL: databaseUrl,
    SAFE_ERP_TEST_DATABASE_URL: databaseUrl,
  };
}

function verifyPersistentSessionInSeparateProcess(
  token: string,
  secret: string,
  databaseUrl: string,
): string {
  const authPath = resolve(projectRoot, 'src/application/auth.ts');
  const clientPath = resolve(projectRoot, 'src/data/prisma/client.ts');
  const script = [
    `const { verifyPersistentAccessToken } = require(${JSON.stringify(authPath)});`,
    `const prisma = require(${JSON.stringify(clientPath)}).default;`,
    'verifyPersistentAccessToken(process.env.SAFE_ERP_TEST_SESSION_TOKEN, process.env.SAFE_ERP_TEST_SESSION_SECRET)',
    '  .then(async (user) => {',
    "    process.stdout.write(user ? user.id : 'null');",
    '    await prisma.$disconnect();',
    '  })',
    '  .catch(async (error) => {',
    '    console.error(error);',
    '    await prisma.$disconnect();',
    '    process.exitCode = 1;',
    '  });',
  ].join('\n');
  return runPersistentSessionScript(script, databaseUrl, {
    SAFE_ERP_TEST_SESSION_TOKEN: token,
    SAFE_ERP_TEST_SESSION_SECRET: secret,
  });
}

function runPersistentSessionScript(
  script: string,
  databaseUrl: string,
  extraEnvironment: NodeJS.ProcessEnv = {},
): string {
  return run(process.execPath, ['--require', tsNodeRegister, '-e', script], {
    ...prismaEnvironment(databaseUrl),
    NODE_ENV: 'production',
    SAFE_ERP_PERSISTENT_SESSIONS: 'true',
    ...extraEnvironment,
  }).output.trim();
}

function prismaUrl(databaseName: string, port: number, password: string): string {
  return `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${port}/${databaseName}?schema=public`;
}

function libpqEnvironment(password: string, toolBinPath: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${toolBinPath}${delimiter}${process.env.PATH ?? ''}`,
    PGPASSWORD: password,
    PGSSLMODE: 'disable',
  };
}

function runPrisma(
  args: string[],
  schemaPath: string,
  databaseUrl: string,
): ToolResult {
  return run(process.execPath, [
    prismaCli,
    ...args,
    '--schema',
    schemaPath,
  ], prismaEnvironment(databaseUrl));
}

async function allocateLoopbackPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to allocate a disposable loopback port.');
  }
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
  return address.port;
}

function openSyntheticSqlite(filePath: string): Promise<void> {
  return new Promise((resolveOpen, rejectOpen) => {
    const database = new sqlite3.Database(filePath, (openError) => {
      if (openError) {
        rejectOpen(openError);
        return;
      }
      database.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE "CountryProfile" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "code" TEXT NOT NULL UNIQUE,
          "name" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL,
          "updatedAt" DATETIME NOT NULL
        );
        INSERT INTO "CountryProfile" ("id", "code", "name", "createdAt", "updatedAt")
        VALUES (
          'synthetic-country',
          'SYNTH',
          'Synthetic PostgreSQL import fixture',
          '2026-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z'
        );
      `, (execError) => {
        database.close((closeError) => {
          if (execError) rejectOpen(execError);
          else if (closeError) rejectOpen(closeError);
          else resolveOpen();
        });
      });
    });
  });
}

async function makeToolDirectory(root: string): Promise<{
  binPath: string;
  pgDumpPath: string;
  pgRestorePath: string;
}> {
  const { PostgresInstance } = require('pg-embedded') as {
    PostgresInstance: new (settings: Record<string, unknown>) => PostgresToolsInstaller;
  };
  const toolRoot = join(root, 'postgres-tools');
  const installer = new PostgresInstance({
    host: '127.0.0.1',
    port: 0,
    username: 'safe_test',
    password: randomBytes(24).toString('hex'),
    dataDir: join(toolRoot, 'data'),
    installationDir: join(toolRoot, 'install'),
    persistent: false,
    setupTimeout: 180,
  });
  await installer.setup();
  const binPath = join(installer.programDir, 'bin');
  const pgDumpPath = join(binPath, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump');
  const pgRestorePath = join(binPath, process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore');
  const binaries = await readdir(binPath);
  assert.ok(binaries.includes(process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump'));
  assert.ok(binaries.includes(process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore'));
  return { binPath, pgDumpPath, pgRestorePath };
}

async function createSyntheticUpgrade(
  root: string,
  databaseUrl: string,
  client: PgClientLike,
): Promise<void> {
  const copiedProject = join(root, 'synthetic-upgrade-migrations');
  const copiedMigrations = join(copiedProject, 'migrations');
  const copiedSchema = join(copiedProject, 'schema.prisma');
  await mkdir(copiedProject, { recursive: true });
  await cp(postgresMigrationsPath, copiedMigrations, { recursive: true });
  await cp(postgresSchemaPath, copiedSchema);
  await cp(
    resolve(projectRoot, 'src/data/prisma/postgresql/migration_lock.toml'),
    join(copiedProject, 'migration_lock.toml'),
  );
  const upgradeName = '29990101000000_synthetic_integration_upgrade';
  const upgradeDirectory = join(copiedMigrations, upgradeName);
  await mkdir(upgradeDirectory);
  await writeFile(
    join(upgradeDirectory, 'migration.sql'),
    [
      '-- Synthetic integration-only upgrade; not an approved SAFE production migration.',
      'ALTER TABLE "CountryProfile" ADD COLUMN "syntheticUpgradeMarker" BOOLEAN NOT NULL DEFAULT false;',
      '',
    ].join('\n'),
    'utf8',
  );

  await client.query(
    `INSERT INTO "CountryProfile" ("id", "code", "name", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      'synthetic-upgrade-country',
      'UPGRADE',
      'Synthetic upgrade retention fixture',
    ],
  );

  const deployed = runPrisma(['migrate', 'deploy'], copiedSchema, databaseUrl);
  assert.match(deployed.output, /29990101000000_synthetic_integration_upgrade/);
  const status = runPrisma(['migrate', 'status'], copiedSchema, databaseUrl);
  assert.match(status.output, /up to date/i);

  const { rows } = await client.query<{
    id: string;
    syntheticUpgradeMarker: boolean;
  }>(
    `SELECT "id", "syntheticUpgradeMarker"
     FROM "CountryProfile"
     WHERE "id" = $1`,
    ['synthetic-upgrade-country'],
  );
  assert.deepEqual(rows, [{
    id: 'synthetic-upgrade-country',
    syntheticUpgradeMarker: false,
  }]);
}

async function measureConcurrentTransactions(
  Client: PgClientConstructor,
  databaseName: string,
  port: number,
  password: string,
): Promise<{
  users: number;
  transactions: number;
  elapsedMs: number;
  p95Ms: number;
  writesPerSecond: number;
}> {
  const users = 16;
  const transactionsPerUser = 20;
  const clients = Array.from({ length: users }, () => newPgClient(Client, databaseName, port, password));
  const latencies: number[] = [];
  const errors: string[] = [];
  let startedAt = 0;
  try {
    await Promise.all(clients.map((client) => client.connect()));
    await clients[0].query('CREATE SCHEMA "safe_integration"');
    await clients[0].query(
      'CREATE TABLE "safe_integration"."Counter" ("id" INTEGER PRIMARY KEY, "value" BIGINT NOT NULL)',
    );
    await clients[0].query(
      'INSERT INTO "safe_integration"."Counter" ("id", "value") VALUES (1, 0)',
    );
    startedAt = performance.now();
    const workerResults = await Promise.allSettled(clients.map(async (client) => {
      for (let index = 0; index < transactionsPerUser; index += 1) {
        const transactionStartedAt = performance.now();
        await client.query('BEGIN');
        try {
          await client.query(
            `UPDATE "safe_integration"."Counter" SET "value" = "value" + 1 WHERE "id" = 1`,
          );
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
        latencies.push(performance.now() - transactionStartedAt);
      }
    }));
    for (const result of workerResults) {
      if (result.status === 'rejected') errors.push(String(result.reason));
    }
    assert.deepEqual(errors, [], `Concurrent workers failed: ${errors.join('; ')}`);
    const { rows } = await clients[0].query<{ value: string | bigint }>(
      `SELECT "value" FROM "safe_integration"."Counter" WHERE "id" = 1`,
    );
    assert.equal(Number(rows[0]?.value), users * transactionsPerUser);
    const elapsedMs = performance.now() - startedAt;
    const sortedLatencies = [...latencies].sort((left, right) => left - right);
    return {
      users,
      transactions: latencies.length,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      p95Ms: Number(sortedLatencies[Math.ceil(sortedLatencies.length * 0.95) - 1].toFixed(2)),
      writesPerSecond: Number((latencies.length / (elapsedMs / 1000)).toFixed(2)),
    };
  } finally {
    await Promise.allSettled(clients.map((client) => client.end()));
  }
}

async function main(): Promise<Record<string, unknown>> {
  const root = await mkdtemp(join(tmpdir(), 'safe-postgresql-integration-'));
  let postgres: EmbeddedPostgresInstance | undefined;
  let postgresStarted = false;
  let postgresClientGenerated = false;
  const pgClients: PgClientLike[] = [];
  let failure: unknown;
  let summary: Record<string, unknown> | undefined;

  try {
    const EmbeddedPostgres = (require('embedded-postgres') as {
      default: new (settings: Record<string, unknown>) => EmbeddedPostgresInstance;
    }).default;
    const port = await allocateLoopbackPort();
    const password = randomBytes(24).toString('hex');
    postgres = new EmbeddedPostgres({
      databaseDir: join(root, 'postgres-data'),
      user: 'postgres',
      password,
      port,
      persistent: false,
      createPostgresUser: false,
      autoRehydrateSymlinks: true,
      postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
      onLog: () => {},
      onError: (error: unknown) => process.stderr.write(`${String(error)}\n`),
    });
    await postgres.initialise();
    await postgres.start();
    postgresStarted = true;

    const appDatabase = 'safe_pg_integration';
    const upgradeDatabase = 'safe_pg_upgrade';
    const restoreDatabase = 'safe_pg_restore';
    const poolDatabase = 'safe_pg_pool';
    const legacyDatabase = 'safe_pg_legacy';
    await Promise.all([
      postgres.createDatabase(appDatabase),
      postgres.createDatabase(upgradeDatabase),
      postgres.createDatabase(poolDatabase),
      postgres.createDatabase(legacyDatabase),
    ]);
    const appUrl = prismaUrl(appDatabase, port, password);
    const upgradeUrl = prismaUrl(upgradeDatabase, port, password);
    const restoreUrl = prismaUrl(restoreDatabase, port, password);
    const poolUrl = prismaUrl(poolDatabase, port, password);
    const legacyUrl = prismaUrl(legacyDatabase, port, password);
    const PgClient = (require('pg') as { Client: PgClientConstructor }).Client;

    const legacyClient = newPgClient(PgClient, legacyDatabase, port, password);
    pgClients.push(legacyClient);
    await legacyClient.connect();
    await legacyClient.query(`
      CREATE TABLE "SyntheticLegacyRecord" ("id" text PRIMARY KEY, "value" text NOT NULL);
      INSERT INTO "SyntheticLegacyRecord" ("id", "value") VALUES ('preserve-me', 'synthetic');
    `);
    let legacyDeployRefusal = '';
    try {
      run(
        process.execPath,
        ['--require', tsNodeRegister, postgresDeployGuardPath],
        prismaEnvironment(legacyUrl),
      );
    } catch (error) {
      legacyDeployRefusal = String(error);
    }
    assert.match(legacyDeployRefusal, /Refusing PostgreSQL migration deploy/);
    assert.match(legacyDeployRefusal, /No migration was run/);
    const { rows: preservedLegacyRows } = await legacyClient.query<{ id: string; value: string }>(
      `SELECT "id", "value" FROM "SyntheticLegacyRecord" WHERE "id" = 'preserve-me'`,
    );
    assert.deepEqual(preservedLegacyRows, [{ id: 'preserve-me', value: 'synthetic' }]);
    const { rows: legacyMigrationTable } = await legacyClient.query<{ exists: boolean }>(
      `SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS "exists"`,
    );
    assert.equal(legacyMigrationTable[0].exists, false);

    const freshInstall = run(
      process.execPath,
      ['--require', tsNodeRegister, postgresDeployGuardPath],
      prismaEnvironment(appUrl),
    );
    assert.match(freshInstall.output, /successfully applied|no pending migrations/i);
    const firstStatus = runPrisma(['migrate', 'status'], postgresSchemaPath, appUrl);
    assert.match(firstStatus.output, /up to date/i);
    const repeatedDeploy = run(
      process.execPath,
      ['--require', tsNodeRegister, postgresDeployGuardPath],
      prismaEnvironment(appUrl),
    );
    assert.match(repeatedDeploy.output, /no pending migrations/i);

    runPrisma(['migrate', 'deploy'], postgresSchemaPath, upgradeUrl);
    const generatedClient = runPrisma(['generate'], postgresSchemaPath, appUrl);
    assert.match(generatedClient.output, /generated prisma client/i);
    postgresClientGenerated = true;
    const generatedSchema = await readFile(
      resolve(projectRoot, 'node_modules/.prisma/client/schema.prisma'),
      'utf8',
    );
    assert.match(generatedSchema, /datasource db\s*\{\s*provider\s*=\s*"postgresql"/);
    const poolTest = run(
      process.execPath,
      ['--require', tsNodeRegister, prismaPoolWorkerPath],
      prismaEnvironment(poolUrl),
    );
    const prismaPool = JSON.parse(poolTest.output) as {
      provider: string;
      connectionLimit: number;
      database: string;
      scenarios: Array<{
        workers: number;
        errors: number;
        timeoutErrors: number;
        maxPoolConnectionsObserved: number;
      }>;
    };
    assert.equal(prismaPool.provider, 'postgresql');
    assert.equal(prismaPool.database, poolDatabase);
    assert.equal(prismaPool.connectionLimit, 10);
    assert.deepEqual(prismaPool.scenarios.map((scenario) => scenario.workers), [16, 32, 50]);
    assert.ok(prismaPool.scenarios.every((scenario) => (
      scenario.errors === 0
      && scenario.timeoutErrors === 0
      && scenario.maxPoolConnectionsObserved <= prismaPool.connectionLimit
    )));

    const upgradeClient = newPgClient(PgClient, upgradeDatabase, port, password);
    pgClients.push(upgradeClient);
    await upgradeClient.connect();
    await createSyntheticUpgrade(root, upgradeUrl, upgradeClient);

    const { rows: migrationSummary } = await upgradeClient.query<{
      version: string;
      tableCount: string | bigint;
      migrationCount: string | bigint;
    }>(
      `SELECT current_setting('server_version') AS "version",
              (SELECT COUNT(*) FROM information_schema.tables
               WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS "tableCount",
              (SELECT COUNT(*) FROM public."_prisma_migrations"
               WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS "migrationCount"`,
    );
    assert.match(migrationSummary[0].version, /^17\./);

    const sqliteSource = join(root, 'synthetic-source.sqlite');
    const dryRunReport = join(root, 'import-dry-run.json');
    const appliedReport = join(root, 'import-applied.json');
    await openSyntheticSqlite(sqliteSource);
    const sqliteBackupDryRun = run(
      process.execPath,
      ['--require', tsNodeRegister, importerPath, '--source', sqliteSource, '--report', dryRunReport],
      prismaEnvironment(appUrl),
    );
    assert.match(sqliteBackupDryRun.output, /Dry-run valide/i);
    const dryRun = JSON.parse(await readFile(dryRunReport, 'utf8')) as {
      status: string;
      tables: Array<{ name: string; rows: number }>;
      discrepancies: unknown[];
    };
    assert.equal(dryRun.status, 'dry-run-valid');
    assert.equal(dryRun.tables.length, 1);
    assert.equal(dryRun.tables[0].name, 'CountryProfile');
    assert.equal(dryRun.tables[0].rows, 1);
    assert.ok(dryRun.discrepancies.length > 0);

    run(
      process.execPath,
      [
        '--require',
        tsNodeRegister,
        importerPath,
        '--source',
        sqliteSource,
        '--report',
        appliedReport,
        '--approved-report',
        dryRunReport,
        '--apply',
        '--confirm-target-empty',
      ],
      prismaEnvironment(appUrl),
    );
    const applied = JSON.parse(await readFile(appliedReport, 'utf8')) as { status: string };
    assert.equal(applied.status, 'imported');

    const appClient = newPgClient(PgClient, appDatabase, port, password);
    pgClients.push(appClient);
    await appClient.connect();
    const { rows: importedRows } = await appClient.query<{ id: string; code: string }>(
      `SELECT "id", "code" FROM "CountryProfile" WHERE "id" = $1`,
      ['synthetic-country'],
    );
    assert.deepEqual(importedRows, [{ id: 'synthetic-country', code: 'SYNTH' }]);

    const authPath = resolve(projectRoot, 'src/application/auth.ts');
    const clientPath = resolve(projectRoot, 'src/data/prisma/client.ts');
    const adminUsersPath = resolve(projectRoot, 'src/application/modules/admin/users.ts');
    const sessionSecret = randomBytes(32).toString('hex');
    const createSessionScript = [
      `const { createPersistentAccessToken } = require(${JSON.stringify(authPath)});`,
      `const prisma = require(${JSON.stringify(clientPath)}).default;`,
      '(async () => {',
      '  let token;',
      '  try {',
      "    const user = await prisma.user.create({ data: { id: 'durable-session-user', username: 'durable-session-user', passwordHash: 'synthetic-integration-only', role: 'ADMIN' } });",
      "    token = await createPersistentAccessToken({ id: user.id, username: user.username, role: 'ADMIN', entityId: null }, process.env.SAFE_ERP_TEST_SESSION_SECRET);",
      '  } finally {',
      '    await prisma.$disconnect();',
      '  }',
      '  process.stdout.write(token);',
      '})().catch((error) => { console.error(error); process.exitCode = 1; });',
    ].join('\n');
    const sessionToken = runPersistentSessionScript(createSessionScript, appUrl, {
      SAFE_ERP_TEST_SESSION_SECRET: sessionSecret,
    });
    assert.ok(sessionToken);
    assert.equal(
      verifyPersistentSessionInSeparateProcess(sessionToken, sessionSecret, appUrl),
      'durable-session-user',
    );

    const resetPasswordScript = [
      `const { AdminUserService } = require(${JSON.stringify(adminUsersPath)});`,
      `const prisma = require(${JSON.stringify(clientPath)}).default;`,
      '(async () => {',
      '  try {',
      "    await AdminUserService.resetPassword('durable-session-user', { password: 'synthetic-password-reset-test-345' }, { id: 'synthetic-session-admin', username: 'synthetic-session-admin' });",
      '  } finally {',
      '    await prisma.$disconnect();',
      '  }',
      '})().catch((error) => { console.error(error); process.exitCode = 1; });',
    ].join('\n');
    runPersistentSessionScript(resetPasswordScript, appUrl);
    assert.equal(
      verifyPersistentSessionInSeparateProcess(sessionToken, sessionSecret, appUrl),
      'null',
    );

    const lockRaceDirectory = join(root, 'prisma-lock-race');
    await mkdir(lockRaceDirectory);
    await runCrossProcessPeriodLockRace(appClient, appUrl, lockRaceDirectory);
    const concurrency = await measureConcurrentTransactions(PgClient, appDatabase, port, password);
    const pgTools = await makeToolDirectory(root);
    const toolEnvironment = libpqEnvironment(password, pgTools.binPath);
    const dumpVersion = run(pgTools.pgDumpPath, ['--version'], toolEnvironment);
    const restoreVersion = run(pgTools.pgRestorePath, ['--version'], toolEnvironment);
    const dumpPath = join(root, 'synthetic-postgresql.dump');
    run(pgTools.pgDumpPath, [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      `--file=${dumpPath}`,
      '--host=127.0.0.1',
      `--port=${port}`,
      '--username=postgres',
      `--dbname=${appDatabase}`,
    ], toolEnvironment);
    await postgres.createDatabase(restoreDatabase);
    const archiveListing = run(pgTools.pgRestorePath, ['--list', dumpPath], toolEnvironment);
    assert.match(archiveListing.output, /CountryProfile/);
    run(pgTools.pgRestorePath, [
      '--exit-on-error',
      '--no-owner',
      '--no-privileges',
      '--single-transaction',
      '--host=127.0.0.1',
      `--port=${port}`,
      '--username=postgres',
      `--dbname=${restoreDatabase}`,
      dumpPath,
    ], toolEnvironment);
    const restoreStatus = runPrisma(['migrate', 'status'], postgresSchemaPath, restoreUrl);
    assert.match(restoreStatus.output, /up to date/i);
    const restoreClient = newPgClient(PgClient, restoreDatabase, port, password);
    pgClients.push(restoreClient);
    await restoreClient.connect();
    const { rows: restoredRows } = await restoreClient.query<{ id: string; code: string }>(
      `SELECT "id", "code" FROM "CountryProfile" WHERE "id" = $1`,
      ['synthetic-country'],
    );
    assert.deepEqual(restoredRows, importedRows);
    const { rows: restoredLocks } = await restoreClient.query<{ count: string | bigint }>(
      `SELECT COUNT(*) AS "count" FROM "MonthlyCloseLock" WHERE "id" = 'synthetic-period-lock'`,
    );
    assert.equal(Number(restoredLocks[0]?.count), 1);
    const { rows: restoredCounter } = await restoreClient.query<{ value: string | bigint }>(
      `SELECT "value" FROM "safe_integration"."Counter" WHERE "id" = 1`,
    );
    assert.equal(Number(restoredCounter[0]?.value), concurrency.transactions);

    const dumpStats = await stat(dumpPath);
    summary = {
      postgresqlServer: String(migrationSummary[0].version),
      publicTables: Number(migrationSummary[0].tableCount),
      appliedMigrationsAfterSyntheticUpgrade: Number(migrationSummary[0].migrationCount),
      installation: 'guard admitted fresh baseline, then repeat deploy/status; refused non-empty unbaselined database without changing its synthetic row',
      upgrade: 'temporary copied migration set applied a synthetic additive migration; prior row and default preserved',
      import: 'synthetic SQLite source passed dry-run, then applied to an empty PostgreSQL target and row-count checks passed',
      sessions: 'a PostgreSQL session was accepted from a separate Node process and rejected after an atomic password reset',
      periodLockRace: 'separate Prisma processes raced journal insert against an uncommitted close lock; pg_stat_activity confirmed lock wait, then trigger rejected insert after lock commit and rejected lock mutation',
      prismaPool,
      backupRestore: {
        pgDump: dumpVersion.output.trim(),
        pgRestore: restoreVersion.output.trim(),
        archiveBytes: dumpStats.size,
        restore: 'custom-format archive restored to a distinct empty database; migration status and synthetic rows verified',
      },
      concurrency,
    };
  } catch (error) {
    failure = error;
  }

  const cleanupErrors: string[] = [];
  for (const client of pgClients) {
    try {
      await client.end();
    } catch (error) {
      cleanupErrors.push(`PostgreSQL client disconnect failed: ${String(error)}`);
    }
  }
  if (postgresStarted && postgres) {
    try {
      await postgres.stop();
    } catch (error) {
      cleanupErrors.push(`Temporary PostgreSQL shutdown failed: ${String(error)}`);
    }
  }
  try {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  } catch (error) {
    cleanupErrors.push(`Temporary PostgreSQL files could not be removed: ${String(error)}`);
  }
  if (postgresClientGenerated) {
    try {
      run(process.execPath, [
        prismaCli,
        'generate',
        '--schema',
        sqliteSchemaPath,
      ], {
        ...process.env,
        SAFE_ERP_DATABASE_PROVIDER: 'sqlite',
        SAFE_ERP_DATABASE_URL: 'file:../data.db',
      });
    } catch (error) {
      cleanupErrors.push(`SQLite Prisma client regeneration failed: ${String(error)}`);
    }
  }

  if (failure && cleanupErrors.length > 0) {
    throw new AggregateError([failure, ...cleanupErrors.map((error) => new Error(error))], 'PostgreSQL integration and cleanup failed.');
  }
  if (cleanupErrors.length > 0) throw new Error(cleanupErrors.join('\n'));
  if (failure) throw failure;
  assert.ok(summary, 'PostgreSQL integration did not produce a result summary.');
  return summary;
}

main()
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
    exitAfterCleanup(0);
  })
  .catch((error: unknown) => {
    console.error(formatError(error));
    exitAfterCleanup(1);
  });
