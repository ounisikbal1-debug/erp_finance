import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  HR_DOCUMENT_MIME_TYPES,
  MAX_HR_DOCUMENT_BYTES,
  readPrivateHrDocument,
  removePrivateHrDocument,
  validateHrDocumentFile,
  writePrivateHrDocument,
} from './employee-document-storage';
import { HrRequestError } from './errors';

describe('private employee document storage', () => {
  it('accepts only supported content signatures and records integrity metadata', () => {
    const pdf = Buffer.from('%PDF-1.7\nprivate HR document');
    const validated = validateHrDocumentFile(pdf, 'application/pdf');
    assert.equal(validated.mimeType, 'application/pdf');
    assert.equal(validated.sizeBytes, pdf.length);
    assert.match(validated.sha256, /^[0-9a-f]{64}$/);

    assert.equal(HR_DOCUMENT_MIME_TYPES.length, 3);
    assert.throws(
      () => validateHrDocumentFile(Buffer.from('not a PDF'), 'application/pdf'),
      (error: unknown) => error instanceof HrRequestError && error.statusCode === 400,
    );
    assert.throws(
      () => validateHrDocumentFile(Buffer.from('%PDF-1.7'), 'text/html'),
      (error: unknown) => error instanceof HrRequestError && error.statusCode === 415,
    );
    assert.throws(() => validateHrDocumentFile(Buffer.alloc(0), 'application/pdf'), /vide/);
    assert.throws(
      () => validateHrDocumentFile(Buffer.alloc(MAX_HR_DOCUMENT_BYTES + 1, 0x41), 'application/pdf'),
      (error: unknown) => error instanceof HrRequestError && error.statusCode === 413,
    );
  });

  it('writes opaque files privately, verifies downloads, and supports cleanup', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'safe-hr-storage-'));
    const previousDirectory = process.env.SAFE_ERP_PRIVATE_STORAGE_DIR;
    process.env.SAFE_ERP_PRIVATE_STORAGE_DIR = directory;
    const pdf = Buffer.from('%PDF-1.7\nprivate HR document');
    const file = validateHrDocumentFile(pdf, 'application/pdf');
    try {
      const storageKey = await writePrivateHrDocument(pdf);
      assert.match(storageKey, /^[0-9a-f-]{36}$/i);
      assert.deepEqual(await readPrivateHrDocument(storageKey, file.sizeBytes, file.sha256), pdf);
      await assert.rejects(readPrivateHrDocument(storageKey, file.sizeBytes + 1, file.sha256));
      await assert.rejects(readPrivateHrDocument(storageKey, file.sizeBytes, '0'.repeat(64)));
      await removePrivateHrDocument(storageKey);
      await assert.rejects(readPrivateHrDocument(storageKey, file.sizeBytes, file.sha256));
    } finally {
      if (previousDirectory === undefined) delete process.env.SAFE_ERP_PRIVATE_STORAGE_DIR;
      else process.env.SAFE_ERP_PRIVATE_STORAGE_DIR = previousDirectory;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('refuses private storage located within a served web directory', async () => {
    const previousDirectory = process.env.SAFE_ERP_PRIVATE_STORAGE_DIR;
    process.env.SAFE_ERP_PRIVATE_STORAGE_DIR = path.resolve(process.cwd(), 'public', 'private-hr-test');
    try {
      await assert.rejects(writePrivateHrDocument(Buffer.from('%PDF-1.7')), /répertoire web/);
    } finally {
      if (previousDirectory === undefined) delete process.env.SAFE_ERP_PRIVATE_STORAGE_DIR;
      else process.env.SAFE_ERP_PRIVATE_STORAGE_DIR = previousDirectory;
    }
  });
});
