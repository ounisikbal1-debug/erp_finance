import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { resolveDatabaseConfiguration } from '../data/prisma/database-config';

const PROJECT_ROOT = resolve(__dirname, '../..');
const PRISMA_CLI = resolve(PROJECT_ROOT, 'node_modules/prisma/build/index.js');
const POSTGRES_SCHEMA = resolve(PROJECT_ROOT, 'src/data/prisma/postgresql/schema.prisma');
const INITIAL_BASELINE = '20261111122800_initial_postgresql_schema';

interface PgQueryClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<Row = Record<string, unknown>>(
    query: string,
  ): Promise<{ rows: Row[] }>;
}

interface PgClientConstructor {
  new(options: { connectionString: string }): PgQueryClient;
}

interface MigrationHistoryRow {
  migrationName: string;
  finishedAt: Date | null;
  rolledBackAt: Date | null;
}

function nodePgConnectionString(databaseUrl: string): string {
  const parsedUrl = new URL(databaseUrl);
  parsedUrl.searchParams.delete('connection_limit');
  parsedUrl.searchParams.delete('schema');
  return parsedUrl.toString();
}

async function assertTargetCanReceiveBaseline(databaseUrl: string): Promise<void> {
  const Client = (require('pg') as { Client: PgClientConstructor }).Client;
  const client = new Client({ connectionString: nodePgConnectionString(databaseUrl) });
  await client.connect();
  try {
    const { rows: [historyTable] } = await client.query<{ exists: boolean }>(
      `SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS "exists"`,
    );
    const historyRows = historyTable.exists
      ? (await client.query<MigrationHistoryRow>(`
          SELECT "migration_name" AS "migrationName",
                 "finished_at" AS "finishedAt",
                 "rolled_back_at" AS "rolledBackAt"
          FROM public."_prisma_migrations"
        `)).rows
      : [];
    const baselineApplied = historyRows.some((row) => (
      row.migrationName === INITIAL_BASELINE
      && row.finishedAt !== null
      && row.rolledBackAt === null
    ));
    if (baselineApplied) return;

    const { rows: existingObjects } = await client.query<{ name: string }>(`
      SELECT format('%I.%I', namespace.nspname, relation.relname) AS "name"
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
        AND namespace.nspname NOT LIKE 'pg_toast%'
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
        AND NOT (
          namespace.nspname = 'public'
          AND relation.relname = '_prisma_migrations'
        )
      ORDER BY namespace.nspname, relation.relname
    `);

    if (historyRows.length > 0 || existingObjects.length > 0) {
      const objectSummary = existingObjects.slice(0, 10).map(({ name }) => name).join(', ');
      throw new Error(
        `Refusing PostgreSQL migration deploy: the target has existing objects or migration history ` +
        `but no successfully applied ${INITIAL_BASELINE}. No migration was run.` +
        (objectSummary ? ` Existing objects: ${objectSummary}.` : ''),
      );
    }
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const configuration = resolveDatabaseConfiguration();
  if (configuration.provider !== 'postgresql') {
    throw new Error('Set SAFE_ERP_DATABASE_PROVIDER=postgresql before deploying PostgreSQL migrations.');
  }

  await assertTargetCanReceiveBaseline(configuration.url);
  process.stdout.write('PostgreSQL target preflight passed.\n');
  execFileSync(process.execPath, [
    PRISMA_CLI,
    'migrate',
    'deploy',
    '--schema',
    POSTGRES_SCHEMA,
  ], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      SAFE_ERP_DATABASE_PROVIDER: 'postgresql',
      SAFE_ERP_DATABASE_URL: configuration.url,
      SAFE_ERP_TEST_DATABASE_URL: configuration.url,
    },
    stdio: 'inherit',
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
