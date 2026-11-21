import type { OfflineSyncPolicy } from '../application/modules/admin/workbook-offline-sync';
import type { EncryptedOfflineDraft } from './offline-draft-crypto';

const DATABASE_NAME = 'safe-erp-offline-drafts';
const DATABASE_VERSION = 1;
const STORE_NAME = 'drafts';
const ENTITY_INDEX = 'entityId';

export interface OfflineDraftStorage {
  list(entityId: string): Promise<EncryptedOfflineDraft[]>;
  save(draft: EncryptedOfflineDraft, maximumItems: number): Promise<void>;
  delete(entityId: string, id: string): Promise<void>;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Échec de la requête de stockage hors ligne.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction de stockage hors ligne annulée.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Échec de la transaction de stockage hors ligne.'));
  });
}

export class IndexedDbOfflineDraftStorage implements OfflineDraftStorage {
  private database?: Promise<IDBDatabase>;
  private readonly indexedDb: IDBFactory;

  constructor(indexedDb?: IDBFactory) {
    const factory = indexedDb ?? globalThis.indexedDB;
    if (!factory) throw new Error('IndexedDB n’est pas disponible dans cet environnement.');
    this.indexedDb = factory;
  }

  async list(entityId: string): Promise<EncryptedOfflineDraft[]> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const done = transactionDone(transaction);
    const result = await requestResult(
      transaction.objectStore(STORE_NAME).index(ENTITY_INDEX).getAll(entityId),
    );
    await done;
    return result as EncryptedOfflineDraft[];
  }

  async save(draft: EncryptedOfflineDraft, maximumItems: number): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index(ENTITY_INDEX);
    const done = transactionDone(transaction);
    const [count, existing] = await Promise.all([
      requestResult(index.count(draft.entityId)),
      requestResult(store.get(draft.id)),
    ]);
    if (existing && existing.entityId !== draft.entityId) {
      await done;
      throw new Error('L’identifiant du brouillon est déjà utilisé par une autre entité.');
    }
    if (!existing && count >= maximumItems) {
      await done;
      throw new Error('La file hors ligne a atteint sa limite configurée.');
    }
    store.put(draft);
    await done;
  }

  async delete(entityId: string, id: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const existing = await requestResult(store.get(id));
    if (existing?.entityId === entityId) store.delete(id);
    await done;
  }

  private open(): Promise<IDBDatabase> {
    if (!this.database) {
      this.database = new Promise((resolve, reject) => {
        const request = this.indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex(ENTITY_INDEX, ENTITY_INDEX, { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Impossible d’ouvrir le stockage hors ligne.'));
        request.onblocked = () => reject(new Error('Le stockage hors ligne est bloqué par une autre version ouverte.'));
      });
    }
    return this.database;
  }
}

export class EncryptedOfflineDraftQueue {
  constructor(
    private readonly storage: OfflineDraftStorage,
    private readonly policy: OfflineSyncPolicy,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async add(draft: EncryptedOfflineDraft): Promise<void> {
    if (!this.policy.supportedDocumentTypes.includes(draft.documentType)) {
      throw new Error('Ce type de document n’est pas autorisé dans la file hors ligne.');
    }
    const createdAt = Date.parse(draft.createdAt);
    const age = this.now().getTime() - createdAt;
    if (!Number.isFinite(createdAt) || age < 0 || age > this.policy.maxDraftAgeHours * 60 * 60 * 1000) {
      throw new Error('La date du brouillon est invalide ou sa durée de conservation est dépassée.');
    }
    const currentDrafts = await this.storage.list(draft.entityId);
    const maximumAgeMs = this.policy.maxDraftAgeHours * 60 * 60 * 1000;
    await Promise.all(currentDrafts
      .filter((stored) => {
        const storedAt = Date.parse(stored.createdAt);
        const storedAge = this.now().getTime() - storedAt;
        return !Number.isFinite(storedAt) || storedAge < 0 || storedAge > maximumAgeMs;
      })
      .map((stored) => this.storage.delete(draft.entityId, stored.id)));
    await this.storage.save({
      ...draft,
      syncState: draft.syncState ?? 'PENDING',
      syncAttempts: draft.syncAttempts ?? 0,
    }, this.policy.maxPendingItems);
  }

  async list(entityId: string): Promise<EncryptedOfflineDraft[]> {
    const now = this.now().getTime();
    const drafts = await this.storage.list(entityId);
    return drafts.filter((draft) => {
      const createdAt = Date.parse(draft.createdAt);
      const age = now - createdAt;
      return Number.isFinite(createdAt)
        && age >= 0
        && age <= this.policy.maxDraftAgeHours * 60 * 60 * 1000;
    });
  }

  delete(entityId: string, id: string): Promise<void> {
    return this.storage.delete(entityId, id);
  }

  async recordSyncAttempt(
    entityId: string,
    id: string,
    syncState: NonNullable<EncryptedOfflineDraft['syncState']>,
  ): Promise<number> {
    const stored = (await this.storage.list(entityId)).find((draft) => draft.id === id);
    if (!stored) throw new Error('Le brouillon à synchroniser est introuvable.');
    const syncAttempts = (stored.syncAttempts ?? 0) + 1;
    await this.storage.save({ ...stored, syncState, syncAttempts }, this.policy.maxPendingItems);
    return syncAttempts;
  }

  async setSyncState(
    entityId: string,
    id: string,
    syncState: NonNullable<EncryptedOfflineDraft['syncState']>,
  ): Promise<void> {
    const stored = (await this.storage.list(entityId)).find((draft) => draft.id === id);
    if (!stored) throw new Error('Le brouillon à mettre à jour est introuvable.');
    await this.storage.save({ ...stored, syncState }, this.policy.maxPendingItems);
  }
}
