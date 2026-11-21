import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertApprovedDryRun,
  buildTableImportPlan,
  type SourceTable,
  type TargetTable,
} from './import-sqlite-to-postgresql';

function sourceTable(name: string, dependencies: string[] = []): SourceTable {
  return {
    name,
    rowCount: 1,
    columns: [{ name: 'id' }],
    dependencies,
  };
}

function targetTable(name: string, columns = [{ name: 'id', data_type: 'text', is_nullable: 'NO' as const, column_default: null }]): TargetTable {
  return { name, rowCount: 0, columns };
}

describe('SQLite to PostgreSQL import planning', () => {
  it('orders parent tables before dependent tables', () => {
    const plan = buildTableImportPlan(
      [sourceTable('Child', ['Parent']), sourceTable('Parent')],
      [targetTable('Parent'), targetTable('Child')],
    );
    assert.deepEqual(plan.map((table) => table.name), ['Parent', 'Child']);
  });

  it('keeps cyclic tables in the plan for deferred PostgreSQL constraints', () => {
    const plan = buildTableImportPlan(
      [sourceTable('First', ['Second']), sourceTable('Second', ['First'])],
      [targetTable('First'), targetTable('Second')],
    );
    assert.deepEqual(plan.map((table) => table.name), ['First', 'Second']);
  });

  it('imports close locks after journal entries so PostgreSQL lock triggers do not reject historical rows', () => {
    const plan = buildTableImportPlan(
      [sourceTable('MonthlyCloseLock'), sourceTable('JournalEntry')],
      [targetTable('MonthlyCloseLock'), targetTable('JournalEntry')],
    );
    assert.deepEqual(plan.map((table) => table.name), ['JournalEntry', 'MonthlyCloseLock']);
  });

  it('reports source columns missing from the target', () => {
    assert.throws(
      () => buildTableImportPlan(
        [{ ...sourceTable('Entity'), columns: [{ name: 'obsoleteColumn' }] }],
        [targetTable('Entity')],
      ),
      /La colonne SQLite "Entity"\."obsoleteColumn" n’existe pas/,
    );
  });

  it('rejects new required target columns without source values or defaults', () => {
    assert.throws(
      () => buildTableImportPlan(
        [sourceTable('Entity')],
        [targetTable('Entity', [
          { name: 'id', data_type: 'text', is_nullable: 'NO', column_default: null },
          { name: 'requiredValue', data_type: 'text', is_nullable: 'NO', column_default: null },
        ])],
      ),
      /La colonne PostgreSQL requise "Entity"\."requiredValue" est absente/,
    );
  });

  it('requires an approved dry-run for the exact source, target, schema and plan', () => {
    const expected = {
      sourceSha256: 'source',
      targetFingerprint: 'target',
      planFingerprint: 'plan',
      migrationStatusFingerprint: 'migrations',
      migrationSetFingerprint: 'migration-files',
    };
    const approved = {
      mode: 'dry-run',
      status: 'dry-run-valid',
      ...expected,
    };
    assert.doesNotThrow(() => assertApprovedDryRun(approved, expected));
    assert.throws(
      () => assertApprovedDryRun(approved, { ...expected, targetFingerprint: 'different-target' }),
      /ne correspond pas/,
    );
    assert.throws(
      () => assertApprovedDryRun({ ...approved, status: 'imported' }, expected),
      /ne correspond pas/,
    );
  });
});
