import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MaterialsRequestError } from './errors';
import { validateVendorInput } from './vendor-validation';

describe('validateVendorInput', () => {
  it('normalizes required and optional fields and fixes the entity scope', () => {
    assert.deepEqual(validateVendorInput({
      entityId: 'untrusted-entity',
      code: ' V-001 ',
      name: ' Fournisseur ',
      email: ' vendor@example.test ',
      phone: '',
    }, 'entity-a'), {
      entityId: 'entity-a',
      code: 'V-001',
      name: 'Fournisseur',
      email: 'vendor@example.test',
      phone: null,
    });
  });

  it('rejects missing required fields, non-string contacts, and oversized values', () => {
    assert.throws(() => validateVendorInput({ name: 'Fournisseur' }, 'entity-a'), MaterialsRequestError);
    assert.throws(() => validateVendorInput({ code: 'V-1', name: 'Fournisseur', email: 123 }, 'entity-a'), MaterialsRequestError);
    assert.throws(() => validateVendorInput({
      code: 'V-1', name: 'Fournisseur', address: 'x'.repeat(501),
    }, 'entity-a'), MaterialsRequestError);
  });
});
