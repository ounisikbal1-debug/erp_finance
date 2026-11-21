import type { OfflineDocumentType } from '../application/modules/admin/workbook-offline-sync';

export interface OfflineDraftMetadata {
  id: string;
  entityId: string;
  documentType: OfflineDocumentType;
  createdAt: string;
}

export interface EncryptedOfflineDraft extends OfflineDraftMetadata {
  salt: string;
  iv: string;
  ciphertext: string;
  syncState?: 'PENDING' | 'CONFLICT' | 'RETRY_LIMIT';
  syncAttempts?: number;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function metadataBytes(metadata: OfflineDraftMetadata): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(metadata));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function assertPayload(value: unknown, maximumBytes: number): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Le brouillon hors ligne doit être un objet.');
  }
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > maximumBytes) {
    throw new Error('Le brouillon dépasse la taille maximale configurée.');
  }
  const inspect = (item: unknown): void => {
    if (Array.isArray(item)) {
      item.forEach(inspect);
    } else if (item !== null && typeof item === 'object') {
      for (const [key, nested] of Object.entries(item)) {
        if (/(password|secret|token|api[-_]?key|authorization)/i.test(key)) {
          throw new Error('Un brouillon hors ligne ne peut contenir de secrets ou jetons d’accès.');
        }
        inspect(nested);
      }
    }
  };
  inspect(value);
  return serialized;
}

async function deriveKey(passphrase: string, salt: Uint8Array, cryptoProvider: Crypto): Promise<CryptoKey> {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024) {
    throw new Error('La phrase secrète locale doit contenir de 12 à 1024 caractères.');
  }
  const material = await cryptoProvider.subtle.importKey(
    'raw',
    toArrayBuffer(new TextEncoder().encode(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return cryptoProvider.subtle.deriveKey(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations: 310_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptOfflineDraft(input: {
  metadata: OfflineDraftMetadata;
  payload: unknown;
  passphrase: string;
  maximumBytes: number;
  cryptoProvider?: Crypto;
}): Promise<EncryptedOfflineDraft> {
  const cryptoProvider = input.cryptoProvider ?? globalThis.crypto;
  const metadata = input.metadata;
  if (!metadata.id || !metadata.entityId || !metadata.createdAt
    || metadata.documentType !== 'SALES_ORDER') {
    throw new Error('Les métadonnées du brouillon hors ligne sont invalides.');
  }
  const plaintext = assertPayload(input.payload, input.maximumBytes);
  const salt = cryptoProvider.getRandomValues(new Uint8Array(16));
  const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(input.passphrase, salt, cryptoProvider);
  const ciphertext = await cryptoProvider.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(metadataBytes(metadata)),
    },
    key,
    toArrayBuffer(new TextEncoder().encode(plaintext)),
  );
  return {
    ...metadata,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptOfflineDraft<T>(input: {
  draft: EncryptedOfflineDraft;
  passphrase: string;
  cryptoProvider?: Crypto;
}): Promise<T> {
  const cryptoProvider = input.cryptoProvider ?? globalThis.crypto;
  const { draft } = input;
  const metadata: OfflineDraftMetadata = {
    id: draft.id,
    entityId: draft.entityId,
    documentType: draft.documentType,
    createdAt: draft.createdAt,
  };
  const key = await deriveKey(input.passphrase, fromBase64(draft.salt), cryptoProvider);
  try {
    const plaintext = await cryptoProvider.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(fromBase64(draft.iv)),
        additionalData: toArrayBuffer(metadataBytes(metadata)),
      },
      key,
      toArrayBuffer(fromBase64(draft.ciphertext)),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    throw new Error('Impossible de déchiffrer le brouillon : phrase secrète incorrecte ou données altérées.');
  }
}
