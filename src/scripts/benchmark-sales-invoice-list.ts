import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const projectRoot = resolve(__dirname, '../..');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'safe-erp-sales-list-benchmark-'));
const databasePath = resolve(temporaryDirectory, 'benchmark.db');
const schemaPath = resolve(temporaryDirectory, 'schema.prisma');
const databaseUrl = process.platform === 'win32'
  ? `file:${databasePath.replace(/\\/g, '/')}`
  : pathToFileURL(databasePath).href;
const testEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  SAFE_ERP_TEST_DATABASE_URL: databaseUrl,
};
const previousNodeEnv = process.env.NODE_ENV;
const previousTestDatabaseUrl = process.env.SAFE_ERP_TEST_DATABASE_URL;

assert.ok(databasePath.startsWith(`${resolve(temporaryDirectory)}${sep}`));
assert.ok(!databasePath.startsWith(projectRoot));

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function main() {
  let prisma: typeof import('../core/models/prisma').default | undefined;
  try {
    const sourceSchema = readFileSync(join(projectRoot, 'src', 'data', 'prisma', 'schema.prisma'), 'utf8');
    const isolatedSchema = sourceSchema.replace(
      /url\s*=\s*(?:env\("SAFE_ERP_DATABASE_URL"\)|"file:\.\.\/data\.db")/,
      'url = env("SAFE_ERP_TEST_DATABASE_URL")',
    );
    if (isolatedSchema === sourceSchema) {
      throw new Error('Impossible de confirmer la substitution de la cible SQLite dans le schéma isolé.');
    }
    writeFileSync(schemaPath, isolatedSchema, 'utf8');
    execFileSync(process.execPath, [
      require.resolve('prisma'),
      'db',
      'push',
      '--schema',
      schemaPath,
      '--skip-generate',
    ], {
      cwd: projectRoot,
      env: testEnvironment,
      stdio: 'inherit',
    });

    process.env.NODE_ENV = 'test';
    process.env.SAFE_ERP_TEST_DATABASE_URL = databaseUrl;
    prisma = require('../core/models/prisma').default;
    const { SalesService } = require('../application/modules/sales/service') as typeof import('../application/modules/sales/service');
    const entityId = 'synthetic-entity';
    const customerId = 'synthetic-customer';
    const checkpointSizes = [100, 1000, 5000];
    const workflowEventsPerInvoice = 2;
    const batchSize = 250;

    await prisma.countryProfile.create({
      data: { id: 'synthetic-country', code: 'ZZ', name: 'Synthetic benchmark country' },
    });
    await prisma.entity.create({
      data: { id: entityId, code: 'SYNTH', name: 'Synthetic benchmark entity', countryId: 'synthetic-country' },
    });
    await prisma.customer.create({
      data: { id: customerId, code: 'SYNTH-CUSTOMER', name: 'Synthetic benchmark customer', entityId },
    });

    console.log('Synthetic-only SQLite benchmark; setup and temporary DB creation excluded from timings.');
    console.log('Invoices | median ms | max ms | JSON bytes');
    let inserted = 0;
    for (const target of checkpointSizes) {
      while (inserted < target) {
        const batchEnd = Math.min(target, inserted + batchSize);
        const invoiceRows = [];
        const eventRows = [];
        for (let index = inserted; index < batchEnd; index += 1) {
          const suffix = String(index).padStart(8, '0');
          const invoiceId = `synthetic-invoice-${suffix}`;
          invoiceRows.push({
            id: invoiceId,
            invoiceNumber: `SYN-${suffix}`,
            entityId,
            customerId,
            subTotal: 125,
            taxAmount: 23.75,
            totalAmount: 148.75,
            createdAt: new Date(Date.UTC(2026, 0, 1) + index * 1000),
          });
          for (let eventIndex = 0; eventIndex < workflowEventsPerInvoice; eventIndex += 1) {
            eventRows.push({
              id: `${invoiceId}-event-${eventIndex}`,
              invoiceId,
              action: eventIndex === 0 ? 'CREATED' : 'APPROVED',
              actorUserId: 'synthetic-user',
              actorUsername: 'synthetic-user',
              note: 'Synthetic benchmark event',
              createdAt: new Date(Date.UTC(2026, 0, 1) + index * 1000 + eventIndex),
            });
          }
        }
        await prisma.invoice.createMany({ data: invoiceRows });
        await prisma.salesInvoiceWorkflowEvent.createMany({ data: eventRows });
        inserted = batchEnd;
      }

      const warmup = await SalesService.listInvoices(entityId);
      assert.equal(warmup.items.length, Math.min(target, 50));
      assert.equal(warmup.pagination.total, target);
      const elapsed: number[] = [];
      let payloadBytes = 0;
      for (let iteration = 0; iteration < 7; iteration += 1) {
        const startedAt = performance.now();
        const invoices = await SalesService.listInvoices(entityId);
        const serialized = JSON.stringify(invoices);
        elapsed.push(performance.now() - startedAt);
        payloadBytes = Buffer.byteLength(serialized);
        assert.equal(invoices.items.length, Math.min(target, 50));
        assert.equal(invoices.pagination.total, target);
        assert.equal(JSON.parse(serialized).items.length, Math.min(target, 50));
      }
      elapsed.sort((left, right) => left - right);
      console.log(
        `${target} | ${elapsed[Math.floor(elapsed.length / 2)].toFixed(2)} | ${elapsed[elapsed.length - 1].toFixed(2)} | ${payloadBytes}`,
      );
    }
  } finally {
    if (prisma) await prisma.$disconnect();
    restoreEnvironment('NODE_ENV', previousNodeEnv);
    restoreEnvironment('SAFE_ERP_TEST_DATABASE_URL', previousTestDatabaseUrl);
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
