import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EntityScopeError } from '../finance/entity-scope';
import { getHrErrorResponse, HrRequestError } from './errors';

describe('HR API error responses', () => {
  it('preserves expected validation, conflict, not-found, and entity-scope statuses', () => {
    assert.equal(getHrErrorResponse(new HrRequestError('Invalid payroll input', 400)).status, 400);
    assert.equal(getHrErrorResponse(new HrRequestError('Employee not found', 404)).status, 404);
    assert.equal(getHrErrorResponse(new HrRequestError('Payslip already exists', 409)).status, 409);
    assert.equal(getHrErrorResponse(new EntityScopeError()).status, 403);
  });

  it('hides unexpected database details and maps them to a server error', () => {
    assert.deepEqual(getHrErrorResponse(new Error('database connection string')), {
      status: 500,
      message: 'Impossible de traiter la demande RH.',
      unexpected: true,
    });
  });
});
