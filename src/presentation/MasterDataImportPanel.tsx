import React, { useEffect, useState } from 'react';
import ImportPreviewPanel from './ImportPreviewPanel';
import { MasterDataImportKind, validateMasterDataImportRow } from './master-data-import-validation';

interface PartnerRecord {
  code: string;
}

interface MasterDataImportPanelProps {
  kind: MasterDataImportKind;
  accessToken: string | null;
  entityId: string | null;
  onClose: () => void;
}

const HEADERS = ['code', 'name', 'fiscalId', 'email', 'phone', 'address'];

function errorMessage(payload: unknown, fallback: string): string {
  return payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
    ? payload.error
    : fallback;
}

export default function MasterDataImportPanel({
  kind,
  accessToken,
  entityId,
  onClose,
}: MasterDataImportPanelProps) {
  const [existingCodes, setExistingCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const label = kind === 'customer' ? 'clients' : 'fournisseurs';
  const listUrl = kind === 'customer' ? '/api/sales/customers' : '/api/purchases/vendors';
  const createUrl = kind === 'customer' ? '/api/sales/customers' : '/api/purchases/vendors';

  useEffect(() => {
    let active = true;
    const loadCodes = async () => {
      if (!accessToken || !entityId) {
        setError('Session API invalide. Reconnectez-vous pour importer des données.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${listUrl}?entityId=${encodeURIComponent(entityId)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(errorMessage(payload, `Impossible de charger les ${label}.`));
        if (!Array.isArray(payload) || !payload.every((item) => item && typeof item === 'object'
          && 'code' in item && typeof item.code === 'string')) {
          throw new Error(`La liste des ${label} renvoyée par l’API est invalide.`);
        }
        if (active) setExistingCodes((payload as PartnerRecord[]).map((item) => item.code));
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : `Impossible de charger les ${label}.`);
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadCodes();
    return () => { active = false; };
  }, [accessToken, entityId, label, listUrl]);

  const importRows = async (rows: Array<Record<string, unknown>>) => {
    if (!accessToken || !entityId) throw new Error('Session API invalide. Reconnectez-vous.');
    let created = 0;
    const createdCodes: string[] = [];
    const failures: string[] = [];
    for (const [index, row] of rows.entries()) {
      try {
        const response = await fetch(createUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            entityId,
            code: String(row.code).trim(),
            name: String(row.name).trim(),
            fiscalId: String(row.fiscalId ?? '').trim() || null,
            email: String(row.email ?? '').trim() || null,
            phone: String(row.phone ?? '').trim() || null,
            address: String(row.address ?? '').trim() || null,
          }),
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(errorMessage(payload, `HTTP ${response.status}`));
        if (!payload || typeof payload !== 'object' || !('code' in payload)
          || payload.code !== String(row.code).trim()) {
          throw new Error('Réponse de création invalide.');
        }
        created += 1;
        createdCodes.push(String(row.code).trim());
      } catch (requestError) {
        failures.push(`Ligne ${index + 2} (${String(row.code)}): ${requestError instanceof Error ? requestError.message : 'échec non détaillé'}`);
      }
    }
    if (created > 0) {
      setExistingCodes((codes) => codes.concat(createdCodes.filter((code) =>
        !codes.some((existing) => existing.toLocaleUpperCase() === code.toLocaleUpperCase()))));
      window.dispatchEvent(new CustomEvent('safe:master-data-imported', { detail: { kind } }));
    }
    return { created, failures };
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="master-import-title"
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15, 23, 42, .55)', display: 'grid', placeItems: 'center', padding: 18 }}>
      <section style={{ width: 'min(900px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#FFFFFF', borderRadius: 12, padding: 20, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
          <div>
            <h2 id="master-import-title" style={{ margin: 0 }}>Importer des {label}</h2>
            <p style={{ margin: '6px 0 0', color: '#475569' }}>
              Import de fiches de référentiel pour l’entité authentifiée. Aucune facture, écriture ou autre transaction n’est créée.
            </p>
          </div>
          <button type="button" disabled={busy || loading} onClick={onClose}>Fermer</button>
        </div>
        {loading && <div role="status">Chargement du référentiel existant…</div>}
        {error && <div role="alert" style={{ color: '#991B1B' }}>{error}</div>}
        {!loading && !error && (
          <ImportPreviewPanel
            title={`Importer le référentiel ${kind === 'customer' ? 'clients' : 'fournisseurs'}`}
            description="Les codes déjà utilisés ou répétés dans le fichier sont refusés avant toute création."
            headers={HEADERS}
            validateRow={(row, index, allRows) => validateMasterDataImportRow(kind, row, index, allRows, existingCodes)}
            onBusyChange={setBusy}
            onImport={importRows}
          />
        )}
      </section>
    </div>
  );
}
