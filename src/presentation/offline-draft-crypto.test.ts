import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { describe, it } from 'node:test';
import { decryptOfflineDraft, encryptOfflineDraft } from './offline-draft-crypto';

const metadata = {
  id: 'draft-a',
  entityId: 'entity-a',
  documentType: 'SALES_ORDER' as const,
  createdAt: '2026-11-12T18:00:00.000Z',
};

describe('encrypted offline draft payloads', () => {
  it('encrypts and decrypts a bounded draft with its entity-bound metadata', async () => {
    const payload = { customerId: 'customer-a', lines: [{ materialId: 'material-a', quantity: 2, unitPrice: 12.5 }] };
    const draft = await encryptOfflineDraft({
      metadata,
      payload,
      passphrase: 'synthetic-passphrase-2026',
      maximumBytes: 10_000,
      cryptoProvider: webcrypto as unknown as Crypto,
    });
    assert.equal(JSON.stringify(draft).includes('customer-a'), false);
    assert.deepEqual(await decryptOfflineDraft<typeof payload>({
      draft,
      passphrase: 'synthetic-passphrase-2026',
      cryptoProvider: webcrypto as unknown as Crypto,
    }), payload);
  });

  it('rejects wrong passphrases, metadata tampering, secrets and oversized payloads', async () => {
    const draft = await encryptOfflineDraft({
      metadata,
      payload: { vendorId: 'vendor-a', lines: [] },
      passphrase: 'synthetic-passphrase-2026',
      maximumBytes: 10_000,
      cryptoProvider: webcrypto as unknown as Crypto,
    });
    await assert.rejects(decryptOfflineDraft({
      draft,
      passphrase: 'different-synthetic-passphrase',
      cryptoProvider: webcrypto as unknown as Crypto,
    }), /Impossible de déchiffrer/);
    await assert.rejects(decryptOfflineDraft({
      draft: { ...draft, entityId: 'entity-b' },
      passphrase: 'synthetic-passphrase-2026',
      cryptoProvider: webcrypto as unknown as Crypto,
    }), /Impossible de déchiffrer/);
    await assert.rejects(encryptOfflineDraft({
      metadata,
      payload: { accessToken: 'never-persist-this' },
      passphrase: 'synthetic-passphrase-2026',
      maximumBytes: 10_000,
      cryptoProvider: webcrypto as unknown as Crypto,
    }), /secrets ou jetons/);
    await assert.rejects(encryptOfflineDraft({
      metadata,
      payload: { note: 'x'.repeat(100) },
      passphrase: 'synthetic-passphrase-2026',
      maximumBytes: 10,
      cryptoProvider: webcrypto as unknown as Crypto,
    }), /taille maximale/);
  });
});
