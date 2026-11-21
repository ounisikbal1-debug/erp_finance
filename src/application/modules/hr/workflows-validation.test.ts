import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HrRequestError } from './errors';
import {
  validateEmployeeDocumentArchiveNote,
  validateEmployeeDocumentInput,
  validateEmployeeDocumentUpdate,
} from './employee-documents';
import { validateExpenseClaimInput } from './expense-claims';
import { validateInterviewSchedule } from './interviews';
import {
  validateCandidateApplicationInput,
  validateRecruitmentPositionInput,
} from './recruitment';

function expectBadRequest(operation: () => unknown) {
  assert.throws(operation, (error: unknown) => error instanceof HrRequestError && error.statusCode === 400);
}

describe('HR workflow validation', () => {
  it('accepts employee document metadata only and validates date ranges', () => {
    assert.deepEqual(validateEmployeeDocumentInput({
      employeeId: ' employee-1 ',
      category: 'CONTRACT',
      title: ' Contrat à durée déterminée ',
      validFrom: '2026-01-01',
      validUntil: '2026-12-31',
    }), {
      employeeId: 'employee-1',
      category: 'CONTRACT',
      title: 'Contrat à durée déterminée',
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
      validUntil: new Date('2026-12-31T00:00:00.000Z'),
    });
    expectBadRequest(() => validateEmployeeDocumentInput({
      employeeId: 'employee-1', category: 'CONTRACT', title: 'Contrat', fileData: 'base64',
    }));
    expectBadRequest(() => validateEmployeeDocumentInput({
      employeeId: 'employee-1', category: 'CONTRACT', title: 'Contrat', storagePath: 'C:\\private\\contract.pdf',
    }));
    expectBadRequest(() => validateEmployeeDocumentInput({
      employeeId: 'employee-1', category: 'CONTRACT', title: 'C:\\private\\contract.pdf',
    }));
    expectBadRequest(() => validateEmployeeDocumentInput({
      employeeId: 'employee-1', category: 'CONTRACT', title: 'Contrat', validFrom: '2026-02-30',
    }));
    expectBadRequest(() => validateEmployeeDocumentInput({
      employeeId: 'employee-1', category: 'CONTRACT', title: 'Contrat',
      validFrom: '2026-12-31', validUntil: '2026-01-01',
    }));
    expectBadRequest(() => validateEmployeeDocumentArchiveNote('no'));
    assert.equal(validateEmployeeDocumentArchiveNote('Fin du contrat'), 'Fin du contrat');
    assert.deepEqual(validateEmployeeDocumentUpdate({
      category: 'CERTIFICATE',
      title: 'Attestation corrigée',
      validFrom: '2026-02-01',
      validUntil: null,
      reason: 'Correction de la période de validité',
    }), {
      category: 'CERTIFICATE',
      title: 'Attestation corrigée',
      validFrom: new Date('2026-02-01T00:00:00.000Z'),
      validUntil: null,
      reason: 'Correction de la période de validité',
    });
    expectBadRequest(() => validateEmployeeDocumentUpdate({
      category: 'OTHER', title: 'Contrat', reason: 'Motif de correction', storagePath: 'C:\\private\\document.pdf',
    }));
    expectBadRequest(() => validateEmployeeDocumentUpdate({
      category: 'OTHER', title: 'Contrat', reason: 'x',
    }));
  });

  it('validates recruitment fields and refuses applicant files and free-form notes', () => {
    assert.deepEqual(validateRecruitmentPositionInput({ title: 'Analyste RH' }), { title: 'Analyste RH' });
    assert.deepEqual(validateCandidateApplicationInput({
      positionId: 'position-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ADA@example.test',
    }), {
      positionId: 'position-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test',
    });
    expectBadRequest(() => validateCandidateApplicationInput({
      positionId: 'position-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test', cv: 'contents',
    }));
    expectBadRequest(() => validateCandidateApplicationInput({
      positionId: 'position-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test', notes: 'free text',
    }));
    expectBadRequest(() => validateCandidateApplicationInput({
      positionId: 'position-1', firstName: 'Ada', lastName: 'Lovelace', email: 'not-an-email',
    }));
  });

  it('requires an explicit timezone and a real calendar date for interviews', () => {
    assert.equal(validateInterviewSchedule('2026-11-06T09:30:00+01:00').toISOString(), '2026-11-06T08:30:00.000Z');
    expectBadRequest(() => validateInterviewSchedule('2026-11-06T09:30'));
    expectBadRequest(() => validateInterviewSchedule('2026-02-30T09:30:00Z'));
    expectBadRequest(() => validateInterviewSchedule('2026-11-06T25:30:00Z'));
  });

  it('validates expense amounts, currencies, dates, and metadata-only requests', () => {
    assert.deepEqual(validateExpenseClaimInput({
      employeeId: 'employee-1',
      category: 'MEALS',
      expenseDate: '2026-11-05',
      amount: 25.125,
      currency: 'tnd',
    }), {
      employeeId: 'employee-1',
      category: 'MEALS',
      expenseDate: new Date('2026-11-05T00:00:00.000Z'),
      amount: 25.125,
      currency: 'TND',
    });
    expectBadRequest(() => validateExpenseClaimInput({
      employeeId: 'employee-1', category: 'MEALS', expenseDate: '2026-11-05', amount: 25.1234, currency: 'TND',
    }));
    expectBadRequest(() => validateExpenseClaimInput({
      employeeId: 'employee-1', category: 'MEALS', expenseDate: '2026-11-05', amount: 0, currency: 'TND',
    }));
    expectBadRequest(() => validateExpenseClaimInput({
      employeeId: 'employee-1', category: 'MEALS', expenseDate: '2026-02-30', amount: 25, currency: 'TND',
    }));
    expectBadRequest(() => validateExpenseClaimInput({
      employeeId: 'employee-1', category: 'MEALS', expenseDate: '2026-11-05', amount: 25, currency: 'TND',
      receipt: 'receipt.pdf',
    }));
  });
});
