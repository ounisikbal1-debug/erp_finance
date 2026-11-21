export interface ProfitCenter {
  id: string;
  entityId: string;
  code: string;
  name: string;
  segment: string; // IFRS 8 segment (ex: 'PACKAGING', 'EXPORT', 'RETAIL')
  manager: string;
  isActive: boolean;
}

export interface AllocationRuleItem {
  profitCenterCode: string;
  weight: number; // ex: 50% ou effectif ou CA
}

export interface CostAllocationCycle {
  id: string;
  entityId: string;
  cycleCode: string;
  name: string;
  senderCostCenterCode: string; // ex: 'CC-RH'
  allocationBasis: 'PERCENTAGE' | 'HEADCOUNT' | 'TURNOVER';
  shares: AllocationRuleItem[];
  lastRunDate?: string | null;
}

export interface AllocatedCostResult {
  profitCenterCode: string;
  percentage: number;
  allocatedAmount: number;
}

export interface ProfitCenterPnl {
  profitCenterCode: string;
  profitCenterName: string;
  segment: string;
  revenue: number;
  directCosts: number;
  grossMargin: number;
  grossMarginPercent: number;
  allocatedIndirectCosts: number;
  operatingResult: number;
  operatingMarginPercent: number;
}

export class ProfitCenterService {
  /**
   * Calcule la répartition analytique d'une charge indirecte vers les centres de profit récepteurs
   */
  public executeCostAllocation(
    totalCostToAllocate: number,
    cycle: CostAllocationCycle,
  ): AllocatedCostResult[] {
    if (totalCostToAllocate <= 0) return [];
    if (!cycle.shares || cycle.shares.length === 0) {
      throw new Error('Le cycle de répartition ne contient aucun centre de profit récepteur.');
    }

    const totalWeight = cycle.shares.reduce((acc, s) => acc + s.weight, 0);
    if (totalWeight <= 0) {
      throw new Error('Le total des coefficients de pondération doit être supérieur à zéro.');
    }

    let allocatedSum = 0;
    const results: AllocatedCostResult[] = [];

    for (let i = 0; i < cycle.shares.length; i++) {
      const share = cycle.shares[i];
      const isLast = i === cycle.shares.length - 1;
      const pct = (share.weight / totalWeight) * 100;

      // Pour éviter les écarts d'arrondis sur le dernier centre
      const amount = isLast
        ? Math.round(totalCostToAllocate - allocatedSum)
        : Math.round((share.weight / totalWeight) * totalCostToAllocate);

      allocatedSum += amount;
      results.push({
        profitCenterCode: share.profitCenterCode,
        percentage: Number(pct.toFixed(2)),
        allocatedAmount: amount,
      });
    }

    return results;
  }

  /**
   * Génère le Compte de Résultat Analytique (P&L) par Centre de Profit
   */
  public calculateProfitCenterPnl(
    profitCenter: ProfitCenter,
    revenue: number,
    directCosts: number,
    allocatedIndirectCosts: number,
  ): ProfitCenterPnl {
    const grossMargin = revenue - directCosts;
    const grossMarginPercent = revenue > 0 ? Number(((grossMargin / revenue) * 100).toFixed(2)) : 0;
    const operatingResult = grossMargin - allocatedIndirectCosts;
    const operatingMarginPercent = revenue > 0 ? Number(((operatingResult / revenue) * 100).toFixed(2)) : 0;

    return {
      profitCenterCode: profitCenter.code,
      profitCenterName: profitCenter.name,
      segment: profitCenter.segment,
      revenue,
      directCosts,
      grossMargin,
      grossMarginPercent,
      allocatedIndirectCosts,
      operatingResult,
      operatingMarginPercent,
    };
  }
}
