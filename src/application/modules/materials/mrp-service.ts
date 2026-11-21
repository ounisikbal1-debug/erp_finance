export type MaterialProcurementType = 'PURCHASED' | 'MANUFACTURED';

export interface BomComponent {
  componentCode: string;
  componentName: string;
  quantityPerUnit: number;
}

export interface MaterialPlanningItem {
  code: string;
  name: string;
  type: MaterialProcurementType;
  currentStock: number;
  safetyStock: number;
  incomingSupply: number; // Commandes d'achat ou OF en cours
  grossRequirements: number; // Commandes clients / prévisions
  leadTimeDays: number;
  minOrderQuantity: number;
  bomComponents?: BomComponent[];
}

export interface MrpPlannedOrder {
  id: string;
  materialCode: string;
  materialName: string;
  orderType: 'PURCHASE_REQUISITION' | 'PRODUCTION_ORDER';
  grossQuantity: number;
  netQuantity: number;
  suggestedQuantity: number;
  suggestedDueDate: string;
  suggestedLaunchDate: string;
  status: 'SUGGESTED' | 'CONVERTED';
}

export interface MrpRunResult {
  runTimestamp: string;
  totalItemsAnalyzed: number;
  shortageCount: number;
  plannedOrders: MrpPlannedOrder[];
}

export class MrpEngineService {
  /**
   * Exécute le calcul des besoins nets (MRP I / II)
   */
  public runMrp(
    materials: MaterialPlanningItem[],
    horizonDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Horizon par défaut: +30 jours
  ): MrpRunResult {
    const plannedOrders: MrpPlannedOrder[] = [];
    const componentExtraDemand = new Map<string, number>();

    // 1. Première passe : Produits finis et semi-finis fabriqués
    for (const mat of materials) {
      const extraDemand = componentExtraDemand.get(mat.code) ?? 0;
      const totalDemand = mat.grossRequirements + extraDemand;
      const projectedAvailable = mat.currentStock + mat.incomingSupply - mat.safetyStock;
      const netRequirement = totalDemand - projectedAvailable;

      if (netRequirement > 0) {
        // Application de la quantité minimale de commande
        const suggestedQty = Math.max(netRequirement, mat.minOrderQuantity);

        const dueDate = new Date(horizonDueDate);
        const launchDate = new Date(dueDate.getTime() - mat.leadTimeDays * 24 * 60 * 60 * 1000);

        plannedOrders.push({
          id: `MRP-${mat.code}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          materialCode: mat.code,
          materialName: mat.name,
          orderType: mat.type === 'MANUFACTURED' ? 'PRODUCTION_ORDER' : 'PURCHASE_REQUISITION',
          grossQuantity: totalDemand,
          netQuantity: netRequirement,
          suggestedQuantity: suggestedQty,
          suggestedDueDate: dueDate.toISOString().slice(0, 10),
          suggestedLaunchDate: launchDate.toISOString().slice(0, 10),
          status: 'SUGGESTED',
        });

        // Décomposition de nomenclature (BOM Explosion) vers les composants
        if (mat.type === 'MANUFACTURED' && mat.bomComponents) {
          for (const bom of mat.bomComponents) {
            const neededQty = suggestedQty * bom.quantityPerUnit;
            const currentExtra = componentExtraDemand.get(bom.componentCode) ?? 0;
            componentExtraDemand.set(bom.componentCode, currentExtra + neededQty);
          }
        }
      }
    }

    return {
      runTimestamp: new Date().toISOString(),
      totalItemsAnalyzed: materials.length,
      shortageCount: plannedOrders.length,
      plannedOrders,
    };
  }
}
