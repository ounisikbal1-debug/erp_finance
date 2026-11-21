import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EntityScopeError } from './entity-scope';
import { FinanceRequestError, getFinanceErrorResponse } from './errors';

describe('finance API error responses', () => {
  it('preserves expected validation, not-found, and entity-scope statuses', () => {
    assert.deepEqual(getFinanceErrorResponse(new FinanceRequestError('Unbalanced entry', 400)), {
      status: 400,
      message: 'Unbalanced entry',
      unexpected: false,
    });
    assert.equal(getFinanceErrorResponse(new FinanceRequestError('Missing entity', 404)).status, 404);
    assert.equal(getFinanceErrorResponse(new FinanceRequestError('Invalid posted line', 422)).status, 422);
    assert.equal(getFinanceErrorResponse(new EntityScopeError()).status, 403);
  });

  it('hides unexpected database details and maps them to a server error', () => {
    assert.deepEqual(getFinanceErrorResponse(new Error('database connection string')), {
      status: 500,
      message: 'Impossible de traiter la demande comptable.',
      unexpected: true,
    });
  });
});
