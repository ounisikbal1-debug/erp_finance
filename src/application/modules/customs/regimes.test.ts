import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  validateCustomsBondInput,
  validateCustomsBondReleaseInput,
  validateCustomsRegimeInput,
  validateCustomsRegimeStatus,
  validateCustomsStockMovementInput,
  validateCustomsStockSheetInput,
} from './regimes';

describe('temporary customs regime validation', () => {
  it('accepts AT/ACT references and validates effective periods', () => {
    const regime = validateCustomsRegimeInput({
      regimeType: 'ACT',
      regimeReference: 'ACT-REF-01',
      title: 'Transformation textile',
      startsAt: '2026-01-01',
      endsAt: '2026-12-31',
      reference: 'Autorisation saisie',
    });
    assert.equal(regime.regimeType, 'ACT');
    assert.equal(regime.startsAt?.toISOString(), '2026-01-01T00:00:00.000Z');
    assert.throws(() => validateCustomsRegimeInput({
      regimeType: 'AT',
      regimeReference: 'AT-1',
      title: 'Admission',
      startsAt: '2026-12-31',
      endsAt: '2026-01-01',
    }), /ne peut pas précéder/);
    assert.throws(() => validateCustomsRegimeStatus('APPROVED'), /statut/);
  });

  it('validates stock sheet identifiers and manually entered stock movements', () => {
    assert.deepEqual(validateCustomsStockSheetInput({
      sheetReference: 'SHEET-1',
      tariffCode: '1234567890',
      itemDescription: 'Intrant textile',
      unitCode: 'kg',
    }), {
      sheetReference: 'SHEET-1',
      tariffCode: '1234567890',
      itemDescription: 'Intrant textile',
      unitCode: 'KG',
    });
    assert.throws(() => validateCustomsStockSheetInput({
      sheetReference: 'SHEET-2',
      tariffCode: '123',
      itemDescription: 'Intrant',
      unitCode: 'kg',
    }), /10 chiffres/);
    assert.equal(validateCustomsStockMovementInput({
      direction: 'OUTBOUND',
      quantity: 2.5,
      occurredAt: '2026-11-12',
      reference: 'SORTIE-1',
    }).quantity, 2.5);
    assert.throws(() => validateCustomsStockMovementInput({
      direction: 'OUTBOUND',
      quantity: 0,
      occurredAt: '2026-11-12',
      reference: 'SORTIE-1',
    }), /supérieure à zéro/);
  });

  it('records a caution and its manually referenced release without deriving an amount', () => {
    assert.equal(validateCustomsBondInput({
      bondReference: 'BOND-1',
      amount: 1250,
      currencyCode: 'tnd',
    }).currencyCode, 'TND');
    assert.deepEqual(validateCustomsBondReleaseInput({
      releasedAt: '2026-11-12',
      releaseReference: 'MAINLEVEE-1',
    }), {
      releasedAt: new Date('2026-11-12T00:00:00.000Z'),
      releaseReference: 'MAINLEVEE-1',
    });
    assert.throws(() => validateCustomsBondInput({
      bondReference: 'BOND-2',
      amount: 0,
      currencyCode: 'TND',
    }), /supérieur à zéro/);
  });
});
