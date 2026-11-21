import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectImportRowIssues } from './import-preview-validation';

describe('collectImportRowIssues', () => {
  it('validates every row and reports each issue with its source line number', () => {
    const rows = [
      { code: 'A', name: 'Premier' },
      { code: '', name: 'Incomplet' },
      { code: 'C', name: '' },
    ];
    const validatedRows: number[] = [];

    const issues = collectImportRowIssues(rows, (row, rowIndex) => {
      validatedRows.push(rowIndex);
      if (!row.code) return 'Code requis.';
      if (!row.name) return 'Nom requis.';
      return null;
    });

    assert.deepEqual(validatedRows, [0, 1, 2]);
    assert.deepEqual(issues, [
      { rowIndex: 1, lineNumber: 3, message: 'Code requis.' },
      { rowIndex: 2, lineNumber: 4, message: 'Nom requis.' },
    ]);
  });

  it('returns no issues when every row is valid', () => {
    assert.deepEqual(collectImportRowIssues([{ code: 'A' }], () => null), []);
  });
});
