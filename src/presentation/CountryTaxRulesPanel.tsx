import React, { useEffect, useState } from 'react';

interface CountryTaxRule {
  id: string;
  code: string;
  name: string;
  taxType: string;
  calculationMethod: string;
  version: number;
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceName: string;
  sourceUrl: string;
  jurisdiction: { kind: string; code: string; name: string };
}

async function readJson(response: Response): Promise<unknown> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `La requête a échoué (${response.status}).`;
    throw new Error(message);
  }
  return payload;
}

export default function CountryTaxRulesPanel({
  accessToken,
  countryCode,
}: {
  accessToken: string | null;
  countryCode: string;
}) {
  const [rules, setRules] = useState<CountryTaxRule[]>([]);
  const [ruleDraft, setRuleDraft] = useState('{}');
  const [calculationDraft, setCalculationDraft] = useState('{}');
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [calculationResult, setCalculationResult] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const headers = () => ({
    Authorization: `Bearer ${accessToken ?? ''}`,
    'Content-Type': 'application/json',
  });

  const loadRules = async (isActive: () => boolean = () => true) => {
    setIsLoading(true);
    try {
      const payload = await readJson(await fetch(
        `/api/admin/countries/${encodeURIComponent(countryCode)}/tax-rules`,
        { headers: headers() },
      ));
      if (!Array.isArray(payload)) throw new Error('La liste des règles fiscales reçue est invalide.');
      if (isActive()) {
        const list = payload as CountryTaxRule[];
        setRules(list);
        setSelectedRuleId((selected) => list.some((rule) => rule.id === selected) ? selected : list[0]?.id ?? '');
      }
    } catch (cause) {
      if (isActive()) setError(cause instanceof Error ? cause.message : 'Impossible de charger les règles fiscales.');
    } finally {
      if (isActive()) setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setError('');
    setMessage('');
    setRules([]);
    setSelectedRuleId('');
    void loadRules(() => active);
    return () => { active = false; };
  }, [countryCode, accessToken]);

  const createRule = async () => {
    if (!accessToken || isSaving) return;
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const draft: unknown = JSON.parse(ruleDraft);
      const created = await readJson(await fetch(
        `/api/admin/countries/${encodeURIComponent(countryCode)}/tax-rules`,
        { method: 'POST', headers: headers(), body: JSON.stringify(draft) },
      ));
      if (!created || typeof created !== 'object' || !('id' in created) || typeof created.id !== 'string') {
        throw new Error('La règle créée n’a pas retourné un identifiant valide.');
      }
      setRuleDraft('{}');
      setSelectedRuleId(created.id);
      setMessage('Nouvelle règle enregistrée sans modifier les versions existantes.');
      await loadRules();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de créer la règle fiscale.');
    } finally {
      setIsSaving(false);
    }
  };

  const calculate = async () => {
    if (!selectedRuleId || isSaving) return;
    setIsSaving(true);
    setError('');
    setCalculationResult('');
    try {
      const input: unknown = JSON.parse(calculationDraft);
      const result = await readJson(await fetch(
        `/api/admin/countries/${encodeURIComponent(countryCode)}/tax-rules/${encodeURIComponent(selectedRuleId)}/calculate`,
        { method: 'POST', headers: headers(), body: JSON.stringify(input) },
      ));
      setCalculationResult(JSON.stringify(result, null, 2));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de calculer la règle fiscale.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h2 style={{ marginTop: 0 }}>Règles fiscales structurées et versionnées</h2>
      <p style={{ color: '#475569', fontSize: '0.84rem' }}>
        Les versions sont ajoutées sans écraser l’historique. « Acceptée pour calculs et essais » ne signifie pas certification juridique.
        Les règles conditionnelles exigent une confirmation explicite avant calcul.
      </p>
      {error && <div role="alert" style={{ color: '#991B1B', marginBottom: 8 }}>{error}</div>}
      {message && <div role="status" style={{ color: '#166534', marginBottom: 8 }}>{message}</div>}
      {isLoading ? <p role="status">Chargement des règles fiscales…</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.82rem' }}>
            <thead>
              <tr>
                {['Juridiction', 'Règle', 'Type / méthode', 'Version / état', 'Période', 'Source'].map((label) => (
                  <th key={label} scope="col" style={{ textAlign: 'left', borderBottom: '1px solid #CBD5E1', padding: 6 }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td style={{ padding: 6 }}>{rule.jurisdiction.name} ({rule.jurisdiction.kind})</td>
                  <td style={{ padding: 6 }}>{rule.name} · {rule.code}</td>
                  <td style={{ padding: 6 }}>{rule.taxType} / {rule.calculationMethod}</td>
                  <td style={{ padding: 6 }}>v{rule.version} · {rule.status}</td>
                  <td style={{ padding: 6 }}>{rule.effectiveFrom.slice(0, 10)} – {rule.effectiveTo?.slice(0, 10) ?? 'sans fin'}</td>
                  <td style={{ padding: 6 }}><a href={rule.sourceUrl} target="_blank" rel="noreferrer">{rule.sourceName}</a></td>
                </tr>
              ))}
              {!rules.length && <tr><td colSpan={6} style={{ padding: 8, color: '#64748B' }}>Aucune règle structurée enregistrée.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <label style={{ display: 'grid', gap: 6, marginTop: 14, fontWeight: 700, fontSize: '0.84rem' }}>
        Nouvelle règle (JSON)
        <textarea
          aria-label="Nouvelle règle fiscale JSON"
          value={ruleDraft}
          onChange={(event) => setRuleDraft(event.target.value)}
          rows={12}
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
        />
      </label>
      <button type="button" disabled={!accessToken || isSaving} onClick={() => void createRule()} style={{ marginTop: 8 }}>
        Ajouter une règle / version
      </button>

      <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
        <label style={{ display: 'grid', gap: 6, fontWeight: 700, fontSize: '0.84rem' }}>
          Calcul de test
          <select aria-label="Règle à calculer" value={selectedRuleId} onChange={(event) => setSelectedRuleId(event.target.value)}>
            {rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.name} · v{rule.version}</option>)}
          </select>
        </label>
        <textarea
          aria-label="Paramètres du calcul fiscal JSON"
          value={calculationDraft}
          onChange={(event) => setCalculationDraft(event.target.value)}
          rows={4}
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
        />
        <button type="button" disabled={!selectedRuleId || isSaving} onClick={() => void calculate()}>Calculer sans comptabiliser</button>
        {calculationResult && <pre role="status" style={{ whiteSpace: 'pre-wrap', background: '#F8FAFC', padding: 10 }}>{calculationResult}</pre>}
      </div>
    </section>
  );
}
