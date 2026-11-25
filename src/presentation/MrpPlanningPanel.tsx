import React, { useState } from 'react';

interface MrpItem {
  code: string;
  name: string;
  type: 'PURCHASED' | 'MANUFACTURED';
  currentStock: number;
  safetyStock: number;
  incomingSupply: number;
  grossRequirements: number;
  leadTimeDays: number;
  minOrderQuantity: number;
}

const INITIAL_MRP_MATERIALS: MrpItem[] = [
  {
    code: 'FIN-PALETTE-HD',
    name: 'Palette Plastique Industrielle Renforcée 1200x800',
    type: 'MANUFACTURED',
    currentStock: 45,
    safetyStock: 30,
    incomingSupply: 0,
    grossRequirements: 180,
    leadTimeDays: 4,
    minOrderQuantity: 50,
  },
  {
    code: 'RAW-PP-GRAN',
    name: 'Granulés de Polypropylène Vierge Grade Injection (kg)',
    type: 'PURCHASED',
    currentStock: 350,
    safetyStock: 150,
    incomingSupply: 300,
    grossRequirements: 0,
    leadTimeDays: 14,
    minOrderQuantity: 1000,
  },
  {
    code: 'RAW-COLOR-BLACK',
    name: 'Mélange Maître Colorant Noir Haute Dispersion (kg)',
    type: 'PURCHASED',
    currentStock: 25,
    safetyStock: 10,
    incomingSupply: 0,
    grossRequirements: 0,
    leadTimeDays: 7,
    minOrderQuantity: 50,
  },
  {
    code: 'FIN-BAC-AGRI',
    name: 'Bac Plastique Gerbable Récolte Agricole 600x400',
    type: 'MANUFACTURED',
    currentStock: 220,
    safetyStock: 100,
    incomingSupply: 50,
    grossRequirements: 240,
    leadTimeDays: 3,
    minOrderQuantity: 100,
  },
];

interface PlannedOrder {
  id: string;
  materialCode: string;
  materialName: string;
  type: 'PURCHASE_REQUISITION' | 'PRODUCTION_ORDER';
  netQty: number;
  suggestedQty: number;
  launchDate: string;
  dueDate: string;
  status: 'PENDING' | 'CONVERTED';
}

