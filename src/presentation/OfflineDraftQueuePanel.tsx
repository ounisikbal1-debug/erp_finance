import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  validateOfflineSyncPolicy,
} from '../application/modules/admin/workbook-offline-sync';
import { decryptOfflineDraft, encryptOfflineDraft, type EncryptedOfflineDraft } from './offline-draft-crypto';
import { EncryptedOfflineDraftQueue, IndexedDbOfflineDraftStorage } from './offline-draft-store';
import {
  MAX_OFFLINE_SYNC_ATTEMPTS,
  shouldAutoSyncOfflineOrder,
  syncOfflineSalesOrder,
} from './offline-order-sync';
import { buildOfflineSalesOrderPayload } from './offline-order-form';
import { getHtmlLanguage, translateBusinessText, useInterfaceLanguage } from './localization';

const MAXIMUM_DRAFT_BYTES = 256 * 1024;

interface OfflineCustomer {
  id: string;
  name: string;
}

interface OfflineMaterial {
  id: string;
  sku: string;
  name: string;
  unitCode: string;
  unitPrice: number;
}

interface OfflineOrderLine {
  key: string;
  materialId: string;
  quantity: string;
  unitPrice: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export default function OfflineDraftQueuePanel({
  entityId,
  accessToken,
  configuration,
  confirmed,
  syncEnabled,
}: {
  entityId: string;
  accessToken: string | null;
  configuration: unknown;
  confirmed: boolean;
  syncEnabled: boolean;
}) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const [customers, setCustomers] = useState<OfflineCustomer[]>([]);
  const [materials, setMaterials] = useState<OfflineMaterial[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [orderLines, setOrderLines] = useState<OfflineOrderLine[]>([
    { key: globalThis.crypto.randomUUID(), materialId: '', quantity: '1', unitPrice: '' },
  ]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [drafts, setDrafts] = useState<EncryptedOfflineDraft[]>([]);
  const [unlockedDraft, setUnlockedDraft] = useState<{
    id: string;
    plaintext: string;
    payload: unknown;
    draft: EncryptedOfflineDraft;
  } | null>(null);
  const [error, setError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const syncingIds = useRef(new Set<string>());
  const autoAttemptedIds = useRef(new Set<string>());
  const deferredSyncIds = useRef(new Set<string>());

  const queueState = useMemo(() => {
    if (!confirmed) return { queue: null, policy: null, error: '' };
    try {
      const policy = validateOfflineSyncPolicy(configuration);
      return {
        queue: new EncryptedOfflineDraftQueue(new IndexedDbOfflineDraftStorage(), policy),
        policy,
        error: '',
      };
    } catch (validationError) {
      return {
        queue: null,
        policy: null,
        error: validationError instanceof Error ? validationError.message : text('Politique hors ligne invalide.'),
      };
    }
  }, [configuration, confirmed]);

  const refresh = async () => {
    if (!queueState.queue) {
      setDrafts([]);
      return;
    }
    setBusy(true);
    setError('');
    try {
      setDrafts(await queueState.queue.list(entityId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : text('Impossible de lire la file chiffrée.'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setPassphrase('');
    setCustomerId('');
    setOrderLines([{ key: globalThis.crypto.randomUUID(), materialId: '', quantity: '1', unitPrice: '' }]);
    setUnlockedDraft(null);
    setDrafts([]);
    void refresh();
  }, [entityId, queueState.queue]);

  useEffect(() => {
    const controller = new AbortController();
    if (!accessToken || !entityId) {
      setCustomers([]);
      setMaterials([]);
      return () => controller.abort();
    }

    const loadOrderOptions = async () => {
      setLoadingOptions(true);
      setError('');
      try {
        const headers = { Authorization: `Bearer ${accessToken}` };
        const [customerResponse, materialResponse] = await Promise.all([
          fetch('/api/sales/customers', { headers, signal: controller.signal }),
          fetch('/api/materials/materials', { headers, signal: controller.signal }),
        ]);
        const [customerPayload, materialPayload]: [unknown, unknown] = await Promise.all([
          customerResponse.json(),
          materialResponse.json(),
        ]);
        if (!customerResponse.ok || !materialResponse.ok) {
          const errorBody = !customerResponse.ok ? customerPayload : materialPayload;
          throw new Error(isRecord(errorBody) && typeof errorBody.error === 'string'
            ? errorBody.error
            : text('Impossible de charger les clients et les articles.'));
        }
        if (!Array.isArray(customerPayload) || !Array.isArray(materialPayload)) {
          throw new Error(text('Les données des clients ou des articles sont invalides.'));
        }
        setCustomers(customerPayload.filter((row): row is OfflineCustomer => isRecord(row)
          && typeof row.id === 'string' && typeof row.name === 'string'));
        setMaterials(materialPayload.filter((row): row is OfflineMaterial => isRecord(row)
          && typeof row.id === 'string' && typeof row.sku === 'string' && typeof row.name === 'string'
          && typeof row.unitCode === 'string' && typeof row.unitPrice === 'number' && Number.isFinite(row.unitPrice)));
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? text(loadError.message) : text('Impossible de charger les clients et les articles.'));
        }
      } finally {
        if (!controller.signal.aborted) setLoadingOptions(false);
      }
    };

    void loadOrderOptions();
    return () => controller.abort();
  }, [accessToken, entityId, language]);

  const addDraft = async () => {
    if (!queueState.queue || !queueState.policy) return;
    setBusy(true);
    setError('');
    try {
      const payload = buildOfflineSalesOrderPayload({
        customerId,
        lines: orderLines.map(({ materialId, quantity, unitPrice }) => ({
          materialId,
          quantity,
          unitPrice,
        })),
      });
      const encrypted = await encryptOfflineDraft({
        metadata: {
          id: globalThis.crypto.randomUUID(),
          entityId,
          documentType: 'SALES_ORDER',
          createdAt: new Date().toISOString(),
        },
        payload,
        passphrase,
        maximumBytes: MAXIMUM_DRAFT_BYTES,
      });
      if (typeof navigator !== 'undefined' && !navigator.onLine) deferredSyncIds.current.add(encrypted.id);
      await queueState.queue.add(encrypted);
      setUnlockedDraft({
        id: encrypted.id,
        plaintext: JSON.stringify(payload, null, 2),
        payload,
        draft: encrypted,
      });
      setCustomerId('');
      setOrderLines([{ key: globalThis.crypto.randomUUID(), materialId: '', quantity: '1', unitPrice: '' }]);
      setPassphrase('');
      await refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? text(saveError.message) : text('Impossible de chiffrer le brouillon.'));
    } finally {
      setBusy(false);
    }
  };

  const unlockDraft = async (draft: EncryptedOfflineDraft) => {
    setBusy(true);
    setError('');
    try {
      const payload = await decryptOfflineDraft<unknown>({ draft, passphrase });
      setUnlockedDraft({ id: draft.id, plaintext: JSON.stringify(payload, null, 2), payload, draft });
      setPassphrase('');
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : text('Impossible de déchiffrer le brouillon.'));
    } finally {
      setBusy(false);
    }
  };

  const deleteDraft = async (draft: EncryptedOfflineDraft) => {
    if (!queueState.queue || !globalThis.confirm(text('Supprimer définitivement ce brouillon chiffré de cet appareil ?'))) return;
    setBusy(true);
    setError('');
    try {
      await queueState.queue.delete(entityId, draft.id);
      if (unlockedDraft?.id === draft.id) setUnlockedDraft(null);
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : text('Impossible de supprimer le brouillon.'));
    } finally {
      setBusy(false);
    }
  };

  const syncDraft = async (target: NonNullable<typeof unlockedDraft>) => {
    if (!queueState.queue || !syncEnabled || !accessToken || syncingIds.current.has(target.id)) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSyncMessage(text('Hors ligne : la commande restera chiffrée jusqu’au retour du réseau.'));
      return;
    }
    if (target.draft.syncState === 'CONFLICT' || target.draft.syncState === 'RETRY_LIMIT') {
      setSyncMessage(text('Cette commande attend une revue manuelle avant toute nouvelle tentative.'));
      return;
    }
    const previousAttempts = target.draft.syncAttempts ?? 0;
    if (previousAttempts >= MAX_OFFLINE_SYNC_ATTEMPTS) {
      await queueState.queue.setSyncState(entityId, target.id, 'RETRY_LIMIT');
      setSyncMessage(text('Limite de tentatives atteinte; revoyez le brouillon avant toute action.'));
      await refresh();
      return;
    }

    syncingIds.current.add(target.id);
    setBusy(true);
    setError('');
    setSyncMessage('');
    try {
      const attempts = await queueState.queue.recordSyncAttempt(entityId, target.id, 'PENDING');
      const result = await syncOfflineSalesOrder(target.draft, target.payload, accessToken, entityId);
      if (result.status === 'SYNCED') {
        await queueState.queue.delete(entityId, target.id);
        deferredSyncIds.current.delete(target.id);
        setUnlockedDraft(null);
        setSyncMessage(text('Commande synchronisée; le serveur a confirmé sa création.'));
      } else if (result.status === 'CONFLICT') {
        deferredSyncIds.current.delete(target.id);
        await queueState.queue.setSyncState(entityId, target.id, 'CONFLICT');
        setUnlockedDraft({ ...target, draft: { ...target.draft, syncState: 'CONFLICT', syncAttempts: attempts } });
        setSyncMessage(`${result.message} ${text('Le brouillon est conservé pour arbitrage manuel.')}`);
      } else if (result.status === 'RETRYABLE' && attempts >= MAX_OFFLINE_SYNC_ATTEMPTS) {
        deferredSyncIds.current.delete(target.id);
        await queueState.queue.setSyncState(entityId, target.id, 'RETRY_LIMIT');
        setUnlockedDraft({ ...target, draft: { ...target.draft, syncState: 'RETRY_LIMIT', syncAttempts: attempts } });
        setSyncMessage(`${result.message} ${text('Limite de tentatives atteinte; revue manuelle requise.')}`);
      } else {
        setUnlockedDraft({ ...target, draft: { ...target.draft, syncAttempts: attempts } });
        setSyncMessage(result.message);
      }
      await refresh();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : text('La synchronisation a échoué.'));
    } finally {
      syncingIds.current.delete(target.id);
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!unlockedDraft || !syncEnabled || !accessToken) return undefined;
    const syncOnReconnect = () => {
      if (shouldAutoSyncOfflineOrder({
        createdOffline: deferredSyncIds.current.has(unlockedDraft.id),
        online: typeof navigator !== 'undefined' && navigator.onLine,
        syncEnabled,
        authenticated: Boolean(accessToken),
      })) {
        autoAttemptedIds.current.add(unlockedDraft.id);
        void syncDraft(unlockedDraft);
      }
    };
    window.addEventListener('online', syncOnReconnect);
    if (!autoAttemptedIds.current.has(unlockedDraft.id)
      && shouldAutoSyncOfflineOrder({
        createdOffline: deferredSyncIds.current.has(unlockedDraft.id),
        online: typeof navigator !== 'undefined' && navigator.onLine,
        syncEnabled,
        authenticated: Boolean(accessToken),
      })) {
      autoAttemptedIds.current.add(unlockedDraft.id);
      void syncDraft(unlockedDraft);
    }
    return () => window.removeEventListener('online', syncOnReconnect);
  }, [unlockedDraft, syncEnabled, accessToken]);

  return (
    <section style={{ borderTop: '1px solid #E2E8F0', marginTop: 24, paddingTop: 20 }}>
      <h3 style={{ margin: '0 0 8px' }}>{text('Brouillons hors ligne chiffrés')}</h3>
      <p style={{ color: '#475569', lineHeight: 1.5 }}>
        {text('Brouillons chiffrés AES-GCM sur cet appareil avec une phrase secrète non mémorisée. Si l’application reste ouverte, les commandes client créées hors ligne sont envoyées au retour du réseau avec l’authentification active. Après fermeture ou rechargement, déverrouillez le brouillon puis synchronisez-le manuellement. Aucune facture ou écriture comptable n’est créée. La limite est de 256 Kio par brouillon.')}
      </p>
      {!confirmed ? (
        <p role="status">{text('Mode indisponible : enregistrez et confirmez d’abord une politique de conservation et de conflits.')}</p>
      ) : queueState.error ? (
        <p role="alert">{queueState.error}</p>
      ) : (
        <>
          <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }} htmlFor="offline-order-customer">
            {text('Client')}
          </label>
          <select
            id="offline-order-customer"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            disabled={loadingOptions || customers.length === 0}
            style={{ display: 'block', width: '100%', maxWidth: 420, padding: 10, marginBottom: 12 }}
          >
            <option value="">{loadingOptions ? text('Chargement…') : text('Choisir un client')}</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
          <h4>{text('Articles de la commande')}</h4>
          {orderLines.map((line, index) => (
            <div key={line.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) repeat(2, minmax(100px, 1fr)) auto', gap: 8, maxWidth: 900, marginBottom: 10 }}>
              <label>
                <span style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>{text('Article')} {index + 1}</span>
                <select
                  aria-label={`${text('Article')} ${index + 1}`}
                  value={line.materialId}
                  disabled={loadingOptions || materials.length === 0}
                  onChange={(event) => {
                    const selected = materials.find((material) => material.id === event.target.value);
                    setOrderLines((current) => current.map((item) => item.key === line.key
                      ? { ...item, materialId: event.target.value, unitPrice: selected ? String(selected.unitPrice) : '' }
                      : item));
                  }}
                  style={{ boxSizing: 'border-box', width: '100%', padding: 9 }}
                >
                  <option value="">{loadingOptions ? text('Chargement…') : text('Choisir un article')}</option>
                  {materials.map((material) => (
                    <option key={material.id} value={material.id}>{material.sku} — {material.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>{text('Quantité')}</span>
                <input
                  aria-label={`${text('Quantité')} ${index + 1}`}
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={line.quantity}
                  onChange={(event) => setOrderLines((current) => current.map((item) => item.key === line.key
                    ? { ...item, quantity: event.target.value }
                    : item))}
                  style={{ boxSizing: 'border-box', width: '100%', padding: 9 }}
                />
              </label>
              <label>
                <span style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>{text('Prix unitaire HT')}</span>
                <input
                  aria-label={`${text('Prix unitaire HT')} ${index + 1}`}
                  type="number"
                  min="0"
                  step="0.001"
                  value={line.unitPrice}
                  onChange={(event) => setOrderLines((current) => current.map((item) => item.key === line.key
                    ? { ...item, unitPrice: event.target.value }
                    : item))}
                  style={{ boxSizing: 'border-box', width: '100%', padding: 9 }}
                />
              </label>
              <button
                type="button"
                disabled={orderLines.length === 1}
                onClick={() => setOrderLines((current) => current.filter((item) => item.key !== line.key))}
                style={{ alignSelf: 'end', padding: 9 }}
              >
                {text('Supprimer')}
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={orderLines.length >= 100}
            onClick={() => setOrderLines((current) => [
              ...current,
              { key: globalThis.crypto.randomUUID(), materialId: '', quantity: '1', unitPrice: '' },
            ])}
          >
            {text('Ajouter une ligne')}
          </button>
          <label style={{ display: 'block', fontWeight: 700, margin: '12px 0 6px' }} htmlFor="offline-draft-passphrase">
            {text('Phrase secrète locale (12 caractères minimum)')}
          </label>
          <input
            id="offline-draft-passphrase"
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            maxLength={1024}
            style={{ display: 'block', width: '100%', maxWidth: 420, padding: 10 }}
          />
          <button
            type="button"
            disabled={busy || loadingOptions || !customerId || customers.length === 0 || materials.length === 0 || passphrase.length < 12}
            onClick={() => void addDraft()}
            style={{ marginTop: 12, border: 0, borderRadius: 6, background: '#475569', color: '#FFFFFF', padding: '9px 14px', fontWeight: 700 }}
          >
            {text('Chiffrer et conserver localement')}
          </button>
          {error && <p role="alert" style={{ color: '#B91C1C' }}>{error}</p>}
          {syncMessage && <p role="status" style={{ color: '#92400E' }}>{syncMessage}</p>}
          {customers.length === 0 && !loadingOptions && <p role="status">{text('Aucun client disponible pour cette entité.')}</p>}
          {materials.length === 0 && !loadingOptions && <p role="status">{text('Aucun article disponible pour cette entité.')}</p>}
          <h4>{text('Brouillons conservés :')} {drafts.length} / {queueState.policy?.maxPendingItems}</h4>
          {drafts.map((draft) => (
            <div key={draft.id} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, marginBottom: 8 }}>
              <strong>{text(draft.documentType === 'SALES_ORDER' ? 'Commande client' : 'Commande fournisseur')} — {new Date(draft.createdAt).toLocaleString(getHtmlLanguage(language))}</strong>
              <p style={{ margin: '6px 0', color: '#64748B' }}>
                {draft.syncState === 'CONFLICT'
                  ? text('Conflit à arbitrer manuellement; le serveur n’a pas été écrasé.')
                  : draft.syncState === 'RETRY_LIMIT'
                    ? text('Limite de tentatives atteinte; revue manuelle requise.')
                    : `${text('Chiffré localement · tentatives')} ${draft.syncAttempts ?? 0}/${MAX_OFFLINE_SYNC_ATTEMPTS}`}
              </p>
              <button type="button" disabled={busy || passphrase.length < 12} onClick={() => void unlockDraft(draft)}>
                {text('Déchiffrer localement')}
              </button>{' '}
              {unlockedDraft?.id === draft.id && draft.syncState !== 'CONFLICT' && draft.syncState !== 'RETRY_LIMIT' && (
                <button type="button" disabled={busy || !syncEnabled || !accessToken} onClick={() => void syncDraft(unlockedDraft)}>
                  {text('Synchroniser maintenant')}
                </button>
              )}{' '}
              <button type="button" disabled={busy} onClick={() => void deleteDraft(draft)}>
                {text('Supprimer')}
              </button>
              {unlockedDraft?.id === draft.id && (
                <div>
                  <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{unlockedDraft.plaintext}</pre>
                  <button type="button" onClick={() => setUnlockedDraft(null)}>{text('Verrouiller l’aperçu')}</button>
                </div>
              )}
            </div>
          ))}
          {!syncEnabled && <p role="status">{text('Synchronisation inactive : confirmez et activez la politique administrée.')}</p>}
        </>
      )}
    </section>
  );
}
