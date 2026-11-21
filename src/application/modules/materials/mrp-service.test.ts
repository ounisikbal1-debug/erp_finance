import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MrpEngineService, type MaterialPlanningItem } from './mrp-service';

describe('Planification SAFE: Material Requirements Planning & Multi-Level BOM Explosion', () => {
  const mrpService = new MrpEngineService();

  it('calculates net requirements and explodes BOM to trigger component purchase requisitions', () => {
    // Produit Fini: Palette Plastique Haute Résistance (Fabriquée)
    // Composant: Granulés Polypropylène HD (Acheté)
    const materials: MaterialPlanningItem[] = [
      {
        code: 'FIN-PALETTE-01',
        name: 'Palette Plastique Industrielle 1200x800',
        type: 'MANUFACTURED',
        currentStock: 50,
        safetyStock: 20,
        incomingSupply: 0,
        grossRequirements: 150, // Besoin client de 150 palettes
        leadTimeDays: 5,
        minOrderQuantity: 100,
        bomComponents: [
          {
            componentCode: 'RAW-PP-HD',
            componentName: 'Granulés Polypropylène HD (kg)',
            quantityPerUnit: 12, // 12 kg par palette
          },
        ],
      },
      {
        code: 'RAW-PP-HD',
        name: 'Granulés Polypropylène HD (kg)',
        type: 'PURCHASED',
        currentStock: 400,
        safetyStock: 100,
        incomingSupply: 200,
        grossRequirements: 0, // Pas de demande directe client
        leadTimeDays: 14,
        minOrderQuantity: 1000,
      },
    ];

    const result = mrpService.runMrp(materials, new Date('2026-12-01T00:00:00Z'));

    assert.equal(result.plannedOrders.length, 2, 'Should create 1 Production Order and 1 Purchase Requisition');

    // 1. Ordre de fabrication pour la palette
    const prodOrder = result.plannedOrders.find((o) => o.materialCode === 'FIN-PALETTE-01');
    assert.ok(prodOrder);
    assert.equal(prodOrder.orderType, 'PRODUCTION_ORDER');
    // Disponibilité projetée = 50 (stock) - 20 (sécurité) = 30
    // Besoin net = 150 - 30 = 120 palettes
    assert.equal(prodOrder.netQuantity, 120);
    // Quantité suggérée = max(120, minOrderQty 100) = 120
    assert.equal(prodOrder.suggestedQuantity, 120);

    // 2. Demande d'achat pour le polypropylène (explosion de nomenclature)
    // Besoin brut en PP = 120 palettes * 12 kg = 1 440 kg
    // Dispo projetée PP = 400 (stock) + 200 (en cours) - 100 (sécurité) = 500 kg
    // Besoin net PP = 1 440 - 500 = 940 kg
    // Quantité suggérée = max(940, minOrderQty 1000) = 1 000 kg !
    const purchReq = result.plannedOrders.find((o) => o.materialCode === 'RAW-PP-HD');
    assert.ok(purchReq);
    assert.equal(purchReq.orderType, 'PURCHASE_REQUISITION');
    assert.equal(purchReq.grossQuantity, 1440);
    assert.equal(purchReq.netQuantity, 940);
    assert.equal(purchReq.suggestedQuantity, 1000);
  });
});
