import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCashflowReport, type CashJournalLine } from './report';

const startAt = new Date('2026-03-01T00:00:00.000Z');
const endExclusive = new Date('2026-04-01T00:00:00.000Z');
const entity = { name: 'SAFE FR', countryCode: 'FR', currencyCode: 'EUR' };
const accounts = [
  { code: '5121', description: 'Bank', type: 'Asset' },
  { code: '531', description: 'Cash', type: 'Asset' },
  { code: '401', description: 'Suppliers', type: 'Liability' },
];

function line(
  id: string,
  date: string,
  accountCode: string,
  debit: number,
  credit: number,
): CashJournalLine {
  return {
    id,
    accountCode,
    debit,
    credit,
    description: null,
    journalEntry: {
      entryNumber: `JE-${id}`,
      date: new Date(date),
      reference: null,
      description: `Entry ${id}`,
    },
  };
}

describe('buildCashflowReport', () => {
  it('reports mapped posted-ledger opening, period movements and closing balance', () => {
    const report = buildCashflowReport({
      entity,
      period: '2026-03',
      startAt,
      endExclusive,
      accounts,
      mappedAccountCodes: ['5121'],
      journalLines: [
        line('opening-in', '2026-02-20T00:00:00.000Z', '5121', 1000, 0),
        line('opening-out', '2026-02-21T00:00:00.000Z', '5121', 0, 250),
        line('inflow', '2026-03-05T00:00:00.000Z', '5121', 500, 0),
        line('outflow', '2026-03-06T00:00:00.000Z', '5121', 0, 125),
        line('unmapped', '2026-03-07T00:00:00.000Z', '531', 900, 0),
      ],
    });

    assert.equal(report.entity.currencyCode, 'EUR');
    assert.deepEqual(report.totals, {
      openingBalance: 750,
      inflows: 500,
      outflows: 125,
      closingBalance: 1125,
    });
    assert.equal(report.transactions.length, 2);
    assert.equal(report.transactions[1].balance, 1125);
    assert.equal(report.diagnostics.postedJournalLineCount, 4);
    assert.equal(report.diagnostics.totalsAvailable, true);
    assert.deepEqual(report.accounts.map((account) => account.code), ['5121', '531']);
    assert.equal(report.accounts[0].selected, true);
  });

  it('withholds partial totals when mapped ledger lines are invalid or the mapping is stale', () => {
    const invalidLine = line('bad', '2026-03-03T00:00:00.000Z', '5121', 1.0005, 0);
    const invalidAmount = buildCashflowReport({
      entity,
      period: '2026-03',
      startAt,
      endExclusive,
      accounts,
      mappedAccountCodes: ['5121'],
      journalLines: [invalidLine],
    });
    assert.equal(invalidAmount.totals.closingBalance, null);
    assert.equal(invalidAmount.diagnostics.invalidJournalLineCount, 1);

    const staleMapping = buildCashflowReport({
      entity,
      period: '2026-03',
      startAt,
      endExclusive,
      accounts,
      mappedAccountCodes: ['9999'],
      journalLines: [],
    });
    assert.equal(staleMapping.totals.closingBalance, null);
    assert.deepEqual(staleMapping.diagnostics.invalidMappedAccountCodes, ['9999']);
  });

  it('does not present a balance until at least one asset account is mapped', () => {
    const report = buildCashflowReport({
      entity,
      period: '2026-03',
      startAt,
      endExclusive,
      accounts,
      mappedAccountCodes: [],
      journalLines: [],
    });
    assert.equal(report.totals.openingBalance, null);
    assert.equal(report.diagnostics.totalsAvailable, false);
  });
});
