import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDashboardNativeInsights, getReceivablesNativeInsights } from './native-analytics';

describe('automatic native SAFE analytics', () => {
  it('compares the two latest complete months, excluding the current partial month', () => {
    const insights = getDashboardNativeInsights({
      monthly: [
        { month: '2026-08', revenue: 100, expenses: 60 },
        { month: '2026-09', revenue: 150, expenses: 80 },
        { month: '2026-10', revenue: 180, expenses: 90 },
        { month: '2026-11', revenue: 10, expenses: 4 },
      ],
      periodEnd: '2026-11-02',
      currencyCode: 'TND',
      unclassifiedJournalLineCount: 0,
      invalidJournalLineCount: 0,
    });

    assert.equal(insights.length, 1);
    assert.match(insights[0].text, /octobre 2026/);
    assert.match(insights[0].text, /30,000 TND/);
    assert.match(insights[0].text, /pas une prévision/);
  });

  it('avoids a comparison when fewer than two closed months are available', () => {
    const insights = getDashboardNativeInsights({
      monthly: [{ month: '2026-11', revenue: 25, expenses: 10 }],
      periodEnd: '2026-11-02',
      currencyCode: 'TND',
      unclassifiedJournalLineCount: 0,
      invalidJournalLineCount: 0,
    });

    assert.match(insights[0].text, /deux mois complets/);
  });

  it('reports incomplete accounting coverage instead of hiding it', () => {
    const insights = getDashboardNativeInsights({
      monthly: [
        { month: '2026-09', revenue: 150, expenses: 80 },
        { month: '2026-10', revenue: 180, expenses: 90 },
        { month: '2026-11', revenue: 0, expenses: 0 },
      ],
      periodEnd: '2026-11-02',
      currencyCode: 'TND',
      unclassifiedJournalLineCount: 2,
      invalidJournalLineCount: 1,
    });

    assert.equal(insights.length, 2);
    assert.equal(insights[1].kind, 'warning');
    assert.match(insights[1].text, /analyse peut être incomplète/);
  });

  it('highlights overdue amounts and the portion over 90 days', () => {
    const insights = getReceivablesNativeInsights({
      currencyCode: 'TND',
      totals: {
        outstanding: 500,
        days1To30: 100,
        days31To60: 50,
        days61To90: 25,
        over90: 75,
        unknownDueDate: 250,
      },
      coverage: { openInvoiceCount: 4, invalidInvoiceCount: 0, dueDateMissingCount: 1 },
    });

    assert.equal(insights.length, 2);
    assert.match(insights[0].text, /250,000 TND restent échus/);
    assert.match(insights[0].text, /75,000 TND ont plus de 90 jours/);
    assert.match(insights[1].text, /échéance/);
  });

  it('does not present overdue totals as complete when invoice data is invalid', () => {
    const insights = getReceivablesNativeInsights({
      currencyCode: 'TND',
      totals: {
        outstanding: null,
        days1To30: null,
        days31To60: null,
        days61To90: null,
        over90: null,
        unknownDueDate: null,
      },
      coverage: { openInvoiceCount: 1, invalidInvoiceCount: 1, dueDateMissingCount: 0 },
    });

    assert.equal(insights.length, 1);
    assert.equal(insights[0].kind, 'warning');
    assert.match(insights[0].text, /ne sont pas considérés complets/);
  });
});
