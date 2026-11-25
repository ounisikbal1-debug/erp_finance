import React, { useState, useEffect } from 'react';

interface MigrationPanelProps {
  accessToken: string;
  entityId: string;
}

type TargetDomain =
  | 'CHART_OF_ACCOUNTS'
  | 'CUSTOMERS'
  | 'VENDORS'
  | 'MATERIALS'
  | 'EMPLOYEES'
  | 'FIXED_ASSETS';

interface MappingItem {
  sourceColumn: string;
  targetField: string | null;
  confidence: number;
  matchedBy: string;
}

interface HistoryItem {
  id: string;
  action: string;
  actorUsername: string;
  date: string;
  details: any;
}

export const MigrationPanel: React.FC<MigrationPanelProps> = ({ accessToken, entityId }) => {
  const [targetDomain, setTargetDomain] = useState<TargetDomain>('CHART_OF_ACCOUNTS');
  const [sourceErp, setSourceErp] = useState<string>('AUTO');
  const [csvContent, setCsvContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [executing, setExecuting] = useState<boolean>(false);
  const [detectedErp, setDetectedErp] = useState<string | null>(null);
  const [mappingProposals, setMappingProposals] = useState<MappingItem[]>([]);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<'import' | 'history'>('import');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Charger l'historique
  const loadHistory = async () => {
    if (!entityId) return;
    try {
      const res = await fetch(`/api/migration/history/${entityId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) setHistory(data.history || []);
      }
    } catch (e) {
      // Ignorer silencieusement
    }
  };

  useEffect(() => {
    loadHistory();
  }, [entityId, accessToken]);

  // Gestion du fichier uploadé
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text || '');
    };
    reader.readAsText(file);
  };

  // 1. Analyse automatique
  const handleAnalyze = async () => {
    if (!csvContent.trim()) {
      setErrorMessage('Veuillez fournir du contenu CSV/Excel ou charger un fichier.');
      return;
    }
    setAnalyzing(true);
    setErrorMessage(null);
    setSimulationResult(null);
    setExecutionResult(null);

    try {
      const res = await fetch('/api/migration/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          content: csvContent,
          targetDomain,
          sourceErp: sourceErp === 'AUTO' ? undefined : sourceErp,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de l'analyse.");
      }

      setDetectedErp(data.detectedErp);
      setMappingProposals(data.proposals || []);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // 2. Simulation (Dry-Run)
  const handleSimulate = async () => {
    setSimulating(true);
    setErrorMessage(null);
    setExecutionResult(null);

    try {
      // Transformer le mapping en dictionnaire
      const fieldMapping: Record<string, string> = {};
      mappingProposals.forEach((p) => {
        if (p.targetField) fieldMapping[p.sourceColumn] = p.targetField;
      });

      // Extraire les lignes simples
      const lines = csvContent.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) throw new Error('Fichier insuffisant (au moins 1 ligne en-tête + 1 ligne de données).');
      const delim = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
      const headers = lines[0].split(delim).map((h) => h.trim().replace(/^"|"$/g, ''));
      const rows = lines.slice(1).map((l) => {
        const cols = l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = cols[i] || ''; });
        return obj;
      });

      const res = await fetch('/api/migration/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          rows,
          targetDomain,
          fieldMapping,
          sourceErp: detectedErp || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de la simulation.');
      }
      setSimulationResult(data.simulation);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSimulating(false);
    }
  };

  // 3. Exécution finale
  const handleExecute = async () => {
    if (!window.confirm("Êtes-vous sûr de vouloir exécuter l'importation réelle en base de données ?")) return;

    setExecuting(true);
    setErrorMessage(null);

    try {
      const fieldMapping: Record<string, string> = {};
      mappingProposals.forEach((p) => {
        if (p.targetField) fieldMapping[p.sourceColumn] = p.targetField;
      });

      const lines = csvContent.trim().split(/\r?\n/).filter(Boolean);
      const delim = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
      const headers = lines[0].split(delim).map((h) => h.trim().replace(/^"|"$/g, ''));
      const rows = lines.slice(1).map((l) => {
        const cols = l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = cols[i] || ''; });
        return obj;
      });

      const res = await fetch('/api/migration/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          entityId,
          targetDomain,
          rows,
          fieldMapping,
          options: {
            updateExisting: true,
            sourceErp: detectedErp || undefined,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de l'exécution de la migration.");
      }
      setExecutionResult(data.result);
      loadHistory();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setExecuting(false);
    }
  };

  // Exemple rapide de données démo
  const loadDemoData = (erp: string) => {
    if (erp === 'SAP') {
      setTargetDomain('CHART_OF_ACCOUNTS');
      setSourceErp('SAP');
      setCsvContent(`SAKNR;TXT50;BILKT\n411100;Clients Ventes Locales;4\n401100;Fournisseurs Matières Premières;4\n707000;Ventes de Marchandises;7\n607000;Achats de Marchandises;6`);
    } else if (erp === 'SAGE') {
      setTargetDomain('CUSTOMERS');
      setSourceErp('SAGE');
      setCsvContent(`CT_Num;CT_Intitule;CT_Siret;CT_Ville;CT_Telephone\nCL001;SOCIETE GENERALE TUNISIE;1234567/A/M/000;Tunis;+21671000000\nCL002;MEDITERRANEAN TRADING;9876543/B/P/000;Sousse;+21673000000`);
    } else if (erp === 'ODOO') {
      setTargetDomain('MATERIALS');
      setSourceErp('ODOO');
      setCsvContent(`default_code,name,uom_id,list_price,standard_price\nART-100,Huile d'Olive Extra Vierge 1L,Litre,25.500,18.200\nART-200,Dattes Deglet Nour 1Kg,Kg,14.000,9.500`);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* En-tête du module */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', background: '#FFFFFF', padding: '20px 24px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.8rem' }}>🚀</span>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0F172A' }}>
              Module de Migration Universelle (ERP → SAFE)
            </h1>
          </div>
          <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: '0.9rem' }}>
            Importation automatisée, mapping contextuel tolérant et simulation sécurisée depuis SAP, Oracle, Sage, Dynamics, Odoo ou fichiers Excel/CSV.
          </p>
        </div>

        {/* Onglets navigation interne */}
        <div style={{ display: 'flex', gap: '8px', background: '#F1F5F9', padding: '4px', borderRadius: '8px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
              background: activeTab === 'import' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'import' ? '#0F172A' : '#64748B',
              boxShadow: activeTab === 'import' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            📥 Importer & Mapper
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('history'); loadHistory(); }}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
              background: activeTab === 'history' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'history' ? '#0F172A' : '#64748B',
              boxShadow: activeTab === 'history' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            📜 Historique & Audit ({history.length})
          </button>
        </div>
      </div>

      {errorMessage && (
        <div style={{ padding: '14px 18px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '8px', marginBottom: '20px', fontWeight: 600 }}>
          ⚠ï¸ {errorMessage}
        </div>
      )}

      {activeTab === 'import' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Colonne Gauche : Configuration et Données Sources */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: 0, marginBottom: '16px', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>1ï¸⃣</span> Configuration du flux
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Domaine Cible SAFE
                  </label>
                  <select
                    value={targetDomain}
                    onChange={(e) => setTargetDomain(e.target.value as TargetDomain)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontWeight: 600 }}
                  >
                    <option value="CHART_OF_ACCOUNTS">Plan Comptable (Comptes)</option>
                    <option value="CUSTOMERS">Tiers Clients</option>
                    <option value="VENDORS">Tiers Fournisseurs</option>
                    <option value="MATERIALS">Catalogue Articles & Stocks</option>
                    <option value="EMPLOYEES">Salariés & RH</option>
                    <option value="FIXED_ASSETS">Registre des Immobilisations</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    ERP Source
                  </label>
                  <select
                    value={sourceErp}
                    onChange={(e) => setSourceErp(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontWeight: 600 }}
                  >
                    <option value="AUTO">✨ Détection Automatique Intelligente</option>
                    <option value="SAP">SAP (ECC / S4HANA)</option>
                    <option value="SAGE">Sage 100 / X3</option>
                    <option value="ORACLE">Oracle EBS / Fusion</option>
                    <option value="DYNAMICS">Microsoft Dynamics 365</option>
                    <option value="ODOO">Odoo (Community & Enterprise)</option>
                    <option value="GENERIC">Fichier Excel / CSV Personnalisé</option>
                  </select>
                </div>
              </div>

              {/* Raccourcis Données de Test */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B' }}>Charger un exemple :</span>
                <button type="button" onClick={() => loadDemoData('SAP')} style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer', fontWeight: 600 }}>SAP Comptes</button>
                <button type="button" onClick={() => loadDemoData('SAGE')} style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer', fontWeight: 600 }}>Sage Clients</button>
                <button type="button" onClick={() => loadDemoData('ODOO')} style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer', fontWeight: 600 }}>Odoo Articles</button>
              </div>

              {/* Upload fichier ou copier-coller */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    Contenu brut (CSV / TSV / Texte délimité)
                  </label>
                  <label style={{ fontSize: '0.75rem', color: '#2563EB', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                    ðŸ“ Parcourir un fichier...
                    <input type="file" accept=".csv,.txt,.tsv" onChange={handleFileUpload} style={{ display: 'none' }} />
                  </label>
                </div>
                {fileName && (
                  <div style={{ fontSize: '0.75rem', color: '#059669', marginBottom: '6px', fontWeight: 600 }}>
                    Fichier chargé : {fileName}
                  </div>
                )}
                <textarea
                  rows={8}
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  placeholder="Collez ici les données exportées ou chargez un fichier CSV..."
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
              </div>

              <button
                type="button"
                onClick={handleAnalyze}
                disabled={analyzing}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: analyzing ? 'not-allowed' : 'pointer',
                  opacity: analyzing ? 0.7 : 1,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {analyzing ? 'â³ Analyse en cours...' : 'ðŸ” Étape 1 : Analyser & Détecter le Mapping'}
              </button>
            </div>
          </div>

          {/* Colonne Droite : Visualisation du Mapping & Simulation */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>2ï¸⃣</span> Correspondances & Validation
                </h2>
                {detectedErp && (
                  <span style={{ padding: '4px 10px', background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 800 }}>
                    ERP Détecté : {detectedErp}
                  </span>
                )}
              </div>

              {mappingProposals.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8', border: '2px dashed #E2E8F0', borderRadius: '8px', fontSize: '0.9rem' }}>
                  Aucune analyse effectuée. Collez vos données et cliquez sur « Analyser » pour visualiser la table de correspondance automatique.
                </div>
              ) : (
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', marginBottom: '16px' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                        <th style={{ padding: '8px 10px' }}>Colonne Source</th>
                        <th style={{ padding: '8px 10px' }}>Champ SAFE Associé</th>
                        <th style={{ padding: '8px 10px' }}>Confiance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappingProposals.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#334155' }}>
                            {item.sourceColumn}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ padding: '3px 8px', borderRadius: '4px', background: item.targetField ? '#EFF6FF' : '#F1F5F9', color: item.targetField ? '#1E40AF' : '#64748B', fontWeight: 600 }}>
                              {item.targetField || '(Ignoré)'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ color: item.confidence >= 80 ? '#059669' : '#D97706', fontWeight: 700 }}>
                              {item.confidence}% ({item.matchedBy})
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={handleSimulate}
                      disabled={simulating}
                      style={{
                        padding: '10px',
                        background: '#0F172A',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 700,
                        cursor: simulating ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {simulating ? 'â³ Simulation...' : '🛡ï¸ Étape 2 : Simuler (Dry-Run)'}
                    </button>

                    <button
                      type="button"
                      onClick={handleExecute}
                      disabled={executing || !simulationResult || simulationResult.validRows === 0}
                      style={{
                        padding: '10px',
                        background: '#16A34A',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 800,
                        cursor: (executing || !simulationResult || simulationResult.validRows === 0) ? 'not-allowed' : 'pointer',
                        opacity: (executing || !simulationResult || simulationResult.validRows === 0) ? 0.5 : 1,
                      }}
                    >
                      {executing ? 'â³ Injection...' : '🚀 Étape 3 : Exécuter la Migration'}
                    </button>
                  </div>
                </>
              )}

              {/* Rapport de Simulation */}
              {simulationResult && (
                <div style={{ marginTop: '16px', padding: '14px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0F172A', marginBottom: '8px' }}>
                    Résultat de la simulation :
                  </div>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem' }}>
                    <div>Total lignes : <strong>{simulationResult.totalRows}</strong></div>
                    <div style={{ color: '#16A34A' }}>Valides : <strong>{simulationResult.validRows} ✅</strong></div>
                    <div style={{ color: simulationResult.invalidRows > 0 ? '#DC2626' : '#64748B' }}>
                      Erreurs : <strong>{simulationResult.invalidRows}</strong>
                    </div>
                  </div>
                  {simulationResult.errors?.length > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#DC2626' }}>
                      {simulationResult.errors.slice(0, 3).map((e: any, i: number) => (
                        <div key={i}>Ligne {e.rowNumber}: {e.message}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Rapport d'Exécution Réelle */}
              {executionResult && (
                <div style={{ marginTop: '16px', padding: '14px', background: '#ECFDF5', borderRadius: '8px', border: '1px solid #A7F3D0' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#065F46', marginBottom: '6px' }}>
                    🎉 Migration complétée avec succès !
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#047857' }}>
                    Lignes insérées : <strong>{executionResult.insertedCount}</strong> | Mis à jour : <strong>{executionResult.updatedCount}</strong> | Durée : <strong>{executionResult.durationMs}ms</strong>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Onglet Historique & Audit */
        <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: 0, marginBottom: '16px', color: '#1E293B' }}>
            Journal d'audit des migrations d'entreprise
          </h2>
          {history.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#94A3B8' }}>
              Aucune opération de migration n'a encore été journalisée pour cette entité.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: '10px' }}>Date</th>
                  <th style={{ padding: '10px' }}>Action</th>
                  <th style={{ padding: '10px' }}>Opérateur</th>
                  <th style={{ padding: '10px' }}>Détails de l'import</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px', color: '#64748B' }}>
                      {new Date(h.date).toLocaleString('fr-FR')}
                    </td>
                    <td style={{ padding: '10px', fontWeight: 700, color: '#0F172A' }}>
                      {h.action}
                    </td>
                    <td style={{ padding: '10px', color: '#334155' }}>
                      {h.actorUsername}
                    </td>
                    <td style={{ padding: '10px', color: '#475569' }}>
                      {h.details ? (
                        <span>
                          Total: {h.details.total} | Insérés: {h.details.insertedCount} | Mis à jour: {h.details.updatedCount} ({h.details.sourceErp})
                        </span>
                      ) : (
                        '—'
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
};

export default MigrationPanel;
