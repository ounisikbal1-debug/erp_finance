import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getFinancialInsights } from './financial-insights';

const baseInput = {
  countryCode: 'TN',
  revenue: 150,
  expenses: 100,
  postedJournalLineCount: 3,
  unclassifiedJournalLineCount: 0,
  invalidJournalLineCount: 0,
  currencyCode: 'TND',
};

describe('SAFE financial insights', () => {
  it('explains a positive net movement without implying cash position', () => {
    const insights = getFinancialInsights(baseInput);

    assert.equal(insights.length, 2);
    assert.match(insights[0].text, /50,000 TND/);
    assert.match(insights[1].text, /ne permettent pas d’établir la liquidité/);
  });

  it('reports a negative net movement as an accounting indicator', () => {
    const insights = getFinancialInsights({ ...baseInput, revenue: 50, expenses: 90 });

    assert.match(insights[0].text, /négatif : 40,000 TND/);
    assert.equal(insights[0].kind, 'info');
  });

  it('compares the same prior-year period and gives conditional follow-up only', () => {
    const insights = getFinancialInsights({
      ...baseInput,
      revenue: 120,
      expenses: 96,
      previousRevenue: 100,
      previousExpenses: 70,
    });

    assert.match(insights[1].text, /Variation des produits : \+20\.0 %/);
    assert.match(insights[1].text, /Variation des charges : \+37\.1 %/);
    assert.match(insights[1].text, /Variation du résultat de période : -20\.0 %/);
    assert.match(insights[2].text, /Si cette tendance se poursuit/);
  });

  it('uses English for English-speaking countries without inferring cash or arrears', () => {
    const insights = getFinancialInsights({
      ...baseInput,
      countryCode: 'us',
      previousRevenue: 100,
      previousExpenses: 70,
    });

    assert.match(insights[0].text, /The net posted movement is positive/);
    assert.match(insights[1].text, /Change in revenue: \+50\.0 %/);
    assert.match(insights[2].text, /do not establish liquidity or late customer payments/);
  });

  it('does not calculate an insight when the period has no posted entries', () => {
    const insights = getFinancialInsights({ ...baseInput, postedJournalLineCount: 0 });

    assert.equal(insights.length, 1);
    assert.match(insights[0].text, /Aucune écriture POSTED/);
  });

  it('warns when unclassified or invalid lines may make totals incomplete', () => {
    const insights = getFinancialInsights({
      ...baseInput,
      unclassifiedJournalLineCount: 1,
      invalidJournalLineCount: 2,
    });

    assert.equal(insights[0].kind, 'warning');
    assert.match(insights[0].text, /totaux affichés peuvent être incomplets/);
    assert.equal(insights.length, 3);
  });

  it('does not infer a result when either total is unavailable', () => {
    const insights = getFinancialInsights({ ...baseInput, expenses: null });

    assert.equal(insights.length, 1);
    assert.match(insights[0].text, /résultat de période n’est pas calculable/);
  });

  it('does not infer an analysis language for countries without an explicit mapping', () => {
    const insights = getFinancialInsights({ ...baseInput, countryCode: 'VU' });

    assert.equal(insights.length, 1);
    assert.match(insights[0].text, /Analysis language is not configured/);
  });

  it('does not calculate a percentage from a zero prior-year amount', () => {
    const insights = getFinancialInsights({
      ...baseInput,
      previousRevenue: 0,
      previousExpenses: 0,
    });

    assert.match(insights[1].text, /aucun pourcentage n’est calculé/);
    assert.doesNotMatch(insights[1].text, /Infinity|NaN/);
  });
});
