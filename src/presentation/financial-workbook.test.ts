import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { describe, it } from 'node:test';
import { createFinancialWorkbook } from './financial-workbook';

describe('consultative SAFE financial workbook', () => {
  it('exports the entity-scoped report and explicit limitations without AI formulas', async () => {
    const bytes = await createFinancialWorkbook({
      current: {
        generatedAt: '2026-11-04T10:00:00.000Z',
        entity: { name: 'Société synthétique', countryCode: 'TN', currencyCode: 'TND' },
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        totals: [
          { type: 'Revenue', accountCount: 1, movement: 1500 },
          { type: 'Expense', accountCount: 1, movement: 900 },
        ],
        accounts: [{ code: 'REV.01', description: 'Produits synthétiques', type: 'Revenue', financialCategory: 'REVENUE', movement: 1500 }],
        coverage: {
          postedJournalLineCount: 4,
          unclassifiedJournalLineCount: 0,
          unclassifiedAccountCodes: [],
          invalidJournalLineCount: 0,
        },
      },
      previous: {
        entity: { name: 'Société synthétique', countryCode: 'TN', currencyCode: 'TND' },
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
        totals: [
          { type: 'Revenue', accountCount: 1, movement: 1200 },
          { type: 'Expense', accountCount: 1, movement: 800 },
        ],
        accounts: [],
        coverage: {
          postedJournalLineCount: 4,
          unclassifiedJournalLineCount: 0,
          unclassifiedAccountCodes: [],
          invalidJournalLineCount: 0,
        },
      },
      previousFullYear: {
        entity: { name: 'Société synthétique', countryCode: 'TN', currencyCode: 'TND' },
        periodStart: '2025-01-01',
        periodEnd: '2025-12-31',
        totals: [
          { type: 'Revenue', accountCount: 1, movement: 12000 },
          { type: 'Expense', accountCount: 1, movement: 8000 },
        ],
        accounts: [],
        coverage: {
          postedJournalLineCount: 10,
          unclassifiedJournalLineCount: 0,
          unclassifiedAccountCodes: [],
          invalidJournalLineCount: 0,
        },
      },
      comparisons: [
        { label: 'Produits', current: 1500, priorYear: 1200, difference: 300, percentChange: 25 },
        { label: 'Charges', current: 900, priorYear: 800, difference: 100, percentChange: 12.5 },
        { label: 'Résultat de période', current: 600, priorYear: 400, difference: 200, percentChange: 50 },
      ],
      insights: [{ kind: 'info', text: 'Indicateur calculé par SAFE.' }],
      balanceSheet: {
        dateImputation: '2026-01-31',
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
            { code: '531', description: 'Caisse synthétique', type: 'Asset', financialCategory: 'CASH_EQUIVALENT', balance: 100 },
            { code: '101', description: 'Capital synthétique', type: 'Equity', financialCategory: 'EQUITY', balance: 100 },
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
          periodStart: '2025-02-01',
          periodEnd: '2026-01-31',
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
        equityStatement: {
          available: true,
          periodStart: '2025-02-01',
          periodEnd: '2026-01-31',
          openingEquity: 100,
          creditMovements: 20,
          debitMovements: 5,
          netIncome: 0,
          closingEquity: 115,
          note: 'Mouvements au débit/crédit; aucune qualification automatique.',
        },
      },
      budgetMonths: [{
        period: '2026-01',
        entity: { name: 'Société synthétique', countryCode: 'TN', currencyCode: 'TND' },
        lines: [
          {
            accountCode: 'EXP.01',
            description: 'Charges synthétiques',
            accountType: 'Expense',
            amount: 1000,
            actual: 900,
            variance: 100,
            status: 'APPROVED',
          },
          {
            accountCode: 'EXP.02',
            description: 'Brouillon exclu',
            accountType: 'Expense',
            amount: 500,
            actual: 200,
            variance: null,
            status: 'DRAFT',
          },
        ],
        diagnostics: { unclassifiedJournalLineCount: 0, invalidJournalLineCount: 0 },
      }],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.read(Readable.from([Buffer.from(bytes)]));

    assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), [
      'Synthèse SAFE',
      'Compte de résultat',
      'Bilan',
      'Flux de trésorerie',
      'Bilan détaillé',
      'Variations capitaux propres',
      'Comparatif N-1',
      'Détail comptes',
      'Analyse SAFE',
      'Projection annuelle indicative',
      'Budget SAFE approuvé',
      'Règles & limites',
    ]);
    assert.equal(workbook.getWorksheet('Synthèse SAFE')?.getCell('B6').value, 600);
    assert.equal(workbook.getWorksheet('Compte de résultat')?.getCell('C3').value, 1500);
    assert.equal(workbook.getWorksheet('Compte de résultat')?.getCell('D3').value, 1);
    assert.equal(workbook.getWorksheet('Compte de résultat')?.getCell('D1').value, '2026-01-01 au 2026-01-31');
    assert.equal(workbook.getWorksheet('Compte de résultat')?.getCell('E1').value, 'Devise : TND');
    assert.notEqual(workbook.getWorksheet('Compte de résultat')?.getCell('E3').value, '');
    const statement = workbook.getWorksheet('Compte de résultat');
    assert.ok(statement);
    statement.eachRow((row, rowNumber) => {
      assert.equal(row.cellCount, 5);
      for (let column = 1; column <= 5; column += 1) {
        assert.notEqual(row.getCell(column).value, null);
        assert.notEqual(row.getCell(column).value, undefined);
        assert.notEqual(row.getCell(column).value, '');
      }
    });
    const balanceSheet = workbook.getWorksheet('Bilan');
    assert.ok(balanceSheet);
    assert.equal(balanceSheet.getCell('C3').value, 100);
    assert.equal(balanceSheet.getCell('D1').value, '2026-01-31');
    balanceSheet.eachRow((row) => {
      assert.equal(row.cellCount, 4);
      for (let column = 1; column <= 4; column += 1) {
        assert.notEqual(row.getCell(column).value, null);
        assert.notEqual(row.getCell(column).value, undefined);
        assert.notEqual(row.getCell(column).value, '');
      }
    });
    const cashFlow = workbook.getWorksheet('Flux de trésorerie');
    assert.ok(cashFlow);
    cashFlow.eachRow((row) => {
      assert.equal(row.cellCount, 4);
      for (let column = 1; column <= 4; column += 1) {
        assert.notEqual(row.getCell(column).value, null);
        assert.notEqual(row.getCell(column).value, undefined);
        assert.notEqual(row.getCell(column).value, '');
      }
    });
    const equityChanges = workbook.getWorksheet('Variations capitaux propres');
    assert.ok(equityChanges);
    assert.equal(equityChanges.getCell('C2').value, 100);
    assert.equal(equityChanges.getCell('C3').value, 20);
    assert.equal(equityChanges.getCell('C4').value, 5);
    assert.equal(equityChanges.getCell('C5').value, 0);
    assert.equal(equityChanges.getCell('C6').value, 115);
    assert.equal(equityChanges.getCell('C7').value, 0);
    equityChanges.eachRow((row) => {
      assert.equal(row.cellCount, 4);
      for (let column = 1; column <= 4; column += 1) {
        assert.notEqual(row.getCell(column).value, null);
        assert.notEqual(row.getCell(column).value, undefined);
        assert.notEqual(row.getCell(column).value, '');
      }
    });
    const detailedBalance = workbook.getWorksheet('Bilan détaillé');
    assert.ok(detailedBalance);
    assert.equal(detailedBalance.getCell('B2').value, '531 — Caisse synthétique');
    assert.equal(detailedBalance.getCell('D2').value, 100);
    assert.equal(detailedBalance.getCell('B3').value, '101 — Capital synthétique');
    assert.equal(detailedBalance.getCell('D4').value, 0);
    detailedBalance.eachRow((row) => {
      assert.equal(row.cellCount, 5);
      for (let column = 1; column <= 5; column += 1) {
        assert.notEqual(row.getCell(column).value, null);
        assert.notEqual(row.getCell(column).value, undefined);
        assert.notEqual(row.getCell(column).value, '');
      }
    });
    assert.equal(workbook.getWorksheet('Comparatif N-1')?.getCell('E2').value, 0.25);
    assert.equal(workbook.getWorksheet('Détail comptes')?.getCell('A2').value, 'REV.01');
    assert.equal(workbook.getWorksheet('Projection annuelle indicative')?.getCell('F2').value, 15000);
    assert.equal(workbook.getWorksheet('Projection annuelle indicative')?.getCell('F3').value, 9000);
    assert.equal(workbook.getWorksheet('Projection annuelle indicative')?.getCell('F4').value, 6000);
    assert.equal(workbook.getWorksheet('Budget SAFE approuvé')?.getCell('B2').value, 'EXP.01');
    assert.equal(workbook.getWorksheet('Budget SAFE approuvé')?.getCell('G2').value, 100);
    assert.equal(workbook.getWorksheet('Budget SAFE approuvé')?.getCell('B3').value, '');
    assert.match(String(workbook.getWorksheet('Règles & limites')?.getCell('B7').value), /consultatif/);
    for (const sheet of workbook.worksheets) {
      sheet.eachRow((row) => row.eachCell((cell) => {
        assert.ok(!(cell.value && typeof cell.value === 'object' && 'formula' in cell.value));
      }));
    }
  });

  it('removes unsafe control characters from exported text cells', async () => {
    const bytes = await createFinancialWorkbook({
      current: {
        entity: { name: 'SAFE\u0000 Société', countryCode: 'TN', currencyCode: 'TND' },
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        totals: [],
        accounts: [{ code: 'A\u0001', description: 'Compte\u0007', type: 'Revenue', movement: null }],
        coverage: {
          postedJournalLineCount: 0,
          unclassifiedJournalLineCount: 0,
          unclassifiedAccountCodes: [],
          invalidJournalLineCount: 0,
        },
      },
      comparisons: [],
      insights: [],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.read(Readable.from([Buffer.from(bytes)]));

    assert.equal(workbook.getWorksheet('Synthèse SAFE')?.getCell('B2').value, 'SAFE Société');
    assert.equal(workbook.getWorksheet('Détail comptes')?.getCell('A2').value, 'A');
    assert.equal(workbook.getWorksheet('Détail comptes')?.getCell('B2').value, 'Compte');
    assert.match(String(workbook.getWorksheet('Projection annuelle indicative')?.getCell('G2').value), /rapports antérieurs manquants/);
    assert.match(String(workbook.getWorksheet('Budget SAFE approuvé')?.getCell('C2').value), /Aucune ligne budgétaire approuvée/);
  });

  it('excludes budget data for a different entity and disables a projection with incomplete coverage', async () => {
    const bytes = await createFinancialWorkbook({
      current: {
        entity: { name: 'Entité A', countryCode: 'TN', currencyCode: 'TND' },
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
        totals: [
          { type: 'Revenue', accountCount: 1, movement: 300 },
          { type: 'Expense', accountCount: 1, movement: 200 },
        ],
        accounts: [],
        coverage: {
          postedJournalLineCount: 3,
          unclassifiedJournalLineCount: 1,
          unclassifiedAccountCodes: ['X'],
          invalidJournalLineCount: 0,
        },
      },
      previous: {
        entity: { name: 'Entité A', countryCode: 'TN', currencyCode: 'TND' },
        periodStart: '2025-01-01',
        periodEnd: '2025-03-31',
        totals: [
          { type: 'Revenue', accountCount: 1, movement: 200 },
          { type: 'Expense', accountCount: 1, movement: 150 },
        ],
        accounts: [],
        coverage: {
          postedJournalLineCount: 2,
          unclassifiedJournalLineCount: 0,
          unclassifiedAccountCodes: [],
          invalidJournalLineCount: 0,
        },
      },
      previousFullYear: {
        entity: { name: 'Entité A', countryCode: 'TN', currencyCode: 'TND' },
        periodStart: '2025-01-01',
        periodEnd: '2025-12-31',
        totals: [
          { type: 'Revenue', accountCount: 1, movement: 1200 },
          { type: 'Expense', accountCount: 1, movement: 900 },
        ],
        accounts: [],
        coverage: {
          postedJournalLineCount: 12,
          unclassifiedJournalLineCount: 0,
          unclassifiedAccountCodes: [],
          invalidJournalLineCount: 0,
        },
      },
      comparisons: [
        { label: 'Produits', current: 300, priorYear: 200, difference: 100, percentChange: 50 },
        { label: 'Charges', current: 200, priorYear: 150, difference: 50, percentChange: 33.3 },
        { label: 'Résultat de période', current: 100, priorYear: 50, difference: 50, percentChange: 100 },
      ],
      insights: [],
      budgetMonths: [{
        period: '2026-01',
        entity: { name: 'Entité B', countryCode: 'TN', currencyCode: 'TND' },
        lines: [{
          accountCode: '601',
          description: 'Ne doit pas être exporté',
          accountType: 'Expense',
          amount: 100,
          actual: 100,
          variance: 0,
          status: 'APPROVED',
        }],
        diagnostics: { unclassifiedJournalLineCount: 0, invalidJournalLineCount: 0 },
      }],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.read(Readable.from([Buffer.from(bytes)]));

    assert.equal(workbook.getWorksheet('Projection annuelle indicative')?.getCell('F2').value, null);
    assert.match(String(workbook.getWorksheet('Projection annuelle indicative')?.getCell('G2').value), /couverture comptable incomplète/);
    assert.match(String(workbook.getWorksheet('Budget SAFE approuvé')?.getCell('C2').value), /ne correspondent pas à la société/);
    assert.notEqual(workbook.getWorksheet('Budget SAFE approuvé')?.getCell('B2').value, '601');
  });
});
