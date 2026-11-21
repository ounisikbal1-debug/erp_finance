import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildStockAdjustmentWhere,
  validateBarcode,
  validateMaterialInput,
  validateMaterialUnitCode,
  validateMinimumStock,
  validateStockAdjustmentReason,
  validateStockDelta,
} from './validation';

describe('validateMaterialInput', () => {
  it('uses the authenticated entity and accepts valid stock and prices', () => {
    assert.deepEqual(validateMaterialInput({
      sku: ' SKU-1 ',
      name: ' Article ',
      quantity: 3,
      unitPrice: 12.5,
      costPrice: 8,
      barcode: ' 3760001 ',
      unitCode: 'kg',
      minimumStock: 2,
      initialStockReason: 'Inventaire initial',
      entityId: 'other-entity',
    }, 'entity-1'), {
      sku: 'SKU-1',
      name: 'Article',
      quantity: 3,
      unitPrice: 12.5,
      costPrice: 8,
      unitCode: 'KG',
      barcode: '3760001',
      minimumStock: 2,
      initialStockReason: 'Inventaire initial',
      entityId: 'entity-1',
    });

    it('accepts fractional measurements but keeps countable units whole', () => {
      assert.equal(validateMaterialInput({
        sku: 'KG-1',
        name: 'Huile',
        unitCode: 'L',
        quantity: 1.275,
        minimumStock: 0.5,
        unitPrice: 4,
        initialStockReason: 'Inventaire initial',
      }, 'entity-1').quantity, 1.275);
      assert.throws(() => validateMaterialInput({
        sku: 'EA-1',
        name: 'Pièce',
        unitCode: 'EA',
        quantity: 1.5,
        unitPrice: 4,
      }, 'entity-1'), /nombre entier/);
      assert.throws(() => validateMaterialInput({
        sku: 'KG-2',
        name: 'Farine',
        unitCode: 'KG',
        quantity: 1.0001,
        unitPrice: 4,
      }, 'entity-1'), /trois décimales/);
    });
  });

  it('rejects invalid names, quantities and prices', () => {
    assert.throws(() => validateMaterialInput({ sku: 'A', name: ' ' , unitPrice: 1 }, 'entity-1'), /obligatoires/);
    assert.throws(() => validateMaterialInput({ sku: 'A', name: 'A', quantity: -1, unitPrice: 1 }, 'entity-1'), /stock initial/);
    assert.throws(() => validateMaterialInput({ sku: 'A', name: 'A', unitPrice: Number.NaN }, 'entity-1'), /prix de vente/);
    assert.throws(() => validateMaterialInput({
      sku: 'A', name: 'A', quantity: 1, unitPrice: 1,
    }, 'entity-1'), /motif/);
    assert.throws(() => validateMaterialInput(null, 'entity-1'), /Données article invalides/);
  });
});

describe('validateStockDelta', () => {
  it('accepts integer adjustments in either direction', () => {
    assert.equal(validateStockDelta(4), 4);
    assert.equal(validateStockDelta(-2), -2);
  });

  it('accepts fractional measured adjustments and rejects invalid quantities', () => {
    assert.equal(validateStockDelta(0.5, 'KG'), 0.5);
    for (const delta of [0, 0.0001, '2', Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => validateStockDelta(delta));
    }
    assert.throws(() => validateStockDelta(0.5, 'EA'), /nombre entier/);
  });

  it('builds an entity-scoped atomic stock guard for underflow and overflow', () => {
    assert.deepEqual(buildStockAdjustmentWhere('sku-1', 'entity-1', -3), {
      id: 'sku-1',
      entityId: 'entity-1',
      quantity: { gte: 3 },
    });
    assert.deepEqual(buildStockAdjustmentWhere('sku-1', 'entity-1', 3), {
      id: 'sku-1',
      entityId: 'entity-1',
      quantity: { lte: 2_147_483_644 },
    });
  });

  describe('stock metadata and audited adjustment validation', () => {
    it('normalizes supported units and optional barcode and minimum-stock metadata', () => {
      assert.equal(validateMaterialUnitCode(' ea '), 'EA');
      assert.equal(validateBarcode(' 12345 '), '12345');
      assert.equal(validateBarcode(' '), null);
      assert.equal(validateMinimumStock(0), 0);
      assert.equal(validateMinimumStock(null), null);
      assert.throws(() => validateMaterialUnitCode('unknown'));
      assert.throws(() => validateBarcode('x'.repeat(129)));
      assert.throws(() => validateMinimumStock(1.5));
      assert.equal(validateMinimumStock(1.5, 'KG'), 1.5);
    });

    it('requires a meaningful reason for stock changes', () => {
      assert.equal(validateStockAdjustmentReason('  Comptage annuel  '), 'Comptage annuel');
      assert.throws(() => validateStockAdjustmentReason('non'));
      assert.throws(() => validateStockAdjustmentReason('x'.repeat(501)));
    });
  });
});
