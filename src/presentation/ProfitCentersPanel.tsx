import React, { useState } from 'react';

interface ProfitCenter {
  code: string;
  name: string;
  segment: string;
  manager: string;
  revenue: number;
  directCosts: number;
  allocatedOverheads: number;
}

const INITIAL_PROFIT_CENTERS: ProfitCenter[] = [
  {
    code: 'PC-VENTES-LOCALES',
    name: 'Pôle Distribution & Ventes Marché Local (Tunisie)',
    segment: 'DOMESTIC_MARKET',
    manager: 'Mounir Trabelsi',
    revenue: 8500000,
    directCosts: 5200000,
    allocatedOverheads: 750000,
  },
  {
    code: 'PC-EXPORT-EUROPE',
    name: 'Pôle Export & Grands Comptes Union Européenne',
    segment: 'EXPORT_EU',
    manager: 'Inès Bouazizi',
    revenue: 5200000,
    directCosts: 3100000,
    allocatedOverheads: 520000,
  },
  {
    code: 'PC-PROD-INDUSTRIELLE',
    name: 'Atelier de Fabrication & Transformation Plastique',
    segment: 'MANUFACTURING',
    manager: 'Hichem Dridi',
    revenue: 1900000,
    directCosts: 1150000,
    allocatedOverheads: 240000,
  },
];

