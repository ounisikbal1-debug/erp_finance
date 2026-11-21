import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EntityScopeError } from '../finance/entity-scope';
import { FxConversionError } from '../fx/conversion';
import { getSalesErrorResponse, SalesRequestError } from './errors';

describe('sales API error responses', () => {
  it('preserves expected validation, not-found, and entity-scope statuses', () => {
    assert.deepEqual(getSalesErrorResponse(new SalesRequestError('Invalid invoice', 400)), {
      status: 400,
      message: 'Invalid invoice',
      unexpected: false,
    });
    assert.equal(getSalesErrorResponse(new SalesRequestError('Missing customer', 404)).status, 404);
    assert.equal(getSalesErrorResponse(new SalesRequestError('Duplicate customer code', 409)).status, 409);
    assert.equal(getSalesErrorResponse(new SalesRequestError('Country posting is not configured', 422)).status, 422);
    assert.equal(getSalesErrorResponse(new EntityScopeError()).status, 403);
    assert.equal(getSalesErrorResponse(new FxConversionError('Missing rate', 400)).status, 400);
  });

  it('hides unexpected database details and maps them to a server error', () => {
    assert.deepEqual(getSalesErrorResponse(new Error('database connection string')), {
      status: 500,
      message: 'Impossible de traiter la demande commerciale.',
      unexpected: true,
    });
  });
});
