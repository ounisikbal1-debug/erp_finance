import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import MaterialsService from '../materials/service';
import { SalesService } from './service';

describe('SalesService sales-order stock workflow', () => {
  it('creates scoped material lines and calculates the order total', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let orderData: Record<string, unknown> | undefined;
    stub(prisma.entity, 'findUnique', async () => ({ country: { currencyCode: 'TND' } }));
    stub(prisma.customer, 'findFirst', async () => ({ id: 'customer-a' }));
    stub(prisma.material, 'findMany', async () => [{ id: 'material-a', name: 'Huile', unitCode: 'L' }]);
    stub(prisma.salesOrder, 'create', async ({ data }: { data: Record<string, unknown> }) => {
      orderData = data;
      return { id: 'order-a', orderNumber: data.orderNumber };
    });

    it('returns an existing identical offline order on retry and rejects key reuse with a different payload', async () => {
      const idempotencyKey = '39dc9878-89e2-4c97-9105-24ed8fe51fe7';
      const existing = {
        id: idempotencyKey,
        entityId: 'entity-a',
        customerId: 'customer-a',
        lines: [{ materialId: 'material-a', quantity: 2, unitPrice: 10 }],
      };
      const original = Object.getOwnPropertyDescriptor(prisma.salesOrder, 'findUnique');
      let lookups = 0;
      Object.defineProperty(prisma.salesOrder, 'findUnique', {
        configurable: true,
        value: async () => { lookups += 1; return existing; },
      });
      try {
        const request = {
          customerId: 'customer-a',
          idempotencyKey,
          lines: [{ materialId: 'material-a', quantity: 2, unitPrice: 10 }],
        };
        assert.equal(await SalesService.createSalesOrder(request, 'entity-a', { id: 'user-a', username: 'sales-a' }), existing);
        await assert.rejects(
          SalesService.createSalesOrder({
            ...request,
            lines: [{ materialId: 'material-a', quantity: 3, unitPrice: 10 }],
          }, 'entity-a', { id: 'user-a', username: 'sales-a' }),
          /clé d’idempotence est déjà utilisée/,
        );
        await assert.rejects(
          SalesService.createSalesOrder(request, 'entity-b', { id: 'user-b', username: 'sales-b' }),
          /clé d’idempotence est déjà utilisée/,
        );
        assert.equal(lookups, 3);
      } finally {
        if (original) Object.defineProperty(prisma.salesOrder, 'findUnique', original);
        else Reflect.deleteProperty(prisma.salesOrder, 'findUnique');
      }
    });

    try {
      const result = await SalesService.createSalesOrder({
        customerId: 'customer-a',
        lines: [{ materialId: 'material-a', quantity: 2.5, unitPrice: 10.001 }],
      }, 'entity-a', { id: 'user-a', username: 'sales-a' });
      assert.equal(result.id, 'order-a');
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.ok(orderData);
    assert.equal(orderData.entityId, 'entity-a');
    assert.equal(orderData.customerId, 'customer-a');
    assert.equal(orderData.totalAmount, 25.003);
    assert.equal(orderData.status, 'OPEN');
    assert.equal(orderData.createdByUserId, 'user-a');
    assert.deepEqual(orderData.lines, {
      create: [{
        materialId: 'material-a',
        description: 'Huile',
        quantity: 2.5,
        unitPrice: 10.001,
        totalAmount: 25.003,
      }],
    });
  });

  it('creates one warehouse pick from all scoped order lines and links it to the order', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let pickInput: Record<string, unknown> | undefined;
    let linkData: Record<string, unknown> | undefined;
    let updateData: Record<string, unknown> | undefined;
    let dispatchCalls = 0;
    const pick = { id: 'pick-a', reference: 'CMD-1' };
    const transaction = {
      salesOrderStockPickLink: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => { linkData = data; return data; },
      },
      salesOrder: {
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          updateData = data;
          return { count: 1 };
        },
      },
    };
    stub(prisma.salesOrder, 'findFirst', async () => ({
      id: 'order-a',
      orderNumber: 'CMD-1',
      status: 'OPEN',
      lines: [
        { id: 'line-a', materialId: 'material-a', quantity: 2 },
        { id: 'line-b', materialId: 'material-a', quantity: 3 },
      ],
      stockPickLink: null,
    }));
    stub(prisma, '$transaction', async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));
    stub(MaterialsService, 'createStockPick', async (input: Record<string, unknown>) => {
      pickInput = input;
      return pick;
    });
    stub(MaterialsService, 'confirmStockDispatch', async () => {
      dispatchCalls += 1;
      return { id: 'dispatch-a' };
    });

    try {
      const result = await SalesService.createSalesOrderStockPick('order-a', {
        lines: [
          { salesOrderLineId: 'line-a', warehouseId: 'warehouse-a' },
          { salesOrderLineId: 'line-b', warehouseId: 'warehouse-a' },
        ],
      }, 'entity-a', { id: 'user-a', username: 'sales-a' });
      assert.equal(result, pick);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.deepEqual(pickInput, {
      reference: 'CMD-1',
      reason: 'Préparation commande client CMD-1',
      idempotencyKey: 'sales-order-pick-order-a',
      lines: [{ materialId: 'material-a', warehouseId: 'warehouse-a', quantity: 5 }],
    });
    assert.deepEqual(linkData, { entityId: 'entity-a', salesOrderId: 'order-a', stockPickId: 'pick-a' });
    assert.deepEqual(updateData, { status: 'PICKED' });
    assert.equal(dispatchCalls, 0, 'preparation must not confirm dispatch or consume stock');
  });

  it('reuses the same prepared pick after a sales-link write fails', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    const createdPick = { id: 'pick-a', reference: 'CMD-1' };
    let orderStatus = 'OPEN';
    let linkCreated = false;
    let pickCreateCalls = 0;
    let linkWriteAttempts = 0;
    const stablePickKeys: string[] = [];
    const transaction = {
      salesOrderStockPickLink: {
        findFirst: async () => linkCreated ? ({
          stockPickId: 'pick-a',
          stockPick: createdPick,
        }) : null,
        create: async () => {
          linkWriteAttempts += 1;
          if (linkWriteAttempts === 1) throw new Error('simulated sales link failure after pick commit');
          linkCreated = true;
          return {};
        },
      },
      salesOrder: {
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          orderStatus = String(data.status);
          return { count: 1 };
        },
      },
    };
    stub(prisma.salesOrder, 'findFirst', async () => ({
      id: 'order-a',
      orderNumber: 'CMD-1',
      status: orderStatus,
      lines: [{ id: 'line-a', materialId: 'material-a', quantity: 2 }],
      stockPickLink: linkCreated ? { stockPick: createdPick } : null,
    }));
    stub(prisma, '$transaction', async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));
    stub(MaterialsService, 'createStockPick', async (input: Record<string, unknown>) => {
      pickCreateCalls += 1;
      stablePickKeys.push(String(input.idempotencyKey));
      return createdPick;
    });

    try {
      await assert.rejects(
        SalesService.createSalesOrderStockPick('order-a', {
          lines: [{ salesOrderLineId: 'line-a', warehouseId: 'warehouse-a' }],
        }, 'entity-a', { id: 'user-a', username: 'sales-a' }),
        /simulated sales link failure/,
      );
      assert.equal(orderStatus, 'OPEN');
      assert.equal(await SalesService.createSalesOrderStockPick('order-a', {
        lines: [{ salesOrderLineId: 'line-a', warehouseId: 'warehouse-a' }],
      }, 'entity-a', { id: 'user-a', username: 'sales-a' }), createdPick);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.equal(pickCreateCalls, 2);
    assert.deepEqual(stablePickKeys, ['sales-order-pick-order-a', 'sales-order-pick-order-a']);
    assert.equal(orderStatus, 'PICKED');
    assert.equal(linkWriteAttempts, 2);
  });

  it('dispatches only the linked stock pick with a stable idempotency key', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let pickId = '';
    let dispatchInput: Record<string, unknown> | undefined;
    let orderUpdate: Record<string, unknown> | undefined;
    const dispatch = { id: 'dispatch-a' };
    stub(prisma.salesOrder, 'findFirst', async () => ({
      id: 'order-a',
      status: 'PICKED',
      stockPickLink: { stockPickId: 'pick-a', stockPick: { dispatch: null } },
    }));
    stub(prisma.salesOrder, 'updateMany', async ({ data }: { data: Record<string, unknown> }) => {
      orderUpdate = data;
      return { count: 1 };
    });
    stub(MaterialsService, 'confirmStockDispatch', async (
      id: string,
      input: Record<string, unknown>,
    ) => {
      pickId = id;
      dispatchInput = input;
      return dispatch;
    });

    try {
      assert.equal(await SalesService.dispatchSalesOrder('order-a', 'entity-a', {
        id: 'user-a',
        username: 'sales-a',
      }), dispatch);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.equal(pickId, 'pick-a');
    assert.deepEqual(dispatchInput, { idempotencyKey: 'sales-order-dispatch-order-a' });
    assert.deepEqual(orderUpdate, { status: 'DISPATCHED' });
  });

  it('reconciles a stale picked order by retrying the already-confirmed stock dispatch idempotently', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let confirmedPickId = '';
    let idempotencyKey = '';
    let orderUpdate: Record<string, unknown> | undefined;
    const existingDispatch = { id: 'dispatch-a' };
    stub(prisma.salesOrder, 'findFirst', async () => ({
      id: 'order-a',
      status: 'PICKED',
      stockPickLink: {
        stockPickId: 'pick-a',
        stockPick: { dispatch: { id: 'dispatch-a' } },
      },
    }));
    stub(MaterialsService, 'confirmStockDispatch', async (
      pickId: string,
      input: Record<string, unknown>,
    ) => {
      confirmedPickId = pickId;
      idempotencyKey = String(input.idempotencyKey);
      return existingDispatch;
    });
    stub(prisma.salesOrder, 'updateMany', async ({ data }: { data: Record<string, unknown> }) => {
      orderUpdate = data;
      return { count: 1 };
    });

    try {
      const result = await SalesService.dispatchSalesOrder('order-a', 'entity-a', {
        id: 'user-a',
        username: 'sales-a',
      });
      assert.equal(result, existingDispatch);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.equal(confirmedPickId, 'pick-a');
    assert.equal(idempotencyKey, 'sales-order-dispatch-order-a');
    assert.deepEqual(orderUpdate, { status: 'DISPATCHED' });
  });

  it('recovers when the stock commit succeeds but updating the sales order fails', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let orderReads = 0;
    let updateAttempts = 0;
    const confirmationKeys: string[] = [];
    const committedDispatch = { id: 'dispatch-committed' };
    stub(prisma.salesOrder, 'findFirst', async () => {
      orderReads += 1;
      return {
        id: 'order-a',
        status: 'PICKED',
        stockPickLink: {
          stockPickId: 'pick-a',
          stockPick: { dispatch: orderReads === 1 ? null : committedDispatch },
        },
      };
    });
    stub(MaterialsService, 'confirmStockDispatch', async (
      _pickId: string,
      input: Record<string, unknown>,
    ) => {
      confirmationKeys.push(String(input.idempotencyKey));
      return committedDispatch;
    });
    stub(prisma.salesOrder, 'updateMany', async () => {
      updateAttempts += 1;
      if (updateAttempts === 1) throw new Error('simulated sales status write failure after stock commit');
      return { count: 1 };
    });

    try {
      await assert.rejects(
        SalesService.dispatchSalesOrder('order-a', 'entity-a', { id: 'user-a', username: 'sales-a' }),
        /simulated sales status write failure/,
      );
      assert.equal(await SalesService.dispatchSalesOrder('order-a', 'entity-a', {
        id: 'user-a',
        username: 'sales-a',
      }), committedDispatch);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.equal(orderReads, 2);
    assert.equal(updateAttempts, 2);
    assert.deepEqual(confirmationKeys, [
      'sales-order-dispatch-order-a',
      'sales-order-dispatch-order-a',
    ]);
  });

  it('refuses to dispatch again when the order says dispatched but has no confirmed stock dispatch', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let dispatchCalls = 0;
    stub(prisma.salesOrder, 'findFirst', async () => ({
      id: 'order-a',
      status: 'DISPATCHED',
      stockPickLink: { stockPickId: 'pick-a', stockPick: { dispatch: null } },
    }));
    stub(MaterialsService, 'confirmStockDispatch', async () => {
      dispatchCalls += 1;
      return { id: 'dispatch-a' };
    });

    try {
      await assert.rejects(
        SalesService.dispatchSalesOrder('order-a', 'entity-a', { id: 'user-a', username: 'sales-a' }),
        /ne correspond pas à un dispatch de stock confirmé/,
      );
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.equal(dispatchCalls, 0);
  });

  it('cancels a prepared sales order after releasing its linked stock reservation', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let orderStatus = 'PICKED';
    const cancellationCalls: unknown[][] = [];
    stub(prisma.salesOrder, 'findFirst', async () => ({
      id: 'order-a',
      status: orderStatus,
      stockPickLink: { stockPickId: 'pick-a' },
    }));
    stub(prisma.salesOrder, 'updateMany', async ({ where, data }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      assert.deepEqual(where, { id: 'order-a', entityId: 'entity-a', status: { in: ['OPEN', 'PICKED'] } });
      orderStatus = String(data.status);
      return { count: 1 };
    });
    stub(MaterialsService, 'cancelStockPick', async (...args: unknown[]) => {
      cancellationCalls.push(args);
      return { id: 'pick-a', status: 'CANCELLED' };
    });

    try {
      const cancelled = await SalesService.cancelSalesOrder('order-a', 'entity-a', {
        id: 'user-a',
        username: 'sales-a',
      });
      assert.equal(orderStatus, 'CANCELLED');
      assert.deepEqual(cancellationCalls, [[
        'pick-a',
        'entity-a',
        { id: 'user-a', username: 'sales-a' },
      ]]);
      assert.equal(cancelled?.status, 'CANCELLED');
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('does not retry preparation for an already cancelled sales order', async () => {
    const restorers: Array<() => void> = [];
    const originalOrderFinder = Object.getOwnPropertyDescriptor(prisma.salesOrder, 'findFirst');
    const originalPickCreator = Object.getOwnPropertyDescriptor(MaterialsService, 'createStockPick');
    let pickCalls = 0;
    Object.defineProperty(prisma.salesOrder, 'findFirst', {
      configurable: true,
      value: async () => ({ id: 'order-a', status: 'CANCELLED', lines: [], stockPickLink: null }),
    });
    Object.defineProperty(MaterialsService, 'createStockPick', {
      configurable: true,
      value: async () => {
        pickCalls += 1;
        return { id: 'pick-a' };
      },
    });
    restorers.push(() => {
      if (originalOrderFinder) Object.defineProperty(prisma.salesOrder, 'findFirst', originalOrderFinder);
      else Reflect.deleteProperty(prisma.salesOrder, 'findFirst');
      if (originalPickCreator) Object.defineProperty(MaterialsService, 'createStockPick', originalPickCreator);
      else Reflect.deleteProperty(MaterialsService, 'createStockPick');
    });

    try {
      await assert.rejects(
        SalesService.createSalesOrderStockPick('order-a', {
          lines: [{ salesOrderLineId: 'line-a', warehouseId: 'warehouse-a' }],
        }, 'entity-a', { id: 'user-a', username: 'sales-a' }),
        /Une commande annulée ne peut pas être préparée/,
      );
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.equal(pickCalls, 0);
  });

  it('refuses cancellation after dispatch without attempting to release stock', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    let cancellationCalls = 0;
    stub(prisma.salesOrder, 'findFirst', async () => ({
      id: 'order-a',
      status: 'DISPATCHED',
      stockPickLink: { stockPickId: 'pick-a' },
    }));
    stub(MaterialsService, 'cancelStockPick', async () => {
      cancellationCalls += 1;
      return {};
    });

    try {
      await assert.rejects(
        SalesService.cancelSalesOrder('order-a', 'entity-a', { id: 'user-a', username: 'sales-a' }),
        /Une commande expédiée ne peut pas être annulée/,
      );
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.equal(cancellationCalls, 0);
  });

  it('creates one invoice from a dispatched order and records its source and actor', async () => {
    const restorers: Array<() => void> = [];
    const stub = (target: object, property: string, value: unknown) => {
      const original = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, { configurable: true, value });
      restorers.push(() => {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
      });
    };
    const order = {
      id: 'order-a',
      orderNumber: 'CMD-1',
      entityId: 'entity-a',
      customerId: 'customer-a',
      currencyCode: 'TND',
      totalAmount: 20,
      status: 'DISPATCHED',
      lines: [{
        id: 'line-a',
        materialId: 'material-a',
        description: 'Huile',
        quantity: 2,
        unitPrice: 10,
      }],
      stockPickLink: { stockPick: { dispatch: { id: 'dispatch-a' } } },
      invoiceLink: null,
    };
    const invoice = { id: 'invoice-a', documentSubTotal: 20 };
    let invoiceInput: unknown;
    let linkData: unknown;
    let workflowEvent: unknown;
    const transaction = {
      salesOrderInvoiceLink: {
        findUnique: async () => null,
        create: async ({ data }: { data: unknown }) => { linkData = data; return data; },
      },
      salesOrder: {
        findFirst: async () => ({ stockPickLink: { stockPick: { dispatch: { id: 'dispatch-a' } } } }),
      },
      salesInvoiceWorkflowEvent: {
        create: async ({ data }: { data: unknown }) => { workflowEvent = data; return data; },
      },
    };
    stub(prisma.salesOrder, 'findFirst', async () => order);
    stub(prisma, '$transaction', async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));
    stub(SalesService, 'createInvoice', async (...args: unknown[]) => {
      invoiceInput = args;
      return invoice;
    });

    try {
      const result = await SalesService.convertSalesOrderToInvoice('order-a', {
        lines: [{ salesOrderLineId: 'line-a', taxRate: 19 }],
      }, 'entity-a', { id: 'user-a', username: 'sales-a' });
      assert.deepEqual(result, { invoice, created: true });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }

    assert.deepEqual(invoiceInput, [{
      customerId: 'customer-a',
      entityId: 'entity-a',
      documentCurrencyCode: 'TND',
      items: [{
        description: 'Huile',
        quantity: 2,
        unitPrice: 10,
        taxRate: 19,
        materialId: 'material-a',
      }],
    }, { id: 'user-a', username: 'sales-a' }, transaction]);
    assert.deepEqual(linkData, {
      entityId: 'entity-a',
      salesOrderId: 'order-a',
      invoiceId: 'invoice-a',
      createdByUserId: 'user-a',
      createdByUsername: 'sales-a',
    });
    assert.deepEqual(workflowEvent, {
      invoiceId: 'invoice-a',
      action: 'CREATED_FROM_ORDER',
      actorUserId: 'user-a',
      actorUsername: 'sales-a',
      note: 'Facture brouillon créée à partir de la commande CMD-1.',
    });
  });

  it('returns an existing linked invoice without requiring new tax input or creating another', async () => {
    const restorers: Array<() => void> = [];
    const originalOrderFinder = Object.getOwnPropertyDescriptor(prisma.salesOrder, 'findFirst');
    const originalInvoiceCreator = Object.getOwnPropertyDescriptor(SalesService, 'createInvoice');
    let createCalls = 0;
    const invoice = { id: 'invoice-existing', invoiceNumber: 'FAC-1' };
    Object.defineProperty(prisma.salesOrder, 'findFirst', {
      configurable: true,
      value: async () => ({ invoiceLink: { invoice } }),
    });
    Object.defineProperty(SalesService, 'createInvoice', {
      configurable: true,
      value: async () => { createCalls += 1; throw new Error('must not create a duplicate'); },
    });
    restorers.push(() => {
      if (originalOrderFinder) Object.defineProperty(prisma.salesOrder, 'findFirst', originalOrderFinder);
      else Reflect.deleteProperty(prisma.salesOrder, 'findFirst');
      if (originalInvoiceCreator) Object.defineProperty(SalesService, 'createInvoice', originalInvoiceCreator);
      else Reflect.deleteProperty(SalesService, 'createInvoice');
    });

    try {
      assert.deepEqual(await SalesService.convertSalesOrderToInvoice(
        'order-a',
        null,
        'entity-a',
        { id: 'user-a', username: 'sales-a' },
      ), { invoice, created: false });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
    assert.equal(createCalls, 0);
  });

  it('refuses to invoice an order without a confirmed dispatch', async () => {
    const original = Object.getOwnPropertyDescriptor(prisma.salesOrder, 'findFirst');
    const originalInvoiceCreator = Object.getOwnPropertyDescriptor(SalesService, 'createInvoice');
    let invoiceCalls = 0;
    Object.defineProperty(prisma.salesOrder, 'findFirst', {
      configurable: true,
      value: async () => ({
        id: 'order-a',
        status: 'PICKED',
        invoiceLink: null,
        stockPickLink: { stockPick: { dispatch: null } },
      }),
    });
    Object.defineProperty(SalesService, 'createInvoice', {
      configurable: true,
      value: async () => { invoiceCalls += 1; return {}; },
    });
    try {
      await assert.rejects(
        SalesService.convertSalesOrderToInvoice(
          'order-a',
          { lines: [{ salesOrderLineId: 'line-a', taxRate: 19 }] },
          'entity-a',
          { id: 'user-a', username: 'sales-a' },
        ),
        /Seule une commande dont l’expédition de stock est confirmée peut être facturée/,
      );
    } finally {
      if (original) Object.defineProperty(prisma.salesOrder, 'findFirst', original);
      else Reflect.deleteProperty(prisma.salesOrder, 'findFirst');
      if (originalInvoiceCreator) Object.defineProperty(SalesService, 'createInvoice', originalInvoiceCreator);
      else Reflect.deleteProperty(SalesService, 'createInvoice');
    }
    assert.equal(invoiceCalls, 0);
  });
});
