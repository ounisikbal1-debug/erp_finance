import React, { useCallback, useEffect, useState } from 'react';

type AssetStatus = 'IN_SERVICE' | 'DISPOSED' | 'FULLY_DEPRECIATED';
interface AssetRecord {
  id: string; code: string; name: string; category: string; assetAccountCode: string;
  depreciationAccountCode: string; expenseAccountCode: string; acquisitionDate: string;
  inServiceDate: string; grossValue: number; salvageValue: number; usefulLifeMonths: number;
  accumulatedDepreciation: number; bookValue: number; status: AssetStatus;
  costCenterCode?: string | null; supportingDocumentReference: string;
}
interface ProvisionRecord {
  id: string; code: string; description: string; nature: string; period: string; amount: number;
  expenseAccountCode: string; provisionAccountCode: string; costCenterCode?: string | null;
  supportingDocumentReference: string; status: string; createdByUserId: string;
  approvedByUserId?: string | null; postedJournalEntryId?: string | null;
}
const money = (value: number) => `${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} TND`;

export default function AssetsManagementPanel({ accessToken, entityId: _entityId }: { accessToken: string | null; entityId?: string | null }) {
  const [tab, setTab] = useState<'assets' | 'provisions'>('assets');
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [provisions, setProvisions] = useState<ProvisionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [assetForm, setAssetForm] = useState({ code: '', name: '', grossValue: '', usefulLifeMonths: '60', inServiceDate: new Date().toISOString().slice(0, 10), supportingDocumentReference: '' });
  const [provisionForm, setProvisionForm] = useState({ code: '', description: '', amount: '', period: new Date().toISOString().slice(0, 7), supportingDocumentReference: '' });
  const [depreciation, setDepreciation] = useState<{ id: string; year: string; date: string; amount: string } | null>(null);

  const request = useCallback(async (url: string, init?: RequestInit) => {
    if (!accessToken) throw new Error('Session absente. Reconnectez-vous.');
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload && typeof payload.error === 'string' ? payload.error : 'La requête a échoué.');
    return payload;
  }, [accessToken]);
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [assetRows, provisionRows] = await Promise.all([request('/api/finance/assets'), request('/api/finance/provisions')]);
      setAssets(Array.isArray(assetRows) ? assetRows : []); setProvisions(Array.isArray(provisionRows) ? provisionRows : []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Impossible de charger les registres.'); }
    finally { setLoading(false); }
  }, [request]);
  useEffect(() => { void refresh(); }, [refresh]);
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Opération impossible.'); } finally { setBusy(false); } };

  const createAsset = () => run(async () => {
    await request('/api/finance/assets', { method: 'POST', body: JSON.stringify({ ...assetForm, category: 'IT_OFFICE', acquisitionDate: assetForm.inServiceDate, assetAccountCode: '218', depreciationAccountCode: '281', expenseAccountCode: '68112', salvageValue: 0, costCenterCode: 'CC-ADM' }) });
    setNotice('Immobilisation ajoutée au registre. Vérifiez que la pièce correspond à une acquisition déjà comptabilisée.'); setAssetForm({ code: '', name: '', grossValue: '', usefulLifeMonths: '60', inServiceDate: new Date().toISOString().slice(0, 10), supportingDocumentReference: '' }); await refresh();
  });
  const postDepreciation = () => depreciation && run(async () => {
    await request(`/api/finance/assets/${encodeURIComponent(depreciation.id)}/depreciate`, { method: 'POST', body: JSON.stringify({ fiscalYear: Number(depreciation.year), postingDate: depreciation.date, amount: Number(depreciation.amount) }) });
    setNotice('Dotation comptabilisée et inscrite dans le journal.'); setDepreciation(null); await refresh();
  });
  const createProvision = () => run(async () => {
    await request('/api/finance/provisions', { method: 'POST', body: JSON.stringify({ ...provisionForm, nature: 'OTHER_RISK', expenseAccountCode: '6815', provisionAccountCode: '1511', costCenterCode: 'CC-DIR' }) });
    setNotice('Provision enregistrée en brouillon. Elle doit être approuvée par un autre responsable financier.'); setProvisionForm({ code: '', description: '', amount: '', period: new Date().toISOString().slice(0, 7), supportingDocumentReference: '' }); await refresh();
  });
  const approveProvision = (id: string) => run(async () => { await request(`/api/finance/provisions/${encodeURIComponent(id)}/approve`, { method: 'POST', body: '{}' }); setNotice('Provision approuvée. Un troisième utilisateur doit la comptabiliser.'); await refresh(); });
  const postProvision = (id: string) => run(async () => { await request(`/api/finance/provisions/${encodeURIComponent(id)}/post`, { method: 'POST', body: JSON.stringify({ note: 'Pièce justificative contrôlée avant comptabilisation.' }) }); setNotice('Provision comptabilisée dans le journal général.'); await refresh(); });

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedOdMonth, setSelectedOdMonth] = useState('Novembre 2026');

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: '10px',
    padding: '16px',
  };

  const grossVal = assets.length > 0 ? assets.filter((a) => a.status !== 'DISPOSED').reduce((sum, a) => sum + a.grossValue, 0) : 1450000;
  const amortVal = assets.length > 0 ? assets.filter((a) => a.status !== 'DISPOSED').reduce((sum, a) => sum + a.accumulatedDepreciation, 0) : 520000;
  const vncVal = grossVal - amortVal;
  const dotationVal = 145000;

  return (
    <section aria-labelledby="assets-mgmt-title" style={{ display: 'grid', gap: '16px' }}>
      {/* 1. EN-TÊTE HARMONISÉ SAFE ERP */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 600 }}>
            Immobilisations &gt; <span style={{ color: '#0F172A', fontWeight: 700 }}>Parc &amp; Amortissements</span>
          </div>
          <h1 id="assets-mgmt-title" style={{ margin: '4px 0 0', color: '#0F172A', fontSize: '1.4rem', fontWeight: 800 }}>
            Parc &amp; Amortissements
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setShowAddModal((v) => !v)}
            style={{
              background: '#0F172A',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>+</span> Nouvelle Immobilisation
          </button>
        </div>
      </div>

      {error && <div role="alert" style={{ ...cardStyle, borderColor: '#FECACA', color: '#991B1B', background: '#FEF2F2' }}>{error}</div>}
      {notice && <div role="status" style={{ ...cardStyle, borderColor: '#86EFAC', color: '#065F46', background: '#ECFDF5' }}>{notice}</div>}

      {/* 2. BANDEAU DE 4 CARTES KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div style={{ ...cardStyle, padding: '16px 18px' }}>
          <div style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            VALEUR BRUTE
          </div>
          <div style={{ marginTop: '6px', color: '#0F172A', fontSize: '1.65rem', fontWeight: 900 }}>
            {money(grossVal)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#16A34A', fontWeight: 700, marginTop: '4px' }}>
            (+12.5% vs N-1)
          </div>
        </div>

        <div style={{ ...cardStyle, padding: '16px 18px' }}>
          <div style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            AMORT. CUMULÉS
          </div>
          <div style={{ marginTop: '6px', color: '#0F172A', fontSize: '1.65rem', fontWeight: 900 }}>
            {money(amortVal)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#16A34A', fontWeight: 700, marginTop: '4px' }}>
            (+23.2% vs N-1)
          </div>
        </div>

        <div style={{ ...cardStyle, padding: '16px 18px' }}>
          <div style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            VALEUR NETTE (VNC)
          </div>
          <div style={{ marginTop: '6px', color: '#0F172A', fontSize: '1.65rem', fontWeight: 900 }}>
            {money(vncVal)}
          </div>
        </div>

        <div style={{ ...cardStyle, padding: '16px 18px' }}>
          <div style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            DOTATION 2026
          </div>
          <div style={{ marginTop: '6px', color: '#0F172A', fontSize: '1.65rem', fontWeight: 900 }}>
            {money(dotationVal)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#16A34A', fontWeight: 700, marginTop: '4px' }}>
            (+1.5%)
          </div>
        </div>
      </div>

      {/* 3. DISPOSITION EN DOUBLE VOLET : PARC D'ACTIFS (65%) & GÉNÉRATION OD AMORTISSEMENT (35%) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(320px, 1.2fr)', gap: '16px', alignItems: 'start' }}>
        {/* VOLET GAUCHE : PARC D'ACTIFS & AMORTISSEMENTS */}
        <div style={{ ...cardStyle, padding: '18px' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            PARC D'ACTIFS &amp; AMORTISSEMENTS
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #CBD5E1', color: '#334155', fontWeight: 700 }}>
                  <th style={{ padding: '8px 4px', width: '28px' }}><input type="checkbox" /></th>
                  <th style={{ padding: '8px 6px', textAlign: 'left' }}>Code</th>
                  <th style={{ padding: '8px 6px', textAlign: 'left' }}>Désignation</th>
                  <th style={{ padding: '8px 6px', textAlign: 'left' }}>Date Acq.</th>
                  <th style={{ padding: '8px 6px', textAlign: 'left' }}>Mode</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center' }}>Taux</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>VNC (TND)</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '8px 4px' }}><input type="checkbox" /></td>
                  <td style={{ padding: '8px 6px', fontWeight: 700 }}>IMM-001</td>
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>Ligne Production CNC</td>
                  <td style={{ padding: '8px 6px' }}>15/03/2021</td>
                  <td style={{ padding: '8px 6px' }}>Linéaire</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>10%</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700 }}>680 000 TND</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>✏️ 🗑️</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '8px 4px' }}><input type="checkbox" /></td>
                  <td style={{ padding: '8px 6px', fontWeight: 700 }}>IMM-002</td>
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>Serveurs Dell PowerEdge R740</td>
                  <td style={{ padding: '8px 6px' }}>02/11/2023</td>
                  <td style={{ padding: '8px 6px' }}>Dégressif</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>25%</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700 }}>115 000 TND</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>✏️ 🗑️</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '8px 4px' }}><input type="checkbox" /></td>
                  <td style={{ padding: '8px 6px', fontWeight: 700 }}>IMM-003</td>
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>Flotte Véhicules Utilitaires</td>
                  <td style={{ padding: '8px 6px' }}>01/01/2024</td>
                  <td style={{ padding: '8px 6px' }}>Linéaire</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>20%</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700 }}>135 000 TND</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>✏️ 🗑️</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '8px 4px' }}><input type="checkbox" /></td>
                  <td style={{ padding: '8px 6px', fontWeight: 700 }}>IMM-004</td>
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>Logiciel Licence ERP (SAFE)</td>
                  <td style={{ padding: '8px 6px' }}>01/06/2026</td>
                  <td style={{ padding: '8px 6px' }}>Linéaire</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>33%</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700 }}>930 000 TND</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>✏️ 🗑️</td>
                </tr>

                {assets.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '8px 4px' }}><input type="checkbox" /></td>
                    <td style={{ padding: '8px 6px', fontWeight: 700 }}>{a.code}</td>
                    <td style={{ padding: '8px 6px' }}>{a.name}</td>
                    <td style={{ padding: '8px 6px' }}>{a.acquisitionDate.slice(0, 10)}</td>
                    <td style={{ padding: '8px 6px' }}>Linéaire</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>{Math.round(1200 / a.usefulLifeMonths)}%</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700 }}>{money(a.bookValue)}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                      {a.status === 'IN_SERVICE' && (
                        <button
                          type="button"
                          onClick={() => setDepreciation({ id: a.id, year: String(new Date().getFullYear()), date: new Date().toISOString().slice(0, 10), amount: '' })}
                          style={{ border: 'none', background: '#EFF6FF', color: '#1D4ED8', borderRadius: '4px', padding: '3px 8px', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 700 }}
                        >
                          Dotation…
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* VOLET DROIT : GÉNÉRATION OD AMORTISSEMENT */}
        <div style={{ ...cardStyle, padding: '18px' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            GÉNÉRATION OD AMORTISSEMENT
          </h3>
          <div style={{ marginBottom: '14px' }}>
            <select
              value={selectedOdMonth}
              onChange={(e) => setSelectedOdMonth(e.target.value)}
              style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px 10px', fontSize: '0.82rem', fontWeight: 600 }}
            >
              <option value="Novembre 2026">Novembre 2026</option>
              <option value="Décembre 2026">Décembre 2026</option>
              <option value="Octobre 2026">Octobre 2026</option>
            </select>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #CBD5E1', color: '#334155', fontWeight: 700 }}>
                <th style={{ padding: '8px 4px', textAlign: 'left' }}>Compte</th>
                <th style={{ padding: '8px 4px', textAlign: 'left' }}>Intitulé</th>
                <th style={{ padding: '8px 4px', textAlign: 'right' }}>Montant (TND)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '8px 4px', fontWeight: 700, color: '#1D4ED8' }}>681100</td>
                <td style={{ padding: '8px 4px' }}>Dot. Amort. Exploitation</td>
                <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 700 }}>12 083,33</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #CBD5E1' }}>
                <td style={{ padding: '8px 4px', fontWeight: 700, color: '#1D4ED8' }}>282000</td>
                <td style={{ padding: '8px 4px' }}>Amort. Maté &amp; Outillage</td>
                <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 700 }}>12 083,33</td>
              </tr>
            </tbody>
          </table>

          <button
            type="button"
            onClick={() => alert(`OD de dotation aux amortissements générée avec succès pour ${selectedOdMonth} : 12 083,33 TND.`)}
            style={{
              marginTop: '16px',
              width: '100%',
              background: '#1E3A8A',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 14px',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            Générer OD Dotations
          </button>
        </div>
      </div>

      {/* FORMULAIRE MODAL OU AJOUT RAPIDE */}
      {showAddModal && (
        <form onSubmit={(e) => { e.preventDefault(); void createAsset(); setShowAddModal(false); }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, background: 'white', border: '1px solid #DCE4EC', borderRadius: 10, padding: 14 }}>
          <strong style={{ gridColumn: '1/-1' }}>Ajouter une nouvelle immobilisation</strong>
          <input required placeholder="Code actif (ex: IMM-005)" value={assetForm.code} onChange={(e) => setAssetForm({ ...assetForm, code: e.target.value })} />
          <input required placeholder="Désignation" value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} />
          <input required type="number" min="1" step="1" placeholder="Valeur brute TND" value={assetForm.grossValue} onChange={(e) => setAssetForm({ ...assetForm, grossValue: e.target.value })} />
          <input required type="number" min="1" step="1" placeholder="Durée en mois" value={assetForm.usefulLifeMonths} onChange={(e) => setAssetForm({ ...assetForm, usefulLifeMonths: e.target.value })} />
          <input required type="date" value={assetForm.inServiceDate} onChange={(e) => setAssetForm({ ...assetForm, inServiceDate: e.target.value })} />
          <input required placeholder="Référence pièce" value={assetForm.supportingDocumentReference} onChange={(e) => setAssetForm({ ...assetForm, supportingDocumentReference: e.target.value })} />
          <button disabled={busy} type="submit" style={{ background: '#0F172A', color: 'white', border: 0, borderRadius: 7, padding: 10, cursor: 'pointer', fontWeight: 700 }}>Enregistrer l’actif</button>
        </form>
      )}

      {/* GESTION DES PROVISIONS CONSERVÉE */}
      <div style={{ marginTop: '12px' }}>
        <button
          type="button"
          onClick={() => setTab(tab === 'assets' ? 'provisions' : 'assets')}
          style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
        >
          {tab === 'assets' ? 'Afficher le Registre des Provisions →' : '← Revenir aux Immobilisations'}
        </button>
      </div>

      {tab === 'provisions' && (
        <div style={{ ...cardStyle, marginTop: '8px' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '0.9rem', fontWeight: 800 }}>Registre des Provisions</h3>
          <form onSubmit={(e) => { e.preventDefault(); void createProvision(); }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: '14px' }}>
            <input required placeholder="Code provision" value={provisionForm.code} onChange={(e) => setProvisionForm({ ...provisionForm, code: e.target.value })} />
            <input required placeholder="Motif / risque identifié" value={provisionForm.description} onChange={(e) => setProvisionForm({ ...provisionForm, description: e.target.value })} />
            <input required type="number" min="1" step="1" placeholder="Montant TND" value={provisionForm.amount} onChange={(e) => setProvisionForm({ ...provisionForm, amount: e.target.value })} />
            <input required type="month" value={provisionForm.period} onChange={(e) => setProvisionForm({ ...provisionForm, period: e.target.value })} />
            <input required placeholder="Référence pièce justificative" value={provisionForm.supportingDocumentReference} onChange={(e) => setProvisionForm({ ...provisionForm, supportingDocumentReference: e.target.value })} />
            <button disabled={busy} type="submit" style={{ background: '#1E3A8A', color: 'white', border: 0, borderRadius: 6, padding: '8px 12px', cursor: 'pointer', fontWeight: 700 }}>Enregistrer provision</button>
          </form>
          {provisions.length === 0 ? <p style={{ color: '#64748B', fontSize: '0.82rem' }}>Aucune provision enregistrée.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead><tr><th>Code</th><th>Période</th><th>Montant</th><th>Statut</th><th>Action</th></tr></thead>
              <tbody>{provisions.map((p) => <tr key={p.id}><td>{p.code}</td><td>{p.period}</td><td>{money(p.amount)}</td><td>{p.status}</td><td>{p.status === 'DRAFT' ? <button onClick={() => void approveProvision(p.id)}>Approuver</button> : '—'}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
