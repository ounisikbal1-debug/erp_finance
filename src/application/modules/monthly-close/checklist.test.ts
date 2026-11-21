import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getMonthlyCloseCheckKey,
  ANNUAL_CLOSE_CHECKS,
  MONTHLY_CLOSE_CHECKS,
  parseMonthlyClosePeriod,
  validateCloseLockNote,
  validateMonthlyCloseUpdate,
} from './checklist';

describe('monthly close checklist validation', () => {
  it('accepts valid monthly periods and rejects invalid periods', () => {
    assert.equal(parseMonthlyClosePeriod('2026-02'), '2026-02');
    assert.equal(parseMonthlyClosePeriod('2026'), '2026');
    for (const period of ['2026-00', '2026-13', '2026-2', '2026-02-01', null]) {
      assert.throws(() => parseMonthlyClosePeriod(period), /format AAAA-MM ou AAAA/);
    }
  });

  it('accepts only configured checklist keys', () => {
    assert.equal(getMonthlyCloseCheckKey('journal-workflow', '2026-03'), 'journal-workflow');
    assert.equal(getMonthlyCloseCheckKey('annual-inventory-review', '2026'), 'annual-inventory-review');
    assert.throws(() => getMonthlyCloseCheckKey('annual-inventory-review', '2026-03'), /contrôle de clôture demandé est invalide/);
    assert.throws(() => getMonthlyCloseCheckKey('invented-check', '2026'), /contrôle de clôture demandé est invalide/);
    assert.equal(ANNUAL_CLOSE_CHECKS.length, 7);
  });

  it('requires explicit status and an auditable note', () => {
    assert.deepEqual(validateMonthlyCloseUpdate({ checked: true, note: 'Rapprochement vérifié' }), {
      checked: true,
      note: 'Rapprochement vérifié',
    });
    assert.throws(() => validateMonthlyCloseUpdate({ checked: 'true', note: 'validé' }), /checked doit être booléen/);
    assert.throws(() => validateMonthlyCloseUpdate({ checked: false, note: 'non' }), /note de contrôle de 5 à 500 caractères/);
  });

  it('requires a bounded audit note before a period lock', () => {
    assert.equal(validateCloseLockNote('Clôture vérifiée.'), 'Clôture vérifiée.');
    assert.throws(() => validateCloseLockNote('no'), /note de clôture de 5 à 500 caractères/);
    assert.throws(() => validateCloseLockNote('x'.repeat(501)), /note de clôture de 5 à 500 caractères/);
  });
});
