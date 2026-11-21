import { WorkbookFeatureConfigurationError } from './workbook-feature-errors';

const OFFLINE_DOCUMENT_TYPES = ['SALES_ORDER'] as const;
export type OfflineDocumentType = (typeof OFFLINE_DOCUMENT_TYPES)[number];

export interface OfflineSyncPolicy {
  supportedDocumentTypes: OfflineDocumentType[];
  conflictPolicy: 'MANUAL_REVIEW';
  syncMode: 'AUTO_ONLINE';
  requireOnlineReauthentication: true;
  maxPendingItems: number;
  maxDraftAgeHours: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= minimum
    && value <= maximum;
}

function isOfflineDocumentType(value: unknown): value is OfflineDocumentType {
  return value === 'SALES_ORDER';
}

export function validateOfflineSyncPolicy(value: unknown): OfflineSyncPolicy {
  if (!isRecord(value)) {
    throw new WorkbookFeatureConfigurationError('La politique hors ligne doit être un objet.', 400);
  }
  const keys = Object.keys(value);
  const expectedKeys = [
    'supportedDocumentTypes',
    'conflictPolicy',
    'syncMode',
    'requireOnlineReauthentication',
    'maxPendingItems',
    'maxDraftAgeHours',
  ];
  if (keys.length !== expectedKeys.length || keys.some((key) => !expectedKeys.includes(key))) {
    throw new WorkbookFeatureConfigurationError('La politique hors ligne contient des champs absents ou non pris en charge.', 400);
  }
  const documentTypes = value.supportedDocumentTypes;
  if (!Array.isArray(documentTypes)
    || documentTypes.length === 0
    || documentTypes.some((type) => !isOfflineDocumentType(type))
    || new Set(documentTypes).size !== documentTypes.length) {
    throw new WorkbookFeatureConfigurationError('Choisissez un ou plusieurs types de document hors ligne pris en charge.', 400);
  }
  const supportedDocumentTypes = documentTypes.filter(isOfflineDocumentType);
  if (value.conflictPolicy !== 'MANUAL_REVIEW' || value.syncMode !== 'AUTO_ONLINE') {
    throw new WorkbookFeatureConfigurationError('La synchronisation automatique exige une revue manuelle des conflits.', 400);
  }
  if (value.requireOnlineReauthentication !== true) {
    throw new WorkbookFeatureConfigurationError('Une authentification en ligne récente est obligatoire avant tout transfert.', 400);
  }
  if (!isBoundedInteger(value.maxPendingItems, 1, 500)
    || !isBoundedInteger(value.maxDraftAgeHours, 1, 720)) {
    throw new WorkbookFeatureConfigurationError('Les limites de file ou de conservation sont invalides.', 400);
  }
  return {
    supportedDocumentTypes,
    conflictPolicy: 'MANUAL_REVIEW',
    syncMode: 'AUTO_ONLINE',
    requireOnlineReauthentication: true,
    maxPendingItems: value.maxPendingItems,
    maxDraftAgeHours: value.maxDraftAgeHours,
  };
}
