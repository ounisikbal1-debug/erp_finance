import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergePayrollRubriquesForCountry, normalizePayrollCountryCode } from './country-payroll-rubriques';

const rubric = (id: string, code: string) => ({
  id,
  code,
  label: code,
  category: 'PRIME' as const,
  defaultAmount: 0,
});

describe('country-scoped payroll rubriques', () => {
  it('keeps legacy global rubriques available only for Tunisia', () => {
    assert.deepEqual(
      mergePayrollRubriquesForCountry('TN', [rubric('tn-1', 'TN_CUSTOM')], [rubric('legacy', 'OLD')])
        .map((item) => item.id),
      ['legacy', 'tn-1'],
    );
    assert.deepEqual(
      mergePayrollRubriquesForCountry('FR', [rubric('fr-1', 'FR_CUSTOM')], [rubric('legacy', 'OLD')])
        .map((item) => item.id),
      ['fr-1'],
    );
  });

  it('lets explicit country configuration replace same-code legacy presentation without changing legacy storage', () => {
    const merged = mergePayrollRubriquesForCountry('TN', [rubric('tn-new', 'PRIME')], [rubric('legacy', 'PRIME')]);
    assert.deepEqual(merged.map((item) => item.id), ['tn-new']);
  });

  it('normalizes and validates explicit country codes', () => {
    assert.equal(normalizePayrollCountryCode(' fr '), 'FR');
    assert.throws(() => normalizePayrollCountryCode(''), /code pays est obligatoire/);
    assert.throws(() => normalizePayrollCountryCode('FRA-NCE'));
  });
});
