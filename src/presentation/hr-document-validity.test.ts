import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterEmployeeDocuments,
  formatEmployeeDocumentDate,
  getEmployeeDocumentValidity,
  getLocalCalendarDate,
} from './hr-document-validity';

describe('employee document validity', () => {
  it('classifies expiration using calendar days and keeps the 30-day boundary inclusive', () => {
    const today = '2026-03-01';
    assert.equal(getEmployeeDocumentValidity({ status: 'ACTIVE', validUntil: '2026-02-28' }, today), 'EXPIRED');
    assert.equal(getEmployeeDocumentValidity({ status: 'ACTIVE', validUntil: today }, today), 'RENEW_SOON');
    assert.equal(getEmployeeDocumentValidity({ status: 'ACTIVE', validUntil: '2026-03-31' }, today), 'RENEW_SOON');
    assert.equal(getEmployeeDocumentValidity({ status: 'ACTIVE', validUntil: '2026-04-01' }, today), 'VALID');
    assert.equal(getEmployeeDocumentValidity({ status: 'ACTIVE', validUntil: null }, today), 'NO_EXPIRY');
    assert.equal(getEmployeeDocumentValidity({ status: 'ARCHIVED', validUntil: '2026-02-28' }, today), 'ARCHIVED');
  });

  it('filters by validity and searches the employee, category, and document title', () => {
    const documents = [
      {
        id: 'expired', status: 'ACTIVE', validUntil: '2026-01-01', title: 'Contrat ancien', category: 'CONTRACT',
        employee: { empId: 'E-1', firstName: 'Aïcha', lastName: 'Ben Ali' },
      },
      {
        id: 'upcoming', status: 'ACTIVE', validUntil: '2026-01-20', title: 'Permis', category: 'CERTIFICATE',
        employee: { empId: 'E-2', firstName: 'Sami', lastName: 'Khan' },
      },
      {
        id: 'archived', status: 'ARCHIVED', validUntil: null, title: 'Ancien dossier', category: 'OTHER',
        employee: { empId: 'E-3', firstName: 'Nour', lastName: 'Saidi' },
      },
    ];

    assert.deepEqual(
      filterEmployeeDocuments(documents, 'EXPIRED', 'aïcha', '2026-01-10').map(({ id }) => id),
      ['expired'],
    );
    assert.deepEqual(
      filterEmployeeDocuments(documents, 'RENEW_SOON', 'certif', '2026-01-10').map(({ id }) => id),
      ['upcoming'],
    );
    assert.deepEqual(
      filterEmployeeDocuments(documents, 'ARCHIVED', 'nour', '2026-01-10').map(({ id }) => id),
      ['archived'],
    );
  });

  it('rejects invalid reference and expiration dates instead of silently classifying them', () => {
    assert.throws(() => getEmployeeDocumentValidity({ status: 'ACTIVE', validUntil: null }, '2026-02-30'));
    assert.throws(() => getEmployeeDocumentValidity({ status: 'ACTIVE', validUntil: '2026-02-30' }, '2026-02-01'));
  });

  it('uses the local calendar day for today and renders date-only values without timezone shifts', () => {
    assert.equal(getLocalCalendarDate(new Date(2026, 2, 1, 0, 30)), '2026-03-01');
    assert.equal(formatEmployeeDocumentDate('2026-03-01T00:00:00.000Z'), '01/03/2026');
    assert.equal(formatEmployeeDocumentDate(null), '—');
    assert.throws(() => getLocalCalendarDate(new Date(Number.NaN)));
    assert.throws(() => formatEmployeeDocumentDate('2026-02-30'));
  });
});
