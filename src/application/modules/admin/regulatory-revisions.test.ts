import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertRevisionPeriodDoesNotOverlap,
  getSupersededRevisionEndDate,
  RegulatoryRevisionValidationError,
  validateRegulatoryRevisionInput,
  validateRevisionTransition,
} from './regulatory-revisions';

describe('country regulatory revision metadata', () => {
  it('accepts explicit jurisdiction configuration type, dates and source without accepting caller status', () => {
    const revision = validateRegulatoryRevisionInput({
      configType: 'PAYROLL',
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-12-31',
      source: 'Official gazette reference 2026',
      retroactiveConfirmed: true,
    });
    assert.equal(revision.configType, 'PAYROLL');
    assert.equal(revision.effectiveFrom.toISOString(), '2026-01-01T00:00:00.000Z');
    assert.equal(revision.effectiveTo?.toISOString(), '2026-12-31T00:00:00.000Z');
    assert.throws(
      () => validateRegulatoryRevisionInput({
        configType: 'PAYROLL',
        effectiveFrom: '2026-01-01',
        source: 'Official source',
        status: 'APPROVED',
      }),
      RegulatoryRevisionValidationError,
    );
  });

  it('rejects invalid calendar dates, reversed effect ranges and missing source', () => {
    assert.throws(() => validateRegulatoryRevisionInput({
      configType: 'TAX', effectiveFrom: '2026-02-30', source: 'Source',
    }), /date réelle/);
    assert.throws(() => validateRegulatoryRevisionInput({
      configType: 'TAX', effectiveFrom: '2026-04-01', effectiveTo: '2026-03-31', source: 'Source',
    }), /précéder/);
    assert.throws(() => validateRegulatoryRevisionInput({
      configType: 'TAX', effectiveFrom: '2026-01-01', source: ' ',
    }), /source réglementaire est obligatoire/);
  });

  it('requires explicit confirmation and a closure note when creating a replacement', () => {
    const base = {
      configType: 'TAX',
      effectiveFrom: '2026-01-01',
      source: 'Official gazette reference',
      supersedesRevisionId: 'revision-1',
      closureNote: 'Application de la nouvelle règle officielle',
    };
    assert.throws(() => validateRegulatoryRevisionInput(base), /confirmation explicite/);
    const replacement = validateRegulatoryRevisionInput({ ...base, retroactiveConfirmed: true });
    assert.equal(replacement.supersedesRevisionId, 'revision-1');
    assert.equal(replacement.closureNote, 'Application de la nouvelle règle officielle');
  });

  it('rejects inclusive overlaps but allows non-overlapping periods and rejected revisions', () => {
    const existing = [{
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: new Date('2026-12-31T00:00:00.000Z'),
      status: 'APPROVED',
    }];
    assert.throws(() => assertRevisionPeriodDoesNotOverlap({
      effectiveFrom: new Date('2026-12-31T00:00:00.000Z'),
      effectiveTo: null,
    }, existing), /chevauche/);
    assert.doesNotThrow(() => assertRevisionPeriodDoesNotOverlap({
      effectiveFrom: new Date('2027-01-01T00:00:00.000Z'),
      effectiveTo: null,
    }, existing));
    assert.doesNotThrow(() => assertRevisionPeriodDoesNotOverlap({
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
    }, [{ ...existing[0], status: 'REJECTED' }]));
  });

  it('closes a superseded period the day before its successor and rejects invalid replacements', () => {
    const current = {
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
      status: 'APPROVED',
    };
    assert.equal(
      getSupersededRevisionEndDate(current, new Date('2027-01-01T00:00:00.000Z')).toISOString(),
      '2026-12-31T00:00:00.000Z',
    );
    assert.throws(
      () => getSupersededRevisionEndDate(current, new Date('2025-12-31T00:00:00.000Z')),
      /doit suivre/,
    );
    assert.throws(
      () => getSupersededRevisionEndDate({ ...current, status: 'REJECTED' }, new Date('2027-01-01T00:00:00.000Z')),
      /rejetée/,
    );
  });

  it('enforces explicit review workflow transitions and reviewer notes', () => {
    assert.deepEqual(validateRevisionTransition('IN_REVIEW', 'REVIEWED', 'admin', 'Source contrôlée'), {
      status: 'REVIEWED',
      reviewer: 'admin',
      reviewNote: 'Source contrôlée',
    });
    assert.throws(() => validateRevisionTransition('DRAFT', 'APPROVED', 'admin', 'OK'), /Transition.*interdite/);
    assert.throws(() => validateRevisionTransition('REVIEWED', 'APPROVED', ' ', 'Validé'), /identité/);
    assert.throws(
      () => validateRevisionTransition('REVIEWED', 'APPROVED', 'reviewer', 'Validé', 'author', 'reviewer'),
      /revue et l’approbation/,
    );
    assert.throws(
      () => validateRevisionTransition('REVIEWED', 'APPROVED', 'approver', 'Validé', 'author'),
      /réviseur distinct doit être enregistré/,
    );
    assert.throws(
      () => validateRevisionTransition('IN_REVIEW', 'REVIEWED', 'Admin', 'Source contrôlée', 'admin'),
      /deux utilisateurs distincts/,
    );
    assert.doesNotThrow(
      () => validateRevisionTransition('IN_REVIEW', 'REVIEWED', 'reviewer', 'Source contrôlée', 'admin'),
    );
    assert.doesNotThrow(
      () => validateRevisionTransition('REVIEWED', 'APPROVED', 'approver', 'Validation interne', 'author', 'reviewer'),
    );
  });
});
