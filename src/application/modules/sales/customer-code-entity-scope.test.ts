import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import { SalesRequestError } from './errors';
import { SalesService } from './service';

describe('customer code entity scope', () => {
  it('allows the same code in different entities and rejects a duplicate in the same entity', async () => {
    const original = Object.getOwnPropertyDescriptor(prisma.customer, 'create');
    const saved = new Map<string, { id: string; entityId: string; code: string }>();
    Object.defineProperty(prisma.customer, 'create', {
      configurable: true,
      value: async ({ data }: { data: { entityId: string; code: string } }) => {
        const key = `${data.entityId}:${data.code}`;
        if (saved.has(key)) throw { code: 'P2002' };
        const customer = { id: `customer-${saved.size + 1}`, ...data };
        saved.set(key, customer);
        return customer;
      },
    });

    try {
      const customerA = await SalesService.createCustomer({ code: 'C001', name: 'Client A' }, 'entity-a');
      const customerB = await SalesService.createCustomer({ code: 'C001', name: 'Client B' }, 'entity-b');
      assert.equal(customerA.entityId, 'entity-a');
      assert.equal(customerB.entityId, 'entity-b');
      assert.notEqual(customerA.id, customerB.id);

      await assert.rejects(
        SalesService.createCustomer({ code: 'C001', name: 'Client A duplicate' }, 'entity-a'),
        (error: unknown) => error instanceof SalesRequestError && error.statusCode === 409,
      );
      assert.equal(saved.size, 2);
    } finally {
      if (original) Object.defineProperty(prisma.customer, 'create', original);
      else Reflect.deleteProperty(prisma.customer, 'create');
    }
  });
});
