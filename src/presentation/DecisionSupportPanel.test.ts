import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRecommendations, type DecisionData } from './DecisionSupportPanel';

const baseData: DecisionData = {
  entity: { code: 'SAFE-TN', countryCode: 'TN', currencyCode: 'TND' },
  journalLines: [
    { entryNumber: 'TEST-JE-1', accountType: 'Revenue', debit: 0, credit: 100 },
    { entryNumber: 'TEST-JE-1', accountType: 'Expense', debit: 120, credit: 0 },
    { entryNumber: 'TEST-JE-1', accountType: 'Liability', debit: 0, credit: 20 },
  ],
  salesInvoices: [{ totalAmount: 100, status: 'ISSUED', currencyCode: 'TND', functionalCurrencyCode: 'TND' }],
  purchaseInvoices: [{ totalAmount: 130, status: 'POSTED', currencyCode: 'TND', functionalCurrencyCode: 'TND' }],
  cashflow: {
    totals: { closingBalance: -5 },
    diagnostics: { invalidJournalLineCount: 1, mappedAccountCount: 1, totalsAvailable: false },
  },
};

test('decision support identifies loss and invalid ledger lines without trusting cash totals', () => {
  const result = buildRecommendations(baseData, '2026-10');
  assert.ok(result.some(({ domain, priority }) => domain === 'Finance' && priority === 'Élevée'));
  assert.ok(result.some(({ domain }) => domain === 'Qualité des données'));
  assert.ok(!result.some(({ domain }) => domain === 'Trésorerie'));
  assert.ok(result.every(({ source }) => source.includes('2026-10')));
});

test('decision support recommends treasury review when a reliable closing balance is negative', () => {
  const result = buildRecommendations({
    ...baseData,
    cashflow: { totals: { closingBalance: -5 }, diagnostics: { invalidJournalLineCount: 0, mappedAccountCount: 1, totalsAvailable: true } },
  }, '2026-10');
  assert.ok(result.some(({ domain }) => domain === 'Trésorerie'));
});

test('decision support labels invoice comparison as an indicator, not a margin', () => {
  const result = buildRecommendations(baseData, '2026-10');
  const purchasing = result.find(({ domain }) => domain === 'Achats');
  assert.ok(purchasing);
  assert.match(purchasing.action, /ne constitue pas une marge/);
});

test('decision support reports missing accounting data instead of inventing a result', () => {
  const result = buildRecommendations({
    ...baseData,
    journalLines: [],
    salesInvoices: [],
    purchaseInvoices: [],
  }, '2026-10');
  assert.ok(result.some(({ finding }) => finding.includes('Aucune ligne comptable validée')));
  assert.ok(!result.some(({ indicator }) => indicator === 'Mouvement net produits - charges'));
});

test('decision support proposes actions for operational shortages and overdue work across domains', () => {
  const result = buildRecommendations({
    ...baseData,
    operational: {
      snapshotDate: '2026-11-07',
      stock: { lowStockItems: 2, monitoredItems: 8, unmonitoredItems: 0, invalidItems: 0 },
      purchases: { ordersAwaitingReview: 1, overdueApprovedOrders: 2, approvedOrdersMissingExpectedDate: 0 },
      production: { draftOrders: 3 },
      maintenance: { overdueOpenOrders: 1, openOrders: 4 },
      quality: {
        highSeverityOpenFindings: 1,
        overdueOpenFindings: 2,
        overdueActions: 1,
        openFindingsMissingDueDate: 0,
        openActionsMissingDueDate: 0,
      },
      hr: {
        pendingLeaveRequests: 2,
        expiredEmployeeDocuments: 1,
        documentsExpiringWithin30Days: 3,
        documentsMissingValidityDate: 0,
      },
    },
  }, '2026-10');
  const domains = new Set(result.map(({ domain }) => domain));
  for (const domain of ['Stocks', 'Achats', 'Production', 'Maintenance', 'Qualité', 'Ressources humaines']) {
    assert.ok(domains.has(domain), `recommendation missing for ${domain}`);
  }
  assert.ok(result.filter(({ domain }) => domain === 'Achats').some(({ priority }) => priority === 'Élevée'));
  assert.ok(result.filter(({ source }) => source.startsWith('Instantané opérationnel'))
    .every(({ source }) => source.includes('2026-11-07')));
});

