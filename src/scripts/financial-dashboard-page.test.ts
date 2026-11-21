import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateDashboardSummary } from '../application/modules/advanced-finance/dashboard';
import { financialDashboardCsv, renderFinancialDashboardPage } from './financial-dashboard-page';

function makeSnapshot(entityName = 'SAFE TN') {
  return calculateDashboardSummary({
    entity: { name: entityName, countryCode: 'TN', currencyCode: 'TND' },
    asOf: new Date('2026-11-15T12:00:00.000Z'),
    materials: [],
    invoices: [],
    accounts: [{ code: '70', type: 'Revenue' }, { code: '60', type: 'Expense' }],
    journalLines: [
      { accountCode: '70', date: new Date('2026-11-04T00:00:00.000Z'), debit: 0, credit: 125 },
      { accountCode: '60', date: new Date('2026-11-05T00:00:00.000Z'), debit: 30, credit: 0 },
    ],
  });
}

describe('financial dashboard export page', () => {
  it('renders a self-contained snapshot with period/entity controls and dynamic charts', () => {
    const html = renderFinancialDashboardPage([makeSnapshot()]);
    assert.match(html, /SAFE — Tableau de bord financier/);
    assert.match(html, /entity-select/);
    assert.match(html, /period-select/);
    assert.match(html, /Télécharger CSV/);
    assert.match(html, /Télécharger Excel/);
    assert.match(html, /href="SAFE - Tableau de bord financier\.xlsx"/);
    assert.match(html, /Revenus postés \(12 mois\)/);
    assert.match(html, /ROE\/ROA\/ROCE/);
    assert.doesNotMatch(html, /<script src=/i);
    assert.match(html, /125/);
  });

  it('escapes data that could terminate the embedded JSON script element', () => {
    const html = renderFinancialDashboardPage([makeSnapshot('</script><script>alert(1)</script>')]);
    assert.doesNotMatch(html, /<\/script><script>alert/);
    assert.match(html, /\\u003c\/script\\u003e/);
  });

  it('escapes a configured workbook filename before placing it in an HTML link', () => {
    const html = renderFinancialDashboardPage([makeSnapshot()], 'dash"><script>alert(1)</script>.xlsx');
    assert.match(html, /href="dash&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;\.xlsx"/);
  });

  it('labels synthetic demonstration exports when requested', () => {
    const html = renderFinancialDashboardPage([makeSnapshot()], 'demo.xlsx', 'EXEMPLE — DONNÉES SYNTHÉTIQUES');
    assert.match(html, /EXEMPLE — DONNÉES SYNTHÉTIQUES/);
  });

  it('exports only the selected financial monthly series as semicolon-delimited CSV', () => {
    const csv = financialDashboardCsv(makeSnapshot(), 1);
    assert.match(csv, /"Entité";"Période";"Devise"/);
    assert.match(csv, /"SAFE TN";"2026-11";"TND";"125";"30"/);
    assert.equal(csv.split('\r\n').length, 2);
  });

  it('neutralizes spreadsheet formulas in text fields in exported CSV', () => {
    const csv = financialDashboardCsv(makeSnapshot('=1+1'), 1);
    assert.match(csv, /"'=1\+1"/);
  });

  it('rejects an empty snapshot instead of creating a success-shaped empty dashboard', () => {
    assert.throws(() => renderFinancialDashboardPage([]), /Aucune entité SAFE/);
  });
});
