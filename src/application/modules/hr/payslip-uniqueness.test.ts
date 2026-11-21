import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isUniqueConstraintViolation } from './payslip-uniqueness';

describe('payslip uniqueness', () => {
  it('recognizes Prisma unique constraint errors without swallowing unrelated failures', () => {
    assert.equal(isUniqueConstraintViolation({ code: 'P2002' }), true);
    assert.equal(isUniqueConstraintViolation({ code: 'P2025' }), false);
    assert.equal(isUniqueConstraintViolation(new Error('database unavailable')), false);
    assert.equal(isUniqueConstraintViolation(null), false);
  });
});
