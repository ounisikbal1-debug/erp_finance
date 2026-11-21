import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { resolveDatabaseConfiguration } from '../data/prisma/database-config';
import prisma from '../data/prisma/client';

interface ObserverClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<Row = Record<string, unknown>>(
    query: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
}

interface ObserverClientConstructor {
  new(options: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    ssl: false;
    application_name: string;
  }): ObserverClient;
}

interface ScenarioResult {
  workers: number;
  transactions: number;
  elapsedMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  poolAcquisitionP95Ms: number;
  transactionsPerSecond: number;
  errors: number;
  timeoutErrors: number;
  maxPoolConnectionsObserved: number;
  maxActiveConnectionsObserved: number;
  maxLockWaitersObserved: number;
  rowsVerified: number;
  counterVerified: number;
  idempotentRetryInsertedRows: number;
}

const transactionsPerWorker = 10;

function percentile(samples: number[], fraction: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  return Number(sorted[Math.ceil(sorted.length * fraction) - 1].toFixed(2));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main(): Promise<void> {
  const configuration = resolveDatabaseConfiguration();
  assert.equal(configuration.provider, 'postgresql');
  const parsedUrl = new URL(configuration.url);
  const connectionLimit = Number(parsedUrl.searchParams.get('connection_limit'));
  assert.equal(connectionLimit, 10, 'The pool worker must exercise the default application limit.');

  const PgClient = (require('pg') as { Client: ObserverClientConstructor }).Client;
  const observer = new PgClient({
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port || 5432),
    user: decodeURIComponent(parsedUrl.username),
    password: decodeURIComponent(parsedUrl.password),
    database: decodeURIComponent(parsedUrl.pathname.slice(1)),
    ssl: false,
    application_name: 'safe-prisma-pool-observer',
  });
  const results: ScenarioResult[] = [];

  try {
    await prisma.$connect();
    const [{ version, database }] = await prisma.$queryRaw<Array<{ version: string; database: string }>>`
      SELECT current_setting('server_version') AS "version",
             current_database() AS "database"
    `;
    assert.match(version, /^17\./);
    await observer.connect();
    const { rows: [{ pid }] } = await observer.query<{ pid: number }>(
      'SELECT pg_backend_pid() AS pid',
    );

    await prisma.$executeRawUnsafe('CREATE SCHEMA "safe_integration"');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "safe_integration"."PrismaPoolOperation" (
        "scenario" TEXT NOT NULL,
        "worker" INTEGER NOT NULL,
        "sequence" INTEGER NOT NULL,
        PRIMARY KEY ("scenario", "worker", "sequence")
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "safe_integration"."PrismaPoolCounter" (
        "scenario" TEXT PRIMARY KEY,
        "value" BIGINT NOT NULL
      )
    `);

    for (const workers of [16, 32, 50]) {
      const scenario = `workers-${workers}`;
      const latencies: number[] = [];
      const acquisitionWaits: number[] = [];
      const errors: string[] = [];
      let maxPoolConnectionsObserved = 0;
      let maxActiveConnectionsObserved = 0;
      let maxLockWaitersObserved = 0;
      let stopSampling = false;

      await prisma.$executeRaw`
        INSERT INTO "safe_integration"."PrismaPoolCounter" ("scenario", "value")
        VALUES (${scenario}, 0)
      `;

      const sampler = (async () => {
        while (!stopSampling) {
          const { rows: [sample] } = await observer.query<{
            connections: number;
            active: number;
            lockWaiters: number;
          }>(`
            SELECT COUNT(*)::INTEGER AS "connections",
                   COUNT(*) FILTER (WHERE state = 'active')::INTEGER AS "active",
                   COUNT(*) FILTER (WHERE wait_event_type = 'Lock')::INTEGER AS "lockWaiters"
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND backend_type = 'client backend'
              AND pid <> $1
          `, [pid]);
          maxPoolConnectionsObserved = Math.max(maxPoolConnectionsObserved, sample.connections);
          maxActiveConnectionsObserved = Math.max(maxActiveConnectionsObserved, sample.active);
          maxLockWaitersObserved = Math.max(maxLockWaitersObserved, sample.lockWaiters);
          await delay(5);
        }
      })();

      const startedAt = performance.now();
      await Promise.all(Array.from({ length: workers }, async (_, worker) => {
        for (let sequence = 0; sequence < transactionsPerWorker; sequence += 1) {
          const requestStartedAt = performance.now();
          try {
            await prisma.$transaction(async (transaction) => {
              acquisitionWaits.push(performance.now() - requestStartedAt);
              const inserted = await transaction.$queryRaw<Array<{ sequence: number }>>`
                INSERT INTO "safe_integration"."PrismaPoolOperation" ("scenario", "worker", "sequence")
                VALUES (${scenario}, ${worker}, ${sequence})
                ON CONFLICT DO NOTHING
                RETURNING "sequence"
              `;
              if (inserted.length > 0) {
                await transaction.$queryRaw`SELECT pg_sleep(0.01)::text AS "completed"`;
                await transaction.$executeRaw`
                  UPDATE "safe_integration"."PrismaPoolCounter"
                  SET "value" = "value" + 1
                  WHERE "scenario" = ${scenario}
                `;
              }
              await transaction.$queryRaw`
                SELECT COUNT(*) FROM "safe_integration"."PrismaPoolOperation"
                WHERE "scenario" = ${scenario} AND "worker" = ${worker}
              `;
            });
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
          } finally {
            latencies.push(performance.now() - requestStartedAt);
          }
        }
      }));
      const elapsedMs = performance.now() - startedAt;
      stopSampling = true;
      await sampler;

      const duplicateInsert = await prisma.$transaction(async (transaction) => (
        transaction.$queryRaw<Array<{ sequence: number }>>`
          INSERT INTO "safe_integration"."PrismaPoolOperation" ("scenario", "worker", "sequence")
          VALUES (${scenario}, 0, 0)
          ON CONFLICT DO NOTHING
          RETURNING "sequence"
        `
      ));
      const [{ rowCount }] = await prisma.$queryRaw<Array<{ rowCount: bigint }>>`
        SELECT COUNT(*)::BIGINT AS "rowCount"
        FROM "safe_integration"."PrismaPoolOperation"
        WHERE "scenario" = ${scenario}
      `;
      const [{ counterValue }] = await prisma.$queryRaw<Array<{ counterValue: bigint }>>`
        SELECT "value" AS "counterValue"
        FROM "safe_integration"."PrismaPoolCounter"
        WHERE "scenario" = ${scenario}
      `;
      const expectedTransactions = workers * transactionsPerWorker;
      const rowsVerified = Number(rowCount);
      const counterVerified = Number(counterValue);
      const timeoutErrors = errors.filter((message) => /timeout|P2024|P2028|ETIMEDOUT/i.test(message)).length;

      assert.equal(errors.length, 0, `${workers} workers had database errors: ${errors.slice(0, 3).join('; ')}`);
      assert.equal(rowsVerified, expectedTransactions, `${workers} workers produced an incorrect row count.`);
      assert.equal(counterVerified, expectedTransactions, `${workers} workers produced an incorrect counter.`);
      assert.equal(duplicateInsert.length, 0, 'Replaying the same idempotency key inserted another row.');
      assert.ok(maxPoolConnectionsObserved <= connectionLimit);
      assert.ok(maxPoolConnectionsObserved > 1, 'The workload did not use concurrent Prisma connections.');

      results.push({
        workers,
        transactions: latencies.length,
        elapsedMs: Number(elapsedMs.toFixed(2)),
        p50Ms: percentile(latencies, 0.5),
        p95Ms: percentile(latencies, 0.95),
        p99Ms: percentile(latencies, 0.99),
        poolAcquisitionP95Ms: percentile(acquisitionWaits, 0.95),
        transactionsPerSecond: Number((latencies.length / (elapsedMs / 1000)).toFixed(2)),
        errors: errors.length,
        timeoutErrors,
        maxPoolConnectionsObserved,
        maxActiveConnectionsObserved,
        maxLockWaitersObserved,
        rowsVerified,
        counterVerified,
        idempotentRetryInsertedRows: duplicateInsert.length,
      });
    }

    console.log(JSON.stringify({
      provider: configuration.provider,
      postgresqlServer: version,
      database,
      connectionLimit,
      observerBackendExcluded: pid,
      scenarios: results,
    }, null, 2));
  } finally {
    await Promise.all([
      prisma.$disconnect(),
      observer.end().catch((error: unknown) => {
        if (observer) throw error;
      }),
    ]);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
