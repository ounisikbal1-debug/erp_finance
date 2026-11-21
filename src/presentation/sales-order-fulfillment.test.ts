import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getSalesOrderFulfillmentDisplay } from './sales-order-fulfillment';

describe('sales order fulfillment display', () => {
  it('offers status reconciliation when dispatch committed but the order status update lagged', () => {
    assert.deepEqual(getSalesOrderFulfillmentDisplay('PICKED', { id: 'dispatch-1' }), {
      label: 'Expédiée',
      canDispatch: false,
      canReconcile: true,
      warning: null,
    });
  });

  it('shows a prepared order without dispatch as ready for confirmation', () => {
    assert.deepEqual(getSalesOrderFulfillmentDisplay('PICKED', null), {
      label: 'Préparée',
      canDispatch: true,
      canReconcile: false,
      warning: null,
    });
  });

  it('flags a dispatched status that has no confirmed stock dispatch', () => {
    assert.deepEqual(getSalesOrderFulfillmentDisplay('DISPATCHED', null), {
      label: 'À vérifier',
      canDispatch: false,
      canReconcile: false,
      warning: 'La commande est marquée expédiée, mais aucun dispatch de stock confirmé n’est lié.',
    });
  });

  it('does not offer reconciliation after both stock and order confirm dispatch', () => {
    assert.deepEqual(getSalesOrderFulfillmentDisplay('DISPATCHED', { id: 'dispatch-1' }), {
      label: 'Expédiée',
      canDispatch: false,
      canReconcile: false,
      warning: null,
    });
  });

  it('shows a cancelled order without dispatch actions', () => {
    assert.deepEqual(getSalesOrderFulfillmentDisplay('CANCELLED', null), {
      label: 'Annulée',
      canDispatch: false,
      canReconcile: false,
      warning: null,
    });
  });
});