export default function MrpPlanningPanel({
  accessToken: _accessToken,
  entityId: _entityId,
}: {
  accessToken: string | null;
  entityId?: string | null;
}) {
  const [materials] = useState<MrpItem[]>(INITIAL_MRP_MATERIALS);
  const [plannedOrders, setPlannedOrders] = useState<PlannedOrder[]>([]);
  const [isCalculated, setIsCalculated] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const handleRunMrp = () => {
    const orders: PlannedOrder[] = [];
    const today = new Date();

    materials.forEach((m) => {
      // Formule de calcul des besoins nets MRP
      const projectedAvailable = m.currentStock + m.incomingSupply - m.safetyStock;
      const net = m.grossRequirements - projectedAvailable;

      if (net > 0) {
        const suggested = Math.max(net, m.minOrderQuantity);
        const due = new Date(today.getTime() + 25 * 24 * 60 * 60 * 1000);
        const launch = new Date(due.getTime() - m.leadTimeDays * 24 * 60 * 60 * 1000);

        orders.push({
          id: `PLN-${m.code}-${Date.now()}`,
          materialCode: m.code,
          materialName: m.name,
          type: m.type === 'MANUFACTURED' ? 'PRODUCTION_ORDER' : 'PURCHASE_REQUISITION',
          netQty: net,
          suggestedQty: suggested,
          launchDate: launch.toLocaleDateString('fr-FR'),
          dueDate: due.toLocaleDateString('fr-FR'),
          status: 'PENDING',
        });
      }
    });

    setPlannedOrders(orders);
    setIsCalculated(true);
    setNotification(`Calcul MRP exécuté : ${orders.length} ordres planifiés suggérés (Ordres de fabrication & Demandes d'achat).`);
    setTimeout(() => setNotification(null), 5000);
  };

  const handleConvertOrder = (orderId: string) => {
    setPlannedOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: 'CONVERTED' } : o))
    );
    const converted = plannedOrders.find((o) => o.id === orderId);
    setNotification(
      `Suggestion convertie : ${
        converted?.type === 'PRODUCTION_ORDER' ? 'Ordre de Fabrication (OF)' : 'Bon de Commande Fournisseur (BC)'
      } créé avec succès.`
    );
    setTimeout(() => setNotification(null), 5000);
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 4px 0', color: '#111827' }}>
            ⚙ï¸ Planification des Besoins Nets - MRP I / II (Planification SAFE)
          </h1>
          <p style={{ margin: 0, color: '#6B7280', fontSize: '14px' }}>
            Explosion des nomenclatures (BOM), alignement stocks / demandes fermes et réapprovisionnement automatique.
          </p>
        </div>
        <button
          onClick={handleRunMrp}
          style={{
            background: '#2563EB',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            padding: '10px 20px',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          🚀 Lancer le Calcul MRP en Temps Réel
        </button>
      </div>

      {notification && (
        <div style={{ background: '#ECFDF5', border: '1px solid #10B981', color: '#065F46', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
          ✅ {notification}
        </div>
      )}

      {/* Materials Table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #E5E7EB' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>Situation des Stocks & Demandes Clients</h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', color: '#4B5563' }}>
              <th style={{ padding: '10px 16px' }}>Article</th>
              <th style={{ padding: '10px 16px' }}>Type</th>
              <th style={{ padding: '10px 16px', textAlign: 'right' }}>Stock Dispo</th>
              <th style={{ padding: '10px 16px', textAlign: 'right' }}>Stock Sécurité</th>
              <th style={{ padding: '10px 16px', textAlign: 'right' }}>Encours (PO/OF)</th>
              <th style={{ padding: '10px 16px', textAlign: 'right' }}>Besoins Bruts</th>
              <th style={{ padding: '10px 16px', textAlign: 'right' }}>Délai (J)</th>
              <th style={{ padding: '10px 16px', textAlign: 'center' }}>Diagnostic MRP</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => {
              const projected = m.currentStock + m.incomingSupply - m.safetyStock;
              const hasDeficit = m.grossRequirements > projected;
              return (
                <tr key={m.code} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#1E40AF' }}>{m.code}</div>
                    <div style={{ fontSize: '12px', color: '#4B5563' }}>{m.name}</div>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      background: m.type === 'MANUFACTURED' ? '#EDE9FE' : '#FEF3C7',
                      color: m.type === 'MANUFACTURED' ? '#5B21B6' : '#92400E',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}>
                      {m.type === 'MANUFACTURED' ? 'Fabriqué' : 'Acheté'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 500 }}>{m.currentStock}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', color: '#6B7280' }}>{m.safetyStock}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', color: '#059669' }}>{m.incomingSupply}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: '#111827' }}>{m.grossRequirements}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' }}>{m.leadTimeDays} j</td>
                  <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                    <span style={{
                      background: hasDeficit ? '#FEE2E2' : '#DEF7EC',
                      color: hasDeficit ? '#991B1B' : '#03543F',
                      padding: '3px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}>
                      {hasDeficit ? '⚠ï¸ RUPTURE IMMINENTE' : '✅ COUVERT'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Suggested Planned Orders */}
      {isCalculated && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0, color: '#111827' }}>
              📋 Suggestions d'Approvisionnement & de Production Générées
            </h2>
            <span style={{ fontSize: '12px', color: '#6B7280' }}>
              {plannedOrders.filter((o) => o.status === 'CONVERTED').length} / {plannedOrders.length} converties
            </span>
          </div>

          {plannedOrders.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#6B7280' }}>
              Aucun déficit détecté sur l'horizon de planification.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', color: '#4B5563' }}>
                  <th style={{ padding: '10px 16px' }}>Type d'Ordre</th>
                  <th style={{ padding: '10px 16px' }}>Article</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right' }}>Besoin Net</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right' }}>Qté Suggérée (Lot Eco)</th>
                  <th style={{ padding: '10px 16px' }}>Date Lancement</th>
                  <th style={{ padding: '10px 16px' }}>Date Besoin</th>
                  <th style={{ padding: '10px 16px' }}>Statut</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {plannedOrders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        background: o.type === 'PRODUCTION_ORDER' ? '#EDE9FE' : '#DBEAFE',
                        color: o.type === 'PRODUCTION_ORDER' ? '#5B21B6' : '#1E40AF',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}>
                        {o.type === 'PRODUCTION_ORDER' ? 'ðŸ­ Ordre Fabrication (OF)' : '🛒 Demande Achat (DA)'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', fontWeight: 500 }}>
                      {o.materialName} ({o.materialCode})
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: '#DC2626', fontWeight: 600 }}>
                      {o.netQty}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 'bold', color: '#2563EB' }}>
                      {o.suggestedQty}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#4B5563' }}>{o.launchDate}</td>
                    <td style={{ padding: '10px 16px', color: '#4B5563' }}>{o.dueDate}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        background: o.status === 'CONVERTED' ? '#DEF7EC' : '#FEF3C7',
                        color: o.status === 'CONVERTED' ? '#03543F' : '#92400E',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}>
                        {o.status === 'CONVERTED' ? 'Converti' : 'Suggéré'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {o.status === 'PENDING' ? (
                        <button
                          onClick={() => handleConvertOrder(o.id)}
                          style={{
                            background: '#059669',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          ⚡ Convertir en Ordre Ferme
                        </button>
                      ) : (
                        <span style={{ color: '#059669', fontWeight: 600 }}>Validé ✓</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
