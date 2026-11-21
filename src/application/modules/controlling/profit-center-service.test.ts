import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProfitCenterService, type CostAllocationCycle, type ProfitCenter } from './profit-center-service';

describe('Contrôle analytique SAFE: Profit Center Accounting & Cost Allocation Cycles', () => {
  const service = new ProfitCenterService();

  it('distributes indirect overhead costs across receiver profit centers with exact rounding conservation', () => {
    // Cycle de répartition des frais généraux RH (100 000 DT) vers 3 centres de profit
    const cycle: CostAllocationCycle = {
      id: 'cyc-1',
      entityId: 'ent-1',
      cycleCode: 'ALLOC-RH-2026',
      name: 'Répartition Frais RH Groupe',
      senderCostCenterCode: 'CC-RH',
      allocationBasis: 'HEADCOUNT',
      shares: [
        { profitCenterCode: 'PC-VENTES-LOCALES', weight: 45 }, // 45%
        { profitCenterCode: 'PC-EXPORT-UE', weight: 35 },     // 35%
        { profitCenterCode: 'PC-SERVICES', weight: 20 },      // 20%
      ],
    };

    const results = service.executeCostAllocation(100000, cycle);

    assert.equal(results.length, 3);
    assert.equal(results[0].profitCenterCode, 'PC-VENTES-LOCALES');
    assert.equal(results[0].allocatedAmount, 45000);
    assert.equal(results[1].profitCenterCode, 'PC-EXPORT-UE');
    assert.equal(results[1].allocatedAmount, 35000);
    assert.equal(results[2].profitCenterCode, 'PC-SERVICES');
    assert.equal(results[2].allocatedAmount, 20000);

    const totalAllocated = results.reduce((acc, r) => acc + r.allocatedAmount, 0);
    assert.equal(totalAllocated, 100000, 'Sum of allocations must strictly match total source amount');
  });

  it('calculates managerial P&L by Profit Center with gross and operating margins', () => {
    const pc: ProfitCenter = {
      id: 'pc-1',
      entityId: 'ent-1',
      code: 'PC-EXPORT-UE',
      name: 'Ligne Export Union Européenne',
      segment: 'EXPORT',
      manager: 'Karim Ben Salem',
      isActive: true,
    };

    // CA: 500 000 DT, Coûts directs (matières + transport): 320 000 DT, Frais indirects alloués: 65 000 DT
    const pnl = service.calculateProfitCenterPnl(pc, 500000, 320000, 65000);

    assert.equal(pnl.grossMargin, 180000);
    assert.equal(pnl.grossMarginPercent, 36);
    assert.equal(pnl.operatingResult, 115000);
    assert.equal(pnl.operatingMarginPercent, 23);
  });
});
