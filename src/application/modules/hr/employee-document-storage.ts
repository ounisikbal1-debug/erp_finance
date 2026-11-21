import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HrRequestError } from './errors';
import {
  HR_DOCUMENT_MIME_TYPES,
  MAX_HR_DOCUMENT_BYTES,
  type HrDocumentMimeType,
} from './employee-document-file-rules';

export { HR_DOCUMENT_MIME_TYPES, MAX_HR_DOCUMENT_BYTES } from './employee-document-file-rules';

export interface ValidatedHrDocumentFile {
  mimeType: HrDocumentMimeType;
  sizeBytes: number;
  sha256: string;
}

function isWithin(parent: string, candidate: string): boolean {
  const relativePath = path.relative(parent, candidate);
  return relativePath === ''
    || (relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath));
}

function overlaps(first: string, second: string): boolean {
  return isWithin(first, second) || isWithin(second, first);
}

function assertOutsideWebRoots(directory: string): void {
  const publicRoots = [
    path.resolve(process.cwd(), 'public'),
    path.resolve(process.cwd(), 'dist'),
    path.resolve(process.cwd(), 'src', 'presentation'),
  ];
  if (publicRoots.some((root) => overlaps(root, directory))) {
    throw new Error('Le stockage privé des documents RH ne peut pas se trouver dans un répertoire web.');
  }
}

export function validateHrDocumentFile(data: Buffer, mimeTypeValue: unknown): ValidatedHrDocumentFile {
  if (!Buffer.isBuffer(data) || data.length === 0) {
    throw new HrRequestError('Le fichier RH est vide ou invalide.', 400);
  }
  if (data.length > MAX_HR_DOCUMENT_BYTES) {
    throw new HrRequestError('Le fichier RH dépasse la limite de 8 Mio.', 413);
  }
  if (typeof mimeTypeValue !== 'string'
    || !HR_DOCUMENT_MIME_TYPES.includes(mimeTypeValue as HrDocumentMimeType)) {
    throw new HrRequestError('Type de fichier RH non accepté. Formats autorisés : PDF, JPEG et PNG.', 415);
  }

  const signatureMatches = mimeTypeValue === 'application/pdf'
    ? data.subarray(0, 5).toString('ascii') === '%PDF-'
    : mimeTypeValue === 'image/jpeg'
      ? data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
      : data.length >= 8
        && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!signatureMatches) {
    throw new HrRequestError('Le contenu du fichier ne correspond pas au type déclaré.', 400);
  }

  return {
    mimeType: mimeTypeValue as HrDocumentMimeType,
    sizeBytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}

async function getPrivateDirectory(): Promise<string> {
  const configuredDirectory = process.env.SAFE_ERP_PRIVATE_STORAGE_DIR?.trim();
  if (configuredDirectory && !path.isAbsolute(configuredDirectory)) {
    throw new Error('SAFE_ERP_PRIVATE_STORAGE_DIR doit être un chemin absolu.');
  }
  const directory = path.resolve(
    configuredDirectory || path.join(process.cwd(), 'data', 'private', 'hr-documents'),
  );
  assertOutsideWebRoots(directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryStats = await lstat(directory);
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    throw new Error('Le répertoire configuré pour les documents RH doit être un dossier privé réel.');
  }
  const resolvedDirectory = await realpath(directory);
  for (const root of [path.resolve(process.cwd(), 'public'), path.resolve(process.cwd(), 'dist'), path.resolve(process.cwd(), 'src', 'presentation')]) {
    try {
      const resolvedRoot = await realpath(root);
      if (overlaps(resolvedRoot, resolvedDirectory)) {
        throw new Error('Le stockage privé des documents RH ne peut pas être exposé par un répertoire web.');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('stockage privé')) throw error;
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  return resolvedDirectory;
}

function assertStorageKey(storageKey: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storageKey)) {
    throw new Error('Référence interne de fichier RH invalide.');
  }
}

export async function writePrivateHrDocument(data: Buffer): Promise<string> {
  const directory = await getPrivateDirectory();
  const storageKey = randomUUID();
  const filePath = path.join(directory, storageKey);
  await writeFile(filePath, data, { flag: 'wx', mode: 0o600, flush: true });
  return storageKey;
}

export async function readPrivateHrDocument(
  storageKey: string,
  expectedSizeBytes: number,
  expectedSha256: string,
): Promise<Buffer> {
  assertStorageKey(storageKey);
  const filePath = path.join(await getPrivateDirectory(), storageKey);
  const stats = await lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_HR_DOCUMENT_BYTES) {
    throw new Error('Le fichier RH stocké est absent ou invalide.');
  }
  const data = await readFile(filePath);
  if (data.length !== expectedSizeBytes || createHash('sha256').update(data).digest('hex') !== expectedSha256) {
    throw new Error('L’intégrité du fichier RH stocké ne peut pas être vérifiée.');
  }
  return data;
}

export async function removePrivateHrDocument(storageKey: string): Promise<void> {
  assertStorageKey(storageKey);
  const filePath = path.join(await getPrivateDirectory(), storageKey);
  try {
    await unlink(filePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
}
