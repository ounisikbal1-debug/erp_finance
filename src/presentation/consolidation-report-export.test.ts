import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toConsolidationReportRows } from './consolidation-report-export';

describe('consolidation report export rows', () => {
  it('exports stored group lines and includes their period, currency, and status', () => {
    assert.deepEqual(toConsolidationReportRows({
      period: '2026-03',
      status: 'READY',
      reportingCurrencyCode: 'TND',
      diagnostics: [],
      lines: [{
        groupAccountCode: '1000',
        debit: 170.5,
        credit: 0,
        lineType: 'AGGREGATE',
      }],
    }), [{
      period: '2026-03',
      currency: 'TND',
      status: 'READY',
      lineType: 'AGGREGATE',
      groupAccountCode: '1000',
      debit: 170.5,
      credit: 0,
      diagnostic: '',
    }]);
  });

  it('exports diagnostics without adding calculated lines to a blocked run', () => {
    assert.deepEqual(toConsolidationReportRows({
      period: '2026-03',
      status: 'BLOCKED',
      reportingCurrencyCode: 'TND',
      diagnostics: ['Mapping manquant.', 'Taux de conversion manquant.'],
      lines: [],
    }).map(({ status, lineType, groupAccountCode, debit, credit, diagnostic }) => ({
      status,
      lineType,
      groupAccountCode,
      debit,
      credit,
      diagnostic,
    })), [
      {
        status: 'BLOCKED',
        lineType: 'DIAGNOSTIC',
        groupAccountCode: '',
        debit: '',
        credit: '',
        diagnostic: 'Mapping manquant.',
      },
      {
        status: 'BLOCKED',
        lineType: 'DIAGNOSTIC',
        groupAccountCode: '',
        debit: '',
        credit: '',
        diagnostic: 'Taux de conversion manquant.',
      },
    ]);
  });

  it('prefixes untrusted text that spreadsheet software could interpret as a formula', () => {
    const rows = toConsolidationReportRows({
      period: '2026-03',
      status: 'READY',
      reportingCurrencyCode: 'TND',
      diagnostics: ['=HYPERLINK("https://example.invalid")'],
      lines: [{
        groupAccountCode: ' +SUM(1,1)',
        debit: 1,
        credit: 0,
        lineType: 'AGGREGATE',
      }],
    });

    assert.equal(rows[0].groupAccountCode, "' +SUM(1,1)");
    assert.equal(rows[1].diagnostic, `'=HYPERLINK("https://example.invalid")`);
  });
});
