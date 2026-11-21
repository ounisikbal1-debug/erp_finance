import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allocateCollectedVatByRate,
  calculateTaxDeclaration,
  TaxDeclarationError,
  validateTaxPeriod,
} from './declaration';

describe('tax declaration', () => {
  it('accepts a calendar month and rejects invalid periods', () => {
    assert.equal(validateTaxPeriod('2026-10'), '2026-10');
    assert.throws(() => validateTaxPeriod('2026-13'), TaxDeclarationError);
  });

  it('calculates VAT from real invoice lines and posted deductible VAT only', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [
      { invoiceNumber: 'A', taxAmount: 3.8, items: [{ quantity: 2, unitPrice: 10, taxRate: 19 }] },
      { invoiceNumber: 'B', taxAmount: 0, items: [{ quantity: 1, unitPrice: 5, taxRate: 0 }] },
    ], [
      { accountCode: '4366', reference: 'PI-A', debit: 3.8, credit: 0 },
      { accountCode: '4366', reference: 'CN-A', debit: 0, credit: 0.2 },
    ], [
      { reference: 'A', debit: 0, credit: 3.8 },
    ], [
      { invoiceNumber: 'PI-A', subTotal: 20, taxAmount: 3.8, taxRate: 19, purchaseVatRecoverable: true },
    ], [
      { documentNumber: 'CN-A', subTotal: 1.053, taxAmount: 0.2, taxRate: 19, purchaseVatRecoverable: true },
    ]);
    assert.equal(result.tvaCollectedGlobal, 3.8);
    assert.equal(result.tvaDeductibleGlobal, 3.6);
    assert.equal(result.tvaDue, 0.2);
    assert.equal(result.tvaCredit, 0);
    assert.equal(result.totalTaxToPay, null);
    assert.deepEqual(result.tvaDetailsDeductibleByRate, [{
      rate: 19,
      baseHT: 18.947,
      tvaAmount: 3.6,
      label: 'TVA achats 19%',
    }]);
    assert.match(result.complianceStatus, /INCOMPLET/);
    assert.deepEqual(result.unavailableSections, [
      'Retenues à la source et impôt sur les sociétés : données sources non disponibles',
      'Total à payer G50 : règle de cumul, crédits et rubriques non gérés par un modèle officiel; total non calculé',
    ]);
  });

  it('calculates collected VAT from fractional invoice quantities', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [{
      invoiceNumber: 'FRACTIONAL',
      taxAmount: 2.85,
      items: [{ quantity: 1.5, unitPrice: 10, taxRate: 19 }],
    }], [], [{ reference: 'FRACTIONAL', debit: 0, credit: 2.85 }]);
    assert.equal(result.tvaCollectedGlobal, 2.85);
  });

  it('allocates collected VAT by calculated tax rate and assigns rounding remainder to the last rate', () => {
    const allocations = allocateCollectedVatByRate(
      4,
      new Map([[10, 1], [20, 2]]),
      new Map([[10, 1], [20, 1]]),
    );
    assert.ok(allocations);
    assert.deepEqual([...allocations], [[10, 1], [20, 3]]);
    assert.equal([...allocations.values()].reduce((sum, amount) => sum + amount, 0), 4);
  });

  it('reconciles multi-rate invoice VAT and splits zero-tax invoices uniformly by line count', () => {
    const multiRate = calculateTaxDeclaration('2026-10', 'TND', [{
      invoiceNumber: 'MIXED',
      taxAmount: 26,
      items: [
        { quantity: 1, unitPrice: 100, taxRate: 19 },
        { quantity: 1, unitPrice: 100, taxRate: 7 },
      ],
    }], [], [{ reference: 'MIXED', debit: 0, credit: 26 }]);
    assert.equal(multiRate.tvaCollectedGlobal, 26);
    assert.deepEqual(multiRate.tvaDetailsCollected.map(({ rate, tvaAmount }) => ({ rate, tvaAmount })), [
      { rate: 7, tvaAmount: 7 },
      { rate: 19, tvaAmount: 19 },
    ]);

    const zeroTax = calculateTaxDeclaration('2026-10', 'TND', [{
      invoiceNumber: 'ZERO',
      taxAmount: 0,
      items: [
        { quantity: 1, unitPrice: 100, taxRate: 0 },
        { quantity: 1, unitPrice: 200, taxRate: 0 },
      ],
    }], [], [{ reference: 'ZERO', debit: 0, credit: 0 }]);
    assert.equal(zeroTax.tvaCollectedGlobal, 0);
    assert.equal(zeroTax.unavailableSections.some((section) => section.includes('ventilation')), false);

    const zeroTaxAllocation = allocateCollectedVatByRate(
      5,
      new Map([[0, 0], [5, 0]]),
      new Map([[0, 1], [5, 2]]),
    );
    assert.ok(zeroTaxAllocation);
    assert.deepEqual([...zeroTaxAllocation], [[0, 2], [5, 3]]);
  });

  it('converts foreign-currency invoice lines into functional currency before reconciling posted VAT', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [{
      invoiceNumber: 'EUR-1',
      currencyCode: 'TND',
      subTotal: 340,
      taxAmount: 64.6,
      documentCurrencyCode: 'EUR',
      functionalCurrencyCode: 'TND',
      exchangeRate: 3.4,
      exchangeRateDate: '2026-10-29',
      exchangeRateSource: 'TEST: synthetic EUR/TND sample',
      items: [{ quantity: 1, unitPrice: 100, taxRate: 19 }],
    }], [], [
      { reference: 'EUR-1', debit: 0, credit: 64.6 },
    ], [], [], {
      salesVatAccountCode: '4367',
      purchaseVatAccountCode: '4366',
      corporateTaxRate: 20,
    });

    assert.equal(result.tvaCollectedGlobal, 64.6);
    assert.equal(result.rsWithholdingGlobal, null);
    assert.equal(result.isCorporateTaxGlobal, null);
    assert.equal(result.totalTaxToPay, null);
    assert.deepEqual(result.tvaDetailsCollected, [{
      rate: 19,
      baseHT: 340,
      tvaAmount: 64.6,
      label: 'TVA 19%',
    }]);
  });

  it('does not reconcile a foreign-currency invoice when its FX snapshot is incomplete', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [{
      invoiceNumber: 'EUR-NO-FX',
      taxAmount: 64.6,
      documentCurrencyCode: 'EUR',
      functionalCurrencyCode: 'TND',
      exchangeRate: null,
      items: [{ quantity: 1, unitPrice: 100, taxRate: 19 }],
    }], [], [
      { reference: 'EUR-NO-FX', debit: 0, credit: 64.6 },
    ]);

    assert.equal(result.tvaCollectedGlobal, null);
    assert.ok(result.unavailableSections.some((section) => section.includes('EUR-NO-FX')));
  });

  it('does not treat a legacy foreign-currency invoice without an FX snapshot as functional currency', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [{
      invoiceNumber: 'LEGACY-EUR-NO-FX',
      currencyCode: 'EUR',
      taxAmount: 19,
      items: [{ quantity: 1, unitPrice: 100, taxRate: 19 }],
    }], [], [{
      reference: 'LEGACY-EUR-NO-FX',
      debit: 0,
      credit: 19,
    }]);

    assert.equal(result.tvaCollectedGlobal, null);
    assert.ok(result.unavailableSections.some((section) => section.includes('devise') && section.includes('LEGACY-EUR-NO-FX')));
    assert.ok(result.correctionActions.some((action) => action.includes('devise') && action.includes('LEGACY-EUR-NO-FX')));
  });

  it('does not assume the functional currency when a legacy invoice has no currency code', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [{
      invoiceNumber: 'LEGACY-NO-CURRENCY',
      currencyCode: null,
      taxAmount: 19,
      items: [{ quantity: 1, unitPrice: 100, taxRate: 19 }],
    }], [], [{
      reference: 'LEGACY-NO-CURRENCY',
      debit: 0,
      credit: 19,
    }], [], [], {
      salesVatAccountCode: '4367',
      purchaseVatAccountCode: '4366',
      corporateTaxRate: 20,
    });

    assert.equal(result.tvaCollectedGlobal, null);
    assert.ok(result.unavailableSections.some((section) => section.includes('devise absente') && section.includes('LEGACY-NO-CURRENCY')));
  });

  it('marks a collected amount unavailable when an invoice has no rates to allocate to', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [{
      invoiceNumber: 'NO-LINES',
      taxAmount: 0,
      items: [],
    }], [], [{ reference: 'NO-LINES', debit: 0, credit: 0 }]);
    assert.equal(result.tvaCollectedGlobal, null);
    assert.ok(result.unavailableSections.some((section) => section.includes('ventilation par taux impossible')));
    assert.ok(result.correctionActions.some((action) => action.includes('sans lignes de facture')));
  });

  it('reports an invoice-header/line difference without blocking the declaration response', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [{
      invoiceNumber: 'HEADER-DIFF',
      taxAmount: 0,
      items: [{ quantity: 1, unitPrice: 100, taxRate: 19 }],
    }], [], [{ reference: 'HEADER-DIFF', debit: 0, credit: 0 }]);
    assert.equal(result.tvaCollectedGlobal, null);
    assert.match(result.complianceStatus, /INCOMPLET/);
    assert.ok(result.unavailableSections.some((section) => section.includes('HEADER-DIFF')));
    assert.ok(result.correctionActions.some((action) => action.includes('HEADER-DIFF')));
  });

  it('reports every collected VAT issue when several discrepancies coexist', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [{
      invoiceNumber: 'HEADER-DIFF',
      taxAmount: 0,
      items: [{ quantity: 1, unitPrice: 100, taxRate: 19 }],
    }], [], [
      { reference: 'ORPHAN-4367', debit: 0, credit: 5 },
      { reference: 'HEADER-DIFF', debit: 0, credit: 0 },
    ]);

    assert.equal(result.tvaCollectedGlobal, null);
    assert.ok(result.unavailableSections.some((section) => section.includes('HEADER-DIFF')));
    assert.ok(result.unavailableSections.some((section) => section.includes('ORPHAN-4367')));
    assert.ok(result.correctionActions.some((action) => action.includes('HEADER-DIFF')));
    assert.ok(result.correctionActions.some((action) => action.includes('ORPHAN-4367')));
  });

  it('does not fabricate deductible VAT or tax payment totals when source data is absent', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [], [], []);
    assert.equal(result.tvaCollectedGlobal, 0);
    assert.equal(result.tvaDeductibleGlobal, null);
    assert.equal(result.tvaDue, null);
    assert.equal(result.totalTaxToPay, null);
    assert.equal(result.unavailableSections.length, 3);
  });

  it('keeps corporate tax and withholding unavailable without validated bases and rules', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [], [], [], [], [], {
      salesVatAccountCode: null,
      purchaseVatAccountCode: null,
      corporateTaxRate: 20,
    });

    assert.equal(result.tvaCollectedGlobal, null);
    assert.equal(result.tvaDeductibleGlobal, null);
    assert.equal(result.rsWithholdingGlobal, null);
    assert.equal(result.isCorporateTaxGlobal, null);
    assert.equal(result.totalTaxToPay, null);
    assert.ok(result.unavailableSections.some((section) => section.includes('compte de TVA collectée non configuré')));
    assert.ok(result.unavailableSections.some((section) => section.includes('compte de TVA déductible non configuré')));
    assert.ok(result.unavailableSections.some((section) => section.includes('transactions de période ventilées par nature')));
    assert.ok(result.unavailableSections.some((section) => section.includes('base imposable justifiée et règles de retraitement validées non disponibles') && section.includes('taux pays configuré à 20%')));
    assert.ok(result.correctionActions.some((action) => action.includes('Configurez le compte de TVA collectée')));
    assert.ok(result.correctionActions.some((action) => action.includes('transactions de période') && action.includes('source compétente')));
    assert.ok(result.correctionActions.some((action) => action.includes('Faites valider les règles de détermination') && action.includes('base justifiée')));
  });

  it('does not infer corporate tax or withholding from available VAT data and the configured TN rate', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [{
      invoiceNumber: 'VAT-ONLY',
      currencyCode: 'TND',
      taxAmount: 19,
      items: [{ quantity: 1, unitPrice: 100, taxRate: 19 }],
    }], [], [{
      reference: 'VAT-ONLY',
      debit: 0,
      credit: 19,
    }], [], [], {
      salesVatAccountCode: '4367',
      purchaseVatAccountCode: '4366',
      corporateTaxRate: 20,
    });

    assert.equal(result.tvaCollectedGlobal, 19);
    assert.equal(result.rsWithholdingGlobal, null);
    assert.equal(result.isCorporateTaxGlobal, null);
    assert.equal(result.totalTaxToPay, null);
    assert.ok(result.unavailableSections.some((section) => section.startsWith('Retenues à la source G50 :')));
    assert.ok(result.unavailableSections.some((section) => section.includes('taux pays configuré à 20%; montant non calculé')));
  });

  it('uses only source-reviewed RS and IS workpaper amounts without deriving an IS formula', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [], [], [], [], [], {
      salesVatAccountCode: '4367',
      purchaseVatAccountCode: '4366',
      corporateTaxRate: 20,
      rsWithholdingAmount: 12.345,
      corporateTaxAmount: 200,
      corporateTaxableBase: 1000,
    });

    assert.equal(result.rsWithholdingGlobal, 12.345);
    assert.equal(result.isCorporateTaxGlobal, 200);
    assert.equal(result.totalTaxToPay, null);
    assert.equal(result.unavailableSections.some((section) => section.startsWith('Retenues à la source G50 :')), false);
    assert.equal(result.unavailableSections.some((section) => section.startsWith('Impôt sur les sociétés :')), false);
  });

  it('marks deductible VAT unavailable when posted amounts are invalid or below millime precision', () => {
    for (const invalidLine of [
      { accountCode: '4366', debit: Number.NaN, credit: 0 },
      { accountCode: '4366', debit: -1, credit: 0 },
      { accountCode: '4366', debit: 0.0001, credit: 0 },
      { accountCode: '4366', debit: 1, credit: 1 },
    ]) {
      const result = calculateTaxDeclaration('2026-10', 'TND', [], [invalidLine], []);
      assert.equal(result.tvaDeductibleGlobal, null);
      assert.equal(result.tvaDue, null);
      assert.ok(result.unavailableSections.some((section) => section.includes('lignes 4366 invalides')));
      assert.ok(result.correctionActions.some((action) => action.includes('Corrigez les débits/crédits 4366')));
      assert.match(result.complianceStatus, /INCOMPLET/);
    }
  });

  it('marks deductible VAT unavailable when aggregate millime precision exceeds safe integer bounds', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [], [
      { accountCode: '4366', debit: 6_000_000_000_000, credit: 0 },
      { accountCode: '4366', debit: 6_000_000_000_000, credit: 0 },
    ], []);

    assert.equal(result.tvaDeductibleGlobal, null);
    assert.equal(result.tvaDue, null);
    assert.ok(result.unavailableSections.some((section) => section.includes('lignes 4366 invalides')));
    assert.ok(result.correctionActions.some((action) => action.includes('Corrigez les débits/crédits 4366')));
  });

  it('marks collected VAT unavailable when the period aggregate exceeds safe millime precision', () => {
    const invoice = (invoiceNumber: string) => ({
      invoiceNumber,
      taxAmount: 5_700_000_000_000,
      items: [{ quantity: 1, unitPrice: 30_000_000_000_000, taxRate: 19 }],
    });
    const result = calculateTaxDeclaration('2026-10', 'TND', [
      invoice('LARGE-1'),
      invoice('LARGE-2'),
    ], [], [
      { reference: 'LARGE-1', debit: 0, credit: 5_700_000_000_000 },
      { reference: 'LARGE-2', debit: 0, credit: 5_700_000_000_000 },
    ]);

    assert.equal(result.tvaCollectedGlobal, null);
    assert.ok(result.unavailableSections.some((section) => section.includes('total agrégé hors précision sûre')));
    assert.ok(result.correctionActions.some((action) => action.includes('Corrigez les débits/crédits des écritures 4367')));
  });

  it('marks VAT unavailable when invoice totals do not reconcile to posted ledger entries', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [
      { invoiceNumber: 'A', taxAmount: 3.8, items: [{ quantity: 2, unitPrice: 10, taxRate: 19 }] },
    ], [{ accountCode: '4366', debit: 0, credit: 1 }], []);
    assert.equal(result.tvaCollectedGlobal, null);
    assert.equal(result.tvaDue, null);
    assert.deepEqual(result.tvaDetailsCollected, []);
    assert.ok(result.unavailableSections.some((section) => section.includes('écart')));
  });

  it('does not report deductible VAT when purchase documents and the mapped ledger disagree', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [], [{
      accountCode: '4366',
      reference: 'PI-1',
      debit: 18,
      credit: 0,
    }], [], [{
      invoiceNumber: 'PI-1',
      subTotal: 100,
      taxAmount: 19,
      taxRate: 19,
      purchaseVatRecoverable: true,
    }]);
    assert.equal(result.tvaDeductibleGlobal, null);
    assert.equal(result.tvaDue, null);
    assert.ok(result.unavailableSections.some((section) => section.includes('écart entre factures/avoirs')));
    assert.ok(result.correctionActions.some((action) => action.includes('Rapprochez les factures/avoirs')));
  });

  it('excludes configured nonrecoverable purchase VAT from the deductible total', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [], [], [], [{
      invoiceNumber: 'PI-NONREC',
      subTotal: 100,
      taxAmount: 19,
      taxRate: 19,
      purchaseVatRecoverable: false,
    }]);

    assert.equal(result.tvaDeductibleGlobal, 0);
    assert.equal(result.tvaDue, 0);
    assert.deepEqual(result.tvaDetailsDeductibleByRate, []);
  });

  it('withholds deductible VAT when the purchase rate recoverability is not configured', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [], [], [], [{
      invoiceNumber: 'PI-UNKNOWN',
      subTotal: 100,
      taxAmount: 19,
      taxRate: 19,
      purchaseVatRecoverable: null,
    }]);

    assert.equal(result.tvaDeductibleGlobal, null);
    assert.ok(result.unavailableSections.some((section) => section.includes('récupérabilité TVA non configurée')));
  });

  it('keeps the declaration available with a correction diagnostic for invalid invoice tax data', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [
      {
        invoiceNumber: 'INV-BAD',
        taxAmount: Number.NaN,
        items: [{ quantity: 1, unitPrice: 20, taxRate: 19 }],
      },
    ], [], []);

    assert.equal(result.tvaCollectedGlobal, null);
    assert.equal(result.tvaDue, null);
    assert.match(result.complianceStatus, /INCOMPLET/);
    assert.ok(result.unavailableSections.some((section) => section.includes('INV-BAD')));
    assert.ok(result.correctionActions.some((action) => action.includes('INV-BAD') && action.includes('pièces justificatives')));
  });

  it('marks collected VAT unavailable when matched ledger amounts are invalid or below millime precision', () => {
    const invoice = { invoiceNumber: 'A', taxAmount: 0, items: [] };
    for (const invalidLine of [
      { reference: 'A', debit: Number.NaN, credit: 0 },
      { reference: 'A', debit: -1, credit: 0 },
      { reference: 'A', debit: 0.0001, credit: 0 },
      { reference: 'A', debit: 1, credit: 1 },
    ]) {
      const result = calculateTaxDeclaration('2026-10', 'TND', [invoice], [], [invalidLine]);
      assert.equal(result.tvaCollectedGlobal, null);
      assert.equal(result.tvaDue, null);
      assert.ok(result.unavailableSections.some((section) => section.includes('lignes 4367 invalides')));
      assert.ok(result.correctionActions.some((action) => action.includes('Corrigez les débits/crédits des écritures 4367')));
      assert.match(result.complianceStatus, /INCOMPLET/);
    }
  });

  it('marks collected VAT unavailable when posted VAT lines have no matching invoice', () => {
    const result = calculateTaxDeclaration('2026-10', 'TND', [], [], [
      { reference: 'ADJUSTMENT-1', debit: 0, credit: 12 },
      { reference: null, debit: 0, credit: 3 },
    ]);
    assert.equal(result.tvaCollectedGlobal, null);
    assert.equal(result.tvaDue, null);
    assert.ok(result.unavailableSections.some((section) => section.includes('écart')));
    assert.ok(result.correctionActions.some((action) => action.includes('Rapprochez chaque écriture postée 4367')));
  });
});
