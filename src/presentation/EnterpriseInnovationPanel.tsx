import React, { useState } from 'react';

export const EnterpriseInnovationPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'banking' | 'ttn' | 'security2fa' | 'ocr'>('banking');
  const [iban, setIban] = useState('TN59 1000 6035 1834 8920 1827');
  const [bankSyncStatus, setBankSyncStatus] = useState<string | null>(null);
  const [ttnStatus, setTtnStatus] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<any | null>(null);
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [archiveSeal, setArchiveSeal] = useState<string | null>(null);

  const handleSyncBank = () => {
    setBankSyncStatus('SYNCHRONIZING');
    setTimeout(() => {
      setBankSyncStatus('COMPLETED');
    }, 1000);
  };

  const handleTTNSubmit = () => {
    setTtnStatus('SUBMITTING');
    setTimeout(() => {
      setTtnStatus('ACCEPTED');
    }, 1200);
  };

  const handleRunOcr = () => {
    setOcrResult({
      supplier: 'STE POLYTECHNIQUE INDUSTRIELLE',
      invoiceNumber: 'FACT-2026-0412',
      totalHT: '2 450,000 TND',
      totalTVA: '465,500 TND (19%)',
      totalTTC: '2 915,500 TND',
      confidence: '98.5%',
      entries: [
        { acc: '601000', name: 'Achats matières premières', debit: '2 450,000', credit: '0,000' },
        { acc: '436660', name: 'TVA déductible 19%', debit: '465,500', credit: '0,000' },
        { acc: '401000', name: 'Fournisseurs d'exploitation', debit: '0,000', credit: '2 915,500' }
      ]
    });
  };

  const handleSealArchive = () => {
    setArchiveSeal('SHA256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069');
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#0f172a', minHeight: '100vh', color: '#f8fafc' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          🚀 Centre d'Innovations & Conformité Avancée (Enterprise 2026)
        </h1>
        <p style={{ color: '#94a3b8', margin: '4px 0 0 0', fontSize: '14px' }}>
          Connectivité Bancaire EBICS, Facturation Électronique TTN, Sécurité 2FA, Scellement Probatoire & OCR IA
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #334155', paddingBottom: '12px', marginBottom: '24px' }}>
        <button
          onClick={() => setActiveTab('banking')}
          style={{
            padding: '10px 18px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            backgroundColor: activeTab === 'banking' ? '#2563eb' : '#1e293b',
            color: '#fff'
          }}
        >
          🏦 Connectivité Bancaire (EBICS)
        </button>
        <button
          onClick={() => setActiveTab('ttn')}
          style={{
            padding: '10px 18px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            backgroundColor: activeTab === 'ttn' ? '#2563eb' : '#1e293b',
            color: '#fff'
          }}
        >
          📄 Télétransmission TTN & Fiscale
        </button>
        <button
          onClick={() => setActiveTab('security2fa')}
          style={{
            padding: '10px 18px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            backgroundColor: activeTab === 'security2fa' ? '#2563eb' : '#1e293b',
            color: '#fff'
          }}
        >
          🛡️ Sécurité 2FA & Scellement SHA-256
        </button>
        <button
          onClick={() => setActiveTab('ocr')}
          style={{
            padding: '10px 18px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            backgroundColor: activeTab === 'ocr' ? '#2563eb' : '#1e293b',
            color: '#fff'
          }}
        >
          🤖 OCR Factures & Pré-imputation IA
        </button>
      </div>

      {/* Tab 1: Banking */}
      {activeTab === 'banking' && (
        <div style={{ backgroundColor: '#1e293b', padding: '24px', borderRadius: '10px', border: '1px solid #334155' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginTop: 0 }}>Passerelle Bancaire Directe (EBICS TS / Open Banking)</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>
            Synchronisez directement les écritures bancaires en temps réel sans intervention manuelle de fichier CSV.
          </p>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '16px' }}>
            <input
              type="text"
              value={iban}
              onChange={e => setIban(e.target.value)}
              style={{ width: '380px', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '6px' }}
            />
            <button
              onClick={handleSyncBank}
              style={{ padding: '10px 20px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
            >
              🔄 Lancer la Synchronisation EBICS
            </button>
          </div>

          {bankSyncStatus === 'COMPLETED' && (
            <div style={{ marginTop: '20px', padding: '16px', backgroundColor: 'rgba(22, 163, 74, 0.1)', border: '1px solid #16a34a', borderRadius: '8px' }}>
              <div style={{ fontWeight: 'bold', color: '#4ade80', marginBottom: '8px' }}>
                ✅ Synchronisation EBICS Réussie avec la Banque de Tunisie
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#e2e8f0' }}>
                2 nouvelles transactions récupérées et pré-rapprochées avec le compte 532000 (Banque).
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: TTN */}
      {activeTab === 'ttn' && (
        <div style={{ backgroundColor: '#1e293b', padding: '24px', borderRadius: '10px', border: '1px solid #334155' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginTop: 0 }}>Télétransmission Légale TTN (Tunisie Trade Net)</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>
            Certification fiscale instantanée des factures et télétransmission déclarative G50.
          </p>

          <div style={{ padding: '16px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155', maxWidth: '500px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>Dernière Facture en Attente de Visa Fiscale :</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '4px' }}>FAC-2026-0089 — 14 500,000 TND TTC</div>
            <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>Client: STE TUNISIENNE DE BOISSONS (Mat. Fisc: 0492819/A/M)</div>
          </div>

          <button
            onClick={handleTTNSubmit}
            style={{ padding: '10px 20px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
          >
            🛡️ Certifier et Transmettre à TTN
          </button>

          {ttnStatus === 'ACCEPTED' && (
            <div style={{ marginTop: '20px', padding: '16px', backgroundColor: 'rgba(5, 150, 105, 0.1)', border: '1px solid #059669', borderRadius: '8px' }}>
              <div style={{ fontWeight: 'bold', color: '#34d399', marginBottom: '4px' }}>
                ✅ Facture Validée & Scellée par TTN
              </div>
              <div style={{ fontSize: '13px', color: '#e2e8f0' }}>
                Réf. TTN : <strong>TTN-84920194</strong> | Empreinte : <code>TTN-CERT-TEFDMjAyNi0wMDg5</code>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Security & 2FA */}
      {activeTab === 'security2fa' && (
        <div style={{ backgroundColor: '#1e293b', padding: '24px', borderRadius: '10px', border: '1px solid #334155' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginTop: 0 }}>Sécurité des Accès (2FA) & Archivage Probatoire</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>
            Conformité aux exigences de sécurité financière et des Commissaires aux Comptes.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '16px' }}>
            <div style={{ padding: '16px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginTop: 0 }}>Double Facteur (2FA TOTP)</h3>
              <p style={{ fontSize: '13px', color: '#94a3b8' }}>
                Exige un code temporaire à 6 chiffres via application d'authentification.
              </p>
              <button
                onClick={() => setTwoFaEnabled(!twoFaEnabled)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: twoFaEnabled ? '#dc2626' : '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                {twoFaEnabled ? 'Désactiver le 2FA' : 'Activer le 2FA (Recommandé)'}
              </button>
              {twoFaEnabled && <span style={{ marginLeft: '12px', color: '#4ade80', fontSize: '13px', fontWeight: 600 }}>✅ 2FA Actif</span>}
            </div>

            <div style={{ padding: '16px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginTop: 0 }}>Scellement Cryptographique SHA-256</h3>
              <p style={{ fontSize: '13px', color: '#94a3b8' }}>
                Garantit l'intégrité probatoire des écritures comptables pour l'audit légal.
              </p>
              <button
                onClick={handleSealArchive}
                style={{ padding: '8px 16px', backgroundColor: '#7c3aed', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
              >
                🔒 Sceller le Registre Comptable
              </button>
              {archiveSeal && (
                <div style={{ marginTop: '8px', fontSize: '11px', fontFamily: 'monospace', color: '#c084fc', wordBreak: 'break-all' }}>
                  {archiveSeal}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: OCR */}
      {activeTab === 'ocr' && (
        <div style={{ backgroundColor: '#1e293b', padding: '24px', borderRadius: '10px', border: '1px solid #334155' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginTop: 0 }}>OCR Factures & Pré-imputation Comptable Intelligente</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>
            Analyse automatique de factures PDF numérisées et proposition d'écriture équilibrée au plan SCE.
          </p>

          <button
            onClick={handleRunOcr}
            style={{ padding: '10px 20px', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, marginTop: '8px' }}
          >
            📄 Simuler l'Analyse OCR d'une Facture Fournisseur
          </button>

          {ocrResult && (
            <div style={{ marginTop: '20px', backgroundColor: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontWeight: 'bold', color: '#fbbf24' }}>Fournisseur : {ocrResult.supplier}</span>
                <span style={{ color: '#4ade80', fontSize: '13px', fontWeight: 600 }}>Indice de Confiance IA : {ocrResult.confidence}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px', fontSize: '13px' }}>
                <div>Total HT : <strong>{ocrResult.totalHT}</strong></div>
                <div>TVA (19%) : <strong>{ocrResult.totalTVA}</strong></div>
                <div>Net à Payer TTC : <strong>{ocrResult.totalTTC}</strong></div>
              </div>

              <div style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>
                Proposition d'Écriture Comptable Générée Automatiquement :
              </div>
              <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#64748b', borderBottom: '1px solid #334155' }}>
                    <th style={{ textAlign: 'left', padding: '6px' }}>Compte</th>
                    <th style={{ textAlign: 'left', padding: '6px' }}>Libellé</th>
                    <th style={{ textAlign: 'right', padding: '6px' }}>Débit</th>
                    <th style={{ textAlign: 'right', padding: '6px' }}>Crédit</th>
                  </tr>
                </thead>
                <tbody>
                  {ocrResult.entries.map((e: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '6px', color: '#38bdf8', fontWeight: 600 }}>{e.acc}</td>
                      <td style={{ padding: '6px' }}>{e.name}</td>
                      <td style={{ textAlign: 'right', padding: '6px' }}>{e.debit}</td>
                      <td style={{ textAlign: 'right', padding: '6px' }}>{e.credit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
