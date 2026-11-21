import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateTunisianWithholding,
  parseTunisianWithholdingInput,
} from './withholding';

describe('Tunisian withholding preview', () => {
  it('calculates only explicit user-provided rates on the TTC base', () => {
    const result = calculateTunisianWithholding({
      period: '2026-10',
      category: 'honoraires_reel',
      amountTtc: 1000,
      selectedRate: 3,
      declarantType: 'PERSONNE_PHYSIQUE',
      isEmployer: true,
    });

    assert.equal(result.status, 'CALCULATED');
    assert.equal(result.baseTtc, 1000);
    assert.equal(result.rate, 3);
    assert.equal(result.amount, 30);
    assert.equal(result.monthlyDeclarationDueDate, '2026-11-15');
    assert.equal(result.annualDeclarationDueDate, '2027-02-27');
    assert.equal(result.certificate.required, true);
    assert.equal(result.certificate.recipient, 'supplier');
    assert.equal(result.certificate.status, 'PREPARATION_AVAILABLE');
    assert.equal(result.ruleBasis, 'USER_REPORTED_EXPERT_VALIDATION_IMPLEMENTATION_UNVERIFIED');
    assert.equal(result.ruleProvenance.source, 'Documentation tunisienne déclarée validée par un expert-comptable du client');
    assert.equal(result.ruleProvenance.sourceDate, null);
    assert.equal(result.ruleProvenance.effectiveFrom, null);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.includes('correspondance et leur exécution dans SAFE restent à vérifier')));
  });

  it('calculates the unambiguous categories and keeps previously conflicting category rates selectable', () => {
    const fixedCases = [
      ['honoraires_residents', 15],
      ['loyers_batis_non_batis_materiel', 15],
      ['dividendes', 10],
      ['interets_depots_comptes_courants', 20],
      ['obligations_titres_assimiles', 20],
      ['jetons_presence', 20],
      ['livraisons_sans_carte_fiscale', 3],
    ] as const;
    for (const [category, rate] of fixedCases) {
      const result = calculateTunisianWithholding({ period: '2026-10', category, amountTtc: 100 });
      assert.equal(result.rate, rate);
      assert.equal(result.amount, rate);
    }

    const disputedCases = [
      ['honoraires_non_residents', 25],
      ['honoraires_forfaitaire', 15],
      ['architectes_ingenieurs_conseils', 10],
      ['artistes_sportifs', 5],
      ['commissions_courtage', 15],
      ['location_hotels', 5],
      ['location_materiel', 1],
    ] as const;
    for (const [category, selectedRate] of disputedCases) {
      const result = calculateTunisianWithholding({
        period: '2026-10',
        category,
        amountTtc: 100,
        selectedRate,
      });
      assert.equal(result.status, 'CALCULATED');
      assert.equal(result.rate, selectedRate);
      assert.equal(result.amount, selectedRate);
    }
  });

  it('requires an independently selected rate for purchases at or above 1,000 TND TTC', () => {
    for (const selectedRate of [0.5, 1, 1.5]) {
      const result = calculateTunisianWithholding({
        period: '2026-12',
        category: 'achats',
        amountTtc: 1000,
        supplierFiscalIdPresent: true,
        selectedRate,
        declarantType: 'PERSONNE_MORALE',
      });
      assert.equal(result.rate, selectedRate);
      assert.equal(result.amount, selectedRate * 10);
      assert.equal(result.monthlyDeclarationDueDate, '2027-01-28');
    }

    const unresolved = calculateTunisianWithholding({
      period: '2026-12',
      category: 'achats',
      amountTtc: 1000,
      supplierFiscalIdPresent: true,
    });
    assert.equal(unresolved.status, 'UNAVAILABLE');
    assert.equal(unresolved.amount, null);
    assert.ok(unresolved.correctionActions.some((action) => action.includes('aucun taux n’est sélectionné automatiquement')));
  });

  it('applies the supplied no-fiscal-ID rule and does not apply the purchase rule below threshold', () => {
    const unknownFiscalId = calculateTunisianWithholding({
      period: '2026-10',
      category: 'achats',
      amountTtc: 1000,
    });
    const noFiscalId = calculateTunisianWithholding({
      period: '2026-10',
      category: 'achats',
      amountTtc: 1000,
      supplierFiscalIdPresent: false,
    });
    const belowThreshold = calculateTunisianWithholding({
      period: '2026-10',
      category: 'achats',
      amountTtc: 999.999,
      supplierFiscalIdPresent: true,
      selectedRate: 1,
    });

    assert.equal(unknownFiscalId.status, 'UNAVAILABLE');
    assert.equal(unknownFiscalId.amount, null);
    assert.equal(noFiscalId.rate, 15);
    assert.equal(noFiscalId.amount, 150);
    assert.equal(belowThreshold.status, 'NOT_APPLICABLE');
    assert.equal(belowThreshold.rate, 0);
    assert.equal(belowThreshold.amount, 0);
    assert.equal(belowThreshold.certificate.required, false);
  });

  it('blocks ambiguous rates and foreign payments without an explicit review', () => {
    const ambiguous = calculateTunisianWithholding({
      period: '2026-10',
      category: 'location_materiel',
      amountTtc: 1000,
    });
    const unreviewed = calculateTunisianWithholding({
      period: '2026-10',
      category: 'paiements_etranger',
      amountTtc: 1000,
    });
    const reviewed = calculateTunisianWithholding({
      period: '2026-10',
      category: 'paiements_etranger',
      amountTtc: 1000,
      foreignTreatyReview: 'no_adjustment',
    });
    const adjusted = calculateTunisianWithholding({
      period: '2026-10',
      category: 'paiements_etranger',
      amountTtc: 1000,
      foreignTreatyReview: 'adjusted_rate',
      treatyAdjustedRate: 10,
    });

    assert.equal(ambiguous.status, 'UNAVAILABLE');
    assert.equal(ambiguous.amount, null);
    assert.equal(unreviewed.status, 'UNAVAILABLE');
    assert.equal(unreviewed.amount, null);
    assert.equal(reviewed.rate, 20);
    assert.equal(reviewed.amount, 200);
    assert.equal(adjusted.rate, 10);
    assert.equal(adjusted.amount, 100);
  });

  it('uses the supplied deadlines only when declarant and employer status are known', () => {
    const individual = calculateTunisianWithholding({
      period: '2026-12',
      category: 'dividendes',
      amountTtc: 100,
      declarantType: 'PERSONNE_PHYSIQUE',
      isEmployer: false,
    });
    const companyEmployer = calculateTunisianWithholding({
      period: '2026-12',
      category: 'dividendes',
      amountTtc: 100,
      declarantType: 'PERSONNE_MORALE',
      isEmployer: true,
    });
    assert.equal(individual.monthlyDeclarationDueDate, '2027-01-15');
    assert.equal(individual.annualDeclarationDueDate, null);
    assert.equal(companyEmployer.monthlyDeclarationDueDate, '2027-01-28');
    assert.equal(companyEmployer.annualDeclarationDueDate, '2027-02-27');
  });

  it('keeps transport exemption limited to employer-provided transport from 2026', () => {
    const currentRule = calculateTunisianWithholding({
      period: '2026-01',
      category: 'transport_domicile_travail',
      amountTtc: 100,
      isEmployer: true,
    });
    const earlierPeriod = calculateTunisianWithholding({
      period: '2025-12',
      category: 'transport_domicile_travail',
      amountTtc: 100,
      isEmployer: true,
    });
    const unknownEmployer = calculateTunisianWithholding({
      period: '2026-01',
      category: 'transport_domicile_travail',
      amountTtc: 100,
      isEmployer: false,
    });
    assert.equal(currentRule.status, 'NOT_APPLICABLE');
    assert.equal(currentRule.amount, 0);
    assert.equal(currentRule.ruleProvenance.effectiveFrom, '2026-01');
    assert.ok(currentRule.diagnostics.some((diagnostic) => diagnostic.includes('liste des trois moyens non fournie')));
    assert.equal(earlierPeriod.status, 'UNAVAILABLE');
    assert.equal(earlierPeriod.amount, null);
    assert.equal(unknownEmployer.status, 'UNAVAILABLE');
    assert.equal(unknownEmployer.amount, null);
  });

  it('does not derive any RS rate from external corporate-tax values', () => {
    const base = {
      period: '2026-10',
      category: 'achats' as const,
      amountTtc: 1000,
      supplierFiscalIdPresent: true,
      selectedRate: 1,
    };
    const withoutExternalTaxField = calculateTunisianWithholding(base);
    const withLowerExternalTaxValue = calculateTunisianWithholding(Object.assign({}, base, { supplierCorporateTaxRate: 10 }));
    const withHigherExternalTaxValue = calculateTunisianWithholding(Object.assign({}, base, { supplierCorporateTaxRate: 40 }));
    assert.deepEqual(withLowerExternalTaxValue, withoutExternalTaxField);
    assert.deepEqual(withHigherExternalTaxValue, withoutExternalTaxField);
    assert.throws(() => parseTunisianWithholdingInput({
      ...base,
      supplierCorporateTaxRate: 20,
    }), /Paramètres de retenue inconnus/);
  });

  it('rejects invalid amount precision, period and declarant inputs', () => {
    const invalid = calculateTunisianWithholding({
      period: '2026-13',
      category: 'dividendes',
      amountTtc: 10.0001,
    });
    assert.equal(invalid.status, 'UNAVAILABLE');
    assert.equal(invalid.baseTtc, null);
    assert.equal(invalid.amount, null);
    assert.equal(invalid.monthlyDeclarationDueDate, null);
    assert.ok(invalid.diagnostics.some((diagnostic) => diagnostic.includes('Période invalide')));
    assert.ok(invalid.diagnostics.some((diagnostic) => diagnostic.includes('Base TTC invalide')));
    assert.throws(() => parseTunisianWithholdingInput({
      period: '2026-10',
      category: 'dividendes',
      amountTtc: 10,
      declarantType: 'INVALID',
    }), /type de déclarant/);
    assert.throws(() => parseTunisianWithholdingInput({
      period: '2026-10',
      category: 'dividendes',
      amountTtc: 10,
      isEmployer: 'yes',
    }), /statut employeur/);
  });
});
