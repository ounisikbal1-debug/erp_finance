import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import { SalesRequestError } from './errors';
import { validateCustomerContactUpdate } from './customer-validation';
import { SalesService } from './service';

describe('validateCustomerContactUpdate', () => {
  it('accepts and normalizes only contact fields', () => {
    assert.deepEqual(validateCustomerContactUpdate({
      email: ' client@example.test ',
      phone: ' +216 20 000 000 ',
      name: 'must be ignored',
    }), {
      email: 'client@example.test',
      phone: '+216 20 000 000',
    });
    assert.deepEqual(validateCustomerContactUpdate({ address: '  ' }), { address: null });
  });

  it('requires a valid contact field and enforces field lengths', () => {
    assert.throws(() => validateCustomerContactUpdate({ name: 'Client' }), /Au moins un champ/);
    assert.throws(() => validateCustomerContactUpdate({ email: 12 }), /email/);
    assert.throws(() => validateCustomerContactUpdate({ address: 'x'.repeat(501) }), /longueur maximale/);
    assert.throws(() => validateCustomerContactUpdate(null), /Données de coordonnées/);
  });
});

describe('SalesService.updateCustomerContacts', () => {
  it('persists scoped contact edits with an audit event per changed field', async () => {
    const original = Object.getOwnPropertyDescriptor(prisma, '$transaction');
    let updateQuery: Record<string, unknown> | undefined;
    let auditRows: Array<Record<string, unknown>> = [];
    let current: Record<string, unknown> = {
      id: 'customer-a',
      code: 'C001',
      name: 'Client',
      fiscalId: null,
      email: 'old@example.test',
      phone: null,
      address: null,
    };
    const transaction = {
      customer: {
        async findFirst({ where }: { where: Record<string, unknown> }) {
          assert.deepEqual(where, { id: 'customer-a', entityId: 'entity-a' });
          return current;
        },
        async updateMany(query: Record<string, unknown>) {
          updateQuery = query;
          current = { ...current, ...(query.data as Record<string, unknown>) };
          return { count: 1 };
        },
      },
      customerContactChange: {
        async createMany({ data }: { data: Array<Record<string, unknown>> }) {
          auditRows = data;
          return { count: data.length };
        },
      },
    };
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
    });

    try {
      const updated = await SalesService.updateCustomerContacts(
        'customer-a',
        { email: 'new@example.test', phone: '+216 20 000 000', name: 'Ignored' },
        'entity-a',
        { id: 'user-a', username: 'sales-a' },
      );
      assert.equal((updated as { email: string }).email, 'new@example.test');
      assert.deepEqual(updateQuery, {
        where: {
          id: 'customer-a',
          entityId: 'entity-a',
          email: 'old@example.test',
          phone: null,
        },
        data: { email: 'new@example.test', phone: '+216 20 000 000' },
      });
      assert.deepEqual(auditRows.map(({ field, previousValue, newValue, actorUserId, actorUsername }) => [
        field, previousValue, newValue, actorUserId, actorUsername,
      ]), [
        ['email', 'old@example.test', 'new@example.test', 'user-a', 'sales-a'],
        ['phone', null, '+216 20 000 000', 'user-a', 'sales-a'],
      ]);
    } finally {
      if (original) Object.defineProperty(prisma, '$transaction', original);
      else Reflect.deleteProperty(prisma, '$transaction');
    }
  });

  it('rejects a customer outside the requested entity without updating it', async () => {
    const original = Object.getOwnPropertyDescriptor(prisma, '$transaction');
    const transaction = {
      customer: {
        async findFirst() { return null; },
        async updateMany() { assert.fail('foreign customer must not be updated'); },
      },
      customerContactChange: {
        async createMany() { assert.fail('foreign customer must not be audited'); },
      },
    };
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
    });

    try {
      await assert.rejects(
        SalesService.updateCustomerContacts('customer-a', { email: 'other@example.test' }, 'entity-b', {
          id: 'user-b',
          username: 'sales-b',
        }),
        (error: unknown) => error instanceof SalesRequestError && error.statusCode === 404,
      );
    } finally {
      if (original) Object.defineProperty(prisma, '$transaction', original);
      else Reflect.deleteProperty(prisma, '$transaction');
    }
  });
});