export default function ProfitCentersPanel({
  accessToken: _accessToken,
  entityId: _entityId,
}: {
  accessToken: string | null;
  entityId?: string | null;
}) {
  const [profitCenters, setProfitCenters] = useState<ProfitCenter[]>(INITIAL_PROFIT_CENTERS);
  const [overheadPool, setOverheadPool] = useState<number>(300000);
  const [allocationDone, setAllocationDone] = useState(false);
  const [activeTab, setActiveTab] = useState<'pnl' | 'allocation'>('pnl');

  const totalRevenue = profitCenters.reduce((sum, p) => sum + p.revenue, 0);
  const totalDirectCosts = profitCenters.reduce((sum, p) => sum + p.directCosts, 0);
  const totalOverheads = profitCenters.reduce((sum, p) => sum + p.allocatedOverheads, 0);
  const totalGrossMargin = totalRevenue - totalDirectCosts;
  const totalOperatingResult = totalGrossMargin - totalOverheads;

  const handleRunAllocationCycle = () => {
    // Clé de répartition au prorata du Chiffre d'Affaires (SAFE Secondary Cost Distribution)
    setProfitCenters((prev) =>
      prev.map((pc) => {
        const share = pc.revenue / totalRevenue;
        const additionalOverhead = Math.round(overheadPool * share);
        return {
          ...pc,
          allocatedOverheads: pc.allocatedOverheads + additionalOverhead,
        };
      })
    );
    setAllocationDone(true);
    setTimeout(() => setAllocationDone(false), 5000);
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 4px 0', color: '#111827' }}>
            📊 Centres de Profit & Répartition Analytique (Contrôle analytique SAFE)
          </h1>
          <p style={{ margin: 0, color: '#6B7280', fontSize: '14px' }}>
            Contrôle de gestion par segment IFRS 8, marges contributives et cycles de déversement des charges indirectes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('pnl')}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: activeTab === 'pnl' ? '#2563EB' : '#E5E7EB',
              color: activeTab === 'pnl' ? '#FFFFFF' : '#374151',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            📈 P&L par Centre de Profit
          </button>
          <button
            onClick={() => setActiveTab('allocation')}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: activeTab === 'allocation' ? '#2563EB' : '#E5E7EB',
              color: activeTab === 'allocation' ? '#FFFFFF' : '#374151',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            🔄 Cycle de Répartition
          </button>
        </div>
      </div>

      {allocationDone && (
        <div style={{ background: '#ECFDF5', border: '1px solid #10B981', color: '#065F46', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
          ✅ Cycle de répartition exécuté avec succès : 300 000 DT de charges de structure réparties au prorata des revenus.
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>Chiffre d’Affaires Global</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', marginTop: '4px' }}>{totalRevenue.toLocaleString('fr-FR')} DT</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>Marge Brute Consolidée</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#059669', marginTop: '4px' }}>
            {totalGrossMargin.toLocaleString('fr-FR')} DT ({((totalGrossMargin / totalRevenue) * 100).toFixed(1)}%)
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>Frais Indirects Imputés</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#DC2626', marginTop: '4px' }}>-{totalOverheads.toLocaleString('fr-FR')} DT</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>Résultat Opérationnel (EBIT)</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2563EB', marginTop: '4px' }}>
            {totalOperatingResult.toLocaleString('fr-FR')} DT ({((totalOperatingResult / totalRevenue) * 100).toFixed(1)}%)
          </div>
        </div>
      </div>

      {activeTab === 'pnl' ? (
        /* P&L Table */
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>Compte de Résultat Analytique par Segment</h2>
            <span style={{ fontSize: '12px', color: '#6B7280' }}>Conforme norme IFRS 8 (Information sectorielle)</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', color: '#4B5563' }}>
                <th style={{ padding: '12px 16px' }}>Code & Désignation</th>
                <th style={{ padding: '12px 16px' }}>Responsable</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Chiffre d’Affaires</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Coûts Directs</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Marge Brute</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Coûts Alloués</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Résultat Net Analytique</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Rentabilité</th>
              </tr>
            </thead>
            <tbody>
              {profitCenters.map((pc) => {
                const gm = pc.revenue - pc.directCosts;
                const netResult = gm - pc.allocatedOverheads;
                const marginRate = ((netResult / pc.revenue) * 100).toFixed(1);
                return (
                  <tr key={pc.code} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#1E40AF' }}>{pc.code}</div>
                      <div style={{ color: '#4B5563', fontSize: '12px' }}>{pc.name}</div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>{pc.manager}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>{pc.revenue.toLocaleString('fr-FR')} DT</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#4B5563' }}>{pc.directCosts.toLocaleString('fr-FR')} DT</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#059669', fontWeight: 600 }}>{gm.toLocaleString('fr-FR')} DT</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#DC2626' }}>{pc.allocatedOverheads.toLocaleString('fr-FR')} DT</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', color: netResult >= 0 ? '#047857' : '#B91C1C' }}>
                      {netResult.toLocaleString('fr-FR')} DT
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <span style={{
                        background: Number(marginRate) > 15 ? '#DEF7EC' : '#FEF08A',
                        color: Number(marginRate) > 15 ? '#03543F' : '#854D0E',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: 600,
                        fontSize: '12px',
                      }}>
                        {marginRate}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Allocation Cycle Configuration */
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 16px 0' }}>Cycle de Déversement des Frais Généraux</h2>
          <p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '20px' }}>
            Ce cycle déverse les coûts indirects du centre support <strong>Direction & Informatique (CC-DIR/DSI)</strong> vers les centres de profit opérationnels selon la clé de répartition au Chiffre d'Affaires.
          </p>

          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
              Montant des charges indirectes à répartir (DT)
            </label>
            <input
              type="number"
              value={overheadPool}
              onChange={(e) => setOverheadPool(Number(e.target.value))}
              style={{ padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', width: '220px', fontSize: '14px' }}
            />
          </div>

          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>Simulation de l’Imputation Secondaire</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '24px' }}>
            <thead>
              <tr style={{ background: '#F3F4F6' }}>
                <th style={{ padding: '10px', textAlign: 'left' }}>Centre Récepteur</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Quote-part CA</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Clé (%)</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Montant Imputé</th>
              </tr>
            </thead>
            <tbody>
              {profitCenters.map((pc) => {
                const pct = (pc.revenue / totalRevenue) * 100;
                const allocated = Math.round(overheadPool * (pc.revenue / totalRevenue));
                return (
                  <tr key={pc.code} style={{ borderBottom: '1px solid #E5E7EB' }}>
                    <td style={{ padding: '10px', fontWeight: 500 }}>{pc.name}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{pc.revenue.toLocaleString('fr-FR')} DT</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>{pct.toFixed(2)}%</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: '#2563EB' }}>
                      {allocated.toLocaleString('fr-FR')} DT
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <button
            onClick={handleRunAllocationCycle}
            style={{
              background: '#059669',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 20px',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            ⚡ Exécuter et Valider le Cycle de Répartition
          </button>
        </div>
      )}
    </div>
  );
}
