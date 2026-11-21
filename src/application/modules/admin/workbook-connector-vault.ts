import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import prisma from '../../../core/models/prisma';
import { WorkbookFeatureConfigurationError } from './workbook-feature-errors';
import {
  getWorkbookConnectorBlocker,
  isWorkbookConnectorFeatureKey,
  type WorkbookConnectorFeatureKey,
} from './workbook-connector-config';

const KEY_ENVIRONMENT_VARIABLE = 'SAFE_ERP_CONNECTOR_ENCRYPTION_KEY';
const KEY_ID_ENVIRONMENT_VARIABLE = 'SAFE_ERP_CONNECTOR_ENCRYPTION_KEY_ID';

export interface EncryptedWorkbookConnectorCredentials {
  keyId: string;
  fieldNamesJson: string;
  ciphertext: string;
  iv: string;
  authTag: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireConnectorFeature(featureKey: string): asserts featureKey is WorkbookConnectorFeatureKey {
  if (!isWorkbookConnectorFeatureKey(featureKey)) {
    throw new WorkbookFeatureConfigurationError('Fonctionnalité connecteur inconnue.', 404);
  }
}

function getEncryptionKey(): { key: Buffer; keyId: string } {
  const keyHex = process.env[KEY_ENVIRONMENT_VARIABLE];
  const keyId = process.env[KEY_ID_ENVIRONMENT_VARIABLE] ?? 'v1';
  if (!keyHex || !/^[\da-f]{64}$/i.test(keyHex)
    || !/^[A-Za-z0-9_.-]{1,40}$/.test(keyId)) {
    throw new WorkbookFeatureConfigurationError(
      'Le coffre connecteur n’est pas configuré; définissez une clé maître AES-256 et son identifiant côté serveur.',
      503,
    );
  }
  return { key: Buffer.from(keyHex, 'hex'), keyId };
}

function associatedData(entityId: string, featureKey: WorkbookConnectorFeatureKey, keyId: string): Buffer {
  return Buffer.from(`${entityId}\u0000${featureKey}\u0000${keyId}`, 'utf8');
}

function validateCredentialFields(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    throw new WorkbookFeatureConfigurationError('Les identifiants doivent être transmis comme un objet champ/valeur.', 400);
  }
  const entries = Object.entries(value);
  if (entries.length < 1 || entries.length > 20) {
    throw new WorkbookFeatureConfigurationError('De 1 à 20 champs d’identification sont requis.', 400);
  }
  const credentials: Record<string, string> = {};
  for (const [fieldName, secretValue] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(fieldName)
      || typeof secretValue !== 'string'
      || secretValue.trim().length === 0
      || secretValue.length > 8192) {
      throw new WorkbookFeatureConfigurationError('Un champ d’identification est invalide.', 400);
    }
    credentials[fieldName] = secretValue;
  }
  if (JSON.stringify(credentials).length > 32_000) {
    throw new WorkbookFeatureConfigurationError('Les identifiants dépassent la taille maximale autorisée.', 400);
  }
  return credentials;
}

export function encryptWorkbookConnectorCredentials(
  entityId: string,
  featureKey: string,
  requestedCredentials: unknown,
): EncryptedWorkbookConnectorCredentials {
  requireConnectorFeature(featureKey);
  if (!entityId || entityId.length > 100) {
    throw new WorkbookFeatureConfigurationError('Entité invalide.', 400);
  }
  const credentials = validateCredentialFields(requestedCredentials);
  const { key, keyId } = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(associatedData(entityId, featureKey, keyId));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final(),
  ]);
  return {
    keyId,
    fieldNamesJson: JSON.stringify(Object.keys(credentials).sort()),
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptWorkbookConnectorCredentials(
  entityId: string,
  featureKey: string,
  encrypted: EncryptedWorkbookConnectorCredentials,
): Record<string, string> {
  requireConnectorFeature(featureKey);
  const { key, keyId } = getEncryptionKey();
  if (encrypted.keyId !== keyId) {
    throw new WorkbookFeatureConfigurationError(
      'La clé maître configurée ne correspond pas à celle qui a chiffré ces identifiants; restaurez la clé ou supprimez puis reconfigurez le profil.',
      503,
    );
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64'));
    decipher.setAAD(associatedData(entityId, featureKey, encrypted.keyId));
    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return validateCredentialFields(JSON.parse(plaintext));
  } catch {
    throw new WorkbookFeatureConfigurationError('Le coffre connecteur est illisible ou son intégrité a échoué.', 503);
  }
}

function validateFieldName(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value)) {
    throw new WorkbookFeatureConfigurationError('Le nom du champ d’identification est invalide.', 400);
  }
  return value;
}

