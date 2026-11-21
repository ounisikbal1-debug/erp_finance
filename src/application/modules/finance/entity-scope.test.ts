import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EntityScopeError, resolveEntityScope } from './entity-scope';

describe('finance entity scope', () => {
  it('uses the authenticated user entity when no override is supplied', () => {
    assert.equal(resolveEntityScope('entity-a'), 'entity-a');
  });

  it('rejects reads and writes for another entity and users without an entity', () => {
    assert.throws(() => resolveEntityScope('entity-a', 'entity-b'), EntityScopeError);
    assert.throws(() => resolveEntityScope(null), EntityScopeError);
  });

  it('does not let query parameters override the authenticated entity scope', () => {
    assert.equal(resolveEntityScope('entity-a', undefined), 'entity-a');
    assert.throws(() => resolveEntityScope('entity-a', 'entity-b'), EntityScopeError);
  });
});
