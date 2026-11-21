import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import { getModuleRoles } from '../../../auth';
import CashflowForecastService from '../forecast-service';
import cashflowRouter from './index';

describe('cashflow forecast API', () => {
  it('scopes scenarios and forecast items to the authenticated entity', async () => {
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
    const stub = (name: keyof typeof CashflowForecastService, value: (...args: never[]) => unknown) => {
      originals.set(name, Object.getOwnPropertyDescriptor(CashflowForecastService, name));
      Object.defineProperty(CashflowForecastService, name, { configurable: true, value });
    };
    stub('listScenarios', (async (entityId: string) => {
      calls.push({ operation: 'list', entityId });
      return [];
    }) as (...args: never[]) => unknown);
    stub('createScenario', (async (value: unknown, entityId: string) => {
      calls.push({ operation: 'create-scenario', entityId, value });
      return { id: 'scenario-a' };
    }) as (...args: never[]) => unknown);
    stub('listSources', (async (scenarioId: string, entityId: string) => {
      calls.push({ operation: 'list-sources', entityId, value: scenarioId });
      return [];
    }) as (...args: never[]) => unknown);
    stub('getScenarioData', (async (scenarioId: string, entityId: string, horizon: unknown) => {
      calls.push({ operation: 'read-scenario', entityId, value: { scenarioId, horizon } });
      return { scenario: { id: scenarioId } };
    }) as (...args: never[]) => unknown);
    stub('createItem', (async (value: unknown, scenarioId: string, entityId: string) => {
      calls.push({ operation: 'create-item', entityId, value: { scenarioId, item: value } });
      return { id: 'item-a' };
    }) as (...args: never[]) => unknown);
    stub('removeItem', (async (itemId: string, entityId: string) => {
      calls.push({ operation: 'remove-item', entityId, value: itemId });
      return { id: itemId };
    }) as (...args: never[]) => unknown);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;

      assert.equal((await fetch(`${base}/forecast/scenarios`)).status, 200);
      assert.equal((await fetch(`${base}/forecast/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', name: 'Forbidden' }),
      })).status, 403);
      assert.equal((await fetch(`${base}/forecast/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Scenario', bankAccountId: 'bank-a' }),
      })).status, 201);
      assert.equal((await fetch(`${base}/forecast/scenarios/scenario-a?horizonDays=14`)).status, 200);
      assert.equal((await fetch(`${base}/forecast/scenarios/scenario-a/sources`)).status, 200);
      assert.equal((await fetch(`${base}/forecast/scenarios/scenario-a?entityId=entity-b`)).status, 403);
      assert.equal((await fetch(`${base}/forecast/scenarios/scenario-a/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', description: 'Denied' }),
      })).status, 403);
      assert.equal((await fetch(`${base}/forecast/scenarios/scenario-a/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Planned receipt' }),
      })).status, 201);
      assert.equal((await fetch(`${base}/forecast/items/item-a`, { method: 'DELETE' })).status, 200);
      assert.deepEqual(calls, [
        { operation: 'list', entityId: 'entity-a' },
        { operation: 'create-scenario', entityId: 'entity-a', value: { name: 'Scenario', bankAccountId: 'bank-a' } },
        { operation: 'read-scenario', entityId: 'entity-a', value: { scenarioId: 'scenario-a', horizon: '14' } },
        { operation: 'list-sources', entityId: 'entity-a', value: 'scenario-a' },
        { operation: 'create-item', entityId: 'entity-a', value: { scenarioId: 'scenario-a', item: { description: 'Planned receipt' } } },
        { operation: 'remove-item', entityId: 'entity-a', value: 'item-a' },
      ]);
    } finally {
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(CashflowForecastService, name, descriptor);
        else Reflect.deleteProperty(CashflowForecastService, name);
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