async function requireEntity(entityId: string): Promise<void> {
  if (!entityId || entityId.length > 100) {
    throw new WorkbookFeatureConfigurationError('Entité invalide.', 400);
  }
  const entity = await prisma.entity.findUnique({ where: { id: entityId }, select: { id: true } });
  if (!entity) throw new WorkbookFeatureConfigurationError('Entité introuvable.', 404);
}

function safeCredentialStatus(
  featureKey: WorkbookConnectorFeatureKey,
  fieldNamesJson?: string,
  updatedAt?: Date | null,
) {
  let fieldNames: string[] = [];
  if (fieldNamesJson) {
    try {
      const parsed: unknown = JSON.parse(fieldNamesJson);
      if (!Array.isArray(parsed) || !parsed.every((field) => typeof field === 'string')) throw new Error();
      fieldNames = parsed;
    } catch {
      throw new WorkbookFeatureConfigurationError('Les métadonnées du coffre connecteur sont illisibles.', 500);
    }
  }
  return {
    featureKey,
    credentialsConfigured: fieldNames.length > 0,
    credentialFieldNames: fieldNames,
    credentialUpdatedAt: updatedAt?.toISOString() ?? null,
    connectionStatus: 'NOT_CONNECTED' as const,
    testStatus: 'BLOCKED' as const,
    networkRequestMade: false as const,
    connectionTestBlocker: getWorkbookConnectorBlocker(featureKey),
  };
}

export async function getWorkbookConnectorCredentialStatus(entityId: string, featureKey: string) {
  requireConnectorFeature(featureKey);
  await requireEntity(entityId);
  const saved = await prisma.workbookConnectorSecret.findUnique({
    where: { entityId_featureKey: { entityId, featureKey } },
    select: { fieldNamesJson: true, updatedAt: true },
  });
  return safeCredentialStatus(featureKey, saved?.fieldNamesJson, saved?.updatedAt);
}

export async function saveWorkbookConnectorCredentialField(
  entityId: string,
  featureKey: string,
  fieldNameValue: unknown,
  secretValue: unknown,
  actor: { id: string; username: string },
) {
  requireConnectorFeature(featureKey);
  await requireEntity(entityId);
  if (!actor.id || !actor.username) {
    throw new WorkbookFeatureConfigurationError('Authentification administrateur requise.', 401);
  }
  const fieldName = validateFieldName(fieldNameValue);
  const newField = validateCredentialFields({ [fieldName]: secretValue });
  const saved = await prisma.workbookConnectorSecret.findUnique({
    where: { entityId_featureKey: { entityId, featureKey } },
  });
  const credentials = saved
    ? { ...decryptWorkbookConnectorCredentials(entityId, featureKey, saved), ...newField }
    : newField;
  const encrypted = encryptWorkbookConnectorCredentials(entityId, featureKey, credentials);
  if (saved) {
    const updated = await prisma.workbookConnectorSecret.updateMany({
      where: { id: saved.id, version: saved.version },
      data: {
        ...encrypted,
        version: { increment: 1 },
        updatedByUserId: actor.id,
        updatedByUsername: actor.username,
      },
    });
    if (updated.count !== 1) {
      throw new WorkbookFeatureConfigurationError(
        'Les identifiants ont été modifiés simultanément; rechargez le profil et réessayez.',
        409,
      );
    }
  } else {
    try {
      await prisma.workbookConnectorSecret.create({
        data: {
          entityId,
          featureKey,
          ...encrypted,
          updatedByUserId: actor.id,
          updatedByUsername: actor.username,
        },
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw new WorkbookFeatureConfigurationError(
          'Un autre administrateur a créé les identifiants simultanément; rechargez le profil et réessayez.',
          409,
        );
      }
      throw error;
    }
  }
  return getWorkbookConnectorCredentialStatus(entityId, featureKey);
}

export async function deleteWorkbookConnectorCredentials(entityId: string, featureKey: string) {
  requireConnectorFeature(featureKey);
  await requireEntity(entityId);
  await prisma.workbookConnectorSecret.deleteMany({ where: { entityId, featureKey } });
  return safeCredentialStatus(featureKey);
}

export async function testWorkbookConnectorConnection(entityId: string, featureKey: string) {
  const status = await getWorkbookConnectorCredentialStatus(entityId, featureKey);
  return {
    ...status,
    testStatus: 'BLOCKED' as const,
    networkRequestMade: false as const,
    connectionTestBlocker: getWorkbookConnectorBlocker(status.featureKey),
  };
}
