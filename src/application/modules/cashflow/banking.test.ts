import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseBankStatementCsv, toMillimes } from './banking';
import { CashflowRequestError } from './errors';

describe('parseBankStatementCsv', () => {
  it('parses quoted descriptions, optional references, signed amounts, and reordered headers', () => {
    const lines = parseBankStatementCsv(
      '\uFEFFreference,amount,description,date,balance\r\nR-1,125.375,"Virement, client ""A""",2026-03-04,500.125\r\n,-12.5,"Frais bancaires",2026-03-05,487.625\r\n',
    );
    assert.equal(lines.length, 2);
    assert.deepEqual(lines[0], {
      rowNumber: 2,
      transactionDate: new Date('2026-03-04T00:00:00.000Z'),
      description: 'Virement, client "A"',
      amount: 125.375,
      amountMillimes: 125375,
      balanceAfter: 500.125,
      balanceAfterMillimes: 500125,
      externalReference: 'R-1',
    });
    assert.equal(lines[1].amountMillimes, -12500);
    assert.equal(lines[1].balanceAfter, 487.625);
    assert.equal(lines[1].externalReference, null);
  });

  it('rejects malformed, ambiguous, or excessive input without partial parsing', () => {
    const invalidFiles = [
      'date,description,amount\n2026-02-30,Versement,1.000',
      'date,description,amount\n2026-03-01,Versement,1.0000',
      'date,description,amount\n2026-03-01,"Libellé,1.000',
      'date,description,amount\n2026-03-01,Lib"ellé,1.000',
      'date,description,amount,unknown\n2026-03-01,Versement,1.000,x',
      'date,description,amount\n2026-03-01,Versement,1,000',
      'date,description,amount\n2026-03-01,Versement,0',
      'date,description,amount\n2026-03-01,Versement,999999999999999999999999999999999999999999999999999999999999',
    ];
    for (const csv of invalidFiles) {
      assert.throws(() => parseBankStatementCsv(csv), CashflowRequestError);
    }
  });

  it('converts only finite millime-precise values', () => {
    assert.equal(toMillimes(-17.325), -17325);
    assert.equal(toMillimes(1.0001), null);
    assert.equal(toMillimes(Number.POSITIVE_INFINITY), null);
  });
});
