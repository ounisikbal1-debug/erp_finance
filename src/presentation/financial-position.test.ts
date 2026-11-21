import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCashFlowLines, buildDetailedBalanceLines, buildEquityChangesLines, buildFinancialPositionLines, isFinancialPositionSummary } from './financial-position';

describe('SAFE balance sheet presentation', () => {
  it('displays zero-valued classified categories and reconciles totals', () => {
    const lines = buildFinancialPositionLines({
      dateImputation: '2026-12-31',
      countryCode: 'TN',
      currency: 'TND',
      balanceSheet: {
        available: true,
        categories: {
          cash: 100,
          tradeReceivables: 0,
          inventory: 0,
          otherCurrentAssets: 0,
          noncurrentAssets: 0,
          tradePayables: 0,
          otherCurrentLiabilities: 0,
          noncurrentLiabilities: 0,
          equity: 100,
        },
        accounts: [
          { code: '101', description: 'Capital', type: 'Equity', financialCategory: 'EQUITY', balance: 100 },
          { code: '411', description: 'Clients', type: 'Asset', financialCategory: 'TRADE_RECEIVABLE', balance: 0 },
        ],
        currentAssets: 100,
        noncurrentAssets: 0,
        totalAssets: 100,
        currentLiabilities: 0,
        noncurrentLiabilities: 0,
        totalLiabilities: 0,
        equity: 100,
        liabilitiesAndEquity: 100,
        balanceDifference: 0,
        isBalanced: true,
      },
      cashFlowStatement: {
        available: true,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        openingCash: 100,
        cashInflows: 0,
        cashOutflows: 0,
        netCashChange: 0,
        closingCash: 100,
        operatingFlows: null,
        investingFlows: null,
        financingFlows: null,
        classificationNote: 'Ventilation par activité indisponible.',
      },
      incomeStatement: { available: true, netIncome: 0 },
    });

    assert.equal(lines.find((line) => line.label === 'Créances clients')?.amount, 0);
    assert.equal(lines.find((line) => line.label === 'TOTAL ACTIF')?.amount, 100);
    assert.equal(lines.find((line) => line.label === 'TOTAL PASSIF ET CAPITAUX PROPRES')?.amount, 100);
    assert.equal(lines.find((line) => line.label === 'Écart actif − passif et capitaux propres')?.amount, 0);
  });

  it('presents the cash movement statement with explicit zeroes and unclassified activity categories', () => {
    const lines = buildCashFlowLines({
      dateImputation: '2026-12-31',
      countryCode: 'TN',
      currency: 'TND',
      balanceSheet: {
        available: true,
        categories: {
          cash: 100,
          tradeReceivables: 0,
          inventory: 0,
          otherCurrentAssets: 0,
          noncurrentAssets: 0,
          tradePayables: 0,
          otherCurrentLiabilities: 0,
          noncurrentLiabilities: 0,
          equity: 100,
        },
        accounts: [],
        currentAssets: 100,
        noncurrentAssets: 0,
        totalAssets: 100,
        currentLiabilities: 0,
        noncurrentLiabilities: 0,
        totalLiabilities: 0,
        equity: 100,
        liabilitiesAndEquity: 100,
        balanceDifference: 0,
        isBalanced: true,
      },
      cashFlowStatement: {
        available: true,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        openingCash: 100,
        cashInflows: 0,
        cashOutflows: 0,
        netCashChange: 0,
        closingCash: 100,
        operatingFlows: null,
        investingFlows: null,
        financingFlows: null,
        classificationNote: 'Ventilation par activité indisponible.',
      },
      incomeStatement: { available: true, netIncome: 0 },
    });

    assert.equal(lines.find((line) => line.label === 'Entrées sur comptes de trésorerie')?.amount, 0);
    assert.equal(lines.find((line) => line.label === 'Variation nette de trésorerie calculée')?.amount, 0);
    assert.equal(lines.find((line) => line.label === 'Flux des activités opérationnelles')?.amount, null);
    assert.ok(lines.every((line) => line.notes.length > 0));
  });

  it('marks balance sheet posts unavailable when classifications or ledger coverage are incomplete', () => {
    const lines = buildFinancialPositionLines(null);
    assert.ok(lines.length > 0);
    assert.ok(lines.every((line) => line.amount === null && line.notes.length > 0));
  });

  it('builds a detailed balance with explicit zero balances and unavailable unclassified accounts', () => {
    const summary = {
      dateImputation: '2026-12-31',
      countryCode: 'TN',
      currency: 'TND',
      balanceSheet: {
        available: true,
        categories: {
          cash: 100,
          tradeReceivables: 0,
          inventory: 0,
          otherCurrentAssets: 0,
          noncurrentAssets: 0,
          tradePayables: 0,
          otherCurrentLiabilities: 0,
          noncurrentLiabilities: 0,
          equity: 100,
        },
        accounts: [
          { code: '411', description: 'Clients', type: 'Asset' as const, financialCategory: 'TRADE_RECEIVABLE', balance: 0 },
          { code: 'X', description: 'Compte à classer', type: 'Asset' as const, financialCategory: null, balance: null },
        ],
        currentAssets: 100,
        noncurrentAssets: 0,
        totalAssets: 100,
        currentLiabilities: 0,
        noncurrentLiabilities: 0,
        totalLiabilities: 0,
        equity: 100,
        liabilitiesAndEquity: 100,
        balanceDifference: 0,
        isBalanced: true,
      },
      cashFlowStatement: {
        available: true,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        openingCash: 100,
        cashInflows: 0,
        cashOutflows: 0,
        netCashChange: 0,
        closingCash: 100,
        operatingFlows: null,
        investingFlows: null,
        financingFlows: null,
        classificationNote: 'Ventilation par activité indisponible.',
      },
      incomeStatement: { available: true, netIncome: 0 },
    };
    const lines = buildDetailedBalanceLines(summary);

    assert.equal(lines.find((line) => line.accountCode === '411')?.amount, 0);
    assert.equal(lines.find((line) => line.accountCode === 'X')?.amount, null);
    assert.equal(lines.find((line) => line.label === 'TOTAL ACTIF')?.amount, 100);
    assert.equal(lines.find((line) => line.label === 'Résultat de la période non clôturé')?.amount, 0);
    assert.ok(lines.every((line) => line.notes.length > 0));
    assert.equal(isFinancialPositionSummary(summary), true);
    assert.equal(isFinancialPositionSummary({
      ...summary,
      balanceSheet: { ...summary.balanceSheet, accounts: [{ code: 'X', balance: 'NaN' }] },
    }), false);
  });

  it('presents the equity changes and reconciles opening, movements, result, and closing', () => {
    const summary = {
      dateImputation: '2026-12-31',
      countryCode: 'TN',
      currency: 'TND',
      balanceSheet: {
        available: true,
        categories: {
          cash: 0,
          tradeReceivables: 0,
          inventory: 0,
          otherCurrentAssets: 0,
          noncurrentAssets: 0,
          tradePayables: 0,
          otherCurrentLiabilities: 0,
          noncurrentLiabilities: 0,
          equity: 125,
        },
        currentAssets: 0,
        noncurrentAssets: 0,
        totalAssets: 0,
        currentLiabilities: 0,
        noncurrentLiabilities: 0,
        totalLiabilities: 0,
        equity: 125,
        liabilitiesAndEquity: 125,
        balanceDifference: -125,
        isBalanced: false,
      },
      cashFlowStatement: {
        available: true,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        openingCash: 0,
        cashInflows: 0,
        cashOutflows: 0,
        netCashChange: 0,
        closingCash: 0,
        operatingFlows: null,
        investingFlows: null,
        financingFlows: null,
        classificationNote: 'Non ventilé.',
      },
      equityStatement: {
        available: true,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        openingEquity: 100,
        creditMovements: 20,
        debitMovements: 5,
        netIncome: 10,
        closingEquity: 125,
        note: 'Mouvements au débit/crédit.',
      },
    };
    const lines = buildEquityChangesLines(summary);

    assert.equal(lines.find((line) => line.label === 'Solde d’ouverture des comptes de capitaux propres')?.amount, 100);
    assert.equal(lines.find((line) => line.label === 'Mouvements au crédit des comptes de capitaux propres')?.amount, 20);
    assert.equal(lines.find((line) => line.label === 'Mouvements au débit des comptes de capitaux propres')?.amount, 5);
    assert.equal(lines.find((line) => line.label === 'Résultat net calculé sur la période')?.amount, 10);
    assert.equal(lines.find((line) => line.label === 'Solde de clôture des capitaux propres, résultat inclus')?.amount, 125);
    assert.equal(lines.find((line) => line.label === 'Écart de rapprochement')?.amount, 0);
    assert.ok(lines.every((line) => line.notes.length > 0));
    const unavailable = buildEquityChangesLines(null);
    assert.ok(unavailable.every((line) => line.amount === null && line.notes.length > 0));
  });
});
