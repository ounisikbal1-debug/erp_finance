import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertAccountCodesExist, assertPostingAccountCodesAllowed } from './account-validation';

describe('assertAccountCodesExist', () => {
  it('accepts known codes and ignores duplicate requests', () => {
    assert.doesNotThrow(() => assertAccountCodesExist(['411', '707', '411'], ['411', '707']));
  });

  it('rejects codes missing from the company chart of accounts', () => {
    assert.throws(
      () => assertAccountCodesExist(['411', '707', '4367'], ['411', '707']),
      /4367/,
    );
  });

  it('prevents journal entries from using non-postable account groups', () => {
    assert.throws(
      () => assertPostingAccountCodesAllowed(['GROUP'], [{ code: 'GROUP', isPostingAllowed: false }]),
      /regroupement/,
    );
    assert.doesNotThrow(() => assertPostingAccountCodesAllowed(
      ['311'],
      [{ code: '311', isPostingAllowed: true }],
    ));
  });
});
