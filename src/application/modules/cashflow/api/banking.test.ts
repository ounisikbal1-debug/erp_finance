import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import CashflowBankingService from '../banking-service';
import { getModuleRoles } from '../../../auth';
import cashflowRouter from './index';

describe('cashflow banking API', () => {
  it('scopes account, import, and reconciliation operations to the authenticated entity', async () => {
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
    const stub = (name: keyof typeof CashflowBankingService, value: (...args: never[]) => unknown) => {
      const original = Object.getOwnPropertyDescriptor(CashflowBankingService, name);
      originals.set(name, original);
      Object.defineProperty(CashflowBankingService, name, { configurable: true, value });
    };
    stub('listBankAccounts', (async (entityId: string) => {
      calls.push({ operation: 'accounts', entityId });
      return [];
    }) as (...args: never[]) => unknown);
    stub('createBankAccount', (async (value: unknown, entityId: string) => {
      calls.push({ operation: 'create-account', entityId, value });
      return { id: 'bank-a' };
    }) as (...args: never[]) => unknown);
    stub('importStatement', (async (input: unknown, entityId: string) => {
      calls.push({ operation: 'import', entityId, value: input });
      return { id: 'statement-a', lineCount: 1 };
    }) as (...args: never[]) => unknown);
    stub('reconcile', (async (input: unknown, entityId: string) => {
      calls.push({ operation: 'reconcile', entityId, value: input });
      return { id: 'match-a' };
    }) as (...args: never[]) => unknown);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;

      const accountList = await fetch(`${base}/bank-accounts`);
      assert.equal(accountList.status, 200);
      const deniedAccount = await fetch(`${base}/bank-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', name: 'Compte B', currencyCode: 'TND', ledgerAccountCode: '5121' }),
      });
      assert.equal(deniedAccount.status, 403);
      const createdAccount = await fetch(`${base}/bank-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Compte A', currencyCode: 'TND', ledgerAccountCode: '5121' }),
      });
      assert.equal(createdAccount.status, 201);

      const imported = await fetch(`${base}/statements?bankAccountId=bank-a`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
        body: 'date,description,amount\n2026-03-04,Versement,10.000',
      });
      assert.equal(imported.status, 201);
      const deniedReconciliation = await fetch(`${base}/reconciliations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'entity-b', statementLineId: 'line-a', journalLineId: 'journal-a' }),
      });
      assert.equal(deniedReconciliation.status, 403);
      const matched = await fetch(`${base}/reconciliations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statementLineId: 'line-a', journalLineId: 'journal-a' }),
      });
      assert.equal(matched.status, 201);
      assert.deepEqual(calls.map(({ operation, entityId }) => ({ operation, entityId })), [
        { operation: 'accounts', entityId: 'entity-a' },
        { operation: 'create-account', entityId: 'entity-a' },
        { operation: 'import', entityId: 'entity-a' },
        { operation: 'reconcile', entityId: 'entity-a' },
      ]);
      assert.deepEqual(calls[2].value, {
        bankAccountId: 'bank-a',
        csv: 'date,description,amount\n2026-03-04,Versement,10.000',
        importedByUserId: 'user-a',
      });
    } finally {
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(CashflowBankingService, name, descriptor);
        else Reflect.deleteProperty(CashflowBankingService, name);
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
