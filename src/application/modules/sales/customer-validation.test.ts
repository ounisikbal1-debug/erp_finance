import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateCustomerInput } from './customer-validation';

describe('validateCustomerInput', () => {
  it('keeps only customer fields and always uses the scoped entity', () => {
    assert.deepEqual(validateCustomerInput({
      code: ' C-01 ',
      name: ' Client ',
      email: ' contact@example.test ',
      entityId: 'other-entity',
      role: 'ADMIN',
    }, 'entity-1'), {
      entityId: 'entity-1',
      code: 'C-01',
      name: 'Client',
      email: 'contact@example.test',
    });
  });

  it('rejects missing required fields and invalid optional fields', () => {
    assert.throws(() => validateCustomerInput({ name: 'Client' }, 'entity-1'), /code et le nom/);
    assert.throws(() => validateCustomerInput({ code: 'C-01', name: 'Client', phone: 123 }, 'entity-1'), /phone/);
    assert.throws(() => validateCustomerInput(null, 'entity-1'), /Données client invalides/);
  });

  it('normalizes empty contact fields and enforces field size limits', () => {
    assert.deepEqual(validateCustomerInput({
      code: 'C-02',
      name: 'Client',
      email: '  ',
    }, 'entity-1'), {
      entityId: 'entity-1',
      code: 'C-02',
      name: 'Client',
      email: null,
    });
    assert.throws(() => validateCustomerInput({
      code: 'C-02',
      name: 'Client',
      email: 'x'.repeat(255),
    }, 'entity-1'), /longueur maximale/);
  });
});
