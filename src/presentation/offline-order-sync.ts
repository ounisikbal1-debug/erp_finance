import type { EncryptedOfflineDraft } from './offline-draft-crypto';

export const MAX_OFFLINE_SYNC_ATTEMPTS = 5;

export function shouldAutoSyncOfflineOrder(input: {
  createdOffline: boolean;
  online: boolean;
  syncEnabled: boolean;
  authenticated: boolean;
}): boolean {
  return input.createdOffline
    && input.online
    && input.syncEnabled
    && input.authenticated;
}

export type OfflineOrderSyncResult =
  | { status: 'SYNCED' }
  | { status: 'AUTH_REQUIRED'; message: string }
  | { status: 'CONFLICT'; message: string }
  | { status: 'RETRYABLE'; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function syncOfflineSalesOrder(
  draft: EncryptedOfflineDraft,
  payload: unknown,
  accessToken: string,
  entityId: string,
  fetcher: typeof fetch = fetch,
): Promise<OfflineOrderSyncResult> {
  if (draft.documentType !== 'SALES_ORDER' || draft.entityId !== entityId) {
    return { status: 'CONFLICT', message: 'Type de document ou entité hors ligne non pris en charge.' };
  }
  if (!accessToken.trim()) {
    return { status: 'AUTH_REQUIRED', message: 'Reconnectez-vous pour synchroniser la commande.' };
  }
  if (!isRecord(payload)
    || typeof payload.customerId !== 'string'
    || !Array.isArray(payload.lines)) {
    return { status: 'CONFLICT', message: 'Le brouillon doit contenir customerId et lines pour une commande client.' };
  }

  let response: Response;
  try {
    response = await fetcher('/api/sales/orders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerId: payload.customerId,
        lines: payload.lines,
        idempotencyKey: draft.id,
      }),
    });
  } catch {
    return { status: 'RETRYABLE', message: 'Connexion interrompue; le brouillon chiffré est conservé.' };
  }

  if (response.ok) return { status: 'SYNCED' };
  let message = `Le serveur a refusé la synchronisation (HTTP ${response.status}).`;
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.error === 'string') message = body.error.slice(0, 500);
  } catch {
    // Keep the explicit HTTP status when the server did not return JSON.
  }
  if (response.status === 401 || response.status === 403) {
    return { status: 'AUTH_REQUIRED', message };
  }
  if (response.status >= 500) return { status: 'RETRYABLE', message };
  return { status: 'CONFLICT', message };
}
