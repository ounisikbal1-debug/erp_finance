import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterMaterialsByStockSearch } from './stockBarcodeSearch';

const materials = [
  { sku: 'RAW-1', name: 'Acier brut', barcode: '3760001' },
  { sku: 'FIN-2', name: 'Panneau fini', barcode: null },
];

describe('filterMaterialsByStockSearch', () => {
  it('finds by exact or partial barcode, SKU, or description', () => {
    assert.deepEqual(filterMaterialsByStockSearch(materials, '3760001'), [materials[0]]);
    assert.deepEqual(filterMaterialsByStockSearch(materials, 'RAW'), [materials[0]]);
    assert.deepEqual(filterMaterialsByStockSearch(materials, 'panneau'), [materials[1]]);
  });

  it('returns all materials when the scanner/search field is empty', () => {
    assert.deepEqual(filterMaterialsByStockSearch(materials, '  '), materials);
  });
});
