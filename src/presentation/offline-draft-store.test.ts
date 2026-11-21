import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OfflineSyncPolicy } from '../application/modules/admin/workbook-offline-sync';
import type { EncryptedOfflineDraft } from './offline-draft-crypto';
import {
  EncryptedOfflineDraftQueue,
  IndexedDbOfflineDraftStorage,
  type OfflineDraftStorage,
} from './offline-draft-store';

const now = new Date('2026-11-12T18:00:00.000Z');
const policy: OfflineSyncPolicy = {
  supportedDocumentTypes: ['SALES_ORDER'],
  conflictPolicy: 'MANUAL_REVIEW',
  syncMode: 'AUTO_ONLINE',
  requireOnlineReauthentication: true,
  maxPendingItems: 2,
  maxDraftAgeHours: 24,
};

function draft(id: string, createdAt = now.toISOString()): EncryptedOfflineDraft {
  return {
    id,
    entityId: 'entity-a',
    documentType: 'SALES_ORDER',
    createdAt,
    salt: 'encrypted-salt',
    iv: 'encrypted-iv',
    ciphertext: 'encrypted-payload',
  };
}

class MemoryStorage implements OfflineDraftStorage {
  private readonly drafts = new Map<string, EncryptedOfflineDraft>();

  async list(entityId: string): Promise<EncryptedOfflineDraft[]> {
    return [...this.drafts.values()].filter((item) => item.entityId === entityId);
  }

  async save(item: EncryptedOfflineDraft, maximumItems: number): Promise<void> {
    const sameEntity = [...this.drafts.values()].filter((stored) => stored.entityId === item.entityId);
    if (!this.drafts.has(item.id) && sameEntity.length >= maximumItems) {
      throw new Error('La file hors ligne a atteint sa limite configurée.');
    }
    this.drafts.set(item.id, item);
  }

  async delete(entityId: string, id: string): Promise<void> {
    if (this.drafts.get(id)?.entityId === entityId) this.drafts.delete(id);
  }
}

describe('encrypted offline draft queue', () => {
  it('fails explicitly when IndexedDB is unavailable', () => {
    if (!globalThis.indexedDB) {
      assert.throws(() => new IndexedDbOfflineDraftStorage(), /IndexedDB n’est pas disponible/);
    }
  });

  it('enforces entity policy, capacity and age while listing only current drafts', async () => {
    const queue = new EncryptedOfflineDraftQueue(new MemoryStorage(), policy, () => now);
    await queue.add(draft('one'));
    await queue.add(draft('two'));
    await assert.rejects(queue.add(draft('three')), /limite configurée/);
    await assert.rejects(
      queue.add(draft('expired', '2026-11-10T00:00:00.000Z')),
      /durée de conservation/,
    );
    assert.deepEqual((await queue.list('entity-a')).map((item) => item.id), ['one', 'two']);
    assert.deepEqual(await queue.list('another-entity'), []);
  });

  it('deletes only a draft owned by the requested entity', async () => {
    const storage = new MemoryStorage();
    const queue = new EncryptedOfflineDraftQueue(storage, policy, () => now);
    await queue.add(draft('one'));
    await queue.delete('another-entity', 'one');
    assert.equal((await queue.list('entity-a')).length, 1);
    await queue.delete('entity-a', 'one');
    assert.equal((await queue.list('entity-a')).length, 0);
  });

  it('records bounded sync attempts and preserves conflict state on the encrypted record', async () => {
    const queue = new EncryptedOfflineDraftQueue(new MemoryStorage(), policy, () => now);
    await queue.add(draft('retry'));
    assert.equal(await queue.recordSyncAttempt('entity-a', 'retry', 'PENDING'), 1);
    await queue.setSyncState('entity-a', 'retry', 'CONFLICT');
    const [stored] = await queue.list('entity-a');
    assert.equal(stored.syncAttempts, 1);
    assert.equal(stored.syncState, 'CONFLICT');
  });

  it('purges expired entries before enforcing the pending-item limit', async () => {
    const storage = new MemoryStorage();
    await storage.save(draft('expired', '2026-11-10T00:00:00.000Z'), policy.maxPendingItems);
    await storage.save(draft('current'), policy.maxPendingItems);
    const queue = new EncryptedOfflineDraftQueue(storage, policy, () => now);
    await queue.add(draft('next'));
    assert.deepEqual((await queue.list('entity-a')).map((item) => item.id), ['current', 'next']);
  });
});
