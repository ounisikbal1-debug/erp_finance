import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  validateTenderCautionUpdate,
  validateTenderCautionInput,
  validateTenderDocumentInput,
  validateTenderDocumentUpdate,
  validateTenderInput,
  validateTenderStatus,
} from './validation';
import { summarizeTenderOutcomes } from './outcomes';

describe('public tender validation', () => {
  it('accepts tender references, optional portal references, and valid submission dates', () => {
    assert.deepEqual(validateTenderInput({
      tenderReference: ' AO-2026-01 ',
      title: 'Réhabilitation',
      contractingAuthority: 'Administration',
      portalReference: 'WEB-1',
      submissionDeadline: '2026-12-01',
    }), {
      tenderReference: 'AO-2026-01',
      title: 'Réhabilitation',
      contractingAuthority: 'Administration',
      portalReference: 'WEB-1',
      submissionDeadline: new Date('2026-12-01T00:00:00.000Z'),
    });
    assert.throws(() => validateTenderInput({
      tenderReference: 'AO-2',
      title: 'Projet',
      contractingAuthority: 'Administration',
      submissionDeadline: '2026-02-30',
    }), /invalide/);
  });

  it('keeps document checklist names and required status configurable', () => {
    assert.deepEqual(validateTenderDocumentInput({ title: 'Pièce configurée', isRequired: false }), {
      title: 'Pièce configurée',
      isRequired: false,
      status: 'MISSING',
      reference: null,
      validUntil: null,
    });
    assert.throws(() => validateTenderDocumentInput({ title: 'Document', status: 'OFFICIAL' }), /statut/);
    assert.deepEqual(validateTenderDocumentUpdate({ status: 'READY', reference: 'DOC-1' }), {
      status: 'READY',
      reference: 'DOC-1',
      validUntil: undefined,
    });
    assert.throws(() => validateTenderDocumentUpdate({ status: 'APPROVED' }), /statut/);
  });

  it('validates manually recorded caution amounts and status without calculating percentages', () => {
    assert.deepEqual(validateTenderCautionInput({
      kind: 'PROVISIONAL',
      amount: 1250,
      currencyCode: 'tnd',
      reference: 'BANK-REF',
    }), {
      kind: 'PROVISIONAL',
      amount: 1250,
      currencyCode: 'TND',
      status: 'PLANNED',
      reference: 'BANK-REF',
      issuedAt: null,
      releasedAt: null,
    });
    assert.throws(() => validateTenderCautionInput({
      kind: 'DEFINITIVE',
      amount: -1,
      currencyCode: 'TND',
    }), /supérieur à zéro/);
    assert.throws(() => validateTenderCautionInput({
      kind: 'DEFINITIVE',
      amount: 100,
      currencyCode: 'DINAR',
    }), /trois lettres/);
    assert.equal(validateTenderStatus('SUBMITTED'), 'SUBMITTED');
    assert.throws(() => validateTenderStatus('CANCELLED'), /statut/);
    assert.deepEqual(validateTenderCautionUpdate({
      status: 'RELEASED',
      releasedAt: '2026-12-10',
    }), {
      status: 'RELEASED',
      issuedAt: undefined,
      releasedAt: new Date('2026-12-10T00:00:00.000Z'),
      reference: undefined,
    });
    assert.throws(() => validateTenderCautionUpdate({ status: 'CLOSED' }), /statut/);
  });

  it('summarizes won and lost tenders by authority without scoring', () => {
    assert.deepEqual(summarizeTenderOutcomes([
      { contractingAuthority: 'Ministère A', status: 'WON' },
      { contractingAuthority: 'Ministère A', status: 'LOST' },
      { contractingAuthority: 'Ministère B', status: 'SUBMITTED' },
      { contractingAuthority: 'Ministère A', status: 'WON' },
    ]), [
      { contractingAuthority: 'Ministère A', won: 2, lost: 1 },
    ]);
  });
});
