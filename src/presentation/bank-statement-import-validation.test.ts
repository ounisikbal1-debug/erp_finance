import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeBankStatementDate, validateBankStatementRows } from './bank-statement-import-validation';
import { isBankStatementCurrencyCompatible, parseBankStatementFileText } from './bank-statement-import-formats';

describe('validateBankStatementRows', () => {
  it('reports every invalid field on every row with its source line number', () => {
    const issues = validateBankStatementRows([
      { date: '2026-02-31', description: '', amount: '0', balance: '-1' },
      { date: '2026-03-04', description: 'Versement', amount: '10.000', balance: '10.000' },
      { date: '04/03/2026', description: ' ', amount: '1.0000', balance: 'abc' },
    ]);

    assert.deepEqual(issues, [
      { rowIndex: 0, lineNumber: 2, message: 'Date invalide; utilisez AAAA-MM-JJ.' },
      { rowIndex: 0, lineNumber: 2, message: 'Description manquante.' },
      { rowIndex: 0, lineNumber: 2, message: 'Montant invalide; utilisez un montant signé avec au plus trois décimales.' },
      { rowIndex: 0, lineNumber: 2, message: 'Solde invalide; utilisez un solde positif avec au plus trois décimales.' },
      { rowIndex: 2, lineNumber: 4, message: 'Date invalide; utilisez AAAA-MM-JJ.' },
      { rowIndex: 2, lineNumber: 4, message: 'Description manquante.' },
      { rowIndex: 2, lineNumber: 4, message: 'Montant invalide; utilisez un montant signé avec au plus trois décimales.' },
      { rowIndex: 2, lineNumber: 4, message: 'Solde invalide; utilisez un solde positif avec au plus trois décimales.' },
    ]);
  });

  describe('parseBankStatementFileText', () => {
    it('parses OFX transactions, references, descriptions, signed amounts, and currency', () => {
      const parsed = parseBankStatementFileText('releve.ofx', [
        '<OFX>',
        '<CURDEF>TND',
        '<BANKTRANLIST>',
        '<STMTTRN>',
        '<TRNTYPE>DEBIT',
        '<DTPOSTED>20261112000000[0:GMT]',
        '<TRNAMT>-12.345',
        '<FITID>TXN-1',
        '<NAME>Fournisseur',
        '<MEMO>Virement sortant',
        '<STMTTRN>',
        '<TRNTYPE>CREDIT',
        '<DTPOSTED>20261113000000[0:GMT]',
        '<TRNAMT>30',
        '<FITID>TXN-2',
        '<NAME>Client',
        '</BANKTRANLIST>',
        '</OFX>',
      ].join('\n'));

      assert.equal(parsed.currencyCode, 'TND');
      assert.deepEqual(parsed.rows, [
        { date: '2026-11-12', description: 'Fournisseur — Virement sortant', amount: '-12.345', reference: 'TXN-1', balance: '' },
        { date: '2026-11-13', description: 'Client', amount: '30', reference: 'TXN-2', balance: '' },
      ]);
    });

    it('parses MT940 debit/credit direction and currency without creating accounting entries', () => {
      const parsed = parseBankStatementFileText('releve.mt940', [
        ':20:STATEMENT-1',
        ':60F:C261101TND1000,000',
        ':61:2611021102D12,345NTRFNONREF//REF-1',
        ':86:VIREMENT SORTANT',
        ':61:2611031103C20,000NTRF//REF-2',
        ':86:VERSEMENT CLIENT',
        ':62F:C261103TND1007,655',
      ].join('\n'));

      assert.equal(parsed.currencyCode, 'TND');
      assert.deepEqual(parsed.rows, [
        { date: '2026-11-02', description: 'VIREMENT SORTANT', amount: '-12.345', reference: 'REF-1', balance: '' },
        { date: '2026-11-03', description: 'VERSEMENT CLIENT', amount: '20', reference: 'REF-2', balance: '' },
      ]);
    });

    it('rejects malformed entries and unsupported extensions instead of guessing', () => {
      assert.throws(() => parseBankStatementFileText('unknown.txt', '<OFX><STMTTRN>'), /non pris en charge/);
      assert.throws(() => parseBankStatementFileText('broken.ofx', '<OFX><STMTTRN><TRNAMT>not-a-number'), /Date bancaire invalide/);
      assert.throws(() => parseBankStatementFileText('broken.mt940', ':60F:C261101TND100,000'), /Aucune opération/);
    });

    it('rejects a statement currency that differs from the selected account', () => {
      assert.equal(isBankStatementCurrencyCompatible('TND', 'TND'), true);
      assert.equal(isBankStatementCurrencyCompatible('EUR', 'TND'), false);
      assert.equal(isBankStatementCurrencyCompatible(null, 'TND'), true);
    });
  });

  it('accepts ISO dates provided as Excel dates and valid CSV-style values', () => {
    assert.deepEqual(validateBankStatementRows([
      { date: new Date('2026-03-04T00:00:00.000Z'), description: 'Versement', amount: '10.000', balance: '10.000' },
      { date: '2026-03-05', description: 'Retrait', amount: '-2', balance: '8' },
    ]), []);
  });

  it('normalizes valid Excel dates for the CSV submission and rejects invalid Date objects safely', () => {
    assert.equal(normalizeBankStatementDate(new Date('2026-03-04T00:00:00.000Z')), '2026-03-04');
    assert.equal(normalizeBankStatementDate(new Date(Number.NaN)), '');
    assert.deepEqual(validateBankStatementRows([
      { date: new Date(Number.NaN), description: 'Versement', amount: '1' },
    ]), [{ rowIndex: 0, lineNumber: 2, message: 'Date invalide; utilisez AAAA-MM-JJ.' }]);
  });
});
