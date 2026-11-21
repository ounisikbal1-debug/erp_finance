import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EncryptedOfflineDraft } from './offline-draft-crypto';
import { shouldAutoSyncOfflineOrder, syncOfflineSalesOrder } from './offline-order-sync';

const draft: EncryptedOfflineDraft = {
  id: '39dc9878-89e2-4c97-9105-24ed8fe51fe7',
  entityId: 'entity-a',
  documentType: 'SALES_ORDER',
  createdAt: '2026-11-12T18:00:00.000Z',
  salt: 'salt',
  iv: 'iv',
  ciphertext: 'encrypted',
};

describe('offline sales-order synchronization', () => {
  it('only auto-syncs an offline-created order after reconnect with activation and authentication', () => {
    const request = {
      createdOffline: true,
      online: true,
      syncEnabled: true,
      authenticated: true,
    };
    assert.equal(shouldAutoSyncOfflineOrder(request), true);
    assert.equal(shouldAutoSyncOfflineOrder({ ...request, online: false }), false);
    assert.equal(shouldAutoSyncOfflineOrder({ ...request, createdOffline: false }), false);
    assert.equal(shouldAutoSyncOfflineOrder({ ...request, syncEnabled: false }), false);
    assert.equal(shouldAutoSyncOfflineOrder({ ...request, authenticated: false }), false);
  });

  it('uses the normal bearer token and stable idempotency key without forwarding other payload fields', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    const result = await syncOfflineSalesOrder({
      ...draft,
      entityId: 'entity-a',
    }, {
      entityId: 'attacker-entity',
      customerId: 'customer-a',
      lines: [{ materialId: 'material-a', quantity: 2, unitPrice: 3 }],
      ignored: 'not sent',
    }, 'authenticated-token', 'entity-a', async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response('{}', { status: 201 });
    });

    assert.equal(result.status, 'SYNCED');
    assert.equal(requestUrl, '/api/sales/orders');
    assert.equal(new Headers(requestInit?.headers).get('authorization'), 'Bearer authenticated-token');
    assert.deepEqual(JSON.parse(String(requestInit?.body)), {
      customerId: 'customer-a',
      lines: [{ materialId: 'material-a', quantity: 2, unitPrice: 3 }],
      idempotencyKey: draft.id,
    });
  });

  it('does not send unsupported, cross-entity, unauthenticated, or malformed drafts', async () => {
    let requests = 0;
    const fetcher: typeof fetch = async () => {
      requests += 1;
      return new Response('{}', { status: 201 });
    };
    assert.equal((await syncOfflineSalesOrder(draft, {}, 'token', 'entity-b', fetcher)).status, 'CONFLICT');
    assert.equal((await syncOfflineSalesOrder(draft, {}, '', 'entity-a', fetcher)).status, 'AUTH_REQUIRED');
    assert.equal((await syncOfflineSalesOrder(draft, 'not-an-object', 'token', 'entity-a', fetcher)).status, 'CONFLICT');
    assert.equal(requests, 0);
  });

  it('distinguishes auth, conflict and retryable server failures', async () => {
    const payload = { customerId: 'customer-a', lines: [] };
    const response = (status: number) => async () => new Response(JSON.stringify({ error: `HTTP ${status}` }), { status });
    assert.equal((await syncOfflineSalesOrder(draft, payload, 'token', 'entity-a', response(401))).status, 'AUTH_REQUIRED');
    assert.equal((await syncOfflineSalesOrder(draft, payload, 'token', 'entity-a', response(409))).status, 'CONFLICT');
    assert.equal((await syncOfflineSalesOrder(draft, payload, 'token', 'entity-a', response(503))).status, 'RETRYABLE');
    assert.equal((await syncOfflineSalesOrder(draft, payload, 'token', 'entity-a', async () => {
      throw new Error('offline');
    })).status, 'RETRYABLE');
  });
});