test('withholds net-result advice when posted lines are invalid or account classification is incomplete', () => {
  const result = buildRecommendations({
    ...baseData,
    journalLines: [
      ...baseData.journalLines,
      { entryNumber: 'TEST-JE-2', accountType: null, debit: 50, credit: 0 },
      { entryNumber: 'TEST-JE-2', accountType: 'Asset', debit: 0, credit: 0 },
    ],
  }, '2026-10');

  assert.ok(!result.some(({ indicator }) => indicator === 'Mouvement net produits - charges'));
  const coverage = result.find(({ indicator }) => indicator === 'Complétude du mouvement produits - charges');
  assert.ok(coverage);
  assert.match(coverage.finding, /1 ligne\(s\) comptable\(s\) invalides/);
  assert.match(coverage.finding, /1 ligne\(s\) sans type de compte reconnu/);
});

test('withholds invoice comparison when amounts are not in the entity functional currency', () => {
  const result = buildRecommendations({
    ...baseData,
    salesInvoices: [{
      totalAmount: 100,
      status: 'ISSUED',
      currencyCode: 'EUR',
      functionalCurrencyCode: null,
    }],
  }, '2026-10');

  assert.ok(!result.some(({ indicator }) => indicator === 'Achats fournisseurs / ventes'));
  assert.match(result.find(({ indicator }) => indicator === 'Couverture des factures')?.finding ?? '', /0\/1/);
});

test('withholds operational recommendations when stock or due-date coverage is incomplete', () => {
  const result = buildRecommendations({
    ...baseData,
    operational: {
      snapshotDate: '2026-11-07',
      stock: { lowStockItems: 2, monitoredItems: 8, unmonitoredItems: 3, invalidItems: 0 },
      purchases: { ordersAwaitingReview: 0, overdueApprovedOrders: 1, approvedOrdersMissingExpectedDate: 2 },
      production: { draftOrders: 0 },
      maintenance: { overdueOpenOrders: 0, openOrders: 0 },
      quality: {
        highSeverityOpenFindings: 0,
        overdueOpenFindings: 2,
        overdueActions: 1,
        openFindingsMissingDueDate: 1,
        openActionsMissingDueDate: 2,
      },
      hr: {
        pendingLeaveRequests: 1,
        expiredEmployeeDocuments: 1,
        documentsExpiringWithin30Days: 2,
        documentsMissingValidityDate: 1,
      },
    },
  }, '2026-10');

  assert.ok(!result.some(({ domain, indicator }) => (
    domain === 'Stocks'
    || indicator === 'Non-conformités échues'
    || indicator === 'Commandes approuvées en retard'
  )));
  assert.ok(!result.some(({ indicator }) => indicator === 'Documents employés expirés'));
  assert.ok(result.some(({ indicator }) => indicator === 'Couverture des seuils de stock'));
  assert.ok(result.some(({ indicator }) => indicator === 'Échéances de non-conformité / CAPA incomplètes'));
  assert.ok(result.some(({ indicator }) => indicator === 'Dates de validité RH manquantes'));
  assert.ok(result.some(({ indicator }) => indicator === 'Dates attendues des commandes manquantes'));
  assert.ok(result.some(({ indicator, finding }) => indicator === 'Échéances et demandes à traiter' && /demande\(s\) de congé/.test(finding)));
});

test('withholds stock advice when reported quantities fail unit precision checks', () => {
  const result = buildRecommendations({
    ...baseData,
    operational: {
      snapshotDate: '2026-11-07',
      stock: { lowStockItems: 1, monitoredItems: 2, unmonitoredItems: 0, invalidItems: 1 },
      purchases: { ordersAwaitingReview: 0, overdueApprovedOrders: 0, approvedOrdersMissingExpectedDate: 0 },
      production: { draftOrders: 0 },
      maintenance: { overdueOpenOrders: 0, openOrders: 0 },
      quality: {
        highSeverityOpenFindings: 0,
        overdueOpenFindings: 0,
        overdueActions: 0,
        openFindingsMissingDueDate: 0,
        openActionsMissingDueDate: 0,
      },
      hr: {
        pendingLeaveRequests: 0,
        expiredEmployeeDocuments: 0,
        documentsExpiringWithin30Days: 0,
        documentsMissingValidityDate: 0,
      },
    },
  }, '2026-10');

  assert.ok(!result.some(({ domain }) => domain === 'Stocks'));
  assert.match(result.find(({ indicator }) => indicator === 'Couverture des seuils de stock')?.finding ?? '', /1 article\(s\) avec des quantités ou seuils invalides/);
});

test('does not infer a zero treasury balance when no accounts are mapped', () => {
  const result = buildRecommendations({
    ...baseData,
    cashflow: { totals: { closingBalance: 0 }, diagnostics: { invalidJournalLineCount: 0, mappedAccountCount: 0, totalsAvailable: false } },
  }, '2026-10');

  assert.ok(!result.some(({ indicator }) => indicator === 'Solde de clôture comptable'));
  assert.match(result.find(({ indicator }) => indicator === 'Complétude des soldes de trésorerie')?.finding ?? '', /Aucun compte/);
});
