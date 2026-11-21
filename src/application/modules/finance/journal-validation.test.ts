import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateJournalEntry } from './journal-validation';

const validEntry = {
  entryNumber: 'JE-001',
  entityId: 'TN01',
  description: 'Vente',
  lines: [
    { accountCode: '411', debit: 119, credit: 0 },
    { accountCode: '707', debit: 0, credit: 100 },
    { accountCode: '4367', debit: 0, credit: 19 },
  ],
};

describe('validateJournalEntry', () => {
  it('accepts a balanced entry and trims account codes', () => {
    const result = validateJournalEntry({
      ...validEntry,
      date: '2026-10-31',
      lines: [{ ...validEntry.lines[0], accountCode: ' 411 ' }, ...validEntry.lines.slice(1)],
    });
    assert.equal(result.lines[0].accountCode, '411');
    assert.equal(result.date, '2026-10-31');
  });

  it('rejects empty or single-line entries', () => {
    assert.throws(() => validateJournalEntry({ ...validEntry, lines: [] }), /au moins deux lignes/);
    assert.throws(() => validateJournalEntry({ ...validEntry, lines: [validEntry.lines[0]] }), /au moins deux lignes/);
  });

  it('rejects unbalanced entries', () => {
    assert.throws(() => validateJournalEntry({
      ...validEntry,
      lines: [{ ...validEntry.lines[0], debit: 120 }, ...validEntry.lines.slice(1)],
    }), /déséquilibrée/);
  });

  it('requires balanced totals at millime precision and rejects sub-millime values', () => {
    assert.throws(() => validateJournalEntry({
      ...validEntry,
      lines: [
        { accountCode: '411', debit: 119.001, credit: 0 },
        ...validEntry.lines.slice(1),
      ],
    }), /déséquilibrée/);
    assert.throws(() => validateJournalEntry({
      ...validEntry,
      lines: [
        { accountCode: '411', debit: 119.0004, credit: 0 },
        ...validEntry.lines.slice(1),
      ],
    }), /millime près/);
  });

  it('rejects negative, non-finite, zero, and two-sided lines', () => {
    for (const invalidLine of [
      { accountCode: '411', debit: -1, credit: 1 },
      { accountCode: '411', debit: Number.NaN, credit: 0 },
      { accountCode: '411', debit: 0, credit: 0 },
      { accountCode: '411', debit: 1, credit: 1 },
    ]) {
      assert.throws(() => validateJournalEntry({
        ...validEntry,
        lines: [invalidLine, ...validEntry.lines.slice(1)],
      }));
    }
  });

  it('rejects entries without required headers or account codes', () => {
    assert.throws(() => validateJournalEntry({ ...validEntry, entryNumber: ' ' }), /obligatoires/);
    assert.throws(() => validateJournalEntry({
      ...validEntry,
      lines: [{ ...validEntry.lines[0], accountCode: ' ' }, ...validEntry.lines.slice(1)],
    }), /compte comptable est obligatoire/);
  });

  it('rejects malformed or impossible journal dates', () => {
    assert.throws(() => validateJournalEntry({ ...validEntry, date: '31/10/2026' }), /format AAAA-MM-JJ/);
    assert.throws(() => validateJournalEntry({ ...validEntry, date: '2026-02-30' }), /date de l’écriture est invalide/);
  });
});
