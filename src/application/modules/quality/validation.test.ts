import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { QualityRequestError } from './errors';
import {
  assertQualityActionTransition,
  assertQualityFindingTransition,
  hasVerifiedQualityActions,
  isQualityActionOverdue,
  isQualityFindingOverdue,
  validateQualityActionInput,
  validateQualityActionUpdate,
  validateQualityIssueInput,
  validateQualityIssueUpdate,
} from './validation';

describe('quality/CAPA validation', () => {
  it('normalizes a nonconformity and retains optional investigation fields', () => {
    const issue = validateQualityIssueInput({
      title: '  Lot hors tolérance ',
      description: 'Mesure confirmée sur le contrôle final.',
      source: 'PRODUCTION',
      severity: 'HIGH',
      equipmentId: 'equipment-1',
      detectedAt: '2026-11-05T09:00:00.000Z',
      dueAt: '2026-11-12T09:00:00.000Z',
      owner: 'Responsable qualité',
      rootCause: 'Réglage machine incorrect.',
      containmentAction: 'Lot isolé.',
    });
    assert.deepEqual(issue, {
      title: 'Lot hors tolérance',
      description: 'Mesure confirmée sur le contrôle final.',
      source: 'PRODUCTION',
      severity: 'HIGH',
      equipmentId: 'equipment-1',
      detectedAt: new Date('2026-11-05T09:00:00.000Z'),
      dueAt: new Date('2026-11-12T09:00:00.000Z'),
      owner: 'Responsable qualité',
      rootCause: 'Réglage machine incorrect.',
      containmentAction: 'Lot isolé.',
    });
  });

  it('rejects invalid required fields, enums, dates, and reversed deadlines', () => {
    const base = {
      title: 'Non-conformité',
      description: 'Description',
      source: 'OTHER',
      severity: 'LOW',
      detectedAt: '2026-11-05T09:00:00.000Z',
      owner: 'Responsable',
    };
    for (const input of [
      { ...base, title: ' ' },
      { ...base, severity: 'URGENT' },
      { ...base, detectedAt: 'invalid' },
      { ...base, detectedAt: '2026-02-30T09:00:00.000Z' },
      { ...base, dueAt: '2026-11-04T09:00:00.000Z' },
    ]) {
      assert.throws(() => validateQualityIssueInput(input), QualityRequestError);
    }
    assert.throws(() => validateQualityIssueInput({ ...base, source: 'EQUIPMENT' }), QualityRequestError);
  });

  it('allows only non-empty, explicitly supported issue updates', () => {
    assert.deepEqual(validateQualityIssueUpdate({
      status: 'VERIFYING',
      rootCause: null,
      closureNotes: 'Contrôle indépendant satisfaisant.',
      dueAt: null,
    }), {
      status: 'VERIFYING',
      rootCause: null,
      closureNotes: 'Contrôle indépendant satisfaisant.',
      dueAt: null,
    });
    assert.throws(() => validateQualityIssueUpdate({ unexpected: 'value' }), QualityRequestError);
    assert.throws(() => validateQualityIssueUpdate({ status: 'DONE' }), QualityRequestError);
    assert.throws(() => validateQualityIssueUpdate({}), QualityRequestError);
  });

  it('validates corrective/preventive actions and verification updates', () => {
    assert.deepEqual(validateQualityActionInput({
      type: 'PREVENTIVE',
      description: 'Ajouter un contrôle au démarrage.',
      owner: 'Chef de production',
      dueAt: '2026-11-15T12:00:00.000Z',
    }), {
      type: 'PREVENTIVE',
      description: 'Ajouter un contrôle au démarrage.',
      owner: 'Chef de production',
      dueAt: new Date('2026-11-15T12:00:00.000Z'),
    });
    assert.deepEqual(validateQualityActionUpdate({
      status: 'COMPLETED',
      verificationNotes: 'Efficacité vérifiée sur trois lots.',
    }), {
      status: 'COMPLETED',
      verificationNotes: 'Efficacité vérifiée sur trois lots.',
    });
    assert.throws(() => validateQualityActionInput({
      type: 'UNKNOWN',
      description: 'Action',
      owner: 'Responsable',
      dueAt: '2026-11-15T12:00:00.000Z',
    }), QualityRequestError);
    assert.throws(() => validateQualityActionInput({
      type: 'PREVENTIVE',
      description: 'Action',
      owner: 'Responsable',
      dueAt: '2026-02-30T12:00:00.000Z',
    }), QualityRequestError);
    assert.throws(() => validateQualityActionUpdate({ status: 'CLOSED' }), QualityRequestError);
  });

  it('enforces CAPA status progression and evidence-based closure', () => {
    assert.throws(() => assertQualityFindingTransition('VERIFYING', 'CLOSED', { actions: [] }), QualityRequestError);
    assert.throws(
      () => assertQualityFindingTransition('OPEN', 'ACTION_REQUIRED', { actions: [] }),
      (error: unknown) => error instanceof QualityRequestError && error.message.includes('Transition de statut'),
    );
    assert.throws(() => assertQualityFindingTransition('ACTION_REQUIRED', 'VERIFYING', {
      actions: [{ status: 'IN_PROGRESS', verificationNotes: null }],
    }), QualityRequestError);
    assert.equal(hasVerifiedQualityActions([
      { status: 'COMPLETED', verificationNotes: 'Contrôle positif.' },
    ]), true);
    assert.throws(() => assertQualityFindingTransition('VERIFYING', 'CLOSED', {
      rootCause: 'Cause identifiée',
      closureNotes: 'Contrôle réussi',
      actions: [{ status: 'COMPLETED' }],
    }), QualityRequestError);
    assert.doesNotThrow(() => assertQualityFindingTransition('VERIFYING', 'CLOSED', {
      rootCause: 'Cause identifiée',
      closureNotes: 'Contrôle réussi',
      actions: [{ status: 'COMPLETED', verificationNotes: 'Trois lots conformes.' }],
    }));
    assert.throws(() => assertQualityActionTransition('IN_PROGRESS', 'COMPLETED'), QualityRequestError);
    assert.doesNotThrow(() => assertQualityActionTransition('IN_PROGRESS', 'COMPLETED', 'Mesure vérifiée.'));
  });

  it('flags only active findings and CAPA actions whose deadlines have passed', () => {
    const asOf = new Date('2026-11-12T09:00:00.000Z');
    const overdue = '2026-11-12T08:59:59.999Z';
    const dueNow = '2026-11-12T09:00:00.000Z';

    assert.equal(isQualityFindingOverdue({ dueAt: overdue, status: 'ACTION_REQUIRED' }, asOf), true);
    assert.equal(isQualityFindingOverdue({ dueAt: dueNow, status: 'OPEN' }, asOf), false);
    assert.equal(isQualityFindingOverdue({ dueAt: overdue, status: 'CLOSED' }, asOf), false);
    assert.equal(isQualityFindingOverdue({ dueAt: null, status: 'OPEN' }, asOf), false);
    assert.equal(isQualityActionOverdue({ dueAt: overdue, status: 'IN_PROGRESS' }, asOf), true);
    assert.equal(isQualityActionOverdue({ dueAt: overdue, status: 'COMPLETED' }, asOf), false);
    assert.equal(isQualityActionOverdue({ dueAt: 'invalid', status: 'OPEN' }, asOf), false);
  });
});
