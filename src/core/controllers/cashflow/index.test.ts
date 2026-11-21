import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import { getModuleRoles } from '../../../application/auth';
import CashflowService from '../../../application/modules/cashflow/service';
import CashflowBankingService from '../../../application/modules/cashflow/banking-service';
import CashflowForecastService from '../../../application/modules/cashflow/forecast-service';
import cashflowRouter from './index';

describe('cashflow API', () => {
  it('scopes data and mapping changes to the authenticated entity', async () => {
    assert.deepEqual(getModuleRoles('cashflow'), ['ADMIN', 'FINANCIAL_MANAGER']);
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-a',
        username: 'finance',
        role: 'FINANCIAL_MANAGER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(cashflowRouter);
    const server = createServer(app);
    const originals = new Map<string, PropertyDescriptor | undefined>();
    const calls: Array<{ operation: string; entityId: string; value?: unknown }> = [];
    const stub = (name: 'getModuleData' | 'setCashAccounts', value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(CashflowService, name);
      originals.set(name, original);
      Object.defineProperty(CashflowService, name, { configurable: true, value });
    };
    stub('getModuleData', async (entityId: string, period: unknown) => {
      calls.push({ operation: 'read', entityId, value: period });
      return { period: '2026-03' };
    });
    stub('setCashAccounts', async (value: unknown, entityId: string) => {
      calls.push({ operation: 'map', entityId, value });
      return { accountCodes: ['5121'] };
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const read = await fetch(`http://127.0.0.1:${address.port}/data?period=2026-03`);
      assert.equal(read.status, 200);
      const forbidden = await fetch(`http://127.0.0.1:${address.port}/data?period=2026-03&entityId=entity-b`);
      assert.equal(forbidden.status, 403);
      const saved = await fetch(`http://127.0.0.1:${address.port}/accounts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', accountCodes: ['5121'] }),
      });
      assert.equal(saved.status, 403);
      const mapped = await fetch(`http://127.0.0.1:${address.port}/accounts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountCodes: ['5121'] }),
      });
      assert.equal(mapped.status, 200);
      assert.deepEqual(calls, [
        { operation: 'read', entityId: 'entity-a', value: '2026-03' },
        { operation: 'map', entityId: 'entity-a', value: { accountCodes: ['5121'] } },
      ]);
    } finally {
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(CashflowService, name, descriptor);
        else Reflect.deleteProperty(CashflowService, name);
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('scopes banking operations and forwards the authenticated user to persistence services', async () => {
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-a',
        username: 'finance',
        role: 'FINANCIAL_MANAGER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(cashflowRouter);
    const server = createServer(app);
    const originals = new Map<string, PropertyDescriptor | undefined>();
    const forecastOriginals = new Map<string, PropertyDescriptor | undefined>();
    const calls: Array<{ operation: string; entityId?: string; value?: unknown }> = [];
    const forecastCalls: Array<{ operation: string; entityId: string; value?: unknown }> = [];
    const stub = (name: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(CashflowBankingService, name);
      originals.set(name, original);
      Object.defineProperty(CashflowBankingService, name, { configurable: true, value });
    };
    const stubForecast = (name: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(CashflowForecastService, name);
      forecastOriginals.set(name, original);
      Object.defineProperty(CashflowForecastService, name, { configurable: true, value });
    };
    stub('listBankAccounts', async (entityId: string) => {
      calls.push({ operation: 'listBankAccounts', entityId });
      return [];
    });
    stub('listStatements', async (entityId: string) => {
      calls.push({ operation: 'listStatements', entityId });
      return [];
    });
    stub('createBankAccount', async (value: unknown, entityId: string) => {
      calls.push({ operation: 'createBankAccount', entityId, value });
      return { id: 'bank-a' };
    });
    stub('listBankTransfers', async (entityId: string) => {
      calls.push({ operation: 'listBankTransfers', entityId });
      return [];
    });
    stub('createBankTransfer', async (value: unknown, entityId: string, actor: unknown) => {
      calls.push({ operation: 'createBankTransfer', entityId, value: { payload: value, actor } });
      return { id: 'transfer-a' };
    });
    stub('importStatement', async (value: unknown, entityId: string) => {
      calls.push({ operation: 'importStatement', entityId, value });
      return { id: 'statement-a' };
    });
    stub('listStatementLines', async (statementId: string, entityId: string) => {
      calls.push({ operation: 'listStatementLines', entityId, value: statementId });
      return [];
    });
    stub('getReconciliationCandidates', async (statementLineId: string, entityId: string) => {
      calls.push({ operation: 'getReconciliationCandidates', entityId, value: statementLineId });
      return { candidates: [] };
    });
    stub('reconcile', async (value: unknown, entityId: string) => {
      calls.push({ operation: 'reconcile', entityId, value });
      return { id: 'reconciliation-a' };
    });
    stub('removeReconciliation', async (reconciliationId: string, entityId: string) => {
      calls.push({ operation: 'removeReconciliation', entityId, value: reconciliationId });
      return { id: reconciliationId };
    });
    stub('getAccountingMapping', async (entityId: string) => {
      calls.push({ operation: 'getAccountingMapping', entityId });
      return { receivableAccountCode: '4111' };
    });
    stub('setAccountingMapping', async (value: unknown, entityId: string) => {
      calls.push({ operation: 'setAccountingMapping', entityId, value });
      return { receivableAccountCode: '4111' };
    });
    stub('listPaymentTargets', async (entityId: string) => {
      calls.push({ operation: 'listPaymentTargets', entityId });
      return [];
    });
    stub('allocatePayment', async (value: unknown, entityId: string, userId: string) => {
      calls.push({ operation: 'allocatePayment', entityId, value: { payload: value, userId } });
      return { id: 'payment-a' };
    });
    stub('removePayment', async (paymentId: string, entityId: string) => {
      calls.push({ operation: 'removePayment', entityId, value: paymentId });
      return { id: paymentId };
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      assert.equal((await fetch(`${base}/bank-accounts`)).status, 200);
      assert.equal((await fetch(`${base}/transfers`)).status, 200);
      assert.equal((await fetch(`${base}/statements`)).status, 200);
      assert.equal((await fetch(`${base}/bank-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', name: 'Other entity' }),
      })).status, 403);
      assert.equal((await fetch(`${base}/statements?entityId=entity-b&bankAccountId=bank-a`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: 'date,description,amount\n2026-03-04,Receipt,1.000',
      })).status, 403);
      assert.equal((await fetch(`${base}/bank-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Main account' }),
      })).status, 201);
      assert.equal((await fetch(`${base}/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', amount: 10 }),
      })).status, 403);
      assert.equal((await fetch(`${base}/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceBankAccountId: 'bank-a',
          destinationBankAccountId: 'bank-b',
          amount: 10,
          transferredAt: '2026-03-04',
          description: 'Transfert entre comptes',
          idempotencyKey: 'transfer-request-1',
        }),
      })).status, 201);
      assert.equal((await fetch(`${base}/statements?bankAccountId=bank-a`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: 'date,description,amount\n2026-03-04,Receipt,1.000',
      })).status, 201);
      assert.equal((await fetch(`${base}/statements/statement-a/lines`)).status, 200);
      assert.equal((await fetch(`${base}/reconciliation/candidates?statementLineId=line-a`)).status, 200);
      assert.equal((await fetch(`${base}/reconciliations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statementLineId: 'line-a', journalLineId: 'journal-a' }),
      })).status, 201);
      assert.equal((await fetch(`${base}/reconciliations/reconciliation-a`, { method: 'DELETE' })).status, 200);
      assert.equal((await fetch(`${base}/accounting-mapping`)).status, 200);
      assert.equal((await fetch(`${base}/payment-targets`)).status, 200);
      assert.equal((await fetch(`${base}/accounting-mapping`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', receivableAccountCode: '4111' }),
      })).status, 403);
      assert.equal((await fetch(`${base}/accounting-mapping`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receivableAccountCode: '4111' }),
      })).status, 200);
      assert.equal((await fetch(`${base}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', statementLineId: 'line-a', invoiceId: 'invoice-a' }),
      })).status, 403);
      assert.equal((await fetch(`${base}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statementLineId: 'line-a', invoiceId: 'invoice-a' }),
      })).status, 201);
      assert.equal((await fetch(`${base}/payments/payment-a`, { method: 'DELETE' })).status, 200);
      assert.deepEqual(calls, [
        { operation: 'listBankAccounts', entityId: 'entity-a' },
        { operation: 'listBankTransfers', entityId: 'entity-a' },
        { operation: 'listStatements', entityId: 'entity-a' },
        { operation: 'createBankAccount', entityId: 'entity-a', value: { name: 'Main account' } },
        {
          operation: 'createBankTransfer',
          entityId: 'entity-a',
          value: {
            payload: {
              sourceBankAccountId: 'bank-a',
              destinationBankAccountId: 'bank-b',
              amount: 10,
              transferredAt: '2026-03-04',
              description: 'Transfert entre comptes',
              idempotencyKey: 'transfer-request-1',
            },
            actor: { id: 'user-a', username: 'finance' },
          },
        },
        {
          operation: 'importStatement',
          entityId: 'entity-a',
          value: {
            bankAccountId: 'bank-a',
            csv: 'date,description,amount\n2026-03-04,Receipt,1.000',
            importedByUserId: 'user-a',
          },
        },
        { operation: 'listStatementLines', entityId: 'entity-a', value: 'statement-a' },
        { operation: 'getReconciliationCandidates', entityId: 'entity-a', value: 'line-a' },
        {
          operation: 'reconcile',
          entityId: 'entity-a',
          value: { statementLineId: 'line-a', journalLineId: 'journal-a', userId: 'user-a' },
        },
        { operation: 'removeReconciliation', entityId: 'entity-a', value: 'reconciliation-a' },
        { operation: 'getAccountingMapping', entityId: 'entity-a' },
        { operation: 'listPaymentTargets', entityId: 'entity-a' },
        { operation: 'setAccountingMapping', entityId: 'entity-a', value: { receivableAccountCode: '4111' } },
        {
          operation: 'allocatePayment',
          entityId: 'entity-a',
          value: { payload: { statementLineId: 'line-a', invoiceId: 'invoice-a' }, userId: 'user-a' },
        },
        { operation: 'removePayment', entityId: 'entity-a', value: 'payment-a' },
      ]);

      stubForecast('listScenarios', async (entityId: string) => {
        forecastCalls.push({ operation: 'listScenarios', entityId });
        return [];
      });
      stubForecast('createScenario', async (value: unknown, entityId: string) => {
        forecastCalls.push({ operation: 'createScenario', entityId, value });
        return { id: 'scenario-a' };
      });
      stubForecast('getScenarioData', async (scenarioId: string, entityId: string, horizon: unknown) => {
        forecastCalls.push({ operation: 'getScenarioData', entityId, value: { scenarioId, horizon } });
        return { scenario: { id: scenarioId } };
      });
      stubForecast('createItem', async (value: unknown, scenarioId: string, entityId: string) => {
        forecastCalls.push({ operation: 'createForecastItem', entityId, value: { value, scenarioId } });
        return { id: 'item-a' };
      });
      stubForecast('removeItem', async (itemId: string, entityId: string) => {
        forecastCalls.push({ operation: 'removeForecastItem', entityId, value: itemId });
        return { id: itemId };
      });
      assert.equal((await fetch(`${base}/forecast/scenarios`)).status, 200);
      assert.equal((await fetch(`${base}/forecast/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', name: 'Other scenario' }),
      })).status, 403);
      assert.equal((await fetch(`${base}/forecast/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Scenario A' }),
      })).status, 201);
      assert.equal((await fetch(`${base}/forecast/scenarios/scenario-a?horizonDays=14`)).status, 200);
      assert.equal((await fetch(`${base}/forecast/scenarios/scenario-a/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedDate: '2026-03-05', description: 'Inflow' }),
      })).status, 201);
      assert.equal((await fetch(`${base}/forecast/items/item-a`, { method: 'DELETE' })).status, 200);
      assert.deepEqual(forecastCalls, [
        { operation: 'listScenarios', entityId: 'entity-a' },
        { operation: 'createScenario', entityId: 'entity-a', value: { name: 'Scenario A' } },
        { operation: 'getScenarioData', entityId: 'entity-a', value: { scenarioId: 'scenario-a', horizon: '14' } },
        {
          operation: 'createForecastItem',
          entityId: 'entity-a',
          value: {
            value: { expectedDate: '2026-03-05', description: 'Inflow' },
            scenarioId: 'scenario-a',
          },
        },
        { operation: 'removeForecastItem', entityId: 'entity-a', value: 'item-a' },
      ]);
    } finally {
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(CashflowBankingService, name, descriptor);
        else Reflect.deleteProperty(CashflowBankingService, name);
      }
      for (const [name, descriptor] of forecastOriginals) {
        if (descriptor) Object.defineProperty(CashflowForecastService, name, descriptor);
        else Reflect.deleteProperty(CashflowForecastService, name);
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
