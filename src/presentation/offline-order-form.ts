export interface OfflineSalesOrderDraftLineInput {
  materialId: unknown;
  quantity: unknown;
  unitPrice: unknown;
}

export interface OfflineSalesOrderDraftInput {
  customerId: unknown;
  lines: unknown;
}

export interface OfflineSalesOrderDraftPayload {
  customerId: string;
  lines: Array<{ materialId: string; quantity: number; unitPrice: number }>;
}

export function buildOfflineSalesOrderPayload(value: OfflineSalesOrderDraftInput): OfflineSalesOrderDraftPayload {
  const customerId = typeof value.customerId === 'string' ? value.customerId.trim() : '';
  if (!customerId) throw new Error('Choisissez un client avant de chiffrer la commande.');
  if (!Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 100) {
    throw new Error('Une commande hors ligne doit contenir de 1 à 100 lignes.');
  }
  const lines = value.lines.map((value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Vérifiez chaque ligne : sélectionnez un article et saisissez une quantité positive et un prix valide.');
    }
    const line = value as OfflineSalesOrderDraftLineInput;
    const materialId = typeof line.materialId === 'string' ? line.materialId.trim() : '';
    const quantity = typeof line.quantity === 'number' ? line.quantity : Number(line.quantity);
    const unitPrice = typeof line.unitPrice === 'number' ? line.unitPrice : Number(line.unitPrice);
    if (!materialId || !Number.isFinite(quantity) || quantity <= 0
      || !Number.isFinite(unitPrice) || unitPrice < 0
      || !Number.isSafeInteger(Math.round(unitPrice * 1000))) {
      throw new Error('Vérifiez chaque ligne : sélectionnez un article et saisissez une quantité positive et un prix valide.');
    }
    return { materialId, quantity, unitPrice };
  });
  return { customerId, lines };
}
